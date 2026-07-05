import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS ホーム画面追加時のアイコン。Next.js の特殊ファイル規約により自動配線される。
export default function AppleIcon() {
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
          fontSize: 100,
          fontWeight: 700,
        }}
      >
        訳
      </div>
    ),
    { ...size },
  );
}
