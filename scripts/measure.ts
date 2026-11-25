// 시험 악보의 인식 정확도를 잰다. 이름을 주면 그 악보만.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readScore } from "../src/lib/reader/read.ts";
import { compare } from "../tests/support/compare.ts";
import { nodeOcr } from "../tests/support/ocr.ts";
import { renderPdf } from "../tests/support/render.ts";

const dir = join(import.meta.dirname, "..", "tests", "scores");
const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const verbose = process.argv.includes("-v");
const ocr = await nodeOcr();
const percent = (n: number) => (n * 100).toFixed(1) + "%";
for (const file of readdirSync(dir).filter((f) => f.endsWith(".pdf")).sort()) {
  const name = file.replace(".pdf", "");
  if (only.length && !only.some((o) => name.startsWith(o))) continue;
  const truth = JSON.parse(readFileSync(join(dir, name + ".json"), "utf8"));
  const pages = await renderPdf(join(dir, file));
  const start = performance.now();
  const score = await readScore(pages, { ocr });
  const r = compare(truth, score);
  console.log(
    `${name}: 단 ${r.systems.join("/")} 마디 ${r.measures.join("/")} 박자(마디) ${percent(r.measureExact)} 박자(칸) ${percent(r.cells)} 글자 ${percent(r.text)} 확인표시 ${r.flagged} 표시없는오류 ${r.unflagged.length} (${Math.round(performance.now() - start)}ms)`,
  );
  if (verbose) for (const [v, name] of [[0, "1절"], [1, "2절"]] as const) console.log(`   ${name}: ${score.measures.map((m) => (m.lyrics[v] ?? []).map((c) => c.text + (c.unsure ? "?" : "")).join("")).join(" | ")}`);
  if (verbose) for (const w of r.wrong) console.log(`   ${w.measure}마디\n     정답 ${w.truth}\n     결과 ${w.read}`);
}
