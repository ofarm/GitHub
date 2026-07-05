import type { MetadataRoute } from "next";

// PWA マニフェスト。ホーム画面から1タップでスタンドアロン起動できるようにする。
// 本文（音声/transcript/翻訳）には一切関与しない、静的なメタ情報のみ。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Realtime Translator",
    short_name: "翻訳",
    description: "自分専用のリアルタイム英→日 音声翻訳",
    start_url: "/translate",
    display: "standalone",
    background_color: "#0b0c10",
    theme_color: "#0b0c10",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
