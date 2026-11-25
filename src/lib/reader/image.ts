import { resizeLine } from "./ocr.ts";
import type { Gray } from "./types.ts";

/** 1이 검정 */
export type Binary = { width: number; height: number; data: Uint8Array };

/** 오츠 방법으로 검정과 흰색의 경계를 정한다. */
export function otsu(gray: Gray): number {
  const histogram = new Float64Array(256);
  for (const v of gray.data) histogram[v]!++;
  const total = gray.data.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i]!;
  let count = 0, below = 0, best = -1, from = 128, to = 128;
  for (let i = 0; i < 256; i++) {
    count += histogram[i]!;
    if (count === 0) continue;
    if (count === total) break;
    below += i * histogram[i]!;
    const gap = below / count - (sum - below) / (total - count);
    const between = count * (total - count) * gap * gap;
    if (between > best * (1 + 1e-9)) [best, from] = [between, i];
    if (between >= best * (1 - 1e-9)) to = i;
  }
  return Math.min(225, Math.max(60, (from + to) / 2));
}

/** 종이의 밝기 차이를 없앤다. 구역마다 밝은 쪽의 밝기를 종이색으로 본다. */
export function flatten(gray: Gray): Gray {
  const { width, height, data } = gray;
  const size = 64;
  const cols = Math.max(1, Math.ceil(width / size)), rows = Math.max(1, Math.ceil(height / size));
  const paper = new Float32Array(cols * rows);
  const histogram = new Uint32Array(256);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      histogram.fill(0);
      let n = 0;
      for (let y = r * size; y < Math.min(height, (r + 1) * size); y += 2)
        for (let x = c * size; x < Math.min(width, (c + 1) * size); x += 2) {
          histogram[data[y * width + x]!]!++;
          n++;
        }
      let left = n * 0.25, v = 255;
      while (v > 0 && (left -= histogram[v]!) > 0) v--;
      paper[r * cols + c] = v;
    }
  // 검은 부분만 있는 구역은 이웃의 종이색을 따른다.
  const top = paper.reduce((m, v) => Math.max(m, v), 1);
  for (let k = 0; k < paper.length; k++) if (paper[k]! < top * 0.45) paper[k] = top;
  if (paper.every((v) => v >= 250)) return gray;
  const out = new Uint8Array(data.length);
  for (let y = 0; y < height; y++) {
    const fy = Math.max(0, Math.min(rows - 1, y / size - 0.5)), r0 = Math.floor(fy), r1 = Math.min(rows - 1, r0 + 1), b = fy - r0;
    for (let x = 0; x < width; x++) {
      const fx = Math.max(0, Math.min(cols - 1, x / size - 0.5)), c0 = Math.floor(fx), c1 = Math.min(cols - 1, c0 + 1), a = fx - c0;
      const base = (paper[r0 * cols + c0]! * (1 - a) + paper[r0 * cols + c1]! * a) * (1 - b) + (paper[r1 * cols + c0]! * (1 - a) + paper[r1 * cols + c1]! * a) * b;
      out[y * width + x] = Math.min(255, (data[y * width + x]! * 255) / base);
    }
  }
  return { width, height, data: out };
}

export function binarize(gray: Gray): Binary {
  const threshold = otsu(gray);
  const data = new Uint8Array(gray.data.length);
  for (let i = 0; i < data.length; i++) data[i] = gray.data[i]! <= threshold ? 1 : 0;
  return { width: gray.width, height: gray.height, data };
}

/** 중간 밝기가 얼마나 많은지(검은 화소에 대한 비율). 흐릴수록 크다. */
export function blurriness(gray: Gray): number {
  let middle = 0, dark = 0;
  for (const v of gray.data) {
    if (v < 64) dark++;
    else if (v < 224) middle++;
  }
  return dark ? middle / dark : Infinity;
}

/** 주변 평균과의 차이를 키워 흐려진 가는 선을 되살린다. 굵은 획의 굵기는 거의 그대로다. */
export function sharpen(gray: Gray, radius: number, amount: number): Gray {
  const { width, height, data } = gray;
  const box = (src: Float32Array, count: number, step: number, lines: number, lineStep: number) => {
    const out = new Float32Array(src.length);
    for (let l = 0; l < lines; l++) {
      const base = l * lineStep;
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += src[base + Math.max(0, Math.min(count - 1, k)) * step]!;
      for (let k = 0; k < count; k++) {
        out[base + k * step] = sum / (radius * 2 + 1);
        sum += src[base + Math.min(count - 1, k + radius + 1) * step]! - src[base + Math.max(0, k - radius) * step]!;
      }
    }
    return out;
  };
  const mean = box(box(Float32Array.from(data), width, 1, height, width), height, width, width, 1);
  const out = new Uint8Array(data.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(255, data[i]! + amount * (data[i]! - mean[i]!)));
  return { width, height, data: out };
}

/** 종이 부분에서 이웃한 화소의 밝기 차이(잡음의 세기) */
export function noisiness(gray: Gray): number {
  let sum = 0, n = 0;
  for (let i = 1; i < gray.data.length; i += 3) {
    const a = gray.data[i - 1]!, b = gray.data[i]!;
    if (a < 180 || b < 180) continue;
    sum += Math.abs(a - b);
    n++;
  }
  return n ? sum / n : 0;
}

/** 이웃 화소와 평균 낸 이미지 */
export function soften(gray: Gray): Gray {
  const { width, height, data } = gray;
  const out = data.slice();
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      out[i] = (data[i]! * 4 + (data[i - 1]! + data[i + 1]! + data[i - width]! + data[i + width]!) * 2 + data[i - width - 1]! + data[i - width + 1]! + data[i + width - 1]! + data[i + width + 1]!) / 16;
    }
  return { width, height, data: out };
}

export function extent(blobs: { x0: number; y0: number; x1: number; y1: number }[]): { x0: number; y0: number; x1: number; y1: number } {
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const b of blobs) {
    box.x0 = Math.min(box.x0, b.x0);
    box.y0 = Math.min(box.y0, b.y0);
    box.x1 = Math.max(box.x1, b.x1);
    box.y1 = Math.max(box.y1, b.y1);
  }
  return box;
}

/** 아주 작은 점을 지우고 한 점짜리 구멍을 메운다. */
export function despeckle(image: Binary, area: number): void {
  const { width, height, data } = image;
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (!data[i] && data[i - 1] && data[i + 1] && data[i - width] && data[i + width]) data[i] = 1;
    }
  for (const b of findBlobs(image, { x0: 0, y0: 0, x1: width, y1: height })) if (b.area <= area) for (const p of b.pixels) data[p] = 0;
}

/** 크기를 바꾼다(줄일 때는 면적 평균, 늘릴 때는 이웃 화소를 섞는다). */
export function resize(gray: Gray, scale: number): Gray {
  return resizeLine(gray, Math.round(gray.height * scale));
}

/** 가운데를 중심으로 돌린다(라디안, 시계 방향이 양수). */
export function rotate(gray: Gray, angle: number): Gray {
  const { width, height, data } = gray;
  const out = new Uint8Array(data.length).fill(255);
  const cos = Math.cos(angle), sin = Math.sin(angle), cx = width / 2, cy = height / 2;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sx = cos * (x - cx) + sin * (y - cy) + cx, sy = -sin * (x - cx) + cos * (y - cy) + cy;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 + 1 >= width || y0 + 1 >= height) continue;
      const fx = sx - x0, fy = sy - y0, i = y0 * width + x0;
      const top = data[i]! * (1 - fx) + data[i + 1]! * fx;
      const bottom = data[i + width]! * (1 - fx) + data[i + width + 1]! * fx;
      out[y * width + x] = top * (1 - fy) + bottom * fy;
    }
  return { width, height, data: out };
}

export type Blob = { x0: number; y0: number; x1: number; y1: number; area: number; pixels: Int32Array };

/** 이어진 검은 덩어리(8방향)를 찾는다. 좌표는 원본 기준이고 x1, y1은 포함하지 않는다. */
export function findBlobs(image: Binary, area: { x0: number; y0: number; x1: number; y1: number }): Blob[] {
  const { width, data } = image;
  const x0 = Math.max(0, Math.floor(area.x0)), y0 = Math.max(0, Math.floor(area.y0));
  const x1 = Math.min(width, Math.ceil(area.x1)), y1 = Math.min(image.height, Math.ceil(area.y1));
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return [];
  const seen = new Uint8Array(w * h);
  const blobs: Blob[] = [];
  const stack: number[] = [];
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const start = (y - y0) * w + (x - x0);
      if (seen[start] || !data[y * width + x]) continue;
      seen[start] = 1;
      stack.push(start);
      const pixels: number[] = [];
      let bx0 = x, bx1 = x, by0 = y, by1 = y;
      while (stack.length) {
        const p = stack.pop()!;
        const px = (p % w) + x0, py = Math.floor(p / w) + y0;
        pixels.push(py * width + px);
        if (px < bx0) bx0 = px;
        if (px > bx1) bx1 = px;
        if (py < by0) by0 = py;
        if (py > by1) by1 = py;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx, ny = py + dy;
            if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1 || !data[ny * width + nx]) continue;
            const q = (ny - y0) * w + (nx - x0);
            if (seen[q]) continue;
            seen[q] = 1;
            stack.push(q);
          }
      }
      blobs.push({ x0: bx0, y0: by0, x1: bx1 + 1, y1: by1 + 1, area: pixels.length, pixels: Int32Array.from(pixels) });
    }
  return blobs;
}
