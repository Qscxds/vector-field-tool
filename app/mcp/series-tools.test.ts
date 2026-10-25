/**
 * power_series and solution_formula through the real MCP protocol (SDK client + in-memory
 * transport), as app/mcp/tools.test.ts does for the visual tools. Every mathematical expectation is
 * derived by hand in the comment next to it (CLAUDE.md rule 7); the sentence templates come from
 * lib/labels, so a wording change there does not break these tests, a wrong number does.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeAll, describe, expect, it } from "vitest";
import { fill, labels } from "@/lib/labels";
import { SlidingWindowLimiter } from "./rate-limit";
import type { SeriesToolContent } from "./series-tools";
import { createMcpServer } from "./server";
import type { ToolDeps } from "./tools";

let client: Client;

async function connect(deps?: ToolDeps): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer("http://localhost:3000", deps);
  await server.connect(serverTransport);
  const c = new Client({ name: "series-tools-test", version: "0" });
  await c.connect(clientTransport);
  return c;
}

type Result = CallToolResult & { content_: SeriesToolContent; text: string };

/** Calls a tool; locale 'en' unless the test sets one (the schema default is tested separately). */
async function call(name: string, args: Record<string, unknown>, via: Client = client): Promise<Result> {
  const withLocale = "locale" in args ? args : { ...args, locale: "en" };
  const result = (await via.callTool({ name, arguments: withLocale })) as CallToolResult;
  const text = result.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  return { ...result, content_: (result.structuredContent ?? {}) as SeriesToolContent, text };
}

/** The literal part of a label template before its first placeholder. */
const head = (template: string) => template.split("{")[0];
/** A lone y (not part of a longer name and not the y of dy/dt) anywhere in a text (round P: no y on a second-order problem). */
const loneY = (text: string) => /(^|[^A-Za-z0-9_'一-鿿])y(?![A-Za-z0-9_])/.test(text.replace(/dy\/dt/g, ""));

beforeAll(async () => {
  client = await connect();
});

describe("registration", () => {
  it("both tools are listed without a UI resource, with the documented inputs and defaults", async () => {
    const { tools } = await client.listTools();
    for (const name of ["power_series", "solution_formula"]) {
      const t = tools.find((t) => t.name === name);
      expect(t, name).toBeTruthy();
      // Text tools: no widget, so no resource link (and no WIDGET_VERSION bump).
      expect(t!._meta, name).toBeUndefined();
      const props = t!.inputSchema.properties as Record<string, { enum?: string[]; default?: unknown; minimum?: number; maximum?: number; description?: string }>;
      const expected = ["equation", "expr", "locale", "mode", "params", "t0", "x0", "xp0", "y0", ...(name === "power_series" ? ["terms"] : [])].sort();
      expect(Object.keys(props).sort(), name).toEqual(expected);
      expect(props.mode.enum, name).toEqual(["first", "second"]);
      expect(props.t0.default, name).toBe(0);
      expect(props.locale.enum, name).toEqual(["zh", "en"]);
      expect(props.locale.default, name).toBe("en");
      expect(t!.inputSchema.required ?? [], name).toEqual(["mode"]);
      expect(props.y0.description, name).toMatch(/Default 1/);
      expect(props.x0.description, name).toMatch(/Default 1/);
      expect(props.xp0.description, name).toMatch(/Default 0/);
      expect(t!.annotations?.readOnlyHint, name).toBe(true);
    }
    const ps = tools.find((t) => t.name === "power_series")!;
    const terms = (ps.inputSchema.properties as Record<string, { default?: number; minimum?: number; maximum?: number }>).terms;
    expect([terms.minimum, terms.maximum, terms.default]).toEqual([1, 30, 8]);
  });

  it("the descriptions follow the call-first conventions for a TEXT tool: no picture, exact fractions, scope stated honestly", async () => {
    const { tools } = await client.listTools();
    const by = Object.fromEntries(tools.map((t) => [t.name, t.description!]));
    for (const name of ["power_series", "solution_formula"]) {
      const d = by[name];
      expect(d, name).toMatch(/^CALL THIS TOOL FIRST /);
      expect(d, name).toMatch(/Even when /);
      expect(d, name).toMatch(/call the tool, check your derivation against its exact results/);
      expect(d, name).toMatch(/Never answer from symbolic derivation alone\./);
      // the rule comes first, then what it computes, then when to use it
      expect(d.indexOf("Never answer from symbolic derivation alone."), name).toBeLessThan(d.indexOf("WHAT IT COMPUTES"));
      expect(d.indexOf("WHAT IT COMPUTES"), name).toBeLessThan(d.indexOf("USE THIS"));
      // there is no picture: the visual tools' tail must not be here
      expect(d, name).not.toMatch(/show the student the picture/);
      expect(d, name).toMatch(/draws no picture/);
      expect(d, name).toMatch(/Do NOT compute/);
      expect(d, name).toMatch(/caveat/);
      expect(d, name).toMatch(/word for word/);
      expect(d, name).toMatch(/'zh' when the question is in Chinese/);
      expect(d, name).toMatch(/defaults to en/);
      expect(d, name).not.toMatch(/REQUIRED/);
      // syntax of both modes: t*y for dy/dt = g(t, y), x*x' for a second-order equation
      expect(d, name).toMatch(/t\*y/);
      expect(d, name).toMatch(/x\*x'/);
      expect(d, name).toMatch(/dy\/dt = g\(t, y\)/);
      expect(d, name).toMatch(/x is rejected/);
      expect(d, name).toMatch(/y is rejected/);
      expect(d, name).not.toMatch(/dy\/dx/);
      expect(d, name).toMatch(/exact fractions/);
      expect(d, name).toMatch(/is NOT an error/);
    }
    expect(by.power_series).toMatch(/^CALL THIS TOOL FIRST for any question about a power-series/);
    expect(by.power_series).toMatch(/Even when you can derive the recurrence yourself/);
    expect(by.power_series).toMatch(/POLYNOMIALS in t/);
    expect(by.power_series).toMatch(/guaranteed LOWER bound/);
    expect(by.power_series).toMatch(/PROVEN to be a polynomial/);
    expect(by.power_series).toMatch(/does NOT expand that solution/);
    expect(by.solution_formula).toMatch(/^CALL THIS TOOL FIRST for any question about the solution formula/);
    expect(by.solution_formula).toMatch(/CONSTANT coefficients/);
    expect(by.solution_formula).toMatch(/exp, sin, cos, sinh, cosh of a linear argument/);
    expect(by.solution_formula).toMatch(/RESONANCE/);
    expect(by.solution_formula).toMatch(/use query_solution/);
  });
});

describe("power_series", () => {
  it("Airy x'' - t x = 0: a3 = (1/6)a0 and convergence for every t", async () => {
    // x = Σ a_n t^n: Σ (n+2)(n+1) a_{n+2} t^n - Σ a_{n-1} t^n = 0, so n = 0 gives 2 a2 = 0 and
    // n >= 1 gives a_{n+2} = a_{n-1} / ((n+2)(n+1)): a3 = a0 / 6, a6 = a3 / 30 = a0 / 180,
    // a4 = a1 / 12. The coefficient of x'' is the constant 1: no singular point, radius infinite.
    const r = await call("power_series", { mode: "second", equation: "x'' - t*x = 0" });
    expect(r.isError).toBeFalsy();
    expect(r.text).toContain("a₃ = (1/6)a₀");
    expect(r.text).toContain("a₄ = (1/12)a₁");
    expect(r.text).toContain("a₆ = (1/180)a₀");
    expect(r.text).toContain("converges for every t");
    expect(r.text.split("\n")[0]).toBe(fill(labels("en").series.seriesTitle, { t0: "0" }));
    // The default initial values x(0) = 1, x'(0) = 0 pick a0 = 1, a1 = 0: x = 1 + t³/6 + t⁶/180 + …
    expect(r.text).toContain("1 + (1/6)t³ + (1/180)t⁶ + …");
    expect(loneY(r.text), r.text).toBe(false);
    const sc = r.content_;
    expect(sc).toMatchObject({ kind: "power_series", locale: "en", mode: "second", status: "ok" });
    expect(sc.title).toBe(r.text.split("\n")[0]);
    expect(sc.steps.length).toBeGreaterThan(3);
    expect(sc.steps.every((s) => typeof s.title === "string" && s.lines.every((l) => typeof l === "string"))).toBe(true);
    expect(sc.steps.flatMap((s) => s.lines).join("\n")).toContain("a₃ = (1/6)a₀");
    expect(Array.isArray(sc.notes)).toBe(true);
    expect(sc.params).toBeUndefined();
  });

  it("Legendre l = 2: x1 = 1 - 3t² is a polynomial and the series converges at least for |t| < 1", async () => {
    // (1 - t²)x'' - 2t x' + 6x = 0: n = 0 gives 2 a2 + 6 a0 = 0, a2 = -3 a0; for n >= 2,
    // a_{n+2} = (n - 2)(n + 3) a_n / ((n + 2)(n + 1)), so a4 = 0 and x1 = 1 - 3t² ends there. The
    // leading coefficient 1 - t² vanishes at t = ±1, at distance 1 from t0 = 0.
    const r = await call("power_series", { mode: "second", equation: "(1-t^2)*x'' - 2*t*x' + 6*x = 0" });
    expect(r.isError).toBeFalsy();
    expect(r.text).toContain("x₁(t) = 1 − 3t²");
    expect(r.text).toContain("a₂ = −3a₀");
    expect(r.text).toContain("|t| < 1");
    expect(r.text).toContain(labels("en").series.radiusNote);
    expect(loneY(r.text), r.text).toBe(false);
  });

  it("dy/dt = 2ty (mode first): a1 = 0 and a2 = a0", async () => {
    // y = Σ a_n t^n: Σ (n+1) a_{n+1} t^n = 2 Σ a_{n-1} t^n, so n = 0 gives a1 = 0 and
    // a_{n+1} = 2 a_{n-1} / (n + 1): a2 = 2 a0 / 2 = a0, a4 = 2 a2 / 4 = a0 / 2.
    const r = await call("power_series", { mode: "first", expr: "2*t*y" });
    expect(r.isError).toBeFalsy();
    expect(r.text).toContain("a₂ = a₀");
    expect(r.text).toContain("a₄ = (1/2)a₀");
    expect(r.content_).toMatchObject({ kind: "power_series", mode: "first", status: "ok" });
  });

  it("terms is the highest power shown; t0 moves the expansion point", async () => {
    // Airy through t³ only: a3 = a0/6 is shown, a6 = a0/180 is not.
    const short = await call("power_series", { mode: "second", equation: "x'' - t*x = 0", terms: 3 });
    expect(short.isError).toBeFalsy();
    expect(short.text).toContain("a₃ = (1/6)a₀");
    expect(short.text).not.toContain("1/180");
    const tooMany = await call("power_series", { mode: "second", equation: "x'' - t*x = 0", terms: 31 });
    expect(tooMany.isError).toBe(true);
    expect(tooMany.text).toMatch(/terms/);
    // x'' + x = 0 about t0 = 1, s = t - 1: Σ (n+2)(n+1) a_{n+2} s^n + Σ a_n s^n = 0, a2 = -a0/2.
    const shifted = await call("power_series", { mode: "second", equation: "x'' + x = 0", t0: 1 });
    expect(shifted.isError).toBeFalsy();
    expect(shifted.text.split("\n")[0]).toBe(fill(labels("en").series.seriesTitle, { t0: "1" }));
    expect(shifted.text).toContain("a₂ = −(1/2)a₀");
    const far = await call("power_series", { mode: "second", equation: "x'' + x = 0", t0: 2e6 });
    expect(far.isError).toBe(true);
    expect(far.text).toMatch(/\|t0\| must be at most/);
  });

  it("a nonlinear equation is not an error: the text says the method needs a linear equation", async () => {
    // sin(x) is not linear in x, so no power series of this method exists for x'' + sin(x) = 0.
    for (const locale of ["en", "zh"] as const) {
      const L = labels(locale);
      const r = await call("power_series", { mode: "second", equation: "x'' + sin(x) = 0", locale });
      expect(r.isError, locale).toBeFalsy();
      expect(r.text, locale).toBe(fill(L.series.failNonlinear, { fragment: "sin(x)", u: "x" }));
      expect(r.content_, locale).toMatchObject({ kind: "power_series", locale, status: "unavailable", title: r.text, steps: [], notes: [] });
    }
    const en = await call("power_series", { mode: "second", equation: "x'' + sin(x) = 0" });
    expect(en.text).toMatch(/not linear in x/);
  });

  it("t x'' + x' + t x = 0 about 0: a regular singular point with the indicial equation r² = 0", async () => {
    // P2 = t vanishes at 0. p = P1/P2 = 1/t, q = P0/P2 = 1: t p = 1 and t² q = t² are analytic, so t = 0
    // is regular singular; p0 = 1, q0 = 0, indicial r(r - 1) + p0 r + q0 = r² = 0, a double root r = 0.
    const r = await call("power_series", { mode: "second", equation: "t*x'' + x' + t*x = 0" });
    expect(r.isError).toBeFalsy();
    expect(r.text.split("\n")[0]).toBe(fill(labels("en").series.singularTitle, { t0: "0" }));
    expect(r.text).toContain("regular singular point");
    expect(r.text).toContain("r² = 0");
    expect(r.content_.status).toBe("ok");
  });

  it("a non-polynomial coefficient is not an error: the text names the coefficient", async () => {
    // dy/dt = e^t y reads dy/dt - e^t y = 0: the coefficient of y is -e^t, not a polynomial in t.
    const r = await call("power_series", { mode: "first", expr: "exp(t)*y" });
    expect(r.isError).toBeFalsy();
    expect(r.text.startsWith(head(labels("en").series.seriesNotPolynomialCoefficient))).toBe(true);
    expect(r.content_.status).toBe("unavailable");
  });
});

describe("solution_formula", () => {
  it("[12, third round] the floating-point check of a large formula also stays inside the budget", async () => {
    // Twelve forcing frequencies against t^20: the check evaluated the formula thousands of times,
    // each converting every exact coefficient anew (15 s, then a normal answer).
    // A 500 ms budget (the property is the same; it keeps the suite light): it must end near it.
    const cosines = Array.from({ length: 12 }, (_, i) => `cos(${25000 + i}*t)`).join("+");
    const small = await connect({ budgetMs: 500 });
    const start = performance.now();
    const r = await call("solution_formula", { mode: "first", expr: `-y + t^20*(${cosines})` }, small);
    expect(performance.now() - start).toBeLessThan(1800);
    expect(r.isError || r.text.length > 0).toBe(true);
  });

  it("[12, second round] exact arithmetic on 16-digit frequencies against t^40 ends at once, inside the budget", async () => {
    // It used to run 21 s (and 148 s with nine frequencies) outside the 2 s budget and then answer.
    const small = await connect({ budgetMs: 500 });
    const start = performance.now();
    const r = await call("solution_formula", { mode: "second", equation: "x'' + pi*x' + e*x = t^40*(cos(pi*t)+cos(e*t))" }, small);
    expect(performance.now() - start).toBeLessThan(1800);
    expect(r.isError || r.text.includes(labels("en").series.tooExpensiveFormula), r.text).toBe(true);
  });

  it("x'' + 3x' + 2x = 0 with x(0) = 1, x'(0) = 0: x = 2e^-t - e^-2t, checked against the numerical solution", async () => {
    // r² + 3r + 2 = (r + 1)(r + 2): r = -1, -2. x = C1 e^-t + C2 e^-2t with C1 + C2 = 1 and
    // -C1 - 2 C2 = 0, so C2 = -1, C1 = 2.
    const r = await call("solution_formula", { mode: "second", equation: "x'' + 3*x' + 2*x = 0", x0: 1, xp0: 0 });
    expect(r.isError).toBeFalsy();
    expect(r.text).toContain("r² + 3r + 2 = 0");
    expect(r.text).toContain("C₁ = 2, C₂ = −1");
    expect(r.text).toContain("x(t) = 2e⁻ᵗ − e⁻²ᵗ");
    expect(r.text).toContain("Check:");
    // A homogeneous equation has no x_p: its check speaks of the basis terms.
    expect(r.text).toContain(head(labels("en").series.checkOkHomogeneous));
    expect(r.text).not.toContain("xₚ");
    expect(r.text).toContain(labels("en").series.dampingOver);
    expect(loneY(r.text), r.text).toBe(false);
    expect(r.content_).toMatchObject({ kind: "solution_formula", locale: "en", mode: "second", status: "ok" });
  });

  it("resonance: x'' + x = cos(t) with x(0) = x'(0) = 0 gives x = (1/2) t sin(t)", async () => {
    // ±i are the roots of r² + 1 and cos(t) = Re e^{it} solves the homogeneous equation, so the
    // trial is t(A cos t + B sin t): x_p'' + x_p = -2A sin t + 2B cos t = cos t, A = 0, B = 1/2.
    // x(0) = C1 = 0; x'(0) = C2 + x_p'(0) = C2 + 0 = 0, so C2 = 0 and x = (1/2) t sin t.
    const r = await call("solution_formula", { mode: "second", equation: "x'' + x = cos(t)", x0: 0, xp0: 0 });
    expect(r.isError).toBeFalsy();
    expect(r.text).toContain("(1/2)t sin(t)");
    expect(r.text).toContain("resonance");
    expect(r.text).toContain(head(labels("en").series.checkOk));
  });

  it("a coefficient that changes with t is not an error: the text says constant coefficients are needed", async () => {
    const r = await call("solution_formula", { mode: "second", equation: "x'' + t*x = 0" });
    expect(r.isError).toBeFalsy();
    expect(r.text.startsWith(head(labels("en").series.formulaNotConstant))).toBe(true);
    expect(r.text).toMatch(/needs constant coefficients/);
    expect(r.content_).toMatchObject({ kind: "solution_formula", status: "unavailable", steps: [] });
  });

  it("dy/dt = -2y + 4 with y(0) = 0: y = 2 - 2e^-2t, the first-order split", async () => {
    // y' + 2y = 4: r = -2, y_p = A with 2A = 4, A = 2; y(0) = C + 2 = 0, C = -2.
    const r = await call("solution_formula", { mode: "first", expr: "-2*y + 4", y0: 0 });
    expect(r.isError).toBeFalsy();
    expect(r.text).toContain("r = −2");
    expect(r.text).toContain("C = −2");
    expect(r.content_).toMatchObject({ kind: "solution_formula", mode: "first", status: "ok" });
  });

  it("parameters: the summary names their values, and the numbers enter the derivation", async () => {
    // b = 3, k = 2 is the equation x'' + 3x' + 2x = 0 above: the same constants and formula.
    const r = await call("solution_formula", { mode: "second", equation: "x'' + b*x' + k*x = 0", params: { b: 3, k: 2 }, x0: 1, xp0: 0 });
    expect(r.isError).toBeFalsy();
    const sentence = fill(labels("en").tool.paramsLine, { list: "b = 3, k = 2" });
    expect(r.text.split("\n")[1]).toBe(sentence);
    expect(r.content_.params).toBe(sentence);
    expect(r.text).toContain("x(t) = 2e⁻ᵗ − e⁻²ᵗ");
  });
});

describe("languages", () => {
  /** English sentence words that must not appear in a Chinese summary. */
  const english = /\b(the|is|and|of|for|with|series|coefficient|coefficients|point|solution|equation|converges|root|roots|check)\b/i;

  it("zh: every sentence of both tools is Chinese", async () => {
    for (const [name, args] of [
      ["power_series", { mode: "second", equation: "(1-t^2)*x'' - 2*t*x' + 6*x = 0" }],
      ["power_series", { mode: "first", expr: "2*t*y" }],
      ["solution_formula", { mode: "second", equation: "x'' + 3*x' + 2*x = 0", x0: 1, xp0: 0 }],
      ["solution_formula", { mode: "second", equation: "x'' + t*x = 0" }],
    ] as const) {
      const r = await call(name, { ...args, locale: "zh" });
      expect(r.isError, name).toBeFalsy();
      expect(r.content_.locale, name).toBe("zh");
      expect(r.text, name).toMatch(/[一-鿿]/);
      expect(r.text, `${name}: ${r.text}`).not.toMatch(english);
    }
    // the same mathematics in either language: x1 = 1 - 3t² for Legendre
    const zh = await call("power_series", { mode: "second", equation: "(1-t^2)*x'' - 2*t*x' + 6*x = 0", locale: "zh" });
    expect(zh.text).toContain("x₁(t) = 1 − 3t²");
  });

  it("locale is optional and defaults to en", async () => {
    for (const name of ["power_series", "solution_formula"]) {
      const r = (await client.callTool({ name, arguments: { mode: "second", equation: "x'' + 3*x' + 2*x = 0" } })) as CallToolResult;
      expect(r.isError, name).toBeFalsy();
      expect((r.structuredContent as SeriesToolContent).locale, name).toBe("en");
      const text = r.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
      expect(text, name).not.toMatch(/[一-鿿]/);
    }
  });
});

describe("input errors are isError results", () => {
  it("an equation that does not parse in its mode", async () => {
    for (const name of ["power_series", "solution_formula"]) {
      const broken = await call(name, { mode: "second", equation: "x'' +" });
      expect(broken.isError, name).toBe(true);
      expect(broken.text, name).toMatch(/^Invalid input: Cannot parse the equation: /);
      // x in a first-order equation: the parser's own hint (write t instead of x)
      const xInFirst = await call(name, { mode: "first", expr: "x*y" });
      expect(xInFirst.isError, name).toBe(true);
      expect(xInFirst.text, name).toMatch(/^Invalid input: Cannot parse expr/);
      expect(xInFirst.text, name).toMatch(/write t instead of x/);
      // y in a second-order equation is rejected, as analyze_second_order does
      const yInSecond = await call(name, { mode: "second", equation: "x'' + y = 0" });
      expect(yInSecond.isError, name).toBe(true);
    }
  });

  it("the 200-character cap on expr and equation", async () => {
    const long = "t+".repeat(101) + "1"; // 203 characters
    for (const name of ["power_series", "solution_formula"]) {
      const e = await call(name, { mode: "first", expr: long });
      expect(e.isError, name).toBe(true);
      expect(e.text, name).toContain("expr");
      const q = await call(name, { mode: "second", equation: `x'' = ${long}` });
      expect(q.isError, name).toBe(true);
      expect(q.text, name).toContain("equation");
    }
  });

  it("a field that does not match the mode, or a missing one", async () => {
    for (const name of ["power_series", "solution_formula"]) {
      const firstWithEquation = await call(name, { mode: "first", equation: "x'' + x = 0" });
      expect(firstWithEquation.isError, name).toBe(true);
      expect(firstWithEquation.text, name).toMatch(/mode 'first' takes `expr`/);
      const secondWithExpr = await call(name, { mode: "second", expr: "y" });
      expect(secondWithExpr.isError, name).toBe(true);
      expect(secondWithExpr.text, name).toMatch(/mode 'second' takes `equation`/);
      const both = await call(name, { mode: "first", expr: "y", equation: "x'' + x = 0" });
      expect(both.isError, name).toBe(true);
      const none = await call(name, { mode: "second" });
      expect(none.isError, name).toBe(true);
      expect(none.text, name).toMatch(/mode 'second' needs `equation`/);
      const y0InSecond = await call(name, { mode: "second", equation: "x'' + x = 0", y0: 1 });
      expect(y0InSecond.isError, name).toBe(true);
      expect(y0InSecond.text, name).toMatch(/x0.*xp0/);
      const xp0InFirst = await call(name, { mode: "first", expr: "y", xp0: 1 });
      expect(xp0InFirst.isError, name).toBe(true);
      expect(xp0InFirst.text, name).toMatch(/`y0`/);
      const badMode = await call(name, { mode: "system", expr: "y" });
      expect(badMode.isError, name).toBe(true);
    }
  });
});

describe("cost controls", () => {
  it("solution_formula: a budget spent during the numerical check is the budget's isError, never a silently missing check", async () => {
    // A clock that jumps 10 s at every reading: the first checkpoint of the reference integration
    // already sees the 2 s budget spent.
    let t = 0;
    const c = await connect({ budgetMs: 2000, now: () => (t += 10_000), limiter: new SlidingWindowLimiter(1000, 60_000) });
    const r = await call("solution_formula", { mode: "second", equation: "x'' + 3*x' + 2*x = 0", x0: 1, xp0: 0 }, c);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/exceeded its 2 s budget/);
    // power_series runs no integration, but its exact arithmetic is budgeted too: under this clock
    // the first checkpoint of the coefficient loop already sees the budget spent.
    const s = await call("power_series", { mode: "second", equation: "x'' - t*x = 0" }, c);
    expect(s.isError).toBe(true);
    expect(s.text).toMatch(/exceeded its 2 s budget/);
  });

  it("the shared limiter counts these calls too", async () => {
    let now = 0;
    const c = await connect({ limiter: new SlidingWindowLimiter(1, 1000), now: () => now });
    expect((await call("power_series", { mode: "first", expr: "y" }, c)).isError).toBeFalsy();
    const second = await call("solution_formula", { mode: "first", expr: "y" }, c);
    expect(second.isError).toBe(true);
    expect(second.text).toMatch(/Too many requests/);
  });
});
