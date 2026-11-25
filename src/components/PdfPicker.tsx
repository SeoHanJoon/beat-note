"use client";

import { useState, type DragEvent } from "react";

/** 파일을 고르거나 끌어다 놓는 자리 */
export function PdfPicker({ disabled, onFile }: { disabled?: boolean; onFile: (file: File) => void }) {
  const [over, setOver] = useState(false);

  function drop(event: DragEvent) {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files[0];
    if (file && !disabled) onFile(file);
  }

  return (
    <label
      className={"picker" + (over ? " over" : "")}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
    >
      <input
        type="file"
        accept="application/pdf,.pdf"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
      <strong>악보 PDF 고르기</strong>
      <span>누르거나 파일을 끌어다 놓으세요. 파일은 이 기기 밖으로 나가지 않습니다.</span>
    </label>
  );
}
