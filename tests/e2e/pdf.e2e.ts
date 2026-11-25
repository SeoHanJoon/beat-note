import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { chromium, webkit } from "playwright";
import type { Truth } from "../../scripts/scores/truth.ts";
import { CONVERT_MESSAGES } from "../../src/lib/convert/convert.ts";
import { PDF_MESSAGES, type PdfProblem } from "../../src/lib/convert/pdf.ts";
import type { Song } from "../../src/lib/song/types.ts";
import { badPdfs, makePdf } from "../support/make-pdf.ts";
import { serveOut, watch } from "./support.ts";

const scores = join(import.meta.dirname, "..", "scores");
let server: Server, url: string;
before(async () => ({ server, url } = await serveOut()));
after(() => {
  server.close();
  server.closeAllConnections();
});

for (const type of [chromium, webkit]) {
  test(`${type.name()}: 열면 안 되는 파일은 거절한다`, { timeout: 120_000 }, async () => {
    const browser = await type.launch();
    try {
      const page = await browser.newPage();
      const seen = watch(page, [url]);
      await page.goto(url + "/convert/");
      const choose = (name: string, data: Uint8Array) =>
        page.locator("input[type=file]").setInputFiles({ name, mimeType: "application/pdf", buffer: Buffer.from(data) });
      for (const [name, problem, data] of badPdfs) {
        await choose(name + ".pdf", data());
        await page.locator(".error", { hasText: PDF_MESSAGES[problem as PdfProblem] }).waitFor({ timeout: 10_000 });
      }
      await choose("악보 아님.pdf", makePdf());
      await page.locator(".error", { hasText: CONVERT_MESSAGES["no-score"] }).waitFor({ timeout: 60_000 });
      assert.deepEqual([seen.external, seen.problems], [[], []]);
    } finally {
      await browser.close();
    }
  });

  test(`${type.name()}: PDF를 박자 노트 HTML로 바꾼다`, { timeout: 180_000 }, async () => {
    const browser = await type.launch();
    try {
      const page = await browser.newPage();
      const seen = watch(page, [url]);
      await page.goto(url + "/convert/");
      await page.waitForLoadState("networkidle");
      const sent: string[] = [];
      page.on("request", (request) => {
        if (request.method() !== "GET" || request.postData()) sent.push(`${request.method()} ${request.url()}`);
      });
      await page.locator("input[type=file]").setInputFiles(join(scores, "d-repeat.pdf"));
      await page.locator(".summary").waitFor({ timeout: 150_000 });
      await page.getByRole("tab", { name: "미리보기" }).click();
      const note = page.frameLocator("iframe.note-preview");
      await note.locator(".row").first().waitFor();
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "HTML 내려받기" }).click()]);
      const html = readFileSync(await download.path(), "utf8");
      const song = JSON.parse(/id="song-data">([\s\S]*?)<\/script>/.exec(html)![1]!) as Song;
      const truth = JSON.parse(readFileSync(join(scores, "d-repeat.json"), "utf8")) as Truth;
      assert.equal(song.title, truth.title);
      const count = song.items.reduce((n, i) => n + (i.type === "measure" ? 1 : i.type === "instrumental" ? i.count : 0), 0);
      assert.equal(count, truth.order.length);
      const text = song.items.flatMap((i) => (i.type === "measure" ? i.beats.flatMap((b) => b.notes.flatMap((n) => (n.kind === "note" ? [n.text] : []))) : [])).join("");
      assert.ok(text.startsWith("창이대로앉아서노래"), text);
      assert.deepEqual(sent, [], "파일을 고른 뒤에 보낸 것이 없음");
      assert.deepEqual([seen.external, seen.problems], [[], []]);
    } finally {
      await browser.close();
    }
  });
}
