import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { chromium, webkit } from "playwright";
import { PDF_MESSAGES, type PdfProblem } from "../../src/lib/convert/pdf.ts";
import { badPdfs, makePdf } from "../support/make-pdf.ts";
import { serveOut, watch } from "./support.ts";

let server: Server, url: string;
before(async () => ({ server, url } = await serveOut()));
after(() => {
  server.close();
  server.closeAllConnections();
});

for (const type of [chromium, webkit]) {
  test(`${type.name()}: PDF를 열고, 열면 안 되는 파일은 거절한다`, { timeout: 90_000 }, async () => {
    const browser = await type.launch();
    try {
      const page = await browser.newPage();
      const seen = watch(page, [url]);
      await page.goto(url + "/convert/");
      const choose = (name: string, data: Uint8Array) =>
        page.locator("input[type=file]").setInputFiles({ name, mimeType: "application/pdf", buffer: Buffer.from(data) });

      await choose("두 쪽.pdf", makePdf({ pages: 2 }));
      await page.locator('.page[data-status="done"]').nth(1).waitFor();
      const ink = await page.locator(".page canvas").first().evaluate((canvas: HTMLCanvasElement) => {
        const { data } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
        let dark = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i]! < 128) dark++;
        return { width: canvas.width, share: dark / (data.length / 4) };
      });
      assert.equal(ink.width, 2479);
      assert.ok(ink.share > 0.03 && ink.share < 0.06, `검은 부분 ${ink.share}`);

      for (const [name, problem, data] of badPdfs) {
        await choose(name + ".pdf", data());
        await page.locator(".error", { hasText: PDF_MESSAGES[problem as PdfProblem] }).waitFor({ timeout: 10_000 });
        assert.equal(await page.locator(".page").count(), 0, name);
        await choose("정상.pdf", makePdf());
        await page.locator('.page[data-status="done"]').first().waitFor();
      }
      assert.deepEqual([seen.external, seen.problems], [[], []]);
    } finally {
      await browser.close();
    }
  });
}
