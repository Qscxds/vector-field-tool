import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "vector-field-tool",
  description:
    "Vector field teaching tool for ODE courses. MCP server for Claude plus a web page, sharing one pure computation core.",
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
