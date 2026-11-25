import Link from "next/link";

export default function Home() {
  return (
    <>
      <h1>악보를 글자와 박자만 남긴 박자 노트로</h1>
      <p className="lead">
        노래 악보 PDF에서 가사와 음 길이를 읽어, 한 박을 네 칸으로 나눈 연습용 페이지를 만듭니다.
      </p>
      <p className="notice">자동 인식은 틀릴 수 있으니 결과를 원본과 비교해 주세요.</p>
      <p>
        <Link href="/convert/">악보 변환하기</Link> · <Link href="/example/">직접 지은 노래로 만든 예시 보기</Link>
      </p>

      <h2>어떻게 만드나요</h2>
      <ol>
        <li>브라우저에서 악보 PDF를 엽니다.</li>
        <li>마디, 음 길이, 가사를 읽고 확신이 낮은 곳을 표시합니다.</li>
        <li>원본과 나란히 보며 고친 뒤 HTML 파일 하나로 내려받습니다.</li>
      </ol>
      <p>모든 과정을 사용하는 기기 안에서 처리합니다.</p>
    </>
  );
}
