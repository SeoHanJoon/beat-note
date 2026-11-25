"use client";

import { useState } from "react";
import { noteFileName, renderNote, TEMPLATE_PATH } from "@/lib/song/export";
import type { Song } from "@/lib/song/types";

export function DownloadButton({ song }: { song: Song }) {
  const [error, setError] = useState("");

  async function download() {
    setError("");
    try {
      const response = await fetch(TEMPLATE_PATH);
      if (!response.ok) throw new Error(String(response.status));
      const html = renderNote(await response.text(), song);
      const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = noteFileName(song);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError("파일을 만들지 못했습니다. 인터넷 연결을 확인하고 다시 눌러 주세요.");
    }
  }

  return (
    <>
      <button type="button" className="button" onClick={download}>
        HTML 내려받기
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
