"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { CONVERT_MESSAGES, ConvertError, convertPdf, type Progress } from "@/lib/convert/convert";
import { MAX_BYTES, openPdf, PDF_MESSAGES, PdfError } from "@/lib/convert/pdf";
import type { ReadScore } from "@/lib/reader/types";
import { expandScore, type Source } from "@/lib/song/expand";
import type { Song } from "@/lib/song/types";
import { Editor } from "./Editor";
import { PdfPicker } from "./PdfPicker";

type State =
  | { step: "idle" }
  | { step: "working"; name: string; progress: Progress }
  | { step: "error"; message: string }
  | { step: "done"; name: string; song: Song; sources: Source[][]; score: ReadScore; pages: HTMLCanvasElement[] };

const PROGRESS_TEXT: Record<Progress["step"], string> = { draw: "쪽을 그리는 중", load: "인식 도구를 불러오는 중", read: "악보를 읽는 중" };

export function Converter() {
  const [state, setState] = useState<State>({ step: "idle" });
  const running = useRef<AbortController>(undefined);

  useEffect(() => () => running.current?.abort(), []);

  async function open(file: File) {
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    const { signal } = controller;
    const progress = (p: Progress) => !signal.aborted && setState({ step: "working", name: file.name, progress: p });
    progress({ step: "draw", done: 0, total: 1 });
    let pdf: PDFDocumentProxy | undefined;
    try {
      if (file.size > MAX_BYTES) throw new PdfError("too-large");
      pdf = await openPdf(new Uint8Array(await file.arrayBuffer()));
      signal.throwIfAborted();
      const { score, pages } = await convertPdf(pdf, progress, signal);
      const { song, sources } = expandScore(score, { id: crypto.randomUUID() });
      if (!signal.aborted) setState({ step: "done", name: file.name, song, sources, score, pages });
    } catch (error) {
      if (signal.aborted) return;
      const message =
        error instanceof PdfError ? PDF_MESSAGES[error.problem] : error instanceof ConvertError ? CONVERT_MESSAGES[error.problem] : CONVERT_MESSAGES.read;
      setState({ step: "error", message });
    } finally {
      void pdf?.loadingTask.destroy();
    }
  }

  function cancel() {
    running.current?.abort();
    setState({ step: "idle" });
  }

  return (
    <>
      <PdfPicker onFile={open} />
      <div aria-live="polite">
        {state.step === "working" && (
          <div className="progress">
            <p>
              {PROGRESS_TEXT[state.progress.step]}
              {state.progress.step === "load" ? " (처음 한 번 약 30MB)" : ` ${state.progress.done}/${state.progress.total}`}
            </p>
            <progress max={state.progress.total} value={state.progress.step === "load" ? undefined : state.progress.done} />
            <button type="button" className="button plain" onClick={cancel}>
              그만두기
            </button>
          </div>
        )}
        {state.step === "error" && (
          <p className="error" role="alert">
            {state.message}
          </p>
        )}
        {state.step === "done" && (
          <p className="summary">
            변환했습니다. 자동 인식은 틀릴 수 있으니 원본과 비교해 주세요. 확인 표시가 없는 마디도 틀릴 수 있습니다.
          </p>
        )}
      </div>
      {state.step === "done" && <Editor key={state.song.id} song={state.song} sources={state.sources} score={state.score} pages={state.pages} />}
    </>
  );
}
