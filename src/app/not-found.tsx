import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "페이지를 찾을 수 없습니다" };

export default function NotFound() {
  return (
    <>
      <h1>페이지를 찾을 수 없습니다</h1>
      <p>
        주소를 다시 확인하거나 <Link href="/">처음으로</Link> 돌아가 주세요.
      </p>
    </>
  );
}
