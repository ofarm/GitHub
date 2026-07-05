"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RealtimeSession, type DeltaKind, type RealtimeState } from "@/lib/realtimeClient";
import { Controls } from "@/components/Controls";
import { Subtitles } from "@/components/Subtitles";

// Screen Wake Lock API の型定義（ブラウザ non-support で undefined）。
type WakeLockSentinel = { release: () => Promise<void> } & EventTarget;

// 翻訳のクライアントUI。
// 非交渉制約:
//  - 字幕(本文)はメモリ state のみ。storage / console / log に出さない。
//  - Stop / unload で接続とマイクを確実に解放。

const MAX_LINES = 50; // 表示行の上限（メモリのみ・保存しない）。
const MIC_ACTIVE = 5; // この値を超えたら「音声を検出」とみなす。
const SILENCE_STOP_MINUTES = 10; // この分数連続で無音なら自動停止（コスト保護）。
const SILENCE_STOP_MS = SILENCE_STOP_MINUTES * 60 * 1000;
const COST_PER_MINUTE = 0.051; // OpenAI Realtime translate + whisper（$0.034 + $0.017）。

const stateLabel: Record<RealtimeState, string> = {
  idle: "停止中",
  requesting: "準備中…",
  connecting: "接続中…",
  live: "接続中（話してください）",
  stopping: "停止処理中…",
  error: "エラー",
};

export default function TranslateClient() {
  const [state, setState] = useState<RealtimeState>("idle");
  // 英語原文(en)と日本語訳(ja)を併記表示するため2系統で保持。
  const [jaLines, setJaLines] = useState<string[]>([]);
  const [enLines, setEnLines] = useState<string[]>([]);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  // マイク入力レベル（0〜128程度）。本UIに常時表示し、無音を即検知できるようにする。
  const [micLevel, setMicLevel] = useState(0);
  const [micPeak, setMicPeak] = useState(0); // Start 以降の最大値（無音判定用）。
  // 字幕メイン。翻訳音声はデフォルト無音。必要な場合のみ再生する。
  const [playAudio, setPlayAudio] = useState(false);
  // 診断: ?debug=1 のときだけ受信イベント種別/キーを表示（値=本文は持たない）。
  const [debug, setDebug] = useState(false);
  const [eventTypes, setEventTypes] = useState<Record<string, string>>({});
  const sessionRef = useRef<RealtimeSession | null>(null);
  const curJaRef = useRef<string>("");
  const curEnRef = useRef<string>("");
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const silenceStartRef = useRef<number | null>(null); // 無音開始時刻（ミリ秒）。
  const silenceTimerRef = useRef<number | null>(null); // 無音タイマーID。
  const [elapsedSeconds, setElapsedSeconds] = useState(0); // live 中の経過時間（秒）。
  const liveStartRef = useRef<number | null>(null); // live 遷移時刻（ミリ秒）。
  const elapsedTimerRef = useRef<number | null>(null); // 経過時間更新用タイマーID。

  useEffect(() => {
    setDebug(new URLSearchParams(window.location.search).has("debug"));
  }, []);

  // 翻訳音声のミュート制御（既定は無音）。
  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = !playAudio;
  }, [playAudio]);

  // Screen Wake Lock: live 中は画面がスリープしないようにする。非対応ブラウザでは無害。
  useEffect(() => {
    const acquireWakeLock = async () => {
      try {
        if ("wakeLock" in navigator && !wakeLockRef.current) {
          const lock = await navigator.wakeLock.request("screen");
          wakeLockRef.current = lock;
          lock.addEventListener("release", () => {
            wakeLockRef.current = null;
          });
        }
      } catch {
        // Non-support or permission denied - fail silently
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
        } catch {
          // noop
        }
        wakeLockRef.current = null;
      }
    };

    if (state === "live") {
      acquireWakeLock();
    } else if (state === "stopping" || state === "error") {
      releaseWakeLock();
    }
  }, [state]);

  const appendDelta = useCallback((kind: DeltaKind, text: string) => {
    // 増分を該当系統の現在行に連結。改行で行を確定。本文はログしない。
    const setter = kind === "translation" ? setJaLines : setEnLines;
    const curRef = kind === "translation" ? curJaRef : curEnRef;
    curRef.current += text;
    setter((prev) => {
      const next = [...prev];
      if (next.length === 0) next.push("");
      next[next.length - 1] = curRef.current;
      return next.slice(-MAX_LINES);
    });
    if (text.includes("\n")) {
      curRef.current = "";
      setter((prev) => [...prev, ""].slice(-MAX_LINES));
    }
  }, []);

  const start = useCallback(async () => {
    setErrorCode(null);
    setMicLevel(0);
    setMicPeak(0);
    setEventTypes({});
    curJaRef.current = "";
    curEnRef.current = "";
    setJaLines([]);
    setEnLines([]);
    // 無音タイマーをリセット。
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    silenceStartRef.current = null;
    // 経過時間をリセット。
    setElapsedSeconds(0);
    liveStartRef.current = null;
    if (elapsedTimerRef.current !== null) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    const session = new RealtimeSession({
      onDelta: appendDelta,
      onStateChange: setState,
      onError: setErrorCode,
      onEvent: (info) =>
        setEventTypes((prev) => ({ ...prev, [info.type]: info.keys.join(", ") })),
      onDiag: (label, value) => {
        if (label === "micLevel") {
          const lvl = Number(value) || 0;
          setMicLevel(lvl);
          setMicPeak((p) => Math.max(p, lvl));
        }
        setEventTypes((prev) => ({ ...prev, [`#${label}`]: value }));
      },
      onRemoteStream: (stream) => {
        if (audioRef.current) {
          audioRef.current.srcObject = stream;
          audioRef.current
            .play()
            .then(() => setEventTypes((prev) => ({ ...prev, "#audioPlay": "ok" })))
            .catch(() => setEventTypes((prev) => ({ ...prev, "#audioPlay": "blocked" })));
        }
      },
    });
    sessionRef.current = session;
    await session.start();
  }, [appendDelta]);

  const stop = useCallback(() => {
    // 無音タイマーをクリア。
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    silenceStartRef.current = null;
    // 経過時間タイマーをクリア。
    if (elapsedTimerRef.current !== null) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    sessionRef.current?.stop();
    sessionRef.current = null;
  }, []);

  const clear = useCallback(() => {
    curJaRef.current = "";
    curEnRef.current = "";
    setJaLines([]);
    setEnLines([]);
  }, []);

  // タブ表示時に Wake Lock を再取得する（Wake Lock は非表示タブで自動解放される仕様）。
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && state === "live") {
        // 既に取得済みなら何もしない。
        if (wakeLockRef.current) return;
        navigator.wakeLock
          ?.request("screen")
          .then((lock) => {
            wakeLockRef.current = lock;
            lock.addEventListener("release", () => {
              wakeLockRef.current = null;
            });
          })
          .catch(() => {
            // Non-support or other error - fail silently
          });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [state]);

  // 無音自動停止: 10分連続で無音なら自動停止（コスト保護）。
  useEffect(() => {
    if (state !== "live") {
      // live 以外では無音タイマーをクリア。
      if (silenceTimerRef.current !== null) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      silenceStartRef.current = null;
      return;
    }

    // live 中: micLevel で無音判定。
    if (micLevel > MIC_ACTIVE) {
      // 音声あり → 無音タイマーをリセット。
      if (silenceTimerRef.current !== null) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      silenceStartRef.current = null;
    } else {
      // 無音中。
      if (silenceStartRef.current === null) {
        silenceStartRef.current = Date.now();
        // SILENCE_STOP_MS 後に自動停止。
        silenceTimerRef.current = window.setTimeout(() => {
          // 再度確認: 今もまだ無音か？（ノイズで誤発火防止）
          if (micLevel <= MIC_ACTIVE) {
            setErrorCode("SILENCE_STOP");
            stop();
          }
          silenceTimerRef.current = null;
          silenceStartRef.current = null;
        }, SILENCE_STOP_MS);
      }
    }

    return () => {
      if (silenceTimerRef.current !== null) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    };
  }, [state, micLevel, stop]);

  // 経過時間カウント: live 中に mm:ss を更新。Stop で計測を停止（リセットは次回 Start）。
  useEffect(() => {
    if (state === "live") {
      if (liveStartRef.current === null) {
        liveStartRef.current = Date.now();
      }
      // 100ms ごとに経過時間を更新。
      elapsedTimerRef.current = window.setInterval(() => {
        if (liveStartRef.current !== null) {
          const elapsed = Math.floor((Date.now() - liveStartRef.current) / 1000);
          setElapsedSeconds(elapsed);
        }
      }, 100);
    } else {
      // live 以外では計測を止める。
      if (elapsedTimerRef.current !== null) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
    }
    return () => {
      if (elapsedTimerRef.current !== null) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
    };
  }, [state]);

  // ページ離脱時に確実に解放（pagehide のみ）。
  // 注: visibilitychange:hidden は削除。タブ切替時は接続を保持し、pagehide(タブ閉じ)で初めて解放する。
  useEffect(() => {
    const release = async () => {
      // 無音タイマーをクリア。
      if (silenceTimerRef.current !== null) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      // Wake Lock を解放
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
        } catch {
          // noop
        }
        wakeLockRef.current = null;
      }
      // セッションを停止
      sessionRef.current?.stop();
    };
    window.addEventListener("pagehide", release);
    return () => {
      window.removeEventListener("pagehide", release);
      release();
    };
  }, []);

  const isActive = state === "connecting" || state === "live";
  const micSilent = state === "live" && micPeak < MIC_ACTIVE;

  return (
    <>
      <Controls state={state} onStart={start} onStop={stop} onClear={clear} />

      {errorCode && (
        <p style={{ color: "var(--danger)" }} role="alert">
          {errorMessage(errorCode)}
        </p>
      )}

      {/* 接続・マイクの状態を本UIに常時表示（デバッグモード不要で原因が見える）。 */}
      {isActive && (
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            borderRadius: 10,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 13, color: "var(--muted)" }}>{stateLabel[state]}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, minWidth: 84 }}>マイク入力</span>
            <div
              style={{
                flex: 1,
                height: 10,
                background: "rgba(255,255,255,0.08)",
                borderRadius: 6,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, micLevel * 1.6)}%`,
                  height: "100%",
                  background: micLevel > MIC_ACTIVE ? "#39d98a" : "var(--muted)",
                  transition: "width 120ms linear",
                }}
              />
            </div>
          </div>
          {micSilent && (
            <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>
              🎤 マイク音声が送信されていません（送信レベル0）。OS のマイクが正常でもこの状態なら、
              <b>Chrome が別のマイクを使っている</b>可能性が高いです。アドレスバー右の🎤アイコン、または
              <code> chrome://settings/content/microphone </code>
              で「マイク」が正しいデバイスになっているか確認し、Start し直してください。
            </p>
          )}
          {state === "live" && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted)" }}>
              <span>経過時間: {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, "0")}</span>
              <span>概算コスト: ${(elapsedSeconds / 60 * COST_PER_MINUTE).toFixed(3)}</span>
            </div>
          )}
        </div>
      )}

      {/* 翻訳音声は既定で無音（字幕メイン）。トグルで任意に再生可能。 */}
      <audio ref={audioRef} autoPlay playsInline muted style={{ display: "none" }} />

      <Subtitles jaLines={jaLines} enLines={enLines} />

      <label
        style={{
          fontSize: 13,
          color: "var(--muted)",
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        <input
          type="checkbox"
          checked={playAudio}
          onChange={(e) => setPlayAudio(e.target.checked)}
        />
        翻訳音声も再生する（任意・既定はオフ）
      </label>

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
  if (code.startsWith("SILENCE_STOP"))
    return `無音が${SILENCE_STOP_MINUTES}分続いたため、自動停止しました（コスト保護）。`;
  return `エラーが発生しました（コード: ${code}）。再試行してください。`;
}
