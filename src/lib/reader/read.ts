import type { Time } from "../song/types.ts";
import { findBarlines, splitMeasures, type MeasureSpan } from "./bars.ts";
import type { Binary } from "./image.ts";
import { estimateTime, solveMeasure, timeTicks, voicesOf, type Solved, type Voice } from "./rhythm.ts";
import { readSheet, removeStaffLines, type Sheet, type Staff } from "./staff.ts";
import { readSymbols, type Mark, type NoteMark, type TimeMark } from "./symbols.ts";
import { hasHalfTie, hasTie } from "./ties.ts";
import { emptyScore, type Gray, type ReadMeasure, type ReadScore } from "./types.ts";

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

/** 쪽 이미지들에서 악보를 읽는다. */
export async function readScore(pages: Gray[]): Promise<ReadScore> {
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

  const score = emptyScore();
  score.time = drafts[0]?.time ?? score.time;
  score.measures = drafts.map((d): ReadMeasure => {
    const check = checkReason(d);
    return {
      page: d.system.page,
      system: d.index,
      box: { x: d.x0, y: d.system.top, width: d.x1 - d.x0, height: d.system.bottom - d.system.top },
      time: d.time,
      ...(d.left ? { left: d.left } : {}),
      ...(d.right ? { right: d.right } : {}),
      ...(d.ending ? { ending: d.ending } : {}),
      events: d.solved.events.map((e, i) => ({ kind: e.mark.kind === "rest" ? "rest" : d.tied[i] ? "hold" : "on", ticks: e.ticks, x: e.mark.x })),
      lyrics: [],
      ...(check ? { check } : {}),
    };
  });
  return score;
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
