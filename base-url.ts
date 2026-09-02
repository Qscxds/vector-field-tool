/**
 * Public origin of this deployment, when it is known at build / start time.
 *
 * - BASE_URL (optional, not a secret): set it when developing behind a tunnel,
 *   e.g. https://xxxx.trycloudflare.com. Restart `next dev` when the tunnel URL changes.
 * - Vercel: derived from system env vars (production domain, else the branch / deployment URL).
 * - Otherwise undefined: plain localhost development. The MCP route then derives the origin
 *   from request headers.
 *
 * Why it must be known up front: Next's asset loader (the Turbopack runtime) identifies chunks by
 * stripping a build-time prefix from each script URL. When an MCP host renders the widget on its
 * own origin, asset URLs must be absolute AND that prefix must equal our origin. Only
 * `assetPrefix` in next.config.ts can arrange both, and it is fixed at build time.
 */
function fromEnv(): string | undefined {
  const explicit = process.env.BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  const preview = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  return preview ? `https://${preview}` : undefined;
}

export const configuredBaseUrl: string | undefined = fromEnv();
