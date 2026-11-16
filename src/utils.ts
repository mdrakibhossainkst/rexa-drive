export type Kind = "image" | "video" | "audio" | "doc" | "archive" | "other";

const EXT: Record<Exclude<Kind, "other">, string[]> = {
  image: ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "heic", "heif", "avif"],
  video: ["mp4", "mkv", "mov", "avi", "webm", "m4v", "3gp", "flv"],
  audio: ["mp3", "wav", "flac", "ogg", "m4a", "aac", "opus", "wma"],
  doc: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "csv", "rtf", "epub", "json"],
  archive: ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "apk", "dmg", "exe", "iso"],
};

export function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function kindOf(name: string): Kind {
  const e = ext(name);
  for (const k of Object.keys(EXT) as (keyof typeof EXT)[]) {
    if (EXT[k].includes(e)) return k;
  }
  return "other";
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${u[i]}`;
}

export function fmtDate(ts: number, lang: string): string {
  return new Date(ts * 1000).toLocaleDateString(lang === "bn" ? "bn-BD" : undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function errMsg(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}
