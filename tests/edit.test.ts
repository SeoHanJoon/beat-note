import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, beatOf, cellsOf, draftOf, historyOf, reduce, rowsToCheck, songOf, type Action, type Draft } from "../src/lib/song/edit.ts";
import { exampleSong } from "../src/lib/song/example.ts";
import { formatMeasure, normalizeSong, parseSong } from "../src/lib/song/text.ts";

const lines = (draft: Draft) => songOf(draft).items.map((i) => (i.type === "measure" ? formatMeasure(i, draft.info.time) : i.type === "section" ? "#" + i.title : `-${i.count}`));
const start = (text: string) => draftOf(parseSong(text));

test("칸 ↔ 박", () => {
  for (const item of exampleSong().items) if (item.type === "measure") for (const beat of item.beats) assert.deepEqual(beatOf(cellsOf(beat)), beat);
});

test("글자와 종류 바꾸기", () => {
  let d = start("가2 나2|~4|.4|다4");
  d = apply(d, { type: "kind", row: 0, beat: 0, cell: 1, kind: "rest" });
  d = apply(d, { type: "kind", row: 0, beat: 1, cell: 2, kind: "on" });
  d = apply(d, { type: "text", row: 0, beat: 1, cell: 2, text: "라" });
  assert.deepEqual(lines(d), ["가1 .1 나2|~2 라2|.4|다4"]);
});

test("한글을 여러 글자 넣으면 다음 음에 차례로 들어간다", () => {
  let d = start("가4|나4|~4|다4\n- 연주 1마디\n라4|마4|바4|사4");
  d = apply(d, { type: "text", row: 0, beat: 1, cell: 0, text: "하나둘셋" });
  assert.deepEqual(lines(d), ["가4|하4|~4|나4", "-1", "둘4|셋4|바4|사4"]);
  d = apply(d, { type: "text", row: 0, beat: 0, cell: 0, text: "love" });
  assert.equal(lines(d)[0], "love4|하4|~4|나4");
});

test("칸 수 바꾸기", () => {
  let d = start("가2 나2|다4|라4|마4");
  d = apply(d, { type: "div", row: 0, beat: 0, div: 3 });
  assert.equal(songOf(d).items[0]!.type === "measure" && d.rows[0]!.item.type === "measure" && d.rows[0]!.item.beats[0]!.div, 3);
  d = apply(d, { type: "div", row: 0, beat: 1, div: 1 });
  assert.match(lines(d)[0]!, /1:다1/);
  const merged = apply(start("가1 나1 다1 라1|.4|.4|.4"), { type: "div", row: 0, beat: 0, div: 1 });
  assert.match(lines(merged)[0]!, /^1:가나다라1/, "글자가 사라지지 않음");
});

test("마디 이동, 복제, 삭제, 추가", () => {
  let d = start("# 가\n나4|.4|.4|.4\n다4|.4|.4|.4");
  d = apply(d, { type: "move", row: 2, by: -1 });
  assert.deepEqual(lines(d).map((l) => l[0] === "#" ? l : l[0]), ["#가", "다", "나"]);
  d = apply(d, { type: "duplicate", row: 2 });
  assert.equal(d.rows.length, 4);
  assert.equal(new Set(d.rows.map((r) => r.key)).size, 4);
  d = apply(d, { type: "remove", row: 1 });
  d = apply(d, { type: "insert", row: d.rows.at(-1)!.key, what: "measure" });
  assert.deepEqual(lines(d).at(-1), ".4|.4|.4|.4");
  assert.equal(apply(d, { type: "move", row: d.rows[0]!.key, by: -1 }), d);
});

test("연주 마디와 노래 마디를 서로 바꾸고 박자표를 바꾼다", () => {
  let d = start("- 연주 2마디");
  d = apply(d, { type: "toMeasures", row: 0 });
  assert.deepEqual(lines(d), [".4|.4|.4|.4", ".4|.4|.4|.4"]);
  d = apply(d, { type: "time", row: d.rows[0]!.key, time: { beats: 2, unit: 4 } });
  assert.equal(lines(d)[0], "[2/4] .4|.4");
  d = apply(d, { type: "time", row: d.rows[0]!.key, time: { beats: 4, unit: 4 } });
  assert.equal(lines(d)[0], ".4|.4|.4|.4");
  d = apply(d, { type: "toInstrumental", row: d.rows[1]!.key });
  assert.equal(lines(d)[1], "-1");
});

test("확인 표시와 확신 낮은 글자", () => {
  let d = start("? 이유\n가?4|.4|.4|.4\n나?4|.4|.4|.4\n다4|.4|.4|.4");
  assert.deepEqual(rowsToCheck(d), [0, 1]);
  d = apply(d, { type: "confirm", row: 0 });
  d = apply(d, { type: "text", row: 1, beat: 0, cell: 0, text: "너" });
  assert.deepEqual(rowsToCheck(d), []);
});

test("되돌리기와 다시 하기: 무작위 편집 뒤 처음으로 돌아온다", () => {
  const first = draftOf(exampleSong());
  let h = historyOf(first);
  let seed = 7;
  const next = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >>> 8) % n;
  for (let i = 0; i < 150; i++) {
    const row = h.now.rows[next(h.now.rows.length)]!.key, beat = next(4), cell = next(4);
    const actions: Action[] = [
      { type: "kind", row, beat, cell, kind: (["on", "hold", "rest"] as const)[next(3)]! },
      { type: "text", row, beat, cell, text: ["가", "나다라", "x", ""][next(4)]! },
      { type: "div", row, beat, div: 1 + next(8) },
      { type: "move", row, by: next(2) ? 1 : -1 },
      { type: "duplicate", row },
      { type: "insert", row, what: next(2) ? "measure" : "section" },
      { type: "time", row, time: { beats: 2 + next(3), unit: 4 } },
      { type: "confirm", row },
      { type: "toMeasures", row },
      { type: "toInstrumental", row },
      { type: "info", change: { bpm: next(400), title: "제목\n둘째 줄" } },
      ...(h.now.rows.length > 4 ? [{ type: "remove", row } as const] : []),
    ];
    h = reduce(h, actions[next(actions.length)]!);
    const song = songOf(h.now);
    assert.deepEqual(normalizeSong(song), song, `${i}번째 편집 뒤에도 글로 나타낼 수 있음`);
  }
  const last = h.now;
  const steps = h.past.length;
  for (let i = 0; i < steps; i++) h = reduce(h, { type: "undo" });
  assert.deepEqual(h.now, first);
  for (let i = 0; i < steps; i++) h = reduce(h, { type: "redo" });
  assert.deepEqual(h.now, last);
});
