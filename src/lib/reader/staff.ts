import { binarize, rotate, type Binary } from "./image.ts";
import type { Gray } from "./types.ts";

/** 오선 하나. 좌표는 기울기를 바로잡은 이미지 기준 */
export type Staff = {
  x0: number;
  x1: number;
  /** 다섯 줄의 가운데 y (위에서 아래로) */
  lines: number[];
  /** 줄 사이 간격 */
  space: number;
  /** 줄 두께 */
  thick: number;
  /** x에서 줄이 기본 위치보다 얼마나 내려가 있는지 */
  shift: (x: number) => number;
};

export type Sheet = { image: Binary; gray: Gray; staves: Staff[]; space: number; thick: number };

/** 세로로 이어진 검정·흰색 길이에서 줄 두께와 줄 간격을 잰다. */
export function measureLines(image: Binary): { thick: number; space: number } | undefined {
  const { width, height, data } = image;
  const pairs = new Map<number, number>();
  const sums = new Float64Array(120);
  for (let x = 0; x < width; x += 3) {
    let y = 0, black = 0;
    while (y < height) {
      const start = y, color = data[y * width + x];
      while (y < height && data[y * width + x] === color) y++;
      const length = y - start;
      if (color) black = length;
      else if (black > 0 && length < 100 && black < 16 && black + length < 120) {
        sums[black + length]!++;
        const key = (black + length) * 16 + black;
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
  }
  let best = 0, space = 0;
  for (let s = 8; s < 100; s++) {
    const score = sums[s - 1]! + sums[s]! + sums[s + 1]!;
    if (score > best) [best, space] = [score, s];
  }
  if (best < 200) return undefined;
  let thick = 1, count = 0;
  for (let b = 1; b < 16; b++) {
    let n = 0;
    for (let s = space - 1; s <= space + 1; s++) n += pairs.get(s * 16 + b) ?? 0;
    if (n > count) [count, thick] = [n, b];
  }
  return { thick, space };
}

/** 줄 두께만큼 얇은 세로 조각의 (x, y 가운데) */
function thinPoints(image: Binary, thick: number): [number, number][] {
  const { width, height, data } = image;
  const limit = thick + Math.max(1, thick * 0.6);
  const points: [number, number][] = [];
  for (let x = 1; x < width - 1; x += 4)
    for (let y = 0; y < height; ) {
      if (!data[y * width + x]) {
        y++;
        continue;
      }
      const start = y;
      while (y < height && data[y * width + x]) y++;
      if (y - start <= limit) points.push([x, (start + y - 1) / 2]);
    }
  return points;
}

/** 얇은 조각을 가로로 모았을 때 가장 뾰족해지는 기울기(라디안) */
function findSkew(points: [number, number][], width: number, height: number): number {
  const score = (slope: number) => {
    const rows = new Float64Array(height + width);
    for (const [x, y] of points) rows[Math.round(y - slope * (x - width / 2)) + (width >> 1)]!++;
    let sum = 0;
    for (const n of rows) sum += n * n;
    return sum;
  };
  let best = 0;
  for (const [range, step] of [[0.035, 0.002], [0.002, 0.0004], [0.0004, 0.0001]] as const) {
    const center = best;
    let top = -1;
    for (let s = center - range; s <= center + range + 1e-9; s += step) {
      const value = score(s);
      if (value > top * (1 + 1e-9)) [top, best] = [value, s];
    }
  }
  return Math.abs(best) < 1e-6 ? 0 : best;
}

export function readSheet(source: Gray): Sheet | undefined {
  let gray = source;
  let image = binarize(gray);
  const lines = measureLines(image);
  if (!lines) return undefined;
  const { thick, space } = lines;
  let points = thinPoints(image, thick);
  const skew = findSkew(points, image.width, image.height);
  if (Math.abs(skew) * image.width > 3) {
    gray = rotate(gray, -Math.atan(skew));
    image = binarize(gray);
    points = thinPoints(image, thick);
  }
  return { image, gray, staves: findStaves(image, points, thick, space), space, thick };
}

function findStaves(image: Binary, points: [number, number][], thick: number, space: number): Staff[] {
  const { width, height } = image;
  const rows = new Float64Array(height);
  for (const [, y] of points) {
    rows[Math.floor(y)]! += 0.5;
    rows[Math.ceil(y)]! += 0.5;
  }
  const reach = Math.max(1, Math.round(thick / 2));
  const smooth = rows.map((_, y) => {
    let sum = 0;
    for (let d = -reach; d <= reach; d++) sum += rows[y + d] ?? 0;
    return sum;
  });
  /** 근처에서 가장 뾰족한 곳 */
  const peak = (y: number, tolerance: number): [number, number] => {
    let at = Math.round(y), value = -1;
    for (let d = -tolerance; d <= tolerance; d++) {
      const v = smooth[Math.round(y) + d] ?? 0;
      if (v > value) [value, at] = [v, Math.round(y) + d];
    }
    return [at, value];
  };
  const tolerance = Math.max(1, Math.round(space * 0.12));
  const need = (width / 4) * 0.12;
  const candidates: { lines: number[]; score: number }[] = [];
  for (let y = 0; y + space * 4 < height; y++) {
    if (smooth[y]! < need) continue;
    const found = [0, 1, 2, 3, 4].map((k) => peak(y + k * space, k === 0 ? 0 : tolerance));
    const score = Math.min(...found.map((f) => f[1]));
    // 위아래에 여섯째 줄이 있으면 오선이 아니다.
    const outside = Math.max(peak(y - space, tolerance)[1], peak(y + 5 * space, tolerance)[1]);
    if (score >= need && outside < score * 0.8) candidates.push({ lines: found.map((f) => f[0]), score: score + found.reduce((s, f) => s + f[1], 0) / 5 });
  }
  candidates.sort((a, b) => b.score - a.score);
  const chosen: { lines: number[] }[] = [];
  for (const c of candidates) {
    if (chosen.every((o) => Math.abs(o.lines[0]! - c.lines[0]!) > space * 4.5)) chosen.push(c);
  }
  chosen.sort((a, b) => a.lines[0]! - b.lines[0]!);
  return chosen.flatMap(({ lines }) => traceStaff(image, lines, thick) ?? []);
}

/** 왼쪽·오른쪽 끝과, x에 따라 조금씩 휘는 정도를 잰다. */
function traceStaff(image: Binary, rough: number[], thick: number): Staff | undefined {
  const { width, height, data } = image;
  const space = (rough[4]! - rough[0]!) / 4;
  const black = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && data[y * width + x] === 1;
  const reach = Math.max(2, Math.round(space * 0.18));

  /** x 근처에서 다섯 줄이 함께 맞는 세로 이동량 */
  const step = 24;
  const shifts: number[] = [];
  for (let s = 0; s * step < width; s++) {
    let best = -1, at = 0;
    for (let d = -reach; d <= reach; d++) {
      let score = 0;
      for (let x = s * step; x < (s + 1) * step && x < width; x += 2)
        for (const y of rough) {
          if (black(x, Math.round(y) + d)) score += 2;
          if (black(x, Math.round(y) + d - 1) && black(x, Math.round(y) + d + 1)) score++;
        }
      score -= Math.abs(d) * 0.5;
      if (score > best) [best, at] = [score, d];
    }
    shifts.push(best > step * 2 ? at : NaN);
  }
  const filled = shifts.map((_, i) => {
    const near: number[] = [];
    for (let k = Math.max(0, i - 4); k <= Math.min(shifts.length - 1, i + 4); k++) if (!Number.isNaN(shifts[k]!)) near.push(shifts[k]!);
    near.sort((a, b) => a - b);
    return near.length ? near[near.length >> 1]! : 0;
  });
  const shift = (x: number) => {
    const p = Math.max(0, Math.min(filled.length - 1, x / step - 0.5));
    const i = Math.floor(p), f = p - i;
    return filled[i]! * (1 - f) + (filled[i + 1] ?? filled[i]!) * f;
  };

  const full = (x: number) => {
    let n = 0;
    for (const y of rough) {
      const c = Math.round(y + shift(x));
      if (black(x, c) || black(x, c - 1) || black(x, c + 1)) n++;
    }
    return n >= 4;
  };
  // 가장 긴 구간. 작은 끊김은 이어 붙인다.
  let best: [number, number] = [0, 0], start = -1, last = -1;
  for (let x = 0; x <= width; x++) {
    if (x < width && full(x)) {
      if (start < 0 || x - last > space) start = x;
      last = x;
      if (last - start > best[1] - best[0]) best = [start, last];
    }
  }
  if (best[1] - best[0] < space * 12) return undefined;
  return { x0: best[0], x1: best[1], lines: rough, space, thick, shift };
}

/** 오선 줄을 지운 이미지. 줄을 가로지르는 획은 남긴다. */
export function removeStaffLines(image: Binary, staves: Staff[]): Binary {
  const out: Binary = { ...image, data: image.data.slice() };
  const { width, height, data } = image;
  for (const staff of staves) {
    const limit = staff.thick + Math.max(1, Math.round(staff.thick * 0.5));
    const reach = Math.max(1, Math.ceil(staff.thick / 2)) + 1;
    for (let x = Math.max(0, staff.x0 - 2); x <= Math.min(width - 1, staff.x1 + 2); x++)
      for (const line of staff.lines) {
        const center = Math.round(line + staff.shift(x));
        // 줄에 닿은 세로 조각
        let y = -1;
        for (let d = 0; d <= reach && y < 0; d++) {
          if (center + d < height && data[(center + d) * width + x]) y = center + d;
          else if (center - d >= 0 && data[(center - d) * width + x]) y = center - d;
        }
        if (y < 0) continue;
        let top = y, bottom = y;
        while (top > 0 && data[(top - 1) * width + x]) top--;
        while (bottom < height - 1 && data[(bottom + 1) * width + x]) bottom++;
        if (bottom - top + 1 > limit) continue;
        for (let k = top; k <= bottom; k++) out.data[k * width + x] = 0;
      }
  }
  return out;
}
