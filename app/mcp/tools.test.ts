/**
 * Tool-layer tests through the real MCP protocol (SDK client + in-memory transport).
 * No HTTP, no network: the widget resource is listed but never read here.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeAll, describe, expect, it } from "vitest";
import { NO_FORM_NOTE } from "@/lib/core/detect-form";
import { labels } from "@/lib/labels";
import type { Scene } from "@/lib/scene";
import { SlidingWindowLimiter } from "./rate-limit";
import { createMcpServer } from "./server";
import type { ToolDeps } from "./tools";

let client: Client;

async function connect(deps?: ToolDeps): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer("http://localhost:3000", deps);
  await server.connect(serverTransport);
  const c = new Client({ name: "tools-test", version: "0" });
  await c.connect(clientTransport);
  return c;
}

/** Calls a tool; `locale` is required by every math tool, so the helper supplies 'en' unless the test sets it. */
async function call(name: string, args: Record<string, unknown>, via: Client = client): Promise<CallToolResult & { scene: Scene; text: string }> {
  const withLocale = name === "ping" || "locale" in args ? args : { ...args, locale: "en" };
  const result = (await via.callTool({ name, arguments: withLocale })) as CallToolResult;
  const text = result.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  return { ...result, scene: (result.structuredContent ?? {}) as Scene, text };
}

beforeAll(async () => {
  client = await connect();
});

describe("tools/list", () => {
  it("exposes ping plus the four analysis tools with valid schemas", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["analyze_first_order", "analyze_system", "ping", "sample_field", "trace_trajectory"]);
    for (const t of tools) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.description && t.description.length).toBeGreaterThan(40);
    }
  });

  it("every math tool tells the model when to use it, never to compute itself, and how to pick the locale", async () => {
    const { tools } = await client.listTools();
    for (const t of tools.filter((t) => t.name !== "ping")) {
      expect(t.description).toMatch(/USE THIS/);
      expect(t.description).toMatch(/Do NOT compute/);
      // the planar tools write x*y; the first-order tool has no x at all and writes t*y
      expect(t.description).toMatch(t.name === "analyze_first_order" ? /t\*y/ : /x\*y/);
      expect(t.description).toMatch(/caveat/);
      expect(t.description).toMatch(/'zh' when the question is in Chinese/);
      expect(t.description).toMatch(/REQUIRED/);
      const props = t.inputSchema.properties as Record<string, { enum?: string[]; default?: string }>;
      expect(props.locale?.enum).toEqual(["zh", "en"]);
      expect(props.locale?.default).toBeUndefined();
      expect(t.inputSchema.required).toContain("locale");
    }
  });

  it("analyze_first_order speaks the student's notation dy/dt = g(t, y) and never dy/dx", async () => {
    const { tools } = await client.listTools();
    const t = tools.find((t) => t.name === "analyze_first_order")!;
    expect(t.description).toMatch(/dy\/dt = g\(t, y\)/);
    expect(t.description).toMatch(/M\(t, y\) dt \+ N\(t, y\) dy = 0/);
    expect(t.description).toMatch(/x is rejected/);
    expect(t.description).not.toMatch(/dy\/dx|\(x, y\)|M dx/);
    const props = t.inputSchema.properties as Record<string, { description?: string }>;
    // parameter NAMES are unchanged (no aliases); only their descriptions say t
    expect(Object.keys(props).sort()).toEqual(["M", "N", "density", "expr", "locale", "params", "xMin", "xMax", "yMin", "yMax"].sort());
    expect(props.xMin.description).toMatch(/t range/);
    expect(props.xMax.description).toMatch(/t range/);
    expect(props.expr.description).toMatch(/dy\/dt = g\(t, y\)/);
    expect(props.M.description).toMatch(/M\(t, y\)/);
    expect(props.N.description).toMatch(/N\(t, y\)/);
    const planar = tools.find((t) => t.name === "analyze_system")!;
    expect(planar.description).not.toMatch(/dy\/dx/);
  });

  it("keeps the widget resource registered and links every tool to it", async () => {
    const { resources } = await client.listResources();
    const widget = resources.find((r) => r.uri.startsWith("ui://vector-field-tool/") && r.mimeType === "text/html;profile=mcp-app");
    expect(widget).toBeTruthy();
    const { tools } = await client.listTools();
    for (const t of tools) {
      const meta = t._meta as { ui?: { resourceUri?: string } } | undefined;
      expect(meta?.ui?.resourceUri, `${t.name} must reference the widget`).toBe(widget!.uri);
    }
  });
});

describe("cost controls", () => {
  it("a tool call that outruns its wall-clock budget returns a readable isError result", async () => {
    // A clock that jumps 10 s at every reading: the first checkpoint already sees the budget spent.
    let t = 0;
    const c = await connect({ budgetMs: 2000, now: () => (t += 10_000), limiter: new SlidingWindowLimiter(1000, 60_000) });
    for (const [name, args] of [
      ["analyze_system", { f: "x", g: "-y" }],
      ["trace_trajectory", { f: "y", g: "-x", x0: 1, y0: 0 }],
      ["analyze_first_order", { M: "2*t*y", N: "t^2 + y^2" }],
    ] as const) {
      const r = await call(name, { ...args, locale: "en" }, c);
      expect(r.isError, name).toBe(true);
      expect(r.text, name).toMatch(/exceeded its 2 s budget/);
    }
  });

  it("the in-process limiter turns excess calls into isError results and recovers after the window", async () => {
    let now = 0;
    const c = await connect({ limiter: new SlidingWindowLimiter(2, 1000), now: () => now });
    const args = { f: "x", g: "y", density: 5, locale: "en" };
    expect((await call("sample_field", args, c)).isError).toBeFalsy();
    expect((await call("sample_field", args, c)).isError).toBeFalsy();
    const third = await call("sample_field", args, c);
    expect(third.isError).toBe(true);
    expect(third.text).toMatch(/Too many requests/);
    expect(third.text).toMatch(/limit 2 tool calls per 1 s/);
    now = 1001;
    expect((await call("sample_field", args, c)).isError).toBeFalsy();
  });

  it("the expression length cap applies to M and N as well as to f, g and expr", async () => {
    const long = "t+".repeat(101) + "1"; // 203 characters
    for (const [name, args, field] of [
      ["analyze_first_order", { M: long, N: "y" }, "M"],
      ["analyze_first_order", { M: "t", N: long }, "N"],
      ["analyze_first_order", { expr: long }, "expr"],
      ["analyze_system", { f: long, g: "y" }, "f"],
      ["analyze_system", { f: "x", g: long }, "g"],
    ] as const) {
      const r = await call(name, { ...args, locale: "en" });
      expect(r.isError, field).toBe(true);
      expect(r.text, field).toContain(field);
    }
  });

  it("a transcendental textbook exact equation (Zill §2.4 Ex. 3) finishes inside the budget at default parameters (review C9)", async () => {
    // (e^{2y} - y cos ty) dt + (2t e^{2y} - t cos ty + 2y) dy = 0: ∂M/∂y = 2e^{2y} - cos ty + ty sin ty = ∂N/∂t.
    const t0 = performance.now();
    const r = await call("analyze_first_order", { M: "exp(2*y) - y*cos(t*y)", N: "2*t*exp(2*y) - t*cos(t*y) + 2*y", locale: "en" });
    const elapsed = performance.now() - t0;
    expect(r.isError).toBeFalsy();
    expect(r.scene.firstOrder!.forms!.find((f) => f.form === "exact")!.verdict).toBe("consistent");
    expect(r.scene.firstOrder?.implicit).toBeTruthy();
    expect(elapsed).toBeLessThan(2000);
  });

  it("a parse error in N is attributed to N even when N's text contains M's text", async () => {
    const r = await call("analyze_first_order", { M: "t", N: "t +", locale: "en" });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/Cannot parse N/);
    const m = await call("analyze_first_order", { M: "y +", N: "y + 1", locale: "en" });
    expect(m.text).toMatch(/Cannot parse M/);
  });

  it("the most expensive legal call (exact equation with level curves) finishes well inside the budget", async () => {
    const t0 = performance.now();
    const r = await call("analyze_first_order", { M: "2*t*y", N: "t^2 + y^2", density: 60, xMin: -50, xMax: 50, yMin: -50, yMax: 50, locale: "en" });
    const elapsed = performance.now() - t0;
    expect(r.isError).toBeFalsy();
    expect(r.scene.firstOrder?.implicit).toBeTruthy();
    expect(elapsed).toBeLessThan(2000);
  });
});

describe("ping", () => {
  it("echoes and tags the result", async () => {
    const r = await call("ping", { message: "hello" });
    expect(r.isError).toBeFalsy();
    expect(r.text).toBe("hello");
    expect(r.structuredContent).toEqual({ kind: "ping", message: "hello" });
  });
});

describe("locale", () => {
  it("is required: a call without it fails naming the field, for every math tool", async () => {
    for (const [name, args] of [
      ["analyze_system", { f: "x", g: "y" }],
      ["trace_trajectory", { f: "x", g: "y", x0: 1, y0: 0 }],
      ["sample_field", { f: "x", g: "y" }],
      ["analyze_first_order", { expr: "y" }],
    ] as const) {
      const r = (await client.callTool({ name, arguments: { ...args } })) as CallToolResult;
      expect(r.isError, name).toBe(true);
      const text = r.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
      expect(text, name).toMatch(/locale/);
    }
  });

  it("English when asked for English, and the scene is stamped", async () => {
    const r = await call("analyze_system", { f: "x - x*y", g: "x*y - y", xMin: -0.5, xMax: 3, yMin: -0.5, yMax: 3, locale: "en" });
    expect(r.isError).toBeFalsy();
    expect(r.scene.locale).toBe("en");
    expect(r.text).toContain("Equilibrium (1, 1): center or weak spiral");
    expect(r.text).toContain(labels("en").caveat.center.slice(0, 40));
    expect(r.text).not.toMatch(/[一-鿿]/);
  });

  it("zh switches every sentence, and the caveat key is translated", async () => {
    const r = await call("analyze_system", { f: "x - x*y", g: "x*y - y", xMin: -0.5, xMax: 3, yMin: -0.5, yMax: 3, locale: "zh" });
    expect(r.scene.locale).toBe("zh");
    const coexist = r.scene.equilibria!.find((e) => Math.hypot(e.at.x - 1, e.at.y - 1) < 1e-6)!;
    expect(coexist.caveat).toBe("center");
    expect(r.text).toContain("中心或弱螺旋");
    expect(r.text).toContain(labels("zh").caveat.center.slice(0, 12));
    expect(r.text).not.toMatch(/Equilibrium/);
  });

  it("English first-order summary uses the English tables and note", async () => {
    const logistic = await call("analyze_first_order", { expr: "y*(1-y)", yMin: -1, yMax: 2 });
    expect(logistic.text).toMatch(/^Equation dy\/dt = y\*\(1-y\); viewing box t ∈ \[-3, 3\], y ∈ \[-1, 2\]\./);
    expect(logistic.text).not.toMatch(/x ∈ \[/);
    expect(logistic.text).toContain("Constant solution y = 1: stable");
    expect(logistic.text).toContain("Numerically behaves like a separable equation");
    const riccati = await call("analyze_first_order", { expr: "t^2 + y^2", xMin: 0.3, xMax: 3, yMin: 0.3, yMax: 3 });
    expect(riccati.scene.firstOrder?.formsNote).toBe(NO_FORM_NOTE.en);
    expect(riccati.text).toContain(NO_FORM_NOTE.en);
  });

  it("rejects an unknown locale through the schema", async () => {
    const r = await call("sample_field", { f: "x", g: "y", locale: "fr" });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/locale/);
  });
});

describe("analyze_system", () => {
  it("Lotka-Volterra: (0,0) saddle and (1,1) center-or-weak-spiral with the caveat in the text", async () => {
    const r = await call("analyze_system", { f: "x - x*y", g: "x*y - y", xMin: -0.5, xMax: 3, yMin: -0.5, yMax: 3, locale: "zh" });
    expect(r.isError).toBeFalsy();
    expect(r.scene.kind).toBe("analyze_system");
    expect(r.scene.equilibria).toHaveLength(2);
    const coexist = r.scene.equilibria!.find((e) => Math.hypot(e.at.x - 1, e.at.y - 1) < 1e-6)!;
    expect(coexist.classification).toBe("center_or_weak_spiral");
    expect(coexist.caveat).toBe("center");
    expect(r.text).toContain("中心或弱螺旋");
    expect(r.text).toContain(labels("zh").caveat.center.slice(0, 12));
    expect(r.scene.field?.samples).toHaveLength(400); // default density 20
    expect(r.scene.box).toEqual({ x: { min: -0.5, max: 3 }, y: { min: -0.5, max: 3 } });
  });

  it("uses default box and reports none_found honestly", async () => {
    const r = await call("analyze_system", { f: "1", g: "1", locale: "zh" });
    expect(r.isError).toBeFalsy();
    expect(r.scene.warning).toBe("none_found");
    expect(r.text).toContain("没有找到平衡点");
    expect(r.scene.box).toEqual({ x: { min: -3, max: 3 }, y: { min: -3, max: 3 } });
  });

  it("rejects an inverted box with a readable error result, not a protocol error", async () => {
    const r = await call("analyze_system", { f: "x", g: "y", xMin: 2, xMax: -2 });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/xMin/);
  });

  it("explains parse errors and points at f or g", async () => {
    const r = await call("analyze_system", { f: "xy", g: "y" });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/x\*y/);
    expect(r.text).toMatch(/f \(the x' expression\)/);
  });

  it("uses params", async () => {
    const r = await call("analyze_system", { f: "a*x", g: "b*y", params: { a: -1, b: -2 } });
    expect(r.scene.equilibria![0].classification).toBe("stable_node");
    expect(r.scene.system).toEqual({ f: "a*x", g: "b*y", params: { a: -1, b: -2 } });
  });

  it("fails schema validation for a malformed params key (SDK surfaces it as an isError result)", async () => {
    // The server answers JSON-RPC -32602; the SDK client converts that into an isError result.
    const r = await call("analyze_system", { f: "x", g: "y", params: { "1a": 1 } });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/Invalid arguments/);
    expect(r.text).toMatch(/params/);
  });
});

describe("trace_trajectory", () => {
  it("integrates the harmonic oscillator both ways and closes the circle", async () => {
    const r = await call("trace_trajectory", { f: "y", g: "-x", x0: 1, y0: 0, tSpan: 2 * Math.PI, locale: "zh" });
    expect(r.isError).toBeFalsy();
    expect(r.scene.kind).toBe("trace_trajectory");
    expect(r.scene.trajectories).toHaveLength(2);
    const fwd = r.scene.trajectories!.find((t) => t.direction === "forward")!;
    const back = r.scene.trajectories!.find((t) => t.direction === "backward")!;
    expect(fwd.status).toBe("completed");
    expect(back.status).toBe("completed");
    const end = fwd.points[fwd.points.length - 1];
    expect(Math.hypot(end.x - 1, end.y)).toBeLessThan(1e-4);
    expect(fwd.tEnd).toBeCloseTo(2 * Math.PI, 9);
    expect(back.tEnd).toBeCloseTo(-2 * Math.PI, 9);
    expect(r.text).toMatch(/正向/);
    expect(r.text).toMatch(/逆向/);
  });

  it("stops at the box edge and says so", async () => {
    const r = await call("trace_trajectory", { f: "1", g: "0", x0: 0, y0: 0, direction: "forward", tSpan: 100, locale: "zh" });
    expect(r.scene.trajectories![0].status).toBe("left_box");
    expect(r.text).toContain("离开了观察范围");
  });

  it("caps the number of returned points", async () => {
    const r = await call("trace_trajectory", { f: "y", g: "-x", x0: 1, y0: 0, tSpan: 1000, method: "rk4", direction: "forward", xMin: -5, xMax: 5, yMin: -5, yMax: 5 });
    expect(r.scene.trajectories![0].points.length).toBeLessThanOrEqual(1000);
    expect(r.scene.trajectories![0].steps).toBeGreaterThan(1000);
  });

  it("rejects tSpan out of range with a message naming tSpan", async () => {
    const big = await call("trace_trajectory", { f: "y", g: "-x", x0: 1, y0: 0, tSpan: 5000 });
    expect(big.isError).toBe(true);
    expect(big.text).toMatch(/tSpan/);
    const zero = await call("trace_trajectory", { f: "y", g: "-x", x0: 1, y0: 0, tSpan: 0 });
    expect(zero.isError).toBe(true);
    expect(zero.text).toMatch(/tSpan/);
  });

  it("a solution that blows up leaves the viewing box first, and is reported as such without NaN", async () => {
    // x(t) = 1/(1 - t) exits the box at x = 1e5 (t = 1 - 1e-5) long before any position bound;
    // through the tool a blow-up therefore always shows as left_box, never as a speed-based verdict.
    const r = await call("trace_trajectory", { f: "x^2", g: "0", x0: 1, y0: 0, direction: "forward", tSpan: 5, xMin: -1e5, xMax: 1e5, yMin: -1, yMax: 1, locale: "zh" });
    const t = r.scene.trajectories![0];
    expect(t.status).toBe("left_box");
    expect(t.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(t.points[t.points.length - 1].x).toBeCloseTo(1e5, 6); // cut exactly on the border
    expect(Math.abs(t.tEnd - (1 - 1e-5))).toBeLessThan(1e-6); // exact exit time of 1/(1-t) = 1e5
    expect(r.text).toContain("离开了观察范围");
  });

  it("a stiff decay is never called a blow-up by the tool", async () => {
    const r = await call("trace_trajectory", { f: "-1e7*x", g: "0", x0: 1, y0: 0, direction: "forward", tSpan: 1, locale: "en" });
    const t = r.scene.trajectories![0];
    expect(t.status).toBe("reached_equilibrium");
    expect(Math.abs(t.points[t.points.length - 1].x)).toBeLessThan(1e-8);
  });

  it("rk4 reaches any accepted tSpan instead of truncating at 20000 steps", async () => {
    const r = await call("trace_trajectory", { f: "y", g: "-x", x0: 1, y0: 0, tSpan: 500, method: "rk4", direction: "forward", xMin: -5, xMax: 5, yMin: -5, yMax: 5, locale: "en" });
    const t = r.scene.trajectories![0];
    expect(t.status).toBe("completed");
    expect(t.tEnd).toBeCloseTo(500, 6);
  });
});

describe("sample_field", () => {
  it("returns density² samples and counts singularities", async () => {
    const r = await call("sample_field", { f: "1/x", g: "y", density: 5, xMin: -1, xMax: 1, yMin: -1, yMax: 1, locale: "zh" });
    expect(r.isError).toBeFalsy();
    expect(r.scene.field?.samples).toHaveLength(25);
    expect(r.scene.field?.singularCount).toBe(5); // the x = 0 column
    expect(r.text).toContain("5 个采样点无定义");
  });

  it("rejects density outside 5..60 with a message naming density", async () => {
    const hi = await call("sample_field", { f: "x", g: "y", density: 61 });
    expect(hi.isError).toBe(true);
    expect(hi.text).toMatch(/density/);
    const lo = await call("sample_field", { f: "x", g: "y", density: 4 });
    expect(lo.isError).toBe(true);
    expect(lo.text).toMatch(/density/);
  });

  it("requires f and g", async () => {
    const r = await call("sample_field", { f: "x" });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/\bg\b/);
  });
});

describe("analyze_first_order", () => {
  it("logistic dy/dt = y(1-y): y=0 unstable, y=1 stable, with a slope field and detected forms", async () => {
    const r = await call("analyze_first_order", { expr: "y*(1-y)", yMin: -1, yMax: 2, locale: "zh" });
    expect(r.isError).toBeFalsy();
    expect(r.scene.kind).toBe("analyze_first_order");
    expect(r.scene.system).toEqual({ f: "1", g: "y*(1-y)", variables: "ty" });
    expect(r.scene.fieldStyle).toBe("arrows");
    expect(r.scene.firstOrder?.spec).toEqual({ kind: "explicit", g: "y*(1-y)" });
    expect(r.scene.firstOrder?.expr).toBe("dy/dt = y*(1-y)");
    expect(r.text).toMatch(/^方程 dy\/dt = y\*\(1-y\)，观察范围 t∈\[-3, 3\]，y∈\[-1, 2\]。/);
    expect(r.scene.firstOrder?.autonomous).toBe(true);
    const ys = r.scene.firstOrder!.solutions.map((s) => [Math.round(s.y * 1e6) / 1e6, s.stability]);
    expect(ys).toEqual([[0, "unstable"], [1, "stable"]]);
    expect(r.text).toContain("常数解 y = 1");
    expect(r.scene.field?.samples).toHaveLength(400);
    const forms = r.scene.firstOrder!.forms!.filter((f) => f.verdict === "consistent").map((f) => f.form);
    expect(forms).toContain("separable");
    expect(forms).toContain("autonomous");
    expect(r.scene.firstOrder!.forms!.map((f) => f.form)).toHaveLength(8); // every form, with a verdict
    expect(r.text).toContain("在数值上表现得像");
    expect(r.text).toContain("不是证明");
    expect(r.text).toContain("未通过检验的形式");
    expect(r.scene.firstOrder?.formsNote).toBeUndefined();
  });

  it("finds constant solutions of a non-autonomous equation and reports 'varies'", async () => {
    const r = await call("analyze_first_order", { expr: "t*(y-1)", xMin: -2, xMax: 2, yMin: -2, yMax: 3, locale: "zh" });
    expect(r.scene.firstOrder?.autonomous).toBe(false);
    expect(r.scene.firstOrder?.solutions.map((s) => [Math.round(s.y * 1e6) / 1e6, s.stability])).toEqual([[1, "varies"]]);
    expect(r.text).toContain("常数解 y = 1");
  });

  it("says when there are no constant solutions", async () => {
    const r = await call("analyze_first_order", { expr: "t - y", locale: "zh" });
    expect(r.scene.firstOrder?.solutions).toEqual([]);
    expect(r.text).toContain("没有常数解（右端依赖 t；");
  });

  it("accepts the differential form: y dt - t dy = 0 has undirected segments and a singular origin", async () => {
    const r = await call("analyze_first_order", { M: "y", N: "-t", xMin: -2, xMax: 2, yMin: -2, yMax: 2, locale: "zh" });
    expect(r.isError).toBeFalsy();
    expect(r.scene.fieldStyle).toBe("segments");
    expect(r.scene.system).toEqual({ f: "-t", g: "-(y)", variables: "ty" });
    expect(r.scene.firstOrder?.spec).toEqual({ kind: "differential", M: "y", N: "-t" });
    expect(r.scene.firstOrder?.expr).toBe("(y) dt + (-t) dy = 0");
    expect(r.text).toMatch(/^方程 \(y\) dt \+ \(-t\) dy = 0，观察范围 t∈\[-2, 2\]，y∈\[-2, 2\]。/);
    const sing = r.scene.firstOrder!.singularities!;
    expect(sing).toHaveLength(1);
    expect(Math.hypot(sing[0].x, sing[0].y)).toBeLessThan(1e-6);
    expect(r.text).toContain("方向场奇点");
    expect(r.text).toContain("无向线段");
    const forms = r.scene.firstOrder!.forms!.filter((f) => f.verdict === "consistent").map((f) => f.form);
    expect(forms).toContain("integrating_factor_x");
    expect(forms).not.toContain("exact");
  });

  it("draws the implicit solution of an exact equation: 2ty dt + (t² + y²) dy = 0", async () => {
    const r = await call("analyze_first_order", { M: "2*t*y", N: "t^2 + y^2", xMin: -2, xMax: 2, yMin: -2, yMax: 2, locale: "zh" });
    expect(r.isError).toBeFalsy();
    expect(r.scene.firstOrder!.forms!.filter((f) => f.verdict === "consistent").map((f) => f.form)).toContain("exact");
    expect(r.scene.firstOrder!.implicitCheck).toEqual({ pathDeviation: expect.any(Number), tol: 1e-6, passed: true });
    const implicit = r.scene.firstOrder!.implicit!;
    expect(implicit.pathDeviation).toBeLessThan(1e-9);
    expect(implicit.levels.length).toBeGreaterThan(3);
    expect(implicit.levels.some((l) => l.segments.length > 0)).toBe(true);
    // every contour point really lies on its level of F = t²y + y³/3 (up to the base constant); the
    // helper reads the kernel Vec2 field p.x, which IS the student's t
    const F = (p: { x: number; y: number }) => p.x * p.x * p.y + (p.y * p.y * p.y) / 3;
    for (const { level, segments } of implicit.levels) {
      for (const [a] of segments.slice(0, 20)) {
        // levels are offsets from F(base) with base = (0, 0), so F(a) ≈ level
        expect(Math.abs(F(a) - level)).toBeLessThan(0.05);
      }
    }
    expect(r.text).toContain("隐式解");
  });

  it("the Riccati equation dy/dt = t² + y² matches no form and gets the positive note", async () => {
    const r = await call("analyze_first_order", { expr: "t^2 + y^2", xMin: 0.3, xMax: 3, yMin: 0.3, yMax: 3, locale: "zh" });
    expect(r.scene.firstOrder?.forms?.filter((f) => f.verdict === "consistent" || f.verdict === "borderline")).toEqual([]);
    expect(r.scene.firstOrder?.forms?.every((f) => f.verdict === "inconsistent")).toBe(true);
    expect(r.scene.firstOrder?.formsNote).toMatch(/Riccati/);
    expect(r.text).toContain("这不是失败");
    expect(r.text).toContain("未通过检验的形式");
  });

  it("closed but not exact: (t dy - y dt)/(t² + y²) passes the exactness probe but fails the path check, and says so", async () => {
    // M = -y/(t²+y²), N = t/(t²+y²): ∂M/∂y = ∂N/∂t = (y² - t²)/(t²+y²)² everywhere except the
    // origin, so the local criterion holds; but the form is dθ, whose integral around the origin is
    // 2π, so a potential on a box containing the origin cannot exist: the two integration paths
    // disagree wherever they wind differently around the origin.
    const r = await call("analyze_first_order", { M: "-y/(t^2 + y^2)", N: "t/(t^2 + y^2)", xMin: -2, xMax: 2, yMin: -2, yMax: 2, locale: "en" });
    expect(r.isError).toBeFalsy();
    const exact = r.scene.firstOrder!.forms!.find((f) => f.form === "exact")!;
    expect(["consistent", "borderline"]).toContain(exact.verdict);
    expect(r.scene.firstOrder!.implicit).toBeUndefined();
    const check = r.scene.firstOrder!.implicitCheck!;
    expect(check.passed).toBe(false);
    expect(Number.isFinite(check.pathDeviation)).toBe(true);
    expect(check.pathDeviation).toBeGreaterThan(1e-6);
    expect(r.text).toContain("path-independence self-check");
    expect(r.text).toContain(check.pathDeviation.toExponential(1));
    expect(r.text).not.toContain("level curves)"); // the exactImplicit sentence must not appear
  });

  it("rejects neither-or-both input forms with a readable error", async () => {
    const neither = await call("analyze_first_order", {});
    expect(neither.isError).toBe(true);
    expect(neither.text).toMatch(/exactly one form/);
    const both = await call("analyze_first_order", { expr: "y", M: "t", N: "y" });
    expect(both.isError).toBe(true);
    const half = await call("analyze_first_order", { M: "t" });
    expect(half.isError).toBe(true);
    expect(half.text).toMatch(/both `M` and `N`/);
  });

  it("explains parse errors", async () => {
    const r = await call("analyze_first_order", { expr: "y +" });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/Cannot parse g \(the right-hand side of dy\/dt\)/);
  });

  it("rejects x in a first-order equation with the t-instead-of-x hint, attributed to the field that has it", async () => {
    const g = await call("analyze_first_order", { expr: "x^2 + y^2" });
    expect(g.isError).toBe(true);
    expect(g.text).toMatch(/Cannot parse g \(the right-hand side of dy\/dt\)/);
    expect(g.text).toContain("the independent variable is t");
    expect(g.text).toContain("write t instead of x");
    const m = await call("analyze_first_order", { M: "x", N: "y" });
    expect(m.isError).toBe(true);
    expect(m.text).toMatch(/Cannot parse M/);
    expect(m.text).toContain("write t instead of x");
    const n = await call("analyze_first_order", { M: "t", N: "x*y" });
    expect(n.text).toMatch(/Cannot parse N/);
    expect(n.text).toContain("write t instead of x");
  });

  it("a pasted left-hand side is refused with the right-hand-side hint; dy/dx also gets the t sentence", async () => {
    const dx = await call("analyze_first_order", { expr: "dy/dx = t*y" });
    expect(dx.isError).toBe(true);
    expect(dx.text).toContain("Enter only the right-hand side");
    expect(dx.text).toContain("write t instead of x");
    for (const expr of ["dy/dt = t*y", "y' = y", "y = t"]) {
      const r = await call("analyze_first_order", { expr });
      expect(r.isError, expr).toBe(true);
      expect(r.text, expr).toContain("Enter only the right-hand side");
      expect(r.text, expr).not.toContain("write t instead of x");
    }
  });

  it("function names containing the letter x are still fine in t mode", async () => {
    const r = await call("analyze_first_order", { expr: "exp(t) + max(t, y)", xMin: -1, xMax: 1, yMin: -1, yMax: 1 });
    expect(r.isError).toBeFalsy();
    expect(r.scene.system).toEqual({ f: "1", g: "exp(t) + max(t, y)", variables: "ty" });
  });
});
