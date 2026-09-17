import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

/**
 * Defensive headers for the public deployment. Next.js needs inline scripts (hydration data, the
 * theme bootstrap) and Tailwind inline styles, so script/style allow 'unsafe-inline'; the value of
 * the policy is in frame-ancestors, form-action, base-uri and object-src. Dev adds 'unsafe-eval'
 * for React Refresh.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Lets a second instance (tests, another port) build into its own folder.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Stop `next dev` from appending its own block to CLAUDE.md.
  agentRules: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
