"use client";

import { memo, useEffect, useMemo, useReducer, useRef, useState, type Dispatch } from "react";
import type { ReadScore } from "@/lib/reader/types";
import { cellsOf, draftOf, historyOf, reduce, rowsToCheck, songOf, type HistoryAction, type Row } from "@/lib/song/edit";
import type { Source } from "@/lib/song/expand";
import { formatTime, parseTime } from "@/lib/song/text";
import { BPM_MAX, BPM_MIN, type Song, type Time } from "@/lib/song/types";
import { DownloadButton } from "./DownloadButton";
import { NotePreview } from "./NotePreview";

type Props = { song: Song; sources: Source[][]; score: ReadScore; pages: HTMLCanvasElement[] };
type Tab = "edit" | "preview" | "pages";

const TIMES = ["2/4", "3/4", "4/4", "5/4", "3/8", "6/8", "9/8", "12/8", "2/2"];
const KINDS = [["on", "음"], ["hold", "끌기"], ["rest", "쉼"]] as const;

export function Editor({ song, sources, score, pages }: Props) {
  const [history, dispatch] = useReducer(reduce, undefined, () => historyOf(draftOf(song, sources)));
  const [tab, setTab] = useState<Tab>("edit");
  const draft = history.now;
  const checks = useMemo(() => rowsToCheck(draft), [draft]);
  const current = useMemo(() => songOf(draft), [draft]);
  const lastCheck = useRef<number>(undefined);
  const edited = history.past.length > 0;

  useEffect(() => {
    if (!edited) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [edited]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      // 입력 중인 글자는 입력 칸의 되돌리기에 맡긴다.
      if (document.activeElement instanceof HTMLElement && document.activeElement.dataset.dirty === "true") return;
      event.preventDefault();
      dispatch({ type: event.shiftKey ? "redo" : "undo" });
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  function nextCheck() {
    if (checks.length === 0) return;
    const at = lastCheck.current === undefined ? -1 : draft.rows.findIndex((r) => r.key === lastCheck.current);
    const key = checks.find((k) => draft.rows.findIndex((r) => r.key === k) > at) ?? checks[0]!;
    lastCheck.current = key;
    setTab("edit");
    requestAnimationFrame(() => {
      const card = document.getElementById(`row-${key}`);
      card?.scrollIntoView({ block: "center" });
      card?.focus({ preventScroll: true });
    });
  }

  return (
    <div className="editor">
      <div className="editor-bar">
        <div className="tabs" role="tablist">
          {([["edit", "교정"], ["preview", "미리보기"], ["pages", "원본"]] as const).map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="small" onClick={() => dispatch({ type: "undo" })} disabled={!history.past.length}>
          되돌리기
        </button>
        <button type="button" className="small" onClick={() => dispatch({ type: "redo" })} disabled={!history.future.length}>
          다시 하기
        </button>
        <button type="button" className="small check" onClick={nextCheck} disabled={!checks.length}>
          확인할 마디 {checks.length}
        </button>
        <DownloadButton song={current} />
      </div>

      {tab === "edit" && (
        <>
          <InfoForm info={draft.info} dispatch={dispatch} />
          <p className="hint">
            글자 칸에 여러 글자를 넣고 Enter를 누르면 다음 음에 한 글자씩 들어갑니다. 아래 단추를 누르면 음, 끌기, 쉼이 바뀝니다.
          </p>
          <div className="rows">
            {draft.rows.map((row, i) => (
              <RowCard key={row.key} row={row} number={i + 1} songTime={draft.info.time} score={score} pages={pages} dispatch={dispatch} needsCheck={checks.includes(row.key)} />
            ))}
          </div>
        </>
      )}
      {tab === "preview" && <NotePreview song={current} />}
      {tab === "pages" && (
        <div className="pages">
          {pages.map((canvas, i) => (
            <PageImage key={i} canvas={canvas} number={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function InfoForm({ info, dispatch }: { info: Omit<Song, "items">; dispatch: Dispatch<HistoryAction> }) {
  const set = (change: Extract<HistoryAction, { type: "info" }>["change"]) => dispatch({ type: "info", change });
  return (
    <div className="info-form">
      <label>
        제목 <CommitInput value={info.title} onCommit={(title) => set({ title })} />
      </label>
      <label>
        가수 <CommitInput value={info.artist} onCommit={(artist) => set({ artist })} />
      </label>
      <label>
        작사·작곡 <CommitInput value={info.credits} onCommit={(credits) => set({ credits })} />
      </label>
      <label>
        빠르기(BPM) <CommitInput value={String(info.bpm)} inputMode="numeric" onCommit={(text) => set({ bpm: Number(text) || info.bpm })} label={`${BPM_MIN}~${BPM_MAX}`} />
      </label>
      <label className="wide">
        저작권 표시 <CommitInput value={info.copyright} onCommit={(copyright) => set({ copyright })} />
      </label>
    </div>
  );
}

/** 한글 입력기가 글자를 조합하는 동안에는 값을 확정하지 않는 입력 칸 */
function CommitInput({ value, onCommit, label, className, inputMode, onEnter }: {
  value: string;
  onCommit: (value: string) => void;
  label?: string;
  className?: string;
  inputMode?: "numeric";
  onEnter?: (input: HTMLInputElement, back: boolean) => void;
}) {
  const [text, setText] = useState<string>();
  const commit = () => {
    if (text !== undefined && text !== value) onCommit(text);
    setText(undefined);
  };
  return (
    <input
      className={className}
      aria-label={label}
      inputMode={inputMode}
      value={text ?? value}
      data-dirty={text !== undefined && text !== value}
      autoComplete="off"
      onChange={(event) => setText(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === "Enter") {
          event.preventDefault();
          const input = event.currentTarget;
          commit();
          onEnter?.(input, event.shiftKey);
        } else if (event.key === "Escape") setText(undefined);
      }}
    />
  );
}

/** 글자 칸에서 Enter를 누르면 다음 음의 글자 칸으로 간다. */
function focusNext(input: HTMLInputElement, back: boolean) {
  const all = [...document.querySelectorAll<HTMLInputElement>("input.syllable")];
  all[all.indexOf(input) + (back ? -1 : 1)]?.focus();
}

type CardProps = { row: Row; number: number; songTime: Time; score: ReadScore; pages: HTMLCanvasElement[]; dispatch: Dispatch<HistoryAction>; needsCheck: boolean };

const RowCard = memo(function RowCard({ row, number, songTime, score, pages, dispatch, needsCheck }: CardProps) {
  const { item, key } = row;
  const name = item.type === "section" ? "구간" : item.type === "instrumental" ? "연주" : "마디";
  return (
    <section className={`row-card ${item.type}${needsCheck ? " needs-check" : ""}`} id={`row-${key}`} tabIndex={-1} aria-label={`${number}번째 ${name}`}>
      <div className="row-tools">
        <span className="row-number">{number}</span>
        <button type="button" onClick={() => dispatch({ type: "move", row: key, by: -1 })} aria-label="위로 옮기기">
          ↑
        </button>
        <button type="button" onClick={() => dispatch({ type: "move", row: key, by: 1 })} aria-label="아래로 옮기기">
          ↓
        </button>
        <button type="button" onClick={() => dispatch({ type: "duplicate", row: key })}>
          복제
        </button>
        <button type="button" onClick={() => dispatch({ type: "remove", row: key })}>
          삭제
        </button>
        <button type="button" onClick={() => dispatch({ type: "insert", row: key, what: "measure" })}>
          + 마디
        </button>
        <button type="button" onClick={() => dispatch({ type: "insert", row: key, what: "section" })}>
          + 구간
        </button>
        {item.type === "measure" && (
          <>
            <select
              aria-label="박자표"
              value={formatTime(item.time ?? songTime)}
              onChange={(event) => {
                const time = parseTime(event.target.value);
                if (time) dispatch({ type: "time", row: key, time });
              }}
            >
              {[...new Set([formatTime(item.time ?? songTime), ...TIMES])].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <button type="button" onClick={() => dispatch({ type: "toInstrumental", row: key })}>
              연주로
            </button>
          </>
        )}
      </div>

      {item.type === "section" && (
        <div className="section-form">
          <CommitInput label="구간 이름" value={item.title} onCommit={(title) => dispatch({ type: "section", row: key, title, note: item.note ?? "" })} />
          <CommitInput label="구간 설명" value={item.note ?? ""} onCommit={(note) => dispatch({ type: "section", row: key, title: item.title, note })} />
        </div>
      )}

      {item.type === "instrumental" && (
        <div className="section-form">
          <span>노래 없는 마디</span>
          <CommitInput className="count" label="마디 수" inputMode="numeric" value={String(item.count)} onCommit={(text) => dispatch({ type: "count", row: key, count: Number(text) })} />
          <button type="button" className="small" onClick={() => dispatch({ type: "toMeasures", row: key })}>
            노래 마디로 바꾸기
          </button>
        </div>
      )}

      {item.type === "measure" && (
        <>
          {(item.check || needsCheck) && (
            <p className="check-reason">
              <span>확인 필요: {item.check ?? "확신이 낮은 글자가 있음"}</span>
              <button type="button" className="small" onClick={() => dispatch({ type: "confirm", row: key })}>
                확인함
              </button>
            </p>
          )}
          <div className="side-by-side">
            <SourceImage source={row.sources[0]} score={score} pages={pages} />
            <div className="beats">
              {item.beats.map((beat, b) => (
                <div className="edit-beat" key={b}>
                  <div className="edit-cells" style={{ gridTemplateColumns: `repeat(${beat.div}, minmax(0, 1fr))` }}>
                    {cellsOf(beat).map((cell, c) => (
                      <div className={`edit-cell ${cell.kind}${cell.unsure ? " unsure" : ""}`} key={c}>
                        {cell.kind === "on" ? (
                          <CommitInput
                            className="syllable"
                            label={`${b + 1}박 ${c + 1}칸 글자`}
                            value={cell.text}
                            onCommit={(text) => dispatch({ type: "text", row: key, beat: b, cell: c, text })}
                            onEnter={focusNext}
                          />
                        ) : (
                          <span className="blank">{cell.kind === "hold" ? "—" : ""}</span>
                        )}
                        <button
                          type="button"
                          className="kind"
                          aria-label={`${b + 1}박 ${c + 1}칸: ${KINDS.find((k) => k[0] === cell.kind)![1]}`}
                          onClick={() => {
                            const at = KINDS.findIndex((k) => k[0] === cell.kind);
                            dispatch({ type: "kind", row: key, beat: b, cell: c, kind: KINDS[(at + 1) % 3]![0] });
                          }}
                        >
                          {KINDS.find((k) => k[0] === cell.kind)![1]}
                        </button>
                      </div>
                    ))}
                  </div>
                  <label className="div-select">
                    {b + 1}박{" "}
                    <select value={beat.div} aria-label={`${b + 1}박을 나누는 칸 수`} onChange={(event) => dispatch({ type: "div", row: key, beat: b, div: Number(event.target.value) })}>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                        <option key={n} value={n}>
                          {n}칸
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
});

/** 원본 쪽에서 마디 자리만 잘라 보여 준다. */
function SourceImage({ source, score, pages }: { source: Source | undefined; score: ReadScore; pages: HTMLCanvasElement[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const measure = source ? score.measures[source.measure] : undefined;

  useEffect(() => {
    const target = canvas.current, page = measure && pages[measure.page];
    if (!target || !measure || !page) return;
    const pad = 24;
    const x = Math.max(0, measure.box.x - pad), y = Math.max(0, measure.box.y);
    const width = Math.min(page.width - x, measure.box.width + pad * 2), height = Math.min(page.height - y, measure.box.height);
    const scale = Math.min(1, 720 / width);
    target.width = Math.max(1, Math.round(width * scale));
    target.height = Math.max(1, Math.round(height * scale));
    const context = target.getContext("2d")!;
    context.imageSmoothingQuality = "high";
    context.drawImage(page, x, y, width, height, 0, 0, target.width, target.height);
  }, [measure, pages]);

  if (!measure) return <p className="no-source">원본에 없는 마디</p>;
  return <canvas ref={canvas} className="source" role="img" aria-label="원본 마디" />;
}

function PageImage({ canvas, number }: { canvas: HTMLCanvasElement; number: number }) {
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `${number}쪽`);
    holder.current?.replaceChildren(canvas);
  }, [canvas, number]);
  return (
    <figure className="page">
      <div ref={holder} />
      <figcaption>{number}쪽</figcaption>
    </figure>
  );
}
