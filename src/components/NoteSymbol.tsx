import { GLYPHS } from "./noteGlyphs";

type Value = 1 | 2 | 4 | 8 | 16;
type Props = { kind: "note" | "rest"; value: Value; dotted?: boolean };

/** 오선 한 칸 = 250. 기둥의 자리와 굵기는 Bravura의 기준을 따른다. */
const SPACE = 250;
const STEM = { x: 1.18 * SPACE, y: 0.168 * SPACE, width: 0.12 * SPACE, height: 3.5 * SPACE };
const HEADS = { 1: "wholeHead", 2: "halfHead", 4: "blackHead", 8: "blackHead", 16: "blackHead" } as const;
const FLAGS = { 8: "flag8", 16: "flag16" } as const;
const RESTS = { 1: "rest1", 2: "rest2", 4: "rest4", 8: "rest8", 16: "rest16" } as const;
/** 기호의 오른쪽 끝(점을 찍을 자리) */
const NOTE_RIGHT = { 1: 422, 2: 295, 4: 295, 8: 455, 16: 455 };
const REST_RIGHT = { 1: 282, 2: 282, 4: 270, 8: 247, 16: 320 };

/** 악보 기호. 이름은 옆의 글자로 알 수 있으므로 읽어 주지 않는다. */
export function NoteSymbol({ kind, value, dotted }: Props) {
  // 모든 기호를 같은 크기의 칸에 그려 줄을 맞춘다. y는 아래쪽이 양수.
  const x = 160;
  const base = kind === "note" && value > 1 ? 400 : 0;
  const right = kind === "note" ? NOTE_RIGHT[value] : REST_RIGHT[value];
  const lined = kind === "rest" && value <= 2;
  return (
    <svg className="note-symbol" viewBox="0 -600 800 1200" width="36" height="54" aria-hidden="true" focusable="false">
      <g transform={`translate(${x} ${base})`}>
        {/* 온쉼표는 줄에 매달리고 2분쉼표는 줄 위에 앉는다. */}
        {lined && <path d="M-130 0H412" stroke="currentColor" strokeWidth="28" />}
        <path transform="scale(1 -1)" d={kind === "note" ? GLYPHS[HEADS[value]] : GLYPHS[RESTS[value]]} />
        {kind === "note" && value > 1 && <rect x={STEM.x - STEM.width} y={-STEM.height} width={STEM.width} height={STEM.height - STEM.y} />}
        {kind === "note" && (value === 8 || value === 16) && <path transform={`translate(${STEM.x - STEM.width} ${-STEM.height}) scale(1 -1)`} d={GLYPHS[FLAGS[value]]} />}
        {dotted && <circle cx={right + 120} cy={kind === "note" ? 0 : -SPACE / 2} r="52" />}
      </g>
    </svg>
  );
}
