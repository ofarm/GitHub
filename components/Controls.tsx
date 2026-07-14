"use client";

import type { AudioSource, RealtimeState } from "@/lib/realtimeClient";

type Props = {
  state: RealtimeState;
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
  // 音源選択（マイク / タブ音声）。getDisplayMedia 非対応環境では表示しない。
  audioSource: AudioSource;
  onAudioSourceChange: (source: AudioSource) => void;
  showAudioSourceSelector: boolean;
};

const labelByState: Record<RealtimeState, string> = {
  idle: "停止中",
  requesting: "準備中…",
  connecting: "接続中…",
  live: "翻訳中",
  reconnecting: "再接続中…",
  stopping: "停止処理中…",
  error: "エラー",
};

export function Controls({
  state,
  onStart,
  onStop,
  onClear,
  audioSource,
  onAudioSourceChange,
  showAudioSourceSelector,
}: Props) {
  const isActive =
    state === "requesting" || state === "connecting" || state === "live" || state === "reconnecting";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {showAudioSourceSelector && (
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "var(--muted)", minWidth: 84 }}>音源</span>
          <button
            type="button"
            onClick={() => onAudioSourceChange("mic")}
            disabled={isActive}
            aria-pressed={audioSource === "mic"}
            style={segBtn(audioSource === "mic", isActive)}
          >
            マイク
          </button>
          <button
            type="button"
            onClick={() => onAudioSourceChange("display")}
            disabled={isActive}
            aria-pressed={audioSource === "display"}
            style={segBtn(audioSource === "display", isActive)}
          >
            タブ音声
          </button>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: "var(--muted)", minWidth: 84 }}>{labelByState[state]}</span>
        <button
          type="button"
          onClick={onStart}
          disabled={isActive}
          style={btn("var(--accent)", isActive)}
        >
          Start
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={!isActive}
          style={btn("var(--danger)", !isActive)}
        >
          Stop
        </button>
        <button type="button" onClick={onClear} style={btn("transparent", false, true)}>
          Clear
        </button>
      </div>
    </div>
  );
}

function segBtn(selected: boolean, disabled: boolean): React.CSSProperties {
  return {
    background: selected ? "var(--accent)" : "transparent",
    color: selected ? "#fff" : "var(--muted)",
    border: "1px solid var(--muted)",
    borderRadius: 8,
    padding: "6px 12px",
    fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}

function btn(bg: string, disabled: boolean, outline = false): React.CSSProperties {
  return {
    background: outline ? "transparent" : bg,
    color: outline ? "var(--muted)" : "#fff",
    border: outline ? "1px solid var(--muted)" : "none",
    borderRadius: 8,
    padding: "10px 18px",
    fontSize: 15,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}
