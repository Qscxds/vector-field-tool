/**
 * MCP endpoint: /mcp — Streamable HTTP, stateless, no auth.
 *
 * Only POST carries JSON-RPC. Each POST gets its own McpServer + transport and is forgotten
 * afterwards. GET (standalone SSE stream) and DELETE (session termination) are answered with
 * 405 as the spec allows for servers without sessions; letting the SDK open a keep-alive SSE
 * stream on GET would pin a serverless function open for nothing.
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "./server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public origin of this deployment, used to self-fetch the widget page and to declare the
 * widget's CSP domains. Derived from proxy headers so the same code works on localhost,
 * behind a cloudflared tunnel, and on Vercel. BASE_URL (optional, not a secret) overrides it.
 */
function resolveBaseUrl(req: Request): string {
  const override = process.env.BASE_URL?.trim();
  if (override) return override.replace(/\/+$/, "");

  const first = (value: string | null) => value?.split(",")[0]?.trim() || undefined;
  const host =
    first(req.headers.get("x-forwarded-host")) ??
    first(req.headers.get("host")) ??
    new URL(req.url).host;
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
  const proto = first(req.headers.get("x-forwarded-proto")) ?? (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}

export async function POST(req: Request): Promise<Response> {
  const server = createMcpServer(resolveBaseUrl(req));
  // No sessionIdGenerator => stateless mode.
  const transport = new WebStandardStreamableHTTPServerTransport();
  await server.connect(transport);
  return transport.handleRequest(req);
}

function methodNotAllowed(): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message:
          "Method not allowed. This MCP server is stateless: send JSON-RPC via POST. It offers no standalone SSE stream and no sessions.",
      },
      id: null,
    }),
    { status: 405, headers: { "content-type": "application/json", allow: "POST" } },
  );
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
