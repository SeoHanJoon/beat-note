import type { Time } from "../song/types.ts";
import type { Mark, NoteMark, TimeMark } from "./symbols.ts";
import { QUARTER } from "./types.ts";

export function timeTicks(time: Time): number {
  return (time.beats * QUARTER * 4) / time.unit;
}

/** 그려진 그대로의 길이 */
export function drawnTicks(mark: Mark, measure: number): number {
  if (mark.kind === "rest") {
    if (mark.value === 0) return 0;
    if (mark.value === 1 && mark.dots === 0) return Math.min(measure, QUARTER * 4);
    return dotted((QUARTER * 4) / mark.value, mark.dots);
  }
  if (mark.whole) return dotted(QUARTER * 4, mark.dots);
  if (mark.open) return dotted(QUARTER * 2, mark.dots);
  return dotted(QUARTER / 2 ** mark.beams, mark.dots);
}

const dotted = (ticks: number, dots: number) => (dots === 0 ? ticks : dots === 1 ? ticks * 1.5 : ticks * 1.75);

type Choice = { ticks: number; cost: number; drop?: true };

/** 잘못 읽었을 수 있는 다른 길이와 그 벌점 */
function choices(mark: Mark, measure: number, loose: boolean): Choice[] {
  if (mark.kind === "rest" && mark.value === 0)
    return [{ ticks: 0, cost: 0, drop: true }, { ticks: 24, cost: 0.8 }, { ticks: 12, cost: 0.85 }, { ticks: 48, cost: 1 }];
  const list: Choice[] = [{ ticks: drawnTicks(mark, measure), cost: 0 }];
  const add = (change: Partial<NoteMark> & Partial<{ value: number; dots: number }>, cost: number) =>
    list.push({ ticks: drawnTicks({ ...mark, ...change } as Mark, measure), cost });
  add({ dots: mark.dots === 0 ? 1 : mark.dots - 1 }, mark.dots === 0 ? 1 : 1.1);
  if (mark.kind === "note") {
    if (!mark.open) {
      if (mark.beams > 0) add({ beams: mark.beams - 1 }, 1.2);
      add({ beams: mark.beams + 1 }, 1.2);
    }
  } else {
    const other: Record<number, [number, number][]> = { 1: [[2, 0.8]], 2: [[1, 0.8]], 4: [[16, 1.2], [8, 1.3]], 8: [[16, 1], [4, 1.3]], 16: [[8, 1], [4, 1.2]], 32: [[16, 1]] };
    for (const [value, cost] of other[mark.value] ?? []) add({ value }, cost);
    list.push({ ticks: 0, cost: mark.doubtful ? 0.1 : mark.outside || loose ? 0.3 : 1.6, drop: true });
  }
  return list;
}

export type Solved = { events: { mark: Mark; ticks: number }[]; cost: number; exact: boolean };

type Tuplet = { from: number; to: number; cost: number };

/** 셋잇단음표로 볼 수 있는 구간 */
function tuplets(marks: Mark[], measure: number, threes: { x: number; y: number }[]): Tuplet[] {
  const list: Tuplet[] = [];
  for (let from = 0; from < marks.length; from++) {
    let sum = 0;
    for (let to = from; to < marks.length && to < from + 6; to++) {
      sum += drawnTicks(marks[to]!, measure);
      const unit = sum / 3;
      if (marks.slice(from, to + 1).some((m) => m.kind === "rest" && m.value === 0)) break;
      if (to === from || ![12, 24, 48].includes(unit)) continue;
      if (marks.slice(from, to + 1).some((m) => drawnTicks(m, measure) > unit * 2 || drawnTicks(m, measure) < unit / 2)) continue;
      const a = marks[from]!.x, b = marks[to]!.x;
      const marked = threes.some((t) => Math.abs(t.x - (a + b) / 2) < Math.max(12, (b - a) * 0.3));
      const first = marks[from]!, last = marks[to]!;
      // 빔 하나로 묶인 세 음이면 더 그럴듯하다.
      const beamed = first.kind === "note" && last.kind === "note" && !first.beamLeft && first.beamRight && last.beamLeft && !last.beamRight;
      list.push({ from, to, cost: marked ? (beamed || unit >= 48 ? 0 : 0.5) : beamed ? 1.4 : 2.5 });
    }
  }
  return list;
}

function solveFixed(marks: Mark[], target: number, loose: boolean, scale: number[]): Solved | undefined {
  type State = { cost: number; picks: Choice[] };
  let states = new Map<number, State>([[0, { cost: 0, picks: [] }]]);
  marks.forEach((mark, i) => {
    const next = new Map<number, State>();
    for (const [total, state] of states)
      for (const choice of choices(mark, target, loose)) {
        if (scale[i] !== 1 && choice.cost > 0) continue;
        const ticks = total + choice.ticks * scale[i]!;
        if (ticks > target + 1e-6) continue;
        const cost = state.cost + choice.cost;
        if (cost > 6) continue;
        const key = Math.round(ticks);
        const old = next.get(key);
        if (!old || cost < old.cost) next.set(key, { cost, picks: [...state.picks, { ...choice, ticks: choice.ticks * scale[i]! }] });
      }
    states = next;
  });
  const best = states.get(Math.round(target));
  if (!best) return undefined;
  const events = marks.flatMap((mark, i) => (best.picks[i]!.drop ? [] : [{ mark, ticks: best.picks[i]!.ticks }]));
  return { events, cost: best.cost, exact: true };
}

/** 합이 마디 길이가 되도록 가장 그럴듯한 길이를 고른다. */
export function solveMeasure(marks: Mark[], target: number, threes: { x: number; y: number }[], loose = false): Solved {
  const ones = marks.map(() => 1);
  let best = solveFixed(marks, target, loose, ones);
  // 온쉼표 하나는 어떤 박자표에서든 한 마디를 쉰다.
  if (marks.length === 1 && marks[0]!.kind === "rest" && marks[0]!.value <= 2) return { events: [{ mark: marks[0]!, ticks: target }], cost: 0, exact: true };
  const raw = marks.reduce((s, m) => s + drawnTicks(m, target), 0);
  const list = tuplets(marks, target, threes).filter((t) => t.cost < 1 || raw > target);
  const tryWith = (picked: Tuplet[]) => {
    const scale = ones.slice();
    for (const t of picked) for (let i = t.from; i <= t.to; i++) scale[i] = 2 / 3;
    const result = solveFixed(marks, target, loose, scale);
    if (!result) return;
    result.cost += picked.reduce((s, t) => s + t.cost, 0);
    if (!best || result.cost < best.cost) best = result;
  };
  if (!best || best.cost > 0)
    for (let i = 0; i < list.length; i++) {
      tryWith([list[i]!]);
      for (let j = i + 1; j < list.length; j++)
        if (list[j]!.from > list[i]!.to) {
          tryWith([list[i]!, list[j]!]);
          for (let k = j + 1; k < list.length; k++) if (list[k]!.from > list[j]!.to) tryWith([list[i]!, list[j]!, list[k]!]);
        }
    }
  return best ?? { events: marks.map((mark) => ({ mark, ticks: drawnTicks(mark, target) })), cost: 99, exact: false };
}

export type Voice = { name: "all" | "low" | "high"; marks: Mark[]; loose: boolean };

/** 성부가 하나일 때와 둘일 때(기둥 방향으로 나눔)의 후보 */
export function voicesOf(marks: Mark[], middle: number): Voice[] {
  const inside = marks.filter((m) => m.kind === "note" || !m.outside);
  const list: Voice[] = [{ name: "all", marks: inside, loose: false }];
  const notes = marks.filter((m): m is NoteMark => m.kind === "note");
  const up = notes.some((n) => n.dir === 1), down = notes.some((n) => n.dir === -1);
  const outside = marks.some((m) => m.kind === "rest" && m.outside);
  if ((up && down) || outside) {
    const side = (dir: 1 | -1) =>
      marks.filter((m) => (m.kind === "note" ? m.dir !== -dir : dir === 1 ? m.y < middle + 4 || !m.outside : m.y > middle - 4 || !m.outside));
    if (notes.some((n) => n.dir !== 1)) list.push({ name: "low", marks: side(-1), loose: true });
    if (notes.some((n) => n.dir !== -1)) list.push({ name: "high", marks: side(1), loose: true });
  }
  return list;
}

const CANDIDATES: Time[] = [
  { beats: 4, unit: 4 }, { beats: 3, unit: 4 }, { beats: 2, unit: 4 }, { beats: 6, unit: 8 }, { beats: 12, unit: 8 },
  { beats: 9, unit: 8 }, { beats: 5, unit: 4 }, { beats: 3, unit: 8 }, { beats: 7, unit: 8 }, { beats: 6, unit: 4 },
];

/** 박자표 하나가 다스리는 마디들에서 박자표를 추정한다. */
export function estimateTime(measures: { marks: Mark[]; threes: { x: number; y: number }[]; middle: number }[], sign: TimeMark | undefined): Time {
  const options = CANDIDATES.filter((t) => {
    if (sign?.kind === "common") return t.unit === 4 && t.beats === 4;
    if (sign?.kind === "digits") return sign.lowerHoles >= 2 ? t.unit === 8 : t.unit === 4;
    return t.beats !== 5 && t.beats !== 7 && t.beats !== 9;
  });
  const beamsOfThree = measures.reduce((sum, m) => sum + beamGroups(m.marks).filter((n) => n === 3).length, 0);
  const beamsOfTwo = measures.reduce((sum, m) => sum + beamGroups(m.marks).filter((n) => n === 2 || n === 4).length, 0);
  let best = options[0]!, top = -Infinity;
  for (const time of options) {
    const target = timeTicks(time);
    let score = 0;
    for (const m of measures) {
      if (m.marks.length === 0) continue;
      const cost = Math.min(...voicesOf(m.marks, m.middle).map((v) => solveMeasure(v.marks, target, m.threes, v.loose).cost + (v.name === "all" ? 0 : 0.2)));
      score += cost === 0 ? 3 : cost < 0.5 ? 2 : cost < 99 ? Math.max(0, 1 - cost) : -1;
    }
    // 3/4와 6/8처럼 길이가 같으면 빔 묶음으로 가른다.
    if (time.unit === 8 && beamsOfThree <= beamsOfTwo && !sign) score -= 0.5;
    if (time.unit === 4 && time.beats === 3 && beamsOfThree > beamsOfTwo && !sign) score -= 0.5;
    score -= CANDIDATES.indexOf(time) * 0.01;
    if (score > top) [top, best] = [score, time];
  }
  return best;
}

function beamGroups(marks: Mark[]): number[] {
  const sizes: number[] = [];
  let size = 0;
  for (const m of marks) {
    if (m.kind !== "note") continue;
    if (m.beamLeft && size) size++;
    else size = m.beamRight ? 1 : 0;
    if (m.beamLeft && !m.beamRight && size) {
      sizes.push(size);
      size = 0;
    }
  }
  return sizes;
}
