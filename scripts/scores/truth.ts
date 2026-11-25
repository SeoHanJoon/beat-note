// 시험 악보 원본 → 정답과 MEI
import type { MeasureSource, ScoreSource } from "./source.ts";

/** 4분음표 = 48 */
export const QUARTER = 48;
export type Event = { kind: "on" | "hold" | "rest"; ticks: number; text?: string };

type Parsed = { pitch: string | null; accid: string; octave: string; dur: number; dots: number; tie: boolean; slurred: boolean; triplet: number; ticks: number };

export function parseNotes(text: string): Parsed[] {
  const out: Parsed[] = [];
  let triplet = 0, inTriplet = false;
  for (let token of text.trim().split(/\s+/)) {
    if (token.startsWith("3(")) {
      inTriplet = true;
      triplet++;
      token = token.slice(2);
    }
    const last = token.endsWith(")");
    if (last) token = token.slice(0, -1);
    const match = /^(?:([a-g])([#bn]?)(\d)|r):(\d+)(\.*)(~?)(\^?)$/.exec(token);
    if (!match) throw new Error(`읽을 수 없는 음표 ${token}`);
    const dur = Number(match[4]), dots = match[5]!.length;
    let ticks = ((QUARTER * 4) / dur) * (2 - 1 / 2 ** dots);
    if (inTriplet) ticks = (ticks * 2) / 3;
    out.push({ pitch: match[1] ?? null, accid: match[2] ?? "", octave: match[3] ?? "", dur, dots, tie: match[6] === "~", slurred: match[7] === "^", triplet: inTriplet ? triplet : 0, ticks });
    if (last) inTriplet = false;
  }
  return out;
}

export function measureTicks(meter: string): number {
  const [beats, unit] = meter.split("/").map(Number) as [number, number];
  return (beats * QUARTER * 4) / unit;
}

/** 부르는 성부의 정답. 가사가 없는 마디는 text가 없다. */
export function eventsOf(source: MeasureSource, verse: number, tiedIn: boolean): { events: Event[]; tiedOut: boolean } {
  const notes = parseNotes(source.low ?? source.notes);
  const lyric = [...(source.lyrics[source.lyrics.length > 1 ? verse : 0] ?? "").replace(/\s/g, "")];
  let tied = tiedIn;
  const events = notes.map((note): Event => {
    if (note.pitch === null) {
      tied = false;
      return { kind: "rest", ticks: note.ticks };
    }
    const held = tied || note.slurred;
    tied = note.tie;
    return held ? { kind: "hold", ticks: note.ticks } : { kind: "on", ticks: note.ticks, text: lyric.shift() ?? "" };
  });
  if (lyric.length) throw new Error(`가사가 남음: ${source.notes} / ${lyric.join("")}`);
  return { events, tiedOut: tied };
}

export type Truth = {
  title: string;
  credits: string;
  copyright: string;
  meter: string;
  handwritten: boolean;
  /** 오선의 수(단) */
  systems: number;
  /** 악보에 적힌 순서의 마디 */
  measures: { meter: string; left?: string; right?: string; ending?: string; verses: number; events: Event[][] }[];
  /** 부르는 순서의 [마디, 절] */
  order: [number, number][];
};

export function truthOf(score: ScoreSource): Truth {
  let meter = score.meter;
  const meters = score.measures.map((source) => (meter = source.meter ?? meter));
  const tied: boolean[] = [];
  const measures = score.measures.map((source, i) => {
    const verses = Math.max(1, source.lyrics.length);
    const events = Array.from({ length: verses }, (_, v) => {
      // 2번 괄호는 1번 괄호가 아니라 반복 구간의 마지막 마디에서 이어진다.
      const before = source.ending === "2" ? score.measures.findIndex((x) => x.ending === "1") - 1 : i - 1;
      const result = eventsOf(source, v, tied[before] ?? false);
      tied[i] = result.tiedOut;
      return result.events;
    });
    for (const list of events) {
      const sum = list.reduce((s, e) => s + e.ticks, 0);
      if (Math.abs(sum - measureTicks(meters[i]!)) > 1e-6) throw new Error(`${score.name} ${i + 1}번째 마디: ${sum}/${measureTicks(meters[i]!)}`);
    }
    return { meter: meters[i]!, left: source.left, right: source.right, ending: source.ending, verses, events };
  });
  const order = score.order.flatMap(([from, to, verse]) => Array.from({ length: to - from + 1 }, (_, k): [number, number] => [from + k, verse]));
  return { title: score.title, credits: score.credits, copyright: score.copyright, meter: score.meter, handwritten: !!score.handwritten, systems: 0, measures, order };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function layerXml(text: string, lyrics: string[], verses: number, beat: number, stem: string, tiedIn: boolean, id: () => string, ids: string[], scoreKey: string): { xml: string; tied: boolean } {
  const notes = parseNotes(text);
  const queues = Array.from({ length: verses }, (_, v) => [...(lyrics[v] ?? "").replace(/\s/g, "")]);
  let tied = tiedIn, at = 0;
  const groups: { key: string; xml: string[]; beam: boolean; triplet: number; count: number }[] = [];
  for (const note of notes) {
    const beamable = note.dur >= 8;
    const key = note.triplet ? `t${note.triplet}` : `${Math.floor(at / beat + 1e-9)}`;
    at += note.ticks;
    const attrs = `dur="${note.dur}"${note.dots ? ` dots="${note.dots}"` : ""}`;
    let xml: string;
    if (note.pitch === null) {
      tied = false;
      xml = `<rest xml:id="${id()}" ${attrs}/>`;
    } else {
      const tie = note.tie ? (tied ? "m" : "i") : tied ? "t" : "";
      const held = tied || note.slurred;
      const verse = held
        ? ""
        : queues.map((q, v) => [q.shift(), v] as const).filter(([s]) => s).map(([s, v]) => `<verse n="${v + 1}"><syl>${esc(s!)}</syl></verse>`).join("");
      const inKey = (scoreKey.includes(note.pitch + note.accid) && note.accid) || (!note.accid && !scoreKey.includes(note.pitch));
      const accid = note.accid ? (inKey ? ` accid.ges="${note.accid === "#" ? "s" : "f"}"` : ` accid="${note.accid === "#" ? "s" : "f"}"`) : "";
      const me = id();
      ids.push(me);
      xml = `<note xml:id="${me}" pname="${note.pitch}" oct="${note.octave}" ${attrs}${accid}${tie ? ` tie="${tie}"` : ""}${stem ? ` stem.dir="${stem}"` : ""}>${verse}</note>`;
      tied = note.tie;
    }
    const last = groups.at(-1);
    if (last && last.key === key && last.beam && beamable && note.pitch !== null) {
      last.xml.push(xml);
      last.count++;
    } else if (last && note.triplet && last.triplet === note.triplet) {
      last.xml.push(xml);
      last.count++;
    } else groups.push({ key, xml: [xml], beam: beamable && note.pitch !== null, triplet: note.triplet, count: 1 });
  }
  const xml = groups
    .map((g) => {
      const body = g.beam && g.count > 1 ? `<beam>${g.xml.join("")}</beam>` : g.xml.join("");
      return g.triplet ? `<tuplet num="3" numbase="2" num.place="above">${body}</tuplet>` : body;
    })
    .join("");
  return { xml, tied };
}

const KEYS: Record<string, string> = { "0": "", "1f": "bb", "2f": "bb eb", "1s": "f#", "2s": "f# c#", "3s": "f# c# g#" };

export function meiOf(score: ScoreSource): string {
  let n = 0;
  const id = () => `x${++n}`;
  let meter = score.meter, key = score.key;
  let tied = false, tiedBeforeEnding = false;
  const keySig = (k: string) => k;
  let body = "";
  const body2: string[] = [];
  let openEnding = "";
  score.measures.forEach((source, i) => {
    const change: string[] = [];
    if (source.meter && source.meter !== meter) {
      meter = source.meter;
      const [c, u] = meter.split("/");
      change.push(`<meterSig count="${c}" unit="${u}"/>`);
    }
    if (source.key && source.key !== key) {
      key = source.key;
      change.push(`<keySig sig="${keySig(key)}"/>`);
    }
    if (source.ending !== openEnding || change.length) {
      if (openEnding && source.ending !== openEnding) body2.push("</ending>");
    }
    if (change.length) body2.push(`<scoreDef><staffGrp><staffDef n="1">${change.join("")}</staffDef></staffGrp></scoreDef>`);
    if ((source.ending ?? "") !== openEnding) {
      openEnding = source.ending ?? "";
      if (openEnding) body2.push(`<ending n="${openEnding}">`);
      if (openEnding === "1") tiedBeforeEnding = tied;
      if (openEnding === "2") tied = tiedBeforeEnding;
    }
    const unit = Number(meter.split("/")[1]);
    const beat = unit === 8 ? QUARTER * 1.5 : QUARTER;
    const ids: string[] = [];
    const verses = Math.max(1, source.lyrics.length);
    const high = layerXml(source.notes, source.low ? [] : source.lyrics, verses, beat, source.low ? "up" : "", tied, id, ids, KEYS[key]!);
    const low = source.low ? layerXml(source.low, source.lyrics, verses, beat, "down", false, id, [], KEYS[key]!) : undefined;
    tied = (low ?? high).tied;
    const quarters = measureTicks(meter) / QUARTER;
    const harm = (source.harm ?? [])
      .map((h, k, all) => `<harm staff="1" tstamp="${1 + (k * quarters * (unit / 4)) / all.length}" place="above">${esc(h)}</harm>`)
      .join("");
    body2.push(
      `<measure n="${i + 1}"${source.left ? ` left="${source.left}"` : ""}${source.right ? ` right="${source.right}"` : ""}><staff n="1"><layer n="1">${high.xml}</layer>${low ? `<layer n="2">${low.xml}</layer>` : ""}</staff>${harm}</measure>`,
    );
  });
  if (openEnding) body2.push("</ending>");
  body = body2.join("\n");
  const [c, u] = score.meter.split("/");
  return `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0"><meiHead><fileDesc><titleStmt><title>${esc(score.title)}</title></titleStmt><pubStmt/></fileDesc></meiHead>
<music><body><mdiv><score><scoreDef><staffGrp><staffDef n="1" lines="5"><clef shape="G" line="2"/><keySig sig="${keySig(score.key)}"/><meterSig count="${c}" unit="${u}"/></staffDef></staffGrp></scoreDef><section>
${body}
</section></score></mdiv></body></music></mei>`;
}
