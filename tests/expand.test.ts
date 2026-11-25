import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { Truth } from "../scripts/scores/truth.ts";
import { readScore } from "../src/lib/reader/read.ts";
import type { ReadMeasure, ReadScore } from "../src/lib/reader/types.ts";
import { expandScore, playOrder, toBeats } from "../src/lib/song/expand.ts";
import { parseTime } from "../src/lib/song/text.ts";
import { editDistance } from "./support/compare.ts";
import { measuresOf } from "./support/compare-song.ts";
import { nodeOcr } from "./support/ocr.ts";
import { renderPdf } from "./support/render.ts";

const dir = join(import.meta.dirname, "scores");
const names = readdirSync(dir).filter((f) => f.endsWith(".pdf")).map((f) => f.replace(".pdf", "")).sort();
const truthOf = (name: string) => JSON.parse(readFileSync(join(dir, name + ".json"), "utf8")) as Truth;

type Sign = { left?: "rptstart"; right?: "rptend"; ending?: string };
const orderOf = (list: Sign[]) => playOrder(list).map(([i, pass]) => `${i}${"abc"[pass]}`).join(" ");
const L: Sign = { left: "rptstart" }, R: Sign = { right: "rptend" }, _: Sign = {};

test("반복 펼치기", () => {
  assert.equal(orderOf([_, _, _]), "0a 1a 2a");
  assert.equal(orderOf([_, R, _]), "0a 1a 0b 1b 2a", "시작 도돌이표가 없으면 처음부터");
  assert.equal(orderOf([_, L, R, _]), "0a 1a 2a 1b 2b 3a");
  assert.equal(orderOf([{ ...L, ...R }, { ...L, ...R }]), "0a 0b 1a 1b", "한 마디 반복이 이어짐");
  assert.equal(orderOf([L, { ending: "1", ...R }, { ending: "2" }, _]), "0a 1a 0b 2b 3a");
  assert.equal(orderOf([L, { ending: "1" }, { ending: "1", ...R }, { ending: "2" }, _, L, R]), "0a 1a 2a 0b 3b 4a 5a 6a 5b 6b");
  assert.equal(orderOf([L, { ending: "1", ...R }, { ending: "2", ...R }, { ending: "3" }]), "0a 1a 0b 2b 0c 3c");
  assert.ok(playOrder(Array.from({ length: 40 }, () => ({ ...L, ...R }))).length === 80);
});

for (const name of names) {
  test(`${name}: 펼친 곡의 박자와 가사`, async () => {
    const truth = truthOf(name);
    const score = await readScore(await renderPdf(join(dir, name + ".pdf")), { ocr: await nodeOcr() });
    const { song, sources } = expandScore(score, { id: "t" });
    assert.equal(sources.length, song.items.length);
    const read = measuresOf(song);
    assert.equal(read.length, truth.order.length);
    if (truth.handwritten) return;
    assert.deepEqual([song.title, song.time], [truth.title, parseTime(truth.meter)]);
    assert.match(song.copyright, /2026/);
    let wrong = 0, letters = 0;
    let sounding = false;
    truth.order.forEach(([i, pass], k) => {
      const m = truth.measures[i]!;
      const events = m.events[Math.min(pass, m.events.length - 1)]!;
      const held = sounding && events[0]?.kind === "hold";
      const words = events.flatMap((e) => (e.text ? [e.text] : []));
      const rhythm = events.map((e) => (e.kind === "rest" ? "r".repeat(e.ticks / 2) : (e.kind === "on" ? "o" : "h") + "h".repeat(e.ticks / 2 - 1))).join("");
      if (words.length === 0 && !held) assert.match(read[k]!.rhythm, /^i+$/, `${k + 1}번째 마디는 노래가 없음`);
      else assert.equal(read[k]!.rhythm, rhythm, `${k + 1}번째 마디`);
      letters += words.length;
      wrong += editDistance(words, read[k]!.text);
      sounding = words.length > 0 || held ? events.at(-1)?.kind !== "rest" : false;
    });
    assert.ok(wrong / letters <= 0.05, `틀린 글자 ${wrong}/${letters}`);
  });
}

const measure = (change: Partial<ReadMeasure>): ReadMeasure => ({
  page: 0, system: 0, box: { x: 0, y: 0, width: 1, height: 1 }, time: { beats: 4, unit: 4 }, events: [], lyrics: [], ...change,
});

test("길이가 맞지 않는 마디는 쉼표를 채우고 확인 표시를 한다", () => {
  const score: ReadScore = {
    title: "가", credits: "", copyright: "", time: { beats: 4, unit: 4 },
    measures: [measure({ events: [{ kind: "on", ticks: 48, x: 0 }], lyrics: [[{ text: "가", unsure: false }]] })],
  };
  const { song } = expandScore(score, { id: "x" });
  const item = song.items.find((i) => i.type === "measure");
  assert.ok(item?.type === "measure" && item.check && item.beats.length === 4);
});

test("박을 나누는 칸 수를 고른다", () => {
  const p = (kind: "on" | "hold" | "rest", ticks: number) => ({ kind, ticks, text: kind === "on" ? "가" : "", unsure: false });
  const { beats, exact } = toBeats([p("on", 16), p("on", 16), p("on", 16), p("on", 72), p("rest", 24), p("on", 48)], { beats: 4, unit: 4 });
  assert.ok(exact);
  assert.deepEqual(beats.map((b) => [b.div, b.notes.map((n) => n.kind.charAt(0) + n.len).join("")]), [[3, "n1n1n1"], [4, "n4"], [4, "h2r2"], [4, "n4"]]);
});
