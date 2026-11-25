import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { exampleSong } from "../src/lib/song/example.ts";
import { noteFileName, renderNote } from "../src/lib/song/export.ts";
import type { Song } from "../src/lib/song/types.ts";

const template = readFileSync(join(import.meta.dirname, "..", "public", "note-template.html"), "utf8");
const ATTACKS = [
  "</script><script>alert(1)</script>", "<!--<script>", "]]>", "\"><img src=x onerror=alert(1)>", "' onload='x", "</title><b>",
  "$&$`$'", "\u2028alert(1)", "&lt;script&gt;", "</SCRIPT >", "<script",
];

function dataOf(html: string): Song {
  return JSON.parse(/id="song-data">([\s\S]*?)<\/script>/.exec(html)![1]!);
}

test("곡의 모든 글자 자리에 넣은 태그가 실행될 수 없다", () => {
  const tags = (html: string) => html.match(/<\/?[a-z!][^>\s]*/gi)!;
  const normal = tags(renderNote(template, exampleSong()));
  for (const attack of ATTACKS) {
    const song: Song = {
      id: attack, title: attack, artist: attack, credits: attack, copyright: attack, bpm: 80, time: { beats: 2, unit: 4 },
      items: [
        { type: "section", title: attack, note: attack },
        { type: "instrumental", label: attack, count: 1 },
        { type: "measure", memo: attack, check: attack, beats: [0, 1].map(() => ({ div: 4, notes: [{ kind: "note", text: attack, len: 4 }] })) },
      ],
    };
    const html = renderNote(template, song);
    assert.deepEqual(tags(html), normal, attack);
    const data = dataOf(html);
    const measure = data.items[2]!;
    assert.ok(measure.type === "measure" && measure.beats[0]!.notes[0]!.kind === "note");
    assert.equal(measure.beats[0]!.notes[0]!.text, attack.replace(/\u2028/g, " ").trim());
  }
});

test("템플릿은 문자열을 HTML로 넣지 않고 외부 주소를 부르지 않는다", () => {
  assert.doesNotMatch(template, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/);
  assert.doesNotMatch(template, /(?:src|href)\s*=|url\(|@import|fetch\(|XMLHttpRequest|https?:/);
});

test("템플릿의 CSP 해시가 스크립트와 맞는다 (npm run template)", () => {
  const script = /<script>([\s\S]*?)<\/script>/.exec(template)![1]!;
  const hash = createHash("sha256").update(script).digest("base64");
  assert.ok(template.includes(`script-src 'sha256-${hash}'`));
});

test("템플릿에 곡 데이터가 없다", () => {
  assert.match(template, /id="song-data"><\/script>/);
  assert.match(template, /<h1><\/h1>/);
});

test("쓸 수 없는 글자를 뺀 파일 이름", () => {
  const name = (title: string) => noteFileName({ ...exampleSong(), title });
  assert.equal(name("아침 걸음"), "아침 걸음.html");
  assert.equal(name("../a/b:c?"), "a b c.html");
  assert.equal(name("\u202e..."), "박자 노트.html");
  assert.ok(name("가".repeat(300)).length < 100);
});
