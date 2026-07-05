import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// ブラウザタブのファビコン。Next.js の特殊ファイル規約により自動で <link> に配線される。
export default function Icon() {
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
          fontSize: 22,
          fontWeight: 700,
        }}
      >
        訳
      </div>
    ),
    { ...size },
  );
}
