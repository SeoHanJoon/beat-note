import type { Metadata } from "next";

export const metadata: Metadata = { title: "저작권 안내" };

export default function CopyrightPage() {
  return (
    <article>
      <h1>저작권 안내</h1>
      <p className="notice">정식 공개 전의 초안입니다. 법률 검토를 받지 않았으며 법률 자문이 아닙니다.</p>

      <h2>악보와 가사</h2>
      <p>대부분의 악보와 가사에는 저작권이 있습니다. 개인이 집에서 연습하려고 바꾸는 것과, 바꾼 것을 다른 사람에게 주거나 인터넷에 올리는 것은 다릅니다. 나눠 주려면 저작권자에게 허락을 받아야 할 수 있습니다.</p>
      <p>악보를 산 곳의 이용 조건도 확인해 주세요. 변환이나 복제를 금지하는 조건이 있을 수 있습니다.</p>

      <h2>이 사이트가 하는 일</h2>
      <ul>
        <li>악보, 가사, 변환 결과를 서버에 두지 않고 다른 이용자와 나누는 기능을 만들지 않습니다.</li>
        <li>암호가 걸렸거나 복사가 제한된 PDF를 거절합니다.</li>
        <li>악보에 적힌 저작권 표시를 읽어 결과에 남깁니다. 잘못 읽었으면 교정 화면에서 바로잡아 주세요.</li>
        <li>사이트의 예시와 시험 악보는 직접 지은 노래로 만들었습니다.</li>
      </ul>

      <h2>권리자께</h2>
      <p>
        이 사이트나 저장소에 권리를 침해하는 내용이 있다면 <a href="https://github.com/SeoHanJoon/beat-note/issues">GitHub 이슈</a>로 알려 주세요. 확인해서 지우겠습니다.
      </p>
    </article>
  );
}
