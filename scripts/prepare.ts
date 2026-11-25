// 빌드 전에 pdf.js가 실행 중에 읽는 파일을 public/vendor로 복사한다.
// Liberation 글꼴(GPLv2와 예외 조항)과 쓰지 않는 QuickJS는 복사하지 않는다.
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const from = join(root, "node_modules", "pdfjs-dist");
const to = join(root, "public", "vendor", "pdfjs");

rmSync(join(root, "public", "vendor"), { recursive: true, force: true });
mkdirSync(to, { recursive: true });

cpSync(join(from, "LICENSE"), join(to, "LICENSE"));
cpSync(join(from, "legacy", "build", "pdf.worker.min.mjs"), join(to, "pdf.worker.min.mjs"));
cpSync(join(from, "cmaps"), join(to, "cmaps"), { recursive: true });
cpSync(join(from, "iccs"), join(to, "iccs"), { recursive: true });

const copyMatching = (dir: string, pattern: RegExp) => {
  for (const name of readdirSync(join(from, dir))) {
    if (pattern.test(name)) cpSync(join(from, dir, name), join(to, dir, name));
  }
};
copyMatching("standard_fonts", /^(Foxit.*\.pfb|LICENSE_FOXIT)$/);
copyMatching("wasm", /^(jbig2|openjpeg|qcms)|^LICENSE_(?!.*QUICKJS)/);
