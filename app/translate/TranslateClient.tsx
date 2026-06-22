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
  // 診断: ?debug=1 のときだけ受信イベント種別/キーを表示（値=本文は持たない）。
  const [debug, setDebug] = useState(false);
  const [eventTypes, setEventTypes] = useState<Record<string, string>>({});
  const sessionRef = useRef<RealtimeSession | null>(null);
  const currentLineRef = useRef<string>("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setDebug(new URLSearchParams(window.location.search).has("debug"));
  }, []);

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
      onEvent: (info) =>
        setEventTypes((prev) => ({ ...prev, [info.type]: info.keys.join(", ") })),
      onRemoteStream: (stream) => {
        if (audioRef.current) audioRef.current.srcObject = stream;
      },
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
      {/* 翻訳音声の再生（モデルは日本語音声を生成する）。字幕と併用。 */}
      <audio ref={audioRef} autoPlay />
      <Subtitles lines={lines} />
      {debug && (
        <div
          style={{
            fontSize: 12,
            fontFamily: "monospace",
            color: "var(--muted)",
            background: "rgba(255,255,255,0.04)",
            borderRadius: 8,
            padding: 12,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          <div>診断: 受信イベント種別（本文なし）</div>
          {Object.keys(eventTypes).length === 0 ? (
            <div>（まだイベント未受信）</div>
          ) : (
            Object.entries(eventTypes).map(([type, keys]) => (
              <div key={type}>
                • {type} — keys: [{keys}]
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}

// エラーコード → 表示文言（本文は含めない。コード/HTTPステータスは診断用に表示）。
function errorMessage(code: string): string {
  if (code.startsWith("AUTH_REQUIRED")) return "セッションが切れました。再ログインしてください。";
  if (code.startsWith("NOT_ALLOWED")) return "このアカウントは利用を許可されていません。";
  if (code.startsWith("RATE_LIMITED"))
    return "リクエストが多すぎます。少し待って再試行してください。";
  if (code.startsWith("SERVER_MISCONFIGURED"))
    return "サーバーに OPENAI_API_KEY が未設定です（Vercel の環境変数追加と再デプロイを確認）。";
  if (code.startsWith("UPSTREAM"))
    return `OpenAI が発行リクエストを拒否しました（${code}）。APIキー・課金・モデル権限を確認してください。`;
  if (code.startsWith("SDP_EXCHANGE_FAILED") || code.startsWith("CONNECTION_LOST"))
    return `接続に失敗しました（${code}）。`;
  if (code.startsWith("START_FAILED"))
    return "マイクの取得または接続開始に失敗しました。マイク権限を確認してください。";
  return `エラーが発生しました（コード: ${code}）。再試行してください。`;
}
