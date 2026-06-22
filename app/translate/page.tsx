import { auth, signOut } from "@/auth";
import { isAllowedEmail } from "@/lib/allowlist";
import { redirect } from "next/navigation";
import TranslateClient from "./TranslateClient";

// 翻訳画面。サーバー側で認証 + allowlist を最終確認してからクライアントUIを描画。
export default async function TranslatePage() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/");
  if (!isAllowedEmail(email)) redirect("/"); // 多層防御

  return (
    <main>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Realtime Translator</h1>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            style={{
              background: "transparent",
              color: "var(--muted)",
              border: "1px solid var(--muted)",
              borderRadius: 8,
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            ログアウト
          </button>
        </form>
      </header>
      <TranslateClient />
    </main>
  );
}
