"use client";

import { useEffect, useRef } from "react";
import { TEMPLATE_PATH } from "@/lib/song/export";
import type { Song } from "@/lib/song/types";

/** 박자 노트를 사이트와 분리된 창(sandbox) 안에 보여 준다. */
export function NotePreview({ song }: { song: Song }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef(song);

  useEffect(() => {
    latest.current = song;
    const send = () => frame.current?.contentWindow?.postMessage({ type: "beat-note:song", song: latest.current }, "*");
    const onMessage = (event: MessageEvent) => {
      if (event.source === frame.current?.contentWindow && event.data?.type === "beat-note:ready") send();
    };
    addEventListener("message", onMessage);
    send();
    return () => removeEventListener("message", onMessage);
  }, [song]);

  return <iframe ref={frame} className="note-preview" title="박자 노트 미리보기" src={TEMPLATE_PATH} sandbox="allow-scripts" />;
}
