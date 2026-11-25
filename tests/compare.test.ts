import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { Truth } from "../scripts/scores/truth.ts";
import type { ReadScore } from "../src/lib/reader/types.ts";
import { alignMeasures, compare, editDistance } from "./support/compare.ts";

const dir = join(import.meta.dirname, "scores");
const truths = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Truth);

/** 정답을 그대로 읽은 것처럼 꾸민 결과 */
function perfect(truth: Truth): ReadScore {
  return {
    title: truth.title, credits: truth.credits, copyright: truth.copyright, time: { beats: 4, unit: 4 },
    measures: truth.measures.map((m, i) => ({
      page: 0, system: Math.min(i, truth.systems - 1), box: { x: 0, y: 0, width: 0, height: 0 }, time: { beats: 4, unit: 4 },
      events: m.events[0]!.map((e) => ({ kind: e.kind, ticks: e.ticks, x: 0 })),
      lyrics: m.events.map((events) => events.filter((e) => e.kind === "on").map((e) => ({ text: e.text ?? "", unsure: false }))),
    })),
  };
}

test("정답과 같으면 모두 100%", () => {
  for (const truth of truths) {
    const r = compare(truth, perfect(truth));
    assert.deepEqual([r.measureExact, r.cells, r.text, r.unflagged.length], [1, 1, 1, 0], truth.title);
    assert.equal(r.systems[0], r.systems[1]);
  }
});

test("마디가 빠지거나 길이가 틀리면 잡아낸다", () => {
  const truth = truths[0]!;
  const score = perfect(truth);
  score.measures.splice(4, 1);
  score.measures[1]!.events.pop();
  score.measures[1]!.check = "길이";
  const r = compare(truth, score);
  assert.deepEqual(r.wrong.map((w) => w.measure), [2, 5]);
  assert.deepEqual(r.unflagged, [5]);
});

test("편집 거리와 짝짓기", () => {
  assert.equal(editDistance([..."가나다"], [..."가다라"]), 2);
  assert.deepEqual(alignMeasures(["oo", "rr"], ["rr"]), [[0, null], [1, 0]]);
});
