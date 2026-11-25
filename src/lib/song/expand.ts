import { QUARTER, type ReadMeasure, type ReadScore } from "../reader/types.ts";
import { normalizeSong } from "./text.ts";
import { meterOf, sameTime } from "./time.ts";
import type { Beat, Item, Measure, Note, Song, Time } from "./types.ts";

/** 부르는 순서의 [마디 번호, 몇 번째로 부르는지(0부터)] */
export function playOrder(measures: Pick<ReadMeasure, "left" | "right" | "ending">[]): [number, number][] {
  const order: [number, number][] = [];
  let start = 0, pass = 1, inEnding = false;
  const limit = measures.length * 8 + 8;
  for (let i = 0; i < measures.length && order.length < limit; ) {
    const m = measures[i]!;
    if (m.left === "rptstart" && i !== start) [start, pass, inEnding] = [i, 1, false];
    // 괄호를 지나 반복이 끝난 뒤의 마디는 새로 시작한다.
    if (!m.ending && inEnding) [start, pass, inEnding] = [i, 1, false];
    if (m.ending && Number(m.ending) !== pass) {
      i++;
      continue;
    }
    if (m.ending) inEnding = true;
    order.push([i, pass - 1]);
    if (m.right === "rptend") {
      const block = measures.slice(start);
      const next = block.findIndex((x, k) => k > 0 && x.left === "rptstart");
      const endings = (next < 0 ? block : block.slice(0, next)).flatMap((x) => (x.ending ? [Number(x.ending)] : []));
      const times = Math.max(2, ...endings.filter((n) => n <= 9));
      if (pass < times) {
        pass++;
        i = start;
        inEnding = false;
        continue;
      }
      [start, pass, inEnding] = [i + 1, 1, false];
    }
    i++;
  }
  return order;
}

type Piece = { kind: "on" | "hold" | "rest"; ticks: number; text: string; unsure: boolean };

/** 부르는 차례에 맞는 가사를 음에 붙인다. */
function piecesOf(m: ReadMeasure, pass: number): { pieces: Piece[]; sung: boolean } {
  const has = (v: ReadMeasure["lyrics"][number] | undefined) => !!v?.some((c) => c.text || c.unsure);
  const line = has(m.lyrics[pass]) ? m.lyrics[pass] : m.lyrics.find(has);
  const other = m.lyrics.filter((v) => v !== line && has(v));
  let at = 0;
  const pieces: Piece[] = [];
  for (const e of m.events) {
    if (e.kind !== "on") {
      pieces.push({ kind: e.kind, ticks: e.ticks, text: "", unsure: false });
      continue;
    }
    const cell = line?.[at], elsewhere = other.some((v) => v[at]?.text);
    at++;
    const before = pieces.at(-1);
    // 다른 절에만 글자가 있는 음은 이 절에서 앞 글자를 이어 부른다.
    if (line && !cell?.text && !cell?.unsure && elsewhere && before && before.kind !== "rest") pieces.push({ kind: "hold", ticks: e.ticks, text: "", unsure: false });
    else pieces.push({ kind: "on", ticks: e.ticks, text: cell?.text ?? "", unsure: !!cell?.unsure });
  }
  return { pieces, sung: !!line };
}

/** 소리 길이를 박과 칸으로 나눈다. 나눌 수 없으면 가까운 칸에 맞추고 exact가 false */
export function toBeats(pieces: Piece[], time: Time): { beats: Beat[]; exact: boolean } {
  const meter = meterOf(time);
  const beatTicks = meter.quarters * QUARTER;
  const total = meter.beats * beatTicks;
  let exact = true;
  const cut: { beat: number; kind: Piece["kind"]; text: string; unsure: boolean; from: number; to: number }[] = [];
  let at = 0;
  const add = (p: Piece) => {
    let first = true;
    for (let left = Math.min(p.ticks, total - at); left > 1e-6; ) {
      const beat = Math.floor(at / beatTicks + 1e-9);
      const from = at - beat * beatTicks;
      const take = Math.min(left, beatTicks - from);
      cut.push({ beat, kind: first || p.kind !== "on" ? p.kind : "hold", text: first ? p.text : "", unsure: first && p.unsure, from, to: from + take });
      first = false;
      at += take;
      left -= take;
    }
  };
  for (const p of pieces) {
    if (at + p.ticks > total + 1e-6) exact = false;
    add(p);
  }
  if (at < total - 1e-6) {
    exact = false;
    add({ kind: "rest", ticks: total - at, text: "", unsure: false });
  }
  const beats = Array.from({ length: meter.beats }, (_, b): Beat => {
    const mine = cut.filter((c) => c.beat === b);
    const fits = (div: number) => mine.every((c) => [c.from, c.to].every((t) => Math.abs((t * div) / beatTicks - Math.round((t * div) / beatTicks)) < 1e-6));
    const div = [meter.div, 3, 6, 8, 5, 7].find(fits);
    if (!div) exact = false;
    const d = div ?? 8;
    const notes: Note[] = [];
    for (const c of mine) {
      const len = Math.round((c.to * d) / beatTicks) - Math.round((c.from * d) / beatTicks);
      if (len <= 0) continue;
      const last = notes.at(-1);
      if (c.kind === "on") notes.push({ kind: "note", text: c.text, len, ...(c.unsure ? { unsure: true as const } : {}) });
      else if (c.kind === "rest" && last?.kind === "rest") last.len += len;
      else if (c.kind === "hold" && last && last.kind !== "rest") last.len += len;
      else notes.push({ kind: c.kind, len });
    }
    const sum = notes.reduce((s, n) => s + n.len, 0);
    if (sum < d) notes.push({ kind: "rest", len: d - sum });
    return { div: d, notes };
  });
  return { beats, exact };
}

/** 펼친 곡의 항목이 원본의 어느 마디에서 왔는지 */
export type Source = { measure: number; pass: number };

export type Expanded = { song: Song; /** 항목마다 원본 마디들 */ sources: Source[][] };

/** 악보에 적힌 순서를 부르는 순서로 펼치고 곡 데이터로 바꾼다. */
export function expandScore(score: ReadScore, info: { id: string; bpm?: number }): Expanded {
  const items: Item[] = [];
  const sources: Source[][] = [];
  const push = (item: Item, source: Source[]) => {
    items.push(item);
    sources.push(source);
  };
  let sounding = false, sections = 0, previous: [number, number] | undefined;
  const order = playOrder(score.measures);
  const lastSung = order.findLastIndex(([i, pass]) => piecesOf(score.measures[i]!, pass).sung);
  order.forEach(([i, pass], at) => {
    const m = score.measures[i]!;
    const before = previous && score.measures[previous[0]];
    const jumped = previous && i !== previous[0] + 1;
    const boundary = at === 0 || jumped || m.left === "rptstart" || before?.right === "dbl" || before?.right === "end" || before?.right === "rptend";
    const { pieces, sung } = piecesOf(m, pass);
    const time = sameTime(m.time, score.time) ? undefined : m.time;

    // 앞 마디에서 이어 부르는 부분만 남기고 나머지는 쉰다.
    let held = 0;
    if (!sung && sounding) while (pieces[held]?.kind === "hold") held++;
    if (!sung && held > 0) for (let k = held; k < pieces.length; k++) pieces[k] = { ...pieces[k]!, kind: "rest" };
    if (!sung && held === 0) {
      const label = at < (order.findIndex(([x, p]) => piecesOf(score.measures[x]!, p).sung) + order.length) % order.length ? "전주" : at > lastSung ? "후주" : "간주";
      const last = items.at(-1);
      if (last?.type === "instrumental" && !boundary && (last.time ? time && sameTime(last.time, time) : !time)) {
        last.count++;
        sources.at(-1)!.push({ measure: i, pass });
      } else {
        const title = items.findLast((x) => x.type === "section");
        if (title?.type !== "section" || title.title !== label || items.at(-1)?.type !== "instrumental") push({ type: "section", title: label }, []);
        push({ type: "instrumental", label: "연주", count: 1, ...(time ? { time } : {}) }, [{ measure: i, pass }]);
      }
      sounding = false;
    } else {
      const { beats, exact } = toBeats(pieces, m.time);
      const firstSound = pieces.findIndex((p) => p.kind !== "rest");
      const pickup = sung && firstSound > 0 && !sounding && pieces.slice(0, firstSound).reduce((s, p) => s + p.ticks, 0) >= QUARTER * 2 && (items.length === 0 || items.at(-1)?.type === "instrumental");
      if (sung && (boundary || items.at(-1)?.type === "instrumental") && !pickup && !(items.at(-1)?.type === "measure" && (items.at(-1) as Measure).pickup && items.length > 0 && !jumped && sections === 0 && at > 0 && !boundary))
        push({ type: "section", title: `구간 ${++sections}` }, []);
      const reasons = [m.check, exact ? undefined : "마디 길이를 맞추려고 자르거나 쉼표를 넣음"].filter(Boolean);
      const measure: Measure = { type: "measure", beats };
      if (time) measure.time = time;
      if (pickup) measure.pickup = true;
      if (reasons.length) measure.check = reasons.join(", ");
      push(measure, [{ measure: i, pass }]);
      const last = pieces.at(-1);
      sounding = !!last && last.kind !== "rest";
    }
    previous = [i, pass];
  });
  const [credits, artist] = splitCredits(score.credits);
  const song: Song = {
    id: info.id,
    title: score.title || "제목 없음",
    artist, credits,
    copyright: score.copyright,
    bpm: info.bpm ?? score.bpm ?? 80,
    time: score.time,
    items,
  };
  return { song: normalizeSong(song), sources };
}

/** "○○ 노래"는 가수로, 나머지는 작가로 나눈다. */
function splitCredits(text: string): [string, string] {
  const artist: string[] = [], credits: string[] = [];
  for (const part of text.split(" / ").map((s) => s.trim()).filter(Boolean)) {
    const m = /^(.+?)\s*(?:노래|Vocal)$/i.exec(part) ?? /^(?:노래|가수|Vocal|Artist)\s*[:：]?\s*(.+)$/i.exec(part);
    if (m) artist.push(m[1]!.trim());
    else credits.push(part);
  }
  return [credits.join(", "), artist.join(", ")];
}
