import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "vector-field-tool",
  description:
    "Vector field teaching tool for ODE courses. MCP server for Claude plus a web page, sharing one pure computation core.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // suppressHydrationWarning: MCP hosts may add attributes to <html> inside the widget iframe.
  return (
    <html lang="en" suppressHydrationWarning>
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
