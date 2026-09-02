"use client";

/**
 * Widget shell: the page Claude renders inside a sandboxed iframe after calling a tool.
 * It receives tool input/result from the host via the MCP Apps protocol and shows them.
 * No math here, no knowledge of who the host is.
 */
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import { useState } from "react";

export default function WidgetPage() {
  const [toolInput, setToolInput] = useState<unknown>(null);
  const [toolResult, setToolResult] = useState<unknown>(null);

  const { isConnected, error } = useApp({
    appInfo: { name: "vector-field-tool-widget", version: "0.1.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.ontoolinput = (params) => setToolInput(params.arguments ?? null);
      app.ontoolresult = (result) =>
        setToolResult(result.structuredContent ?? result.content ?? null);
    },
  });

  const data = toolResult ?? toolInput;

  return (
    <main style={{ padding: 16, fontSize: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span
          aria-hidden
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: isConnected ? "#22a06b" : "#c9ced6",
            display: "inline-block",
          }}
        />
        <strong>vector-field-tool</strong>
        <span style={{ color: "#52606d" }}>
          {isConnected ? "connected to host" : "not connected to an MCP host"}
        </span>
      </div>

      {error ? (
        <p style={{ color: "#b42318" }}>Error: {error.message}</p>
      ) : null}

      {isConnected ? (
        <pre
          style={{
            margin: 0,
            padding: 12,
            background: "#f5f7fa",
            border: "1px solid #e4e7eb",
            borderRadius: 6,
            overflowX: "auto",
          }}
        >
          {data == null ? "Waiting for a tool call..." : JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <p style={{ color: "#52606d", margin: 0 }}>
          This page is meant to be rendered by Claude after calling the <code>ping</code> tool.
        </p>
      )}
    </main>
  );
}
