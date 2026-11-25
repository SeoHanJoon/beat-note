import type { Binary } from "./image.ts";
import type { Staff } from "./staff.ts";

type Point = { x: number; y: number };

/**
 * 두 점 사이에 가는 활 모양의 선이 있는지 본다.
 * 오선과 겹쳐 지워진 자리와 마디선 자리는 세지 않는다.
 */
function arcScore(clean: Binary, staff: Staff, from: Point, to: Point, bend: number, bars: { x0: number; x1: number }[]): number {
  const { width, height, data } = clean;
  const { space, thick, lines } = staff;
  const reach = Math.max(1, Math.round(space * 0.09));
  const steps = Math.max(10, Math.round((to.x - from.x) / (space * 0.16)));
  let hit = 0, seen = 0, middleHit = 0, middleSeen = 0;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const x = Math.round(from.x + (to.x - from.x) * u);
    const y = from.y + (to.y - from.y) * u + bend * 4 * u * (1 - u);
    if (bars.some((b) => x >= b.x0 - 2 && x <= b.x1 + 2)) continue;
    const shift = staff.shift(x);
    if (lines.some((l) => Math.abs(y - l - shift) <= thick / 2 + reach)) continue;
    let black = false;
    for (let d = -reach; d <= reach && !black; d++) {
      const yy = Math.round(y) + d;
      if (yy < 0 || yy >= height || !data[yy * width + x]) continue;
      // 머리나 빔처럼 두꺼우면 활이 아니다.
      let top = yy, bottom = yy;
      while (top > 0 && data[(top - 1) * width + x] && yy - top < space) top--;
      while (bottom < height - 1 && data[(bottom + 1) * width + x] && bottom - yy < space) bottom++;
      if (bottom - top + 1 <= space * 0.45) black = true;
    }
    const middle = u > 0.3 && u < 0.7;
    seen++;
    if (black) hit++;
    if (middle) {
      middleSeen++;
      if (black) middleHit++;
    }
  }
  if (seen < steps * 0.4) return 0;
  return Math.min(hit / seen, middleSeen ? middleHit / middleSeen : hit / seen);
}

const range = (from: number, to: number, step: number) => Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => from + i * step);

/** 나란한 두 음 a, b를 잇는 붙임줄이 있는지 */
export function hasTie(clean: Binary, staff: Staff, a: Point, b: Point, bars: { x0: number; x1: number }[]): boolean {
  const { space } = staff;
  const width = (b.x - a.x) / space;
  if (width < 0.9) return false;
  for (const dir of [-1, 1])
    for (const inset of [0.1, 0.35, 0.6, 0.85])
      for (const outset of [0.1, 0.35, 0.6, 0.85]) {
        if (width - inset - outset < 0.5) continue;
        for (const off of range(0.2, 1.3, 0.1))
          for (const bend of range(0.1, Math.min(1.6, 0.4 + width * 0.25), 0.1)) {
            const from = { x: a.x + inset * space, y: a.y + dir * off * space };
            const to = { x: b.x - outset * space, y: b.y + dir * off * space };
            if (arcScore(clean, staff, from, to, dir * bend * space, bars) >= 0.78) return true;
          }
      }
  return false;
}

/** 줄이 바뀌는 자리의 반쪽 붙임줄. side가 1이면 음에서 오선 끝으로, -1이면 오선 시작에서 음으로 */
export function hasHalfTie(clean: Binary, staff: Staff, note: Point, edge: number, side: 1 | -1): boolean {
  const { space } = staff;
  if (Math.abs(edge - note.x) < space * 1.0) return false;
  for (const dir of [-1, 1])
    for (const inset of [0.2, 0.5, 0.8])
      for (const gap of [0.1, 0.5, 1.0, 1.6, 2.4]) {
        const inner = { x: note.x + side * inset * space, y: 0 }, outer = { x: edge - side * gap * space, y: 0 };
        if ((outer.x - inner.x) * side < space * 0.7) continue;
        for (const off of range(0.3, 1.2, 0.15))
          for (const end of range(0.3, 1.7, 0.2))
            for (const bend of range(0, 1.0, 0.2)) {
              inner.y = note.y + dir * off * space;
              outer.y = note.y + dir * end * space;
              const [from, to] = side === 1 ? [inner, outer] : [outer, inner];
              if (arcScore(clean, staff, from, to, dir * bend * space, []) >= 0.92) return true;
            }
      }
  return false;
}
