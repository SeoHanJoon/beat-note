import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { NOTICES } from "../../../scripts/licenses";

export const metadata: Metadata = { title: "오픈소스 라이선스" };

const lock = JSON.parse(readFileSync(join(process.cwd(), "package-lock.json"), "utf8")) as { packages: Record<string, { version?: string }> };

/** /vendor/licenses 기준의 경로를 주소로 바꾼다. */
const urlOf = (file: string) => new URL(file, "http://x/vendor/licenses/").pathname;

export default function LicensesPage() {
  return (
    <article>
      <h1>오픈소스 라이선스</h1>
      <p className="lead">이 사이트는 다음 소프트웨어와 자료를 함께 배포합니다. 이름을 누르면 라이선스 원문이 열립니다.</p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">이름</th>
              <th scope="col">버전</th>
              <th scope="col">라이선스</th>
              <th scope="col">쓰는 곳</th>
            </tr>
          </thead>
          <tbody>
            {NOTICES.map((n) => (
              <tr key={n.name}>
                <th scope="row">
                  <a href={urlOf(n.file)}>{n.name}</a>
                </th>
                <td>{n.package ? lock.packages[`node_modules/${n.package}`]?.version : ""}</td>
                <td>{n.license}</td>
                <td>{n.use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>PDF.js에 들어 있는 Liberation 글꼴은 배포하지 않습니다.</p>
    </article>
  );
}
