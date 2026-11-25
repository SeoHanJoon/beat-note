// 배포물에 들어가는 것의 목록. 라이선스 페이지와 검사가 함께 쓴다.
export type Notice = {
  name: string;
  license: string;
  use: string;
  /** node_modules 안의 원문. 없으면 public에 있는 원문을 쓴다. */
  from?: string;
  /** public 안의 원문 */
  file: string;
  /** package-lock에서 버전을 찾을 이름 */
  package?: string;
};

export const ALLOWED = ["MIT", "ISC", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "CC0-1.0", "OFL-1.1", "Unlicense", "Zlib"];

export const NOTICES: Notice[] = [
  { name: "Next.js", package: "next", license: "MIT", use: "화면", from: "next/license.md", file: "next.txt" },
  { name: "React", package: "react", license: "MIT", use: "화면", from: "react/LICENSE", file: "react.txt" },
  { name: "React DOM", package: "react-dom", license: "MIT", use: "화면", from: "react-dom/LICENSE", file: "react-dom.txt" },
  { name: "Scheduler", package: "scheduler", license: "MIT", use: "화면", from: "scheduler/LICENSE", file: "scheduler.txt" },
  { name: "SWC Helpers", package: "@swc/helpers", license: "Apache-2.0", use: "화면", from: "@swc/helpers/LICENSE", file: "swc-helpers.txt" },
  { name: "PDF.js", package: "pdfjs-dist", license: "Apache-2.0", use: "PDF 열기", from: "pdfjs-dist/LICENSE", file: "pdfjs.txt" },
  { name: "Adobe CMap (PDF.js)", license: "BSD-3-Clause", use: "PDF 글자", from: "pdfjs-dist/cmaps/LICENSE", file: "pdfjs-cmaps.txt" },
  { name: "Foxit 글꼴 (PDF.js)", license: "BSD-3-Clause", use: "PDF 글자", from: "pdfjs-dist/standard_fonts/LICENSE_FOXIT", file: "pdfjs-foxit.txt" },
  { name: "ICC 프로필 (PDF.js)", license: "CC0-1.0", use: "PDF 색", from: "pdfjs-dist/iccs/LICENSE", file: "pdfjs-icc.txt" },
  { name: "PDFium JBIG2 (PDF.js)", license: "BSD-3-Clause", use: "PDF 이미지", from: "pdfjs-dist/wasm/LICENSE_JBIG2", file: "pdfjs-jbig2.txt" },
  { name: "OpenJPEG (PDF.js)", license: "BSD-2-Clause", use: "PDF 이미지", from: "pdfjs-dist/wasm/LICENSE_OPENJPEG", file: "pdfjs-openjpeg.txt" },
  { name: "QCMS (PDF.js)", license: "MIT", use: "PDF 색", from: "pdfjs-dist/wasm/LICENSE_QCMS", file: "pdfjs-qcms.txt" },
  { name: "ONNX Runtime Web", package: "onnxruntime-web", license: "MIT", use: "가사 인식 실행", file: "../../licenses/onnxruntime-LICENSE.txt" },
  { name: "ONNX Runtime 제3자 고지", license: "MIT", use: "가사 인식 실행", file: "../../licenses/onnxruntime-ThirdPartyNotices.txt" },
  { name: "PaddleOCR korean_PP-OCRv5_mobile_rec", license: "Apache-2.0", use: "가사 인식 모델", file: "../../models/LICENSE" },
];
