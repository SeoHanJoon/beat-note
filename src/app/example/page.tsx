import type { Metadata } from "next";
import { DownloadButton } from "@/components/DownloadButton";
import { NotePreview } from "@/components/NotePreview";
import { exampleSong } from "@/lib/song/example";

export const metadata: Metadata = {
  title: "박자 노트 예시",
  description: "직접 지은 짧은 노래로 만든 박자 노트를 재생하고 내려받아 볼 수 있습니다.",
};

export default function ExamplePage() {
  const song = exampleSong();
  return (
    <>
      <h1>박자 노트 예시</h1>
      <p className="lead">
        직접 지은 짧은 노래로 만든 박자 노트입니다. 내려받은 파일은 인터넷 없이도 재생하고 인쇄할 수 있습니다.
      </p>
      <p>
        <DownloadButton song={song} />
      </p>
      <NotePreview song={song} />
    </>
  );
}
