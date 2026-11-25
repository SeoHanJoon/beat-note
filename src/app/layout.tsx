import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "beat-note", template: "%s | beat-note" },
  description: "악보 PDF를 글자와 박자만 보이는 연습용 박자 노트로 바꿉니다.",
};

export const viewport: Viewport = { themeColor: "#fbfbfa" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="site-header">
          <div className="wrap">
            <Link className="site-name" href="/">
              beat-note
            </Link>
            <nav aria-label="주 메뉴">
              <Link href="/convert/">변환</Link>
              <Link href="/example/">예시</Link>
              <Link href="/guide/">사용법</Link>
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            <span>악보를 서버로 보내거나 저장하지 않습니다.</span>
            <nav aria-label="안내">
              <Link href="/rhythm/">박자 읽기</Link>
              <Link href="/terms/">이용약관</Link>
              <Link href="/privacy/">개인정보</Link>
              <Link href="/copyright/">저작권</Link>
              <Link href="/licenses/">라이선스</Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
