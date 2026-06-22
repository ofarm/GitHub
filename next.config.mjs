/** @type {import('next').NextConfig} */

// CSP の connect-src に許可する OpenAI ホスト。
// ⚠️ verify: Realtime/WebRTC の実接続先ホストは最新公式ドキュメントで確認し最小化すること。
const OPENAI_CONNECT = "https://api.openai.com https://*.openai.com wss://*.openai.com";

const csp = [
  "default-src 'self'",
  // ⚠️ MVP: Next のインライン bootstrap のため script に 'unsafe-inline' を許可。
  //    本番強化時は nonce ベースに置き換える（docs/security.md 参照）。
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self' ${OPENAI_CONNECT}`,
  "media-src 'self' blob:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
];

const nextConfig = {
  // MVP: lint は typecheck(tsc) と vitest で担保し、build をブロックしない。
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
