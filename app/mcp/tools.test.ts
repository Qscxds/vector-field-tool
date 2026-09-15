/**
 * Tool-layer tests through the real MCP protocol (SDK client + in-memory transport).
 * No HTTP, no network: the widget resource is listed but never read here.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeAll, describe, expect, it } from "vitest";
import { NO_FORM_NOTE } from "@/lib/core/detect-form";
import { constantSolutionNotices, fill, formatNumber, formatPoint, labels, stabilitySentence } from "@/lib/labels";
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

/** Calls a tool; the helper supplies locale 'en' explicitly unless the test sets it (the schema default is tested separately). */
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
  it("exposes ping plus the six analysis tools with valid schemas", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["analyze_first_order", "analyze_second_order", "analyze_system", "ping", "query_solution", "sample_field", "trace_trajectory"]);
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
      // the planar tools write x*y; the first-order tool has no x at all and writes t*y; the
      // second-order tool's variables are x and x'
      expect(t.description).toMatch(t.name === "analyze_first_order" ? /t\*y/ : t.name === "analyze_second_order" ? /x\*x'/ : /x\*y/);
      expect(t.description).toMatch(/caveat/);
      expect(t.description).toMatch(/'zh' when the question is in Chinese/);
      expect(t.description).toMatch(/defaults to en/);
      expect(t.description).not.toMatch(/REQUIRED/);
      const props = t.inputSchema.properties as Record<string, { enum?: string[]; default?: string }>;
      expect(props.locale?.enum).toEqual(["zh", "en"]);
      expect(props.locale?.default).toBe("en");
      expect(t.inputSchema.required ?? []).not.toContain("locale");
    }
  });

  it("every analysis tool's description STARTS with the call-first rule and keeps the what / use-this / syntax text (Phase L.1)", async () => {
    // Observed: asked about 2xy dx + (x² + y²) dy = 0 the model listed the tools and answered by
    // symbolic derivation without calling any. The rule is the first thing the model reads.
    const { tools } = await client.listTools();
    const analysis = tools.filter((t) => t.name !== "ping");
    expect(analysis).toHaveLength(6);
    for (const t of analysis) {
      expect(t.description, t.name).toMatch(/^CALL THIS TOOL FIRST /);
      expect(t.description, t.name).toMatch(/Even when /);
      expect(t.description, t.name).toMatch(/check your derivation against its numerical results/);
      expect(t.description, t.name).toMatch(/Never answer from symbolic derivation alone\./);
      // the rule is stated once, ahead of everything else
      expect(t.description!.indexOf("Never answer from symbolic derivation alone."), t.name).toBeLessThan(t.description!.indexOf("WHAT IT COMPUTES"));
      expect(t.description!.indexOf("WHAT IT COMPUTES"), t.name).toBeLessThan(t.description!.indexOf("USE THIS"));
      // fractional powers of a negative base are said once in every syntax rule
      expect(t.description, t.name).toMatch(/fractional power of a negative base/);
    }
    // tailored per tool: each names the kind of equation it is for
    const by = Object.fromEntries(analysis.map((t) => [t.name, t.description!]));
    expect(by.analyze_first_order).toMatch(/^CALL THIS TOOL FIRST for any question that involves a concrete first-order equation/);
    expect(by.analyze_system).toMatch(/^CALL THIS TOOL FIRST for any question that involves a concrete planar system/);
    expect(by.analyze_second_order).toMatch(/^CALL THIS TOOL FIRST for any question that involves a concrete second-order equation/);
    expect(by.trace_trajectory).toMatch(/^CALL THIS TOOL FIRST whenever a question involves a concrete planar system .* AND a specific starting point/);
    expect(by.sample_field).toMatch(/^CALL THIS TOOL FIRST whenever a question involves the direction field/);
    // the second-order rule spells out what is accepted: affine in x'', coefficient may depend on x, x', t
    expect(by.analyze_second_order).toMatch(/affine in x''/);
    expect(by.analyze_second_order).toMatch(/coefficient of x'' may depend on x, x' and t/);
    expect(by.analyze_second_order).toMatch(/x''\^2, sin\(x''\)/);
    // ping keeps its own text
    expect(tools.find((t) => t.name === "ping")!.description).not.toMatch(/CALL THIS TOOL FIRST/);
  });

  it("analyze_first_order speaks the student's notation dy/dt = g(t, y) and never dy/dx", async () => {
    const { tools } = await client.listTools();
    const t = tools.find((t) => t.name === "analyze_first_order")!;
    expect(t.description).toMatch(/dy\/dt = g\(t, y\)/);
    expect(t.description).toMatch(/M\(t, y\) dt \+ N\(t, y\) dy = 0/);
    expect(t.description).toMatch(/x is rejected/);
    expect(t.description).not.toMatch(/dy\/dx|\(x, y\)|M dx/);
    const props = t.inputSchema.properties as Record<string, { description?: string }>;
    // Round P2.2: the t range is named tMin / tMax; the older xMin / xMax are still read as the same range.
    expect(Object.keys(props).sort()).toEqual(["M", "N", "density", "expr", "locale", "params", "tMin", "tMax", "xMin", "xMax", "yMin", "yMax"].sort());
    expect(props.tMin.description).toMatch(/t range/);
    expect(props.tMax.description).toMatch(/t range/);
    expect(props.xMin.description).toMatch(/same as tMin/);
    expect(props.expr.description).toMatch(/dy\/dt = g\(t, y\)/);
    expect(props.M.description).toMatch(/M\(t, y\)/);
    expect(props.N.description).toMatch(/N\(t, y\)/);
    const planar = tools.find((t) => t.name === "analyze_system")!;
    expect(planar.description).not.toMatch(/dy\/dx/);
  });

  it("analyze_system, analyze_second_order and sample_field take a snapshot time t (default 0) for non-autonomous systems; trace_trajectory does not", async () => {
    const { tools } = await client.listTools();
    for (const name of ["analyze_system", "analyze_second_order", "sample_field"]) {
      const t = tools.find((t) => t.name === name)!;
      const props = t.inputSchema.properties as Record<string, { default?: number; description?: string }>;
      expect(props.t?.default, name).toBe(0);
      expect(props.t?.description, name).toMatch(/non-autonomous/);
      expect(t.inputSchema.required, name).not.toContain("t");
      expect(t.description, name).toMatch(/non-autonomous/);
    }
    const trace = tools.find((t) => t.name === "trace_trajectory")!;
    expect(Object.keys(trace.inputSchema.properties as object)).not.toContain("t");
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
      ["analyze_second_order", { equation: "x'' + x = 0" }],
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
  it("is optional and defaults to en: a call without it succeeds with an English summary and an en scene, for every math tool (round M)", async () => {
    // Round M reversed H2.9: a forgotten locale used to be an isError that reached the student;
    // now it only costs an English summary. Derived expectation: the schema default 'en' flows
    // into scene.locale, and the text is from the English table (no CJK characters).
    for (const [name, args] of [
      ["analyze_system", { f: "x", g: "y" }],
      ["trace_trajectory", { f: "x", g: "y", x0: 1, y0: 0 }],
      ["sample_field", { f: "x", g: "y" }],
      ["analyze_first_order", { expr: "y" }],
      ["analyze_second_order", { equation: "x'' + x = 0" }],
    ] as const) {
      const r = (await client.callTool({ name, arguments: { ...args } })) as CallToolResult;
      expect(r.isError, name).toBeFalsy();
      expect((r.structuredContent as Scene).locale, name).toBe("en");
      const text = r.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
      expect(text.length, name).toBeGreaterThan(0);
      expect(text, name).not.toMatch(/[一-鿿]/);
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

  it("a non-autonomous system gets a snapshot field and the sentence, never equilibria or stability, in both locales", async () => {
    // x' = y, y' = -x + sin(t): the field changes with t by |sin t| at every point, at most 0.98777
    // over the probe times, and |F| <= hypot(3, 4) = 5 on the default box, so the measured relative
    // deviation is at least 0.1975.
    for (const locale of ["zh", "en"] as const) {
      const r = await call("analyze_system", { f: "y", g: "-x + sin(t)", locale });
      expect(r.isError, locale).toBeFalsy();
      expect(r.scene.kind).toBe("analyze_system");
      expect(r.scene.equilibria).toBeUndefined();
      expect(r.scene.warning).toBeUndefined();
      expect(r.scene.timeDependent?.snapshotT).toBe(0);
      expect(r.scene.timeDependent!.maxRelDeviation).toBeGreaterThan(0.19);
      expect(r.scene.field?.samples).toHaveLength(400);
      const L = labels(locale);
      expect(r.text).toContain(L.tool.timeDependent.slice(0, 20));
      expect(r.text).toContain(L.tool.timeDependent.slice(-12));
      expect(r.text).toContain(fill(L.tool.sampleFieldLine, { nx: 20, ny: 20, f: "y", g: "-x + sin(t)", maxMag: "", singular: "" }).slice(0, 14));
      // no numbered equilibrium line, no classification word, no eigenvalues
      expect(r.text).not.toMatch(/\n1\. /);
      expect(r.text).not.toMatch(/eigenvalue|特征值/i);
      expect(r.text).toContain("t = 0");
    }
  });

  it("the snapshot time t changes the sampled field of a non-autonomous system: g(t = 1.5) - g(t = 0) = sin 1.5 at every sample", async () => {
    const at0 = await call("analyze_system", { f: "y", g: "-x + sin(t)", density: 5 });
    const at15 = await call("analyze_system", { f: "y", g: "-x + sin(t)", density: 5, t: 1.5 });
    // The snapshot time joins the probe times (J review C.5), so the evidence at t = 1.5 is measured
    // over a superset of times: at least the t = 0 value (sin 1.5 = 0.9975 exceeds sin 1.4142 = 0.9878).
    expect(at15.scene.timeDependent?.snapshotT).toBe(1.5);
    expect(at15.scene.timeDependent!.maxRelDeviation).toBeGreaterThanOrEqual(at0.scene.timeDependent!.maxRelDeviation);
    expect(at15.scene.timeDependent!.maxRelDeviation).toBeLessThan(3);
    expect(at15.text).toContain("t = 1.5");
    const a = at0.scene.field!.samples, b = at15.scene.field!.samples;
    expect(a).toHaveLength(25);
    for (let i = 0; i < a.length; i++) {
      expect(b[i].at).toEqual(a[i].at);
      expect(b[i].v.x).toBe(a[i].v.x); // f = y does not depend on t
      expect(b[i].v.y - a[i].v.y).toBeCloseTo(Math.sin(1.5), 12);
    }
  });

  it("the verdict is static (t present): 0*t + y, a 1e-6 forcing on a huge box and a localized forcing are all non-autonomous, with no equilibrium and the snapshot honored (J review C.5)", async () => {
    const cases: Array<{ f: string; g: string; box?: Record<string, number> }> = [
      { f: "0*t + y", g: "-x" },
      { f: "y", g: "-x + 1e-6*sin(t)", box: { xMin: -1e4, xMax: 1e4, yMin: -1e4, yMax: 1e4 } },
      { f: "y", g: "-x + exp(-2000*x^2)*sin(t)" },
    ];
    for (const c of cases) {
      const r = await call("analyze_system", { f: c.f, g: c.g, ...(c.box ?? {}), density: 5, t: 1.5, locale: "en" });
      expect(r.isError, c.g).toBeFalsy();
      expect(r.scene.equilibria, c.g).toBeUndefined();
      expect(r.scene.timeDependent?.snapshotT, c.g).toBe(1.5);
      expect(r.text, c.g).not.toMatch(/\n1\. /);
      expect(r.text, c.g).toContain("t = 1.5");
    }
  });

  it("a field undefined at every fixed probe time (sqrt(t - 5)) is still non-autonomous, and the field is sampled at the requested t = 10, where it is finite (J review C.5)", async () => {
    // y' = -x sqrt(t - 5) at t = 10: (y, -x sqrt 5). No equilibrium line, no 'none found'.
    const r = await call("analyze_system", { f: "y", g: "-x*sqrt(t - 5)", density: 5, t: 10, locale: "en" });
    expect(r.isError).toBeFalsy();
    expect(r.scene.timeDependent).toEqual({ snapshotT: 10, maxRelDeviation: Infinity });
    expect(r.scene.equilibria).toBeUndefined();
    expect(r.scene.warning).toBeUndefined();
    expect(r.scene.field!.singularCount).toBe(0);
    for (const s of r.scene.field!.samples) {
      expect(s.v.x).toBe(s.at.y);
      expect(Math.abs(s.v.y - -s.at.x * Math.sqrt(5)) <= 1e-15 * Math.max(1e-300, Math.abs(s.at.x * Math.sqrt(5)))).toBe(true);
    }
    expect(r.text).not.toMatch(/No equilibrium points/);
    expect(r.text).toContain("t = 10");
    // sample_field on the same input agrees: finite field at t = 10, and the same note.
    const s = await call("sample_field", { f: "y", g: "-x*sqrt(t - 5)", density: 5, t: 10, locale: "en" });
    expect(s.scene.timeDependent).toEqual({ snapshotT: 10, maxRelDeviation: Infinity });
    expect(s.scene.field!.singularCount).toBe(0);
  });

  it("an autonomous system is unchanged by the detection: x' = y, y' = -x still has its center-or-weak-spiral with the caveat", async () => {
    const r = await call("analyze_system", { f: "y", g: "-x", t: 1.5, locale: "en" });
    expect(r.isError).toBeFalsy();
    expect(r.scene.timeDependent).toBeUndefined();
    expect(r.scene.equilibria).toHaveLength(1);
    expect(Math.hypot(r.scene.equilibria![0].at.x, r.scene.equilibria![0].at.y)).toBeLessThan(1e-9);
    expect(r.scene.equilibria![0].classification).toBe("center_or_weak_spiral");
    expect(r.scene.equilibria![0].caveat).toBe("center");
    expect(r.text).toContain("Equilibrium (0, 0): center or weak spiral");
    expect(r.text).not.toMatch(/non-autonomous/);
  });

  it("fails schema validation for a malformed params key (SDK surfaces it as an isError result)", async () => {
    // The server answers JSON-RPC -32602; the SDK client converts that into an isError result.
    const r = await call("analyze_system", { f: "x", g: "y", params: { "1a": 1 } });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/Invalid arguments/);
    expect(r.text).toMatch(/params/);
  });
});

describe("analyze_second_order", () => {
  /** |v - expected| relative to the eigenvalue's own modulus (never to an absolute 1). */
  const relClose = (v: number, expected: number, modulus: number, tol = 1e-7) => Math.abs(v - expected) <= tol * modulus;

  it("x'' + x = 0: the reduction line comes first, one equilibrium (0, 0) center-or-weak-spiral with eigenvalues ±i", async () => {
    const r = await call("analyze_second_order", { equation: "x'' + x = 0", locale: "en" });
    expect(r.isError).toBeFalsy();
    expect(r.scene.kind).toBe("analyze_system");
    expect(r.scene.system?.f).toBe("y");
    expect(r.scene.system?.variables).toBeUndefined();
    expect(r.scene.secondOrder).toEqual({ equation: "x'' + x = 0", reduced: { f: "v", g: r.scene.system!.g } });
    expect(r.text.startsWith(`Second-order equation x'' + x = 0: let v = x'. Then x' = v, v' = ${r.scene.system!.g}.`)).toBe(true);
    expect(r.scene.equilibria).toHaveLength(1);
    const [origin] = r.scene.equilibria!;
    expect(Math.hypot(origin.at.x, origin.at.y)).toBeLessThan(1e-9);
    expect(origin.classification).toBe("center_or_weak_spiral");
    expect(origin.caveat).toBe("center");
    // λ = ±i: the Jacobian of a linear F by central differences is exact up to rounding.
    const ims = origin.eigenvalues.map((e) => e.im).sort((a, b) => a - b);
    expect(relClose(ims[0], -1, 1)).toBe(true);
    expect(relClose(ims[1], 1, 1)).toBe(true);
    for (const e of origin.eigenvalues) expect(Math.abs(e.re) <= 1e-7 * Math.hypot(e.re, e.im)).toBe(true);
    expect(r.scene.field?.samples).toHaveLength(400);
  });

  it("x'' + 0.5*x' + x = 0: stable spiral with λ = -1/4 ± i sqrt(15)/4 (from λ^2 + λ/2 + 1 = 0)", async () => {
    const r = await call("analyze_second_order", { equation: "x'' + 0.5*x' + x = 0", locale: "en" });
    expect(r.isError).toBeFalsy();
    expect(r.scene.equilibria).toHaveLength(1);
    const [origin] = r.scene.equilibria!;
    expect(origin.classification).toBe("stable_spiral");
    const modulus = 1; // |λ|^2 = det = 1
    const im = Math.sqrt(15) / 4; // 0.9682458365518543
    for (const e of origin.eigenvalues) {
      expect(relClose(e.re, -0.25, modulus)).toBe(true);
      expect(relClose(Math.abs(e.im), im, modulus)).toBe(true);
    }
  });

  it("the same equation with params c and k gives the same spiral and keeps the params in the scene", async () => {
    const r = await call("analyze_second_order", { equation: "x'' + c*x' + k*x = 0", params: { c: 0.5, k: 1 }, locale: "en" });
    expect(r.isError).toBeFalsy();
    expect(r.scene.system?.params).toEqual({ c: 0.5, k: 1 });
    expect(r.scene.equilibria![0].classification).toBe("stable_spiral");
    expect(relClose(r.scene.equilibria![0].eigenvalues[0].re, -0.25, 1)).toBe(true);
  });

  it("Van der Pol x'' - (1 - x^2)*x' + x = 0: unstable spiral at the origin, λ = 1/2 ± i sqrt(3)/2", async () => {
    const r = await call("analyze_second_order", { equation: "x'' - (1 - x^2)*x' + x = 0", xMin: -4, xMax: 4, xpMin: -4, xpMax: 4, locale: "en" });
    expect(r.isError).toBeFalsy();
    expect(r.scene.equilibria).toHaveLength(1);
    const [origin] = r.scene.equilibria!;
    expect(Math.hypot(origin.at.x, origin.at.y)).toBeLessThan(1e-8);
    expect(origin.classification).toBe("unstable_spiral");
    for (const e of origin.eigenvalues) {
      expect(relClose(e.re, 0.5, 1)).toBe(true);
      expect(relClose(Math.abs(e.im), Math.sqrt(3) / 2, 1)).toBe(true);
    }
  });

  it("pendulum x'' = -sin(x) on [-4, 4] x [-3, 3]: (0, 0) center-or-weak-spiral, (±π, 0) saddles", async () => {
    const r = await call("analyze_second_order", { equation: "x'' = -sin(x)", xMin: -4, xMax: 4, xpMin: -3, xpMax: 3, locale: "en" });
    expect(r.isError).toBeFalsy();
    expect(r.scene.secondOrder?.equation).toBe("x'' = -sin(x)");
    const eq = r.scene.equilibria!;
    expect(eq).toHaveLength(3);
    const at = (x: number) => eq.find((e) => Math.abs(e.at.x - x) < 1e-6 && Math.abs(e.at.y) < 1e-6);
    expect(at(0)?.classification).toBe("center_or_weak_spiral");
    expect(at(Math.PI)?.classification).toBe("saddle");
    expect(at(-Math.PI)?.classification).toBe("saddle");
  });

  it("zh: the reduction sentence is Chinese and shows the reduced g", async () => {
    const r = await call("analyze_second_order", { equation: "x'' + x = 0", locale: "zh" });
    expect(r.isError).toBeFalsy();
    expect(r.scene.locale).toBe("zh");
    expect(r.text.startsWith(`二阶方程 x'' + x = 0：令 v = x'，则 x' = v，v' = ${r.scene.secondOrder!.reduced.g}。`)).toBe(true);
    expect(r.text).toContain("中心或弱螺旋");
  });

  it("refuses x''^2 = x and x'' + y = 0 with readable isError results", async () => {
    const nonlinear = await call("analyze_second_order", { equation: "x''^2 = x", locale: "en" });
    expect(nonlinear.isError).toBe(true);
    expect(nonlinear.text).toMatch(/x'' must appear linearly/);
    const y = await call("analyze_second_order", { equation: "x'' + y = 0", locale: "en" });
    expect(y.isError).toBe(true);
    expect(y.text).toMatch(/y has no meaning here/);
    expect(y.text).toMatch(/the variables are t \(the independent variable\), x and x'/);
    const noEquals = await call("analyze_second_order", { equation: "x'' + x", locale: "en" });
    expect(noEquals.isError).toBe(true);
    expect(noEquals.text).toMatch(/right-hand side F of x'' = F/);
  });

  it("the equation length cap is 200 characters", async () => {
    const long = "x'' + " + "x+".repeat(100) + "1 = 0";
    const r = await call("analyze_second_order", { equation: long, locale: "en" });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/equation/);
  });

  it("(1 + t^2)*x'' = -x: the t in the coefficient survives the reduction, so the system is non-autonomous and no equilibrium is claimed (review J-C.1)", async () => {
    // x'' = -x / (1 + t^2): the field is (y, -x / (1 + t^2)); at t = 2 the second component is -x/5.
    const r = await call("analyze_second_order", { equation: "(1 + t^2)*x'' = -x", density: 5, t: 2, locale: "en" });
    expect(r.isError).toBeFalsy();
    expect(r.scene.secondOrder?.reduced.g).toMatch(/\bt\b/);
    expect(r.scene.system?.g).toMatch(/\bt\b/);
    expect(r.scene.timeDependent?.snapshotT).toBe(2);
    expect(r.scene.equilibria).toBeUndefined();
    expect(r.text).not.toMatch(/\n1\. /);
    for (const s of r.scene.field!.samples) {
      expect(s.v.x).toBe(s.at.y);
      expect(Math.abs(s.v.y - -s.at.x / 5) <= 1e-15 * Math.max(1e-300, Math.abs(s.at.x / 5))).toBe(true);
    }
  });

  it("the description tells the model the reduction is checked numerically at sample points over the box (review J-C.2)", async () => {
    const { tools } = await client.listTools();
    const t = tools.find((t) => t.name === "analyze_second_order")!;
    expect(t.description).toMatch(/checked numerically at sample points/);
    expect(t.description).toMatch(/viewing box/);
  });

  it("curly apostrophes from a phone keyboard are accepted: x’’ + x = 0 is x'' + x = 0 (review J-C.3)", async () => {
    const r = await call("analyze_second_order", { equation: "x’’ + x = 0", locale: "en" });
    expect(r.isError).toBeFalsy();
    expect(r.scene.secondOrder?.equation).toBe("x'' + x = 0");
    expect(r.scene.equilibria).toHaveLength(1);
  });

  it("x'' = -9.81/0.1*sin(x) is shown without a folded constant (review J-C.4)", async () => {
    const r = await call("analyze_second_order", { equation: "x'' = -9.81/0.1*sin(x)", locale: "en" });
    expect(r.isError).toBeFalsy();
    // The determinant line legitimately prints 98.1; the reduction and the system header must not fold the constant.
    expect(r.text).not.toMatch(/98\.10000000000001/);
    const [reduction, header] = r.text.split("\n");
    expect(reduction).toMatch(/9\.81 \/ 0\.1/);
    expect(reduction).not.toMatch(/98\.1/);
    expect(header).not.toMatch(/98\.1/);
  });

  // x'' = -x + x'/x' reduces to x' = y, y' = -x + y/y (the quotient is kept). F is undefined on
  // the whole line y = 0 and equals (y, 1 - x) elsewhere, so it has NO zero in its domain: the
  // derived expectation is no equilibrium at all. At HEAD the equilibrium search accepts the limit
  // point (1, ~1e-26) because y/y evaluates to 1 for every nonzero y; the point where the equation
  // is undefined is then classified. Recorded as an open question for the equilibria kernel.
  it.fails("x'' = -x + x'/x': no equilibrium is reported at (1, 0), where the equation is undefined (review J-C.4, kernel open question)", async () => {
    const r = await call("analyze_second_order", { equation: "x'' = -x + x'/x'", locale: "en" });
    expect(r.isError).toBeFalsy();
    expect(r.scene.secondOrder?.reduced.g).toMatch(/y\s*\/\s*y/);
    expect(r.scene.equilibria ?? []).toHaveLength(0);
  });

  it("x'' = -x + sin(t): the reduced system is non-autonomous, so the shared time-dependence branch runs before any equilibrium search and t selects the snapshot", async () => {
    // x' = y, y' = sin(t) - x: identical to the analyze_system case above, so the same derivation
    // applies (relative deviation at least 0.1975 on the default box). The reduction line still
    // comes first; then the snapshot note; no equilibrium, classification or eigenvalue is claimed.
    const at0 = await call("analyze_second_order", { equation: "x'' = -x + sin(t)", density: 5, locale: "en" });
    expect(at0.isError).toBeFalsy();
    expect(at0.scene.secondOrder?.equation).toBe("x'' = -x + sin(t)");
    expect(at0.scene.equilibria).toBeUndefined();
    expect(at0.scene.timeDependent?.snapshotT).toBe(0);
    expect(at0.scene.timeDependent!.maxRelDeviation).toBeGreaterThan(0.19);
    expect(at0.text.startsWith("Second-order equation x'' = -x + sin(t): let v = x'. Then x' = v, v' = ")).toBe(true);
    expect(at0.text).toContain(labels("en").tool.timeDependent.slice(0, 20));
    expect(at0.text).not.toMatch(/\n1\. /);
    expect(at0.text).not.toMatch(/eigenvalue/i);
    const at15 = await call("analyze_second_order", { equation: "x'' = -x + sin(t)", density: 5, t: 1.5, locale: "en" });
    // The snapshot time joins the probe times (J review C.5): the evidence at t = 1.5 is at least the t = 0 value.
    expect(at15.scene.timeDependent?.snapshotT).toBe(1.5);
    expect(at15.scene.timeDependent!.maxRelDeviation).toBeGreaterThanOrEqual(at0.scene.timeDependent!.maxRelDeviation);
    expect(at15.text).toContain("t = 1.5");
    const a = at0.scene.field!.samples, b = at15.scene.field!.samples;
    expect(a).toHaveLength(25);
    for (let i = 0; i < a.length; i++) {
      expect(b[i].at).toEqual(a[i].at);
      expect(b[i].v.x).toBe(a[i].v.x); // f = y does not depend on t
      expect(b[i].v.y - a[i].v.y).toBeCloseTo(Math.sin(1.5), 12);
    }
  });

  it("describes itself: when to use it, the notation, and that it shows the reduction", async () => {
    const { tools } = await client.listTools();
    const t = tools.find((t) => t.name === "analyze_second_order")!;
    expect(t.description).toMatch(/x'' = F\(t, x, x'\)/);
    expect(t.description).toMatch(/x'' \+ 0\.5\*x' \+ x = 0/);
    expect(t.description).toMatch(/Van der Pol/);
    expect(t.description).toMatch(/pendulum/);
    expect(t.description).toMatch(/straight apostrophes/);
    expect(t.description).toMatch(/reduction/);
    const props = t.inputSchema.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(["density", "equation", "locale", "params", "t", "xMin", "xMax", "xpMin", "xpMax"].sort());
    expect(t.inputSchema.required).toContain("equation");
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

  it("a non-autonomous system is traced from t = 0 and the summary says so; an autonomous one gets no such note", async () => {
    // x' = 0, y' = cos(t) from (0, 0): y(t) = sin t, so at t = 1 the point is (0, sin 1). Over
    // [0, 1] the speed |cos t| stays above cos 1 = 0.54, so no speed-based stop can fire.
    const r = await call("trace_trajectory", { f: "0", g: "cos(t)", x0: 0, y0: 0, direction: "forward", tSpan: 1, locale: "en" });
    expect(r.isError).toBeFalsy();
    const t = r.scene.trajectories![0];
    expect(t.status).toBe("completed");
    const end = t.points[t.points.length - 1];
    expect(end.x).toBe(0);
    expect(end.y).toBeCloseTo(Math.sin(1), 5);
    expect(r.scene.timeDependent?.snapshotT).toBe(0);
    expect(r.text).toContain("the curve starts at t = 0");
    const zh = await call("trace_trajectory", { f: "0", g: "cos(t)", x0: 0, y0: 0, direction: "forward", tSpan: 1, locale: "zh" });
    expect(zh.text).toContain("曲线从 t = 0 出发");
    const autonomous = await call("trace_trajectory", { f: "y", g: "-x", x0: 1, y0: 0, tSpan: 1, locale: "en" });
    expect(autonomous.scene.timeDependent).toBeUndefined();
    expect(autonomous.text).not.toMatch(/non-autonomous/);
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

  it("samples a non-autonomous field at the snapshot time t and adds the note; an autonomous field gets neither", async () => {
    // x' = t, y' = 0 at t = 2: every sample is (2, 0).
    const r = await call("sample_field", { f: "t", g: "0", density: 5, t: 2, locale: "en" });
    expect(r.isError).toBeFalsy();
    expect(r.scene.timeDependent?.snapshotT).toBe(2);
    expect(r.scene.field!.samples.every((s) => s.v.x === 2 && s.v.y === 0)).toBe(true);
    expect(r.scene.field!.maxMag).toBe(2);
    expect(r.text).toContain("snapshot at t = 2");
    expect(r.text).toContain(labels("en").tool.widgetDraws);
    // The note precedes the field line it explains (J review C.7), and the probe's evidence is reported.
    expect(r.text.indexOf("non-autonomous")).toBeLessThan(r.text.indexOf("Sampled the vector field"));
    expect(r.text).toContain(labels("en").tool.timeDependenceMeasured.split("{deviation}")[0]);
    const zh = await call("sample_field", { f: "t", g: "0", density: 5, locale: "zh" });
    expect(zh.scene.timeDependent?.snapshotT).toBe(0);
    expect(zh.text).toContain("t = 0 时刻的快照");
    expect(zh.text.indexOf("非自治")).toBeLessThan(zh.text.indexOf("采样了向量场"));
    // No change measured at the sampled times (0*t): the evidence says so, the verdict still stands.
    const noChange = await call("sample_field", { f: "0*t + y", g: "-x", density: 5, locale: "en" });
    expect(noChange.scene.timeDependent?.snapshotT).toBe(0);
    expect(noChange.text).toContain(labels("en").tool.timeDependenceNoChange);
    // A domain that moves with t: the evidence names it instead of printing a number.
    const moving = await call("sample_field", { f: "y", g: "-x*sqrt(t - 5)", density: 5, t: 10, locale: "en" });
    expect(moving.text).toContain(labels("en").tool.timeDependenceDomainMoves);
    const autonomous = await call("sample_field", { f: "x", g: "y", density: 5, t: 2, locale: "en" });
    expect(autonomous.scene.timeDependent).toBeUndefined();
    expect(autonomous.text).not.toMatch(/non-autonomous/);
  });

  it("the snapshot time t reaches the sampled field: g(t = 1.5) - g(t = 0) = sin 1.5 at every sample of y' = -x + sin(t)", async () => {
    const at0 = await call("sample_field", { f: "y", g: "-x + sin(t)", density: 5, locale: "en" });
    const at15 = await call("sample_field", { f: "y", g: "-x + sin(t)", density: 5, t: 1.5, locale: "en" });
    expect(at15.scene.timeDependent?.snapshotT).toBe(1.5);
    expect(at15.text).toContain("t = 1.5");
    const a = at0.scene.field!.samples, b = at15.scene.field!.samples;
    expect(a).toHaveLength(25);
    for (let i = 0; i < a.length; i++) {
      expect(b[i].at).toEqual(a[i].at);
      expect(b[i].v.x).toBe(a[i].v.x);
      expect(b[i].v.y - a[i].v.y).toBeCloseTo(Math.sin(1.5), 12);
    }
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
    expect(r.text).toContain("没有常数解（右端含有 t，方程不是自治的；");
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

describe("truncated lists are said in full sentences (J.5b)", () => {
  it("analyze_system: 121 lattice equilibria against the default cap of 30", async () => {
    const r = await call("analyze_system", { f: "sin(pi*x)", g: "sin(pi*y)", xMin: -5, xMax: 5, yMin: -5, yMax: 5, locale: "en" });
    expect(r.isError).toBeFalsy();
    expect(r.scene.truncated).toBe(true);
    expect(r.scene.equilibria).toHaveLength(30);
    expect(r.scene.warning).toBe("hit_limit");
    expect(r.text).toContain(labels("en").ui.equilibriaTruncated.replace(/\{max\}/g, "30"));
    // The cap is said once: the truncation sentence carries the count, the bare hit_limit line is not repeated.
    expect(r.text).not.toContain(labels("en").warning.hit_limit);
    expect(r.text.split("\n")[1]).toBe(labels("en").ui.equilibriaTruncated.replace(/\{max\}/g, "30"));
  });

  it("analyze_first_order: a line of singular points (M = y, N = y*t: every point of y = 0) is reported as a continuum in the scene and the text (J review C.7)", async () => {
    // M = N = 0 exactly on the line y = 0: the reduced system x' = N = y t, y' = -M = -y has the
    // whole t-axis as equilibria, so the search returns possible_continuum.
    for (const locale of ["en", "zh"] as const) {
      const r = await call("analyze_first_order", { M: "y", N: "y*t", xMin: -2, xMax: 2, yMin: -2, yMax: 2, locale });
      expect(r.isError, locale).toBeFalsy();
      expect(r.scene.firstOrder?.singularitiesWarning, locale).toBe("possible_continuum");
      expect(r.scene.firstOrder!.singularities!.every((p) => Math.abs(p.y) <= 1e-9), locale).toBe(true);
      expect(r.text, locale).toContain(labels(locale).ui.singularitiesContinuum);
    }
  });

  it("analyze_first_order: a continuum of singular points is truncated but still called a continuum", async () => {
    // M = -y, N = 0: x' = 0, y' = y, every point of the t-axis is singular; the cap is 20.
    const r = await call("analyze_first_order", { M: "-y", N: "0", xMin: -2, xMax: 2, yMin: -2, yMax: 2, locale: "zh" });
    expect(r.isError).toBeFalsy();
    expect(r.scene.firstOrder?.singularitiesTruncated).toBe(true);
    expect(r.scene.firstOrder?.singularities).toHaveLength(20);
    // [J-fix2] the truncation is stated once: by the full sentence, not also by the "(list truncated)" tag.
    expect(r.text).not.toContain(labels("zh").tool.truncated);
    const sentence = labels("zh").ui.singularitiesTruncated.replace(/\{max\}/g, "20");
    expect(r.text).toContain(sentence);
    expect(r.text.indexOf(sentence)).toBe(r.text.lastIndexOf(sentence));
  });
});

describe("[J-fix2] summary wording", () => {
  it("a Bernoulli fit with n = 0 (dy/dt = -1/t from M = y, N = y*t) is listed as ruled out by definition, never as a failed test, in both locales", async () => {
    for (const locale of ["en", "zh"] as const) {
      const L = labels(locale);
      const r = await call("analyze_first_order", { M: "y", N: "y*t", xMin: 0.5, xMax: 3, yMin: 0.5, yMax: 3, locale });
      expect(r.isError).toBeFalsy();
      const bernoulli = r.scene.firstOrder?.forms?.find((f) => f.form === "bernoulli");
      expect(bernoulli?.excluded).toBe(true);
      expect(bernoulli?.reason).toContain("n = 0");
      const excludedLine = r.text.split("\n").find((line) => line.startsWith(L.tool.formsExcludedLine.split("{list}")[0]));
      expect(excludedLine).toBeDefined();
      expect(excludedLine).toContain(L.form.bernoulli);
      expect(excludedLine).toContain("n = 0");
      const failedLine = r.text.split("\n").find((line) => line.startsWith(L.tool.formsInconsistentLine.split("{list}")[0]));
      expect(failedLine).toBeDefined();
      expect(failedLine).not.toContain(L.form.bernoulli);
    }
  });

  it("the non-autonomous trajectory sentence names the direction actually traced", async () => {
    const L = labels("en");
    const base = { f: "y", g: "-x + sin(t)", x0: 1, y0: 0, tSpan: 1 };
    // trace_trajectory always starts at t = 0; the sentences carry that number (P2 sweep: no hard-coded 0 in the label).
    const at0 = (template: string) => fill(template, { t0: "0" });
    const forward = await call("trace_trajectory", { ...base, direction: "forward", locale: "en" });
    expect(forward.text).toContain(at0(L.tool.tracedForward));
    expect(forward.text).not.toContain(at0(L.tool.tracedBackward));
    expect(forward.text).not.toContain(at0(L.tool.tracedBoth));
    const backward = await call("trace_trajectory", { ...base, direction: "backward", locale: "en" });
    expect(backward.text).toContain(at0(L.tool.tracedBackward));
    expect(backward.text).not.toContain(at0(L.tool.tracedForward));
    const both = await call("trace_trajectory", { ...base, direction: "both", locale: "zh" });
    expect(both.text).toContain(at0(labels("zh").tool.tracedBoth));
    expect(both.text).not.toContain("{traced}");
    // The no-change evidence sentence stands alone: it names no analysis "above".
    for (const locale of ["en", "zh"] as const) {
      expect(labels(locale).tool.timeDependenceNoChange).not.toMatch(/withheld|上述/);
    }
  });
});

describe("uniqueness failure and domain-edge constant solutions (J.2)", () => {
  it("dy/dt = sqrt(y): y = 0 is reported as a domain-edge line that solutions leave, with the uniqueness sentence right after it", async () => {
    // y range [-0.31, 1.2]: 0 is not a sample point (i = 82.12). ∂g/∂y = 1/(2 sqrt y) is unbounded: α = 1/2.
    const r = await call("analyze_first_order", { expr: "sqrt(y)", yMin: -0.31, yMax: 1.2, locale: "en" });
    expect(r.isError).toBeFalsy();
    const [s] = r.scene.firstOrder!.solutions;
    expect(s).toMatchObject({ y: 0, domainEdge: "above", stability: "edge_leave", uniqueness: { verdict: "unbounded", probesFailing: 7, probesTotal: 7, side: "above" } });
    expect(s.uniqueness!.exponent).toBeCloseTo(0.5, 6);
    const L = labels("en");
    const solutionLine = fill(L.tool.constantSolution, { y: "0", stability: stabilitySentence(L, s) });
    const sentence = fill(L.uniqueness.unbounded, { y: "0", alpha: "0.5" });
    expect(r.text).toContain(solutionLine);
    expect(r.text).toContain(sentence);
    expect(r.text.indexOf(sentence)).toBe(r.text.indexOf(solutionLine) + solutionLine.length + 1); // the very next line
    expect(r.text).not.toContain("semi-stable");
    const zh = await call("analyze_first_order", { expr: "sqrt(y)", yMin: -0.31, yMax: 1.2, locale: "zh" });
    expect(zh.text).toContain(stabilitySentence(labels("zh"), s));
    expect(zh.text).toContain("上方");
    expect(zh.text).toContain("Lipschitz 条件不成立");
  });

  it("dy/dt = -sqrt(y) is approached from the defined side", async () => {
    const r = await call("analyze_first_order", { expr: "-sqrt(y)", yMin: -0.31, yMax: 1.2, locale: "en" });
    expect(r.scene.firstOrder!.solutions[0]).toMatchObject({ y: 0, domainEdge: "above", stability: "edge_approach" });
    expect(r.text).toContain(stabilitySentence(labels("en"), r.scene.firstOrder!.solutions[0]));
    expect(r.text).toContain("defined only above this line");
  });

  it("dy/dt = 3*y^(2/3): a domain edge in this tool (a negative base with a fractional exponent is NaN), and the sentence and the tool description say how to get the real branch (review J)", async () => {
    const r = await call("analyze_first_order", { expr: "3*y^(2/3)", yMin: -2, yMax: 2, locale: "en" });
    expect(r.scene.firstOrder!.solutions[0]).toMatchObject({ y: 0, domainEdge: "above", stability: "edge_leave", uniqueness: { verdict: "unbounded" } });
    expect(r.scene.firstOrder!.solutions[0].uniqueness!.exponent).toBeCloseTo(1 / 3, 6);
    expect(r.text).toContain("abs(y)^(2/3)");
    const zh = await call("analyze_first_order", { expr: "3*y^(2/3)", yMin: -2, yMax: 2, locale: "zh" });
    expect(zh.text).toContain("abs(y)^(2/3)");
    const { tools } = await client.listTools();
    expect(tools.find((t) => t.name === "analyze_first_order")!.description).toMatch(/fractional power of a negative base is undefined/);
    // written with the real branch, the same equation is an interior cusp root, semi-stable
    const real = await call("analyze_first_order", { expr: "3*abs(y)^(2/3)", yMin: -2, yMax: 2, locale: "en" });
    expect(real.scene.firstOrder!.solutions[0]).toMatchObject({ y: 0, stability: "semi_stable", uniqueness: { verdict: "unbounded" } });
    expect(real.scene.firstOrder!.solutions[0].domainEdge).toBeUndefined();
  });

  it("a range on which the equation is undefined: autonomy is the static rule (no t in sqrt(y)), the sentence never says 'mentions t' (review J, FB)", async () => {
    const r = await call("analyze_first_order", { expr: "sqrt(y)", yMin: -4, yMax: -0.001, locale: "en" });
    expect(r.scene.firstOrder!.autonomous).toBe(true);
    expect(r.scene.firstOrder!.solutions).toEqual([]);
    expect(r.text).toContain(labels("en").tool.noConstantAutonomous);
    expect(r.text).not.toContain("mentions t, so");
    const zh = await call("analyze_first_order", { expr: "sqrt(y)", yMin: -4, yMax: -0.001, locale: "zh" });
    expect(zh.text).toContain(labels("zh").tool.noConstantAutonomous);
    // on y in [-4, 0] the line y = 0 is the only defined sample and it is reported, as a domain edge
    const edge = await call("analyze_first_order", { expr: "sqrt(y)", yMin: -4, yMax: 0, locale: "en" });
    expect(edge.scene.firstOrder!.solutions[0]).toMatchObject({ y: 0, domainEdge: "above", stability: "edge_leave" });
    expect(edge.scene.firstOrder!.autonomous).toBe(true);
    expect(edge.scene.firstOrder!.untestableReason).toBeUndefined();
    // t·sqrt(y) on the same range mentions t: non-autonomous by the static rule, line still found
    const tEdge = await call("analyze_first_order", { expr: "t*sqrt(y)", yMin: -4, yMax: 0, locale: "en" });
    expect(tEdge.scene.firstOrder!.autonomous).toBe(false);
    expect(tEdge.scene.firstOrder!.solutions[0]).toMatchObject({ y: 0, domainEdge: "above" });
  });

  it("says nothing about uniqueness for the logistic equation (bounded is not a proof, so it is not claimed)", async () => {
    const r = await call("analyze_first_order", { expr: "y*(1-y)", yMin: -1, yMax: 2, locale: "en" });
    expect(r.scene.firstOrder!.solutions.map((s) => s.uniqueness?.verdict)).toEqual(["bounded_at_tested_scales", "bounded_at_tested_scales"]);
    expect(r.scene.firstOrder!.solutions.every((s) => s.domainEdge === undefined)).toBe(true);
    expect(r.text).not.toMatch(/Lipschitz|uniqueness/);
  });

  it("analyze_system: x' = sqrt(|x|), y' = -y carries the uniqueness verdict at the origin and prints the sentence after the equilibrium line", async () => {
    const r = await call("analyze_system", { f: "sqrt(abs(x))", g: "-y", xMin: -2, xMax: 2, yMin: -2, yMax: 2, locale: "en" });
    expect(r.isError).toBeFalsy();
    expect(r.scene.equilibria).toHaveLength(1);
    const [e] = r.scene.equilibria!;
    expect(e.uniqueness).toMatchObject({ verdict: "unbounded", along: "x" });
    expect(e.uniqueness!.exponent).toBeCloseTo(0.5, 6);
    // The located root is within ~1e-16 of the origin; J-fix2 formatNumber prints that honestly
    // (only an exact 0 prints as 0), so the printed point is derived from the scene, not assumed.
    expect(Math.hypot(e.at.x, e.at.y)).toBeLessThan(1e-12);
    const point = formatPoint(e.at);
    const sentence = fill(labels("en").uniqueness.unboundedPoint, { point, alpha: "0.5" });
    expect(r.text).toContain(sentence);
    expect(r.text.indexOf(sentence)).toBeGreaterThan(r.text.indexOf(`1. Equilibrium ${point}`));
    // a smooth system stays silent and still carries the verdict
    const lin = await call("analyze_system", { f: "x", g: "-y", locale: "en" });
    expect(lin.scene.equilibria![0].uniqueness?.verdict).toBe("bounded_at_tested_scales");
    expect(lin.text).not.toMatch(/Lipschitz/);
  });

  it("trace_trajectory flags a curve through the non-unique origin and prints the sentence; a curve that misses it is not flagged", async () => {
    // Backward from (0.25, 0), x = ((1 + t)/2)² crosses the origin at t = -1; forward x only grows.
    const r = await call("trace_trajectory", { f: "sqrt(abs(x))", g: "-y", x0: 0.25, y0: 0, tSpan: 5, xMin: -2, xMax: 2, yMin: -2, yMax: 2, locale: "en" });
    expect(r.isError).toBeFalsy();
    const back = r.scene.trajectories!.find((t) => t.direction === "backward")!;
    const fwd = r.scene.trajectories!.find((t) => t.direction === "forward")!;
    expect(back.nonUnique).toBe(true);
    expect(fwd.nonUnique).toBeUndefined();
    const L = labels("en");
    expect(r.text).toContain(L.tool.nonUniqueTrajectory);
    expect(r.text.split("\n").filter((l) => l === L.tool.nonUniqueTrajectory)).toHaveLength(1);
    expect(r.text.indexOf(L.tool.nonUniqueTrajectory)).toBeGreaterThan(r.text.indexOf(L.tool.backward));
    // the harmonic oscillator never touches its (bounded) equilibrium: no flag, no sentence
    const osc = await call("trace_trajectory", { f: "y", g: "-x", x0: 1, y0: 0, tSpan: 1, locale: "en" });
    expect(osc.scene.trajectories!.every((t) => t.nonUnique === undefined)).toBe(true);
    expect(osc.text).not.toContain(L.tool.nonUniqueTrajectory);
  });
});

describe("constant-solution notes in the first-order summary (J-fix2)", () => {
  it("a line defined on part of the t range is listed with its probe count: sqrt(t)·y on t in [-3, 1]", async () => {
    const r = await call("analyze_first_order", { expr: "sqrt(t)*y", xMin: -3, xMax: 1, yMin: -1, yMax: 1, locale: "en" });
    expect(r.isError).toBeFalsy();
    expect(r.scene.firstOrder!.solutions.map((s) => [s.y, s.stability, s.probes])).toEqual([[0, "unstable", { usable: 2, total: 7 }]]);
    const L = labels("en");
    expect(r.text).toContain(fill(L.tool.constantSolution, { y: "0", stability: L.stability.unstable }));
    expect(r.text).toContain(fill(L.tool.constantSolutionProbes, { n: 2, total: 7 }));
    expect(r.text).not.toContain(L.tool.noConstantGeneral);
    const zh = await call("analyze_first_order", { expr: "sqrt(t)*y", xMin: -3, xMax: 1, yMin: -1, yMax: 1, locale: "zh" });
    expect(zh.text).toContain(fill(labels("zh").tool.constantSolutionProbes, { n: 2, total: 7 }));
    // with all 7 probes usable the note is absent
    const full = await call("analyze_first_order", { expr: "sqrt(t)*y", xMin: 0, xMax: 3, yMin: -1, yMax: 1, locale: "en" });
    expect(full.text).not.toContain("t values tried");
  });

  it("every first-order summary states the scan resolution, formatted to 2 significant digits", async () => {
    const r = await call("analyze_first_order", { expr: "y*(1-y)", yMin: -1, yMax: 2, locale: "en" });
    const L = labels("en");
    expect(r.scene.firstOrder!.resolution).toBe(3 / 400);
    expect(r.text).toContain(fill(L.tool.scanResolution, { dy: "0.0075" }));
    expect(constantSolutionNotices(L, r.scene.firstOrder!)).toEqual([fill(L.tool.scanResolution, { dy: "0.0075" })]);
    const zh = await call("analyze_first_order", { expr: "y*(1-y)", yMin: -1, yMax: 2, locale: "zh" });
    expect(zh.text).toContain("Δy = 0.0075");
  });

  it("an underflow plateau is announced once and never listed as a constant solution: exp(-y²) on [-30, 30]", async () => {
    const r = await call("analyze_first_order", { expr: "exp(-y^2)", yMin: -30, yMax: 30, locale: "en" });
    const L = labels("en");
    expect(r.scene.firstOrder!.solutions).toEqual([]);
    expect(r.scene.firstOrder!.zeroPlateaus).toHaveLength(2);
    expect(r.text).not.toContain("Constant solution");
    expect(r.text).toContain(L.tool.noConstantAutonomous);
    expect(r.text.split(L.tool.zeroPlateau)).toHaveLength(2);
    expect(r.text).toContain(fill(L.tool.scanResolution, { dy: "0.15" }));
    const zh = await call("analyze_first_order", { expr: "exp(-y^2)", yMin: -30, yMax: 30, locale: "zh" });
    expect(zh.text).toContain(labels("zh").tool.zeroPlateau);
    expect(zh.text).not.toContain("常数解 y");
  });

  it("an all-zero scan of an underflowing factor still finds y = 0 of y·exp(-100 y²) on [-1000, 1000]; dy/dt = 0 is identically zero (FB)", async () => {
    const r = await call("analyze_first_order", { expr: "y*exp(-100*y^2)", yMin: -1000, yMax: 1000, locale: "en" });
    const L = labels("en");
    // Autonomy is the static rule: no t. The samples underflowed, so this is not 'identically zero'.
    expect(r.scene.firstOrder!.autonomous).toBe(true);
    expect(r.scene.firstOrder!.identicallyZero).toBeUndefined();
    expect(r.text).toContain(fill(L.tool.constantSolution, { y: "0", stability: L.stability.unstable }));
    expect(r.text).not.toContain(L.tool.noConstantAutonomous);
    expect(r.text).toContain(L.tool.zeroPlateau);
    // dy/dt = 0: the right-hand side is identically zero; the dedicated sentence, no plateau note,
    // in both languages; the scene carries the flag.
    const zero = await call("analyze_first_order", { expr: "0", yMin: -1, yMax: 1, locale: "en" });
    expect(zero.scene.firstOrder!.identicallyZero).toBe(true);
    expect(zero.scene.firstOrder!.solutions).toEqual([]);
    expect(zero.text).toContain(L.tool.identicallyZero);
    expect(zero.text).not.toContain(L.tool.noConstantAutonomous);
    expect(zero.text).not.toContain(L.tool.noConstantAllZero);
    expect(zero.text).not.toContain(L.tool.zeroPlateau);
    const zh = await call("analyze_first_order", { expr: "0", yMin: -1, yMax: 1, locale: "zh" });
    expect(zh.text).toContain(labels("zh").tool.identicallyZero);
    expect(zh.text).not.toContain(labels("zh").tool.zeroPlateau);
    // the differential form with M ≡ 0
    const diff = await call("analyze_first_order", { M: "0", N: "1 + y^2", yMin: -1, yMax: 1, locale: "en" });
    expect(diff.scene.firstOrder!.identicallyZero).toBe(true);
    expect(diff.text).toContain(L.tool.identicallyZero);
    // a double root written in expanded form is listed (FB): y(1 - y) - 1/4 at 1/2, semi-stable
    const dbl = await call("analyze_first_order", { expr: "y*(1-y) - 0.25", yMin: -1, yMax: 2, locale: "en" });
    expect(dbl.scene.firstOrder!.solutions.length).toBe(1);
    expect(Math.abs(dbl.scene.firstOrder!.solutions[0].y - 0.5)).toBeLessThan(1.5e-8);
    expect(dbl.text).toContain(fill(L.tool.constantSolution, { y: "0.5", stability: L.stability.semi_stable }));
  });

  it("exp(-1/y²): y = 0 is listed with the plateau note (half-width 0.037) right after its line, on [-3, 3] and [-1e5, 1e5]", async () => {
    for (const [yMin, yMax] of [[-3, 3], [-1e5, 1e5]]) {
      const r = await call("analyze_first_order", { expr: "exp(-1/y^2)", yMin, yMax, locale: "en" });
      const L = labels("en");
      const [s] = r.scene.firstOrder!.solutions;
      expect(s).toMatchObject({ y: 0, stability: "semi_stable" });
      expect(s.plateauHalfWidth).toBeCloseTo(0.03663, 4);
      const line = fill(L.tool.constantSolution, { y: "0", stability: L.stability.semi_stable });
      const note = fill(L.tool.constantSolutionPlateau, { y: "0", w: "0.037" });
      expect(r.text).toContain(line);
      expect(r.text.indexOf(note)).toBe(r.text.indexOf(line) + line.length + 1);
    }
    const zh = await call("analyze_first_order", { expr: "exp(-1/y^2)", yMin: -3, yMax: 3, locale: "zh" });
    expect(zh.text).toContain(fill(labels("zh").tool.constantSolutionPlateau, { y: "0", w: "0.037" }));
  });

  it("the fractional-power hint appears only when the expression has a fractional power: y·log(y) and sqrt(1 - y²) get none, 3*y^(2/3) does", async () => {
    const log = await call("analyze_first_order", { expr: "y*log(y)", yMin: -1, yMax: 1, locale: "en" });
    expect(Object.is(log.scene.firstOrder!.solutions[0].y, 0)).toBe(true);
    expect(log.scene.firstOrder!.solutions[0]).toMatchObject({ domainEdge: "above", stability: "edge_approach" });
    expect(log.text).toContain("defined only above this line");
    expect(log.text).not.toContain("abs(y)^(2/3)");
    const circle = await call("analyze_first_order", { expr: "sqrt(1 - y^2)", yMin: -2, yMax: 2, locale: "zh" });
    expect(circle.scene.firstOrder!.solutions.map((s) => [s.y, s.domainEdge])).toEqual([[-1, "above"], [1, "below"]]);
    expect(circle.text).not.toContain("abs(y)^(2/3)");
    const frac = await call("analyze_first_order", { expr: "3*y^(2/3)", yMin: -2, yMax: 2, locale: "en" });
    expect(frac.text).toContain(labels("en").tool.fractionalPowerHint);
  });

  it("the stability sign is read next to the root: (y - 1)(y - 1 - 1e-5) on [-100, 100] prints y = 1 stable and y = 1.00001 unstable", async () => {
    const r = await call("analyze_first_order", { expr: "(y - 1)*(y - 1 - 1e-5)", yMin: -100, yMax: 100, locale: "en" });
    expect(r.text).toContain("Constant solution y = 1: stable");
    expect(r.text).toContain("Constant solution y = 1.00001: unstable");
    expect(r.text).not.toContain("semi-stable");
  });
});

describe("Phase J results are exposed in the Scene and the summary, in both locales (L.2)", () => {
  // Every case below reuses a kernel test case (lib/core/equilibria.test.ts, slope-field.test.ts)
  // whose verdict was derived there; here only the exposure through the tool is checked.
  it("analyze_system: a direction-dependent singularity is carried as singularPoints and printed as the singular-point line, never as an equilibrium", async () => {
    for (const locale of ["en", "zh"] as const) {
      const r = await call("analyze_system", { f: "x*y/(x^2 + y^2)", g: "y - x", xMin: -2, xMax: 2, yMin: -2, yMax: 2, locale });
      expect(r.isError, locale).toBeFalsy();
      expect(r.scene.equilibria, locale).toEqual([]);
      expect(r.scene.warning, locale).toBe("none_found");
      expect(r.scene.singularPoints, locale).toHaveLength(1);
      const L = labels(locale);
      expect(r.text, locale).toContain(L.warning.none_found);
      expect(r.text, locale).toContain(fill(L.tool.singularPoint, { point: formatPoint(r.scene.singularPoints![0]) }));
    }
  });

  it("analyze_system: the underflow plateau of x' = y, y' = 2^x on [-1e4, 1e4]² is a flag on the scene and one notice line", async () => {
    for (const locale of ["en", "zh"] as const) {
      const r = await call("analyze_system", { f: "y", g: "2^x", xMin: -1e4, xMax: 1e4, yMin: -1e4, yMax: 1e4, locale });
      expect(r.isError, locale).toBeFalsy();
      expect(r.scene.underflowPlateau, locale).toBe(true);
      expect(r.scene.equilibria, locale).toEqual([]);
      const L = labels(locale);
      expect(r.text.split("\n").filter((l) => l === L.tool.underflowPlateau), locale).toHaveLength(1);
    }
  });

  it("analyze_system: a field vanishing on a region (max(x - 1, 0), max(y - 1, 0)) carries region_of_equilibria and prints that warning, every listed point non-hyperbolic", async () => {
    for (const locale of ["en", "zh"] as const) {
      const r = await call("analyze_system", { f: "max(x - 1, 0)", g: "max(y - 1, 0)", xMin: -2, xMax: 2, yMin: -2, yMax: 2, locale });
      expect(r.isError, locale).toBeFalsy();
      expect(r.scene.warning, locale).toBe("region_of_equilibria");
      expect(r.scene.equilibria!.length, locale).toBeGreaterThan(0);
      for (const p of r.scene.equilibria!) expect(p.classification, locale).toBe("non_hyperbolic");
      expect(r.text, locale).toContain(labels(locale).warning.region_of_equilibria);
    }
  });

  it("analyze_system: the uniqueness sentence of an equilibrium (x' = sqrt(|x|), y' = -y) is printed in Chinese too, right after its line", async () => {
    const r = await call("analyze_system", { f: "sqrt(abs(x))", g: "-y", xMin: -2, xMax: 2, yMin: -2, yMax: 2, locale: "zh" });
    expect(r.isError).toBeFalsy();
    const [e] = r.scene.equilibria!;
    expect(e.uniqueness).toMatchObject({ verdict: "unbounded", along: "x" });
    const L = labels("zh");
    const sentence = fill(L.uniqueness.unboundedPoint, { point: formatPoint(e.at), alpha: "0.5" });
    const lines = r.text.split("\n");
    const at = lines.indexOf(sentence);
    expect(at).toBeGreaterThan(0);
    expect(lines[at - 1]).toContain(formatPoint(e.at));
  });

  it("trace_trajectory: the non-unique flag and its sentence are printed in Chinese too", async () => {
    const r = await call("trace_trajectory", { f: "sqrt(abs(x))", g: "-y", x0: 0.25, y0: 0, tSpan: 5, xMin: -2, xMax: 2, yMin: -2, yMax: 2, locale: "zh" });
    expect(r.isError).toBeFalsy();
    expect(r.scene.trajectories!.find((t) => t.direction === "backward")!.nonUnique).toBe(true);
    const L = labels("zh");
    expect(r.text.split("\n").filter((l) => l === L.tool.nonUniqueTrajectory)).toHaveLength(1);
    expect(r.text.indexOf(L.tool.nonUniqueTrajectory)).toBeGreaterThan(r.text.indexOf(L.tool.backward));
  });

  it("analyze_system: the truncated-equilibria sentence is printed in Chinese too, with the count", async () => {
    const r = await call("analyze_system", { f: "sin(pi*x)", g: "sin(pi*y)", xMin: -5, xMax: 5, yMin: -5, yMax: 5, locale: "zh" });
    expect(r.isError).toBeFalsy();
    expect(r.scene.truncated).toBe(true);
    expect(r.text.split("\n")[1]).toBe(labels("zh").ui.equilibriaTruncated.replace(/\{max\}/g, String(r.scene.equilibria!.length)));
    expect(r.text).not.toContain(labels("zh").warning.hit_limit);
  });

  it("analyze_first_order: dy/dt = 0 is identically zero: the flag, no solutions, the identically-zero sentence and the scan resolution", async () => {
    for (const locale of ["en", "zh"] as const) {
      const r = await call("analyze_first_order", { expr: "0", xMin: -1, xMax: 1, yMin: -1, yMax: 1, locale });
      expect(r.isError, locale).toBeFalsy();
      const fo = r.scene.firstOrder!;
      expect(fo.identicallyZero, locale).toBe(true);
      expect(fo.solutions, locale).toEqual([]);
      expect(fo.resolution, locale).toBe(2 / 400);
      const L = labels(locale);
      expect(r.text.split("\n").filter((l) => l === L.tool.identicallyZero), locale).toHaveLength(1);
      expect(r.text, locale).toContain(fill(L.tool.scanResolution, { dy: "0.005" }));
      expect(r.text, locale).not.toContain(L.tool.noConstantAutonomous);
    }
  });

  it("analyze_second_order: the Scene is an analyze_system scene with secondOrder, and the summary starts with the reduction line, in both locales", async () => {
    for (const locale of ["en", "zh"] as const) {
      const r = await call("analyze_second_order", { equation: "x'' + 0.5*x' + x = 0", locale });
      expect(r.isError, locale).toBeFalsy();
      expect(r.scene.kind, locale).toBe("analyze_system");
      expect(r.scene.secondOrder?.equation, locale).toBe("x'' + 0.5*x' + x = 0");
      // The kernel system keeps y for x'; the reduction shown to students writes it as v.
      expect(r.scene.secondOrder?.reduced.f, locale).toBe("v");
      expect(r.scene.system?.f, locale).toBe("y");
      expect(r.scene.secondOrder?.reduced.g, locale).toBe("-(0.5 * v + x)");
      expect(r.scene.system?.g, locale).toBe("-(0.5 * y + x)");
      const L = labels(locale);
      expect(r.text.split("\n")[0], locale).toBe(fill(L.tool.secondOrderReduced, { equation: "x'' + 0.5*x' + x = 0", g: r.scene.secondOrder!.reduced.g }));
    }
  });

  it("non-autonomous scenes carry the snapshot t and print the note with it in both locales (analyze_system, analyze_second_order, sample_field)", async () => {
    for (const locale of ["en", "zh"] as const) {
      const L = labels(locale);
      const sys = await call("analyze_system", { f: "y", g: "-x + sin(t)", t: 1.5, locale });
      expect(sys.scene.timeDependent?.snapshotT, locale).toBe(1.5);
      expect(sys.scene.equilibria, locale).toBeUndefined();
      expect(sys.text, locale).toContain(L.tool.timeDependent.slice(0, 12));
      expect(sys.text, locale).toContain("1.5");
      const second = await call("analyze_second_order", { equation: "x'' + x = cos(t)", t: 2, locale });
      expect(second.scene.timeDependent?.snapshotT, locale).toBe(2);
      expect(second.scene.secondOrder, locale).toBeTruthy();
      const field = await call("sample_field", { f: "t", g: "0", density: 5, t: 0.25, locale });
      expect(field.scene.timeDependent?.snapshotT, locale).toBe(0.25);
      expect(field.text, locale).toContain("0.25");
    }
  });
});

describe("query_solution (round N)", () => {
  it("preserves the first-order query equation and parameters for the widget in both locales", async () => {
    for (const locale of ["en", "zh"] as const) {
      for (const form of [
        { args: { mode: "first", expr: "a*y" }, spec: { kind: "explicit", g: "a*y", params: { a: 1 } }, equation: "dy/dt = a*y", style: "arrows" },
        { args: { mode: "diff", M: "-a*y", N: "1" }, spec: { kind: "differential", M: "-a*y", N: "1", params: { a: 1 } }, equation: "(-a*y) dt + (1) dy = 0", style: "segments" },
      ]) {
        const r = await call("query_solution", { ...form.args, params: { a: 1 }, t0: 0, y0: 1, tSpan: 1, target: { kind: "t", value: 0.5 }, locale });
        expect(r.isError).toBeFalsy();
        expect(r.scene.firstOrderSpec).toEqual(form.spec);
        expect(r.scene.firstOrder).toBeUndefined(); // A query has no constant-solution analysis to report.
        expect(r.scene.system?.variables).toBe("ty");
        expect(r.scene.fieldStyle).toBe(form.style);
        expect(r.scene.locale).toBe(locale);
        expect(r.text).toContain(form.equation);
        expect(r.scene.query!.hits[0].y).toBeCloseTo(Math.exp(0.5), 5);
      }
    }
  });

  it("flags first-order query curves through sqrt(y)'s non-unique line even outside the viewing box", async () => {
    for (const locale of ["en", "zh"] as const) {
      for (const form of [{ mode: "first", expr: "sqrt(y)" }, { mode: "diff", M: "-sqrt(y)", N: "1" }]) {
        const r = await call("query_solution", { ...form, t0: 0, y0: 2, xMin: -1, xMax: 1, yMin: 1, yMax: 4, tSpan: 4, target: { kind: "t", value: -3 }, locale });
        expect(r.isError).toBeFalsy();
        expect(r.scene.trajectories!.find((t) => t.direction === "backward")?.nonUnique).toBe(true);
        expect(r.scene.trajectories!.find((t) => t.direction === "forward")?.nonUnique).toBeUndefined();
        expect(r.text).toContain(labels(locale).tool.nonUniqueTrajectory);
      }
    }
  });

  it("its description starts with the call-first rule and names the value-at / time-when questions", async () => {
    const { tools } = await client.listTools();
    const q = tools.find((t) => t.name === "query_solution")!;
    expect(q.description!.startsWith("CALL THIS TOOL FIRST")).toBe(true);
    expect(q.description).toMatch(/value of the solution at some time/);
    expect(q.description).toMatch(/when does the solution reach some value/);
    expect(q.description).toMatch(/never evaluate that closed form mentally/);
    // Phase O.1: the USE THIS sentence says explicitly that such a question must call the tool and is
    // never answered from a closed form.
    expect(q.description).toMatch(/USE THIS for any 'value at a time' or 'when does it reach a value' question[^.]*must call this tool and is never answered from a closed form/);
    const props = q.inputSchema.properties as Record<string, unknown>;
    expect(Object.keys(props)).toEqual(expect.arrayContaining(["mode", "expr", "M", "N", "f", "g", "equation", "t0", "x0", "y0", "target", "tSpan", "xMin", "locale"]));
  });

  it("dy/dt = y from (0, 1): t = 2 gives y = e^2 and y = 2 gives t = ln 2 (first-order t is the coordinate)", async () => {
    // y = e^t: y(2) = e^2 = 7.38905609893065; y = 2 at t = ln 2 = 0.6931471805599453.
    const r = await call("query_solution", { mode: "first", expr: "y", t0: 0, y0: 1, target: { kind: "t", value: 2 } });
    expect(r.isError).toBeFalsy();
    expect(r.scene.kind).toBe("query_solution");
    expect(r.scene.system).toEqual({ f: "1", g: "y", variables: "ty" });
    expect(r.scene.start).toEqual({ x: 0, y: 1 });
    expect(r.scene.query!.target).toEqual({ kind: "t", value: 2 });
    expect(r.scene.query!.note).toBe("ok");
    expect(r.scene.query!.reached).toBe(true);
    expect(r.scene.query!.hits).toHaveLength(1);
    expect(Math.abs(r.scene.query!.hits[0].y - 7.38905609893065) / 7.38905609893065).toBeLessThan(1e-5);
    expect(r.scene.trajectories).toHaveLength(2);
    expect(r.scene.trajectories![0].stop).toBe("far");
    expect(r.text).toMatch(/^Solution of dy\/dt = y through \(t, y\) = \(0, 1\), asked for t = 2\./);
    // 6 decimals: e^2 = 7.389056 rounds to 7.389056, and the numerical value (within 1e-5 relative) to 7.38905 or 7.38906.
    // Round P2.1: a first-order hit is a point (t, y) known to the position error, with no parameter uncertainty after t.
    expect(r.text).toMatch(/\nt = 2, y = 7\.3890[56][0-9]* \(±[0-9.e-]+\)\n/);
    expect(r.text).toContain(labels("en").tool.queryAccuracy);
    expect(r.text).toMatch(/Forward \(t increasing\): reached t = [0-9.]+, end point \(t, y\) = \([0-9.]+, 60\), stopped after running 20 times beyond the entered range\./);
    expect(r.text).toMatch(/Backward \(t decreasing\): reached t = -20, end point \(t, y\) = \(-20, [0-9.e-]+\), integrated to the requested time\./);
    const s = await call("query_solution", { mode: "first", expr: "y", t0: 0, y0: 1, target: { kind: "y", value: 2 } });
    expect(s.scene.query!.hits).toHaveLength(1);
    expect(Math.abs(s.scene.query!.hits[0].x - 0.6931471805599453)).toBeLessThan(1e-6);
    expect(s.text).toMatch(/\nt = 0\.693147, y = /);
  });

  it("rejects x as a first-order target kind, x0 on a first-order equation, and a missing expression, readably", async () => {
    const x = await call("query_solution", { mode: "first", expr: "y", t0: 0, y0: 1, target: { kind: "x", value: 2 } });
    expect(x.isError).toBe(true);
    expect(x.text).toMatch(/coordinates t and y: use target\.kind 't'/);
    const x0 = await call("query_solution", { mode: "first", expr: "y", x0: 0, y0: 1, target: { kind: "t", value: 2 } });
    expect(x0.isError).toBe(true);
    expect(x0.text).toMatch(/not x0/);
    const missing = await call("query_solution", { mode: "system", f: "y", x0: 1, y0: 0, target: { kind: "t", value: 1 } });
    expect(missing.isError).toBe(true);
    expect(missing.text).toMatch(/mode 'system' needs `g`/);
    const noStart = await call("query_solution", { mode: "system", f: "y", g: "-x", y0: 0, target: { kind: "t", value: 1 } });
    expect(noStart.isError).toBe(true);
    expect(noStart.text).toMatch(/needs `x0`/);
    const xInFirst = await call("query_solution", { mode: "first", expr: "x*y", t0: 0, y0: 1, target: { kind: "t", value: 1 } });
    expect(xInFirst.isError).toBe(true);
    expect(xInFirst.text).toMatch(/write t instead of x/);
  });

  it("harmonic x' = y, y' = -x from (1, 0): x = 0 three times each way within tSpan 10, possibly more beyond", async () => {
    // Crossings at pi/2 + k pi: forward pi/2, 3pi/2, 5pi/2; backward -pi/2, -3pi/2, -5pi/2.
    const r = await call("query_solution", { mode: "system", f: "y", g: "-x", x0: 1, y0: 0, tSpan: 10, target: { kind: "x", value: 0 } });
    expect(r.isError).toBeFalsy();
    expect(r.scene.query!.note).toBe("possibly_more_beyond_span");
    const ts = r.scene.query!.hits.map((h) => h.t);
    expect(ts).toHaveLength(6);
    [-5, -3, -1, 1, 3, 5].forEach((k, i) => expect(Math.abs(ts[i] - (k * Math.PI) / 2)).toBeLessThan(1e-6));
    expect(r.text).toContain(labels("en").tool.queryMoreBeyond);
    expect(r.text).toMatch(/^Solution of the system x' = y, y' = -x with \(x\(0\), y\(0\)\) = \(1, 0\), asked for x = 0\./);
    expect(r.text).toMatch(/\nt = 1\.570796 \(±[0-9.e-]+\): \(x, y\) = \(-?[0-9.e-]+, -1\) \(±/);
    expect(r.scene.trajectories!.every((t) => t.status === "completed")).toBe(true);
  });

  it("logistic dy/dt = y(1 - y) from (0, 0.1) reaches y = 0.5 at t = ln 9, in both languages", async () => {
    for (const locale of ["en", "zh"] as const) {
      const r = await call("query_solution", { mode: "first", expr: "y*(1 - y)", t0: 0, y0: 0.1, target: { kind: "y", value: 0.5 }, locale });
      expect(r.isError, locale).toBeFalsy();
      expect(r.scene.locale).toBe(locale);
      expect(r.scene.query!.hits).toHaveLength(1);
      expect(Math.abs(r.scene.query!.hits[0].x - 2.1972245773362196), locale).toBeLessThan(1e-6);
      const L = labels(locale);
      expect(r.text).toContain(fill(L.tool.queryHeaderFirst, { equation: "dy/dt = y*(1 - y)", t0: "0", y0: "0.1", target: fill(L.tool.queryTargetY, { value: "0.5" }) }));
      expect(r.text).toContain(L.tool.queryAccuracy);
      expect(r.text).toContain(L.tool.forward);
      // ln 9 = 2.1972246 at 6 decimals, the numerical crossing within 1e-6 of it.
      if (locale === "zh") expect(r.text).toMatch(/t = 2\.19722[45]，y = /);
      else expect(r.text).toMatch(/t = 2\.19722[45], y = /);
    }
  });

  it("dy/dt = y^2 from (0, 1) never reaches t = 2: not reached, the forward run left the far box just below t = 1", async () => {
    // y = 1/(1 - t) reaches the far box's y = 60 (20 x the [-3, 3] range) at t = 59/60.
    const r = await call("query_solution", { mode: "first", expr: "y^2", t0: 0, y0: 1, tSpan: 2, target: { kind: "t", value: 2 } });
    expect(r.isError).toBeFalsy();
    expect(r.scene.query!.note).toBe("not_reached_in_span");
    expect(r.scene.query!.hits).toEqual([]);
    expect(r.scene.query!.reached).toBe(false);
    const forward = r.scene.trajectories![0];
    expect(forward.status).toBe("left_box");
    expect(Math.abs(forward.tEnd - 59 / 60)).toBeLessThan(0.01);
    expect(r.text).toContain(labels("en").tool.queryNotReached);
    expect(r.text).toMatch(/Forward \(t increasing\): reached t = 0\.98[0-9]*, end point \(t, y\) = \(0\.98[0-9]*, 60\), stopped after running 20 times beyond the entered range\./);
  });

  it("dy/dt = -y from (0, 1) never reaches y = -1: not reached, forward completed, backward left the far box", async () => {
    const r = await call("query_solution", { mode: "first", expr: "-y", t0: 0, y0: 1, target: { kind: "y", value: -1 } });
    expect(r.scene.query!.note).toBe("not_reached_in_span");
    expect(r.scene.trajectories![0].status).toBe("completed");
    expect(r.scene.trajectories![0].tEnd).toBe(20);
    expect(r.scene.trajectories![1].status).toBe("left_box");
  });

  it("kind t on a system is the time: the harmonic solution at t = pi is (-1, 0); beyond the span it is stopped_before_target", async () => {
    const r = await call("query_solution", { mode: "system", f: "y", g: "-x", x0: 1, y0: 0, tSpan: 10, target: { kind: "t", value: Math.PI } });
    expect(r.scene.query!.note).toBe("ok");
    expect(r.scene.query!.hits).toHaveLength(1);
    expect(Math.abs(r.scene.query!.hits[0].x + 1)).toBeLessThan(1e-6);
    expect(Math.abs(r.scene.query!.hits[0].y)).toBeLessThan(1e-6);
    // A time target lands on t exactly: no "(±0)" bracket after the time (P2 sweep).
    expect(r.text).toMatch(/\nt = 3\.141593: \(x, y\) = \(-1, -?[0-9.e-]+\) \(±/);
    const far = await call("query_solution", { mode: "system", f: "y", g: "-x", x0: 1, y0: 0, tSpan: 10, target: { kind: "t", value: 15 } });
    expect(far.scene.query!.note).toBe("stopped_before_target");
    expect(far.scene.query!.hits).toEqual([]);
    expect(far.text).toContain(labels("en").tool.queryStoppedBefore);
    expect(far.text).toMatch(/Forward \(t increasing\): reached t = 10, /);
    // Round P: t0 is never an alias of x0 (R.1 of the brief); without x0 a planar query is refused readably.
    const noX0 = await call("query_solution", { mode: "system", f: "y", g: "-x", t0: 1, y0: 0, tSpan: 10, target: { kind: "t", value: Math.PI } });
    expect(noX0.isError).toBe(true);
    expect(noX0.text).toMatch(/needs `x0`/);
    expect(noX0.text).toMatch(/t0 is the start time/);
    // t0 is the START TIME of a planar query: x' = 0, y' = t from (0, 0) at t0 = 1 has y(t) = (t^2 - 1)/2, so y(2) = 3/2.
    const late = await call("query_solution", { mode: "system", f: "0", g: "t", x0: 0, y0: 0, t0: 1, tSpan: 2, target: { kind: "t", value: 2 } });
    expect(late.isError).toBeFalsy();
    expect(late.scene.query!.hits).toHaveLength(1);
    expect(late.scene.query!.hits[0].t).toBe(2);
    expect(late.scene.query!.hits[0].y).toBeCloseTo(1.5, 8);
    expect(late.scene.timeDependent?.snapshotT).toBe(1);
    expect(late.text).toContain("with (x(1), y(1)) = (0, 0)");
    // The non-autonomous note starts the curve at the student's t0, not at a hard-coded 0.
    expect(late.text).toContain(fill(labels("en").tool.tracedBoth, { t0: "1" }));
  });

  it("mode second reduces the equation first and mode diff takes M and N", async () => {
    // x'' + x = 0 from x = 1, x' = 0: x = cos t, so x = 0 first at t = pi/2 (forward).
    const r = await call("query_solution", { mode: "second", equation: "x'' + x = 0", x0: 1, xp0: 0, tSpan: 2, target: { kind: "x", value: 0 } });
    expect(r.isError).toBeFalsy();
    expect(r.scene.secondOrder?.reduced.f).toBe("v");
    expect(r.text).toMatch(/^Second-order equation x'' \+ x = 0: /);
    expect(r.scene.query!.hits.map((h) => h.t)).toEqual([expect.closeTo(-Math.PI / 2, 6), expect.closeTo(Math.PI / 2, 6)]);
    // y dt - t dy = 0 is dy/dt = y/t: through (1, 1) the solution is y = t, so y = 2 at t = 2.
    const d = await call("query_solution", { mode: "diff", M: "y", N: "-t", t0: 1, y0: 1, tSpan: 5, target: { kind: "y", value: 2 } });
    expect(d.isError).toBeFalsy();
    expect(d.scene.fieldStyle).toBe("segments");
    expect(d.scene.query!.hits).toHaveLength(1);
    expect(Math.abs(d.scene.query!.hits[0].x - 2)).toBeLessThan(1e-6);
    expect(d.text).toMatch(/^Solution of \(y\) dt \+ \(-t\) dy = 0 through \(t, y\) = \(1, 1\), asked for y = 2\./);
  });

  it("a non-autonomous query continues through zero speed to the requested time", async () => {
    // y = sin t keeps moving after its turning point t = pi/2.
    const r = await call("query_solution", { mode: "system", f: "0", g: "cos(t)", x0: 0, y0: 0, tSpan: Math.PI, target: { kind: "t", value: 2 } });
    expect(r.isError).toBeFalsy();
    expect(r.scene.timeDependent).toBeTruthy();
    expect(r.text).not.toMatch(/approaching an equilibrium/);
    expect(r.text).toContain(labels("en").tool.timeDependentTrajectory.slice(0, 30));
    expect(Math.abs(r.scene.query!.hits[0].y - Math.sin(2))).toBeLessThan(1e-6);
    for (const leg of r.scene.trajectories!) {
      expect(leg.status).toBe("completed");
      expect(Math.abs(leg.tEnd)).toBeCloseTo(Math.PI, 12);
      expect(leg.points.at(-1)!.y).toBeCloseTo(0, 5);
    }
  });

  it("queries a non-autonomous solution starting at zero speed: x'=0, y'=t gives y(1)=0.5", async () => {
    for (const locale of ["en", "zh"] as const) {
      const r = await call("query_solution", { mode: "system", f: "0", g: "t", x0: 0, y0: 0, tSpan: 2, target: { kind: "t", value: 1 }, locale });
      expect(r.isError).toBeFalsy();
      expect(r.scene.query!.hits).toHaveLength(1);
      expect(r.scene.query!.hits[0].y).toBeCloseTo(0.5, 7);
      expect(r.scene.query!.reached).toBe(true);
      expect(r.scene.trajectories!.every((leg) => leg.status === "completed" && leg.steps > 0)).toBe(true);
      expect(r.text).not.toContain(labels(locale).status.reached_equilibrium);
    }
  });
});

describe("trace_trajectory over a non-autonomous system (round N.3 b)", () => {
  it("x' = 0, y' = cos(t) completes at its turning point and continues beyond it", async () => {
    for (const locale of ["en", "zh"] as const) {
      for (const tSpan of [Math.PI / 2, Math.PI]) {
        const r = await call("trace_trajectory", { f: "0", g: "cos(t)", x0: 0, y0: 0, direction: "forward", tSpan, locale });
        expect(r.isError, locale).toBeFalsy();
        expect(r.scene.timeDependent).toBeTruthy();
        const leg = r.scene.trajectories![0];
        expect(leg.status).toBe("completed");
        expect(leg.tEnd).toBeCloseTo(tSpan, 12);
        expect(leg.points.at(-1)!.y).toBeCloseTo(Math.sin(tSpan), 5);
        expect(r.text).not.toContain(labels(locale).tool.stoppedNonAutonomous);
        expect(r.text).not.toContain(labels(locale).status.reached_equilibrium);
      }
    }
  });
});

describe("[P1] second-order notation in the tools (the professor's correction: t is the independent variable, the second coordinate is x')", () => {
  /** A lone y (not part of a longer name and not the y of dy/dt) anywhere in a summary. */
  const loneY = (text: string) => /(^|[^A-Za-z0-9_'一-鿿])y(?![A-Za-z0-9_])/.test(text.replace(/dy\/dt/g, ""));

  it("analyze_second_order: the box is xMin/xMax/xpMin/xpMax, and the description says F(t, x, x'), (x, x'), no y, with the brief's examples", async () => {
    const { tools } = await client.listTools();
    const t = tools.find((t) => t.name === "analyze_second_order")!;
    const props = t.inputSchema.properties as Record<string, { description?: string }>;
    expect(Object.keys(props).sort()).toEqual(["density", "equation", "locale", "params", "t", "xMax", "xMin", "xpMax", "xpMin"]);
    expect(props.xpMin.description).toMatch(/x' range/);
    expect(props.equation.description).toMatch(/F\(t, x, x'\)/);
    expect(props.equation.description).toMatch(/t is the independent variable/);
    expect(t.title).toBe("Analyze a second-order equation x'' = F(t, x, x')");
    expect(t.description).toMatch(/independent variable is t/);
    expect(t.description).toMatch(/F\(t, x, x'\)/);
    expect(t.description).toMatch(/vertical axis is x' \(velocity\)/);
    expect(t.description).toMatch(/every point in the result is \(x, x'\)/);
    expect(t.description).toMatch(/never speak of y to the student/);
    expect(t.description).toMatch(/x'' = -x \+ cos\(t\)/);
    expect(t.description).toMatch(/x'' = \(1 - x\^2\)\*x' - x/);
    expect(t.description).toMatch(/snapshot at t = /);
    expect(t.description).not.toMatch(/F\(x, x'\)/);
    expect(t.description).not.toMatch(/y = x'/);
  });

  it("analyze_second_order: the summary names the ranges x and x', the points (x, x') = (...), and never a lone y, in both locales", async () => {
    for (const locale of ["en", "zh"] as const) {
      const r = await call("analyze_second_order", { equation: "x'' + 0.5*x' + x = 0", xpMin: -2, xpMax: 2, locale });
      expect(r.isError, locale).toBeFalsy();
      const L = labels(locale);
      const lines = r.text.split("\n");
      expect(lines[0], locale).toBe(fill(L.tool.secondOrderReduced, { equation: "x'' + 0.5*x' + x = 0", g: "-(0.5 * v + x)" }));
      expect(lines[1], locale).toBe(fill(L.tool.secondOrderHeader, { xMin: "-3", xMax: "3", xpMin: "-2", xpMax: "2" }));
      expect(r.text, locale).toContain(fill(L.tool.pointSecond, { point: "(0, 0)" }));
      expect(r.scene.box, locale).toEqual({ x: { min: -3, max: 3 }, y: { min: -2, max: 2 } });
      expect(r.scene.secondOrder, locale).toEqual({ equation: "x'' + 0.5*x' + x = 0", reduced: { f: "v", g: "-(0.5 * v + x)" } });
      expect(loneY(r.text), `${locale}: ${r.text}`).toBe(false);
    }
    const inverted = await call("analyze_second_order", { equation: "x'' + x = 0", xpMin: 1, xpMax: -1 });
    expect(inverted.isError).toBe(true);
    expect(inverted.text).toMatch(/xpMin \(1\) must be smaller than xpMax \(-1\)/);
  });

  it("analyze_second_order: a forced equation x'' = -x + cos(t) is a snapshot with the equation-flavored note, the field (v, F) and no equilibria, in both locales", async () => {
    for (const locale of ["en", "zh"] as const) {
      const r = await call("analyze_second_order", { equation: "x'' = -x + cos(t)", t: 1, density: 5, locale });
      expect(r.isError, locale).toBeFalsy();
      const L = labels(locale);
      expect(r.scene.timeDependent?.snapshotT, locale).toBe(1);
      expect(r.scene.equilibria, locale).toBeUndefined();
      expect(r.scene.secondOrder?.equation, locale).toBe("x'' = -x + cos(t)");
      expect(r.text, locale).toContain(L.tool.timeDependentSecond.slice(0, 16));
      expect(r.text, locale).toContain(locale === "en" ? "non-autonomous equation" : "非自治方程");
      expect(r.text, locale).not.toContain(locale === "en" ? "non-autonomous system" : "非自治系统");
      expect(r.text, locale).toContain("(v, -x + cos(t))");
      expect(r.text, locale).toContain(fill(L.tool.secondOrderHeader, { xMin: "-3", xMax: "3", xpMin: "-3", xpMax: "3" }));
      expect(loneY(r.text), `${locale}: ${r.text}`).toBe(false);
    }
  });

  it("analyze_second_order: y is refused with the y sentence, and v is accepted as x' and shown as x'", async () => {
    const y = await call("analyze_second_order", { equation: "x'' = y" });
    expect(y.isError).toBe(true);
    expect(y.text).toMatch(/y has no meaning here/);
    const v = await call("analyze_second_order", { equation: "x'' = -x - 0.5*v" });
    expect(v.isError).toBeFalsy();
    expect(v.scene.secondOrder?.equation).toBe("x'' = -x - 0.5*x'");
    expect(v.scene.secondOrder?.reduced.g).toBe("-x - 0.5 * v");
    expect(v.scene.equilibria![0].classification).toBe("stable_spiral");
  });

  it("query_solution mode second: x0 = x(t0), xp0 = x'(t0), the header and the hits read (x, x'), kind y is the velocity x'", async () => {
    const { tools } = await client.listTools();
    const q = tools.find((t) => t.name === "query_solution")!;
    const props = q.inputSchema.properties as Record<string, { description?: string }>;
    expect(Object.keys(props)).toEqual(expect.arrayContaining(["xp0", "xpMin", "xpMax", "t0", "x0", "y0"]));
    expect(q.description).toMatch(/x\(t0\) = x0, x'\(t0\) = xp0/);
    expect(q.description).toMatch(/\(t, x, x'\)/);
    for (const locale of ["en", "zh"] as const) {
      const L = labels(locale);
      // x'' + x = 0 from x(0) = 1, x'(0) = 0: x = cos t, so at t = pi the point is (x, x') = (-1, 0).
      const r = await call("query_solution", { mode: "second", equation: "x'' + x = 0", x0: 1, xp0: 0, tSpan: 4, target: { kind: "t", value: Math.PI }, locale });
      expect(r.isError, locale).toBeFalsy();
      expect(r.scene.query!.hits, locale).toHaveLength(1);
      expect(r.scene.query!.hits[0].x, locale).toBeCloseTo(-1, 6);
      expect(Math.abs(r.scene.query!.hits[0].y), locale).toBeLessThan(1e-6);
      expect(r.text.split("\n")[1], locale).toBe(fill(L.tool.queryHeaderSecond, { equation: "x'' + x = 0", t0: "0", x0: "1", xp0: "0", target: fill(L.tool.queryTargetT, { value: "3.1416" }) }));
      expect(r.text, locale).toContain("(x, x') = (-1, ");
      expect(loneY(r.text), `${locale}: ${r.text}`).toBe(false);
      // A target on the velocity: kind y means x' in the header.
      const vel = await call("query_solution", { mode: "second", equation: "x'' + x = 0", x0: 1, xp0: 0, tSpan: 4, target: { kind: "y", value: 0.5 }, locale });
      expect(vel.isError, locale).toBeFalsy();
      expect(vel.text, locale).toContain(fill(L.tool.queryTargetXp, { value: "0.5" }));
      expect(loneY(vel.text), `${locale}: ${vel.text}`).toBe(false);
    }
    // xp0 is required (y0 is still read as a fallback for the kernel's second coordinate); a differing y0 is refused.
    const missing = await call("query_solution", { mode: "second", equation: "x'' + x = 0", x0: 1, target: { kind: "t", value: 1 } });
    expect(missing.isError).toBe(true);
    expect(missing.text).toMatch(/needs `xp0`/);
    const fallback = await call("query_solution", { mode: "second", equation: "x'' + x = 0", x0: 1, y0: 0, tSpan: 4, target: { kind: "t", value: Math.PI } });
    expect(fallback.isError).toBeFalsy();
    expect(fallback.scene.start).toEqual({ x: 1, y: 0 });
    const both = await call("query_solution", { mode: "second", equation: "x'' + x = 0", x0: 1, xp0: 0, y0: 1, target: { kind: "t", value: 1 } });
    expect(both.isError).toBe(true);
    // The x' range may be given as xpMin / xpMax.
    const ranged = await call("query_solution", { mode: "second", equation: "x'' + x = 0", x0: 1, xp0: 0, xpMin: -2, xpMax: 2, tSpan: 4, target: { kind: "t", value: 1 } });
    expect(ranged.scene.box).toEqual({ x: { min: -3, max: 3 }, y: { min: -2, max: 2 } });
    const badRange = await call("query_solution", { mode: "second", equation: "x'' + x = 0", x0: 1, xp0: 0, xpMin: 2, xpMax: -2, target: { kind: "t", value: 1 } });
    expect(badRange.isError).toBe(true);
    expect(badRange.text).toMatch(/xpMin \(2\) must be smaller than xpMax \(-2\)/);
  });

  it("query_solution mode second: t0 is the start time of a forced equation: x'' = t with x(1) = 0, x'(1) = 0 gives x(2) = 2/3, x'(2) = 3/2", async () => {
    // x'(t) = (t^2 - 1)/2 and x(t) = (t^3 - 1)/6 - (t - 1)/2: at t = 2 that is 3/2 and 7/6 - 1/2 = 2/3.
    const r = await call("query_solution", { mode: "second", equation: "x'' = t", x0: 0, xp0: 0, t0: 1, tSpan: 2, target: { kind: "t", value: 2 } });
    expect(r.isError).toBeFalsy();
    expect(r.scene.timeDependent?.snapshotT).toBe(1);
    expect(r.scene.query!.hits).toHaveLength(1);
    expect(r.scene.query!.hits[0].t).toBe(2);
    expect(r.scene.query!.hits[0].x).toBeCloseTo(2 / 3, 8);
    expect(r.scene.query!.hits[0].y).toBeCloseTo(1.5, 8);
    expect(r.text).toContain("with x(1) = 0, x'(1) = 0");
    // The second-order note speaks of the equation and starts the curve at t0 = 1.
    expect(r.text).toContain(labels("en").tool.timeDependentTrajectorySecond.slice(0, 30));
    expect(r.text).toContain(fill(labels("en").tool.tracedBoth, { t0: "1" }));
    expect(r.text).not.toContain("non-autonomous system");
  });
});

describe("[P2.1] a first-order picture never prints the kernel's integration parameter as t", () => {
  it("differential form y dt + 2 dy = 0 from (0, 1): dy/dt = -y/2, so the point at t = 2 is (2, e^-1); the parameter span 4 reaches t = ±8 (dt = 2 per unit of it) and the summary names two sides, no direction, no 't = 4'", async () => {
    for (const locale of ["en", "zh"] as const) {
      const L = labels(locale);
      const r = await call("query_solution", { mode: "diff", M: "y", N: "2", t0: 0, y0: 1, tSpan: 4, target: { kind: "t", value: 2 }, locale });
      expect(r.isError, locale).toBeFalsy();
      expect(r.scene.query!.hits, locale).toHaveLength(1);
      const [hit] = r.scene.query!.hits;
      expect(hit.x, locale).toBeCloseTo(2, 6);
      expect(hit.y, locale).toBeCloseTo(Math.exp(-1), 5);
      // The kernel's parameter at the hit is s = 1 (t = 2 s): a kernel fact that must not reach the student.
      expect(hit.t, locale).toBeCloseTo(1, 6);
      // The hit line is a point (t, y) known to the position error, without the parameter's uncertainty.
      expect(r.text, locale).toContain(fill(L.tool.queryHitFirst, { t: "2", y: formatNumber(hit.y, 6), error: formatNumber(hit.error.position, 2) }));
      // The legs: the kernel followed 4 units of its parameter each way, i.e. to t = 8 and t = -8.
      const legs = r.scene.trajectories!;
      expect(legs.map((l) => l.tEnd), locale).toEqual([4, -4]);
      expect(legs[0].points.at(-1)!.x, locale).toBeCloseTo(8, 5);
      expect(legs[1].points.at(-1)!.x, locale).toBeCloseTo(-8, 5);
      expect(r.text, locale).toContain(fill(L.tool.queryLegDiff, { side: L.tool.sideOne, end: formatPoint(legs[0].points.at(-1)!), status: L.tool.completedDiff }));
      expect(r.text, locale).toContain(fill(L.tool.queryLegDiff, { side: L.tool.sideOther, end: formatPoint(legs[1].points.at(-1)!), status: L.tool.completedDiff }));
      expect(r.text, locale).not.toContain(L.tool.forward);
      expect(r.text, locale).not.toContain(L.tool.backward);
      expect(r.text, locale).not.toContain(L.status.completed);
      expect(r.text, locale).not.toMatch(/t = -?4(?![.0-9])/);
      expect(r.text, locale).not.toMatch(/t = 1(?![.0-9])/);
    }
  });

  it("explicit form dy/dt = y from (0, 1): the legs report the t coordinate reached with the direction words, and the hit line carries no parameter uncertainty", async () => {
    for (const locale of ["en", "zh"] as const) {
      const L = labels(locale);
      const r = await call("query_solution", { mode: "first", expr: "y", t0: 0, y0: 1, tSpan: 2, target: { kind: "t", value: 2 }, locale });
      expect(r.isError, locale).toBeFalsy();
      const legs = r.scene.trajectories!;
      const forwardEnd = legs[0].points.at(-1)!;
      expect(forwardEnd.x, locale).toBeCloseTo(2, 6);
      expect(r.text, locale).toContain(fill(L.tool.queryLegFirst, { direction: L.tool.forward, t: "2", end: formatPoint(forwardEnd), status: L.status.completed }));
      expect(r.text, locale).toContain(fill(L.tool.queryLegFirst, { direction: L.tool.backward, t: "-2", end: formatPoint(legs[1].points.at(-1)!), status: L.status.completed }));
      expect(r.text, locale).not.toMatch(/t = 2 \(±|t = 2（±/);
      expect(r.text, locale).not.toContain(L.tool.completedDiff);
    }
  });
});

describe("[P2 sweep] what Claude reads: axes, the kernel clock, the t range, the descriptions", () => {
  it("every visual tool's Scene carries axes naming the kernel's fields for the student", async () => {
    const planar = await call("analyze_system", { f: "y", g: "-x", density: 5 });
    expect(planar.scene.axes).toEqual({ x: "x", y: "y", t: "t" });
    expect((await call("trace_trajectory", { f: "y", g: "-x", x0: 1, y0: 0, tSpan: 1 })).scene.axes).toEqual({ x: "x", y: "y", t: "t" });
    expect((await call("sample_field", { f: "y", g: "-x", density: 5 })).scene.axes).toEqual({ x: "x", y: "y", t: "t" });
    expect((await call("analyze_first_order", { expr: "y", density: 5 })).scene.axes).toEqual({ x: "t", y: "y", t: "t" });
    expect((await call("analyze_first_order", { M: "y", N: "2", density: 5 })).scene.axes).toEqual({ x: "t", y: "y", t: "parameter" });
    expect((await call("analyze_second_order", { equation: "x'' = -x", density: 5 })).scene.axes).toEqual({ x: "x", y: "x'", t: "t" });
    expect((await call("query_solution", { mode: "first", expr: "y", t0: 0, y0: 1, target: { kind: "t", value: 1 } })).scene.axes).toEqual({ x: "t", y: "y", t: "t" });
    expect((await call("query_solution", { mode: "diff", M: "y", N: "2", t0: 0, y0: 1, target: { kind: "t", value: 1 } })).scene.axes).toEqual({ x: "t", y: "y", t: "parameter" });
    expect((await call("query_solution", { mode: "second", equation: "x'' = -x", x0: 1, xp0: 0, target: { kind: "t", value: 1 } })).scene.axes).toEqual({ x: "x", y: "x'", t: "t" });
    expect((await call("query_solution", { mode: "system", f: "y", g: "-x", x0: 1, y0: 0, target: { kind: "t", value: 1 } })).scene.axes).toEqual({ x: "x", y: "y", t: "t" });
  });

  it("explicit first order: the kernel clock IS the student's t, so hits[].t equals the t coordinate and tEnd is a t (t0 = 1, dy/dt = y, y(3) = e^2)", async () => {
    // tSpan 4 from t0 = 1 reaches t = 5 forward and t = -3 backward, so the crossing t = 3 lies inside the span.
    const r = await call("query_solution", { mode: "first", expr: "y", t0: 1, y0: 1, tSpan: 4, target: { kind: "t", value: 3 } });
    expect(r.isError).toBeFalsy();
    expect(r.scene.query!.hits).toHaveLength(1);
    const [hit] = r.scene.query!.hits;
    expect(hit.x).toBeCloseTo(3, 9);
    expect(hit.t).toBeCloseTo(3, 9);
    expect(hit.y).toBeCloseTo(Math.exp(2), 4);
    expect(r.scene.trajectories!.map((l) => l.tEnd)).toEqual([5, -3]);
    // The hit line is a point (t, y): t = 3 with no bracket.
    expect(r.text).toMatch(/\nt = 3, y = 7\.3890[0-9]* \(±/);
  });

  it("the t range of a first-order picture is tMin / tMax (xMin / xMax still read), and an inverted one is refused by those names", async () => {
    const r = await call("analyze_first_order", { expr: "y*(1 - y)", tMin: 0, tMax: 6, yMin: -0.5, yMax: 2, density: 5 });
    expect(r.isError).toBeFalsy();
    expect(r.scene.box).toEqual({ x: { min: 0, max: 6 }, y: { min: -0.5, max: 2 } });
    expect(r.text).toContain("t ∈ [0, 6]");
    const old = await call("analyze_first_order", { expr: "y*(1 - y)", xMin: 0, xMax: 6, density: 5 });
    expect(old.scene.box!.x).toEqual({ min: 0, max: 6 });
    const bad = await call("analyze_first_order", { expr: "y", tMin: 5, tMax: 0 });
    expect(bad.isError).toBe(true);
    expect(bad.text).toMatch(/tMin \(5\) must be smaller than tMax \(0\)/);
    const q = await call("query_solution", { mode: "first", expr: "y", t0: 0, y0: 1, tMin: -1, tMax: 4, target: { kind: "t", value: 1 } });
    expect(q.scene.box!.x).toEqual({ min: -1, max: 4 });
    const qBad = await call("query_solution", { mode: "diff", M: "y", N: "2", t0: 0, y0: 1, tMin: 2, tMax: 1, target: { kind: "t", value: 1 } });
    expect(qBad.isError).toBe(true);
    expect(qBad.text).toMatch(/tMin \(2\) must be smaller than tMax \(1\)/);
  });

  it("the descriptions tell the model to relay the text, read axes, never quote system or keys; trace_trajectory is planar only; query_solution's box and expressions are per mode", async () => {
    const { tools } = await client.listTools();
    const by = Object.fromEntries(tools.map((t) => [t.name, t.description!]));
    for (const name of ["analyze_system", "analyze_second_order", "analyze_first_order", "trace_trajectory", "sample_field", "query_solution"]) {
      expect(by[name], name).toMatch(/`axes` field/);
      expect(by[name], name).toMatch(/never quote `system`/);
      expect(by[name], name).toMatch(/bounded_at_tested_scales/);
      expect(by[name], name).not.toMatch(/contains a "caveat"/);
    }
    expect(by.trace_trajectory).toMatch(/PLANAR SYSTEMS ONLY/);
    expect(by.trace_trajectory).toMatch(/use query_solution with mode first \/ diff \/ second/);
    expect(by.analyze_first_order).toMatch(/no estimating constant solutions/);
    expect(by.analyze_first_order).toMatch(/tMin < tMax/);
    expect(by.query_solution).toMatch(/EXPRESSION SYNTAX BY MODE/);
    expect(by.query_solution).toMatch(/tMin \/ tMax/);
    expect(by.query_solution).toMatch(/xpMin \/ xpMax the x' range/);
    expect(by.query_solution).toMatch(/the curve's own parameter/);
    const q = tools.find((t) => t.name === "query_solution")!;
    const props = q.inputSchema.properties as Record<string, { description?: string }>;
    expect(props.tSpan.description).toMatch(/NOT a t interval/);
    expect(Object.keys(props)).toEqual(expect.arrayContaining(["tMin", "tMax"]));
  });

  it("a differential-form query says the form has no direction, and the tool-only tSpan advice follows a stopped-before-target note only in the tool", async () => {
    for (const locale of ["en", "zh"] as const) {
      const L = labels(locale);
      // y = e^(-s) along the curve: 2 units of the parameter each way reach y = e^2 = 7.39 and e^-2, never 10.
      const r = await call("query_solution", { mode: "diff", M: "y", N: "2", t0: 0, y0: 1, tSpan: 2, target: { kind: "y", value: 10 }, locale });
      expect(r.text, locale).toContain(L.tool.differentialUndirected);
      expect(r.scene.query!.note, locale).toBe("not_reached_in_span");
      expect(r.text, locale).toContain(L.tool.queryNotReachedDiff);
      expect(r.text, locale).not.toContain(L.tool.queryNotReached);
    }
    const far = await call("query_solution", { mode: "system", f: "y", g: "-x", x0: 1, y0: 0, tSpan: 1, target: { kind: "t", value: 5 } });
    expect(far.scene.query!.note).toBe("stopped_before_target");
    expect(far.text).toContain(labels("en").tool.queryStoppedBefore);
    expect(far.text).toContain(labels("en").tool.queryStoppedBeforeTool);
    // The shared sentence itself no longer names the tool parameter.
    for (const locale of ["en", "zh"] as const) expect(labels(locale).tool.queryStoppedBefore).not.toContain("tSpan");
  });

  it("a differential form with a constant solution says how approach / leave were read; the summary of a second-order singular point names (x, x')", async () => {
    for (const locale of ["en", "zh"] as const) {
      const L = labels(locale);
      // y dt + 2 dy = 0: dy/dt = -y/2, so y = 0 is a stable constant solution.
      const r = await call("analyze_first_order", { M: "y", N: "2", yMin: -1, yMax: 1, density: 5, locale });
      expect(r.isError, locale).toBeFalsy();
      expect(r.scene.firstOrder!.solutions.map((s) => s.y), locale).toEqual([0]);
      expect(r.text, locale).toContain(L.tool.stabilityReadingDiff);
      const explicit = await call("analyze_first_order", { expr: "-y/2", yMin: -1, yMax: 1, density: 5, locale });
      expect(explicit.text, locale).not.toContain(L.tool.stabilityReadingDiff);
    }
  });
});
