import { findBlobs, type Blob } from "./image.ts";
import { type Ocr } from "./ocr.ts";
import type { Staff } from "./staff.ts";
import type { Gray } from "./types.ts";

export type TextLine = { x0: number; y0: number; x1: number; y1: number; text: string; height: number };

type Page = { image: { width: number; height: number; data: Uint8Array }; gray: Gray; staves: Staff[]; space: number };

/** 글자처럼 보이는 덩어리를 줄로 모은다. 가로로 멀리 떨어지면 다른 줄로 본다. */
function boxesIn(page: Page, y0: number, y1: number): { x0: number; y0: number; x1: number; y1: number; blobs: Blob[] }[] {
  const { space } = page;
  const blobs = findBlobs(page.image, { x0: 0, x1: page.image.width, y0, y1 }).filter((b) => b.area >= 4 && b.y1 - b.y0 < space * 7 && b.x1 - b.x0 < space * 12);
  const tall = blobs.filter((b) => b.y1 - b.y0 > space * 0.45).sort((a, b) => a.y0 - b.y0);
  const rows: { y0: number; y1: number; blobs: Blob[] }[] = [];
  for (const b of tall) {
    const row = rows.find((r) => Math.min(r.y1, b.y1) - Math.max(r.y0, b.y0) > Math.min(r.y1 - r.y0, b.y1 - b.y0) * 0.5);
    if (row) {
      row.y0 = Math.min(row.y0, b.y0);
      row.y1 = Math.max(row.y1, b.y1);
      row.blobs.push(b);
    } else rows.push({ y0: b.y0, y1: b.y1, blobs: [b] });
  }
  const out: ReturnType<typeof boxesIn> = [];
  for (const row of rows) {
    const height = row.y1 - row.y0;
    const all = blobs.filter((b) => (b.y0 + b.y1) / 2 > row.y0 - height * 0.15 && (b.y0 + b.y1) / 2 < row.y1 + height * 0.15).sort((a, b) => a.x0 - b.x0);
    let part: Blob[] = [], right = -Infinity;
    const flush = () => {
      if (part.length) out.push({ x0: Math.min(...part.map((b) => b.x0)), x1: Math.max(...part.map((b) => b.x1)), y0: Math.min(...part.map((b) => b.y0)), y1: Math.max(...part.map((b) => b.y1)), blobs: part });
      part = [];
    };
    for (const b of all) {
      if (b.x0 - right > height * 1.5) flush();
      part.push(b);
      right = Math.max(part.length === 1 ? -Infinity : right, b.x1);
    }
    flush();
  }
  return out;
}

async function readLines(page: Page, y0: number, y1: number, ocr: Ocr): Promise<TextLine[]> {
  const lines: TextLine[] = [];
  for (const box of boxesIn(page, Math.max(0, Math.round(y0)), Math.min(page.image.height, Math.round(y1)))) {
    const height = box.y1 - box.y0;
    if (height < page.space * 0.6 || box.x1 - box.x0 < height * 0.8) continue;
    const pad = Math.round(height * 0.16);
    const width = box.x1 - box.x0 + pad * 2;
    // 아주 긴 줄은 모델이 다루기 어렵다.
    if (width / height > 70) continue;
    const line: Gray = { width, height: height + pad * 2, data: new Uint8Array(width * (height + pad * 2)).fill(255) };
    for (let y = 0; y < line.height; y++)
      for (let x = 0; x < width; x++) {
        const sx = box.x0 - pad + x, sy = box.y0 - pad + y;
        if (sx >= 0 && sy >= 0 && sx < page.gray.width && sy < page.gray.height) line.data[y * width + x] = page.gray.data[sy * page.gray.width + sx]!;
      }
    const chars = await ocr.read(line);
    const score = chars.length ? chars.reduce((s, c) => s + c.score, 0) / chars.length : 0;
    const text = chars.map((c) => c.text).join("").normalize("NFC").replace(/\s+/g, " ").trim();
    if (text && score > 0.6) lines.push({ x0: box.x0, x1: box.x1, y0: box.y0, y1: box.y1, text, height });
  }
  return lines.sort((a, b) => a.y0 - b.y0);
}

const CREDIT = /작사|작곡|편곡|노래$|^노래|작사\/작곡|글\s*·?\s*곡|lyrics|music by|composed|words by/i;
const COPYRIGHT = /ⓒ|©|\(c\)|copyright|저작|무단|all rights|불법복제|복제를?\s*금/i;

export type Header = { title: string; credits: string; copyright: string; bpm?: number };

/** 첫 쪽 위의 제목·작가와, 쪽 아래의 저작권 표시를 읽는다. */
export async function readHeader(pages: Page[], ocr: Ocr): Promise<Header> {
  const first = pages[0];
  if (!first?.staves.length) return { title: "", credits: "", copyright: "" };
  const top = await readLines(first, 0, first.staves[0]!.lines[0]! - first.space * 1.2, ocr);
  const bottom: TextLine[] = [];
  for (const page of pages) {
    const last = page.staves.at(-1);
    if (!last) continue;
    const from = Math.max(last.lines[4]! + page.space * 9, page.image.height * 0.8);
    const lines = await readLines(page, from, page.image.height, ocr);
    // 저작권 표시와 이어지는 줄까지 함께 남긴다.
    const start = lines.findIndex((l) => COPYRIGHT.test(l.text));
    if (start >= 0) bottom.push(...lines.slice(start).filter((l, i, all) => i === 0 || (l.y0 - all[i - 1]!.y1 < l.height * 1.5 && (COPYRIGHT.test(l.text) || l.text.length > 15))));
  }
  const bpm = top.map((l) => /[=＝]\s*(?:c\.?\s*)?(\d{2,3})\b/.exec(l.text)?.[1]).find(Boolean);
  const texts = top.filter((l) => !COPYRIGHT.test(l.text) && !/www\.|https?:|\.co\.kr|\.com/i.test(l.text) && /[가-힣A-Za-z]/.test(l.text));
  const title = texts.reduce<TextLine | undefined>((best, l) => (!best || l.height > best.height * 1.05 ? l : best), undefined);
  const credits = texts.filter((l) => l !== title && CREDIT.test(l.text));
  const copyright = [...new Set([...top.filter((l) => COPYRIGHT.test(l.text)), ...bottom].map((l) => l.text))].join(" ").slice(0, 400);
  const tempo = bpm ? Number(bpm) : undefined;
  return { title: title?.text ?? "", credits: credits.map((l) => l.text).join(" / "), copyright, ...(tempo && tempo >= 30 && tempo <= 240 ? { bpm: tempo } : {}) };
}
