// 인식 결과와 정답을 비교한다.
import type { Event, Truth } from "../../scripts/scores/truth.ts";
import type { ReadScore } from "../../src/lib/reader/types.ts";

/** 마디 하나의 박자를 2틱(96분음표) 단위 글자로: o 새 음, h 이어짐, r 쉼 */
export function rhythmOf(events: { kind: Event["kind"]; ticks: number }[]): string {
  let out = "";
  for (const e of events) {
    const n = Math.round(e.ticks / 2);
    out += e.kind === "rest" ? "r".repeat(n) : (e.kind === "on" ? "o" : "h") + "h".repeat(Math.max(0, n - 1));
  }
  return out;
}

export function editDistance(a: string[], b: string[]): number {
  let row = b.map((_, j) => j + 1);
  row.unshift(0);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length]!;
}

function cellsWrong(a: string, b: string): number {
  let wrong = Math.abs(a.length - b.length);
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) wrong++;
  return wrong;
}

/** 마디 수가 다를 때도 비교할 수 있게 순서를 지키며 짝을 짓는다. */
export function alignMeasures(truth: string[], read: string[]): [number | null, number | null][] {
  const n = truth.length, m = read.length;
  const cost = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = n; i >= 0; i--)
    for (let j = m; j >= 0; j--) {
      if (i === n && j === m) continue;
      let best = Infinity;
      if (i < n) best = Math.min(best, cost[i + 1]![j]! + truth[i]!.length);
      if (j < m) best = Math.min(best, cost[i]![j + 1]! + read[j]!.length);
      if (i < n && j < m) best = Math.min(best, cost[i + 1]![j + 1]! + cellsWrong(truth[i]!, read[j]!));
      cost[i]![j] = best;
    }
  const pairs: [number | null, number | null][] = [];
  for (let i = 0, j = 0; i < n || j < m; ) {
    if (i < n && j < m && cost[i]![j] === cost[i + 1]![j + 1]! + cellsWrong(truth[i]!, read[j]!)) pairs.push([i++, j++]);
    else if (i < n && cost[i]![j] === cost[i + 1]![j]! + truth[i]!.length) pairs.push([i++, null]);
    else pairs.push([null, j++]);
  }
  return pairs;
}

export type Report = {
  systems: [read: number, truth: number];
  measures: [read: number, truth: number];
  /** 박자가 모두 맞은 마디의 비율 */
  measureExact: number;
  /** 박자 칸의 비율 */
  cells: number;
  /** 글자 */
  text: number;
  /** 틀렸는데 확인 표시가 없는 마디(1부터) */
  unflagged: number[];
  /** 확인 표시된 마디 수 */
  flagged: number;
  wrong: { measure: number; truth: string; read: string }[];
};

const short = (rhythm: string) => rhythm.replace(/(o)(h*)|(h+)|(r+)/g, (s, o) => `${o ? "o" : s[0]}${s.length * 2} `).trim();

export function compare(truth: Truth, score: ReadScore): Report {
  const t = truth.measures.map((m) => rhythmOf(m.events[0]!));
  const r = score.measures.map((m) => rhythmOf(m.events));
  let exact = 0, cells = 0, total = 0, flagged = 0;
  const wrong: Report["wrong"] = [], unflagged: number[] = [];
  const pairs = alignMeasures(t, r);
  for (const [i, j] of pairs) {
    const a = i === null ? "" : t[i]!, b = j === null ? "" : r[j]!;
    const bad = cellsWrong(a, b);
    total += Math.max(a.length, b.length);
    cells += Math.max(a.length, b.length) - bad;
    if (j !== null && score.measures[j]!.check) flagged++;
    if (bad === 0 && i !== null) exact++;
    else {
      wrong.push({ measure: (i ?? j ?? 0) + 1, truth: short(a), read: short(b) });
      if (j === null || !score.measures[j]!.check) unflagged.push((i ?? j ?? 0) + 1);
    }
  }
  const textOf = (events: Event[]) => events.filter((e) => e.kind === "on").map((e) => e.text ?? "").filter(Boolean);
  let distance = 0, letters = 0;
  for (let verse = 0; verse < 2; verse++) {
    const a = truth.measures.flatMap((m) => (textOf(m.events[verse] ?? [])));
    const b = score.measures.flatMap((m) => (m.lyrics[verse] ?? []).map((s) => s.text).filter(Boolean));
    distance += editDistance(a, b);
    letters += a.length;
  }
  return {
    systems: [new Set(score.measures.map((m) => `${m.page}/${m.system}`)).size, truth.systems],
    measures: [score.measures.length, truth.measures.length],
    measureExact: exact / Math.max(1, t.length),
    cells: cells / Math.max(1, total),
    text: letters ? Math.max(0, 1 - distance / letters) : 1,
    unflagged, flagged, wrong,
  };
}
