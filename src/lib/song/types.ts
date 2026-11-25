/** 박자표. beats/unit 그대로 (6/8이면 beats 6, unit 8). */
export type Time = { beats: number; unit: number };

/** 한 박 안의 소리 하나. len의 단위는 그 박을 나눈 칸. */
export type Note =
  | { kind: "note"; text: string; len: number; unsure?: true }
  | { kind: "hold"; len: number }
  | { kind: "rest"; len: number };

/** div = 한 박을 나눈 칸 수. 보통 4, 셋잇단음표 3, 6/8박자 6. */
export type Beat = { div: number; notes: Note[] };

export type Measure = {
  type: "measure";
  /** 곡의 박자표와 다를 때만 */
  time?: Time;
  /** 못갖춘 시작. 빈 박은 그리지 않는다. */
  pickup?: true;
  memo?: string;
  /** 사람이 확인해야 하는 이유 */
  check?: string;
  beats: Beat[];
};

/** 노래 없는 마디 묶음 */
export type Instrumental = { type: "instrumental"; label: string; count: number; time?: Time };

export type Section = { type: "section"; title: string; note?: string };

export type Item = Measure | Instrumental | Section;

export type Song = {
  /** 내려받은 파일의 저장값을 곡마다 나누는 데 쓴다. */
  id: string;
  title: string;
  artist: string;
  credits: string;
  copyright: string;
  bpm: number;
  time: Time;
  items: Item[];
};

export const BPM_MIN = 30;
export const BPM_MAX = 240;
export const MAX_DIV = 8;
