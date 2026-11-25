import type { Time } from "../song/types.ts";
import { alignSyllables, dashesOf, findRows, readRow } from "./lyrics.ts";
import { isHangul, type Ocr } from "./ocr.ts";
import { findBarlines, splitMeasures, type MeasureSpan } from "./bars.ts";
import type { Binary } from "./image.ts";
import { estimateTime, solveMeasure, timeTicks, voicesOf, type Solved, type Voice } from "./rhythm.ts";
import { readSheet, removeStaffLines, type Sheet, type Staff } from "./staff.ts";
import { readSymbols, type Mark, type NoteMark, type TimeMark } from "./symbols.ts";
import { hasHalfTie, hasTie } from "./ties.ts";
import { emptyScore, type Gray, type ReadEvent, type ReadMeasure, type ReadScore, type Syllable } from "./types.ts";

export type System = { page: number; sheet: Sheet; clean: Binary; staff: Staff; spans: MeasureSpan[]; top: number; bottom: number;
  bars?: { x0: number; x1: number }[];
  /** 음자리표가 끝나는 x */
  start?: number;
};

/** 쪽 이미지에서 오선과 마디를 찾는다. */
export function findSystems(pages: Gray[]): System[] {
  return pages.flatMap((gray, page) => {
    const sheet = readSheet(gray);
    if (!sheet) return [];
    const clean = removeStaffLines(sheet.image, sheet.staves);
    return sheet.staves.map((staff, i): System => {
      const before = sheet.staves[i - 1], after = sheet.staves[i + 1];
      const ceiling = before ? before.lines[4]! + before.space * 2 : 0;
      return {
        page, sheet, clean, staff,
        spans: splitMeasures(sheet, clean, staff, ceiling),
        top: before ? (before.lines[4]! + staff.lines[0]!) / 2 : Math.max(0, staff.lines[0]! - staff.space * 8),
        bottom: after ? after.lines[0]! - after.space * 3 : Math.min(gray.height, staff.lines[4]! + staff.space * 11),
      };
    });
  });
}

/** 도돌이표와 괄호로 몇 번째 부를 때의 마디인지 정한다. 1번 괄호는 괄호 줄이 짧아도 도돌이표까지다. */
export function numberEndings(measures: (Pick<MeasureSpan, "right" | "bracket" | "left"> & { ending?: string })[]): void {
  let ending = 0, inside = false;
  measures.forEach((m, i) => {
    const afterRepeat = measures[i - 1]?.right === "rptend";
    if (m.left === "rptstart") [ending, inside] = [0, false];
    if (m.bracket) {
      ending = afterRepeat && ending > 0 ? ending + 1 : 1;
      inside = true;
    } else if (afterRepeat) [ending, inside] = [0, false];
    // 도돌이표로 끝나지 않는 마지막 괄호는 첫 마디에만 표시한다.
    const repeats = measures.slice(i).find((x, k) => x.right === "rptend" || (k > 0 && (x.bracket || x.left)))?.right === "rptend";
    if (inside && (m.bracket || repeats)) m.ending = String(ending);
    if (m.right === "rptend") inside = false;
    else if (!repeats) inside = false;
  });
}

/** 읽는 중인 마디 */
type Draft = MeasureSpan & {
  system: System;
  index: number;
  ending?: string;
  marks: Mark[];
  threes: { x: number; y: number }[];
  middle: number;
  sign?: TimeMark;
  time: Time;
  solved: Solved;
  voice: Voice["name"];
  /** 음표마다 앞 음에서 붙임줄로 이어지는지 */
  tied: boolean[];
  /** 아래에 끄는 표시가 있는 음 */
  dashed?: Set<number>;
};

/** 음표 아래에 글자 같은 잉크가 있는지 */
function inkBelow(system: System, x: number): boolean {
  const { image } = system.sheet;
  const { space, lines } = system.staff;
  const y0 = Math.round(lines[4]! + space * 2.6), y1 = Math.min(image.height, Math.round(Math.min(system.bottom, lines[4]! + space * 7)));
  let rows = 0;
  for (let y = y0; y < y1; y++) {
    let any = false;
    for (let dx = -Math.round(space * 0.6); dx <= space * 0.6 && !any; dx++) any = image.data[y * image.width + Math.round(x) + dx] === 1;
    if (any) rows++;
  }
  return rows > space * 0.6;
}

const pitchOf = (mark: NoteMark, staff: Staff) => (mark.y - staff.lines[0]! - staff.shift(mark.x)) / staff.space;

export type ReadOptions = { ocr?: Ocr; onProgress?: (done: number, total: number) => void };

/** 쪽 이미지들에서 악보를 읽는다. */
export async function readScore(pages: Gray[], { ocr, onProgress }: ReadOptions = {}): Promise<ReadScore> {
  const systems = findSystems(pages);
  const drafts: Draft[] = [];
  systems.forEach((system, index) => {
    const { staff } = system;
    const bars = findBarlines(system.sheet, system.clean, staff).map((b) => ({ x0: b.x0, x1: b.x1, repeat: b.kind === "end" && (b.dotsLeft || b.dotsRight) }));
    const found = readSymbols(system.clean, staff, bars);
    system.bars = bars;
    system.start = found.start;
    for (const span of system.spans) {
      const inside = (x: number) => x > span.x0 && x < span.x1;
      drafts.push({
        ...span, system, index,
        marks: found.marks.filter((m) => inside(m.x)),
        threes: found.threes.filter((t) => inside(t.x)),
        sign: found.times.find((t) => inside((t.x + t.x1) / 2)),
        middle: staff.lines[2]!,
        time: { beats: 4, unit: 4 }, solved: { events: [], cost: 99, exact: false }, voice: "all", tied: [],
      });
    }
  });
  numberEndings(drafts);

  // 박자표 구간마다 박자표를 정한다.
  for (let i = 0; i < drafts.length; ) {
    let j = i + 1;
    while (j < drafts.length && !drafts[j]!.sign) j++;
    const time = estimateTime(drafts.slice(i, j), drafts[i]!.sign);
    for (let k = i; k < j; k++) drafts[k]!.time = time;
    i = j;
  }

  let previous: Draft | undefined;
  for (const draft of drafts) {
    const target = timeTicks(draft.time);
    const options = voicesOf(draft.marks, draft.middle).map((voice) => {
      const solved = solveMeasure(voice.marks, target, draft.threes, voice.loose);
      const notes = solved.events.flatMap((e) => (e.mark.kind === "note" ? [e.mark] : []));
      const last = previous?.solved.events.at(-1)?.mark, first = solved.events[0]?.mark;
      const tiedIn = !!previous && last?.kind === "note" && first?.kind === "note" && tieBetween(previous, last, draft, first);
      const lyrics = notes.length ? notes.filter((n) => inkBelow(draft.system, n.x)).length / notes.length : 0;
      return { voice, solved, tiedIn, score: solved.cost + (voice.name === "all" ? 0 : 0.6) - lyrics * 0.9 - (tiedIn ? 0.4 : 0) };
    });
    options.sort((a, b) => a.score - b.score);
    const best = options[0]!;
    draft.solved = best.solved;
    draft.voice = best.voice.name;
    const notes = best.solved.events.map((e) => e.mark);
    draft.tied = notes.map((mark, i) => {
      if (mark.kind !== "note") return false;
      const before = notes[i - 1];
      if (i === 0) return best.tiedIn;
      return before?.kind === "note" && tieBetween(draft, before, draft, mark);
    });
    previous = draft;
  }

  const lyrics = drafts.map((): Syllable[][] => []);
  if (ocr) await readLyrics(systems, drafts, lyrics, ocr, onProgress);

  const score = emptyScore();
  score.time = drafts[0]?.time ?? score.time;
  score.measures = drafts.map((d, i): ReadMeasure => ({
    page: d.system.page,
    system: d.index,
    box: { x: d.x0, y: d.system.top, width: d.x1 - d.x0, height: d.system.bottom - d.system.top },
    time: d.time,
    ...(d.left ? { left: d.left } : {}),
    ...(d.right ? { right: d.right } : {}),
    ...(d.ending ? { ending: d.ending } : {}),
    ...mergeLyrics(d, lyrics[i]!),
  }));
  return score;
}

/** 단마다 글자 줄을 읽어 음에 붙인다. lyrics[마디][절][음] */
async function readLyrics(systems: System[], drafts: Draft[], lyrics: Syllable[][][], ocr: Ocr, onProgress?: ReadOptions["onProgress"]): Promise<void> {
  const taken = systems.map((_, index) =>
    drafts.filter((d) => d.index === index).flatMap((d) => d.solved.events.flatMap((e) => (e.mark.kind === "rest" ? [e.mark.box] : []))),
  );
  const below = (i: number) => (systems[i + 1]?.page === systems[i]!.page ? systems[i + 1]!.staff.lines[0] : undefined);
  const rough = systems.flatMap((s, i) => findRows(s, below(i), taken[i]!).filter((r) => r.blobs.length >= 5).map((r) => (r.y1 - r.y0) / s.staff.space));
  rough.sort((a, b) => a - b);
  const em = rough[rough.length >> 1];
  for (const [i, system] of systems.entries()) {
    const rows = findRows(system, below(i), taken[i]!, em ? em * system.staff.space : undefined);
    const mine = drafts.map((d, at) => ({ d, at })).filter(({ d }) => d.index === i);
    const slots = mine.flatMap(({ d, at }) => d.solved.events.flatMap((e, k) => (e.mark.kind === "note" ? [{ at, k, x: e.mark.x, tied: d.tied[k]! }] : [])));
    let verse = 0;
    for (const row of rows) {
      const chars = await readRow(system.sheet.gray, row, ocr);
      // 한글이 없는 줄(나타냄말 등)은 가사가 아니다.
      if (!chars.some((c) => isHangul(c.text))) continue;
      const match = alignSyllables(chars, slots, system.staff.space);
      for (const { at, d } of mine) lyrics[at]![verse] ??= d.solved.events.map(() => ({ text: "", unsure: false }));
      chars.forEach((c, n) => {
        const slot = slots[match[n]!];
        // 음과 짝이 없는 글자는 가장 가까운 음 뒤에 붙이고 확인하게 한다.
        const target = slot ?? slots.reduce<typeof slots[number] | undefined>((best, o) => (!best || Math.abs(o.x - c.x) < Math.abs(best.x - c.x) ? o : best), undefined);
        if (!target) return;
        const cell = lyrics[target.at]![verse]![target.k]!;
        cell.text = cell.text ? cell.text + c.text : c.text;
        if (!slot || c.score < 0.8 || c.text === "") cell.unsure = true;
      });
      // 글자 없이 가로줄만 있는 음은 앞 글자를 끄는 음
      for (const x of dashesOf(row)) {
        const near = slots.reduce<typeof slots[number] | undefined>((best, o) => (!best || Math.abs(o.x - x) < Math.abs(best.x - x) ? o : best), undefined);
        if (near && Math.abs(near.x - x) < system.staff.space * 0.9) (drafts[near.at]!.dashed ??= new Set()).add(near.k);
      }
      verse++;
    }
    onProgress?.(i + 1, systems.length);
  }
}

/** 글자가 있는 음은 새로 부르는 음, 없는 음은 앞 음을 이어 부르는 음으로 정한다. */
function mergeLyrics(d: Draft, verses: Syllable[][]): Pick<ReadMeasure, "events" | "lyrics" | "check"> {
  const reasons: string[] = [];
  const base = checkReason(d);
  if (base) reasons.push(base);
  const sung = verses.filter((v) => v.some((c) => c.text || c.unsure));
  const kinds = d.solved.events.map((e, i): ReadEvent["kind"] => {
    if (e.mark.kind === "rest") return "rest";
    if (sung.length === 0) return d.tied[i] ? "hold" : "on";
    const has = sung.some((v) => v[i]!.text || v[i]!.unsure);
    if (has) {
      if (d.tied[i]) reasons.push("붙임줄로 이어진 음에 글자가 있음");
      return "on";
    }
    return d.tied[i] ? "hold" : "on";
  });
  // 글자가 있는 마디에서 글자 없는 음: 앞 음이 있으면 이어 부른다.
  if (sung.length)
    kinds.forEach((kind, i) => {
      const empty = kind === "on" && !sung.some((v) => v[i]!.text || v[i]!.unsure);
      if (!empty) return;
      if (i === 0 && d.dashed?.has(0)) {
        kinds[i] = "hold";
        return;
      }
      const [before, mark] = [d.solved.events[i - 1]?.mark, d.solved.events[i]!.mark];
      // 이음줄로 이어진 음은 앞 글자를 이어 부른다.
      const slurred = before?.kind === "note" && mark.kind === "note" && hasTie(d.system.clean, d.system.staff, before, mark, d.system.bars ?? []);
      if ((slurred || d.dashed?.has(i)) && kinds[i - 1] !== "rest") kinds[i] = "hold";
      else reasons.push("글자를 찾지 못한 음이 있음");
    });
  const events = d.solved.events.map((e, i): ReadEvent => ({ kind: kinds[i]!, ticks: e.ticks, x: e.mark.x }));
  const lyrics = verses.map((v) => v.filter((_, i) => kinds[i] === "on"));
  if (lyrics.some((v) => v.some((c) => c.text.length > 1 && isHangul(c.text[0]!)))) reasons.push("한 음에 글자가 여러 개임");
  return { events, lyrics, ...(reasons.length ? { check: [...new Set(reasons)].join(", ") } : {}) };
}

function tieBetween(a: Draft, from: NoteMark, b: Draft, to: NoteMark): boolean {
  const sa = a.system.staff, sb = b.system.staff;
  if (a.system === b.system) {
    // 화음은 같은 높이의 머리가 하나라도 이어지면 된다.
    return from.heads.some((p) => to.heads.some((q) => Math.abs(p.y - q.y) < sa.space * 0.35 && hasTie(a.system.clean, sa, p, q, a.system.bars ?? [])));
  }
  if (Math.abs(pitchOf(from, sa) - pitchOf(to, sb)) > 0.35) return false;
  return hasHalfTie(a.system.clean, sa, from, a.x1, 1) || hasHalfTie(b.system.clean, sb, to, b.system.start ?? sb.x0, -1);
}

function checkReason(d: Draft): string | undefined {
  if (d.solved.events.length === 0) return "음표를 찾지 못함";
  if (!d.solved.exact) return "음 길이의 합이 박자표와 다름";
  if (d.solved.cost > 0.35) return "음 길이를 짐작함";
  return undefined;
}
