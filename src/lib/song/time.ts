import type { Song, Time } from "./types.ts";

export type Meter = {
  /** 한 마디의 박 수 */
  beats: number;
  /** 한 박의 길이(4분음표 = 1) */
  quarters: number;
  /** 한 박을 나누는 기본 칸 수 */
  div: number;
};

/** 박자표를 박 단위로 바꾼다. 6/8·9/8·12/8은 점4분음표가 한 박, 2/2는 4분음표로 센다. */
export function meterOf(time: Time): Meter {
  if (time.unit === 8 && time.beats % 3 === 0) return { beats: time.beats / 3, quarters: 1.5, div: 6 };
  if (time.unit === 8) return { beats: time.beats, quarters: 0.5, div: 2 };
  if (time.unit === 2) return { beats: time.beats * 2, quarters: 1, div: 4 };
  return { beats: time.beats, quarters: 1, div: 4 };
}

export function isValidTime(time: Time): boolean {
  return Number.isInteger(time.beats) && time.beats >= 1 && time.beats <= 12 && [2, 4, 8].includes(time.unit);
}

export function sameTime(a: Time, b: Time): boolean {
  return a.beats === b.beats && a.unit === b.unit;
}

export function timeOf(song: Pick<Song, "time">, item: { time?: Time }): Time {
  return item.time ?? song.time;
}
