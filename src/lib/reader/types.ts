import type { Time } from "../song/types.ts";

/** 4분음표의 길이. 16분음표 12, 셋잇단 8분음표 16. */
export const QUARTER = 48;

/** 밝기 이미지. 0이 검정 */
export type Gray = { width: number; height: number; data: Uint8Array };

export type Box = { x: number; y: number; width: number; height: number };

export type ReadEvent = {
  /** on = 새로 부름, hold = 앞 음을 이어 부름, rest = 쉼 */
  kind: "on" | "hold" | "rest";
  ticks: number;
  x: number;
};

export type Syllable = { text: string; unsure: boolean };

export type ReadMeasure = {
  page: number;
  /** 몇 번째 단(오선)인지 */
  system: number;
  /** 원본에서 이 마디의 자리(가사 포함) */
  box: Box;
  time: Time;
  left?: "rptstart";
  right?: "rptend" | "dbl" | "end";
  /** 1번·2번 괄호 */
  ending?: string;
  events: ReadEvent[];
  /** 절마다, on인 음마다 한 칸. 글자가 없으면 빈 칸 */
  lyrics: Syllable[][];
  /** 사람이 확인해야 하는 이유 */
  check?: string;
};

export type ReadScore = {
  title: string;
  credits: string;
  copyright: string;
  time: Time;
  measures: ReadMeasure[];
};

export const emptyScore = (): ReadScore => ({ title: "", credits: "", copyright: "", time: { beats: 4, unit: 4 }, measures: [] });
