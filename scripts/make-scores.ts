// 시험 악보 PDF와 정답을 tests/scores에 만든다.
// Verovio(LGPL)와 Playwright는 만들 때만 쓰고 배포물에 들어가지 않는다.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { createEngraver } from "./scores/engrave.ts";
import { SCORES } from "./scores/source.ts";

const out = join(import.meta.dirname, "..", "tests", "scores");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const engrave = await createEngraver(browser);
for (const score of SCORES) {
  const truth = await engrave(score, join(out, `${score.name}.pdf`));
  writeFileSync(join(out, `${score.name}.json`), JSON.stringify(truth) + "\n");
  console.log(score.name, "단", truth.systems, "마디", score.measures.length);
}
await browser.close();
