#!/usr/bin/env node
/**
 * HTTP smoke test for a running MCP server (default http://localhost:3000/mcp).
 * Usage: node scripts/smoke.mjs [url]
 * Exit code 0 when every check passes. Checks the transport layer end to end: initialize,
 * tools/list, one call per tool, resources/list, resources/read of the widget, GET -> 405.
 */
const url = process.argv[2] ?? "http://localhost:3000/mcp";
let id = 0;
const results = [];

function check(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  -> ${detail}`}`);
}

async function rpc(method, params = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const ctype = res.headers.get("content-type") ?? "";
  const text = await res.text();
  let msg = null;
  if (ctype.includes("text/event-stream")) {
    const datas = text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
    msg = datas.length ? JSON.parse(datas[datas.length - 1]) : null;
  } else if (text.trim()) {
    msg = JSON.parse(text);
  }
  return { status: res.status, msg };
}

const init = await rpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } } },
  clientInfo: { name: "smoke", version: "0" },
});
check("initialize", init.status === 200 && init.msg?.result?.serverInfo?.name === "vector-field-tool", JSON.stringify(init.msg).slice(0, 200));

const list = await rpc("tools/list");
const names = (list.msg?.result?.tools ?? []).map((t) => t.name).sort();
check("tools/list has 5 tools", JSON.stringify(names) === JSON.stringify(["analyze_first_order", "analyze_system", "ping", "sample_field", "trace_trajectory"]), names.join(","));
const ping = (list.msg?.result?.tools ?? []).find((t) => t.name === "ping");
check("ping carries _meta.ui.resourceUri", typeof ping?._meta?.ui?.resourceUri === "string" && ping._meta.ui.resourceUri.startsWith("ui://"), JSON.stringify(ping?._meta));

const calls = [
  ["ping", { message: "hi" }, (r) => r.structuredContent?.message === "hi"],
  ["analyze_system", { f: "x - x*y", g: "x*y - y", xMin: -0.5, xMax: 3, yMin: -0.5, yMax: 3 }, (r) => r.structuredContent?.equilibria?.length === 2 && r.structuredContent.equilibria.some((e) => e.classification === "center_or_weak_spiral" && e.caveat)],
  ["trace_trajectory", { f: "y", g: "-x", x0: 1, y0: 0, tSpan: 6.283185307179586 }, (r) => r.structuredContent?.trajectories?.length === 2 && r.structuredContent.trajectories.every((t) => t.status === "completed")],
  ["sample_field", { f: "x", g: "y", density: 5 }, (r) => r.structuredContent?.field?.samples?.length === 25],
  ["analyze_first_order", { expr: "y*(1-y)", yMin: -1, yMax: 2 }, (r) => r.structuredContent?.firstOrder?.solutions?.length === 2],
];
for (const [name, args, verify] of calls) {
  const r = await rpc("tools/call", { name, arguments: args });
  const result = r.msg?.result;
  check(`tools/call ${name}`, r.status === 200 && result && !result.isError && verify(result), JSON.stringify(r.msg).slice(0, 300));
}

const bad = await rpc("tools/call", { name: "analyze_system", arguments: { f: "xy", g: "y" } });
check("tools/call invalid expression -> isError result", bad.msg?.result?.isError === true && /x\*y/.test(bad.msg.result.content[0].text), JSON.stringify(bad.msg).slice(0, 300));
// Schema violations: the SDK reports them either as JSON-RPC -32602 or as an isError result whose
// text names the field (SDK 1.30 does the latter). Both are spec-compliant; HTTP 500 is not.
const outOfRange = await rpc("tools/call", { name: "sample_field", arguments: { f: "x", g: "y", density: 999 } });
const oorMsg = outOfRange.msg ?? {};
const oorOk =
  outOfRange.status === 200 &&
  (oorMsg.error?.code === -32602 || (oorMsg.result?.isError === true && /density/.test(oorMsg.result.content?.[0]?.text ?? "")));
check("tools/call out-of-range param -> MCP validation error naming the field, not 500", oorOk, JSON.stringify(outOfRange.msg).slice(0, 300));

const resources = await rpc("resources/list");
const widget = (resources.msg?.result?.resources ?? []).find((r) => r.uri.startsWith("ui://vector-field-tool/"));
check("resources/list has the widget", Boolean(widget), JSON.stringify(resources.msg).slice(0, 200));
if (widget) {
  const read = await rpc("resources/read", { uri: widget.uri });
  const c = read.msg?.result?.contents?.[0];
  const html = c?.text ?? "";
  const csp = c?._meta?.ui?.csp ?? {};
  check("resources/read returns widget HTML", html.toLowerCase().startsWith("<!doctype html") && html.includes("<base href="), JSON.stringify(read.msg).slice(0, 300));
  check("resources/read CSP declares connect/resource/baseUri domains", ["connectDomains", "resourceDomains", "baseUriDomains"].every((k) => Array.isArray(csp[k]) && csp[k].length > 0), JSON.stringify(csp));
  check("widget asset URLs are absolute", !/(src|href)="\/_next\//.test(html), "found relative /_next URLs (BASE_URL not set at build?)");
  console.log(`      widget uri: ${widget.uri}`);
}

const get = await fetch(url, { headers: { accept: "text/event-stream" } });
check("GET /mcp -> 405", get.status === 405, String(get.status));

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
