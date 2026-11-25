import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { MAX_BYTES, openPdf, PdfError, renderScale, type PdfjsFiles } from "../src/lib/convert/pdf.ts";
import { badPdfs, makePdf } from "./support/make-pdf.ts";

const load = async (): Promise<PdfjsFiles> => ({
  pdfjs: (await import("pdfjs-dist/legacy/build/pdf.mjs")) as PdfjsFiles["pdfjs"],
  base: join(import.meta.dirname, "..", "public", "vendor", "pdfjs") + "/",
});

for (const [name, problem, data] of badPdfs) {
  test(`거절: ${name}`, async () => {
    await assert.rejects(openPdf(data(), load), (error: unknown) => error instanceof PdfError && error.problem === problem);
  });
}

test("거절: 너무 큰 파일은 읽기 전에", async () => {
  await assert.rejects(openPdf(new Uint8Array(MAX_BYTES + 1), load), (e: unknown) => e instanceof PdfError && e.problem === "too-large");
});

test("열기: 제한 없는 PDF, 복사가 허용된 소유자 암호 PDF", async () => {
  for (const data of [makePdf({ pages: 2 }), makePdf({ pages: 2, ownerPassword: "owner", allowCopy: true })]) {
    const pdf = await openPdf(data, load);
    assert.equal(pdf.numPages, 2);
    await pdf.loadingTask.destroy();
  }
});

test("A4는 300dpi로, 아주 큰 쪽은 줄여서 그린다", () => {
  assert.equal(renderScale(595, 842), 300 / 72);
  assert.ok(renderScale(5000, 5000) * 5000 < 5000);
});
