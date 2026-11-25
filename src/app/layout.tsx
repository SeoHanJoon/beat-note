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
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="site-footer">
          <div className="wrap">악보를 서버로 보내거나 저장하지 않습니다.</div>
        </footer>
      </body>
    </html>
  );
}
