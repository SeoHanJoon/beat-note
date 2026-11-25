import type { PDFDocumentProxy } from "pdfjs-dist";

export type PdfProblem = "not-pdf" | "too-large" | "too-many-pages" | "encrypted" | "restricted" | "damaged" | "unavailable";

export class PdfError extends Error {
  problem: PdfProblem;
  constructor(problem: PdfProblem) {
    super(problem);
    this.problem = problem;
  }
}

export const MAX_BYTES = 50 * 1024 * 1024;
export const MAX_PAGES = 30;
/** 인식에 쓰는 해상도. 흔한 스캔 해상도와 같다. */
export const RENDER_DPI = 300;
const MAX_PIXELS = 24_000_000;
const COPY_PERMISSION = 0x10;

export const PDF_MESSAGES: Record<PdfProblem, string> = {
  "not-pdf": "PDF 파일이 아닙니다. 악보 PDF를 골라 주세요.",
  "too-large": `파일이 너무 큽니다. ${MAX_BYTES / 1024 / 1024}MB 이하인 PDF를 골라 주세요.`,
  "too-many-pages": `쪽수가 너무 많습니다. ${MAX_PAGES}쪽 이하인 PDF를 골라 주세요.`,
  encrypted: "암호가 걸린 PDF는 열지 않습니다.",
  restricted: "복사가 제한된 PDF는 변환하지 않습니다.",
  damaged: "PDF가 손상되어 열 수 없습니다.",
  unavailable: "PDF를 여는 도구를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.",
};

/** 파일 앞부분에 PDF 표시가 있는지 본다. 앞에 다른 바이트가 조금 있는 PDF도 허용한다. */
export function looksLikePdf(data: Uint8Array): boolean {
  let head = "";
  for (const byte of data.subarray(0, 1024)) head += String.fromCharCode(byte);
  return head.includes("%PDF-");
}

type Pdfjs = typeof import("pdfjs-dist");
export type PdfjsFiles = { pdfjs: Pdfjs; base: string };

async function loadPdfjs(): Promise<PdfjsFiles> {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as Pdfjs;
  const base = "/vendor/pdfjs/";
  pdfjs.GlobalWorkerOptions.workerSrc = base + "pdf.worker.min.mjs";
  return { pdfjs, base };
}

/** PDF를 열고 변환해도 되는지 확인한다. 안 되면 PdfError. */
export async function openPdf(data: Uint8Array, load: () => Promise<PdfjsFiles> = loadPdfjs): Promise<PDFDocumentProxy> {
  if (data.length > MAX_BYTES) throw new PdfError("too-large");
  if (!looksLikePdf(data)) throw new PdfError("not-pdf");
  const { pdfjs, base } = await load().catch(() => {
    throw new PdfError("unavailable");
  });
  const task = pdfjs.getDocument({
    data,
    cMapUrl: base + "cmaps/",
    iccUrl: base + "iccs/",
    standardFontDataUrl: base + "standard_fonts/",
    wasmUrl: base + "wasm/",
    useSystemFonts: true,
    enableXfa: false,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });
  let encrypted = false;
  task.onPassword = () => {
    encrypted = true;
    void task.destroy();
  };
  let pdf: PDFDocumentProxy;
  try {
    pdf = await task.promise;
  } catch (error) {
    if (encrypted || (error instanceof Error && error.name === "PasswordException")) throw new PdfError("encrypted");
    throw new PdfError("damaged");
  }
  try {
    const permissions = await pdf.getPermissions();
    if (permissions && !permissions.has(COPY_PERMISSION)) throw new PdfError("restricted");
    if (pdf.numPages > MAX_PAGES) throw new PdfError("too-many-pages");
    await pdf.getPage(1);
  } catch (error) {
    void task.destroy();
    throw error instanceof PdfError ? error : new PdfError("damaged");
  }
  return pdf;
}

/** 쪽을 그릴 배율. 아주 큰 쪽은 화소 수를 제한한다. */
export function renderScale(width: number, height: number): number {
  const scale = RENDER_DPI / 72;
  return Math.min(scale, Math.sqrt(MAX_PIXELS / (width * height)));
}

export async function renderPage(pdf: PDFDocumentProxy, number: number): Promise<HTMLCanvasElement> {
  try {
    const page = await pdf.getPage(number);
    const size = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: renderScale(size.width, size.height) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, viewport, background: "#fff" }).promise;
    page.cleanup();
    return canvas;
  } catch {
    throw new PdfError("damaged");
  }
}
