import { extent, findBlobs, type Blob } from "./image.ts";
import { isHangul, type Ocr, type OcrChar } from "./ocr.ts";
import type { Staff } from "./staff.ts";
import type { Gray } from "./types.ts";

export type LyricRow = { y0: number; y1: number; blobs: Blob[] };

type Place = { sheet: { image: { width: number; height: number; data: Uint8Array }; gray: Gray }; staff: Staff; bottom: number };

/** 오선 아래에서 글자 줄의 자리를 찾는다. taken은 쉼표처럼 글자가 아닌 것의 자리 */
export function findRows(place: Place, nextTop: number | undefined, taken: { x0: number; y0: number; x1: number; y1: number }[], em?: number): LyricRow[] {
  const { staff, sheet } = place;
  const { space, lines } = staff;
  const y0 = Math.round(lines[4]! + space * 0.7);
  const limit = Math.min(sheet.image.height, Math.round(nextTop === undefined ? lines[4]! + space * 14 : nextTop - space * 0.8));
  const blobs = findBlobs(sheet.image, { x0: staff.x0 - space * 2, x1: staff.x1 + space * 2, y0, y1: limit }).filter((b) => {
    const w = b.x1 - b.x0, h = b.y1 - b.y0;
    // 오선에서 이어져 내려온 것(기둥, 빔)
    if (b.y0 <= y0) return false;
    if (h > space * 2.8) return false;
    // 붙임줄, 괄호
    if (w > space * 2.6 && b.area / w < space * 0.35 && w > h * 3) return false;
    return !taken.some((t) => t.x0 < b.x1 && t.x1 > b.x0 && t.y0 < b.y1 && t.y1 > b.y0);
  });
  if (blobs.length === 0) return [];

  const ink = new Float64Array(limit - y0 + 1);
  for (const b of blobs) for (const p of b.pixels) ink[Math.floor(p / sheet.image.width) - y0]!++;
  const peak = ink.reduce((m, v) => Math.max(m, v), 0);
  const bands: [number, number][] = [];
  for (let y = 0, start = -1; y <= ink.length; y++) {
    const on = y < ink.length && ink[y]! > Math.max(0, peak * 0.015);
    if (on && start < 0) start = y;
    if (!on && start >= 0) {
      const last = bands.at(-1);
      if (last && start - last[1] < space * 0.12) last[1] = y;
      else bands.push([start, y]);
      start = -1;
    }
  }
  // 글자 크기를 알면, 받침이 떨어져 두 줄로 보이는 것을 합친다.
  for (let i = 0; em && i + 1 < bands.length; ) {
    const [a, b] = [bands[i]!, bands[i + 1]!];
    if (b[1] - a[0] <= em * 1.12 && b[0] - a[1] < em * 0.35 && (a[1] - a[0] < em * 0.8 || b[1] - b[0] < em * 0.6)) bands.splice(i, 2, [a[0], b[1]]);
    else i++;
  }
  const rows: LyricRow[] = [];
  for (const [a, b] of bands) {
    const height = b - a;
    if (height < (em ? em * 0.5 : space * 0.75)) continue;
    // 두 줄이 붙어 있으면 잉크가 가장 적은 곳에서 나눈다.
    const pieces = height > space * 2.7 ? Math.max(2, Math.round(height / (space * 1.9))) : 1;
    const cuts = [a];
    for (let k = 1; k < pieces; k++) {
      const center = a + (height * k) / pieces;
      let best = Math.round(center), low = Infinity;
      for (let y = Math.round(center - space * 0.5); y <= center + space * 0.5; y++) if (ink[y]! < low) [low, best] = [ink[y]!, y];
      cuts.push(best);
    }
    cuts.push(b);
    for (let k = 0; k < pieces; k++) {
      const top = cuts[k]! + y0, bottom = cuts[k + 1]! + y0;
      const mine = blobs.filter((o) => (o.y0 + o.y1) / 2 >= top && (o.y0 + o.y1) / 2 < bottom);
      if (mine.length) {
        const box = extent(mine);
        rows.push({ y0: box.y0, y1: box.y1, blobs: mine });
      }
    }
  }
  // 오선에 가까운 줄부터 이어지는 만큼만. 다음 단의 화음 이름은 다음 오선에 더 가깝다.
  const kept: LyricRow[] = [];
  for (const row of rows) {
    const center = (row.y0 + row.y1) / 2, height = row.y1 - row.y0;
    const last = kept.at(-1);
    if (!last && row.y0 - lines[4]! > space * 7) break;
    if (last && row.y0 - last.y1 > Math.max(space * 1.6, height * 1.3)) break;
    if (nextTop !== undefined && center - lines[4]! > (nextTop - center) * 1.25) break;
    if (height > space * 0.8) kept.push(row);
  }
  return kept;
}

/** 줄을 글자 덩어리로 나눈다. 음절 사이의 붙임표와 점은 버린다. */
export function chunksOf(row: LyricRow): { x0: number; x1: number; blobs: Blob[] }[] {
  const em = row.y1 - row.y0;
  const overlaps = (a: Blob, b: Blob) => a.x0 < b.x1 && a.x1 > b.x0;
  const letters = row.blobs.filter((b) => {
    const w = b.x1 - b.x0, h = b.y1 - b.y0;
    if (h >= em * 0.28) return true;
    if (b.area < 4) return false;
    return row.blobs.some((o) => o !== b && overlaps(o, b) && o.y1 - o.y0 > em * 0.2) || (w < em * 0.3 && h < em * 0.3 && row.blobs.some((o) => o !== b && Math.abs((o.x0 + o.x1) / 2 - (b.x0 + b.x1) / 2) < em * 0.45 && o.y1 - o.y0 > em * 0.4));
  });
  letters.sort((a, b) => a.x0 - b.x0);
  const chunks: { x0: number; x1: number; blobs: Blob[] }[] = [];
  for (const b of letters) {
    const last = chunks.at(-1);
    if (last && b.x0 - last.x1 < em * 0.3) {
      last.x1 = Math.max(last.x1, b.x1);
      last.blobs.push(b);
    } else chunks.push({ x0: b.x0, x1: b.x1, blobs: [b] });
  }
  return chunks.filter((c) => {
    const box = extent(c.blobs);
    return box.y1 - box.y0 > em * 0.42;
  });
}

/** 앞 글자를 끌라는 표시(음절 사이의 가로줄)의 가운데 x */
export function dashesOf(row: LyricRow): number[] {
  const em = row.y1 - row.y0;
  return row.blobs
    .filter((b) => {
      const w = b.x1 - b.x0, h = b.y1 - b.y0;
      return w >= em * 0.18 && w <= em * 4 && h <= em * 0.2 && w > h * 1.5 && !row.blobs.some((o) => o !== b && o.x0 < b.x1 && o.x1 > b.x0);
    })
    .map((b) => (b.x0 + b.x1) / 2);
}

/** 붙어 있는 글자를 잉크가 가장 적은 세로줄에서 n개로 가른다. */
function splitChunk(chunk: { x0: number; x1: number; blobs: Blob[] }, n: number, pageWidth: number): { x0: number; x1: number; blobs: Blob[] }[] {
  const width = chunk.x1 - chunk.x0;
  const columns = new Float64Array(width + 1);
  for (const b of chunk.blobs) {
    for (const p of b.pixels) {
      const x = p % pageWidth;
      if (x >= chunk.x0 && x < chunk.x1) columns[x - chunk.x0]!++;
    }
  }
  const cuts = [0];
  for (let k = 1; k < n; k++) {
    const center = (width * k) / n;
    let best = Math.round(center), low = Infinity;
    for (let x = Math.round(center - width / n / 3); x <= center + width / n / 3; x++) {
      const v = columns[x]! + Math.abs(x - center) * 0.05;
      if (v < low) [low, best] = [v, x];
    }
    cuts.push(best);
  }
  cuts.push(width);
  return Array.from({ length: n }, (_, k) => ({ x0: chunk.x0 + cuts[k]!, x1: chunk.x0 + cuts[k + 1]!, blobs: chunk.blobs }));
}

/** 덩어리들을 좁은 간격으로 이어 붙인 줄 이미지 */
function compose(gray: Gray, row: LyricRow, chunks: { x0: number; x1: number; blobs: Blob[] }[], padding = 0.14): { line: Gray; offsets: number[] } {
  const em = row.y1 - row.y0;
  const pad = Math.round(em * padding), gap = Math.round(em * 0.32);
  const height = em + pad * 2;
  const offsets: number[] = [];
  let width = pad * 2;
  for (const c of chunks) {
    offsets.push(width);
    width += c.x1 - c.x0 + gap;
  }
  width += pad * 2;
  const data = new Uint8Array(width * height).fill(255);
  chunks.forEach((c, i) => {
    // 글자 조각의 둘레만 옮겨 다른 줄의 글자가 섞이지 않게 한다.
    for (const b of c.blobs)
      for (const p of b.pixels) {
        const px = p % gray.width, py = Math.floor(p / gray.width);
        if (px < c.x0 || px >= c.x1) continue;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const x = px + dx - c.x0 + offsets[i]!, y = py + dy - row.y0 + pad;
            if (x < 0 || y < 0 || x >= width || y >= height) continue;
            const v = gray.data[(py + dy) * gray.width + px + dx] ?? 255;
            if (v < data[y * width + x]!) data[y * width + x] = v;
          }
      }
  });
  return { line: { width, height, data }, offsets };
}

const lyricChar = (c: string) => isHangul(c) || /^[A-Za-z']$/.test(c);

/** 줄의 글자를 왼쪽부터 읽는다. x는 쪽 이미지 기준 */
export async function readRow(gray: Gray, row: LyricRow, ocr: Ocr): Promise<OcrChar[]> {
  const em = row.y1 - row.y0;
  const chunks = chunksOf(row);
  const out: OcrChar[] = [];
  for (let i = 0; i < chunks.length; ) {
    let j = i, width = 0;
    while (j < chunks.length && (j === i || width + chunks[j]!.x1 - chunks[j]!.x0 < em * 12)) {
      width += chunks[j]!.x1 - chunks[j]!.x0 + em * 0.32;
      j++;
    }
    const group = chunks.slice(i, j);
    const { line, offsets } = compose(gray, row, group);
    const chars = await ocr.read(line, lyricChar);
    const perChunk = group.map((): OcrChar[] => []);
    for (const c of chars) {
      let at = 0;
      for (let k = 0; k < offsets.length; k++) if (c.x >= offsets[k]! - em * 0.16) at = k;
      const x = group[at]!.x0 + Math.max(0, Math.min(group[at]!.x1 - group[at]!.x0, c.x - offsets[at]!));
      perChunk[at]!.push({ ...c, x });
    }
    for (let k = 0; k < group.length; k++) {
      let list = perChunk[k]!;
      const chunk = group[k]!, wide = chunk.x1 - chunk.x0;
      const expected = Math.max(1, Math.round(wide / (em * 0.98)));
      const good = (l: OcrChar[]) => (l.length === expected ? 10 : -Math.abs(l.length - expected)) + (l.length ? Math.min(...l.map((c) => c.score)) : 0);
      if (list.length !== expected || list.some((c) => c.score < 0.8)) {
        // 글자 수가 이상하거나 확신이 낮으면 여백을 바꾸고 글자를 갈라 다시 읽는다.
        const retry = async (parts: typeof group, padding: number) => {
          const again = compose(gray, row, parts, padding);
          const read = await ocr.read(again.line, lyricChar);
          const moved = read.map((c) => {
            let at = 0;
            for (let q = 0; q < again.offsets.length; q++) if (c.x >= again.offsets[q]! - em * 0.16) at = q;
            return { ...c, x: parts[at]!.x0 + Math.max(0, Math.min(parts[at]!.x1 - parts[at]!.x0, c.x - again.offsets[at]!)) };
          });
          if (good(moved) > good(list)) list = moved;
        };
        for (const padding of [0.14, 0.3]) await retry([chunk], padding);
        if (expected > 1 && list.length !== expected) await retry(splitChunk(chunk, expected, gray.width), 0.2);
      }
      if (list.length === 0 && wide > em * 0.3) list = [{ text: "", x: (chunk.x0 + chunk.x1) / 2, score: 0 }];
      if (list.length === 1) list[0]!.x = (chunk.x0 + chunk.x1) / 2;
      out.push(...list);
    }
    i = j;
  }
  return out;
}

export type NoteSlot = { x: number; tied: boolean };

/** 글자와 음을 순서대로 짝짓는다. 결과는 글자마다 음의 번호(없으면 -1) */
export function alignSyllables(chars: { x: number }[], notes: NoteSlot[], space: number): number[] {
  const n = chars.length, m = notes.length;
  const pair = (i: number, j: number) => {
    const d = Math.abs(chars[i]!.x - notes[j]!.x) / space;
    return (d < 0.5 ? d * 0.3 : d < 1.2 ? d * 0.8 : d * d) + (notes[j]!.tied ? 1.2 : 0);
  };
  const skipChar = 6, skipNote = (j: number) => (notes[j]!.tied ? 0 : 0.5);
  const cost = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = n; i >= 0; i--)
    for (let j = m; j >= 0; j--) {
      if (i === n && j === m) continue;
      let best = Infinity;
      if (i < n) best = Math.min(best, cost[i + 1]![j]! + skipChar);
      if (j < m) best = Math.min(best, cost[i]![j + 1]! + skipNote(j));
      if (i < n && j < m) best = Math.min(best, cost[i + 1]![j + 1]! + pair(i, j));
      cost[i]![j] = best;
    }
  const result: number[] = [];
  for (let i = 0, j = 0; i < n; ) {
    if (j < m && Math.abs(cost[i]![j]! - cost[i + 1]![j + 1]! - pair(i, j)) < 1e-9) {
      result[i++] = j++;
    } else if (j < m && Math.abs(cost[i]![j]! - cost[i]![j + 1]! - skipNote(j)) < 1e-9) j++;
    else result[i++] = -1;
  }
  return result;
}
