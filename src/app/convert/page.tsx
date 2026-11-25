import type { Metadata } from "next";
import { Converter } from "@/components/Converter";

export const metadata: Metadata = {
  title: "악보 변환",
  description: "악보 PDF를 브라우저 안에서 열어 박자 노트로 바꿉니다.",
};

export default function ConvertPage() {
  return (
    <>
      <h1>악보 변환</h1>
      <Converter />
    </>
  );
}
