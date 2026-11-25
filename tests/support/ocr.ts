// Node에서 브라우저와 같은 OCR(WASM)을 쓴다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createOcr, type Ocr, type OrtLike } from "../../src/lib/reader/ocr.ts";

const root = join(import.meta.dirname, "..", "..");
let shared: Promise<Ocr> | undefined;

export function nodeOcr(): Promise<Ocr> {
  return (shared ??= (async () => {
    const dist = pathToFileURL(join(root, "node_modules/onnxruntime-web/dist/")).href;
    const ort = await import(dist + "ort.wasm.min.mjs");
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = dist;
    ort.env.logLevel = "error";
    return createOcr(ort as OrtLike, new Uint8Array(readFileSync(join(root, "public/models/korean-rec.onnx"))), readFileSync(join(root, "public/models/korean-dict.txt"), "utf8"));
  })());
}
