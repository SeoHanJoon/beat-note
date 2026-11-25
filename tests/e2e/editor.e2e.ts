import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { chromium, webkit, type Page } from "playwright";
import type { Song } from "../../src/lib/song/types.ts";
import { serveOut, watch } from "./support.ts";

const score = join(import.meta.dirname, "..", "scores", "d-repeat.pdf");
let server: Server, url: string;
before(async () => ({ server, url } = await serveOut()));
after(() => {
  server.close();
  server.closeAllConnections();
});

async function convert(page: Page) {
  await page.goto(url + "/convert/");
  await page.locator("input[type=file]").setInputFiles(score);
  await page.locator(".editor").waitFor({ timeout: 150_000 });
}

async function download(page: Page): Promise<Song> {
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "HTML 내려받기" }).click()]);
  return JSON.parse(/id="song-data">([\s\S]*?)<\/script>/.exec(readFileSync(await file.path(), "utf8"))![1]!) as Song;
}

const texts = (song: Song) => song.items.flatMap((i) => (i.type === "measure" ? i.beats.flatMap((b) => b.notes.flatMap((n) => (n.kind === "note" ? [n.text] : []))) : []));
const syllables = (page: Page) => page.locator("input.syllable");

for (const type of [chromium, webkit]) {
  test(`${type.name()}: 휴대폰 폭에서 고치고 되돌리고 내려받는다`, { timeout: 240_000 }, async () => {
    const browser = await type.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 360, height: 740 } });
      const seen = watch(page, [url]);
      await convert(page);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "가로로 넘치지 않음");
      const before = texts(await download(page));
      assert.deepEqual(before.slice(0, 4), ["창", "이", "대", "로"]);

      // 원본 그림이 마디마다 그려져 있다.
      const card = page.locator(".row-card.measure").nth(1);
      await card.scrollIntoViewIfNeeded();
      const ink = await card.locator("canvas.source").evaluate((c: HTMLCanvasElement) => {
        const { data } = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
        let dark = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i]! < 128) dark++;
        return dark;
      });
      assert.ok(ink > 500, `원본 그림의 검은 점 ${ink}`);

      // 누르는 곳이 손가락으로 누를 만한 크기다.
      const box = await card.locator(".kind").first().boundingBox();
      assert.ok(box!.width >= 28 && box!.height >= 28, JSON.stringify(box));

      // 여러 글자를 넣으면 다음 음으로 이어지고, Enter를 누르면 다음 칸으로 간다.
      await syllables(page).nth(1).fill("새로운");
      await syllables(page).nth(1).press("Enter");
      assert.equal(await syllables(page).nth(2).evaluate((e) => e === document.activeElement), true);
      assert.deepEqual(texts(await download(page)).slice(0, 5), ["창", "새", "로", "운", before[4]]);

      // 음 → 끌기
      await card.locator(".kind").first().click();
      assert.equal((await download(page)).items.length > 0, true);
      assert.equal(texts(await download(page)).length, before.length - 1);

      // 확인할 마디로 이동하고 확인함을 누르면 수가 준다.
      const button = page.locator(".small.check");
      const count = Number((await button.textContent())!.replace(/\D/g, ""));
      assert.ok(count >= 1);
      await button.click();
      await page.waitForFunction(() => document.activeElement?.classList.contains("needs-check"));
      await page.locator(".row-card:focus").getByRole("button", { name: "확인함" }).click();
      assert.equal(Number((await button.textContent())!.replace(/\D/g, "")), count - 1);

      // 모두 되돌린다.
      const undo = page.getByRole("button", { name: "되돌리기" });
      for (let i = 0; i < 3; i++) await undo.click();
      assert.equal(await undo.isDisabled(), true);
      assert.deepEqual(texts(await download(page)), before);

      // 마디 복제, 이동, 삭제
      const total = await page.locator(".row-card").count();
      await card.getByRole("button", { name: "복제" }).click();
      assert.equal(await page.locator(".row-card").count(), total + 1);
      await page.locator(".row-card.measure").nth(2).getByRole("button", { name: "아래로 옮기기" }).click();
      await page.locator(".row-card.measure").nth(3).getByRole("button", { name: "삭제" }).click();
      assert.equal(await page.locator(".row-card").count(), total);
      assert.deepEqual(texts(await download(page)), before);
      assert.deepEqual([seen.external, seen.problems], [[], []]);
    } finally {
      await browser.close();
    }
  });
}

test("chromium: 한글 입력기로 조합하는 동안 글자가 확정되거나 자리가 옮겨지지 않는다", { timeout: 180_000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await convert(page);
    const cdp = await page.context().newCDPSession(page);
    const input = syllables(page).nth(1);
    await input.focus();
    const composing = async (text: string) => {
      await cdp.send("Input.imeSetComposition", { text, selectionStart: text.length, selectionEnd: text.length });
      return [await input.inputValue(), await input.evaluate((e) => e === document.activeElement)];
    };
    assert.deepEqual(await composing("ㅂ"), ["ㅂ", true]);
    assert.deepEqual(await composing("바"), ["바", true]);
    // 조합 중의 Enter는 글자를 확정하는 키이므로 다음 칸으로 가지 않는다.
    await input.evaluate((e) => e.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, isComposing: true, bubbles: true, cancelable: true })));
    assert.equal(await input.evaluate((e) => e === document.activeElement), true);
    assert.deepEqual(await composing("밤"), ["밤", true]);
    assert.equal(await page.getByRole("button", { name: "되돌리기" }).isDisabled(), true, "조합 중에는 기록하지 않음");
    await cdp.send("Input.insertText", { text: "밤" });
    assert.equal(await input.inputValue(), "밤");
    await input.press("Enter");
    assert.equal(await syllables(page).nth(2).evaluate((e) => e === document.activeElement), true);
    assert.equal(texts(await download(page))[1], "밤");
  } finally {
    await browser.close();
  }
});
