// 권한 시험에 쓰는 작은 PDF를 만든다. 암호화는 PDF 표준 보안(RC4 128비트, 리비전 3)을 그대로 구현했다.
import { createHash } from "node:crypto";

const PAD = Buffer.from("28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A", "hex");
const md5 = (...parts: Uint8Array[]) => createHash("md5").update(Buffer.concat(parts)).digest();

function rc4(key: Uint8Array, data: Uint8Array): Buffer {
  const s = Uint8Array.from({ length: 256 }, (_, i) => i);
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i]! + key[i % key.length]!) & 255;
    [s[i], s[j]] = [s[j]!, s[i]!];
  }
  const out = Buffer.alloc(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k++) {
    i = (i + 1) & 255;
    j = (j + s[i]!) & 255;
    [s[i], s[j]] = [s[j]!, s[i]!];
    out[k] = data[k]! ^ s[(s[i]! + s[j]!) & 255]!;
  }
  return out;
}
const xorKey = (key: Uint8Array, n: number) => key.map((b) => b ^ n);
const pad = (password: string) => Buffer.concat([Buffer.from(password, "latin1"), PAD]).subarray(0, 32);

export type PdfOptions = { pages?: number; userPassword?: string; ownerPassword?: string; allowCopy?: boolean };

export function makePdf({ pages = 1, userPassword, ownerPassword, allowCopy = true }: PdfOptions = {}): Uint8Array<ArrayBuffer> {
  const secured = userPassword !== undefined || ownerPassword !== undefined;
  const id = Buffer.alloc(16, 7);
  let key: Buffer | undefined, encrypt = "";
  if (secured) {
    const permission = allowCopy ? -4 : -4 & ~0x10;
    const p = Buffer.alloc(4);
    p.writeInt32LE(permission);
    let ownerKey = md5(pad(ownerPassword ?? userPassword ?? ""));
    for (let i = 0; i < 50; i++) ownerKey = md5(ownerKey);
    let o: Buffer = pad(userPassword ?? "");
    for (let i = 0; i < 20; i++) o = rc4(xorKey(ownerKey, i), o);
    key = md5(pad(userPassword ?? ""), o, p, id);
    for (let i = 0; i < 50; i++) key = md5(key);
    let u: Buffer = md5(PAD, id);
    for (let i = 0; i < 20; i++) u = rc4(xorKey(key, i), u);
    u = Buffer.concat([u, Buffer.alloc(16)]);
    encrypt = `<< /Filter /Standard /V 2 /R 3 /Length 128 /P ${permission} /O <${o.toString("hex")}> /U <${u.toString("hex")}> >>`;
  }
  const objects: (Buffer | string)[] = [];
  const kids = Array.from({ length: pages }, (_, i) => `${3 + i * 2} 0 R`).join(" ");
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`;
  for (let i = 0; i < pages; i++) {
    const number = 4 + i * 2;
    let content: Buffer = Buffer.from("2 w 50 700 m 545 700 l S 100 500 200 100 re f");
    if (key) {
      const extra = Buffer.from([number & 255, number >> 8, 0, 0, 0]);
      content = rc4(md5(key, extra).subarray(0, 16), content);
    }
    objects[3 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${number} 0 R /Resources << >> >>`;
    objects[number] = Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from("\nendstream")]);
  }
  if (secured) objects.push(encrypt);

  const parts: Buffer[] = [Buffer.from("%PDF-1.6\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  let length = parts[0]!.length;
  const offsets: number[] = [];
  const add = (part: Buffer) => {
    parts.push(part);
    length += part.length;
  };
  for (let n = 1; n < objects.length; n++) {
    offsets[n] = length;
    add(Buffer.concat([Buffer.from(`${n} 0 obj\n`), Buffer.from(objects[n]!), Buffer.from("\nendobj\n")]));
  }
  const start = length;
  const rows = offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  add(Buffer.from(`xref\n0 ${objects.length}\n0000000000 65535 f \n${rows}`));
  const hex = id.toString("hex");
  add(Buffer.from(`trailer\n<< /Size ${objects.length} /Root 1 0 R /ID [<${hex}> <${hex}>]${secured ? ` /Encrypt ${objects.length - 1} 0 R` : ""} >>\nstartxref\n${start}\n%%EOF\n`));
  return new Uint8Array(Buffer.concat(parts));
}

/** 이름을 붙인 시험 파일 */
export const badPdfs: [name: string, problem: string, data: () => Uint8Array<ArrayBuffer>][] = [
  ["암호", "encrypted", () => makePdf({ userPassword: "secret" })],
  ["복사 제한", "restricted", () => makePdf({ ownerPassword: "owner", allowCopy: false })],
  ["잘린 파일", "damaged", () => makePdf().slice(0, 60)],
  ["머리만 PDF", "damaged", () => new Uint8Array(Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(4000, 0x41)]))],
  ["글 파일", "not-pdf", () => new Uint8Array(Buffer.from("악보가 아닙니다"))],
  ["PNG", "not-pdf", () => new Uint8Array(Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"))],
  ["빈 파일", "not-pdf", () => new Uint8Array()],
  ["31쪽", "too-many-pages", () => makePdf({ pages: 31 })],
];
