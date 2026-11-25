import { findBlobs, type Binary } from "./image.ts";
import type { Sheet, Staff } from "./staff.ts";

/** 마디선 묶음 하나(겹줄, 도돌이표는 한 묶음) */
export type Barline = { x0: number; x1: number; kind: "single" | "double" | "end"; dotsLeft: boolean; dotsRight: boolean };

/** 마디 하나의 가로 범위 */
export type MeasureSpan = {
  x0: number;
  x1: number;
  left?: "rptstart";
  right?: "rptend" | "dbl" | "end";
  /** 괄호가 이 마디에서 시작함 */
  bracket?: true;
};

/** 세로 줄 하나 */
type Stroke = { x0: number; x1: number };

function findStrokes(image: Binary, clean: Binary, staff: Staff): Stroke[] {
  const { width, height, data } = image;
  const { space, lines } = staff;
  const strokes: Stroke[] = [];
  let open: Stroke | undefined;
  for (let x = Math.max(0, Math.round(staff.x0 - space)); x <= Math.min(width - 1, staff.x1 + space); x++) {
    const shift = staff.shift(x);
    const top = Math.round(lines[0]! + shift), bottom = Math.round(lines[4]! + shift);
    let black = 0;
    for (let y = top; y <= bottom; y++) if (y >= 0 && y < height && data[y * width + x]) black++;
    if (black / (bottom - top + 1) >= 0.94) {
      if (open) open.x1 = x;
      else open = { x0: x, x1: x };
    } else if (open) {
      strokes.push(open);
      open = undefined;
    }
  }
  if (open) strokes.push(open);

  return strokes.filter((s) => {
    if (s.x1 - s.x0 + 1 > space * 1.2) return false;
    // 줄 밖으로 길게 나가면 음표 기둥
    const shift = staff.shift(s.x0);
    const beyond = (from: number, dir: number) => {
      let n = 0;
      for (let y = Math.round(from + shift) + dir; y >= 0 && y < height && n < space * 2; y += dir, n++) {
        let any = false;
        for (let x = s.x0; x <= s.x1; x++) if (data[y * width + x]) any = true;
        if (!any) break;
      }
      return n;
    };
    if (beyond(lines[0]!, -1) > space * 0.6 || beyond(lines[4]!, 1) > space * 0.6) return false;
    // 오선의 오른쪽 끝에 있는 줄은 무엇이 닿아 있어도 마디선
    if (staff.x1 - s.x1 < space * 0.4) return true;
    // 음표 머리나 빔이 붙어 있으면 기둥
    for (const x of [s.x0 - 2, s.x1 + 2]) {
      if (x < 0 || x >= width) continue;
      let run = 0;
      for (let y = Math.round(lines[0]! + shift - space * 0.8); y <= Math.round(lines[4]! + shift + space * 0.8); y++) {
        run = y >= 0 && y < height && clean.data[y * width + x] ? run + 1 : 0;
        // 머리와 빔은 기둥의 끝에 붙는다. 가운데에 닿은 것은 쉼표나 꼬리일 수 있어 더 크게 닿아야 한다.
        const middle = y - run > lines[0]! + shift + space * 0.6 && y < lines[4]! + shift - space * 0.6;
        if (run > space * (middle ? 0.6 : 0.36)) return false;
      }
    }
    return true;
  });
}

/** 가운데 두 칸에 점이 하나씩 있는지 */
function hasDots(clean: Binary, staff: Staff, x0: number, x1: number): boolean {
  const { space, lines } = staff;
  const shift = staff.shift((x0 + x1) / 2);
  const spot = (y: number) =>
    findBlobs(clean, { x0, x1, y0: y - space * 0.5, y1: y + space * 0.5 }).some((b) => {
      const w = b.x1 - b.x0, h = b.y1 - b.y0;
      return w > space * 0.2 && h > space * 0.2 && w < space * 0.75 && h < space * 0.75 && b.area > w * h * 0.55;
    });
  return spot((lines[1]! + lines[2]!) / 2 + shift) && spot((lines[2]! + lines[3]!) / 2 + shift);
}

export function findBarlines(sheet: Sheet, clean: Binary, staff: Staff): Barline[] {
  const { space } = staff;
  const groups: Stroke[][] = [];
  for (const stroke of findStrokes(sheet.image, clean, staff)) {
    const last = groups.at(-1)?.at(-1);
    if (last && stroke.x0 - last.x1 < space * 0.9) groups.at(-1)!.push(stroke);
    else groups.push([stroke]);
  }
  return groups.map((group) => {
    const wide = group.filter((s) => s.x1 - s.x0 + 1 > Math.max(space * 0.3, staff.thick * 2.2));
    const x0 = group[0]!.x0, x1 = group.at(-1)!.x1;
    const reach = space * 1.3;
    return {
      x0, x1,
      kind: wide.length ? "end" : group.length > 1 ? "double" : "single",
      dotsLeft: hasDots(clean, staff, x0 - reach, x0 - 1),
      dotsRight: hasDots(clean, staff, x1 + 2, x1 + reach),
    };
  });
}

/** 오선 위의 1·2번 괄호가 시작하는 x */
export function findBrackets(sheet: Sheet, staff: Staff, ceiling: number): number[] {
  const { image } = sheet;
  const { width, data } = image;
  const { space } = staff;
  const found: number[] = [];
  const y0 = Math.max(0, Math.round(Math.max(ceiling, staff.lines[0]! - space * 9))), y1 = Math.round(staff.lines[0]! - space * 0.8);
  for (let y = y0; y < y1; y++) {
    for (let x = Math.max(0, staff.x0 - Math.round(space * 2)); x < staff.x1; x++) {
      if (!data[y * width + x] || data[y * width + x - 1]) continue;
      // 가로로 곧게 이어진 얇은 줄(작은 끊김 허용)
      let end = x, miss = 0;
      while (end < width - 1 && miss <= 2) {
        end++;
        if (data[y * width + end] || data[(y + 1) * width + end] || data[(y - 1) * width + end]) miss = 0;
        else miss++;
      }
      const length = end - x;
      if (length < space * 4) continue;
      // 두꺼우면 빔
      let thin = 0, total = 0;
      for (let k = x + 2; k < end - 3; k += 3) {
        let n = 0;
        for (let d = -Math.round(space * 0.6); d <= space * 0.6; d++) if (data[(y + d) * width + k]) n++;
        total++;
        if (n <= Math.max(3, sheet.thick * 2 + 1)) thin++;
      }
      if (total === 0 || thin / total < 0.85) continue;
      // 왼쪽 끝에서 아래로 내려오는 짧은 줄
      let down = 0;
      for (let d = 1; d < space * 3; d++) {
        if ([-1, 0, 1, 2].some((e) => data[(y + d) * width + x + e])) down++;
        else break;
      }
      if (down < space * 0.7) continue;
      if (!found.some((f) => Math.abs(f - x) < space * 2)) found.push(x);
    }
  }
  return found.sort((a, b) => a - b);
}

/** 마디선으로 마디의 가로 범위를 나눈다. */
export function splitMeasures(sheet: Sheet, clean: Binary, staff: Staff, ceiling: number): MeasureSpan[] {
  const { space } = staff;
  const bars = findBarlines(sheet, clean, staff);
  const spans: MeasureSpan[] = [];
  let from = staff.x0, left: Barline | undefined;
  for (const bar of bars) {
    const startsRepeat = bar.dotsRight && bar.kind === "end";
    const endsRepeat = bar.dotsLeft && bar.kind === "end";
    // 줄 맨 앞의 세로줄, 음자리표와 조표 뒤의 도돌이표는 마디를 끝내지 않는다.
    const opening = bar.x0 - staff.x0 < space * 1.5 || (spans.length === 0 && !left && startsRepeat && !endsRepeat && bar.x0 - staff.x0 < space * 12);
    if (!opening) {
      const right = endsRepeat ? "rptend" : bar.kind === "end" && !startsRepeat ? "end" : bar.kind === "double" ? "dbl" : undefined;
      spans.push({
        x0: from, x1: bar.x0,
        ...(left?.dotsRight && left.kind === "end" ? { left: "rptstart" as const } : {}),
        ...(right ? { right } : {}),
      });
    }
    from = bar.x1 + 1;
    left = bar;
  }
  for (const x of findBrackets(sheet, staff, ceiling)) {
    const at = spans.reduce((best, s, i) => (Math.abs(s.x0 - x) < Math.abs(spans[best]!.x0 - x) ? i : best), 0);
    if (spans[at] && Math.abs(spans[at].x0 - x) < space * (at === 0 ? 14 : 4)) spans[at].bracket = true;
  }
  return spans;
}
