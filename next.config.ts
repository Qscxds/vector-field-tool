import type { NextConfig } from "next";
import { configuredBaseUrl } from "./base-url";

const nextConfig: NextConfig = {
  // Absolute asset URLs + matching Turbopack chunk base path, so the widget hydrates when an MCP
  // host renders it on its own sandbox origin. Undefined on plain localhost (see base-url.ts).
  assetPrefix: configuredBaseUrl,
  // Claude renders MCP App widgets inside a sandboxed iframe on <hash>.claudemcpcontent.com.
  // Since Next 16.3 the dev server returns 403 for cross-origin /_next/* asset requests unless
  // the page origin is allowlisted. Production (`next start` / Vercel) is not affected.
  allowedDevOrigins: ["**.claudemcpcontent.com", "**.trycloudflare.com"],
  // Keep the dev-mode indicator badge out of the widget iframe.
  devIndicators: false,
  // /embed ONLY: a public teaching tool without login that any site (Google Sites included) may
  // frame. Never add a frame-related header (X-Frame-Options, frame-ancestors) to any other route:
  // /widget is rendered inside the MCP host's sandbox and such a header would blank it.
  async headers() {
    return [
      {
        source: "/embed",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
    ];
  },
};

export default nextConfig;
