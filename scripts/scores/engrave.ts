// 악보 원본 → PDF
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Browser } from "playwright";
import { VerovioToolkit } from "verovio/esm";
import createVerovioModule from "verovio/wasm";
import type { ScoreSource } from "./source.ts";
import { meiOf, truthOf, type Truth } from "./truth.ts";

const root = join(import.meta.dirname, "..", "..");
const FONT_FILES: Record<string, string> = {
  "Noto Sans KR": "noto-sans-kr", "Nanum Myeongjo": "nanum-myeongjo", "Nanum Gothic": "nanum-gothic",
  "Gowun Dodum": "gowun-dodum", "Nanum Pen Script": "nanum-pen-script",
};
export const TEXT_FONTS = Object.keys(FONT_FILES);

export async function createEngraver(browser: Browser): Promise<(score: ScoreSource, path: string) => Promise<Truth>> {
  const toolkit = new VerovioToolkit(await createVerovioModule());
  return async (score, path) => {
    toolkit.setOptions({
      font: score.musicFont, scale: score.scale, pageWidth: (2100 * 100) / score.scale, pageHeight: (2500 * 100) / score.scale,
      pageMarginLeft: 150, pageMarginRight: 150, pageMarginTop: 40, pageMarginBottom: 40, adjustPageHeight: true,
      header: "none", footer: "none", svgViewBox: true, lyricTopMinMargin: 6, lyricSize: 4.6, spacingSystem: 14, spacingLinear: 0.3, spacingNonLinear: 0.6, smuflTextFont: "embedded", xmlIdSeed: 1,
    });
    toolkit.loadData(meiOf(score));
    const pages = Array.from({ length: toolkit.getPageCount() }, (_, i) => toolkit.renderToSVG(i + 1));
    const css = pathToFileURL(join(root, "node_modules", "@fontsource", FONT_FILES[score.textFont]!, "400.css")).href;
    const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${css}"><style>
    @page { size: A4; margin: 0 } body { margin: 0; font-family: "${score.textFont}" }
    section { height: 296mm; position: relative; break-after: page } section:last-of-type { break-after: auto }
    h1 { margin: 0; padding-top: 12mm; text-align: center; font-size: 26px; font-weight: 400 } p { margin: 0; padding: 0 16mm; text-align: right; font-size: 13px }
    svg { display: block; width: 210mm; height: auto; margin-top: 6mm } svg text, svg tspan { font-family: "${score.textFont}" !important; font-style: normal !important }
    footer { position: absolute; bottom: 6mm; width: 100%; text-align: center; font-size: 11px }</style>
    ${pages.map((svg, i) => `<section>${i === 0 ? `<h1>${score.title}</h1><p>${score.credits}</p>` : ""}${svg}<footer>${score.copyright}</footer></section>`).join("")}`;
    const file = join(root, "node_modules", `.score-${score.name}.html`);
    writeFileSync(file, html);
    const page = await browser.newPage();
    await page.goto(pathToFileURL(file).href);
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({ path, preferCSSPageSize: true, printBackground: true });
    await page.close();
    return { ...truthOf(score), systems: pages.join("").split('class="system"').length - 1 };
  };
}
