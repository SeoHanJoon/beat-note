// Node에서 PDF를 브라우저와 같은 방법으로 그린다.
import { createCanvas } from "@napi-rs/canvas";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { openPdf, renderScale, type PdfjsFiles } from "../../src/lib/convert/pdf.ts";
import type { Gray } from "../../src/lib/reader/types.ts";

const load = async (): Promise<PdfjsFiles> => ({
  pdfjs: (await import("pdfjs-dist/legacy/build/pdf.mjs")) as PdfjsFiles["pdfjs"],
  base: join(import.meta.dirname, "..", "..", "public", "vendor", "pdfjs") + "/",
});

export function toGray(rgba: Uint8ClampedArray, width: number, height: number): Gray {
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = (rgba[i * 4]! * 299 + rgba[i * 4 + 1]! * 587 + rgba[i * 4 + 2]! * 114) / 1000;
  return { width, height, data };
}

export async function renderPdf(path: string): Promise<Gray[]> {
  const pdf = await openPdf(new Uint8Array(readFileSync(path)), load);
  const pages: Gray[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const size = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: renderScale(size.width, size.height) });
    const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
    await page.render({ canvas: canvas as never, viewport, background: "#fff" }).promise;
    pages.push(toGray(canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height));
  }
  await pdf.loadingTask.destroy();
  return pages;
}
