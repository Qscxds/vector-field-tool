#!/usr/bin/env node
/**
 * Minimal two-origin MCP Apps host for exercising the widget WITHOUT Claude.
 *
 * Usage: node scripts/mock-host/serve.mjs [--mcp http://localhost:3510/mcp] [--host-port 3520] [--sandbox-port 3521]
 *
 * Two static pages on two different origins, the way a real host lays them out:
 *   http://localhost:<host-port>/         host.html: speaks JSON-RPC to the MCP server (initialize,
 *                                         resources/read of the widget, tools/call) and the MCP Apps
 *                                         protocol over postMessage to the sandbox (answers
 *                                         ui/initialize, pushes ui/notifications/tool-input and
 *                                         ui/notifications/tool-result, receives size-changed).
 *   http://localhost:<sandbox-port>/sandbox.html
 *                                         the sandbox proxy: receives the widget HTML + csp from the
 *                                         host, writes it into a nested sandboxed iframe (srcdoc,
 *                                         opaque origin) under a <meta> CSP built from the resource's
 *                                         _meta.ui.csp, and relays every message between that iframe
 *                                         and the host.
 * The host page reaches the MCP server through POST /mcp on its own origin (this file forwards the
 * request), so no CORS is needed on the MCP endpoint, as in a real host.
 *
 * The production build must know its public origin (BASE_URL=http://localhost:<port> npm run build)
 * or the widget's asset URLs are relative to the sandbox origin and the page is blank; that is the
 * same rule as for any MCP host (see base-url.ts).
 */
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const MCP_URL = opt("--mcp", "http://localhost:3510/mcp");
const HOST_PORT = Number(opt("--host-port", "3520"));
const SANDBOX_PORT = Number(opt("--sandbox-port", "3521"));
const SANDBOX_ORIGIN = `http://localhost:${SANDBOX_PORT}`;

function send(res, status, type, body) {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

async function page(name, replacements = {}) {
  let html = await readFile(path.join(dir, name), "utf8");
  for (const [k, v] of Object.entries(replacements)) html = html.split(k).join(v);
  return html;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const hostServer = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${HOST_PORT}`);
  try {
    if (req.method === "POST" && url.pathname === "/mcp") {
      // Forward to the MCP server verbatim (same headers the SDK client would send).
      const body = await readBody(req);
      const upstream = await fetch(MCP_URL, {
        method: "POST",
        headers: {
          "content-type": req.headers["content-type"] ?? "application/json",
          accept: "application/json, text/event-stream",
        },
        body,
      });
      const text = await upstream.text();
      send(res, upstream.status, upstream.headers.get("content-type") ?? "application/json", text);
      return;
    }
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/host.html")) {
      send(res, 200, "text/html; charset=utf-8", await page("host.html", { __SANDBOX_ORIGIN__: SANDBOX_ORIGIN, __MCP_URL__: MCP_URL }));
      return;
    }
    send(res, 404, "text/plain", "not found");
  } catch (error) {
    send(res, 502, "text/plain", `mock host error: ${error instanceof Error ? error.message : String(error)}`);
  }
});

/**
 * Widget documents hosted on the sandbox origin, like a real host's dedicated sandbox domain: the
 * proxy page POSTs { html, csp } and loads the returned URL in its nested iframe, so the widget
 * has a real http URL (Next's runtime resolves its chunks against it; about:srcdoc does not work)
 * and the CSP arrives as a response header, as in a real host.
 */
const apps = new Map();
let appSeq = 0;

const sandboxServer = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", SANDBOX_ORIGIN);
  try {
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/sandbox.html")) {
      send(res, 200, "text/html; charset=utf-8", await page("sandbox.html"));
      return;
    }
    if (req.method === "POST" && url.pathname === "/app") {
      const { html, csp } = JSON.parse((await readBody(req)).toString("utf8"));
      const id = String(++appSeq);
      apps.set(id, { html: String(html), csp: String(csp) });
      send(res, 200, "application/json", JSON.stringify({ url: `/app/${id}` }));
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/app/")) {
      const entry = apps.get(url.pathname.slice("/app/".length));
      if (!entry) {
        send(res, 404, "text/plain", "no such app document");
        return;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-security-policy": entry.csp, "cache-control": "no-store" });
      res.end(entry.html);
      return;
    }
    send(res, 404, "text/plain", "not found");
  } catch (error) {
    send(res, 500, "text/plain", `mock sandbox error: ${error instanceof Error ? error.message : String(error)}`);
  }
});

hostServer.listen(HOST_PORT, () => console.log(`mock host     http://localhost:${HOST_PORT}/  (MCP: ${MCP_URL})`));
sandboxServer.listen(SANDBOX_PORT, () => console.log(`mock sandbox  ${SANDBOX_ORIGIN}/sandbox.html`));
