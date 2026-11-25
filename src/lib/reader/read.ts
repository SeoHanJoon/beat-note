import { splitMeasures, type MeasureSpan } from "./bars.ts";
import type { Binary } from "./image.ts";
import { readSheet, removeStaffLines, type Sheet, type Staff } from "./staff.ts";
import { emptyScore, type Gray, type ReadMeasure, type ReadScore } from "./types.ts";

export type System = { page: number; sheet: Sheet; clean: Binary; staff: Staff; spans: MeasureSpan[]; top: number; bottom: number };

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

/** 쪽 이미지들에서 악보를 읽는다. */
export async function readScore(pages: Gray[]): Promise<ReadScore> {
  const systems = findSystems(pages);
  const all = systems.flatMap((system, index) => system.spans.map((span) => ({ ...span, system, index }) as MeasureSpan & { system: System; index: number; ending?: string }));
  numberEndings(all);
  const score = emptyScore();
  score.measures = all.map(({ system, index, ...span }): ReadMeasure => ({
    page: system.page,
    system: index,
    box: { x: span.x0, y: system.top, width: span.x1 - span.x0, height: system.bottom - system.top },
    time: score.time,
    ...(span.left ? { left: span.left } : {}),
    ...(span.right ? { right: span.right } : {}),
    ...(span.ending ? { ending: span.ending } : {}),
    events: [],
    lyrics: [],
    check: "박자를 아직 읽지 않음",
  }));
  return score;
}
