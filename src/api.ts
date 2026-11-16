import { invoke } from "@tauri-apps/api/core";

export type Status = { has_creds: boolean; authorized: boolean; name?: string | null };
export type FileItem = { id: number; name: string; size: number; date: number };
export type CodeResult = "ok" | "password";

const CHUNK = 4 * 1024 * 1024; // 4 MiB per IPC call

export const api = {
  status: () => invoke<Status>("get_status"),
  saveCreds: (apiId: number, apiHash: string) => invoke<void>("save_credentials", { apiId, apiHash }),
  sendCode: (phone: string) => invoke<void>("send_code", { phone }),
  submitCode: (code: string) => invoke<CodeResult>("submit_code", { code }),
  submitPassword: (password: string) => invoke<void>("submit_password", { password }),
  list: () => invoke<FileItem[]>("list_files"),
  remove: (ids: number[]) => invoke<void>("delete_files", { ids }),
  download: (id: number, name: string) => invoke<string>("download_file", { id, name }),
  logout: () => invoke<void>("logout"),

  /** Streams a browser File to the Rust side in chunks, then uploads it to Telegram. */
  async upload(file: File, onStage: (pct: number) => void, onSending: () => void): Promise<void> {
    const uploadId = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    let offset = 0;
    if (file.size === 0) {
      await invoke("stage_chunk", new Uint8Array(0), { headers: { "x-upload-id": uploadId } });
    }
    while (offset < file.size) {
      const buf = new Uint8Array(await file.slice(offset, offset + CHUNK).arrayBuffer());
      await invoke("stage_chunk", buf, { headers: { "x-upload-id": uploadId } });
      offset += buf.byteLength;
      onStage(Math.round((offset / file.size) * 100));
    }
    onSending();
    await invoke("upload_staged", { uploadId, name: file.name });
  },
};
