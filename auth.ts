import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAllowedEmail } from "@/lib/allowlist";

// Auth.js (NextAuth v5) 設定。
// - Google OAuth（AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET を自動参照）。
// - allowlist 外のメールはサインインを拒否（セッションを発行しない）。
// - MVP は DB なし → JWT セッション（既定）。
// 注意: メール平文・トークンをログに出さない。

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  pages: { signIn: "/" },
  callbacks: {
    // 第一の認可ゲート: 許可外メールはサインインさせない。
    async signIn({ user }) {
      return isAllowedEmail(user.email);
    },
  },
});
