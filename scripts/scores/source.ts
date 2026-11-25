// 시험 악보 원본. 멜로디와 가사는 이 프로젝트를 위해 직접 지었다.
//
// 음표: 음이름+옥타브:길이[.점][~붙임줄][^같은 글자에 이어 부르는 음]. 쉼표는 r:길이. 3( ... )은 셋잇단음표.
// 가사: 새 글자를 부르는 음마다 한 글자. 빈칸은 무시한다.

export type MeasureSource = {
  notes: string;
  /** 절마다 한 줄 */
  lyrics: string[];
  meter?: string;
  key?: string;
  harm?: string[];
  left?: "rptstart";
  right?: "rptend" | "dbl" | "end";
  ending?: string;
  /** 두 번째 성부(기둥이 아래) */
  low?: string;
};

export type ScoreSource = {
  name: string;
  /** 손글씨체는 인쇄체 기준에서 뺀다. */
  handwritten?: true;
  title: string;
  credits: string;
  copyright: string;
  musicFont: string;
  textFont: string;
  /** Verovio 배율(%) */
  scale: number;
  meter: string;
  key: string;
  measures: MeasureSource[];
  /** 부르는 순서: [시작, 끝(포함), 절]. 0부터 센다. */
  order: [number, number, number][];
};

const m = (notes: string, lyrics: string | string[] = "", extra: Partial<MeasureSource> = {}): MeasureSource => ({
  notes,
  lyrics: typeof lyrics === "string" ? (lyrics ? [lyrics] : []) : lyrics,
  ...extra,
});

export const SCORES: ScoreSource[] = [
  {
    name: "a-four-four",
    title: "골목의 저녁",
    credits: "beat-note 시험 악보",
    copyright: "ⓒ 2026 beat-note 시험 악보",
    musicFont: "Leipzig",
    textFont: "Noto Sans KR",
    scale: 92,
    meter: "4/4",
    key: "0",
    measures: [
      m("g4:4 a4:4 c5:4 a4:4", "", { harm: ["C", "Am"] }),
      m("r:2 r:4 r:8 e4:8", "저", { harm: ["G7"] }),
      m("g4:8 g4:16 a4:16~ a4:8 c5:8 a4:8 g4:8 e4:16 d4:8.", "무는골목에불이켜", { harm: ["C", "Am7"] }),
      m("e4:4. r:8 g4:8 a4:8 c5:8. d5:16~", "고 창밖에는", { harm: ["F", "G"] }),
      m("d5:16 c5:8.~ c5:4 r:4 r:8. a4:16", "노 래", { harm: ["C"] }),
      m("a4:16 a4:8. g4:8 e4:16 g4:16~ g4:8 a4:16 g4:16~ g4:16 e4:8.", "가들려오면나는천", { harm: ["Dm7", "G7"] }),
      m("d4:2~ d4:8 r:8 c4:8 d4:8", "히 걸음", { harm: ["C"] }),
      m("e4:8 e4:8 f4:8 e4:8 d4:4 c4:8 d4:8", "을멈추고하늘봐", { harm: ["F", "C/E"] }),
      m("g4:8 r:16 e4:16 e4:8 d4:16 e4:16~ e4:4. r:8", "요 바람분다", { harm: ["Dm7", "G"] }),
      m("c5:16 c5:16 b4:16 a4:16 g4:8 a4:8 r:8 g4:8 a4:16 g4:16 e4:8", "창가에놓인화 하나가웃", { harm: ["C", "Am7"] }),
      m("a4:4 g4:4 e4:8 r:8 r:4", "네요참", { harm: ["F"] }),
      m("f4:8. g4:16 a4:8 c5:8 b4:4. g4:8", "오늘도고마워", { harm: ["Dm7", "G7"] }),
      m("c5:1", "요", { harm: ["C"], right: "end" }),
    ],
    order: [[0, 12, 0]],
  },
  {
    name: "b-three-four",
    title: "물가의 왈츠",
    credits: "beat-note 시험 악보",
    copyright: "ⓒ 2026 beat-note 시험 악보",
    musicFont: "Bravura",
    textFont: "Nanum Myeongjo",
    scale: 100,
    meter: "3/4",
    key: "1f",
    measures: [
      m("f4:4 a4:4 c5:4", "", { harm: ["F"] }),
      m("d5:2.", "", { harm: ["Bb"] }),
      m("c5:2 c5:4", "흐 르", { harm: ["F"] }),
      m("a4:2 f4:4", "는 물", { harm: ["F"] }),
      m("g4:4. a4:8 bb4:4", "소리에", { harm: ["Gm"] }),
      m("a4:2.", "귀", { harm: ["F"] }),
      m("c5:8 c5:8 d5:4 c5:4", "기울여보", { harm: ["F7"] }),
      m("bb4:4 a4:8 g4:8 f4:4", "면작은돌", { harm: ["Bb"] }),
      m("g4:2.~", "이", { harm: ["C7"] }),
      m("g4:2 r:4", "", { harm: ["C7"] }),
      m("f4:4 a4:4 c5:4", "둥글게", { harm: ["F"] }),
      m("f5:2 e5:4", "춤 을", { harm: ["Dm"] }),
      m("d5:4. c5:8 bb4:4", "추고있", { harm: ["Gm"] }),
      m("a4:4 r:4 c5:8 bb4:8", "네 나도", { harm: ["F"] }),
      m("a4:4 g4:4. e4:8", "함께걷", { harm: ["C7"] }),
      m("f4:2.~", "자", { harm: ["F"] }),
      m("f4:4 r:2", "", { harm: ["F"], right: "end" }),
    ],
    order: [[0, 16, 0]],
  },
  {
    name: "c-six-eight",
    title: "돛단배",
    credits: "beat-note 시험 악보",
    copyright: "ⓒ 2026 beat-note 시험 악보",
    musicFont: "Leland",
    textFont: "Nanum Gothic",
    scale: 78,
    meter: "6/8",
    key: "2s",
    measures: [
      m("f#4:8 a4:8 d5:8 c#5:4.", "", { harm: ["D"] }),
      m("r:4. r:4 f#4:8", "돛", { harm: ["G", "A"] }),
      m("a4:4 a4:8 b4:8 a4:8 f#4:8", "단배를띄우", { harm: ["D"] }),
      m("e4:4. r:4 e4:8", "고 별", { harm: ["A"] }),
      m("g4:8 g4:8 f#4:8 e4:4 d4:8", "을보며가는", { harm: ["G"] }),
      m("f#4:4.~ f#4:4 r:8", "에", { harm: ["D"] }),
      m("b4:8 b4:8 b4:8 d5:8 c#5:8 b4:8", "파도가말거네", { harm: ["G"] }),
      m("a4:8. b4:16 a4:8 f#4:4.", "어디로가", { harm: ["D"] }),
      m("e4:8 f#4:8 g4:8 a4:4 c#5:8", "느냐고묻고", { harm: ["A7"] }),
      m("d5:4.~ d5:4.", "서", { harm: ["D"] }),
      m("d5:4 c#5:8 b4:4 a4:8", "나는또웃", { harm: ["G", "D"] }),
      m("b4:16 a4:16 g4:8 f#4:8 e4:4.", "으며손을흔", { harm: ["Em"] }),
      m("a4:8 b4:8 c#5:8 e5:8 d5:8 c#5:8", "들고바람따라", { harm: ["A7"] }),
      m("d5:4. r:4.", "가", { harm: ["D"], right: "end" }),
    ],
    order: [[0, 13, 0]],
  },
  {
    name: "d-repeat",
    title: "다시 부르는 노래",
    credits: "beat-note 시험 악보",
    copyright: "ⓒ 2026 beat-note 시험 악보",
    musicFont: "Gootville",
    textFont: "Gowun Dodum",
    scale: 88,
    meter: "4/4",
    key: "3s",
    measures: [
      m("c#5:4 e5:4 c#5:8 b4:8 a4:8 b4:8", "", { harm: ["A", "E"] }),
      m("c#5:2 b4:2", "창", { harm: ["D", "E"], low: "r:2 r:4 e4:4" }),
      m("b4:16 c#5:16 e5:8~ e5:8 b4:16 c#5:16 e5:8 r:8 c#5:8 e5:8", ["이대로앉아서노래", "영원히우리는함께"], { harm: ["A"], left: "rptstart" }),
      m("f#5:4~ f#5:8 e5:16 c#5:16~ c#5:2", ["바람아", "별빛아"], { harm: ["C#m"] }),
      m("r:4 e5:8 c#5:8 e5:8. d5:16~ d5:8 c#5:8", ["작은꽃잎이", "푸른나무가"], { harm: ["F#m"] }),
      m("3(b4:8 c#5:8 b4:8) a4:4 f#4:4 r:8 e4:8", ["흔들리는때 나", "노래하는때 나"], { harm: ["Bm", "E"] }),
      m("c#5:8. b4:16 c#5:8 d5:16 e5:16~", ["는걸어간다", ""], { harm: ["D"], meter: "2/4", ending: "1" }),
      m("e5:2~ e5:4. r:8", "", { harm: ["E"], meter: "4/4", ending: "1", right: "rptend" }),
      m("c#5:8. b4:16 c#5:8 d5:16 e5:16~ e5:2", ["", "는꿈을꾼다"], { harm: ["D"], ending: "2", right: "dbl" }),
      m("bb4:8 d5:8 f5:8 d5:8 c5:8 r:16 bb4:16 a4:8 bb4:8", "언젠가다시 만나는", { harm: ["Bb", "F"], key: "2f" }),
      m("g5:4 f5:4 3(eb5:8 d5:8 c5:8) d5:4", "그날그길에서", { harm: ["Eb"] }),
      m("bb4:16 bb4:8 c5:16~ c5:8 d5:8 c5:8. bb4:16 bb4:4~", "우리웃으며만나", { harm: ["Cm7", "F7"] }),
      m("bb4:2 r:2", "", { harm: ["Bb"], right: "end" }),
    ],
    order: [[0, 7, 0], [2, 5, 1], [8, 8, 1], [9, 12, 0]],
  },
  {
    name: "e-handwritten",
    handwritten: true,
    title: "손글씨 노래",
    credits: "beat-note 시험 악보",
    copyright: "ⓒ 2026 beat-note 시험 악보",
    musicFont: "Petaluma",
    textFont: "Nanum Pen Script",
    scale: 95,
    meter: "4/4",
    key: "1s",
    measures: [
      m("b4:4 d5:4 c5:4 a4:4", "", { harm: ["G", "D"] }),
      m("g4:4. a4:8 b4:8 d5:8 b4:4", "작은방에혼", { harm: ["G"] }),
      m("a4:8 a4:16 b4:16 a4:8 g4:8 e4:4 r:4", "기타를치면은", { harm: ["Em"] }),
      m("c5:8. b4:16 a4:8 g4:8 a4:4. r:8", "누구나노래", { harm: ["C"] }),
      m("d4:8 g4:8 a4:8 b4:8~ b4:4 r:4", "는사람이", { harm: ["D"] }),
      m("b4:8 b4:8 c5:4 d5:8. c5:16 b4:4", "될수있다고말", { harm: ["G"] }),
      m("a4:16 b4:16 a4:8 g4:8 e4:8 g4:2", "하던그대를또", { harm: ["Em"] }),
      m("a4:4 b4:8 a4:8 g4:8 a4:8 b4:4", "오늘도생각하", { harm: ["C", "D"] }),
      m("g4:1", "네", { harm: ["G"], right: "end" }),
    ],
    order: [[0, 8, 0]],
  },
];
