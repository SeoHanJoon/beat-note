import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { Truth } from "../scripts/scores/truth.ts";
import { rotate } from "../src/lib/reader/image.ts";
import { numberEndings, readScore } from "../src/lib/reader/read.ts";
import type { Gray, ReadScore } from "../src/lib/reader/types.ts";
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
