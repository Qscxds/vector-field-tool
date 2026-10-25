/**
 * The two TEXT tools of round 12: `power_series` (the power series about t0 of a linear equation
 * with polynomial coefficients) and `solution_formula` (the split u = u_h + u_p of a linear
 * equation with constant coefficients). Both are lib/series-panel's computeSeriesPanel, the same
 * function the web shell's panel calls, so the steps a student reads on the page and the steps the
 * model relays are the same sentences (lib/labels' `series` section, both languages).
 *
 * They have NO widget and NO Scene: registered with the SDK's own registerTool, without a UI
 * resource, so adding them needs no widget version bump. The result is the derivation as plain
 * Unicode text, and the same derivation as plain strings in structuredContent.
 *
 * No mathematics here: lib/series does the exact arithmetic; this file only translates a tool call
 * into a panel computation and the derivation into a tool result.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { labels, paramsSentence, type Locale } from "@/lib/labels";
import { derivationText, type Derivation } from "@/lib/labels-series";
import { sceneParams } from "@/lib/params";
import type { SystemSpec } from "@/lib/core/types";
import { computeSeriesPanel, DEFAULT_SERIES_TERMS, MAX_SERIES_TERMS, MIN_SERIES_TERMS, type SeriesKind } from "@/lib/series-panel";
import type { SeriesMode } from "@/lib/series/equation";
import { plain } from "@/lib/series/notation";
import { BudgetExceeded } from "./budget";
import { CALL_FIRST_PREFIX, expression, guarded, LOCALE_RULE, localeSchema, paramsSchema, resolveDeps, ToolInputError, type ToolDeps } from "./tools";

// ---------- prompt fragments ----------

/**
 * The call-first tail of a text tool. The visual tools end their rule with "show the student the
 * picture"; these tools have none, so the model is told to relay the steps instead.
 */
const TEXT_TOOL_TAIL =
  "call the tool, check your derivation against its exact results, and give the student the tool's steps (this tool " +
  "draws no picture: its answer is the text). Never answer from symbolic derivation alone.";

/** What the model may not do itself, and the caveats it must pass on. */
const SERIES_NEVER_COMPUTE =
  "Do NOT compute any of this yourself: no recurrence, coefficient, characteristic root, trial solution, constant or " +
  "convergence interval from memory or mental arithmetic. Always call this tool and relay the text summary step by " +
  "step, word for word, with every caveat: a sentence saying where the series is guaranteed to converge (and that it " +
  "may converge further), that a point is singular, that a second solution with a logarithm is not expanded, that a " +
  "number entered as its 16-digit decimal, that a fraction is shown rounded, or that a check failed is read to the " +
  "student as written.";

/** Exactness: every number of the derivation is an exact fraction. */
const EXACTNESS_RULE =
  "Every coefficient is EXACT: the tool works with exact fractions (rational arithmetic, never rounded), so a3 = (1/6)a0 " +
  "is a fact, not an estimate. Exceptions, each stated in the summary: pi, e or a function value of a number enters as " +
  "the exact fraction of its 16-digit decimal; a number typed with more digits than a double keeps (or beyond its range) " +
  "is read as its nearest double; a fraction too long to print is shown rounded to 6 significant digits.";

/**
 * The input syntax of both tools: the expression rules of analyze_first_order (mode first) and of
 * analyze_second_order (mode second), restricted to what the exact methods can expand.
 */
const SERIES_SYNTAX =
  "Inputs: `mode` 'first' takes `expr`, the right-hand side g(t, y) of dy/dt = g(t, y), and the initial value y0 = y(t0); " +
  "mode 'second' takes `equation`, one second-order equation in x(t), and x0 = x(t0), xp0 = x'(t0) (the initial " +
  "velocity). Give exactly the expression field of the mode. " +
  "EXPRESSION SYNTAX. mode first: the only variables are t (the independent variable) and y (the unknown function); x is " +
  'rejected (write t instead); enter only the right-hand side g, never "dy/dt =". mode second: the notation of ' +
  "analyze_second_order: the unknown is x(t), its derivatives are written x' and x'' with straight apostrophes (v means " +
  "x'), t is the independent variable, y is rejected; either a full equation with exactly one = (x'' - t*x = 0, " +
  "(1 - t^2)*x'' - 2*t*x' + 6*x = 0, x'' + 3*x' + 2*x = 0) or just the right-hand side F of x'' = F. " +
  "Both modes: write multiplication explicitly: t*y and x*x', not ty or xx' (2*t and 2t are both fine). Powers use ^ " +
  "with whole-number exponents (t^2; a fractional power cannot be expanded here). The functions of t these exact methods " +
  "can expand are polynomials and exp, sin, cos, sinh, cosh of a linear argument a*t + b; constants pi and e. Any other " +
  'constant goes into "params" as a number (e.g. {"k": 4}) and is referenced by name.';

/** There is no Scene: what structuredContent is, and that the text is what the student hears. */
const SERIES_STRUCTURED_CONTENT_RULE =
  "This tool has no widget. Its structuredContent repeats the same derivation as plain strings (title, steps with their " +
  "lines, notes) for clients that lay it out; relay the TEXT summary, and never show the student its keys (kind, mode, " +
  "status).";

/** When the method does not apply, the answer is the explanation, not an error. */
const NOT_APPLICABLE_RULE =
  "When the method does not apply, the result is NOT an error: the summary is one sentence saying why (and what to use " +
  "instead), and that sentence is the answer to relay. Only an equation that does not parse (or a missing or mismatched " +
  "input) is an isError.";

const INITIAL_VALUES_RULE =
  "The last step uses the initial values (defaults y(t0) = 1; x(t0) = 1, x'(t0) = 0): pass the student's own values when " +
  "the problem gives them. When it gives none, the general solution is the split (with its free coefficients or " +
  "constants), and the step with the default values is only an example: say so.";

// ---------- schemas ----------

const coordinate = z.number().finite();
/** A cost cap of the public endpoint, the same bound as a box edge: the exact arithmetic expands about t0. */
const MAX_ABS_CENTER = 1e6;

const sharedShape = {
  mode: z.enum(["first", "second"]).describe("first: dy/dt = g(t, y), given as `expr`; second: one second-order equation in x(t), given as `equation`."),
  expr: expression
    .optional()
    .describe("mode first only: the right-hand side g(t, y) of dy/dt = g(t, y). The variables are t and y; x is rejected. Omit in mode second."),
  equation: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe("mode second only: the equation in x(t) as analyze_second_order takes it, e.g. x'' - t*x = 0 (derivatives x' and x''; t is the independent variable). Omit in mode first."),
  params: paramsSchema,
};

const initialShape = {
  y0: coordinate.optional().describe("mode first only: the initial value y(t0). Default 1."),
  x0: coordinate.optional().describe("mode second only: the initial position x(t0). Default 1."),
  xp0: coordinate.optional().describe("mode second only: the initial velocity x'(t0). Default 0."),
  locale: localeSchema,
};

type SeriesToolInput = {
  mode: SeriesMode;
  expr?: string;
  equation?: string;
  params?: Record<string, number>;
  t0: number;
  y0?: number;
  x0?: number;
  xp0?: number;
  locale: Locale;
};

// ---------- the result ----------

/** structuredContent of both tools: the derivation as plain strings, no Scene, no structured math. */
export type SeriesToolContent = {
  kind: "power_series" | "solution_formula";
  locale: Locale;
  mode: SeriesMode;
  status: "ok" | "unavailable";
  /** The derivation's title; on "unavailable" the sentence saying why the method does not apply. */
  title: string;
  steps: { title: string; lines: string[] }[];
  notes: string[];
  /** The parameter values the equation was computed with ("Parameter values: k = 2."), when it uses any. */
  params?: string;
};

const TOOL_NAME: Record<SeriesKind, SeriesToolContent["kind"]> = { series: "power_series", formula: "solution_formula" };

function plainDerivation(d: Derivation): Pick<SeriesToolContent, "title" | "steps" | "notes"> {
  return {
    title: plain(d.title),
    steps: d.steps.map((s) => ({ title: s.title, lines: s.lines.map(plain) })),
    notes: d.notes.map(plain),
  };
}

/** The text of the field the mode reads, after the exactly-one and mode checks. */
function equationText(input: SeriesToolInput): string {
  const hasExpr = typeof input.expr === "string";
  const hasEquation = typeof input.equation === "string";
  if (input.mode === "first") {
    if (hasEquation) throw new ToolInputError("mode 'first' takes `expr` (g of dy/dt = g(t, y)), not `equation`; for a second-order equation use mode 'second'.");
    if (!hasExpr) throw new ToolInputError("mode 'first' needs `expr`, the right-hand side g(t, y) of dy/dt = g(t, y).");
    if (typeof input.x0 === "number" || typeof input.xp0 === "number") throw new ToolInputError("mode 'first' takes the initial value as `y0` (y(t0)), not x0 / xp0.");
    return input.expr as string;
  }
  if (hasExpr) throw new ToolInputError("mode 'second' takes `equation` (an equation in x(t)), not `expr`; for dy/dt = g(t, y) use mode 'first'.");
  if (!hasEquation) throw new ToolInputError("mode 'second' needs `equation`, the second-order equation in x(t), e.g. x'' - t*x = 0.");
  if (typeof input.y0 === "number") throw new ToolInputError("mode 'second' takes the initial values as `x0` (x(t0)) and `xp0` (x'(t0)), not y0.");
  return input.equation as string;
}

/** The parameter values the equation uses, as the shared sentence of every tool summary (round T). */
function paramsLine(locale: Locale, mode: SeriesMode, text: string, params: Record<string, number> | undefined): string | null {
  if (!params) return null;
  const entries =
    mode === "first"
      ? sceneParams({ system: { f: "1", g: text, params, variables: "ty" } satisfies SystemSpec })
      : sceneParams({ system: { f: "y", g: "0", params }, secondOrder: { equation: text } });
  return paramsSentence(labels(locale), entries);
}

function run(kind: SeriesKind, input: SeriesToolInput & { terms?: number }, checkpoint: () => void): CallToolResult {
  const L = labels(input.locale);
  const mode = input.mode;
  const text = equationText(input);
  if (Math.abs(input.t0) > MAX_ABS_CENTER) throw new ToolInputError(`|t0| must be at most ${MAX_ABS_CENTER}.`);
  const initial: [number, number] = mode === "first" ? [input.y0 ?? 1, 0] : [input.x0 ?? 1, input.xp0 ?? 0];
  // lib/series/chart's reference integration catches every error, the budget's included, and then
  // returns no curve: watch the checkpoint so a spent budget is not mistaken for "no check".
  const budget: { spent: BudgetExceeded | null } = { spent: null };
  const watched = () => {
    try {
      checkpoint();
    } catch (error) {
      if (error instanceof BudgetExceeded) budget.spent = error;
      throw error;
    }
  };
  const result = computeSeriesPanel(L, {
    mode,
    text,
    ...(input.params ? { params: input.params } : {}),
    settings: { kind, terms: input.terms ?? DEFAULT_SERIES_TERMS, center: input.t0, initial },
    tRange: { min: input.t0 - 5, max: input.t0 + 5 },
    vRange: { min: -1e6, max: 1e6 },
    checkpoint: watched,
    // Text only: no chart, so the power series runs no reference integration at all.
    chart: false,
  });
  // The solution formula's last step is its check against the numerical solution: a check cut off by
  // the budget must not silently disappear. The exact arithmetic of both tools runs under the same
  // checkpoint, and a budget spent there propagates to guarded() as the budget's isError.
  if (budget.spent && kind === "formula") throw budget.spent;
  const base = { kind: TOOL_NAME[kind], locale: input.locale, mode };
  if (result.status === "off") throw new Error("the series panel is off although a kind was given");
  if (result.status === "unavailable") {
    // An equation that does not parse in its mode is an input error, as in every other tool; the
    // panel's own sentence for it points at the web page's message and is no answer for the model.
    // (The text is parsed once, inside the budget: computeSeriesPanel reports the parser's message.)
    if (result.parseMessage !== undefined) {
      throw new ToolInputError(mode === "first" ? `Cannot parse expr (g of dy/dt = g(t, y)): ${result.parseMessage}` : `Cannot parse the equation: ${result.parseMessage}`);
    }
    const message = plain(result.message);
    const content: SeriesToolContent = { ...base, status: "unavailable", title: message, steps: [], notes: [] };
    return { content: [{ type: "text", text: message }], structuredContent: content };
  }
  const values = paramsLine(input.locale, mode, text, input.params);
  const [title, ...rest] = derivationText(result.derivation).split("\n");
  const summary = [title, ...(values ? [values] : []), ...rest].join("\n");
  const content: SeriesToolContent = { ...base, status: "ok", ...plainDerivation(result.derivation), ...(values ? { params: values } : {}) };
  return { content: [{ type: "text", text: summary }], structuredContent: content };
}

// ---------- tools ----------

/** Registers power_series and solution_formula: text tools, no UI resource (no widget, no Scene). */
export function registerSeriesTools(server: McpServer, deps: ToolDeps = {}): void {
  const d = resolveDeps(deps);
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

  server.registerTool(
    "power_series",
    {
      title: "Power-series solution of a linear equation about t0",
      description:
        `${CALL_FIRST_PREFIX} for any question about a power-series (Taylor-series) solution of a concrete differential ` +
        "equation: the series about a point t0, its recurrence relation, its first coefficients, the split into two basis " +
        "series, where the series converges, or whether t0 is an ordinary, a regular singular or an irregular singular " +
        "point. Even when you can derive the recurrence yourself (Airy, Legendre and Hermite are exactly the cases you are " +
        "tempted to skip), " + TEXT_TOOL_TAIL + " " +
        "WHAT IT COMPUTES: for a LINEAR equation whose coefficients and right-hand side are POLYNOMIALS in t (a polynomial " +
        "denominator is cleared first), dy/dt = g(t, y) or one second-order equation in x(t), the power series about t0, " +
        "step by step: the equation as a linear equation, why t0 is an ordinary point, the ansatz and its term-by-term " +
        "derivatives, the substitution with the index shift, the coefficient of each power collected, the recurrence " +
        "relation, the first coefficients, the split x = a0 x1 + a1 x2 (+ xp, the part of a non-zero right-hand side; " +
        "y = a0 y1 (+ yp) for a first-order equation) through the chosen power, the interval of convergence, and the " +
        "series with the initial values. " + EXACTNESS_RULE + " A basis series that ends (Legendre's x1 = 1 - 3t^2, " +
        "Hermite's 1 - 2t^2) is PROVEN to be a polynomial from the recurrence, never guessed from the shown terms. The " +
        "interval of convergence is a guaranteed LOWER bound, from the distance to the nearest singular point (the zeros " +
        "of the leading coefficient, complex ones included): the series may converge on a larger interval, and the " +
        "summary says so; never present it as the exact radius. At a SINGULAR point t0 (the leading coefficient vanishes " +
        "there) the ordinary power series does not apply: the tool says whether t0 is a regular singular point, with " +
        "the indicial equation and its roots (the Frobenius exponents), or an irregular one (where neither method " +
        "applies). At a regular singular point of a HOMOGENEOUS equation with rational indicial roots it expands the " +
        "Frobenius series of the roots that give one; when the second solution contains a logarithm term (equal roots, " +
        "or roots a whole number apart whose recurrence fails) it says so and does NOT expand that solution, so never " +
        "supply its coefficients yourself; a right-hand side or irrational roots get no Frobenius series, and the " +
        "summary says so. To expand an ordinary power series instead, call it again with an ordinary point t0. " +
        "USE THIS whenever a student asks for a series solution, a recurrence relation, the first terms of a solution, " +
        "the basis solutions as series, a radius or interval of convergence, or the type of a point (ordinary / " +
        "singular) of a linear equation such as x'' - t*x = 0 (Airy), (1 - t^2)*x'' - 2*t*x' + 6*x = 0 (Legendre), " +
        "x'' - 2*t*x' + 4*x = 0 (Hermite), dy/dt = 2*t*y. A nonlinear equation (x'' + sin(x) = 0, dy/dt = y^2) or a " +
        "coefficient that is not a polynomial (e^t, cos(t)) is not expanded. For the split u = u_h + u_p of a " +
        "constant-coefficient equation use solution_formula; for pictures, equilibria and values of the solution use " +
        "analyze_first_order / analyze_second_order / query_solution. " +
        NOT_APPLICABLE_RULE + " " + SERIES_SYNTAX + " `t0` is the expansion point (default 0, |t0| <= 1e6), also where the " +
        "initial values are given; `terms` (1..30, default 8) is the highest power shown. " + INITIAL_VALUES_RULE + " " +
        LOCALE_RULE + " " + SERIES_NEVER_COMPUTE + " " + SERIES_STRUCTURED_CONTENT_RULE,
      inputSchema: {
        ...sharedShape,
        t0: coordinate.default(0).describe("The expansion point t0 of the series, also where the initial values are given (default 0, |t0| <= 1e6)."),
        terms: z
          .number()
          .int()
          .min(MIN_SERIES_TERMS)
          .max(MAX_SERIES_TERMS)
          .default(DEFAULT_SERIES_TERMS)
          .describe(`The highest power of (t - t0) shown (${MIN_SERIES_TERMS}..${MAX_SERIES_TERMS}, default ${DEFAULT_SERIES_TERMS}).`),
        ...initialShape,
      },
      annotations,
    },
    (input) => guarded(d, (checkpoint) => run("series", input, checkpoint)),
  );

  server.registerTool(
    "solution_formula",
    {
      title: "Solution formula of a constant-coefficient linear equation (u = u_h + u_p)",
      description:
        `${CALL_FIRST_PREFIX} for any question about the solution formula of a concrete linear equation with constant ` +
        "coefficients: how it splits into a homogeneous and a particular part, its characteristic equation and roots, " +
        "the trial solution of undetermined coefficients, resonance, the constants from initial values. Even when you " +
        "can solve it by hand (a textbook oscillator x'' + 3*x' + 2*x = 0 or x'' + x = cos(t) is exactly the case you are " +
        "tempted to skip), " + TEXT_TOOL_TAIL + " " +
        "WHAT IT COMPUTES: for a LINEAR equation with CONSTANT coefficients, dy/dt = g(t, y) or one second-order equation " +
        "in x(t), whose right-hand side is a sum of products of polynomials in t with exp, sin, cos, sinh, cosh of a " +
        "linear argument a*t + b, the split u = u_h + u_p step by step: u_h solves the homogeneous equation and u_p is " +
        "one particular solution; the characteristic equation, its discriminant and its roots (exact: fractions, surds " +
        "or complex pairs); u_h with the arbitrary constants C1, C2 and how it behaves (decays, grows, oscillates; for a " +
        "second-order equation the mass-spring reading undamped / underdamped / critically damped / overdamped); u_p by " +
        "undetermined coefficients, with the extra factor t (or t^2) of RESONANCE when a term of the right-hand side " +
        "solves the homogeneous equation; the constants from the initial values; the transient and the steady state; " +
        "and a check: u_p substituted EXACTLY into the equation, then a comparison of the final formula with the " +
        "tool's own numerical solution near t0 (|t - t0| <= 1, narrower when a mode grows or decays fast; the sentence " +
        "names the range actually compared and the deviation; a failed check is stated, never hidden; when the " +
        "formula's terms cancel far beyond floating-point precision, near resonance, no comparison is claimed and the " +
        "summary says why). " + EXACTNESS_RULE + " The constants C1, C2 are exact when the roots allow it (rational " +
        "roots, or a complex pair whose imaginary part is rational) and u_p(t0) is exact (t0 = 0, or a polynomial " +
        "right-hand side); otherwise they are shown rounded to 6 significant digits, and the summary says so. " +
        "USE THIS whenever a student asks to solve, split or explain a constant-coefficient linear equation: the " +
        "general solution, homogeneous plus particular, characteristic roots, why a trial needs an extra factor t, the " +
        "transient and the steady state of a forced oscillator, or the solution with given initial values. A " +
        "coefficient that changes with t (x'' + t*x = 0) or a nonlinear equation is not solved here: the summary says " +
        "why (for polynomial coefficients use power_series). For the value of the solution at a given time use " +
        "query_solution, never the formula evaluated mentally; for the phase plane use analyze_second_order. " +
        NOT_APPLICABLE_RULE + " " + SERIES_SYNTAX + " `t0` is the time at which the initial values are given (default 0, " +
        "|t0| <= 1e6). " + INITIAL_VALUES_RULE + " " + LOCALE_RULE + " " + SERIES_NEVER_COMPUTE + " " + SERIES_STRUCTURED_CONTENT_RULE,
      inputSchema: {
        ...sharedShape,
        t0: coordinate.default(0).describe("The time t0 at which the initial values are given (default 0, |t0| <= 1e6)."),
        ...initialShape,
      },
      annotations,
    },
    (input) => guarded(d, (checkpoint) => run("formula", input, checkpoint)),
  );
}
