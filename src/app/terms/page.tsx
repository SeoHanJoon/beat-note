import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "이용약관" };

export default function TermsPage() {
  return (
    <article>
      <h1>이용약관</h1>
      <p className="notice">정식 공개 전의 초안입니다. 법률 검토를 받지 않았습니다.</p>

      <h2>서비스</h2>
      <p>beat-note는 이용자가 고른 악보 PDF를 이용자의 기기 안에서 박자 노트 HTML로 바꾸는 도구입니다. 악보를 제공하거나 보관하거나 다른 사람과 나누는 기능은 없습니다.</p>

      <h2>이용자의 책임</h2>
      <ul>
        <li>변환할 권한이 있는 악보만 사용해 주세요.</li>
        <li>악보와 가사, 변환 결과를 나눠 주거나 인터넷에 올리려면 저작권자의 허락이 필요할 수 있습니다.</li>
        <li>악보 파일에 걸린 보호 조치를 풀어 사용하지 마세요.</li>
      </ul>

      <h2>결과의 정확성</h2>
      <p>자동 인식은 틀릴 수 있습니다. 확인 표시가 없는 마디도 틀릴 수 있으니 연습이나 공연에 쓰기 전에 원본과 비교해 주세요.</p>

      <h2>보증과 변경</h2>
      <p>서비스는 있는 그대로 제공하며, 예고 없이 바뀌거나 멈출 수 있습니다. 법이 허용하는 범위에서, 결과를 사용해 생긴 손해를 책임지지 않습니다.</p>

      <h2>문의</h2>
      <p>
        <a href="https://github.com/SeoHanJoon/beat-note/issues">GitHub 이슈</a>에 남겨 주세요. 저작권에 관한 내용은 <Link href="/copyright/">저작권 안내</Link>를 봐 주세요.
      </p>
    </article>
  );
}
