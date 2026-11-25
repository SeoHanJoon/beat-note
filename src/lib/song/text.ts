/**
 * 곡 데이터 ↔ 글.
 *
 *   @title 제목          곡 정보 (id, title, artist, credits, copyright, bpm, time)
 *   # 1절 / 설명         구간
 *   - 연주 3마디         노래 없는 마디
 *   > .4|.4|.4|가4       못갖춘 시작
 *   가2 나1 다1|~2 .2    한 줄 = 한 마디, | = 박, ~ = 끌기, . = 쉼표, _ = 글자 없는 음
 *   [2/4] 가4|나4        박자표가 다른 마디
 *   3:가1 나1 다1|...    한 박을 3칸으로 나눔
 *   가?2                 확신이 낮은 글자
 *   가4|나4 * 메모       메모
 *   ? 이유               다음 마디를 확인해야 하는 이유
 *
 * 글자 속의 특수 문자는 앞에 \ 를 붙인다.
 */
import { isValidTime, meterOf, sameTime, timeOf } from "./time.ts";
import { BPM_MAX, BPM_MIN, MAX_DIV, type Beat, type Measure, type Note, type Song, type Time } from "./types.ts";

export class SongTextError extends Error {
  line: number;
  constructor(line: number, message: string) {
    super(`${line}번째 줄: ${message}`);
    this.line = line;
  }
}

const SPECIAL = /[\\|~._*?#\-@>[\]:\s/]/g;

/** 줄바꿈과 제어 문자를 없애고 앞뒤 공백을 지운다. */
export function cleanLine(text: string): string {
  return text.replace(/[\p{Cc}\p{Zl}\p{Zp}\ufeff]+/gu, " ").replace(/\s+/g, " ").trim();
}

const escape = (text: string) => text.replace(SPECIAL, (c) => "\\" + c);
const unescape = (text: string) => text.replace(/\\(.)/gu, "$1");

/** 이스케이프되지 않은 구분자로 나눈다. */
function splitOn(text: string, isSeparator: (c: string) => boolean, limit = Infinity): string[] {
  const parts: string[] = [];
  let part = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === "\\" && i + 1 < text.length) part += c + text[++i];
    else if (isSeparator(c) && parts.length < limit - 1) {
      parts.push(part);
      part = "";
    } else part += c;
  }
  parts.push(part);
  return parts;
}

export function formatTime(time: Time): string {
  return `${time.beats}/${time.unit}`;
}

export function parseTime(text: string): Time | undefined {
  const m = /^(\d{1,2})\/(\d)$/.exec(text.trim());
  const time = m && { beats: Number(m[1]), unit: Number(m[2]) };
  return time && isValidTime(time) ? time : undefined;
}

function formatNote(note: Note): string {
  if (note.kind === "rest") return `.${note.len}`;
  if (note.kind === "hold") return `~${note.len}`;
  return `${note.text === "" ? "_" : escape(note.text)}${note.unsure ? "?" : ""}${note.len}`;
}

export function formatBeats(beats: Beat[], defaultDiv: number): string {
  return beats
    .map((beat) => (beat.div === defaultDiv ? "" : `${beat.div}:`) + beat.notes.map(formatNote).join(" "))
    .join("|");
}

export function formatMeasure(measure: Measure, time: Time): string {
  let line = measure.pickup ? "> " : "";
  if (measure.time) line += `[${formatTime(measure.time)}] `;
  line += formatBeats(measure.beats, meterOf(measure.time ?? time).div);
  if (measure.memo) line += ` * ${measure.memo}`;
  return line;
}

export function formatSong(song: Song): string {
  const lines = [`@id ${song.id}`, `@title ${song.title}`];
  if (song.artist) lines.push(`@artist ${song.artist}`);
  if (song.credits) lines.push(`@credits ${song.credits}`);
  if (song.copyright) lines.push(`@copyright ${song.copyright}`);
  lines.push(`@bpm ${song.bpm}`, `@time ${formatTime(song.time)}`, "");
  for (const item of song.items) {
    if (item.type === "section") {
      lines.push(`# ${escapeTitle(item.title)}${item.note ? ` / ${escapeTitle(item.note)}` : ""}`);
    } else if (item.type === "instrumental") {
      lines.push(`- ${item.time ? `[${formatTime(item.time)}] ` : ""}${item.label} ${item.count}마디`);
    } else {
      if (item.check) lines.push(`? ${item.check}`);
      lines.push(formatMeasure(item, song.time));
    }
  }
  return lines.join("\n") + "\n";
}

const escapeTitle = (text: string) => text.replace(/[\\/]/g, (c) => "\\" + c);

export function parseBeat(text: string, defaultDiv: number, fail: (message: string) => never): Beat {
  let div = defaultDiv;
  const prefix = /^\s*(\d):/.exec(text);
  if (prefix) {
    div = Number(prefix[1]);
    text = text.slice(prefix[0].length);
  }
  if (div < 1 || div > MAX_DIV) fail(`한 박은 1~${MAX_DIV}칸이어야 함`);
  const notes: Note[] = [];
  let sum = 0;
  for (const token of splitOn(text.trim(), (c) => /\s/.test(c))) {
    if (token === "") continue;
    const len = Number(token.at(-1));
    let body = token.slice(0, -1);
    if (!(len >= 1) || body === "" || /(^|[^\\])(\\\\)*\\$/.test(body)) fail(`"${token}"을 읽을 수 없음`);
    sum += len;
    if (body === ".") notes.push({ kind: "rest", len });
    else if (body === "~") notes.push({ kind: "hold", len });
    else {
      const unsure = /(^|[^\\])(\\\\)*\?$/.test(body);
      if (unsure) body = body.slice(0, -1);
      const value = body === "_" ? "" : unescape(body);
      notes.push(unsure ? { kind: "note", text: value, len, unsure } : { kind: "note", text: value, len });
    }
  }
  if (sum !== div) fail(`한 박은 ${div}칸이어야 하는데 ${sum}칸임`);
  return { div, notes };
}

export function parseMeasure(line: string, songTime: Time, fail: (message: string) => never): Measure {
  const measure: Measure = { type: "measure", beats: [] };
  let body = line.trim();
  if (body.startsWith(">")) {
    measure.pickup = true;
    body = body.slice(1).trim();
  }
  const time = /^\[([^\]]*)\]/.exec(body);
  if (time) {
    const value = parseTime(time[1]!) ?? fail(`"${time[1]}"은 쓸 수 없는 박자표`);
    if (!sameTime(value, songTime)) measure.time = value;
    body = body.slice(time[0].length);
  }
  const [notes, memo] = splitOn(body, (c) => c === "*", 2) as [string, string?];
  if (memo?.trim()) measure.memo = cleanLine(memo);
  const meter = meterOf(measure.time ?? songTime);
  measure.beats = splitOn(notes, (c) => c === "|").map((beat) => parseBeat(beat, meter.div, fail));
  if (measure.beats.length !== meter.beats)
    fail(`${formatTime(measure.time ?? songTime)}은 ${meter.beats}박이어야 하는데 ${measure.beats.length}박임`);
  return measure;
}

export function parseSong(text: string): Song {
  const song: Song = {
    id: "",
    title: "",
    artist: "",
    credits: "",
    copyright: "",
    bpm: 80,
    time: { beats: 4, unit: 4 },
    items: [],
  };
  let check: string | undefined;
  text.split(/\r\n?|\n/).forEach((raw, index) => {
    const line = raw.trim();
    const fail = (message: string): never => {
      throw new SongTextError(index + 1, message);
    };
    if (line === "") return;
    const rest = line.slice(1).trim();
    if (line[0] === "@") {
      const [, key, value] = /^(\S+)\s*(.*)$/.exec(rest) ?? fail("항목 이름이 없음");
      if (key === "bpm") {
        const bpm = Number(value);
        if (!Number.isInteger(bpm) || bpm < BPM_MIN || bpm > BPM_MAX) fail(`빠르기는 ${BPM_MIN}~${BPM_MAX}이어야 함`);
        song.bpm = bpm;
      } else if (key === "time") {
        song.time = parseTime(value!) ?? fail(`"${value}"은 쓸 수 없는 박자표`);
      } else if (key === "id" || key === "title" || key === "artist" || key === "credits" || key === "copyright") {
        song[key] = cleanLine(value!);
      } else fail(`모르는 항목 "${key}"`);
    } else if (line[0] === "#") {
      const [title, note] = splitOn(rest, (c) => c === "/", 2).map((s) => cleanLine(s.replace(/\\(.)/gu, "$1")));
      song.items.push(note ? { type: "section", title: title!, note } : { type: "section", title: title! });
    } else if (line[0] === "-") {
      const m = /^(?:\[([^\]]*)\]\s*)?(.*?)\s*(\d{1,3})마디$/.exec(rest) ?? fail("\"- 연주 3마디\" 형식이어야 함");
      const count = Number(m[3]);
      if (count < 1) fail("마디 수는 1 이상이어야 함");
      const time = m[1] === undefined ? undefined : (parseTime(m[1]) ?? fail(`"${m[1]}"은 쓸 수 없는 박자표`));
      const item = { type: "instrumental" as const, label: cleanLine(m[2]!), count };
      song.items.push(time && !sameTime(time, song.time) ? { ...item, time } : item);
    } else if (line[0] === "?") {
      check = cleanLine(rest);
    } else {
      const measure = parseMeasure(line, song.time, fail);
      if (check) measure.check = check;
      check = undefined;
      song.items.push(measure);
    }
  });
  return song;
}

/** 어디서 온 데이터든 글로 나타낼 수 있는 모양으로 다듬는다. 고칠 수 없으면 오류. */
export function normalizeSong(song: Song): Song {
  return parseSong(formatSong({ ...song, items: song.items.map((item) => cleanItem(item, song)) }));
}

function cleanItem(item: Song["items"][number], song: Song): Song["items"][number] {
  if (item.type === "section") return { ...item, title: cleanLine(item.title), note: item.note && cleanLine(item.note) };
  if (item.type === "instrumental") return { ...item, label: cleanLine(item.label).replace(/^\[+\s*/, "") };
  const div = meterOf(timeOf(song, item)).div;
  return {
    ...item,
    memo: item.memo && cleanLine(item.memo),
    check: item.check && cleanLine(item.check),
    beats: item.beats.map((beat) => ({
      div: beat.div || div,
      notes: beat.notes.map((note) => (note.kind === "note" ? { ...note, text: cleanLine(note.text) } : note)),
    })),
  };
}
