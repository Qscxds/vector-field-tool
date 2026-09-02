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
};

export default nextConfig;
