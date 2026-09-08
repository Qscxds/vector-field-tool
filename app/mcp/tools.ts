/**
 * MCP tool layer: translates tool calls into lib/core calls and core results into tool results.
 * No mathematics here. Descriptions are the prompt Claude sees; they decide when a tool is called.
 * All human-readable text comes from lib/labels in the locale the caller asked for.
 */
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { findEquilibria } from "@/lib/core/equilibria";
import { sampleField } from "@/lib/core/field";
import { integrateAdaptive, integrateRK4, type IntegrateOptions } from "@/lib/core/integrate";
import { compileSystem, ParseError } from "@/lib/core/parse";
import { contourSegmentsFromGrid, sampleGrid } from "@/lib/render/contours";
import { detectForms, NO_FORM_NOTE, reportedForms, type FormDetection } from "@/lib/core/detect-form";
import { exactPotential, potentialLevelsFromValues } from "@/lib/core/exact";
import {
  compileDifferential,
  firstOrderEquilibria,
  firstOrderSingularities,
  toSystem,
  type FirstOrderSpec,
} from "@/lib/core/slope-field";
import type { Box, SystemSpec } from "@/lib/core/types";
import { EXACT_PATH_TOL, markNonUnique, withUniqueness } from "@/lib/interactive";
import { fill, formatEigenvalue, formatNumber, formatPoint, labels, LOCALES, uniquenessSentence, type Locale } from "@/lib/labels";
import type { Scene, TrajectoryView } from "@/lib/scene";
import { BudgetExceeded, makeCheckpoint } from "./budget";
import { defaultLimiter, type SlidingWindowLimiter } from "./rate-limit";

// ---------- prompt fragments shared by every description ----------

const EXPRESSION_RULES =
  'Expression syntax: the state variables are x and y (t is the time, rarely needed). ' +
  'Write multiplication explicitly: x*y, not xy (2*x and 2x are both fine). Powers use ^, e.g. x^2. ' +
  'Allowed functions: sin cos tan asin acos atan atan2 sinh cosh tanh exp log log10 sqrt abs sign pow min max floor ceil round; ' +
  'constants pi and e. Any other constant goes into "params" as a number (e.g. {"a": 0.5}) and is referenced by name. ' +
  'A piecewise right-hand side may use comparisons and a conditional, e.g. "x > 0 ? 1 : -1".';

/** analyze_first_order only: the student's independent variable is t, and there is no separate time. */
const FIRST_ORDER_EXPRESSION_RULES =
  'Expression syntax: the only variables are t (the independent variable) and y (the unknown function); ' +
  'there is no separate time variable, and x is rejected (write t instead). Enter only the right-hand side, ' +
  'never "dy/dt =". Write multiplication explicitly: t*y, not ty (2*t and 2t are both fine). Powers use ^, e.g. t^2. ' +
  'Allowed functions: sin cos tan asin acos atan atan2 sinh cosh tanh exp log log10 sqrt abs sign pow min max floor ceil round; ' +
  'constants pi and e. Any other constant goes into "params" as a number (e.g. {"a": 0.5}) and is referenced by name. ' +
  'A piecewise right-hand side may use comparisons and a conditional, e.g. "t > 0 ? 1 : -1".';

const NEVER_COMPUTE =
  'Do NOT compute any of this yourself: no mental arithmetic, no estimating eigenvalues, equilibria, ' +
  'stability or trajectories from memory. Always call this tool and report exactly what it returns. ' +
  'If the result contains a "caveat", read it to the student word for word; it marks a case where the ' +
  'mathematics genuinely cannot be decided by linearization.';

const BOX_RULES =
  'The viewing box (xMin, xMax, yMin, yMax) must have xMin < xMax and yMin < yMax; defaults are -3..3.';

const FIRST_ORDER_BOX_RULES =
  'The viewing box must have xMin < xMax and yMin < yMax; defaults are -3..3. xMin and xMax are the t range ' +
  '(horizontal axis), yMin and yMax the y range.';

const LOCALE_RULE =
  "`locale` is REQUIRED (the call fails without it): set it from the language the student writes in, 'zh' when the question is in Chinese, 'en' for every other language.";

// ---------- schemas ----------

const expression = z.string().trim().min(1).max(200).describe("A mathjs expression in x and y.");
const paramsSchema = z
  .record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.number().finite())
  .optional()
  .describe('Named constants used in the expressions, e.g. {"a": 1.5, "b": 0.2}.');
const coordinate = z.number().finite();
const boxShape = {
  xMin: coordinate.default(-3).describe("Left edge of the viewing box."),
  xMax: coordinate.default(3).describe("Right edge of the viewing box."),
  yMin: coordinate.default(-3).describe("Bottom edge of the viewing box."),
  yMax: coordinate.default(3).describe("Top edge of the viewing box."),
};
/** Same keys, defaults and types as boxShape (no aliases): only the descriptions speak of t. */
const firstOrderBoxShape = {
  xMin: coordinate.default(-3).describe("Left end of the t range (horizontal axis)."),
  xMax: coordinate.default(3).describe("Right end of the t range (horizontal axis)."),
  yMin: coordinate.default(-3).describe("Bottom of the y range."),
  yMax: coordinate.default(3).describe("Top of the y range."),
};
const density = z
  .number()
  .int()
  .min(5)
  .max(60)
  .default(20)
  .describe("Grid points per axis for the sampled field (5..60). 20 is a good default for a widget.");
// Required on purpose (H2.9): a default would silently mask a model that forgot to set it, and
// an English summary is indistinguishable from a deliberate 'en'. Failing loudly shows whether
// the rule in the description is being followed.
const localeSchema = z
  .enum(LOCALES as [Locale, ...Locale[]])
  .describe("REQUIRED. Language of the text summary: 'zh' if the student writes in Chinese, otherwise 'en'.");

type BoxInput = { xMin: number; xMax: number; yMin: number; yMax: number };

// ---------- helpers ----------

class ToolInputError extends Error {}

/** Cost controls for the public endpoint; injectable so tests can use a tiny budget or limiter. */
export type ToolDeps = {
  /** Per-process speed bump (rate-limit.ts). */
  limiter?: SlidingWindowLimiter;
  /** Wall-clock budget per tool call in milliseconds. Default 2000. */
  budgetMs?: number;
  /** Clock in milliseconds, injectable for tests. */
  now?: () => number;
};
type ResolvedDeps = Required<ToolDeps>;
export const DEFAULT_BUDGET_MS = 2000;

function resolveBox(b: BoxInput): Box {
  if (!(b.xMin < b.xMax)) throw new ToolInputError(`xMin (${b.xMin}) must be smaller than xMax (${b.xMax}).`);
  if (!(b.yMin < b.yMax)) throw new ToolInputError(`yMin (${b.yMin}) must be smaller than yMax (${b.yMax}).`);
  const w = b.xMax - b.xMin;
  const h = b.yMax - b.yMin;
  if (w > 1e6 || h > 1e6) throw new ToolInputError("The viewing box is too large (each side must be at most 1e6).");
  if (w < 1e-9 || h < 1e-9) throw new ToolInputError("The viewing box is too small (each side must be at least 1e-9).");
  return { x: { min: b.xMin, max: b.xMax }, y: { min: b.yMin, max: b.yMax } };
}

function compileOrExplain(spec: SystemSpec) {
  try {
    return compileSystem(spec);
  } catch (error) {
    if (error instanceof ParseError) {
      const which = error.expr === spec.f ? "f (the x' expression)" : error.expr === spec.g ? "g (the y' expression)" : "the expression";
      throw new ToolInputError(`Cannot parse ${which}: ${error.message}`);
    }
    throw error;
  }
}

function compileOrExplainFirstOrder(spec: FirstOrderSpec, systemSpec: SystemSpec) {
  // Differential form: compile M and N separately first so a parse error is attributed to the field
  // that has it (the system form wraps M as -(M), and N's text may contain M's). Explicit form: the
  // system compiles g verbatim, so the kernel's left-hand-side check sees exactly what the student
  // typed; the differential form would wrap it as -(g) and turn a pasted "dy/dt =" into a generic
  // syntax error.
  try {
    if (spec.kind === "differential") compileDifferential(spec);
    return compileSystem(systemSpec);
  } catch (error) {
    if (error instanceof ParseError) {
      const which = spec.kind === "explicit" ? "g (the right-hand side of dy/dt)" : error.expr === spec.N ? "N" : "M";
      throw new ToolInputError(`Cannot parse ${which}: ${error.message}`);
    }
    throw error;
  }
}

/** Uniformly thins a polyline to at most `max` points, always keeping the last one. */
export function thin<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const stride = (points.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * stride)]);
  return out;
}

const fmt = formatNumber;

function boxValues(box: Box): Record<string, string> {
  return { xMin: fmt(box.x.min), xMax: fmt(box.x.max), yMin: fmt(box.y.min), yMax: fmt(box.y.max) };
}

function describeEquilibria(scene: Scene, locale: Locale): string {
  const L = labels(locale);
  const lines: string[] = [];
  const eq = scene.equilibria ?? [];
  if (scene.warning) lines.push(L.warning[scene.warning]);
  if (scene.truncated) lines.push(fill(L.ui.equilibriaTruncated, { max: eq.length }));
  eq.forEach((p, i) => {
    lines.push(
      fill(L.tool.equilibriumLine, {
        index: i + 1,
        point: formatPoint(p.at),
        classification: L.classification[p.classification],
        eigenvalues: p.eigenvalues.map((e) => formatEigenvalue(e)).join(", ") || L.tool.eigenvaluesUnavailable,
        trace: fmt(p.trace, 5),
        determinant: fmt(p.determinant, 5),
      }) + (p.caveat ? fill(L.tool.note, { caveat: L.caveat[p.caveat] }) : ""),
    );
    // Right after the point it belongs to; silent when the quotients stayed bounded (no proof).
    const uniqueness = uniquenessSentence(L, p.uniqueness, { point: p.at });
    if (uniqueness) lines.push(uniqueness);
  });
  return lines.join("\n");
}

const formatDeviation = (d: number) => (Number.isFinite(d) ? d.toExponential(1) : "—");

/**
 * Lines about the detected forms: consistent ones as "behaves like", borderline ones flagged as
 * such, then the caveats (the general one, plus the borderline one when present), then a compact
 * list of the forms that failed (with their deviations) and of those that could not be tested.
 */
export function describeForms(forms: FormDetection[], locale: Locale): string[] {
  const L = labels(locale);
  const lines: string[] = [];
  const reported = reportedForms(forms);
  if (reported.length) {
    lines.push(L.tool.formsHeader);
    for (const f of reported) {
      lines.push(fill(f.verdict === "consistent" ? L.tool.formLine : L.tool.formBorderlineLine, { form: L.form[f.form], evidence: f.evidence }));
    }
    const consistent = reported.find((f) => f.verdict === "consistent");
    const borderline = reported.find((f) => f.verdict === "borderline");
    if (consistent) lines.push(fill(L.tool.formsCaveat, { caveat: consistent.caveat }));
    if (borderline) lines.push(fill(L.tool.formsCaveat, { caveat: borderline.caveat }));
  } else {
    lines.push(NO_FORM_NOTE[locale]);
  }
  const rejected = forms.filter((f) => f.verdict === "inconsistent");
  if (rejected.length) {
    lines.push(fill(L.tool.formsInconsistentLine, { list: rejected.map((f) => `${L.form[f.form]}${L.tool.parenOpen}${formatDeviation(f.maxRelDeviation ?? NaN)}${L.tool.parenClose}`).join(L.tool.listSeparator) }));
  }
  const untestable = forms.filter((f) => f.verdict === "untestable");
  if (untestable.length) {
    lines.push(fill(L.tool.formsUntestableLine, { list: untestable.map((f) => L.form[f.form]).join(L.tool.listSeparator) }));
  }
  return lines;
}

function ok(text: string, scene: Scene): CallToolResult {
  return { content: [{ type: "text", text }], structuredContent: scene as Record<string, unknown> };
}

function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

/**
 * Runs a handler under the cost controls and converts expected failures into MCP error results
 * (never HTTP 500): the limiter answers first, then the handler runs with a checkpoint that throws
 * once the wall-clock budget is spent.
 */
function guarded(deps: ResolvedDeps, run: (checkpoint: () => void) => CallToolResult): CallToolResult {
  const gate = deps.limiter.tryAcquire(deps.now());
  if (!gate.ok) {
    return fail(
      `Too many requests on this server instance right now (limit ${deps.limiter.limit} tool calls per ` +
        `${deps.limiter.windowMs / 1000} s). Try again in ${Math.max(1, Math.ceil(gate.retryAfterMs / 1000))} s.`,
    );
  }
  try {
    return run(makeCheckpoint(deps.budgetMs, deps.now));
  } catch (error) {
    if (error instanceof BudgetExceeded) {
      return fail(
        `The computation exceeded its ${deps.budgetMs / 1000} s budget. The expression may be expensive to evaluate ` +
          "(many transcendental functions), the time span or step count large, or the level curves of an exact " +
          "equation costly; try a simpler expression, a smaller tSpan, or a smaller box.",
      );
    }
    if (error instanceof ToolInputError || error instanceof RangeError || error instanceof ParseError) {
      return fail(`Invalid input: ${error.message}`);
    }
    throw error;
  }
}

// ---------- tools ----------

/**
 * Registers the four analysis tools. Every tool is linked to the widget resource (`widgetUri`)
 * so MCP Apps hosts render its Scene; text-only hosts just read the summary.
 */
export function registerTools(server: McpServer, widgetUri: string, deps: ToolDeps = {}): void {
  const ui = { ui: { resourceUri: widgetUri } };
  const d: ResolvedDeps = {
    limiter: deps.limiter ?? defaultLimiter,
    budgetMs: deps.budgetMs ?? DEFAULT_BUDGET_MS,
    now: deps.now ?? (() => performance.now()),
  };

  registerAppTool(
    server,
    "analyze_system",
    {
      title: "Analyze a planar system",
      description:
        "Finds all equilibrium points of the planar system x' = f(x, y), y' = g(x, y) inside a viewing box and " +
        "classifies each one from its Jacobian (eigenvalues, trace, determinant): stable/unstable node, saddle, " +
        "stable/unstable spiral, star or degenerate node, center-or-weak-spiral, non-hyperbolic. Also returns a " +
        "sampled vector field for drawing the phase portrait. " +
        "USE THIS whenever a student asks about equilibria, fixed points, stability, the phase portrait, the type " +
        "of a critical point, eigenvalues of the linearization, or long-term behavior of a 2D autonomous system. " +
        "For a single first-order equation dy/dt = g(t, y) use analyze_first_order instead. " +
        EXPRESSION_RULES + " " + BOX_RULES + " " + LOCALE_RULE + " " + NEVER_COMPUTE,
      inputSchema: {
        f: expression.describe("Right-hand side of x' (dx/dt)."),
        g: expression.describe("Right-hand side of y' (dy/dt)."),
        params: paramsSchema,
        ...boxShape,
        density: density.describe("Grid points per axis for the returned vector field (5..60)."),
        locale: localeSchema,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: ui,
    },
    (input) =>
      guarded(d, (checkpoint) => {
        const L = labels(input.locale);
        const box = resolveBox(input);
        const spec: SystemSpec = input.params ? { f: input.f, g: input.g, params: input.params } : { f: input.f, g: input.g };
        const sys = compileOrExplain(spec);
        const eq = findEquilibria(sys, box, { checkpoint });
        const field = sampleField(sys, box, input.density, input.density, 0, checkpoint);
        const scene: Scene = { kind: "analyze_system", locale: input.locale, system: spec, box, field, equilibria: withUniqueness(sys, eq.points, box, checkpoint), warning: eq.warning, truncated: eq.truncated };
        const header = fill(L.tool.systemHeader, { f: spec.f, g: spec.g, ...boxValues(box) });
        const singular = field.singularCount ? " " + fill(L.tool.singularSamples, { count: field.singularCount }) : "";
        return ok(`${header}${singular}\n${describeEquilibria(scene, input.locale)}`, scene);
      }),
  );

  registerAppTool(
    server,
    "trace_trajectory",
    {
      title: "Trace a trajectory",
      description:
        "Numerically integrates the planar system x' = f(x, y), y' = g(x, y) from an initial point (x0, y0), " +
        "forward and/or backward in time, and returns the trajectory points plus why the integration stopped " +
        "(completed, left the viewing box, reached an equilibrium, blew up in finite time, hit the step limit). " +
        "USE THIS whenever a student asks what happens to a solution starting at a given point, where a trajectory " +
        "goes, whether it approaches an equilibrium or a limit cycle, or wants a solution curve drawn. " +
        "Default is both directions with an adaptive Dormand-Prince integrator; use method 'rk4' only when a " +
        "fixed-step classic RK4 is explicitly wanted. " +
        EXPRESSION_RULES + " " + BOX_RULES + " Integration stops when the trajectory leaves the box. " + LOCALE_RULE + " " + NEVER_COMPUTE,
      inputSchema: {
        f: expression.describe("Right-hand side of x' (dx/dt)."),
        g: expression.describe("Right-hand side of y' (dy/dt)."),
        params: paramsSchema,
        x0: coordinate.describe("Initial x."),
        y0: coordinate.describe("Initial y."),
        tSpan: z.number().positive().max(1000).default(20).describe("Time span to integrate in each direction (0 < tSpan <= 1000)."),
        direction: z.enum(["both", "forward", "backward"]).default("both"),
        method: z.enum(["adaptive", "rk4"]).default("adaptive"),
        ...boxShape,
        locale: localeSchema,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: ui,
    },
    (input) =>
      guarded(d, (checkpoint) => {
        const L = labels(input.locale);
        const box = resolveBox(input);
        const spec: SystemSpec = input.params ? { f: input.f, g: input.g, params: input.params } : { f: input.f, g: input.g };
        const sys = compileOrExplain(spec);
        const start = { x: input.x0, y: input.y0 };
        const integrate = input.method === "rk4" ? integrateRK4 : integrateAdaptive;
        const directions: Array<1 | -1> = input.direction === "both" ? [1, -1] : input.direction === "forward" ? [1] : [-1];
        const traced: TrajectoryView[] = directions.map((dir) => {
          // rk4 has a fixed step of 0.01; give it enough steps to reach any accepted tSpan (<= 1000)
          // instead of truncating silently at t = 200.
          const opts: IntegrateOptions =
            input.method === "rk4"
              ? { direction: dir, box, h: 0.01, maxSteps: Math.max(20000, Math.ceil(input.tSpan / 0.01) + 1), checkpoint }
              : { direction: dir, box, h: 0.05, checkpoint };
          const tr = integrate(sys, start, input.tSpan, opts);
          return {
            direction: dir === 1 ? "forward" : "backward",
            points: thin(tr.points, 1000),
            status: tr.status,
            steps: tr.steps,
            tEnd: tr.times[tr.times.length - 1],
          };
        });
        // A curve through an equilibrium where uniqueness fails (x' = sqrt(|x|) at the origin) is
        // one of infinitely many: find the equilibria, probe them, and flag such curves.
        const eq = findEquilibria(sys, box, { checkpoint });
        const trajectories = markNonUnique(traced, { equilibria: withUniqueness(sys, eq.points, box, checkpoint) }, box);
        const scene: Scene = { kind: "trace_trajectory", locale: input.locale, system: spec, box, start, trajectories };
        const lines = trajectories.flatMap((t) => {
          const end = t.points[t.points.length - 1];
          const line = fill(L.tool.trajectoryLine, {
            direction: t.direction === "forward" ? L.tool.forward : L.tool.backward,
            tEnd: fmt(t.tEnd, 3),
            end: formatPoint(end),
            status: L.status[t.status],
            steps: t.steps,
          });
          return t.nonUnique ? [line, L.tool.nonUniqueTrajectory] : [line];
        });
        return ok(`${fill(L.tool.trajectoryHeader, { start: formatPoint(start), f: spec.f, g: spec.g })}\n${lines.join("\n")}`, scene);
      }),
  );

  registerAppTool(
    server,
    "sample_field",
    {
      title: "Sample the vector field",
      description:
        "Samples the vector field (f, g) of the planar system x' = f(x, y), y' = g(x, y) on a regular grid inside " +
        "the viewing box and returns the arrows (position, vector, magnitude) for drawing, plus the maximum " +
        "magnitude and how many grid points are singular. " +
        "USE THIS when a student just wants to see the direction field / vector field / phase plane arrows of a " +
        "system without an equilibrium analysis, or to render a picture in the widget. For equilibria and stability " +
        "use analyze_system, which also returns a field. " +
        EXPRESSION_RULES + " " + BOX_RULES + " " + LOCALE_RULE + " " + NEVER_COMPUTE,
      inputSchema: {
        f: expression.describe("Right-hand side of x' (dx/dt)."),
        g: expression.describe("Right-hand side of y' (dy/dt)."),
        params: paramsSchema,
        ...boxShape,
        density,
        locale: localeSchema,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: ui,
    },
    (input) =>
      guarded(d, (checkpoint) => {
        const L = labels(input.locale);
        const box = resolveBox(input);
        const spec: SystemSpec = input.params ? { f: input.f, g: input.g, params: input.params } : { f: input.f, g: input.g };
        const sys = compileOrExplain(spec);
        const field = sampleField(sys, box, input.density, input.density, 0, checkpoint);
        const scene: Scene = { kind: "sample_field", locale: input.locale, system: spec, box, field };
        const line = fill(L.tool.sampleFieldLine, { nx: field.nx, ny: field.ny, f: spec.f, g: spec.g, maxMag: fmt(field.maxMag), singular: field.singularCount });
        return ok(`${line} ${L.tool.widgetDraws}`, scene);
      }),
  );

  registerAppTool(
    server,
    "analyze_first_order",
    {
      title: "Analyze a first-order equation (dy/dt = g(t, y), or M dt + N dy = 0)",
      description:
        "For a single first-order ODE, given either explicitly as dy/dt = g(t, y) (parameter `expr`) or in " +
        "differential form M(t, y) dt + N(t, y) dy = 0 (parameters `M` and `N`, the natural form of exact " +
        "equations). Returns: the slope/direction field inside the viewing box (undirected segments for the " +
        "differential form, which has no natural direction); constant solutions y = c with their stability " +
        "(stable / unstable / semi-stable / varies with t; a line on the edge of the equation's domain, such as " +
        "y = 0 for dy/dt = sqrt(y), is judged on its defined side only: approached or left), each with a " +
        "uniqueness check (whether the Lipschitz condition fails there, as it does for sqrt(y) at y = 0: then " +
        "infinitely many solutions pass through the line, and the sentence saying so must be read to the student); " +
        "points where the direction is undefined (M = N = 0); " +
        "a list of standard forms the equation is NUMERICALLY CONSISTENT WITH (separable, autonomous, linear in y, " +
        "homogeneous, Bernoulli, exact, integrating factor in t or y), each with its evidence and a caveat; and, " +
        "for exact equations, the implicit solution F(t, y) = C drawn as level curves. " +
        "USE THIS whenever a student has ONE equation with a single unknown function: logistic growth, Newton " +
        "cooling, separable or linear equations, exact equations, slope fields, isoclines, equilibrium " +
        "solutions, 'what method solves this'. For a system of two equations use analyze_system. " +
        "IMPORTANT about the detected forms: they are numerical probes at a handful of sample points, not proofs. " +
        "When you relay them, keep the uncertainty: say the equation 'behaves numerically like a separable " +
        "equation', never 'is a separable equation', and pass the caveat on. An empty list is not a failure: it " +
        "means no standard elementary method was detected, while the slope field and numerical solutions remain " +
        "fully valid (many important equations, e.g. Riccati dy/dt = t^2 + y^2, have no closed form). " +
        "Variables: y is the unknown function, t the independent variable (write t, never x; x is rejected). " +
        "Provide exactly one of `expr` or the pair `M`, `N`. " +
        FIRST_ORDER_EXPRESSION_RULES + " " + FIRST_ORDER_BOX_RULES + " " + LOCALE_RULE + " " + NEVER_COMPUTE,
      inputSchema: {
        expr: expression.optional().describe("Right-hand side g(t, y) of dy/dt = g(t, y). The independent variable is t; x is rejected. Omit when giving M and N."),
        M: expression.optional().describe("M(t, y) in M(t, y) dt + N(t, y) dy = 0. Variables t and y only. Requires N."),
        N: expression.optional().describe("N(t, y) in M(t, y) dt + N(t, y) dy = 0. Variables t and y only. Requires M."),
        params: paramsSchema,
        ...firstOrderBoxShape,
        density,
        locale: localeSchema,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: ui,
    },
    (input) =>
      guarded(d, (checkpoint) => {
        const locale = input.locale;
        const L = labels(locale);
        const box = resolveBox(input);
        const hasExpr = typeof input.expr === "string";
        const hasMN = typeof input.M === "string" || typeof input.N === "string";
        if (hasExpr === hasMN) {
          throw new ToolInputError("Provide exactly one form: either `expr` (dy/dt = g(t, y)) or both `M` and `N` (M dt + N dy = 0).");
        }
        if (hasMN && !(typeof input.M === "string" && typeof input.N === "string")) {
          throw new ToolInputError("The differential form needs both `M` and `N`.");
        }
        const spec: FirstOrderSpec = hasExpr
          ? input.params
            ? { kind: "explicit", g: input.expr as string, params: input.params }
            : { kind: "explicit", g: input.expr as string }
          : input.params
            ? { kind: "differential", M: input.M as string, N: input.N as string, params: input.params }
            : { kind: "differential", M: input.M as string, N: input.N as string };
        const equationText = spec.kind === "explicit" ? `dy/dt = ${spec.g}` : `(${spec.M}) dt + (${spec.N}) dy = 0`;

        const systemSpec = toSystem(spec);
        const sys = compileOrExplainFirstOrder(spec, systemSpec);
        const field = sampleField(sys, box, input.density, input.density, 0, checkpoint);
        const eq = firstOrderEquilibria(spec, box.y, { tRange: box.x, checkpoint });
        const singular = firstOrderSingularities(spec, box, { checkpoint });
        const forms = detectForms(spec, box, locale, { checkpoint });
        const reported = reportedForms(forms);

        let implicit: NonNullable<Scene["firstOrder"]>["implicit"];
        let implicitCheck: NonNullable<Scene["firstOrder"]>["implicitCheck"];
        // Only a CONSISTENT exactness verdict earns a potential: a borderline one must not produce
        // the sentence 'the equation is exact' and a picture of level curves.
        if (reported.some((f) => f.form === "exact" && f.verdict === "consistent")) {
          const pot = exactPotential(spec, box, { checkpoint, tol: EXACT_PATH_TOL });
          implicitCheck = { pathDeviation: pot.pathDeviation, tol: EXACT_PATH_TOL, passed: pot.consistent };
          if (pot.consistent) {
            // The potential costs ~130 evaluations per point: sample it ONCE on the contour grid and
            // read every level from those values (review C9).
            const grid = sampleGrid(pot.F, box, 60, 60, checkpoint);
            const levels = potentialLevelsFromValues(grid.values, 8).map((level) => ({ level, segments: contourSegmentsFromGrid(grid, level) }));
            implicit = { levels, pathDeviation: pot.pathDeviation };
          }
        }

        const scene: Scene = {
          kind: "analyze_first_order",
          locale,
          system: systemSpec,
          box,
          field,
          fieldStyle: spec.kind === "differential" ? "segments" : "arrows",
          firstOrder: {
            expr: equationText,
            spec,
            autonomous: eq.autonomous,
            solutions: eq.solutions,
            singularities: singular.points,
            singularitiesTruncated: singular.truncated,
            forms,
            formsNote: reported.length === 0 ? NO_FORM_NOTE[locale] : undefined,
            implicit,
            implicitCheck,
          },
        };

        const lines: string[] = [];
        lines.push(fill(L.tool.firstOrderHeader, { equation: equationText, ...boxValues(box) }));
        if (spec.kind === "differential") lines.push(L.tool.differentialUndirected);
        if (field.singularCount) lines.push(fill(L.tool.singularSamples, { count: field.singularCount }));
        if (singular.points.length) {
          lines.push(
            fill(L.tool.directionSingular, {
              points: singular.points.map((p) => formatPoint(p)).join(L.tool.listSeparator),
              truncated: singular.truncated ? L.tool.truncated : "",
            }),
          );
          if (singular.truncated) lines.push(fill(L.ui.singularitiesTruncated, { max: singular.points.length }));
        }
        if (eq.solutions.length) {
          for (const s of eq.solutions) {
            lines.push(fill(L.tool.constantSolution, { y: fmt(s.y, 6), stability: L.stability[s.stability] }));
            // The uniqueness sentence follows its line; nothing is printed for a bounded result.
            const uniqueness = uniquenessSentence(L, s.uniqueness, { y: s.y });
            if (uniqueness) lines.push(uniqueness);
          }
        } else {
          lines.push(eq.autonomous ? L.tool.noConstantAutonomous : L.tool.noConstantGeneral);
        }
        lines.push(...describeForms(forms, locale));
        if (implicit) {
          lines.push(fill(L.tool.exactImplicit, { levels: implicit.levels.length, deviation: implicit.pathDeviation.toExponential(1) }));
        } else if (implicitCheck && !implicitCheck.passed) {
          lines.push(fill(L.tool.exactPathCheckFailed, { deviation: formatDeviation(implicitCheck.pathDeviation), tol: implicitCheck.tol.toExponential(0) }));
        }
        return ok(lines.join("\n"), scene);
      }),
  );
}
