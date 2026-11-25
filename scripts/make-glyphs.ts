// 박자 읽기 페이지의 음표·쉼표 기호를 악보 글꼴 Bravura(OFL)의 윤곽에서 만든다.
// 만들 때만 Verovio를 쓰고, 결과는 src/components/noteGlyphs.ts에 둔다.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { VerovioToolkit } from "verovio/esm";
import createVerovioModule from "verovio/wasm";

const NAMES: Record<string, string> = {
  E0A2: "wholeHead", E0A3: "halfHead", E0A4: "blackHead", E240: "flag8", E242: "flag16",
  E4E3: "rest1", E4E4: "rest2", E4E5: "rest4", E4E6: "rest8", E4E7: "rest16",
};

const toolkit = new VerovioToolkit(await createVerovioModule());
toolkit.setOptions({ font: "Bravura", header: "none", footer: "none", adjustPageHeight: true });
const measure = (body: string) => `<measure><staff n="1"><layer n="1">${body}</layer></staff></measure>`;
const note = (dur: number) => `<note pname="g" oct="4" dur="${dur}"/>`;
toolkit.loadData(`<?xml version="1.0"?><mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0"><meiHead><fileDesc><titleStmt><title/></titleStmt><pubStmt/></fileDesc></meiHead><music><body><mdiv><score><scoreDef><staffGrp><staffDef n="1" lines="5"><clef shape="G" line="2"/></staffDef></staffGrp></scoreDef><section>${measure(note(1))}${measure(note(2) + note(4) + note(8) + note(16))}${measure([1, 2, 4, 8, 16].map((d) => `<rest dur="${d}"/>`).join(""))}</section></score></mdiv></body></music></mei>`);
const svg = toolkit.renderToSVG(1);
const lines: string[] = [];
for (const [code, name] of Object.entries(NAMES)) {
  const path = new RegExp(`<(?:g|symbol) id="${code}[^"]*"[^>]*>\\s*<path transform="scale\\(1,-1\\)" d="([^"]+)"`).exec(svg)?.[1];
  if (!path) throw new Error(`기호를 찾을 수 없음: ${name}`);
  lines.push(`  ${name}: "${path}",`);
}
const out = join(import.meta.dirname, "..", "src", "components", "noteGlyphs.ts");
writeFileSync(out, `// scripts/make-glyphs.ts가 만든 파일. Bravura(OFL)의 윤곽이며 오선 한 칸이 250이다. y는 위쪽이 양수.\nexport const GLYPHS = {\n${lines.join("\n")}\n} as const;\n`);
