import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize } from "node:path";
import type { BrowserContext, Page } from "playwright";

export const OUT = join(import.meta.dirname, "..", "..", "out");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".json": "application/json", ".wasm": "application/wasm", ".txt": "text/plain; charset=utf-8",
};

/** 실제 배포에서 붙는 보안 헤더. 시험 서버는 http라 HSTS만 뺀다. */
const HEADERS = Object.fromEntries(
  (JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "vercel.json"), "utf8")) as { headers: { headers: { key: string; value: string }[] }[] }).headers
    .flatMap((h) => h.headers)
    .filter((h) => h.key !== "Strict-Transport-Security")
    .map((h) => [h.key, h.value]),
);

/** out/을 보안 헤더와 함께 내보내는 단순한 정적 서버. headers가 false면 헤더 없이 */
/** BEAT_NOTE_URL이 있으면 그 주소(공개 사이트)를 시험한다. */
export const REMOTE = process.env.BEAT_NOTE_URL?.replace(/\/$/, "");

export async function serveOut(headers = true): Promise<{ url: string; server: Server }> {
  if (REMOTE) return { url: REMOTE, server: createServer() };
  const server = createServer((request, response) => {
    let path = normalize(join(OUT, decodeURIComponent(new URL(request.url!, "http://x").pathname)));
    if (path.startsWith(OUT) && existsSync(path) && statSync(path).isDirectory()) path = join(path, "index.html");
    const found = path.startsWith(OUT) && existsSync(path);
    if (!found) path = join(OUT, "404.html");
    response.writeHead(found ? 200 : 404, { "content-type": TYPES[extname(path)] ?? "application/octet-stream", ...(headers ? HEADERS : {}) });
    createReadStream(path).pipe(response);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("서버 주소를 알 수 없음");
  return { url: `http://127.0.0.1:${address.port}`, server };
}

/** 페이지의 오류와, 허용한 주소 밖으로 나간 요청을 모은다. */
export function watch(target: Page | BrowserContext, allowed: string[]) {
  const problems: string[] = [];
  const requests: string[] = [];
  const external: string[] = [];
  const page = target as Page;
  page.on("request", (request) => {
    const url = request.url();
    requests.push(url);
    if (!allowed.some((prefix) => url.startsWith(prefix)) && !/^(data|blob):/.test(url)) external.push(url);
  });
  page.on("console", (message) => message.type() === "error" && problems.push(message.text()));
  if ("mainFrame" in page) page.on("pageerror", (error) => problems.push(String(error)));
  return { problems, requests, external };
}
