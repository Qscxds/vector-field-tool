/**
 * Public origin of this deployment, when it is known at build / start time.
 *
 * Priority (highest first):
 * 1. BASE_URL (explicit, not a secret). REQUIRED whenever the site is served from a custom domain:
 *    set it to https://<your domain> and redeploy. Also used for tunnel development
 *    (https://xxxx.trycloudflare.com; restart `next dev` when the tunnel URL changes).
 * 2. Vercel production: https://<VERCEL_PROJECT_PRODUCTION_URL> (the *.vercel.app domain).
 *    Wrong as soon as a custom domain is attached, hence the warning below.
 * 3. Vercel preview: https://<VERCEL_BRANCH_URL or VERCEL_URL>.
 * 4. Otherwise undefined: plain localhost development. The MCP route then derives the origin
 *    from request headers.
 *
 * Why it must be known up front: Next's asset loader (the Turbopack runtime) identifies chunks by
 * stripping a build-time prefix from each script URL. When an MCP host renders the widget on its
 * own origin, asset URLs must be absolute AND that prefix must equal our origin. Only
 * `assetPrefix` in next.config.ts can arrange both, and it is fixed at build time. The same origin
 * goes into the widget's <base href> and its CSP domains: if it differs from the origin students
 * actually load, the host's CSP blocks the assets and the widget is silently blank.
 */
export type BaseUrlEnv = Partial<
  Record<"BASE_URL" | "VERCEL_ENV" | "VERCEL_PROJECT_PRODUCTION_URL" | "VERCEL_BRANCH_URL" | "VERCEL_URL", string>
>;

export type BaseUrlResolution = {
  url?: string;
  source: "BASE_URL" | "vercel_production" | "vercel_preview" | "none";
  /** Something the operator should read in the logs. */
  warning?: string;
};

function normalize(raw: string): { url: string; warning?: string } {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return { url: trimmed };
  return { url: `https://${trimmed}`, warning: `BASE_URL "${raw}" has no scheme; assuming https://${trimmed}.` };
}

/** Pure resolution from an environment map; `configuredBaseUrl` below applies it to process.env. */
export function resolveConfiguredBaseUrl(env: BaseUrlEnv): BaseUrlResolution {
  const explicit = env.BASE_URL?.trim();
  if (explicit) {
    const { url, warning } = normalize(explicit);
    return { url, source: "BASE_URL", warning };
  }
  if (env.VERCEL_ENV === "production" && env.VERCEL_PROJECT_PRODUCTION_URL) {
    const url = `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
    return {
      url,
      source: "vercel_production",
      warning:
        `BASE_URL is not set on this Vercel production deployment; using ${url} from VERCEL_PROJECT_PRODUCTION_URL. ` +
        "If the site is served from a custom domain, assetPrefix, the widget's <base href> and its CSP all point at the " +
        "wrong origin and the widget renders blank inside Claude. Set BASE_URL=https://<custom domain> in the Vercel " +
        "project settings and redeploy.",
    };
  }
  const preview = env.VERCEL_BRANCH_URL || env.VERCEL_URL;
  if (preview) return { url: `https://${preview}`, source: "vercel_preview" };
  return { source: "none" };
}

const resolution = resolveConfiguredBaseUrl(process.env as BaseUrlEnv);
// Printed once per process (build and server start), so the pitfall above is visible in the logs.
if (resolution.warning) console.warn(`[base-url] ${resolution.warning}`);

export const configuredBaseUrl: string | undefined = resolution.url;
