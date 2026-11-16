import { DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, FileItem } from "./api";
import { toggleLang, useT, Key } from "./i18n";
import { errMsg, fmtDate, fmtSize, Kind, kindOf } from "./utils";

type Cat = "all" | Kind;
type Sort = "new" | "old" | "name" | "size";
type Phase = "staging" | "sending" | "receiving" | "done" | "failed";
type Transfer = { key: string; name: string; phase: Phase; pct: number; note?: string };

const CATS: { id: Cat; label: Key }[] = [
  { id: "all", label: "all" },
  { id: "image", label: "images" },
  { id: "video", label: "videos" },
  { id: "audio", label: "audio" },
  { id: "doc", label: "docs" },
  { id: "archive", label: "archives" },
  { id: "other", label: "other" },
];

const KIND_COLOR: Record<Kind, string> = {
  image: "#2fd5ff",
  video: "#a56bff",
  audio: "#ff6bd6",
  doc: "#5b8cff",
  archive: "#ffb84d",
  other: "#8aa0c8",
};

function Icon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const I = {
  upload: "M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3",
  download: "M12 4v12m0 0l-4-4m4 4l4-4M4 20h16",
  trash: "M4 7h16M10 11v6m4-6v6M6 7l1 12a1 1 0 001 1h8a1 1 0 001-1l1-12M9 7V4h6v3",
  refresh: "M20 11a8 8 0 10-2.3 5.7M20 4v7h-7",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zm10 2l-4.3-4.3",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  list: "M4 6h16M4 12h16M4 18h16",
  swap: "M7 4v16m0 0l-3-3m3 3l3-3M17 20V4m0 0l-3 3m3-3l3 3",
  out: "M9 4H5a1 1 0 00-1 1v14a1 1 0 001 1h4M16 8l4 4-4 4M20 12H9",
  file: "M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8zM14 3v5h5",
};

function FileGlyph({ kind }: { kind: Kind }) {
  return (
    <div className="glyph" style={{ ["--c" as string]: KIND_COLOR[kind] }}>
      <Icon d={I.file} size={26} />
    </div>
  );
}

export default function Drive({ userName, onSignedOut }: { userName: string; onSignedOut: () => void }) {
  const t = useT();
  const lang = document.documentElement.lang || "en";
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<Cat>("all");
  const [sort, setSort] = useState<Sort>("new");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [panel, setPanel] = useState(false);
  const [drag, setDrag] = useState(false);
  const [toast, setToast] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number>();

  const say = useCallback((m: string) => {
    setToast(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setFiles(await api.list());
      setSel(new Set());
    } catch (e) {
      say(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [say]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = (key: string, p: Partial<Transfer>) =>
    setTransfers((all) => all.map((x) => (x.key === key ? { ...x, ...p } : x)));

  async function uploadAll(list: File[]) {
    if (!list.length) return;
    setPanel(true);
    for (const f of list) {
      const key = `u${Date.now()}${Math.random()}`;
      setTransfers((a) => [{ key, name: f.name, phase: "staging", pct: 0 }, ...a]);
      try {
        await api.upload(
          f,
          (pct) => patch(key, { pct }),
          () => patch(key, { phase: "sending", pct: 100 }),
        );
        patch(key, { phase: "done", pct: 100 });
      } catch (e) {
        patch(key, { phase: "failed", note: errMsg(e) });
      }
    }
    load();
  }

  async function downloadOne(f: FileItem) {
    const key = `d${Date.now()}${Math.random()}`;
    setPanel(true);
    setTransfers((a) => [{ key, name: f.name, phase: "receiving", pct: 100 }, ...a]);
    try {
      const path = await api.download(f.id, f.name);
      patch(key, { phase: "done", note: `${t("savedTo")}: ${path}` });
    } catch (e) {
      patch(key, { phase: "failed", note: errMsg(e) });
    }
  }

  async function removeSelected() {
    if (!sel.size || !window.confirm(t("confirmDelete"))) return;
    try {
      await api.remove([...sel]);
      await load();
    } catch (e) {
      say(errMsg(e));
    }
  }

  async function signOut() {
    await api.logout().catch(() => {});
    onSignedOut();
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = files.filter((f) => (cat === "all" || kindOf(f.name) === cat) && (!q || f.name.toLowerCase().includes(q)));
    out.sort((a, b) => {
      switch (sort) {
        case "old":
          return a.date - b.date;
        case "name":
          return a.name.localeCompare(b.name);
        case "size":
          return b.size - a.size;
        default:
          return b.date - a.date;
      }
    });
    return out;
  }, [files, query, cat, sort]);

  const total = useMemo(() => files.reduce((s, f) => s + f.size, 0), [files]);

  const toggle = (id: number) =>
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    uploadAll([...e.dataTransfer.files]);
  };

  const active = transfers.filter((x) => x.phase === "staging" || x.phase === "sending" || x.phase === "receiving").length;

  return (
    <div
      className="shell"
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDrag(false);
      }}
      onDrop={onDrop}
    >
      <nav className="dock glass">
        <img src="/logo.png" alt="Rexa" className="dock-logo" />
        <div className="dock-spacer" />
        <button className="dock-btn" title={t("transfers")} onClick={() => setPanel((p) => !p)}>
          <Icon d={I.swap} />
          {active > 0 && <b className="badge">{active}</b>}
        </button>
        <button className="dock-btn" title={t("language")} onClick={toggleLang}>
          <span className="lang">{t("language").slice(0, 2)}</span>
        </button>
        <button className="dock-btn" title={t("logout")} onClick={signOut}>
          <Icon d={I.out} />
        </button>
      </nav>

      <main className="stage">
        <header className="topbar">
          <div className="title">
            <h1>{t("drive")}</h1>
            <span className="sub">
              {userName && <>{userName} · </>}
              {files.length} {t("files")} · {fmtSize(total)}
            </span>
          </div>
          <label className="search glass">
            <Icon d={I.search} size={18} />
            <input placeholder={t("search")} value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <button className="btn primary" onClick={() => input.current?.click()}>
            <Icon d={I.upload} size={18} />
            <span>{t("upload")}</span>
          </button>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              uploadAll([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
        </header>

        <div className="toolbar">
          <div className="chips">
            {CATS.map((c) => (
              <button key={c.id} className={`chip ${cat === c.id ? "on" : ""}`} onClick={() => setCat(c.id)}>
                {t(c.label)}
              </button>
            ))}
          </div>
          <div className="tools">
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="select">
              <option value="new">{t("sortNew")}</option>
              <option value="old">{t("sortOld")}</option>
              <option value="name">{t("sortName")}</option>
              <option value="size">{t("sortSize")}</option>
            </select>
            <button className="icon-btn" title={t("refresh")} onClick={load}>
              <Icon d={I.refresh} size={18} />
            </button>
            <button className="icon-btn" title={view === "grid" ? t("list") : t("grid")} onClick={() => setView(view === "grid" ? "list" : "grid")}>
              <Icon d={view === "grid" ? I.list : I.grid} size={18} />
            </button>
          </div>
        </div>

        {sel.size > 0 && (
          <div className="selbar glass">
            <span>
              {sel.size} {t("selected")}
            </span>
            <div className="grow" />
            <button
              className="btn small"
              onClick={() => files.filter((f) => sel.has(f.id)).forEach((f) => downloadOne(f))}
            >
              <Icon d={I.download} size={16} />
              {t("download")}
            </button>
            <button className="btn small danger" onClick={removeSelected}>
              <Icon d={I.trash} size={16} />
              {t("delete")}
            </button>
            <button className="btn small ghost" onClick={() => setSel(new Set())}>
              {t("clear")}
            </button>
          </div>
        )}

        <section className={`content ${view}`}>
          {loading ? (
            <p className="muted center">{t("loading")}</p>
          ) : shown.length === 0 ? (
            <div className="empty">
              <img src="/logo.png" alt="" />
              <h3>{t("empty")}</h3>
              <p>{t("emptyHelp")}</p>
            </div>
          ) : (
            shown.map((f) => {
              const k = kindOf(f.name);
              const on = sel.has(f.id);
              return (
                <article key={f.id} className={`file glass ${on ? "picked" : ""}`} onClick={() => toggle(f.id)}>
                  <FileGlyph kind={k} />
                  <div className="meta">
                    <b title={f.name}>{f.name}</b>
                    <span>
                      {fmtSize(f.size)} · {fmtDate(f.date, lang)}
                    </span>
                  </div>
                  <button
                    className="icon-btn"
                    title={t("download")}
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadOne(f);
                    }}
                  >
                    <Icon d={I.download} size={18} />
                  </button>
                </article>
              );
            })
          )}
        </section>
      </main>

      {panel && (
        <aside className="panel glass">
          <header>
            <h3>{t("transfers")}</h3>
            <button className="icon-btn" onClick={() => setPanel(false)}>
              ✕
            </button>
          </header>
          {transfers.length === 0 && <p className="muted">{t("noTransfers")}</p>}
          {transfers.map((x) => (
            <div key={x.key} className={`tr ${x.phase}`}>
              <b title={x.name}>{x.name}</b>
              <span>
                {x.phase === "staging" && `${t("staging")} ${x.pct}%`}
                {x.phase === "sending" && t("sending")}
                {x.phase === "receiving" && t("receiving")}
                {x.phase === "done" && (x.note ?? t("done"))}
                {x.phase === "failed" && `${t("failed")}: ${x.note ?? ""}`}
              </span>
              <div className="bar">
                <i
                  style={{ width: `${x.phase === "staging" ? x.pct : 100}%` }}
                  className={x.phase === "sending" || x.phase === "receiving" ? "pulse" : ""}
                />
              </div>
            </div>
          ))}
        </aside>
      )}

      {drag && <div className="dropzone">{t("dropHere")}</div>}
      {toast && <div className="toast glass">{toast}</div>}
    </div>
  );
}
