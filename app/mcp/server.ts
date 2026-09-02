/**
 * MCP shell: builds a fresh, stateless McpServer for one incoming request.
 *
 * Route D (decided 2026-09-02): no mcp-handler. We use @modelcontextprotocol/sdk 1.x directly
 * because @modelcontextprotocol/ext-apps (the widget SDK, not replaceable) still targets sdk 1.x.
 * Revisit once ext-apps ships SDK v2 support (modelcontextprotocol/ext-apps#702).
 *
 * All math lives in lib/core and is called from here as plain functions. Nothing in this file
 * computes anything; it only translates MCP calls into core calls and core results into MCP results.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { echo } from "@/lib/core/hello";

export const SERVER_INFO = { name: "vector-field-tool", version: "0.1.0" };

/** Bump when the widget HTML changes so MCP hosts drop cached copies. */
const WIDGET_VERSION = "p0-5";
export const WIDGET_URI = `ui://vector-field-tool/ping.html?v=${WIDGET_VERSION}`;
/** Next.js page that becomes the widget HTML (app/widget/page.tsx). */
const WIDGET_PATH = "/widget";

/**
 * Fetches the rendered widget page from this deployment and rewrites it so it works inside a
 * host sandbox iframe (see rewriteForSandbox).
 */
export async function fetchWidgetHtml(baseUrl: string): Promise<string> {
  const target = `${baseUrl}${WIDGET_PATH}`;
  let res: Response;
  try {
    res = await fetch(target, { cache: "no-store", headers: { accept: "text/html" } });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `widget fetch failed for ${target}: ${reason}. Is this origin reachable from the server? (BASE_URL can override it)`,
    );
  }
  if (!res.ok) {
    throw new Error(`widget fetch failed for ${target}: HTTP ${res.status} ${res.statusText}`);
  }
  return rewriteForSandbox(await res.text(), baseUrl);
}

/**
 * The host renders our HTML on its own sandbox origin, so relative URLs would point at the host.
 * We pin <base href> to our public origin; hosts honour it only when the resource declares
 * csp.baseUriDomains (the MCP Apps default CSP is base-uri 'self'), which createMcpServer does.
 *
 * Asset URLs are deliberately NOT rewritten here. Next's Turbopack runtime identifies chunks by
 * stripping its build-time base path from each script URL; rewriting URLs at request time (or
 * letting <base> resolve them cross-origin) breaks that match and hydration silently never runs.
 * Absolute asset URLs must come from assetPrefix (see base-url.ts).
 */
export function rewriteForSandbox(html: string, baseUrl: string): string {
  if (/<base\s/i.test(html)) return html;
  return html.replace(/<head([^>]*)>/i, `<head$1><base href="${baseUrl}/">`);
}

/** One McpServer per request: no sessions, no shared state. */
export function createMcpServer(baseUrl: string): McpServer {
  const server = new McpServer(SERVER_INFO);

  registerAppResource(
    server,
    "ping-widget",
    WIDGET_URI,
    { title: "Ping widget", mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [
        {
          uri: WIDGET_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: await fetchWidgetHtml(baseUrl),
          _meta: {
            ui: {
              csp: {
                connectDomains: [baseUrl],
                resourceDomains: [baseUrl],
                // Required for the <base href> we inject: hosts default to `base-uri 'self'`.
                baseUriDomains: [baseUrl],
              },
            },
          },
        },
      ],
    }),
  );

  registerAppTool(
    server,
    "ping",
    {
      title: "Ping",
      description:
        "Connectivity check for the vector-field-tool server. Returns `message` unchanged and shows it in the widget. Does no math.",
      inputSchema: {
        message: z.string().describe("Any text. It is returned unchanged."),
      },
      outputSchema: {
        message: z.string().describe("The same text that was sent."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: { ui: { resourceUri: WIDGET_URI } },
    },
    async ({ message }) => {
      const result = echo(message);
      return {
        content: [{ type: "text", text: result }],
        structuredContent: { message: result },
      };
    },
  );

  return server;
}
