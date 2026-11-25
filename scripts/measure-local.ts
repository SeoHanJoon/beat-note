// 저장소 밖의 검증용 악보를 잰다. 곡명과 가사는 출력하지 않는다.
//   BEAT_NOTE_LOCAL=폴더 npm run measure:local
// 폴더의 PDF마다, 정답이 될 박자 노트 HTML(SONG 글이 들어 있는 것)을 순서대로 짝짓는다.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readScore } from "../src/lib/reader/read.ts";
import { expandScore } from "../src/lib/song/expand.ts";
import { parseSong } from "../src/lib/song/text.ts";
import { compareSongs } from "../tests/support/compare-song.ts";
import { nodeOcr } from "../tests/support/ocr.ts";
import { renderPdf } from "../tests/support/render.ts";

const dir = process.env.BEAT_NOTE_LOCAL;
if (!dir) {
  console.error("BEAT_NOTE_LOCAL에 검증용 악보가 있는 폴더를 적어야 함");
  process.exit(1);
}
const files = readdirSync(dir).sort();
const pdfs = files.filter((f) => /\.pdf$/i.test(f)), htmls = files.filter((f) => /\.html$/i.test(f));
const percent = (n: number) => (n * 100).toFixed(1) + "%";

/** 예전 형식에는 박자표가 다른 마디의 표시가 없어 박 수로 알아낸다. */
function parseTruth(html: string) {
  const text = /const SONG = `([\s\S]*?)`/.exec(html)?.[1] ?? "";
  return parseSong(
    text
      .split("\n")
      .map((line) => {
        if (/^[#\->@?]/.test(line) || !line.trim()) return line;
        const beats = line.split("*")[0]!.split("|").length;
        return beats === 4 ? line : `[${beats}/4] ${line}`;
      })
      .join("\n"),
  );
}

for (const [i, pdf] of pdfs.entries()) {
  const start = performance.now();
  const score = await readScore(await renderPdf(join(dir, pdf)), { ocr: await nodeOcr() });
  const { song } = expandScore(score, { id: "local" });
  const time = `${((performance.now() - start) / 1000).toFixed(1)}초`;
  if (!htmls[i]) {
    console.log(`악보 ${i + 1}: 마디 ${score.measures.length}, 확인 표시 ${score.measures.filter((m) => m.check).length} (정답 없음, ${time})`);
    continue;
  }
  const r = compareSongs(parseTruth(readFileSync(join(dir, htmls[i]), "utf8")), song);
  console.log(`악보 ${i + 1}: 펼친 마디 ${r.measures.join("/")} 박자(마디) ${percent(r.measureExact)} 박자(칸) ${percent(r.cells)} 글자 ${percent(r.text)} 확인 표시 ${r.flagged} 표시 없는 오류 ${r.unflagged} (${time})`);
}
