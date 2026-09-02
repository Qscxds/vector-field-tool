/**
 * MCP endpoint: /mcp — Streamable HTTP, stateless, no auth.
 *
 * Only POST carries JSON-RPC. Each POST gets its own McpServer + transport and is forgotten
 * afterwards. GET (standalone SSE stream) and DELETE (session termination) are answered with
 * 405 as the spec allows for servers without sessions; letting the SDK open a keep-alive SSE
 * stream on GET would pin a serverless function open for nothing.
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@modelcontextprotocol/sdk/types.js";
import { configuredBaseUrl } from "@/base-url";
import { createMcpServer } from "./server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public origin of this deployment, used to self-fetch the widget page and to declare the
 * widget's CSP domains. Prefers the build-time value (BASE_URL / Vercel, see base-url.ts) so it
 * matches `assetPrefix`; on plain localhost it is derived from the request headers.
 */
function resolveBaseUrl(req: Request): string {
  if (configuredBaseUrl) return configuredBaseUrl;

  const first = (value: string | null) => value?.split(",")[0]?.trim() || undefined;
  const host =
    first(req.headers.get("x-forwarded-host")) ??
    first(req.headers.get("host")) ??
    new URL(req.url).host;
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
  const proto = first(req.headers.get("x-forwarded-proto")) ?? (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}

const SUPPORTED_VERSIONS = new Set<string>(SUPPORTED_PROTOCOL_VERSIONS);

/**
 * Claude sends `mcp-protocol-version: 2026-07-28` on some requests. sdk 1.x only knows the
 * 2024/2025 versions and would answer 400. The JSON-RPC body is the same shape and this server
 * keeps no per-session state, so we downgrade the header instead of rejecting the request.
 */
async function normalizeProtocolVersion(req: Request): Promise<Request> {
  const version = req.headers.get("mcp-protocol-version");
  if (!version || SUPPORTED_VERSIONS.has(version)) return req;
  const headers = new Headers(req.headers);
  headers.set("mcp-protocol-version", LATEST_PROTOCOL_VERSION);
  return new Request(req.url, { method: req.method, headers, body: await req.text() });
}

/** One line per POST so hosts' behaviour is visible in dev and in deployment logs. */
async function logRequest(req: Request, body: string): Promise<void> {
  let summary = "?";
  try {
    const parsed = JSON.parse(body) as
      | { method?: string; params?: Record<string, unknown> }
      | { method?: string; params?: Record<string, unknown> }[];
    const describe = (m: { method?: string; params?: Record<string, unknown> }) => {
      const p = m.params ?? {};
      const detail =
        m.method === "resources/read"
          ? ` ${String(p.uri)}`
          : m.method === "tools/call"
            ? ` ${String(p.name)}`
            : m.method === "initialize"
              ? ` ${JSON.stringify((p.clientInfo as { name?: string } | undefined)?.name)} proto=${String(p.protocolVersion)}`
              : "";
      return `${m.method ?? "?"}${detail}`;
    };
    summary = Array.isArray(parsed) ? parsed.map(describe).join(",") : describe(parsed);
  } catch {
    summary = "(unparseable)";
  }
  console.log(
    `[mcp] ${summary} version=${req.headers.get("mcp-protocol-version") ?? "-"} ua=${req.headers.get("user-agent") ?? "-"}`,
  );
}

export async function POST(incoming: Request): Promise<Response> {
  const body = await incoming.clone().text();
  await logRequest(incoming, body);
  const req = await normalizeProtocolVersion(incoming);
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
