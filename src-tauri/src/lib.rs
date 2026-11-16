//! Rexa Drive backend.
//!
//! Talks to Telegram directly over MTProto (via `grammers`) using the user's own
//! account and their own API ID / API hash. Files live in "Saved Messages".
//! There is no ad code, no analytics and no relay server.

use std::path::{Path, PathBuf};

use grammers_client::types::{LoginToken, Media, PasswordToken};
use grammers_client::{Client, Config, InputMessage, SignInError};
use grammers_session::Session;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

// ---------------------------------------------------------------- state

#[derive(Default)]
struct Inner {
    client: Option<Client>,
    login: Option<LoginToken>,
    password: Option<PasswordToken>,
}

#[derive(Default)]
struct AppState(Mutex<Inner>);

#[derive(Serialize, Deserialize, Clone)]
struct Creds {
    api_id: i32,
    api_hash: String,
}

#[derive(Serialize)]
struct Status {
    has_creds: bool,
    authorized: bool,
    name: Option<String>,
}

#[derive(Serialize)]
struct FileItem {
    id: i32,
    name: String,
    size: i64,
    date: i64,
}

fn es<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// ---------------------------------------------------------------- paths & helpers

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(es)?;
    std::fs::create_dir_all(&dir).map_err(es)?;
    Ok(dir)
}

fn session_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("rexa.session"))
}

fn creds_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("credentials.json"))
}

fn staging_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(es)?
        .join("rexa-staging");
    std::fs::create_dir_all(&dir).map_err(es)?;
    Ok(dir)
}

fn download_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .download_dir()
        .or_else(|_| data_dir(app).map(|d| d.join("downloads")))
        .map_err(es)?;
    let dir = base.join("Rexa Drive");
    if std::fs::create_dir_all(&dir).is_ok() {
        return Ok(dir);
    }
    // Fallback (e.g. Android without storage permission): app-private folder.
    let fallback = data_dir(app)?.join("downloads");
    std::fs::create_dir_all(&fallback).map_err(es)?;
    Ok(fallback)
}

fn load_creds(app: &AppHandle) -> Option<Creds> {
    let raw = std::fs::read_to_string(creds_path(app).ok()?).ok()?;
    serde_json::from_str(&raw).ok()
}

fn safe_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .take(150)
        .collect();
    let cleaned = cleaned.trim().trim_matches('.').to_string();
    if cleaned.is_empty() {
        "file".to_string()
    } else {
        cleaned
    }
}

fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let p = Path::new(name);
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let ext = p.extension().and_then(|s| s.to_str());
    for i in 1..10_000 {
        let candidate = match ext {
            Some(e) => format!("{stem} ({i}).{e}"),
            None => format!("{stem} ({i})"),
        };
        let path = dir.join(candidate);
        if !path.exists() {
            return path;
        }
    }
    first
}

fn valid_upload_id(id: &str) -> bool {
    !id.is_empty() && id.len() < 40 && id.chars().all(|c| c.is_ascii_digit())
}

// ---------------------------------------------------------------- telegram connection

async fn connect(app: &AppHandle, creds: &Creds) -> Result<Client, String> {
    let session = Session::load_file_or_create(session_path(app)?).map_err(es)?;
    Client::connect(Config {
        session,
        api_id: creds.api_id,
        api_hash: creds.api_hash.clone(),
        params: Default::default(),
    })
    .await
    .map_err(es)
}

async fn ensure_client(app: &AppHandle, state: &AppState) -> Result<Client, String> {
    let mut inner = state.0.lock().await;
    if let Some(c) = &inner.client {
        return Ok(c.clone());
    }
    let creds = load_creds(app).ok_or("API credentials are not set")?;
    let client = connect(app, &creds).await?;
    inner.client = Some(client.clone());
    Ok(client)
}

fn save_session(app: &AppHandle, client: &Client) -> Result<(), String> {
    client
        .session()
        .save_to_file(session_path(app)?)
        .map_err(es)
}

// ---------------------------------------------------------------- commands: auth

#[tauri::command]
async fn get_status(app: AppHandle, state: State<'_, AppState>) -> Result<Status, String> {
    let has_creds = load_creds(&app).is_some();
    if !has_creds {
        return Ok(Status { has_creds, authorized: false, name: None });
    }
    // Offline or transient errors must not wipe the stored login.
    let client = match ensure_client(&app, &state).await {
        Ok(c) => c,
        Err(_) => return Ok(Status { has_creds, authorized: false, name: None }),
    };
    let authorized = client.is_authorized().await.unwrap_or(false);
    let name = if authorized {
        client.get_me().await.ok().map(|u| u.first_name().to_string())
    } else {
        None
    };
    Ok(Status { has_creds, authorized, name })
}

#[tauri::command]
async fn save_credentials(
    app: AppHandle,
    state: State<'_, AppState>,
    api_id: i32,
    api_hash: String,
) -> Result<(), String> {
    if api_hash.trim().len() < 16 {
        return Err("That API hash looks too short".into());
    }
    let creds = Creds { api_id, api_hash: api_hash.trim().to_string() };
    std::fs::write(creds_path(&app)?, serde_json::to_vec(&creds).map_err(es)?).map_err(es)?;
    // Credentials changed: drop any previous connection.
    let mut inner = state.0.lock().await;
    inner.client = None;
    inner.login = None;
    inner.password = None;
    Ok(())
}

#[tauri::command]
async fn send_code(app: AppHandle, state: State<'_, AppState>, phone: String) -> Result<(), String> {
    let client = ensure_client(&app, &state).await?;
    let token = client.request_login_code(phone.trim()).await.map_err(es)?;
    state.0.lock().await.login = Some(token);
    Ok(())
}

#[tauri::command]
async fn submit_code(
    app: AppHandle,
    state: State<'_, AppState>,
    code: String,
) -> Result<String, String> {
    let client = ensure_client(&app, &state).await?;
    let token = state
        .0
        .lock()
        .await
        .login
        .take()
        .ok_or("Request a login code first")?;
    match client.sign_in(&token, code.trim()).await {
        Ok(_) => {
            save_session(&app, &client)?;
            Ok("ok".into())
        }
        Err(SignInError::PasswordRequired(pt)) => {
            state.0.lock().await.password = Some(pt);
            Ok("password".into())
        }
        Err(e) => {
            // Keep the token so the user can retry with a corrected code.
            state.0.lock().await.login = Some(token);
            Err(es(e))
        }
    }
}

#[tauri::command]
async fn submit_password(
    app: AppHandle,
    state: State<'_, AppState>,
    password: String,
) -> Result<(), String> {
    let client = ensure_client(&app, &state).await?;
    let token = state
        .0
        .lock()
        .await
        .password
        .take()
        .ok_or("Password step is not active. Go back and request a new code.")?;
    client
        .check_password(token, password.as_bytes())
        .await
        .map_err(|e| format!("{} (go back and request a new code to try again)", es(e)))?;
    save_session(&app, &client)?;
    Ok(())
}

#[tauri::command]
async fn logout(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let client = {
        let mut inner = state.0.lock().await;
        inner.login = None;
        inner.password = None;
        inner.client.take()
    };
    if let Some(c) = client {
        let _ = c.sign_out().await;
    }
    if let Ok(p) = session_path(&app) {
        let _ = std::fs::remove_file(p);
    }
    Ok(())
}

// ---------------------------------------------------------------- commands: files

#[tauri::command]
async fn list_files(app: AppHandle, state: State<'_, AppState>) -> Result<Vec<FileItem>, String> {
    let client = ensure_client(&app, &state).await?;
    let me = client.get_me().await.map_err(es)?;
    let mut iter = client.iter_messages(me.pack());
    let mut out = Vec::new();
    while let Some(msg) = iter.next().await.map_err(es)? {
        if let Some(Media::Document(doc)) = msg.media() {
            let mut name = doc.name().to_string();
            if name.is_empty() {
                name = format!("file-{}", msg.id());
            }
            out.push(FileItem {
                id: msg.id(),
                name,
                size: doc.size() as i64,
                date: msg.date().timestamp(),
            });
        }
    }
    Ok(out)
}

#[tauri::command]
async fn delete_files(
    app: AppHandle,
    state: State<'_, AppState>,
    ids: Vec<i32>,
) -> Result<(), String> {
    let client = ensure_client(&app, &state).await?;
    let me = client.get_me().await.map_err(es)?;
    for chunk in ids.chunks(100) {
        client.delete_messages(me.pack(), chunk).await.map_err(es)?;
    }
    Ok(())
}

#[tauri::command]
async fn download_file(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i32,
    name: String,
) -> Result<String, String> {
    let client = ensure_client(&app, &state).await?;
    let me = client.get_me().await.map_err(es)?;
    let msg = client
        .get_messages_by_id(me.pack(), &[id])
        .await
        .map_err(es)?
        .into_iter()
        .next()
        .flatten()
        .ok_or("File no longer exists in Saved Messages")?;
    let dest = unique_path(&download_dir(&app)?, &safe_name(&name));
    msg.download_media(&dest).await.map_err(es)?;
    Ok(dest.to_string_lossy().into_owned())
}

/// Receives one raw chunk of a file picked in the UI and appends it to a staging file.
/// (A browser `File` has no real path on Android, so the UI streams it here.)
#[tauri::command]
async fn stage_chunk(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let id = request
        .headers()
        .get("x-upload-id")
        .and_then(|v| v.to_str().ok())
        .ok_or("missing upload id")?
        .to_string();
    if !valid_upload_id(&id) {
        return Err("invalid upload id".into());
    }
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else {
        return Err("expected raw bytes".into());
    };
    let dir = staging_dir(&app)?.join(&id);
    tokio::fs::create_dir_all(&dir).await.map_err(es)?;
    let mut f = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("data.part"))
        .await
        .map_err(es)?;
    f.write_all(data).await.map_err(es)?;
    f.flush().await.map_err(es)?;
    Ok(())
}

#[tauri::command]
async fn upload_staged(
    app: AppHandle,
    state: State<'_, AppState>,
    upload_id: String,
    name: String,
) -> Result<(), String> {
    if !valid_upload_id(&upload_id) {
        return Err("invalid upload id".into());
    }
    let dir = staging_dir(&app)?.join(&upload_id);
    let result = async {
        let src = dir.join("data.part");
        let dest = dir.join(safe_name(&name));
        tokio::fs::rename(&src, &dest).await.map_err(es)?;
        let client = ensure_client(&app, &state).await?;
        let me = client.get_me().await.map_err(es)?;
        let uploaded = client.upload_file(&dest).await.map_err(es)?;
        client
            .send_message(me.pack(), InputMessage::text("").document(uploaded))
            .await
            .map_err(es)?;
        Ok::<(), String>(())
    }
    .await;
    let _ = tokio::fs::remove_dir_all(&dir).await;
    result
}

// ---------------------------------------------------------------- entry point

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            get_status,
            save_credentials,
            send_code,
            submit_code,
            submit_password,
            logout,
            list_files,
            delete_files,
            download_file,
            stage_chunk,
            upload_staged,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Rexa Drive");
}
