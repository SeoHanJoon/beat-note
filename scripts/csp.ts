// 빌드한 HTML마다 인라인 스크립트의 해시를 넣은 CSP를 적는다. 어느 호스팅에서든 같은 보호를 받게 한다.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = join(import.meta.dirname, "..", "out");

export function policyFor(html: string): string {
  const hashes = new Set<string>();
  for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\ssrc=/.test(attributes!) || /type="application\/(?:ld\+)?json"/.test(attributes!)) continue;
    hashes.add(`'sha256-${createHash("sha256").update(body!).digest("base64")}'`);
  }
  return [
    "default-src 'none'",
    `script-src 'self' 'wasm-unsafe-eval' ${[...hashes].join(" ")}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "frame-src 'self'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join("; ");
}

for (const entry of readdirSync(out, { recursive: true, withFileTypes: true })) {
  // 결과 템플릿에는 자신의 CSP가 있다.
  if (!entry.isFile() || !entry.name.endsWith(".html") || entry.name === "note-template.html") continue;
  const path = join(entry.parentPath, entry.name);
  const html = readFileSync(path, "utf8");
  if (html.includes("Content-Security-Policy")) continue;
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policyFor(html)}"/>`;
  const next = html.replace(/<meta charSet="utf-8"\/>/i, (m) => m + meta);
  if (next === html) throw new Error(`CSP를 넣을 자리가 없음: ${path}`);
  writeFileSync(path, next);
}
