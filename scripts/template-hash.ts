// 결과 템플릿의 스크립트 해시를 CSP에 적는다. --check면 맞는지만 확인한다.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const path = join(import.meta.dirname, "..", "public", "note-template.html");
const html = readFileSync(path, "utf8");
const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
if (script === undefined) throw new Error("템플릿에 스크립트가 없음");
const hash = createHash("sha256").update(script).digest("base64");
const next = html.replace(/script-src 'sha256-[^']*'/, () => `script-src 'sha256-${hash}'`);
if (process.argv.includes("--check")) {
  if (next !== html) {
    console.error("템플릿의 스크립트가 바뀌었음. npm run template을 실행해야 함");
    process.exit(1);
  }
} else if (next !== html) writeFileSync(path, next);
