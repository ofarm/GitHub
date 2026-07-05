"use client";

import { useEffect, useRef, useState } from "react";

const NEAR_BOTTOM_PX = 40; // これ未満なら「下端付近」とみなし自動追従を維持/再開する。

// 英語原文と日本語訳を併記表示する。React のテキストノードとして描画
// （XSS 回避: dangerouslySetInnerHTML 不使用）。本文はメモリ(props)のみ。保存・ログしない。
// en/ja は別系統の増分。行インデックスで対応付けて段組み表示する（多少のズレは許容）。
export function Subtitles({ jaLines, enLines }: { jaLines: string[]; enLines: string[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const [followLatest, setFollowLatest] = useState(true);
  const count = Math.max(jaLines.length, enLines.length);

  // 最新行へ自動スクロール（追従中のみ。読み返しのため上へスクロール中は追従を止める）。
  useEffect(() => {
    if (followLatest) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [jaLines, enLines, followLatest]);

  // 手動スクロールを検知: 下端付近に戻れば追従を再開、離れれば停止する。
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setFollowLatest(distanceFromBottom < NEAR_BOTTOM_PX);
  };

  const jumpToLatest = () => {
    setFollowLatest(true);
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 200, display: "flex" }}>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        aria-live="polite"
        style={{
          flex: 1,
          overflowY: "auto",
          background: "rgba(255,255,255,0.04)",
          borderRadius: 12,
          padding: 16,
        }}
      >
        {count === 0 ? (
          <p style={{ color: "var(--muted)" }}>
            Start を押すと、英語の音声がリアルタイムで日本語に翻訳され、英語原文と併記表示されます。
          </p>
        ) : (
          Array.from({ length: count }).map((_, i) => {
            const en = enLines[i];
            const ja = jaLines[i];
            const latest = i === count - 1;
            return (
              <div key={i} style={{ marginBottom: 14 }}>
                {en && (
                  <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
                    {en}
                  </p>
                )}
                {ja && (
                  <p
                    style={{
                      margin: "2px 0 0",
                      fontSize: 19,
                      lineHeight: 1.6,
                      opacity: latest ? 1 : 0.85,
                    }}
                  >
                    {ja}
                  </p>
                )}
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>
      {!followLatest && count > 0 && (
        <button
          type="button"
          onClick={jumpToLatest}
          style={{
            position: "absolute",
            bottom: 12,
            right: 12,
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: 20,
            padding: "8px 16px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          ↓ 最新へ
        </button>
      )}
    </div>
  );
}
