import assert from "node:assert/strict";
import { test } from "node:test";
import { EXAMPLE_TEXT, exampleSong } from "../src/lib/song/example.ts";
import { formatSong, normalizeSong, parseSong, SongTextError } from "../src/lib/song/text.ts";
import { meterOf } from "../src/lib/song/time.ts";
import type { Beat, Item, Note, Song, Time } from "../src/lib/song/types.ts";

/** 실패를 다시 만들 수 있는 난수 */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TIMES: Time[] = [
  { beats: 4, unit: 4 }, { beats: 3, unit: 4 }, { beats: 2, unit: 4 }, { beats: 6, unit: 8 },
  { beats: 12, unit: 8 }, { beats: 7, unit: 8 }, { beats: 2, unit: 2 }, { beats: 5, unit: 4 },
];
const TEXTS = [
  "가", "힣", "love", "3", "a1", "~", ".", "|", "_", "?", "a?", "\\", "\\\\", "a\\", "*", "#", "-", "@", ">", "[2/4]",
  "3:", "/", "", "😀", "가 나", "<b>", "</script>", "&amp;", "\u2028", "$&", "가?", "??", "\\?",
];

function randomSong(seed: number): Song {
  const next = random(seed);
  const pick = <T>(list: T[]) => list[Math.floor(next() * list.length)]!;
  const time = pick(TIMES);
  const beat = (defaultDiv: number): Beat => {
    const div = next() < 0.3 ? pick([1, 2, 3, 4, 5, 6, 8]) : defaultDiv;
    const notes: Note[] = [];
    for (let left = div; left > 0; ) {
      const len = 1 + Math.floor(next() * left);
      left -= len;
      const kind = next();
      if (kind < 0.2) notes.push({ kind: "rest", len });
      else if (kind < 0.4) notes.push({ kind: "hold", len });
      else if (kind < 0.5) notes.push({ kind: "note", text: pick(TEXTS), len, unsure: true });
      else notes.push({ kind: "note", text: pick(TEXTS), len });
    }
    return { div, notes };
  };
  const items: Item[] = [];
  for (let i = 0; i < 12; i++) {
    const kind = next();
    const other = next() < 0.2 ? pick(TIMES) : undefined;
    if (kind < 0.15) items.push({ type: "section", title: pick(TEXTS), note: pick(TEXTS) });
    else if (kind < 0.25) items.push({ type: "instrumental", label: pick(TEXTS), count: 1 + Math.floor(next() * 20), time: other });
    else {
      const meter = meterOf(other ?? time);
      items.push({
        type: "measure",
        time: other,
        pickup: next() < 0.1 ? true : undefined,
        memo: next() < 0.2 ? pick(TEXTS) : undefined,
        check: next() < 0.2 ? pick(TEXTS) : undefined,
        beats: Array.from({ length: meter.beats }, () => beat(meter.div)),
      });
    }
  }
  return { id: "r" + seed, title: pick(TEXTS), artist: pick(TEXTS), credits: pick(TEXTS), copyright: pick(TEXTS), bpm: 30 + Math.floor(next() * 211), time, items };
}

test("예제: 글 → 데이터 → 글", () => {
  assert.equal(formatSong(exampleSong()).replace(/\n+/g, "\n"), EXAMPLE_TEXT.replace(/\n+/g, "\n"));
});

test("무작위 곡 2000개: 데이터 → 글 → 데이터", () => {
  for (let seed = 0; seed < 2000; seed++) {
    const song = normalizeSong(randomSong(seed));
    assert.deepEqual(parseSong(formatSong(song)), song, `seed ${seed}`);
    assert.deepEqual(normalizeSong(song), song, `seed ${seed}`);
  }
});

test("다듬어도 음표 글자가 그대로다", () => {
  for (let seed = 0; seed < 300; seed++) {
    const song = randomSong(seed);
    const texts = (s: Song) =>
      s.items.flatMap((i) => (i.type === "measure" ? i.beats.flatMap((b) => b.notes.map((n) => (n.kind === "note" ? n.text.replace(/\s+/g, " ").trim() : n.kind) + n.len)) : []));
    assert.deepEqual(texts(normalizeSong(song)), texts(song), `seed ${seed}`);
  }
});

test("박 길이와 박 수가 맞지 않으면 줄 번호와 함께 거절한다", () => {
  const cases: [string, RegExp][] = [
    ["@time 4/4\n가4|나4|다4|라3", /2번째 줄: 한 박은 4칸이어야 하는데 3칸임/],
    ["가4|나4|다4", /4박이어야 하는데 3박임/],
    ["@time 4/5", /박자표/],
    ["@bpm 999", /빠르기/],
    ["[9/9] 가4", /박자표/],
    ["- 연주", /형식/],
    ["가x|나4|다4|라4", /읽을 수 없음/],
    ["@nope 1", /모르는 항목/],
  ];
  for (const [text, message] of cases) {
    assert.throws(() => parseSong(text), (error: unknown) => error instanceof SongTextError && message.test(error.message), text);
  }
});

test("박자표를 박으로 바꾼다", () => {
  assert.deepEqual(meterOf({ beats: 6, unit: 8 }), { beats: 2, quarters: 1.5, div: 6 });
  assert.deepEqual(meterOf({ beats: 2, unit: 2 }), { beats: 4, quarters: 1, div: 4 });
  assert.deepEqual(meterOf({ beats: 7, unit: 8 }), { beats: 7, quarters: 0.5, div: 2 });
});
