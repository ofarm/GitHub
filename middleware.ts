import { auth } from "@/auth";
import { NextResponse } from "next/server";

// 認証ガード: /translate と /api/realtime/* は認証必須。
// 未認証は API なら 401(JSON)、ページならトップ(ログイン導線)へリダイレクト。
// 注意: allowlist の最終照合は各 API route 側でも実施（多層防御）。
export default auth((req) => {
  const isLoggedIn = !!req.auth;
  if (isLoggedIn) return NextResponse.next();

  const isApi = req.nextUrl.pathname.startsWith("/api/realtime");
  if (isApi) {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }
  const url = new URL("/", req.nextUrl.origin);
  return NextResponse.redirect(url);
});

export const config = {
  matcher: ["/translate/:path*", "/api/realtime/:path*"],
};
