// 스캔에서 생기는 여러 손상을 흉내 낸다. 같은 입력이면 항상 같은 결과가 나온다.
import { rotate } from "../../src/lib/reader/image.ts";
import { resizeLine } from "../../src/lib/reader/ocr.ts";
import type { Gray } from "../../src/lib/reader/types.ts";

const map = (g: Gray, f: (v: number, i: number) => number): Gray => ({ ...g, data: Uint8Array.from(g.data, (v, i) => Math.max(0, Math.min(255, f(v, i)))) });

function blur(g: Gray, radius: number): Gray {
  const pass = (src: Uint8Array, step: number, count: number, lineStep: number, lines: number) => {
    const out = new Uint8Array(src.length);
    for (let l = 0; l < lines; l++)
      for (let k = 0; k < count; k++) {
        let sum = 0, n = 0;
        for (let d = -radius; d <= radius; d++) {
          if (k + d < 0 || k + d >= count) continue;
          sum += src[l * lineStep + (k + d) * step]!;
          n++;
        }
        out[l * lineStep + k * step] = sum / n;
      }
    return out;
  };
  return { ...g, data: pass(pass(g.data, 1, g.width, g.width, g.height), g.width, g.height, 1, g.width) };
}

function noise(g: Gray, amount: number, dots: number): Gray {
  let seed = 12345;
  const next = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  return map(g, (v) => {
    const r = next();
    if (r < dots) return 0;
    if (r > 1 - dots) return 255;
    return v + (next() - 0.5) * amount;
  });
}

const scale = (g: Gray, k: number) => resizeLine(g, Math.round(g.height * k));

/** 한쪽이 어두운 그림자 */
const shade = (g: Gray) => map(g, (v, i) => v * (0.72 + 0.28 * ((i % g.width) / g.width)));

export const DISTORTIONS: [name: string, apply: (g: Gray) => Gray][] = [
  ["원본", (g) => g],
  ["0.5° 기울임", (g) => rotate(g, 0.0087)],
  ["-1° 기울임", (g) => rotate(g, -0.0175)],
  ["흐림", (g) => blur(g, 1)],
  ["심한 흐림", (g) => blur(g, 2)],
  ["잡음", (g) => noise(g, 80, 0.001)],
  ["연한 인쇄", (g) => map(g, (v) => 110 + v * 0.5)],
  ["그림자", shade],
  ["흑백 스캔", (g) => map(blur(g, 1), (v) => (v < 140 ? 0 : 255))],
  ["200dpi", (g) => scale(g, 2 / 3)],
  ["150dpi", (g) => scale(g, 1 / 2)],
  ["400dpi", (g) => scale(g, 4 / 3)],
  ["흐림+기울임+잡음", (g) => noise(rotate(blur(g, 1), 0.006), 60, 0.0005)],
];
