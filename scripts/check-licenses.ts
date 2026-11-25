// 배포물(out/)에 허용한 라이선스만 있는지 검사한다.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { ALLOWED, NOTICES } from "./licenses.ts";

const root = join(import.meta.dirname, "..");
const out = join(root, "out");
const problems: string[] = [];
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")) as {
  packages: Record<string, { version?: string; license?: string; dev?: boolean; optional?: boolean; devOptional?: boolean; dependencies?: Record<string, string> }>;
};

// 1. 실행에 쓰는 패키지(개발용·선택 제외)의 라이선스. 빌드할 때만 쓰는 데이터는 따로 허용한다.
const BUILD_ONLY: Record<string, string> = { "caniuse-lite": "CC-BY-4.0" };
for (const [path, info] of Object.entries(lock.packages)) {
  if (!path || info.dev || info.optional || info.devOptional) continue;
  const name = path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
  if (info.license && (ALLOWED.includes(info.license) || BUILD_ONLY[name] === info.license)) continue;
  problems.push(`허용하지 않은 라이선스: ${name} (${info.license ?? "없음"})`);
}
// 2. 직접 쓰는 패키지는 모두 고지 목록에 있어야 한다.
for (const name of Object.keys(lock.packages[""]?.dependencies ?? {})) {
  if (!NOTICES.some((n) => n.package === name)) problems.push(`라이선스 고지에 없음: ${name}`);
}
// 3. 원문이 배포물에 있어야 한다.
for (const notice of NOTICES) {
  if (!ALLOWED.includes(notice.license)) problems.push(`허용하지 않은 라이선스: ${notice.name} (${notice.license})`);
  const file = join(out, "vendor", "licenses", notice.file);
  if (!existsSync(file) || readFileSync(file).length < 400) problems.push(`라이선스 원문 없음: ${notice.name} (${relative(out, file)})`);
}
// 4. 배포물의 파일은 출처를 아는 것만 있어야 한다.
const KNOWN: RegExp[] = [
  // Turbopack은 Worker의 원본(.ts)과 빈 소스맵도 내보낸다. 둘 다 이 저장소의 것이다.
  /^_next\/static\/.+\.(js|css|svg)$/, /^_next\/static\/media\/worker\.[\w~-]+\.ts$/, /^_next\/static\/chunks\/[\w~-]+\.js\.map$/, /^(.+\/)?(index\.html|index\.txt|__next\..+\.txt)$/, /^(404\.html|icon\.svg|note-template\.html)$/, /^__next\..+\.txt$/,
  /^vendor\/pdfjs\/(LICENSE|pdf\.worker\.min\.mjs)$/, /^vendor\/pdfjs\/cmaps\/([\w-]+\.bcmap|LICENSE)$/, /^vendor\/pdfjs\/iccs\/(CGATS001Compat-v2-micro\.icc|LICENSE)$/,
  /^vendor\/pdfjs\/standard_fonts\/(Foxit\w+\.pfb|LICENSE_FOXIT)$/, /^vendor\/pdfjs\/wasm\/((jbig2|openjpeg|qcms)[\w.]*|LICENSE_\w+)$/,
  /^vendor\/ort\/(ort\.wasm\.min\.mjs|ort-wasm-simd-threaded\.(mjs|wasm))$/, /^vendor\/licenses\/[\w-]+\.txt$/,
  /^licenses\/onnxruntime-(LICENSE|ThirdPartyNotices)\.txt$/, /^models\/(korean-rec\.onnx|korean-dict\.txt|LICENSE|README\.txt)$/,
];
const files = readdirSync(out, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => relative(out, join(e.parentPath, e.name)));
for (const file of files) {
  if (!KNOWN.some((k) => k.test(file))) problems.push(`출처를 모르는 파일: ${file}`);
  if (/liberation|quickjs/i.test(file)) problems.push(`배포하면 안 되는 파일: ${file}`);
}
// 5. 코드 안의 GPL 표시. 라이선스 원문과 모델은 뺀다.
for (const file of files.filter((f) => /\.(m?js|css|html)$/.test(f) && !f.startsWith("vendor/licenses/"))) {
  const text = readFileSync(join(out, file), "utf8");
  const found = /GNU (?:Affero |Lesser )?General Public License|\b(?:A|L)?GPL-?[23]/i.exec(text);
  if (found) problems.push(`GPL 표시: ${file} "${found[0]}"`);
}
// 6. 제3자 고지가 배포하는 ONNX Runtime과 같은 버전에서 가져온 것인지
const NOTICE_VERSION = "1.31.1";
const version = lock.packages["node_modules/onnxruntime-web"]?.version;
if (version !== NOTICE_VERSION) problems.push(`ONNX Runtime이 ${version}인데 제3자 고지는 ${NOTICE_VERSION}의 것`);
const readme = readFileSync(join(root, "public/models/README.txt"), "utf8");
if (!readme.includes(createHash("sha256").update(readFileSync(join(out, "models/korean-rec.onnx"))).digest("hex"))) problems.push("모델 파일이 기록과 다름");

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`라이선스 검사 통과: 파일 ${files.length}개, 고지 ${NOTICES.length}개`);
