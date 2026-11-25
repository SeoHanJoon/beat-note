"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { MAX_BYTES, openPdf, PDF_MESSAGES, PdfError, renderPage } from "@/lib/convert/pdf";
import { PdfPicker } from "./PdfPicker";

type State = { step: "idle" } | { step: "opening" } | { step: "error"; message: string } | { step: "open"; name: string; pdf: PDFDocumentProxy };

export function Converter() {
  const [state, setState] = useState<State>({ step: "idle" });
  const request = useRef(0);

  async function open(file: File) {
    const id = ++request.current;
    if (state.step === "open") void state.pdf.loadingTask.destroy();
    setState({ step: "opening" });
    try {
      if (file.size > MAX_BYTES) throw new PdfError("too-large");
      const pdf = await openPdf(new Uint8Array(await file.arrayBuffer()));
      if (id === request.current) setState({ step: "open", name: file.name, pdf });
      else void pdf.loadingTask.destroy();
    } catch (error) {
      if (id !== request.current) return;
      setState({ step: "error", message: PDF_MESSAGES[error instanceof PdfError ? error.problem : "damaged"] });
    }
  }

  return (
    <>
      <PdfPicker onFile={open} />
      <div aria-live="polite">
        {state.step === "opening" && <p>PDF를 여는 중입니다.</p>}
        {state.step === "error" && (
          <p className="error" role="alert">
            {state.message}
          </p>
        )}
        {state.step === "open" && (
          <p>
            <strong>{state.name}</strong> · {state.pdf.numPages}쪽
          </p>
        )}
      </div>
      {state.step === "open" && (
        <div className="pages">
          {Array.from({ length: state.pdf.numPages }, (_, i) => (
            <PageImage key={`${state.pdf.fingerprints[0]}-${i}`} pdf={state.pdf} number={i + 1} />
          ))}
        </div>
      )}
    </>
  );
}

function PageImage({ pdf, number }: { pdf: PDFDocumentProxy; number: number }) {
  const holder = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"drawing" | "done" | "error">("drawing");

  useEffect(() => {
    let alive = true;
    renderPage(pdf, number).then(
      (canvas) => {
        if (!alive) return;
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `${number}쪽`);
        holder.current?.replaceChildren(canvas);
        setStatus("done");
      },
      () => alive && setStatus("error"),
    );
    return () => {
      alive = false;
    };
  }, [pdf, number]);

  return (
    <figure className="page" data-status={status}>
      <div ref={holder} />
      <figcaption>{status === "error" ? `${number}쪽을 그리지 못했습니다.` : `${number}쪽`}</figcaption>
    </figure>
  );
}
