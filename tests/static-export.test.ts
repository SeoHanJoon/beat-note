// `npm run build`로 만든 out/이 정적 파일만으로 열리는지 확인한다.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const OUT = join(import.meta.dirname, "..", "out");

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

/** 정적 서버처럼 주소를 파일로 바꾼다. 폴더 주소는 그 안의 index.html로 본다. */
function resolvePath(url: string): string | undefined {
  const path = join(OUT, decodeURIComponent(url.replace(/[?#].*$/, "")));
  if (!existsSync(path)) return undefined;
  if (!statSync(path).isDirectory()) return path;
  const index = join(path, "index.html");
  return existsSync(index) ? index : undefined;
}

function linksIn(html: string): string[] {
  return [...html.matchAll(/\s(?:href|src)="([^"]*)"/g)].map((m) => m[1]!).filter((url) => !url.startsWith("#"));
}

test("빌드 결과가 있다", () => {
  assert.ok(existsSync(OUT), "먼저 npm run build를 실행해야 함");
  assert.ok(resolvePath("/"));
  assert.ok(existsSync(join(OUT, "404.html")));
});

test("홈은 스크립트 없이도 내용이 있는 한국어 HTML이다", () => {
  const html = readFileSync(join(OUT, "index.html"), "utf8");
  assert.match(html, /<html lang="ko"/);
  assert.match(html, /<h1>[^<]+<\/h1>/);
  assert.match(html, /<title>[^<]+<\/title>/);
});

test("페이지가 가리키는 파일이 모두 out/ 안에 있고 외부 주소를 부르지 않는다", () => {
  const pages = listFiles(OUT).filter((file) => file.endsWith(".html"));
  let checked = 0;
  for (const page of pages) {
    for (const url of linksIn(readFileSync(page, "utf8"))) {
      assert.ok(url.startsWith("/") && !url.startsWith("//"), `외부 또는 상대 주소: ${url} (${page})`);
      assert.ok(resolvePath(url), `없는 파일: ${url} (${page})`);
      checked++;
    }
  }
  assert.ok(checked > 0, "확인한 주소가 하나도 없음");
});

test("스타일이 외부 주소를 부르지 않는다", () => {
  const styles = listFiles(OUT).filter((file) => file.endsWith(".css"));
  assert.ok(styles.length > 0);
  for (const file of styles) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /(?:url\(|@import)\s*["']?(?:https?:)?\/\//, file);
  }
});
