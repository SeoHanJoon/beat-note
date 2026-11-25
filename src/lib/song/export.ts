import { normalizeSong } from "./text.ts";
import type { Song } from "./types.ts";

export const TEMPLATE_PATH = "/note-template.html";
const DATA_SLOT = '<script type="application/json" id="song-data"></script>';
const TITLE_SLOT = "<title>박자 노트</title>";

/** <script> 안에 넣어도 태그로 읽히지 않는 JSON */
export function scriptSafeJson(value: unknown): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

export function escapeHtml(text: string): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return text.replace(/[&<>"']/g, (c) => map[c]!);
}

/** 템플릿에 곡을 넣어 파일 하나로 된 박자 노트를 만든다. */
export function renderNote(template: string, song: Song): string {
  if (!template.includes(DATA_SLOT) || !template.includes(TITLE_SLOT)) throw new Error("템플릿의 자리를 찾을 수 없음");
  const clean = normalizeSong(song);
  return template
    .replace(TITLE_SLOT, () => `<title>${escapeHtml(clean.title)} 박자 노트</title>`)
    .replace(DATA_SLOT, () => DATA_SLOT.replace("></", () => `>${scriptSafeJson(clean)}</`));
}

/** 운영체제에서 쓸 수 있는 파일 이름 */
export function noteFileName(song: Song): string {
  const name = song.title
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 80)
    .trim();
  return `${name || "박자 노트"}.html`;
}
