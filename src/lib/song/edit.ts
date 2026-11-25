import type { Source } from "./expand.ts";
import { cleanLine } from "./text.ts";
import { meterOf, sameTime } from "./time.ts";
import { BPM_MAX, BPM_MIN, MAX_DIV, type Beat, type Item, type Measure, type Note, type Song, type Time } from "./types.ts";

/** 교정 중인 곡. 항목마다 원본 마디를 기억한다. */
export type Row = { key: number; item: Item; sources: Source[] };
export type Draft = { info: Omit<Song, "items">; rows: Row[]; nextKey: number };

export function draftOf(song: Song, sources: Source[][] = []): Draft {
  const { items, ...info } = song;
  return { info, rows: items.map((item, i) => ({ key: i, item, sources: sources[i] ?? [] })), nextKey: items.length };
}

export function songOf(draft: Draft): Song {
  return { ...draft.info, items: draft.rows.map((r) => r.item) };
}

export type Cell = { kind: "on" | "hold" | "rest"; text: string; unsure: boolean };

export function cellsOf(beat: Beat): Cell[] {
  return beat.notes.flatMap((n) =>
    Array.from({ length: n.len }, (_, i): Cell =>
      n.kind === "rest" ? { kind: "rest", text: "", unsure: false }
      : n.kind === "note" && i === 0 ? { kind: "on", text: n.text, unsure: !!n.unsure }
      : { kind: "hold", text: "", unsure: false },
    ),
  );
}

export function beatOf(cells: Cell[]): Beat {
  const notes: Note[] = [];
  for (const c of cells) {
    const last = notes.at(-1);
    if (c.kind === "on") notes.push({ kind: "note", text: c.text, len: 1, ...(c.unsure ? { unsure: true as const } : {}) });
    else if (c.kind === "hold" && last && last.kind !== "rest") last.len++;
    else if (c.kind === "rest" && last?.kind === "rest") last.len++;
    else notes.push({ kind: c.kind, len: 1 });
  }
  return { div: cells.length, notes };
}

export function emptyMeasure(songTime: Time, time: Time = songTime): Measure {
  const meter = meterOf(time);
  const beats = Array.from({ length: meter.beats }, (): Beat => ({ div: meter.div, notes: [{ kind: "rest", len: meter.div }] }));
  return sameTime(time, songTime) ? { type: "measure", beats } : { type: "measure", time, beats };
}

export type Action =
  | { type: "kind"; row: number; beat: number; cell: number; kind: Cell["kind"] }
  | { type: "text"; row: number; beat: number; cell: number; text: string }
  | { type: "div"; row: number; beat: number; div: number }
  | { type: "time"; row: number; time: Time }
  | { type: "confirm"; row: number }
  | { type: "move"; row: number; by: -1 | 1 }
  | { type: "duplicate"; row: number }
  | { type: "remove"; row: number }
  | { type: "insert"; row: number; what: "measure" | "section" }
  | { type: "section"; row: number; title: string; note: string }
  | { type: "count"; row: number; count: number }
  | { type: "toMeasures"; row: number }
  | { type: "toInstrumental"; row: number }
  | { type: "info"; change: Partial<Pick<Song, "title" | "artist" | "credits" | "copyright" | "bpm">> };

const without = <T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> => {
  const { [key]: _, ...rest } = value;
  return rest;
};

/** 행의 자리. 없으면 -1 */
export const indexOf = (draft: Draft, key: number) => draft.rows.findIndex((r) => r.key === key);

export function apply(draft: Draft, action: Action): Draft {
  if (action.type === "info") {
    const info = { ...draft.info, ...action.change };
    for (const key of ["title", "artist", "credits", "copyright"] as const) info[key] = cleanLine(info[key]);
    if (!Number.isFinite(info.bpm)) info.bpm = draft.info.bpm;
    info.bpm = Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(info.bpm)));
    return { ...draft, info };
  }
  const at = indexOf(draft, action.row);
  const row = draft.rows[at];
  if (!row) return draft;
  const replace = (item: Item): Draft => ({ ...draft, rows: draft.rows.with(at, { ...row, item }) });
  const insert = (index: number, list: { item: Item; sources: Row["sources"] }[], remove = 0): Draft => ({
    ...draft,
    rows: draft.rows.toSpliced(index, remove, ...list.map((r, i) => ({ ...r, key: draft.nextKey + i }))),
    nextKey: draft.nextKey + list.length,
  });
  const { item } = row;

  switch (action.type) {
    case "move": {
      const to = at + action.by;
      if (to < 0 || to >= draft.rows.length) return draft;
      return { ...draft, rows: draft.rows.with(at, draft.rows[to]!).with(to, row) };
    }
    case "duplicate":
      return insert(at + 1, [{ item: structuredClone(item), sources: row.sources }]);
    case "remove":
      return { ...draft, rows: draft.rows.toSpliced(at, 1) };
    case "insert":
      return insert(at + 1, [{ item: action.what === "section" ? { type: "section", title: "새 구간" } : emptyMeasure(draft.info.time), sources: [] }]);
    case "section": {
      if (item.type !== "section") return draft;
      const title = cleanLine(action.title), note = cleanLine(action.note);
      return replace(note ? { type: "section", title, note } : { type: "section", title });
    }
    case "count":
      return item.type === "instrumental" && Number.isFinite(action.count) ? replace({ ...item, count: Math.min(200, Math.max(1, Math.round(action.count))) }) : draft;
    case "toMeasures":
      if (item.type !== "instrumental") return draft;
      return insert(at, Array.from({ length: item.count }, (_, i) => ({ item: emptyMeasure(draft.info.time, item.time ?? draft.info.time), sources: row.sources[i] ? [row.sources[i]] : [] })), 1);
    case "toInstrumental":
      return item.type === "measure" ? replace({ type: "instrumental", label: "연주", count: 1, ...(item.time ? { time: item.time } : {}) }) : draft;
  }
  if (item.type !== "measure") return draft;
  if (action.type === "confirm") {
    const beats = item.beats.map((b) => ({ ...b, notes: b.notes.map((n) => (n.kind === "note" ? (without(n, "unsure") as Note) : n)) }));
    return replace({ ...(without(item, "check") as Measure), beats });
  }
  if (action.type === "time") {
    // 겹치는 박은 그대로 두고 모자라면 쉼표를 넣는다.
    const blank = emptyMeasure(draft.info.time, action.time);
    const beats = blank.beats.map((b, i) => (item.beats[i] && meterOf(action.time).quarters === meterOf(item.time ?? draft.info.time).quarters ? item.beats[i] : b));
    const next = { ...(without(item, "time") as Measure), beats };
    return replace(blank.time ? { ...next, time: blank.time } : next);
  }
  const beat = item.beats[action.beat];
  if (!beat) return draft;
  const cells = cellsOf(beat);
  if (action.type === "div") {
    const div = Math.min(MAX_DIV, Math.max(1, Math.round(action.div)));
    const next = Array.from({ length: div }, (): Cell => ({ kind: "rest", text: "", unsure: false }));
    // 칸의 시작 위치를 비율로 옮긴다.
    for (let i = 0; i < div; i++) {
      const from = Math.floor((i * cells.length) / div + 1e-9);
      next[i] = { ...cells[from]!, ...(cells[from]!.kind === "on" && i > 0 && Math.floor(((i - 1) * cells.length) / div + 1e-9) === from ? { kind: "hold" as const, text: "", unsure: false } : {}) };
    }
    // 사라진 글자는 앞 칸에 붙인다.
    const kept = next.filter((c) => c.kind === "on").map((c) => c.text).join("");
    const all = cells.filter((c) => c.kind === "on").map((c) => c.text).join("");
    if (kept.length < all.length) {
      const first = next.find((c) => c.kind === "on");
      if (first) first.text = all.slice(0, all.length - kept.length + first.text.length);
    }
    return replace({ ...item, beats: item.beats.with(action.beat, beatOf(next)) });
  }
  const cell = cells[action.cell];
  if (!cell) return draft;
  if (action.type === "kind") {
    if (cell.kind === action.kind) return draft;
    cells[action.cell] = action.kind === "on" ? { kind: "on", text: cell.text, unsure: false } : { kind: action.kind, text: "", unsure: false };
    return replace({ ...item, beats: item.beats.with(action.beat, beatOf(cells)) });
  }
  return typeText(draft, at, action.beat, action.cell, cleanLine(action.text));
}

/** 한글을 여러 글자 넣으면 다음 음들에 한 글자씩 채운다. */
function typeText(draft: Draft, at: number, beatIndex: number, cellIndex: number, text: string): Draft {
  const letters = [...text];
  const spread = letters.length > 1 && letters.every((c) => (c >= "가" && c <= "힣") || c === " ") ? letters.filter((c) => c !== " ") : [text];
  const rows = draft.rows.slice();
  let left = spread;
  for (let r = at; r < rows.length && left.length; r++) {
    const row = rows[r]!;
    if (row.item.type !== "measure") continue;
    const beats = row.item.beats.map((beat, b) => {
      if (!left.length || (r === at && b < beatIndex)) return beat;
      const cells = cellsOf(beat);
      let changed = false;
      cells.forEach((c, k) => {
        if (!left.length || (r === at && b === beatIndex && k < cellIndex)) return;
        if (c.kind !== "on" && !(r === at && b === beatIndex && k === cellIndex)) return;
        cells[k] = { kind: "on", text: left[0]!, unsure: false };
        left = left.slice(1);
        changed = true;
      });
      return changed ? beatOf(cells) : beat;
    });
    rows[r] = { ...row, item: { ...row.item, beats } };
  }
  return { ...draft, rows };
}

/** 되돌리기가 있는 편집 상태 */
export type History = { past: Draft[]; now: Draft; future: Draft[] };
export const HISTORY_LIMIT = 200;

export type HistoryAction = Action | { type: "undo" } | { type: "redo" } | { type: "reset"; draft: Draft };

export function historyOf(draft: Draft): History {
  return { past: [], now: draft, future: [] };
}

export function reduce(history: History, action: HistoryAction): History {
  if (action.type === "reset") return historyOf(action.draft);
  if (action.type === "undo") {
    const last = history.past.at(-1);
    return last ? { past: history.past.slice(0, -1), now: last, future: [history.now, ...history.future] } : history;
  }
  if (action.type === "redo") {
    const [next, ...rest] = history.future;
    return next ? { past: [...history.past, history.now], now: next, future: rest } : history;
  }
  const now = apply(history.now, action);
  if (now === history.now || JSON.stringify(now) === JSON.stringify(history.now)) return history;
  return { past: [...history.past, history.now].slice(-HISTORY_LIMIT), now, future: [] };
}

/** 확인이 필요한 행의 키 */
export function rowsToCheck(draft: Draft): number[] {
  return draft.rows.filter(({ item }) => item.type === "measure" && (item.check || item.beats.some((b) => b.notes.some((n) => n.kind === "note" && n.unsure)))).map((r) => r.key);
}
