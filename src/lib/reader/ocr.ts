import type { Gray } from "./types.ts";

/** 읽은 글자. x는 줄 이미지에서의 가운데 */
export type OcrChar = { text: string; x: number; score: number };

export type Ocr = { read(line: Gray, allow?: (char: string) => boolean): Promise<OcrChar[]> };

/** onnxruntime-web에서 쓰는 부분만 */
export type OrtLike = {
  Tensor: new (type: "float32", data: Float32Array, dims: number[]) => unknown;
  InferenceSession: {
    create(model: Uint8Array, options: Record<string, unknown>): Promise<{
      inputNames: readonly string[];
      outputNames: readonly string[];
      run(feeds: Record<string, never>): Promise<Record<string, { data: unknown; dims: readonly number[] }>>;
    }>;
  };
};

const HEIGHT = 48;
const MIN_WIDTH = 320;

/** 높이를 48에 맞춰 줄이거나 늘린다(면적 평균). */
export function resizeLine(line: Gray, height = HEIGHT): Gray {
  const scale = line.height / height;
  const width = Math.max(1, Math.round(line.width / scale));
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = y * scale, y1 = Math.min(line.height, (y + 1) * scale);
    for (let x = 0; x < width; x++) {
      const x0 = x * scale, x1 = Math.min(line.width, (x + 1) * scale);
      let sum = 0, weight = 0;
      if (scale >= 1) {
        for (let yy = Math.floor(y0); yy < y1; yy++)
          for (let xx = Math.floor(x0); xx < x1; xx++) {
            const w = (Math.min(yy + 1, y1) - Math.max(yy, y0)) * (Math.min(xx + 1, x1) - Math.max(xx, x0));
            sum += w * line.data[yy * line.width + xx]!;
            weight += w;
          }
      } else {
        const cx = Math.max(0, Math.min(line.width - 1, (x + 0.5) * scale - 0.5)), cy = Math.max(0, Math.min(line.height - 1, (y + 0.5) * scale - 0.5));
        const fx = Math.floor(cx), fy = Math.floor(cy), gx = Math.min(line.width - 1, fx + 1), gy = Math.min(line.height - 1, fy + 1);
        const a = cx - fx, b = cy - fy;
        sum = (line.data[fy * line.width + fx]! * (1 - a) + line.data[fy * line.width + gx]! * a) * (1 - b) + (line.data[gy * line.width + fx]! * (1 - a) + line.data[gy * line.width + gx]! * a) * b;
        weight = 1;
      }
      data[y * width + x] = weight ? sum / weight : 255;
    }
  }
  return { width, height, data };
}

export const isHangul = (c: string) => c >= "가" && c <= "힣";

/** PaddleOCR 한국어 글자 인식 모델을 쓰는 OCR */
export async function createOcr(ort: OrtLike, model: Uint8Array, dictionary: string): Promise<Ocr> {
  const session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"], logSeverityLevel: 3 });
  // 0은 빈칸(CTC), 마지막은 띄어쓰기
  const chars = ["", ...dictionary.replace(/\r/g, "").replace(/\n$/, "").split("\n"), " "];
  return {
    async read(line, allow) {
      const small = resizeLine(line);
      const width = Math.max(MIN_WIDTH, small.width);
      const input = new Float32Array(3 * HEIGHT * width);
      for (let y = 0; y < HEIGHT; y++)
        for (let x = 0; x < small.width; x++) {
          const v = small.data[y * small.width + x]! / 127.5 - 1;
          for (let c = 0; c < 3; c++) input[(c * HEIGHT + y) * width + x] = v;
        }
      const feeds = { [session.inputNames[0]!]: new ort.Tensor("float32", input, [1, 3, HEIGHT, width]) } as Record<string, never>;
      const output = (await session.run(feeds))[session.outputNames[0]!]!;
      const [, steps, classes] = output.dims as [number, number, number];
      const values = output.data as Float32Array;
      const usable = chars.map((c, i) => i === 0 || (i < classes && (!allow || allow(c))));
      const found: (OcrChar & { steps: number; index: number })[] = [];
      let previous = 0;
      for (let t = 0; t < steps; t++) {
        let best = 0, top = -Infinity;
        for (let c = 0; c < classes; c++) {
          const v = values[t * classes + c]!;
          if (v > top && usable[c]) [top, best] = [v, c];
        }
        if (best !== 0) {
          const x = ((t + 0.5) / steps) * width * (line.height / HEIGHT);
          const last = found.at(-1);
          if (best === previous && last) {
            last.x = (last.x * last.steps + x) / (last.steps + 1);
            last.steps++;
            last.score = Math.max(last.score, top);
          } else found.push({ text: chars[best]!, x, score: top, steps: 1, index: best });
        }
        previous = best;
      }
      return found.map(({ text, x, score }) => ({ text, x, score }));
    },
  };
}
