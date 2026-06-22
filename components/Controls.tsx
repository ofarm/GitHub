"use client";

import type { RealtimeState } from "@/lib/realtimeClient";

type Props = {
  state: RealtimeState;
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
};

const labelByState: Record<RealtimeState, string> = {
  idle: "停止中",
  requesting: "準備中…",
  connecting: "接続中…",
  live: "翻訳中",
  stopping: "停止処理中…",
  error: "エラー",
};

export function Controls({ state, onStart, onStop, onClear }: Props) {
  const isActive = state === "requesting" || state === "connecting" || state === "live";

  return (
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
  );
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
