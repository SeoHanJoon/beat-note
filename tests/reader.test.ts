import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { Truth } from "../scripts/scores/truth.ts";
import { rotate } from "../src/lib/reader/image.ts";
import { numberEndings, readScore } from "../src/lib/reader/read.ts";
import type { Gray, ReadScore } from "../src/lib/reader/types.ts";
import { solveMeasure } from "../src/lib/reader/rhythm.ts";
import type { NoteMark } from "../src/lib/reader/symbols.ts";
import { alignSyllables } from "../src/lib/reader/lyrics.ts";
import { compare } from "./support/compare.ts";
import { DISTORTIONS } from "./support/distort.ts";
import { nodeOcr } from "./support/ocr.ts";
import { renderPdf } from "./support/render.ts";

const dir = join(import.meta.dirname, "scores");
export const names = readdirSync(dir).filter((f) => f.endsWith(".pdf")).map((f) => f.replace(".pdf", "")).sort();
const truthOf = (name: string) => JSON.parse(readFileSync(join(dir, name + ".json"), "utf8")) as Truth;

function checkLayout(score: ReadScore, truth: Truth) {
  assert.equal(new Set(score.measures.map((m) => m.system)).size, truth.systems, "오선 수");
  assert.equal(score.measures.length, truth.measures.length, "마디 수");
  const signs = (m: { left?: string; right?: string; ending?: string }) => [m.left ?? "", m.right ?? "", m.ending ?? ""].join("|");
  assert.deepEqual(score.measures.map(signs), truth.measures.map(signs));
}

for (const name of names) {
  test(`${name}: 오선, 마디, 도돌이표, 괄호`, async () => {
    checkLayout(await readScore(await renderPdf(join(dir, name + ".pdf"))), truthOf(name));
  });
}

test("기울어진 이미지", async () => {
  for (const [name, degrees] of [["a-four-four", 0.8], ["d-repeat", -1.2]] as const) {
    const pages = await renderPdf(join(dir, name + ".pdf"));
    checkLayout(await readScore(pages.map((p) => rotate(p, (degrees * Math.PI) / 180))), truthOf(name));
  }
});

test("악보가 없는 이미지에서는 마디를 만들지 않는다", async () => {
  const blank: Gray = { width: 800, height: 1000, data: new Uint8Array(800_000).fill(255) };
  const black: Gray = { width: 800, height: 1000, data: new Uint8Array(800_000) };
  const noise: Gray = { width: 800, height: 1000, data: Uint8Array.from({ length: 800_000 }, (_, i) => ((i * 2654435761) >>> 24) & 255) };
  for (const image of [blank, black, noise]) assert.equal((await readScore([image])).measures.length, 0);
});

test("1번 괄호는 괄호 줄이 짧아도 도돌이표까지 이어진다", () => {
  const list = [
    { left: "rptstart" as const }, {}, { bracket: true as const }, {}, { right: "rptend" as const },
    { bracket: true as const }, {}, { right: "end" as const },
  ].map((m): Parameters<typeof numberEndings>[0][number] => m);
  numberEndings(list);
  assert.deepEqual(list.map((m) => m.ending ?? ""), ["", "", "1", "1", "1", "2", "", ""]);
});

for (const name of names) {
  test(`${name}: 박자`, async () => {
    const r = compare(truthOf(name), await readScore(await renderPdf(join(dir, name + ".pdf"))));
    assert.deepEqual(r.unflagged, [], "틀렸는데 확인 표시가 없는 마디");
    if (!truthOf(name).handwritten) assert.deepEqual(r.wrong, []);
  });
}

const note = (change: Partial<NoteMark> = {}): NoteMark => ({
  kind: "note", x: 0, y: 0, dir: 1, open: false, whole: false, beams: 0, beamLeft: false, beamRight: false, dots: 0, heads: [], ...change,
});

test("마디 길이가 맞지 않으면 가장 그럴듯하게 고치고 확인 표시를 한다", () => {
  const marks = [note(), note(), note(), note({ beams: 1, x: 3 })];
  const fixed = solveMeasure(marks, 192, []);
  assert.deepEqual([fixed.exact, fixed.events.reduce((s, e) => s + e.ticks, 0)], [true, 192]);
  assert.ok(fixed.cost > 0.35);
  const short = solveMeasure([note()], 192, []);
  assert.equal(short.exact, false);
});

test("숫자 3이 있는 빔 세 개는 셋잇단음표다", () => {
  const marks = [
    note({ beams: 1, beamRight: true, x: 10 }), note({ beams: 1, beamLeft: true, beamRight: true, x: 20 }), note({ beams: 1, beamLeft: true, x: 30 }),
    note({ x: 60 }), note({ x: 90 }), note({ x: 120 }),
  ];
  const solved = solveMeasure(marks, 192, [{ x: 20, y: 0 }]);
  assert.deepEqual([solved.cost, solved.events.map((e) => e.ticks)], [0, [16, 16, 16, 48, 48, 48]]);
});

test("기울어진 이미지의 박자", async () => {
  const pages = await renderPdf(join(dir, "d-repeat.pdf"));
  const r = compare(truthOf("d-repeat"), await readScore(pages.map((p) => rotate(p, 0.012))));
  assert.deepEqual(r.unflagged, []);
  assert.ok(r.cells > 0.95, `칸 ${r.cells}`);
});

for (const name of names) {
  test(`${name}: 가사`, async () => {
    const truth = truthOf(name);
    const r = compare(truth, await readScore(await renderPdf(join(dir, name + ".pdf")), { ocr: await nodeOcr() }));
    assert.deepEqual(r.unflagged, [], "틀렸는데 확인 표시가 없는 마디");
    if (truth.handwritten) return;
    assert.deepEqual(r.wrong, [], "가사를 붙이면서 박자가 달라짐");
    assert.ok(r.text >= 0.95, `글자 ${r.text}`);
  });
}

test("음절을 순서대로 가까운 음에 붙인다", () => {
  const notes = [100, 140, 180, 220].map((x) => ({ x, tied: x === 140 }));
  assert.deepEqual(alignSyllables([{ x: 101 }, { x: 178 }, { x: 225 }], notes, 20), [0, 2, 3]);
  assert.deepEqual(alignSyllables([{ x: 100 }, { x: 400 }], notes.slice(0, 1), 20), [0, -1]);
  assert.deepEqual(alignSyllables([], notes, 20), []);
});

test("모델 파일이 기록한 것과 같다", () => {
  const model = readFileSync(join(import.meta.dirname, "..", "public/models/korean-rec.onnx"));
  const readme = readFileSync(join(import.meta.dirname, "..", "public/models/README.txt"), "utf8");
  assert.ok(readme.includes(createHash("sha256").update(model).digest("hex")));
});

for (const [label, score, minimum] of [["0.5° 기울임", "c-six-eight", 1], ["잡음", "d-repeat", 0.9], ["200dpi", "a-four-four", 1], ["150dpi", "b-three-four", 1], ["흐림", "a-four-four", 0.9], ["그림자", "d-repeat", 1]] as const) {
  test(`손상된 이미지: ${score} ${label}`, async () => {
    const apply = DISTORTIONS.find(([n]) => n === label)![1];
    const pages = await renderPdf(join(dir, score + ".pdf"));
    const r = compare(truthOf(score), await readScore(pages.map(apply)));
    assert.deepEqual(r.unflagged, []);
    assert.ok(r.measureExact >= minimum, `박자 ${r.measureExact}`);
  });
}

test("아주 작은 조각이 많은 이미지에서 멈추지 않는다", async () => {
  const pages = await renderPdf(join(dir, "b-three-four.pdf"));
  const dotted = pages.map((p) => ({ ...p, data: Uint8Array.from(p.data, (v, i) => ((Math.imul(i, 2654435761) >>> 20) < 160 ? 0 : v)) }));
  await readScore(dotted, { ocr: await nodeOcr() });
});

test("크기를 바꿔 읽어도 마디의 자리는 원본 기준이다", async () => {
  const pages = await renderPdf(join(dir, "a-four-four.pdf"));
  const half = DISTORTIONS.find(([n]) => n === "150dpi")![1];
  const [a, b] = [await readScore(pages), await readScore(pages.map(half))];
  const [x, y] = [a.measures[5]!.box, b.measures[5]!.box];
  for (const key of ["x", "y", "width", "height"] as const) assert.ok(Math.abs(x[key] / 2 - y[key]) < 12, `${key} ${x[key]} ${y[key]}`);
});
