import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "박자 읽기", description: "박자 노트의 칸과 선을 읽고 박을 세는 방법입니다." };

const ROWS: [string, string, string][] = [
  ["온음표", "16칸", "네 박"],
  ["2분음표", "8칸", "두 박"],
  ["점4분음표", "6칸", "한 박 반"],
  ["4분음표", "4칸", "한 박"],
  ["점8분음표", "3칸", "한 박의 4분의 3"],
  ["8분음표", "2칸", "반 박"],
  ["16분음표", "1칸", "한 박의 4분의 1"],
];

export default function RhythmPage() {
  return (
    <article>
      <h1>박자 읽기</h1>
      <p className="lead">박자 노트는 한 줄이 한 마디이고, 한 박을 네 칸으로 나눕니다.</p>

      <h2>칸 세기</h2>
      <p>동그라미 안의 숫자가 박입니다. 박과 박 사이의 2, 3, 4는 그 박을 넷으로 나눈 칸입니다. “하나 둘 셋 넷, 둘 둘 셋 넷”처럼 셉니다. “1e&a”를 고르면 “원 이 앤 어”로 셀 수 있습니다.</p>
      <table>
        <caption>4분음표가 한 박인 악보에서 음표와 칸의 수</caption>
        <thead>
          <tr>
            <th scope="col">음표</th>
            <th scope="col">칸</th>
            <th scope="col">길이</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(([name, cells, length]) => (
            <tr key={name}>
              <th scope="row">{name}</th>
              <td>{cells}</td>
              <td>{length}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>선과 빈칸</h2>
      <ul>
        <li>글자가 놓인 칸에서 소리를 냅니다.</li>
        <li>파란 선이 이어지는 동안 소리를 끕니다. 선이 다음 박이나 다음 줄로 이어지면 끊지 않고 부릅니다.</li>
        <li>글자도 선도 없는 칸은 쉽니다.</li>
      </ul>

      <h2>엇박</h2>
      <p>글자가 동그라미 칸이 아니라 3이나 4에 놓이면 박보다 늦거나 빠르게 시작하는 음입니다. 메트로놈을 “칸마다”로 두고 느리게 맞춘 다음 “정박”으로 바꿔 보세요.</p>

      <h2>셋잇단음표와 6/8박자</h2>
      <p>한 박이 세 칸이면 셋잇단음표입니다. 6/8박자는 점4분음표가 한 박이고, 한 박을 여섯 칸으로 나눕니다. 이때는 8분음표가 두 칸입니다.</p>
      <p>
        <Link href="/example/">예시</Link>에서 직접 재생해 볼 수 있습니다.
      </p>
    </article>
  );
}
