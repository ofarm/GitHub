import { ImageResponse } from "next/og";

export const runtime = "nodejs";

// PWA マニフェスト用アイコン(192x192)。静的アセット追加ではなく ImageResponse で生成
// （新規依存追加なし）。本文とは無関係の見た目のみのメタアセット。
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0c10",
          color: "#4f8cff",
          fontSize: 96,
          fontWeight: 700,
        }}
      >
        訳
      </div>
    ),
    { width: 192, height: 192 },
  );
}
