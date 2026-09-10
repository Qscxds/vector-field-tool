import type { Metadata } from "next";
import type { ReactNode } from "react";
import { configuredBaseUrl } from "@/base-url";
import { bilingual, SITE_NAME_BILINGUAL } from "@/lib/site-text";

// Site-wide metadata (per-page titles and descriptions live on each page). The OG image is
// app/opengraph-image.tsx, resolved against metadataBase; the favicon is app/icon.svg.
export const metadata: Metadata = {
  metadataBase: new URL(configuredBaseUrl ?? "http://localhost:3000"),
  title: { template: `%s · ${SITE_NAME_BILINGUAL}`, default: SITE_NAME_BILINGUAL },
  description: bilingual("homeDescription"),
  applicationName: SITE_NAME_BILINGUAL,
  openGraph: { type: "website", siteName: SITE_NAME_BILINGUAL, locale: "en_US", alternateLocale: ["zh_CN"] },
  twitter: { card: "summary_large_image" },
};

/**
 * Runs before any Next.js chunk, only when this document is embedded (MCP host iframe).
 * Next calls history.replaceState with the route URL after hydration; inside a host iframe that
 * URL resolves to our origin (via <base href>) or to an opaque srcdoc URL, and the browser throws a
 * SecurityError that would unmount the React tree. History is meaningless inside the widget, so the
 * error is swallowed. Top-level pages (the future web shell) are untouched.
 */
const IFRAME_HISTORY_PATCH = `(function(){if(window.self===window.top)return;var h=window.history;["pushState","replaceState"].forEach(function(m){var o=h[m];h[m]=function(){try{return o.apply(this,arguments)}catch(e){if(e&&e.name==="SecurityError")return;throw e}}})})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  // suppressHydrationWarning: MCP hosts may add attributes to <html> inside the widget iframe.
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: IFRAME_HISTORY_PATCH }} />
      </head>
      <body
        style={{
          margin: 0,
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          color: "#1f2933",
          background: "#ffffff",
        }}
      >
        {children}
      </body>
    </html>
  );
}
