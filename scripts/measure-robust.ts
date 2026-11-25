// 손상된 이미지에서의 정확도를 잰다. BEAT_NOTE_LOCAL이 있으면 검증용 악보의 확인 표시도 센다.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readScore } from "../src/lib/reader/read.ts";
import { compare } from "../tests/support/compare.ts";
import { DISTORTIONS } from "../tests/support/distort.ts";
import { nodeOcr } from "../tests/support/ocr.ts";
import { renderPdf } from "../tests/support/render.ts";

const dir = join(import.meta.dirname, "..", "tests", "scores");
const ocr = await nodeOcr();
const names = readdirSync(dir).filter((f) => f.endsWith(".pdf")).map((f) => f.replace(".pdf", "")).filter((n) => !process.argv[2] || n.startsWith(process.argv[2])).sort();
const pages = new Map(await Promise.all(names.map(async (n) => [n, await renderPdf(join(dir, n + ".pdf"))] as const)));
const percent = (n: number) => (n * 100).toFixed(1).padStart(5);
console.log("손상 | " + names.map((n) => n.padEnd(22)).join(" | "));
for (const [name, apply] of DISTORTIONS) {
  const row: string[] = [];
  for (const n of names) {
    const truth = JSON.parse(readFileSync(join(dir, n + ".json"), "utf8"));
    const r = compare(truth, await readScore(pages.get(n)!.map(apply), { ocr }));
    row.push(`${percent(r.measureExact)} ${percent(r.text)} 무표시${r.unflagged.length}`.padEnd(22));
  }
  console.log(`${name} | ${row.join(" | ")}`);
}
