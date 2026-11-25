import { findBlobs, type Binary, type Blob } from "./image.ts";
import type { Staff } from "./staff.ts";

/** 음표 머리 */
export type Head = { x: number; y: number; x0: number; x1: number; open: boolean; whole: boolean };

/** 기둥 하나에 달린 음(화음은 하나로 본다) */
export type NoteMark = {
  kind: "note";
  x: number;
  y: number;
  /** 1 = 기둥이 위, -1 = 아래, 0 = 기둥 없음 */
  dir: 1 | -1 | 0;
  open: boolean;
  whole: boolean;
  /** 빔이나 꼬리의 수 */
  beams: number;
  /** 왼쪽·오른쪽 음과 빔으로 이어짐 */
  beamLeft: boolean;
  beamRight: boolean;
  dots: number;
  heads: Head[];
  stem?: Stem;
};

export type RestMark = {
  kind: "rest";
  x: number;
  y: number;
  /** 1, 2, 4, 8, 16. 0은 쉼표인지 알 수 없는 조각 */
  value: number;
  dots: number;
  /** 오선 밖에 있어 글자일 수도 있음 */
  outside: boolean;
  /** 다른 기호에 붙어 있던 조각 */
  doubtful?: true;
  box: { x0: number; y0: number; x1: number; y1: number };
};

export type Mark = NoteMark | RestMark;

export type Stem = { x0: number; x1: number; y0: number; y1: number };

export type TimeMark = { x: number; x1: number; kind: "common" | "digits"; lowerHoles: number };

export type SystemMarks = { marks: Mark[]; times: TimeMark[]; threes: { x: number; y: number }[]; /** 음자리표와 조표가 끝나는 x */ start: number; heads: Head[]; region: Region };

/** 오선 주변을 잘라 낸 이미지와 덩어리 번호, 가장자리까지의 거리 */
export type Region = {
  x0: number; y0: number; width: number; height: number;
  black: Uint8Array;
  label: Int32Array;
  blobs: Blob[];
  distance: Float32Array;
  at: (x: number, y: number) => boolean;
  labelAt: (x: number, y: number) => number;
};

function cut(clean: Binary, staff: Staff, above: number, below: number): Region {
  const { space } = staff;
  const x0 = Math.max(0, Math.round(staff.x0 - space)), x1 = Math.min(clean.width, Math.round(staff.x1 + space));
  const y0 = Math.max(0, Math.round(staff.lines[0]! - space * above)), y1 = Math.min(clean.height, Math.round(staff.lines[4]! + space * below));
  const width = x1 - x0, height = y1 - y0;
  const black = new Uint8Array(width * height), label = new Int32Array(width * height);
  for (let y = 0; y < height; y++) black.set(clean.data.subarray((y + y0) * clean.width + x0, (y + y0) * clean.width + x1), y * width);
  const blobs = findBlobs({ width, height, data: black }, { x0: 0, y0: 0, x1: width, y1: height });
  blobs.forEach((b, i) => b.pixels.forEach((p) => (label[p] = i + 1)));
  for (const b of blobs) {
    b.x0 += x0; b.x1 += x0; b.y0 += y0; b.y1 += y0;
  }
  // 흰색까지의 거리(대각선 1.4)
  const distance = new Float32Array(width * height);
  const D = Math.SQRT2;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!black[i]) continue;
      const up = y > 0 ? distance[i - width]! : 0, left = x > 0 ? distance[i - 1]! : 0;
      const ul = y > 0 && x > 0 ? distance[i - width - 1]! : 0, ur = y > 0 && x < width - 1 ? distance[i - width + 1]! : 0;
      distance[i] = Math.min(up + 1, left + 1, ul + D, ur + D);
    }
  for (let y = height - 1; y >= 0; y--)
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (!black[i]) continue;
      const down = y < height - 1 ? distance[i + width]! : 0, right = x < width - 1 ? distance[i + 1]! : 0;
      const dl = y < height - 1 && x > 0 ? distance[i + width - 1]! : 0, dr = y < height - 1 && x < width - 1 ? distance[i + width + 1]! : 0;
      distance[i] = Math.min(distance[i]!, down + 1, right + 1, dl + D, dr + D);
    }
  const inside = (x: number, y: number) => x >= x0 && y >= y0 && x < x1 && y < y1;
  return {
    x0, y0, width, height, black, label, blobs, distance,
    at: (x, y) => inside(x, y) && black[(y - y0) * width + (x - x0)] === 1,
    labelAt: (x, y) => (inside(x, y) ? label[(y - y0) * width + (x - x0)]! : 0),
  };
}

/** 길고 곧은 세로 획 */
function findStems(region: Region, staff: Staff): Stem[] {
  const { space } = staff;
  const min = space * 1.9;
  const runs: Stem[] = [];
  const { width, height, black, x0, y0 } = region;
  for (let x = 0; x < width; x++)
    for (let y = 0; y < height; ) {
      if (!black[y * width + x]) {
        y++;
        continue;
      }
      const start = y;
      while (y < height && black[y * width + x]) y++;
      if (y - start >= min) runs.push({ x0: x + x0, x1: x + x0, y0: start + y0, y1: y - 1 + y0 });
    }
  const stems: Stem[] = [];
  for (const run of runs) {
    const same = stems.find((s) => run.x0 - s.x1 <= 1 && Math.min(run.y1, s.y1) - Math.max(run.y0, s.y0) > min * 0.6);
    if (same) {
      same.x1 = run.x1;
      same.y0 = Math.min(same.y0, run.y0);
      same.y1 = Math.max(same.y1, run.y1);
    } else stems.push({ ...run });
  }
  return stems.filter((s) => s.x1 - s.x0 + 1 <= Math.max(4, space * 0.35));
}

/** 채운 머리: 가장자리에서 충분히 먼(두꺼운) 곳 */
function findFilledHeads(region: Region, staff: Staff): Head[] {
  const { space } = staff;
  const { width, height, distance, x0, y0 } = region;
  const core = new Uint8Array(width * height);
  for (let i = 0; i < core.length; i++) core[i] = distance[i]! >= space * 0.31 ? 1 : 0;
  const heads: Head[] = [];
  for (const b of findBlobs({ width, height, data: core }, { x0: 0, y0: 0, x1: width, y1: height })) {
    const w = b.x1 - b.x0, h = b.y1 - b.y0;
    if (w > space * 1.6 || h > space * 3) continue;
    // 빔과 기둥이 만나는 곳은 머리만큼 두껍지 않다.
    let thickest = 0;
    for (const p of b.pixels) thickest = Math.max(thickest, distance[p]!);
    if (thickest < space * 0.365) continue;
    // 세로로 붙은 화음은 머리 높이(약 한 칸)마다 나눈다.
    const count = Math.max(1, Math.round((h + space * 0.55) / space));
    for (let k = 0; k < count; k++) {
      const x = (b.x0 + b.x1 - 1) / 2 + x0, y = b.y0 + (h * (k + 0.5)) / count + y0;
      heads.push({ x, y, x0: x - space * 0.62, x1: x + space * 0.62, open: false, whole: false });
    }
  }
  return heads;
}

/** 빈 머리: 가운데가 희고 둘레가 검은 타원 */
function findOpenHeads(region: Region, staff: Staff): Head[] {
  const { space } = staff;
  const found: (Head & { score: number })[] = [];
  const rays = Array.from({ length: 24 }, (_, i) => (i * Math.PI) / 12);
  const yStart = region.y0 + space * 0.6, yEnd = region.y0 + region.height - space * 0.6;
  const base = staff.lines[0]!;
  for (let step = Math.ceil(((yStart - base) * 2) / space); base + (step * space) / 2 < yEnd; step++) {
    for (let x = Math.round(staff.x0 + space); x < staff.x1 - space * 0.5; x++) {
      const rowY = base + (step * space) / 2 + staff.shift(x);
      for (const dy of [0, -Math.round(space * 0.1), Math.round(space * 0.1)]) {
        const y = Math.round(rowY + dy);
        if (region.at(x, y) || region.at(x - 1, y) || region.at(x + 1, y)) continue;
        // 네 방향이 막혀 있지 않으면 머리가 아니다(대부분 여기서 끝난다).
        const reach = Math.ceil(space);
        const blocked = (dx: number, dy2: number) => {
          let i = (y - region.y0) * region.width + (x - region.x0);
          const step = dy2 * region.width + dx;
          for (let k = 0; k < reach; k++) {
            i += step;
            if (region.black[i]) return true;
          }
          return false;
        };
        if (!blocked(0, 1) || !blocked(0, -1) || !blocked(1, 0) || !blocked(-1, 0)) continue;
        let misses = 0;
        let hits = 0, sumX = 0, left = 0, right = 0, up = 0, down = 0;
        for (const angle of rays) {
          const cos = Math.cos(angle), sin = Math.sin(angle);
          let r = 1;
          const limit = space * 1.0;
          while (r < limit && !region.at(Math.round(x + cos * r), Math.round(y + sin * r))) r++;
          if (r >= limit) {
            if (++misses > 3) break;
            continue;
          }
          // 둘레 밖은 다시 희다.
          let t = r;
          while (t < r + space * 0.8 && region.at(Math.round(x + cos * t), Math.round(y + sin * t))) t++;
          hits++;
          sumX += cos * r;
          if (angle === 0) right = t;
          else if (Math.abs(angle - Math.PI) < 1e-6) left = t;
          else if (Math.abs(angle - Math.PI / 2) < 1e-6) down = t;
          else if (Math.abs(angle - Math.PI * 1.5) < 1e-6) up = t;
        }
        if (hits < 21) continue;
        const w = left + right, h = up + down;
        if (w < space * 1.0 || w > space * 2.1 || h < space * 0.75 || h > space * 1.35) continue;
        const score = hits - Math.abs(sumX) / space - Math.abs(left - right) / space - Math.abs(dy) / space - Math.abs(up - down) / space;
        found.push({ x: x + (right - left) / 2, y: rowY, x0: x - left, x1: x + right, open: true, whole: false, score });
      }
    }
  }
  found.sort((a, b) => b.score - a.score);
  const heads: typeof found = [];
  for (const f of found) if (heads.every((h) => Math.abs(h.x - f.x) > space * 0.9 || Math.abs(h.y - f.y) > space * 0.8)) heads.push(f);
  return heads;
}

/** 기둥 끝 쪽에 붙은 빔의 수. side가 -1이면 왼쪽 */
function countBeams(region: Region, stem: Stem, dir: 1 | -1, headY: number, side: 1 | -1, space: number): number {
  const edge = side === 1 ? stem.x1 : stem.x0;
  const tip = dir === 1 ? stem.y0 : stem.y1;
  const stop = headY - dir * space * 0.75;
  const from = Math.min(tip - dir * 0.4 * space, stop), to = Math.max(tip - dir * 0.4 * space, stop);
  const column = (dx: number): [number, number][] => {
    const x = Math.round(edge + side * dx);
    const list: [number, number][] = [];
    for (let y = Math.round(from); y <= to; ) {
      if (!region.at(x, y)) {
        y++;
        continue;
      }
      const start = y;
      while (region.at(x, y)) y++;
      list.push([start, y - 1]);
    }
    return list;
  };
  const near = column(space * 0.22), middle = column(space * 0.4), far = column(space * 0.58);
  let count = 0;
  for (const [a, b] of middle) {
    const thick = b - a + 1;
    if (thick < space * 0.28) continue;
    const touches = (list: [number, number][]) =>
      list.some(([c, d]) => Math.min(b, d) - Math.max(a, c) > thick * 0.35 && d - c + 1 > space * 0.28 && d - c + 1 < thick + space * 0.45);
    if (!touches(near) || !touches(far)) continue;
    count += thick > space * 0.95 ? 2 : 1;
  }
  return count;
}

/** 두 기둥의 끝을 잇는 빔이 있는지 */
function beamBetween(region: Region, a: Stem, b: Stem, dir: 1 | -1, space: number): boolean {
  const tip = (s: Stem) => (dir === 1 ? s.y0 : s.y1) + dir * space * 0.22;
  const [xa, xb] = [(a.x0 + a.x1) / 2, (b.x0 + b.x1) / 2];
  const steps = Math.max(8, Math.round(Math.abs(xb - xa) / 3));
  let black = 0;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    if (region.at(Math.round(xa + (xb - xa) * u), Math.round(tip(a) + (tip(b) - tip(a)) * u))) black++;
  }
  return black / (steps + 1) > 0.9;
}

/** 빔이 없는 기둥의 꼬리 수 */
function countFlags(region: Region, staff: Staff, stem: Stem, dir: 1 | -1, headY: number): number {
  const { space, thick, lines } = staff;
  const ledger = (y0: number, y1: number) => {
    const at = ((y0 + y1) / 2 - lines[0]! - staff.shift(stem.x0)) / space;
    return (at < -0.5 || at > 4.5) && Math.abs(at - Math.round(at)) < 0.16 && y1 - y0 <= thick * 2 + 1;
  };
  const tip = dir === 1 ? stem.y0 : stem.y1;
  const stop = headY - dir * space * 0.85;
  const from = Math.round(Math.min(tip, stop) - (dir === 1 ? 2 : 0)), to = Math.round(Math.max(tip, stop) + (dir === 1 ? 0 : 2));
  const votes: number[] = [];
  for (const dx of [0.2, 0.28, 0.36, 0.45]) {
    const x = Math.round(stem.x1 + space * dx);
    let n = 0;
    for (let y = from; y <= to; ) {
      if (!region.at(x, y)) {
        y++;
        continue;
      }
      const start = y;
      while (y <= to && region.at(x, y)) y++;
      if (y - start >= Math.max(2, space * 0.1) && !ledger(start, y - 1)) n++;
    }
    votes.push(n);
  }
  votes.sort((a, b) => a - b);
  return Math.min(3, Math.round((votes[1]! + votes[2]!) / 2));
}

function isDot(b: Blob, space: number): boolean {
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  return w >= space * 0.18 && h >= space * 0.18 && w <= space * 0.62 && h <= space * 0.62 && b.area > w * h * 0.6 && Math.abs(w - h) <= Math.max(2, space * 0.2);
}

/** 가장 길게 이어진 세로줄 */
function longestColumn(region: Region, b: Blob): { run: number; x: number } {
  const index = region.label[b.pixels[0]!]!;
  let best = { run: 0, x: b.x0 };
  for (let x = b.x0; x < b.x1; x++) {
    let run = 0;
    for (let y = b.y0; y < b.y1; y++) {
      run = region.labelAt(x, y) === index ? run + 1 : 0;
      if (run > best.run) best = { run, x };
    }
  }
  return best;
}

/** 덩어리 안에 갇힌 흰 구멍의 수 */
export function countHoles(region: Region, b: Blob, minArea: number): number {
  const w = b.x1 - b.x0 + 2, h = b.y1 - b.y0 + 2;
  const index = region.label[b.pixels[0]!]!;
  const white = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) white[y * w + x] = region.labelAt(b.x0 - 1 + x, b.y0 - 1 + y) === index ? 0 : 1;
  return findBlobs({ width: w, height: h, data: white }, { x0: 0, y0: 0, x1: w, y1: h }).filter(
    (o) => o.x0 > 0 && o.y0 > 0 && o.x1 < w && o.y1 < h && o.area >= minArea,
  ).length;
}

function classifyRest(region: Region, b: Blob, staff: Staff): number | undefined {
  const { space } = staff;
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  const index = region.label[b.pixels[0]!]!;
  // 온쉼표·2분쉼표: 납작한 사각형. 덧줄이 붙어 있을 수 있어 두꺼운 부분만 본다.
  if (w >= space * 0.8 && w <= space * 2.6 && h >= space * 0.35 && h <= space * 0.95) {
    const thickRows: number[] = [];
    let x0 = Infinity, x1 = -Infinity;
    for (let x = b.x0; x < b.x1; x++) {
      let top = -1, bottom = -1;
      for (let y = b.y0; y < b.y1; y++)
        if (region.labelAt(x, y) === index) {
          if (top < 0) top = y;
          bottom = y;
        }
      if (bottom - top + 1 >= space * 0.33) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        for (let y = top; y <= bottom; y++) thickRows.push(y);
      }
    }
    const coreW = x1 - x0 + 1, coreH = space * 0.5;
    if (coreW >= space * 0.8 && coreW <= space * 1.7 && thickRows.length > coreW * coreH * 0.7) {
      const center = thickRows.reduce((s, y) => s + y, 0) / thickRows.length;
      const line = (center - staff.lines[0]! - staff.shift(b.x0)) / space;
      const part = line - Math.floor(line);
      // 줄에 매달리면 온쉼표, 줄 위에 앉으면 2분쉼표
      if (Math.abs(part - 0.25) < 0.16) return 1;
      if (Math.abs(part - 0.75) < 0.16) return 2;
    }
    return undefined;
  }
  if (w < space * 0.55 || w > space * 1.6 || h < space * 1.4 || h > space * 4) return undefined;
  // 변화표: 갇힌 칸이 있거나 가장자리에 곧은 세로획이 있다.
  if (countHoles(region, b, 3) > 0) return undefined;
  const long = longestColumn(region, b);
  if (long.run > space * 1.6 && Math.abs((long.x - b.x0) / w - 0.5) > 0.25) return undefined;
  // 아래 부분이 가는 사선 하나면 8분·16분쉼표, 갈고리면 4분쉼표
  let thin = 0, rows = 0;
  for (let y = Math.round(b.y1 - h * 0.3); y < b.y1 - 1; y++) {
    let first = -1, last = -1;
    for (let x = b.x0; x < b.x1; x++)
      if (region.labelAt(x, y) === index) {
        if (first < 0) first = x;
        last = x;
      }
    if (first < 0) continue;
    rows++;
    if (last - first + 1 <= space * 0.34) thin++;
  }
  const slanted = rows > 0 && thin / rows > 0.75;
  if (slanted) {
    if (h < space * 2.25) return 8;
    if (h < space * 3.2) return 16;
    return 32;
  }
  // 4분쉼표는 세 칸 가까이 길다.
  if (h >= space * 2.1 && h <= space * 3.6 && w <= space * 1.45) return 4;
  return undefined;
}

/** 머리, 기둥, 빔을 지운 나머지 */
function leftover(region: Region, notes: NoteMark[], space: number): Region {
  const { width, height, x0, y0 } = region;
  const black = region.black.slice();
  // 가로로 긴 것(빔)
  const long = Math.round(space * 1.1);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; ) {
      if (!region.black[y * width + x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < width && region.black[y * width + x]) x++;
      if (x - start >= long) black.fill(0, y * width + start, y * width + x);
    }
  const clear = (cx: number, cy: number, rx: number, ry: number) => {
    for (let y = Math.max(0, Math.floor(cy - ry - y0)); y <= Math.min(height - 1, cy + ry - y0); y++)
      for (let x = Math.max(0, Math.floor(cx - rx - x0)); x <= Math.min(width - 1, cx + rx - x0); x++)
        if (((x + x0 - cx) / rx) ** 2 + ((y + y0 - cy) / ry) ** 2 <= 1) black[y * width + x] = 0;
  };
  for (const n of notes) {
    for (const h of n.heads) clear(h.x, h.y, space * 0.82, space * 0.62);
    if (n.stem) for (let y = n.stem.y0 - 1; y <= n.stem.y1 + 1; y++) if (y >= y0 && y < y0 + height) black.fill(0, (y - y0) * width + n.stem.x0 - 1 - x0, (y - y0) * width + n.stem.x1 + 2 - x0);
  }
  const blobs = findBlobs({ width, height, data: black }, { x0: 0, y0: 0, x1: width, y1: height });
  const label = new Int32Array(width * height);
  blobs.forEach((b, i) => b.pixels.forEach((p) => (label[p] = i + 1)));
  for (const b of blobs) {
    b.x0 += x0; b.x1 += x0; b.y0 += y0; b.y1 += y0;
  }
  const inside = (x: number, y: number) => x >= x0 && y >= y0 && x < x0 + width && y < y0 + height;
  return {
    ...region, black, label, blobs,
    at: (x, y) => inside(x, y) && black[(y - y0) * width + (x - x0)] === 1,
    labelAt: (x, y) => (inside(x, y) ? label[(y - y0) * width + (x - x0)]! : 0),
  };
}

/** 왼쪽이 두 번 패인 숫자 3의 모양 */
function looksLikeThree(region: Region, b: Blob): boolean {
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  const index = region.label[b.pixels[0]!]!;
  const left = (from: number, to: number, pick: (...v: number[]) => number) => {
    const list: number[] = [];
    for (let y = Math.round(b.y0 + h * from); y < b.y0 + h * to; y++)
      for (let x = b.x0; x < b.x1; x++)
        if (region.labelAt(x, y) === index) {
          list.push((x - b.x0) / w);
          break;
        }
    return list.length ? pick(...list) : 1;
  };
  return (
    countHoles(region, b, 4) === 0 &&
    left(0, 0.22, Math.min) < 0.45 && left(0.24, 0.4, Math.max) > 0.4 && left(0.4, 0.6, Math.min) < left(0.24, 0.4, Math.max) - 0.05 &&
    left(0.58, 0.76, Math.max) > 0.45 && left(0.78, 1, Math.min) < 0.3
  );
}

/** 오선 밖의 머리라면 덧줄이 있는지 */
function hasLedger(clean: Binary, staff: Staff, head: Head): boolean {
  const { space, lines } = staff;
  const shift = staff.shift(head.x);
  const above = lines[0]! + shift - head.y, below = head.y - lines[4]! - shift;
  if (above < space * 0.8 && below < space * 0.8) return true;
  // 머리에서 오선 쪽으로 가장 가까운 덧줄
  const steps = Math.floor(Math.max(above, below) / space + 0.2);
  const y = Math.round(above > 0 ? lines[0]! + shift - steps * space : lines[4]! + shift + steps * space);
  const dark = (x: number) => [-2, -1, 0, 1, 2].some((d) => clean.data[(y + d) * clean.width + Math.round(x)] === 1);
  return dark(head.x0 - space * 0.15) && dark(head.x1 + space * 0.15);
}

export function readSymbols(clean: Binary, staff: Staff, bars: { x0: number; x1: number; repeat: boolean }[]): SystemMarks {
  const { space, lines } = staff;
  // 마디선에 닿은 꼬리와 쉼표를 떼어 낸다.
  const erased: Binary = { ...clean, data: clean.data.slice() };
  for (const b of bars)
    for (let y = Math.round(lines[0]! - space * 0.5); y <= lines[4]! + space * 0.5; y++) erased.data.fill(0, y * clean.width + b.x0 - 1, y * clean.width + b.x1 + 2);
  const region = cut(erased, staff, 6, 4.5);
  const used = new Set<number>();

  // 음자리표: 맨 왼쪽의 큰 덩어리
  let start = staff.x0 + space * 0.5;
  for (const b of region.blobs) {
    if (b.x0 < staff.x0 + space * 2.5 && b.y1 - b.y0 > space * 2.6 && b.x1 - b.x0 > space * 1.2 && b.x1 - b.x0 < space * 4) start = Math.max(start, b.x1);
  }

  const inBar = (x: number) => bars.some((b) => x >= b.x0 - 1 && x <= b.x1 + 1);
  const stems = findStems(region, staff).filter((s) => !inBar((s.x0 + s.x1) / 2) && s.x0 > start);
  const top = lines[0]! - space * 5.2, bottom = lines[4]! + space * 3.7;
  const okY = (h: Head) => h.y > top && h.y < bottom && h.x > start && !inBar(h.x);
  const filled = findFilledHeads(region, staff).filter(okY);
  // 박자표
  const times: TimeMark[] = [];
  const mid = (b: Blob) => (b.y0 + b.y1) / 2 - staff.shift(b.x0);
  const headLabels = new Set(filled.map((h) => region.labelAt(Math.round(h.x), Math.round(h.y))));
  const loose = region.blobs.filter((b, i) => !headLabels.has(i + 1) && b.x0 >= start - 1 && !bars.some((bar) => b.x0 <= bar.x1 && b.x1 >= bar.x0));
  const tall = (b: Blob, lo: number, hi: number) => b.y1 - b.y0 >= space * lo && b.y1 - b.y0 <= space * hi;
  const wide = (b: Blob, lo: number, hi: number) => b.x1 - b.x0 >= space * lo && b.x1 - b.x0 <= space * hi;
  const timeBlobs = new Set<Blob>();
  for (const b of loose) {
    if (wide(b, 0.9, 2.6) && tall(b, 1.55, 2.5) && Math.abs(mid(b) - lines[3]!) < space * 0.35) {
      const upper = loose.find((u) => u !== b && wide(u, 0.7, 2.6) && tall(u, 1.55, 2.5) && Math.abs(mid(u) - lines[1]!) < space * 0.35 && Math.abs((u.x0 + u.x1) / 2 - (b.x0 + b.x1) / 2) < space * 0.8);
      if (upper) {
        times.push({ x: Math.min(b.x0, upper.x0), x1: Math.max(b.x1, upper.x1), kind: "digits", lowerHoles: countHoles(region, b, space * space * 0.04) });
        timeBlobs.add(b).add(upper);
      }
    } else if (wide(b, 0.9, 2.6) && tall(b, 3.6, 4.6) && Math.abs(mid(b) - lines[2]!) < space * 0.35 && b.area > (b.x1 - b.x0) * (b.y1 - b.y0) * 0.3) {
      const lower = { ...b, y0: Math.round(lines[2]!) };
      times.push({ x: b.x0, x1: b.x1, kind: "digits", lowerHoles: countHoles(region, lower, space * space * 0.04) });
      timeBlobs.add(b);
    } else if (wide(b, 1.15, 2.2) && tall(b, 1.6, 2.6) && Math.abs(mid(b) - lines[2]!) < space * 0.3 && longestColumn(region, b).run < space * 2.1) {
      times.push({ x: b.x0, x1: b.x1, kind: "common", lowerHoles: 0 });
      timeBlobs.add(b);
    }
  }

  const inTime = (h: Head) => times.some((t) => h.x > t.x - 2 && h.x < t.x1 + 2);
  const open = findOpenHeads(region, staff).filter((h) => okY(h) && !inTime(h) && hasLedger(clean, staff, h) && filled.every((f) => Math.abs(f.x - h.x) > space * 0.9 || Math.abs(f.y - h.y) > space * 0.7));

  type Link = { head: Head; stem: Stem; dir: 1 | -1 };
  const links: Link[] = [];
  const bare: Head[] = [];
  for (const head of [...filled, ...open]) {
    const mine: Link[] = [];
    for (const stem of stems) {
      const x = (stem.x0 + stem.x1) / 2;
      if (stem.y1 < head.y - space * 0.75 || stem.y0 > head.y + space * 0.75) continue;
      const reachUp = head.y - stem.y0, reachDown = stem.y1 - head.y;
      const side = (x - head.x) / space;
      if (side > 0.2 && side < 1.0 && reachUp > space * 1.6 && (!head.open || reachDown < space * 1.2)) mine.push({ head, stem, dir: 1 });
      else if (side < -0.2 && side > -1.0 && reachDown > space * 1.6 && (!head.open || reachUp < space * 1.2)) mine.push({ head, stem, dir: -1 });
    }
    for (const dir of [1, -1] as const) {
      const best = mine.filter((l) => l.dir === dir).sort((a, b) => Math.abs(Math.abs((a.stem.x0 + a.stem.x1) / 2 - head.x) - space * 0.6) - Math.abs(Math.abs((b.stem.x0 + b.stem.x1) / 2 - head.x) - space * 0.6))[0];
      if (best) links.push(best);
    }
    if (mine.length === 0) bare.push(head);
  }

  // 채운 머리가 달린 기둥의 반대쪽에서 빔이나 꼬리 사이의 틈을 빈 머리로 본 것은 버린다.
  const filledStems = new Set(links.filter((l) => !l.head.open).map((l) => l.stem));
  for (let i = links.length - 1; i >= 0; i--) if (links[i]!.head.open && filledStems.has(links[i]!.stem)) links.splice(i, 1);

  const beamed = filledStems;
  const notes: NoteMark[] = [];
  for (const stem of stems)
    for (const dir of [1, -1] as const) {
      const group = links.filter((l) => l.stem === stem && l.dir === dir).map((l) => l.head);
      if (group.length === 0) continue;
      const key = group.reduce((a, b) => (dir === 1 ? (a.y < b.y ? a : b) : a.y > b.y ? a : b));
      const isOpen = group.every((h) => h.open);
      let beams = 0, beamLeft = false, beamRight = false;
      if (!isOpen) {
        const neighbor = (side: 1 | -1) => beamed.has(stem) && stems.some((o) => o !== stem && (o.x0 - stem.x0) * side > space * 0.7 && beamed.has(o) && Math.abs(o.x0 - stem.x0) < space * 9 && beamBetween(region, stem, o, dir, space));
        const l = neighbor(-1) || neighbor(1) ? countBeams(region, stem, dir, key.y, -1, space) : 0;
        const r = l > 0 || neighbor(1) ? countBeams(region, stem, dir, key.y, 1, space) : 0;
        [beamLeft, beamRight] = [l > 0, r > 0];
        beams = Math.max(l, r);
        if (beams === 0) beams = countFlags(region, staff, stem, dir, key.y);
      }
      const x = group.reduce((s, h) => s + h.x, 0) / group.length;
      notes.push({ kind: "note", x, y: key.y, dir, open: isOpen, whole: false, beams, beamLeft, beamRight, dots: 0, heads: group, stem });
      used.add(region.labelAt(Math.round((stem.x0 + stem.x1) / 2), Math.round((stem.y0 + stem.y1) / 2)));
    }
  for (const head of bare) {
    // 기둥이 없는 빈 머리는 온음표
    const blob = region.blobs[region.labelAt(Math.round(head.x0 + 1), Math.round(head.y)) - 1];
    if (!blob || blob.y1 - blob.y0 > space * 1.7) continue;
    if (head.y < lines[0]! - space * 3.2 || head.y > lines[4]! + space * 3.2) continue;
    if (head.open && head.x1 - head.x0 > space * 1.3) notes.push({ kind: "note", x: head.x, y: head.y, dir: 0, open: true, whole: true, beams: 0, beamLeft: false, beamRight: false, dots: 0, heads: [{ ...head, whole: true }] });
  }
  for (const n of notes) for (const h of n.heads) used.add(region.labelAt(Math.round(h.x), Math.round(h.y)));
  for (const n of notes) if (n.whole) for (let x = n.heads[0]!.x0 - 2; x <= n.heads[0]!.x1 + 2; x++) used.add(region.labelAt(Math.round(x), Math.round(n.y)));
  used.delete(0);

  const free = loose.filter((b) => !used.has(region.label[b.pixels[0]!]!));

  // 쉼표
  const rests: RestMark[] = [];
  for (const b of free) {
    if (timeBlobs.has(b)) continue;
    const yMid = (b.y0 + b.y1) / 2;
    if (yMid < lines[0]! - space * 4.5 || yMid > lines[4]! + space * 2.9) continue;
    const value = classifyRest(region, b, staff);
    if (value) rests.push({ kind: "rest", x: (b.x0 + b.x1) / 2, y: yMid, value, dots: 0, outside: yMid < lines[0]! - space * 0.9 || yMid > lines[4]! + space * 0.9, box: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 } });
  }

  // 음표나 빔에 닿은 쉼표: 음표를 지우고 남은 조각에서 찾는다.
  const rest = leftover(region, notes, space);
  const pieces: Blob[] = [];
  for (const b of rest.blobs) {
    const yMid = (b.y0 + b.y1) / 2;
    if (yMid < lines[0]! - space * 0.6 || yMid > lines[4]! + space * 0.6) continue;
    if (times.some((t) => b.x0 < t.x1 && b.x1 > t.x) || b.x0 < start) continue;
    // 꼬리의 조각은 기둥 바로 오른쪽에 있다.
    if (notes.some((n) => n.stem && !n.beamLeft && !n.beamRight && n.beams > 0 && b.x0 - n.stem.x1 < space * 0.4 && b.x1 > n.stem.x0 && b.y0 < n.stem.y1 + space * 0.5 && b.y1 > n.stem.y0 - space * 0.5)) continue;
    const value = classifyRest(rest, b, staff);
    if (!value || value <= 2) {
      pieces.push(b);
      continue;
    }
    if (rests.some((o) => o.box.x0 < b.x1 && o.box.x1 > b.x0 && o.box.y0 < b.y1 && o.box.y1 > b.y0)) continue;
    rests.push({ kind: "rest", x: (b.x0 + b.x1) / 2, y: yMid, value, dots: 0, outside: false, doubtful: true, box: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 } });
  }

  // 음표에 겹쳐 조각난 쉼표일 수 있는 것: 합이 모자랄 때만 쓴다.
  const groups: Blob[][] = [];
  for (const b of pieces.sort((p, q) => p.x0 - q.x0)) {
    const w = b.x1 - b.x0, h = b.y1 - b.y0;
    if (b.area < space * space * 0.03 || w > space * 1.6 || h > space * 3.2) continue;
    // 온전히 남은 덩어리(변화표 등)는 쉼표로 읽히지 않은 것이므로 뺀다.
    if (free.some((f) => f.x0 === b.x0 && f.y0 === b.y0 && f.area === b.area)) continue;
    const long = longestColumn(rest, b);
    if (countHoles(rest, b, 3) > 0 || (long.run > space * 1.6 && Math.abs((long.x - b.x0) / w - 0.5) > 0.25)) continue;
    const last = groups.at(-1);
    if (last && b.x0 - Math.max(...last.map((o) => o.x1)) < space * 0.3) last.push(b);
    else groups.push([b]);
  }
  for (const group of groups) {
    const box = { x0: Math.min(...group.map((b) => b.x0)), y0: Math.min(...group.map((b) => b.y0)), x1: Math.max(...group.map((b) => b.x1)), y1: Math.max(...group.map((b) => b.y1)) };
    const w = box.x1 - box.x0, h = box.y1 - box.y0, area = group.reduce((t, b) => t + b.area, 0);
    if (h < space * 0.8 || h > space * 3.4 || w < space * 0.25 || w > space * 1.7 || area < space * space * 0.2) continue;
    if (rests.some((o) => o.box.x0 < box.x1 && o.box.x1 > box.x0 && o.box.y0 < box.y1 && o.box.y1 > box.y0)) continue;
    rests.push({ kind: "rest", x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2, value: 0, dots: 0, outside: false, doubtful: true, box });
  }

  // 점: 머리나 쉼표의 오른쪽
  const restBlobs = new Set(rests.map((r) => r.box.x0 * 10000 + r.box.y0));
  const halfDot = (b: Blob) => bars.some((bar) => Math.abs(b.x1 - (bar.x0 - 1)) <= 1) && b.x1 - b.x0 >= 2 && b.y1 - b.y0 >= space * 0.25 && b.y1 - b.y0 <= space * 0.6 && b.x1 - b.x0 <= space * 0.6;
  const dots = free.filter((b) => (isDot(b, space) || halfDot(b)) && !restBlobs.has(b.x0 * 10000 + b.y0) && !bars.some((bar) => bar.repeat && b.x1 > bar.x0 - space * 1.4 && b.x0 < bar.x1 + space * 1.4));
  for (const d of dots) {
    const x = (d.x0 + d.x1) / 2, y = (d.y0 + d.y1) / 2;
    let best: Mark | undefined, gap = Infinity;
    for (const mark of [...notes, ...rests]) {
      const places = mark.kind === "note" ? mark.heads.map((h) => [h.x1, h.y] as const) : [[mark.box.x1, mark.y] as const];
      for (const [edge, yy] of places) {
        const dx = x - edge, dy = Math.abs(y - yy);
        if (dx < -space * 0.15 || dx > space * 1.5 + (mark.dots ? space * 0.6 : 0)) continue;
        if (dy > (mark.kind === "note" ? space * 0.75 : space * 1.1)) continue;
        const distance = dx + dy * 0.3;
        if (distance < gap) [gap, best] = [distance, mark];
      }
    }
    if (best) best.dots++;
  }
  for (const n of notes) {
    // 화음에는 머리마다 점이 붙는다.
    if (n.heads.length > 1) n.dots = Math.min(n.dots, n.dots >= n.heads.length ? Math.round(n.dots / n.heads.length) : 1);
  }

  // 셋잇단 숫자 후보: 오선 밖의 작은 숫자 모양
  const threes = free
    .filter((b) => tall(b, 0.75, 1.8) && wide(b, 0.35, 1.3) && (b.y1 < lines[0]! + space * 0.5 || b.y0 > lines[4]! - space * 0.5) && looksLikeThree(region, b))
    .map((b) => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }));

  const marks: Mark[] = [...notes, ...rests].sort((a, b) => a.x - b.x);
  return { marks, times, threes, start, heads: [...filled, ...open], region };
}
