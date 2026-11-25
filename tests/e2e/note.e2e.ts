// 내려받은 박자 노트가 인터넷 없이 재생·인쇄되는지 실제 브라우저에서 확인한다.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { pathToFileURL } from "node:url";
import { chromium, webkit, type Browser } from "playwright";
import { exampleSong } from "../../src/lib/song/example.ts";
import { renderNote } from "../../src/lib/song/export.ts";
import { OUT, serveOut, watch } from "./support.ts";

const dir = mkdtempSync(join(tmpdir(), "beat-note-"));
let server: Server, url: string;
before(async () => ({ server, url } = await serveOut()));
after(() => {
  server.close();
  server.closeAllConnections();
});

function writeNote(name: string, id: string, change: (html: string) => string = (html) => html) {
  const template = readFileSync(join(OUT, "note-template.html"), "utf8");
  const path = join(dir, `${name}.html`);
  writeFileSync(path, change(renderNote(template, { ...exampleSong(), id, title: name })));
  return pathToFileURL(path).href;
}

for (const type of [chromium, webkit]) {
  const run = (name: string, body: (browser: Browser) => Promise<void>) =>
    test(`${type.name()}: ${name}`, { timeout: 60_000 }, async () => {
      const browser = await type.launch();
      try {
        await body(browser);
      } finally {
        await browser.close();
      }
    });

  run("예시 페이지에서 미리 보고 내려받는다", async (browser) => {
    const page = await browser.newPage();
    const seen = watch(page, [url]);
    await page.goto(url + "/example/");
    const note = page.frameLocator("iframe.note-preview");
    await note.locator(".row").first().waitFor();
    assert.equal(await note.locator("h1").textContent(), "아침 걸음");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "HTML 내려받기" }).click()]);
    // 리눅스용 WebKit은 파일 이름의 공백을 _로 바꾼다.
    assert.match(download.suggestedFilename().normalize("NFC"), /^아침[ _]걸음\.html$/);
    const path = join(dir, `${type.name()}-download.html`);
    await download.saveAs(path);
    assert.deepEqual([seen.external, seen.problems], [[], []]);

    const offline = await browser.newPage();
    await offline.context().setOffline(true);
    const again = watch(offline, ["file:"]);
    await offline.goto(pathToFileURL(path).href);
    assert.equal(await offline.locator(".row").count(), exampleSong().items.filter((item) => item.type === "measure").length);
    assert.deepEqual([again.external, again.problems], [[], []]);
  });

  run("파일로 열어 재생하면 음이 순서대로 켜지고 끝에서 멈춘다", async (browser) => {
    const page = await browser.newPage();
    const seen = watch(page, ["file:"]);
    await page.context().setOffline(true);
    await page.goto(writeNote(`${type.name()} 재생`, "play"));
    await page.locator("#bpm").fill("240");
    await page.evaluate(() => {
      const list: string[] = ((window as never as { sung: string[] }).sung = []);
      let last: Element | null = null;
      new MutationObserver(() => {
        const cell = document.querySelector(".cell.on.sing");
        if (cell && cell !== last) list.push(cell.querySelector(".syl")!.textContent!);
        last = cell;
      }).observe(document.getElementById("sheet")!, { subtree: true, attributes: true, attributeFilter: ["class"] });
    });
    await page.locator("#play").click();
    await page.waitForFunction(() => !document.getElementById("play")!.classList.contains("on"), undefined, { timeout: 40_000 });
    const expected = exampleSong().items.flatMap((item) =>
      item.type === "measure" ? item.beats.flatMap((beat) => beat.notes.flatMap((note) => (note.kind === "note" ? [note.text] : []))) : [],
    );
    const sung = await page.evaluate(() => (window as never as { sung: string[] }).sung);
    assert.deepEqual(sung, expected);
    assert.equal(await page.locator(".now, .sing, .active").count(), 0);
    assert.deepEqual([seen.external, seen.problems], [[], []]);
  });

  run("빠르기 등 저장값이 곡마다 따로다", async (browser) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const [a, b] = [writeNote(`${type.name()} 가`, "a"), writeNote(`${type.name()} 나`, "b")];
    const state = () =>
      page.evaluate(() => [
        (document.getElementById("bpm") as HTMLInputElement).value,
        document.querySelector<HTMLInputElement>("input[name=count]:checked")!.value,
        String((document.getElementById("hold") as HTMLInputElement).checked),
        document.querySelector<HTMLInputElement>("input[name=metro]:checked")!.value,
      ]);
    await page.goto(a);
    await page.locator("#bpm").fill("111");
    await page.locator("input[name=count][value=ea]").check({ force: true });
    await page.locator("#hold").uncheck({ force: true });
    await page.locator("input[name=metro][value=off]").check({ force: true });
    await page.goto(b);
    assert.deepEqual(await state(), ["84", "num", "true", "all"]);
    await page.goto(a);
    assert.deepEqual(await state(), ["111", "ea", "false", "off"]);
  });

  run("파일에 끼워 넣은 스크립트는 CSP가 막는다", async (browser) => {
    const page = await browser.newPage();
    const evil = "<script>window.hacked=1</script><img src=x onerror='window.hacked=2'><script src='https://example.com/a.js'></script>";
    await page.goto(writeNote(`${type.name()} 공격`, "x", (html) => html.replace("<header", evil + "<header")));
    await page.locator(".row").first().waitFor();
    assert.equal(await page.evaluate(() => (window as never as { hacked?: number }).hacked), undefined);
  });

  run("휴대폰 폭에서 가로로 넘치지 않는다", async (browser) => {
    const page = await browser.newPage({ viewport: { width: 360, height: 740 } });
    await page.goto(writeNote(`${type.name()} 폭`, "w"));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  });
}

test("chromium: 인쇄하면 조작 막대 없이 악보만 나온다", { timeout: 60_000 }, async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(writeNote("인쇄", "print"));
  await page.emulateMedia({ media: "print" });
  assert.equal(await page.locator(".bar").isVisible(), false);
  assert.equal(await page.locator(".row").first().isVisible(), true);
  const pdf = await page.pdf({ preferCSSPageSize: true });
  assert.ok(pdf.subarray(0, 5).toString() === "%PDF-" && pdf.length > 10_000);
  await browser.close();
});
