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

export function binarize(gray: Gray): Binary {
  const threshold = otsu(gray);
  const data = new Uint8Array(gray.data.length);
  for (let i = 0; i < data.length; i++) data[i] = gray.data[i]! <= threshold ? 1 : 0;
  return { width: gray.width, height: gray.height, data };
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
