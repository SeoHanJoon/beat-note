// 화면이 멈추지 않도록 악보 인식을 따로 실행한다.
import { createOcr, type OrtLike } from "../reader/ocr.ts";
import { readScore } from "../reader/read.ts";
import type { Gray, ReadScore } from "../reader/types.ts";

export type WorkerRequest = { pages: Gray[] };
export type WorkerReply =
  | { type: "progress"; done: number; total: number }
  | { type: "done"; score: ReadScore }
  | { type: "error"; problem: "assets" | "read" };

const scope = self as unknown as { postMessage(reply: WorkerReply): void; onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null };

async function loadOcr() {
  const get = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return response;
  };
  const [ort, model, dictionary] = await Promise.all([
    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ new URL("/vendor/ort/ort.wasm.min.mjs", self.location.origin).href),
    get("/models/korean-rec.onnx").then((r) => r.arrayBuffer()),
    get("/models/korean-dict.txt").then((r) => r.text()),
  ]);
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = new URL("/vendor/ort/", self.location.origin).href;
  return createOcr(ort as OrtLike, new Uint8Array(model), dictionary);
}

scope.onmessage = async ({ data }) => {
  let ocr;
  try {
    ocr = await loadOcr();
  } catch (error) {
    console.warn(error);
    scope.postMessage({ type: "error", problem: "assets" });
    return;
  }
  try {
    const score = await readScore(data.pages, { ocr, onProgress: (done, total) => scope.postMessage({ type: "progress", done, total }) });
    scope.postMessage({ type: "done", score });
  } catch (error) {
    console.warn(error);
    scope.postMessage({ type: "error", problem: "read" });
  }
};
