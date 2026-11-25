import type { NextConfig } from "next";

const config: NextConfig = {
  // 서버 없이 정적 파일만 만든다. 어떤 정적 호스팅에도 올릴 수 있어야 한다.
  output: "export",
  // 주소마다 폴더/index.html을 만들어, 확장자를 붙여 주지 않는 서버에서도 열리게 한다.
  trailingSlash: true,
  // 이미지 최적화 서버(Vercel 전용 기능 포함)를 쓰지 않는다.
  images: { unoptimized: true },
};

export default config;
