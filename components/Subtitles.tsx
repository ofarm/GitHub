"use client";

import { useEffect, useRef } from "react";

// 字幕表示。React のテキストノードとして描画（XSS 回避: dangerouslySetInnerHTML 不使用）。
// 本文はメモリ(props)のみ。保存・ログしない。
export function Subtitles({ lines }: { lines: string[] }) {
  const endRef = useRef<HTMLDivElement | null>(null);

  // 最新行へ自動スクロール。
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines]);

  return (
    <div
      aria-live="polite"
      style={{
        flex: 1,
        overflowY: "auto",
        background: "rgba(255,255,255,0.04)",
        borderRadius: 12,
        padding: 16,
        lineHeight: 1.7,
        fontSize: 18,
        minHeight: 200,
      }}
    >
      {lines.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>
          Start を押すと、会議などの英語音声がリアルタイムで日本語字幕になります。
        </p>
      ) : (
        lines.map((line, i) => (
          <p key={i} style={{ margin: "0 0 10px", opacity: i === lines.length - 1 ? 1 : 0.85 }}>
            {line}
          </p>
        ))
      )}
      <div ref={endRef} />
    </div>
  );
}
