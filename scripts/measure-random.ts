// 무작위 악보를 만들어 정확도를 잰다: node scripts/measure-random.ts [시작] [개수] [-v]
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { readScore } from "../src/lib/reader/read.ts";
import { compare } from "../tests/support/compare.ts";
import { nodeOcr } from "../tests/support/ocr.ts";
import { renderPdf } from "../tests/support/render.ts";
import { createEngraver } from "./scores/engrave.ts";
import { randomScore } from "./scores/random.ts";

const [from = 1, count = 20] = process.argv.slice(2).filter((a) => !a.startsWith("-")).map(Number);
const verbose = process.argv.includes("-v");
const dir = process.env.KEEP ?? mkdtempSync(join(tmpdir(), "beat-note-random-"));
const browser = await chromium.launch();
const engrave = await createEngraver(browser);
const ocr = await nodeOcr();
const percent = (n: number) => (n * 100).toFixed(1) + "%";
let measures = 0, exact = 0, text = 0, unflagged = 0, flagged = 0, perfect = 0;
for (let seed = from; seed < from + count; seed++) {
  const source = randomScore(seed);
  const path = join(dir, `${source.name}.pdf`);
  const truth = await engrave(source, path);
  const score = await readScore(await renderPdf(path), { ocr });
  const r = compare(truth, score);
  measures += truth.measures.length;
  exact += r.measureExact * truth.measures.length;
  text += r.text;
  unflagged += r.unflagged.length;
  flagged += r.flagged;
  if (r.measureExact === 1 && r.measures[0] === r.measures[1]) perfect++;
  console.log(`${seed} ${source.musicFont}/${source.textFont} ${source.meter} 단 ${r.systems.join("/")} 마디 ${r.measures.join("/")} 박자 ${percent(r.measureExact)} 글자 ${percent(r.text)} 확인 ${r.flagged} 무표시 ${r.unflagged.length}`);
  if (verbose) for (const w of r.wrong) console.log(`   ${w.measure}마디 ${r.unflagged.includes(w.measure) ? "(무표시)" : ""}\n     정답 ${w.truth}\n     결과 ${w.read}`);
}
await browser.close();
console.log(`합계: 악보 ${count}, 마디 ${measures}, 박자(마디) ${percent(exact / measures)}, 글자 ${percent(text / count)}, 모두 맞은 악보 ${perfect}, 확인 표시 ${flagged}, 표시 없는 오류 ${unflagged}`);
