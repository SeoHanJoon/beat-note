// 인식 규칙을 맞추는 데 쓰지 않는 무작위 악보
import type { MeasureSource, ScoreSource } from "./source.ts";
import { parseNotes } from "./truth.ts";

const FONTS = ["Leipzig", "Bravura", "Leland", "Gootville"];
const TEXT = ["Noto Sans KR", "Nanum Myeongjo", "Nanum Gothic", "Gowun Dodum"];
const SYLLABLES = [..."가나다라마바사아자차카타파하고노도로모보소오조초코토포호구누두루무부수우주추그는를을이에의서한만있없었했겠되된할말날달별빛꽃잎길물불밤봄눈꿈맘너내네때더또왜왔봐줘돼괜찮좋싫웃울걸음람랑행복함께처럼까지부터언젠어디누군무엇생각기억약속영원"];
const CHORDS = ["C", "Am", "F", "G7", "Dm7", "Em", "Bb", "D/F#", "Gsus4", "Cmaj7", "E7", "Fm"];

/** 박 하나를 채우는 리듬. 앞의 숫자는 나올 비율 */
const SIMPLE: [number, string][] = [
  [6, "8 8"], [4, "4"], [2, "16 16 8"], [2, "8 16 16"], [2, "8. 16"], [1, "16 8."], [1, "16 8 16"], [1, "16 16 16 16"], [1, "r4"], [1, "r8 8"], [1, "8 r8"], [1, "r8 16 16"], [0.5, "r16 16 8"], [0.6, "3(8 8 8)"], [0.4, "8 r16 16"], [0.4, "r8. 16"],
];
const LONG: [number, string][] = [[2, "2"], [1.5, "4. 8"], [0.7, "r2"], [0.7, "8 4 8"], [0.5, "4. r8"]];
const COMPOUND: [number, string][] = [[4, "8 8 8"], [3, "4 8"], [3, "4."], [1, "8 4"], [1, "r4 8"], [1, "8. 16 8"], [1, "16 16 8 8"], [0.7, "r4."], [0.7, "8 r8 8"]];

export function randomScore(seed: number): ScoreSource {
  let state = seed * 7919 + 13;
  const next = () => ((state = (Math.imul(state, 1103515245) + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < 5; i++) next();
  const pick = <T>(list: T[]) => list[Math.floor(next() * list.length)]!;
  const weighted = (list: [number, string][]) => {
    let r = next() * list.reduce((s, [w]) => s + w, 0);
    return list.find(([w]) => (r -= w) < 0)?.[1] ?? list[0]![1];
  };
  const meter = pick(["4/4", "4/4", "4/4", "3/4", "6/8", "2/4"]);
  const key = pick(["0", "1f", "2f", "1s", "2s", "3s"]);
  const beats = meter === "6/8" ? 2 : Number(meter[0]);
  const scale = [1, "d", "e", "f", "g", "a", "b", "c"].slice(1) as string[];
  let at = 5 + Math.floor(next() * 4);
  /** 높이 번호 → 음이름. 조표에 있는 변화표는 그대로 따른다. */
  const accidentals: Record<string, string> = Object.fromEntries(({ "0": [], "1f": ["bb"], "2f": ["bb", "eb"], "1s": ["f#"], "2s": ["f#", "c#"], "3s": ["f#", "c#", "g#"] } as Record<string, string[]>)[key]!.map((n) => [n[0]!, n]));
  const pitch = () => {
    at = Math.max(0, Math.min(12, at + Math.floor(next() * 5) - 2));
    const names = ["c", ...scale.slice(0, 6)];
    const name = names[at % 7]!;
    return `${accidentals[name] ?? name}${4 + Math.floor(at / 7)}`;
  };
  const measures: MeasureSource[] = [];
  const count = 10 + Math.floor(next() * 7);
  const verses = next() < 0.4 ? 2 : 1;
  let tied = false, lastPitch = "";
  for (let m = 0; m < count; m++) {
    const last = m === count - 1;
    let parts: string[] = [];
    for (let b = 0; b < beats; ) {
      if (meter !== "6/8" && b + 2 <= beats && b % 2 === 0 && next() < 0.25) {
        parts.push(weighted(LONG));
        b += 2;
      } else {
        parts.push(weighted(meter === "6/8" ? COMPOUND : SIMPLE));
        b++;
      }
    }
    if (last) parts = [meter === "4/4" ? "1" : meter === "3/4" ? "2." : meter === "6/8" ? "2." : "2"];
    const tokens = parts.join(" ").split(" ");
    const notes = tokens.map((token, i) => {
      const open = token.startsWith("3(") ? "3(" : "", close = token.endsWith(")") ? ")" : "";
      const body = token.replace("3(", "").replace(")", "");
      if (body.startsWith("r")) {
        tied = false;
        return `${open}r:${body.slice(1)}${close}`;
      }
      lastPitch = tied ? lastPitch : pitch();
      const final = last && i === tokens.length - 1;
      tied = !final && next() < 0.12 && !open && !close && !(tokens[i + 1] ?? "").startsWith("r") && !(tokens[i + 1] ?? "").startsWith("3(");
      // 다음 마디의 첫 음은 아직 모르므로 마디를 넘는 붙임줄은 만들지 않는다.
      if (i === tokens.length - 1) tied = false;
      return `${open}${lastPitch}:${body}${tied ? "~" : ""}${close}`;
    });
    const text = notes.join(" ");
    let held = false, need = 0;
    for (const n of parseNotes(text)) {
      if (n.pitch !== null && !held) need++;
      held = n.tie;
    }
    const line = () => Array.from({ length: need }, () => pick(SYLLABLES)).join("");
    const sung = m > 0 || next() < 0.5;
    measures.push({ notes: text, lyrics: sung ? Array.from({ length: verses }, line) : [], harm: Array.from({ length: 1 + Math.floor(next() * 2) }, () => pick(CHORDS)), ...(last ? { right: "end" as const } : {}) });
  }
  return {
    name: `random-${seed}`, title: `무작위 악보 ${seed}`, credits: "beat-note 시험 악보", copyright: "ⓒ 2026 beat-note 시험 악보",
    musicFont: FONTS[seed % 4]!, textFont: TEXT[(seed >> 2) % 4]!, scale: 80 + (seed % 5) * 6, meter, key, measures, order: [[0, count - 1, 0]],
  };
}
