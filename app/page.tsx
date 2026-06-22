import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";

// トップ（ログイン導線）。認証済みなら /translate へ。
export default async function Home() {
  const session = await auth();
  if (session?.user) {
    redirect("/translate");
  }

  return (
    <main>
      <h1>Realtime Translator</h1>
      <p style={{ color: "var(--muted)" }}>
        自分専用のリアルタイム英→日 音声翻訳。利用には許可されたアカウントでのログインが必要です。
      </p>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/translate" });
        }}
      >
        <button
          type="submit"
          style={{
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            padding: "12px 20px",
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          Google でログイン
        </button>
      </form>
    </main>
  );
}
