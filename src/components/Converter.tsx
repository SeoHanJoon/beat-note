"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { CONVERT_MESSAGES, ConvertError, convertPdf, type Progress } from "@/lib/convert/convert";
import { MAX_BYTES, openPdf, PDF_MESSAGES, PdfError } from "@/lib/convert/pdf";
import { expandScore } from "@/lib/song/expand";
import type { Song } from "@/lib/song/types";
import { DownloadButton } from "./DownloadButton";
import { NotePreview } from "./NotePreview";
import { PdfPicker } from "./PdfPicker";

type State =
  | { step: "idle" }
  | { step: "working"; name: string; progress: Progress }
  | { step: "error"; message: string }
  | { step: "done"; name: string; song: Song; pages: HTMLCanvasElement[] };

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
      const { song } = expandScore(score, { id: crypto.randomUUID() });
      if (!signal.aborted) setState({ step: "done", name: file.name, song, pages });
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

  const checks = state.step === "done" ? state.song.items.filter((item) => item.type === "measure" && item.check).length : 0;

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
            변환했습니다. {checks > 0 ? `확인할 마디가 ${checks}개 있습니다.` : "확인 표시된 마디가 없습니다."} 자동 인식은 틀릴 수 있으니 원본과 비교해 주세요.
          </p>
        )}
      </div>
      {state.step === "done" && (
        <>
          <p>
            <DownloadButton song={state.song} />
          </p>
          <NotePreview song={state.song} />
          <h2>원본</h2>
          <div className="pages">
            {state.pages.map((canvas, i) => (
              <PageImage key={i} canvas={canvas} number={i + 1} />
            ))}
          </div>
        </>
      )}
    </>
  );
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
