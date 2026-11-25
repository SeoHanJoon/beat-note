import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Gray, ReadScore } from "../reader/types.ts";
import { toGray } from "./gray.ts";
import { renderPage } from "./pdf.ts";
import type { WorkerReply, WorkerRequest } from "./worker.ts";

export type Progress = { step: "draw" | "load" | "read"; done: number; total: number };

export type ConvertProblem = "no-score" | "assets" | "read";

export class ConvertError extends Error {
  problem: ConvertProblem;
  constructor(problem: ConvertProblem) {
    super(problem);
    this.problem = problem;
  }
}

export const CONVERT_MESSAGES: Record<ConvertProblem, string> = {
  "no-score": "이 PDF에서 오선 악보를 찾지 못했습니다. 글자 악보나 사진은 변환할 수 없습니다.",
  assets: "인식 도구를 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.",
  read: "악보를 읽는 중에 문제가 생겼습니다. 다른 PDF로 시도해 주세요.",
};

/** 쪽을 그려 악보를 읽는다. signal로 멈출 수 있다. */
export async function convertPdf(pdf: PDFDocumentProxy, onProgress: (p: Progress) => void, signal: AbortSignal): Promise<{ score: ReadScore; pages: HTMLCanvasElement[] }> {
  const pages: HTMLCanvasElement[] = [];
  const grays: Gray[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    onProgress({ step: "draw", done: n - 1, total: pdf.numPages });
    const canvas = await renderPage(pdf, n);
    signal.throwIfAborted();
    const { data, width, height } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    grays.push(toGray(data, width, height));
    pages.push(canvas);
  }
  onProgress({ step: "load", done: 0, total: 1 });
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const stop = () => worker.terminate();
  signal.addEventListener("abort", stop);
  try {
    const score = await new Promise<ReadScore>((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason));
      worker.onerror = () => reject(new ConvertError("assets"));
      worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
        if (data.type === "progress") onProgress({ step: "read", done: data.done, total: data.total });
        else if (data.type === "done") resolve(data.score);
        else reject(new ConvertError(data.problem));
      };
      const request: WorkerRequest = { pages: grays };
      worker.postMessage(request, grays.map((g) => g.data.buffer as ArrayBuffer));
    });
    if (score.measures.length === 0) throw new ConvertError("no-score");
    return { score, pages };
  } finally {
    signal.removeEventListener("abort", stop);
    worker.terminate();
  }
}
