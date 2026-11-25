// 펼친 곡끼리 비교한다.
import type { Song } from "../../src/lib/song/types.ts";
import { meterOf } from "../../src/lib/song/time.ts";
import { alignMeasures, editDistance } from "./compare.ts";

/** 마디마다 박자 글자. 4분음표를 24칸으로 나눈다. */
export function measuresOf(song: Song): { rhythm: string; text: string[]; check: boolean }[] {
  return song.items.flatMap((item) => {
    if (item.type === "section") return [];
    const meter = meterOf(item.time ?? song.time);
    const cells = meter.quarters * 24;
    if (item.type === "instrumental") return Array.from({ length: item.count }, () => ({ rhythm: "i".repeat(cells * meter.beats), text: [], check: false }));
    let rhythm = "";
    const text: string[] = [];
    for (const beat of item.beats)
      for (const n of beat.notes) {
        const length = Math.round((n.len * cells) / beat.div);
        rhythm += n.kind === "rest" ? "r".repeat(length) : (n.kind === "note" ? "o" : "h") + "h".repeat(length - 1);
        if (n.kind === "note" && n.text) text.push(n.text);
      }
    return [{ rhythm, text, check: !!item.check }];
  });
}

export type SongReport = { measures: [number, number]; measureExact: number; cells: number; text: number; unflagged: number; flagged: number };

export function compareSongs(truth: Song, read: Song): SongReport {
  const t = measuresOf(truth), r = measuresOf(read);
  let exact = 0, cells = 0, total = 0, unflagged = 0;
  for (const [i, j] of alignMeasures(t.map((m) => m.rhythm), r.map((m) => m.rhythm))) {
    const a = i === null ? "" : t[i]!.rhythm, b = j === null ? "" : r[j]!.rhythm;
    let same = 0;
    for (let k = 0; k < Math.min(a.length, b.length); k++) if (a[k] === b[k]) same++;
    total += Math.max(a.length, b.length);
    cells += same;
    if (a === b) exact++;
    else if (j === null || !r[j]!.check) unflagged++;
  }
  const ta = t.flatMap((m) => m.text), ra = r.flatMap((m) => m.text);
  return {
    measures: [r.length, t.length],
    measureExact: exact / Math.max(t.length, r.length, 1),
    cells: cells / Math.max(total, 1),
    text: Math.max(0, 1 - editDistance(ta, ra) / Math.max(1, ta.length)),
    unflagged,
    flagged: r.filter((m) => m.check).length,
  };
}
