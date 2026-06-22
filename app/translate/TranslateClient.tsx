"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RealtimeSession, type RealtimeState } from "@/lib/realtimeClient";
import { Controls } from "@/components/Controls";
import { Subtitles } from "@/components/Subtitles";

// 翻訳のクライアントUI。
// 非交渉制約:
//  - 字幕(本文)はメモリ state のみ。storage / console / log に出さない。
//  - Stop / unload で接続とマイクを確実に解放。

const MAX_LINES = 50; // 表示行の上限（メモリのみ・保存しない）。

export default function TranslateClient() {
  const [state, setState] = useState<RealtimeState>("idle");
  const [lines, setLines] = useState<string[]>([]);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const sessionRef = useRef<RealtimeSession | null>(null);
  const currentLineRef = useRef<string>("");

  const appendDelta = useCallback((text: string) => {
    // 増分を現在行に連結。改行で行を確定。本文はログしない。
    currentLineRef.current += text;
    setLines((prev) => {
      const next = [...prev];
      if (next.length === 0) next.push("");
      next[next.length - 1] = currentLineRef.current;
      return next.slice(-MAX_LINES);
    });
    if (text.includes("\n")) {
      currentLineRef.current = "";
      setLines((prev) => [...prev, ""].slice(-MAX_LINES));
    }
  }, []);

  const start = useCallback(async () => {
    setErrorCode(null);
    const session = new RealtimeSession({
      onDelta: appendDelta,
      onStateChange: setState,
      onError: setErrorCode,
    });
    sessionRef.current = session;
    await session.start();
  }, [appendDelta]);

  const stop = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
  }, []);

  const clear = useCallback(() => {
    currentLineRef.current = "";
    setLines([]);
  }, []);

  // ページ離脱 / バックグラウンドで確実に解放（iOS Safari は pagehide が確実）。
  useEffect(() => {
    const release = () => sessionRef.current?.stop();
    window.addEventListener("pagehide", release);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") release();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", release);
      document.removeEventListener("visibilitychange", onVisibility);
      sessionRef.current?.stop();
    };
  }, []);

  return (
    <>
      <Controls state={state} onStart={start} onStop={stop} onClear={clear} />
      {errorCode && (
        <p style={{ color: "var(--danger)" }} role="alert">
          {errorMessage(errorCode)}
        </p>
      )}
      <Subtitles lines={lines} />
    </>
  );
}

// エラーコード → 表示文言（本文は含めない）。
function errorMessage(code: string): string {
  switch (code) {
    case "AUTH_REQUIRED":
      return "セッションが切れました。再ログインしてください。";
    case "NOT_ALLOWED":
      return "このアカウントは利用を許可されていません。";
    case "RATE_LIMITED":
      return "リクエストが多すぎます。少し待って再試行してください。";
    case "SDP_EXCHANGE_FAILED":
    case "CONNECTION_LOST":
      return "接続に失敗しました。再試行してください。";
    case "START_FAILED":
      return "マイクの取得または接続開始に失敗しました。マイク権限を確認してください。";
    default:
      return "エラーが発生しました。再試行してください。";
  }
}
