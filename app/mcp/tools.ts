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
import { querySolution, type QueryTarget } from "@/lib/core/query";
import { reduceSecondOrder } from "@/lib/core/second-order";
import { detectTimeDependence } from "@/lib/core/time-dependence";
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
import { EXACT_PATH_TOL, fixedStopBox, markNonUnique, withUniqueness } from "@/lib/interactive";
import { queryLines, queryTargetText } from "@/lib/labels-query";
import { statusSentence, trajectoryStatus } from "@/lib/labels-trajectory";
import { constantSolutionLines, constantSolutionNotices, equilibriaNotices, fill, formatEigenvalue, formatNumber, formatPoint, labels, LOCALES, noConstantSentence, pointText, timeDependenceEvidence, uniquenessSentence, type Locale } from "@/lib/labels";
import type { Scene, TrajectoryView } from "@/lib/scene";
import { BudgetExceeded, makeCheckpoint } from "./budget";
import { defaultLimiter, type SlidingWindowLimiter } from "./rate-limit";

// ---------- prompt fragments shared by every description ----------

/**
 * The call-first rule (Phase L). Observed: asked to analyze 2xy dx + (x² + y²) dy = 0, the model
 * listed the tools and then answered by symbolic derivation without calling any; the derivation
 * was right, but it skipped the numerical check that is the whole reason the tools exist, and
 * standard textbook cases are exactly the ones the model feels confident enough to skip. So every
 * analysis tool's description STARTS with this rule, tailored to the tool, and the shared tail
 * below says the derivation is to be checked against the tool, never used instead of it.
 */
const CALL_FIRST_PREFIX = "CALL THIS TOOL FIRST";
const CALL_FIRST_TAIL =
  "call the tool, check your derivation against its numerical results, and show the student the picture. " +
  "Never answer from symbolic derivation alone.";

/** Fractional powers of a negative base are NaN in this kernel; said once in every expression rule. */
const FRACTIONAL_POWER_NOTE =
  'A fractional power of a negative base (x^(2/3) at x < 0) is undefined in this tool and counts as a singular ' +
  'sample; for the real branch write abs(x)^(2/3) or sign(x)*abs(x)^p.';

const EXPRESSION_RULES =
  'Expression syntax: the state variables are x and y (t is the time, rarely needed). ' +
  'Write multiplication explicitly: x*y, not xy (2*x and 2x are both fine). Powers use ^, e.g. x^2. ' +
  'Allowed functions: sin cos tan asin acos atan atan2 sinh cosh tanh exp log log10 sqrt abs sign pow min max floor ceil round; ' +
  'constants pi and e. Any other constant goes into "params" as a number (e.g. {"a": 0.5}) and is referenced by name. ' +
  'A piecewise right-hand side may use comparisons and a conditional, e.g. "x > 0 ? 1 : -1". ' +
  FRACTIONAL_POWER_NOTE;

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

/** analyze_second_order: the vertical range is the velocity x', named so (round P). */
const SECOND_ORDER_BOX_RULES =
  "The viewing box of the phase plane must have xMin < xMax (the x range, horizontal) and xpMin < xpMax (the x' " +
  "range, vertical); defaults are -3..3.";

/**
 * The second-order notation (round P, the professor's correction): the independent variable is t,
 * the right-hand side may depend on it, the second coordinate of the phase plane is x' and there
 * is no y in the student's problem. Shared by analyze_second_order and query_solution.
 */
const SECOND_ORDER_NOTATION =
  "NOTATION of a second-order equation: the independent variable is t and the unknown is x(t), so the right-hand " +
  "side is F(t, x, x') and may depend on t (x'' = -x + cos(t) is a forced oscillator). The tool sets v = x' and " +
  "reduces the equation to the planar system x' = v, v' = F(t, x, v). COORDINATES: the horizontal axis is x " +
  "(position) and the vertical axis is x' (velocity); every point in the result is (x, x'), and the second " +
  "coordinate is the velocity x', NOT an independent dependent variable. The student's problem has no y: never " +
  "speak of y to the student, and y in the equation is rejected. An equilibrium (x, x') = (c, 0) of the phase " +
  "plane is the constant solution x ≡ c (the body at rest). " +
  "Examples that are accepted: x'' = -x, x'' = -sin(x), x'' = -x - 0.5*x', x'' = -x + cos(t), " +
  "x'' = -x - x'*abs(x'), x'' = (1 - x^2)*x' - x, x'' = -x + 0.5*cos(1.2*t), x'' + 0.5*x' + x = 0.";

/** analyze_second_order: what happens when F mentions t (the same static rule as NON_AUTONOMOUS_RULE). */
const SECOND_ORDER_NON_AUTONOMOUS_RULE =
  "If the symbol t appears in the equation it is non-autonomous (a static rule, whatever the size of the t term): " +
  "the direction field of the phase plane changes with time, so the tool returns the field sampled at the snapshot " +
  "time `t` and says so, and equilibria and linearized stability are NOT computed (they are defined for autonomous " +
  "equations only). Tell the student that the picture is a snapshot at t = ..., that no equilibrium analysis is " +
  "done, and why (the equation changes with time); for values of a forced solution at given times use " +
  "query_solution with mode 'second'.";

const FIRST_ORDER_BOX_RULES =
  'The viewing box must have xMin < xMax and yMin < yMax; defaults are -3..3. xMin and xMax are the t range ' +
  '(horizontal axis), yMin and yMax the y range.';

const LOCALE_RULE =
  "`locale` defaults to en: set it from the language the student writes in, 'zh' when the question is in Chinese, 'en' for every other language.";

/** analyze_system and sample_field: what happens when f or g mentions t. */
const NON_AUTONOMOUS_RULE =
  "If the symbol t appears in f or g the system is treated as non-autonomous (a static rule, whatever the size of " +
  "the t term): the field changes with time, so the tool returns the field sampled at the snapshot time `t` and " +
  "says so, and equilibria and linearized stability are NOT computed (they are tools for autonomous systems; this " +
  "tool does not attempt them for a time-dependent field). A numerical probe only reports how much the field " +
  "changed at a few sampled times, as evidence.";

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
/** analyze_second_order: the vertical range is the velocity x' (round P), so its parameters are named xpMin / xpMax. */
const secondOrderBoxShape = {
  xMin: coordinate.default(-3).describe("Left end of the x range (position, horizontal axis)."),
  xMax: coordinate.default(3).describe("Right end of the x range (position, horizontal axis)."),
  xpMin: coordinate.default(-3).describe("Bottom of the x' range (velocity, vertical axis)."),
  xpMax: coordinate.default(3).describe("Top of the x' range (velocity, vertical axis)."),
};
const density = z
  .number()
  .int()
  .min(5)
  .max(60)
  .default(20)
  .describe("Grid points per axis for the sampled field (5..60). 20 is a good default for a widget.");
// Optional, default en (round M, reversing H2.9): a model that forgets it now costs the student an
// English summary, whereas the earlier isError reached the student as a failed answer. The rule in
// the description still asks for zh when the question is in Chinese.
const localeSchema = z
  .enum(LOCALES as [Locale, ...Locale[]])
  .default("en")
  .describe("Language of the text summary: 'zh' if the student writes in Chinese, otherwise 'en'. Defaults to en.");
const snapshotTime = z
  .number()
  .finite()
  .default(0)
  .describe("Snapshot time for a non-autonomous system (f or g mentions t): the field is sampled at this t. Ignored otherwise.");

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

/** `vertical` names the vertical pair in the messages: yMin / yMax, or xpMin / xpMax on a second-order picture. */
function resolveBox(b: BoxInput, vertical: "y" | "xp" = "y"): Box {
  if (!(b.xMin < b.xMax)) throw new ToolInputError(`xMin (${b.xMin}) must be smaller than xMax (${b.xMax}).`);
  if (!(b.yMin < b.yMax)) throw new ToolInputError(`${vertical}Min (${b.yMin}) must be smaller than ${vertical}Max (${b.yMax}).`);
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

function describeEquilibria(scene: Scene, locale: Locale): string[] {
  const L = labels(locale);
  const eq = scene.equilibria ?? [];
  // A second-order picture names its points (x, x') = (...): the second coordinate is the velocity.
  const secondOrder = Boolean(scene.secondOrder);
  const lines: string[] = equilibriaNotices(L, scene);
  eq.forEach((p, i) => {
    lines.push(
      fill(L.tool.equilibriumLine, {
        index: i + 1,
        point: pointText(L, p.at, secondOrder),
        classification: L.classification[p.classification],
        eigenvalues: p.eigenvalues.map((e) => formatEigenvalue(e)).join(", ") || L.tool.eigenvaluesUnavailable,
        trace: fmt(p.trace, 5),
        determinant: fmt(p.determinant, 5),
      }) + (p.caveat ? fill(L.tool.note, { caveat: L.caveat[p.caveat] }) : ""),
    );
    // Right after the point it belongs to; silent when the quotients stayed bounded (no proof).
    const uniqueness = uniquenessSentence(L, p.uniqueness, { point: p.at, secondOrder });
    if (uniqueness) lines.push(uniqueness);
  });
  return lines;
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
  // A form ruled out by a textbook rule (Bernoulli with n = 0 or 1) is not a failed test: its
  // deviation may be far below the threshold, so the rule is printed instead of the deviation.
  const rejected = forms.filter((f) => f.verdict === "inconsistent" && !f.excluded);
  if (rejected.length) {
    lines.push(fill(L.tool.formsInconsistentLine, { list: rejected.map((f) => `${L.form[f.form]}${L.tool.parenOpen}${formatDeviation(f.maxRelDeviation ?? NaN)}${L.tool.parenClose}`).join(L.tool.listSeparator) }));
  }
  const excluded = forms.filter((f) => f.excluded);
  if (excluded.length) {
    lines.push(fill(L.tool.formsExcludedLine, { list: excluded.map((f) => `${L.form[f.form]}${L.tool.parenOpen}${f.reason ?? ""}${L.tool.parenClose}`).join(L.tool.listSeparator) }));
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

// ---------- shared analysis ----------

/**
 * The body of analyze_system, shared with analyze_second_order (which feeds it the reduced system
 * x' = y, y' = F together with `second`, the reduction shown to students): compiles the system,
 * finds and classifies the equilibria in the box, samples the field, and returns the Scene plus
 * the summary lines (header with the singular-sample note, then one line per equilibrium). The
 * handler shells stay thin. Checks that concern the planar system itself (time dependence,
 * uniqueness lines) belong here so both tools get them. With `second` every line speaks the
 * second-order notation (round P): the header names the x and x' ranges, the sampled field is
 * (v, F) with v = x', the non-autonomous note speaks of the equation, and points read (x, x');
 * the kernel's y never appears.
 */
export function analyzePlanar(
  spec: SystemSpec,
  box: Box,
  density: number,
  locale: Locale,
  snapshotT: number,
  checkpoint: () => void,
  second?: NonNullable<Scene["secondOrder"]>,
): { scene: Scene; lines: string[] } {
  const L = labels(locale);
  const sys = compileOrExplain(spec);
  const header = second
    ? fill(L.tool.secondOrderHeader, { xMin: fmt(box.x.min), xMax: fmt(box.x.max), xpMin: fmt(box.y.min), xpMax: fmt(box.y.max) })
    : fill(L.tool.systemHeader, { f: spec.f, g: spec.g, ...boxValues(box) });
  const singularNote = (count: number) => (count ? " " + fill(L.tool.singularSamples, { count }) : "");
  // Non-autonomous (t appears in f or g: the static rule of lib/core/time-dependence): equilibria
  // and linearized stability are tools for autonomous systems and are not attempted. Return only
  // the field, as a snapshot at the requested time, and say so, with the probe's evidence.
  const td = detectTimeDependence(sys, box, { checkpoint, snapshotT });
  if (td.dependsOnT) {
    const field = sampleField(sys, box, density, density, snapshotT, checkpoint);
    const scene: Scene = { kind: "analyze_system", locale, system: spec, box, field, timeDependent: { snapshotT, maxRelDeviation: td.maxRelDeviation }, ...(second ? { secondOrder: second } : {}) };
    const note = fill(second ? L.tool.timeDependentSecond : L.tool.timeDependent, { t: fmt(snapshotT), evidence: timeDependenceEvidence(L, td) });
    const shown = second ? second.reduced : { f: spec.f, g: spec.g };
    const line = fill(L.tool.sampleFieldLine, { nx: field.nx, ny: field.ny, f: shown.f, g: shown.g, maxMag: fmt(field.maxMag), singular: field.singularCount });
    return { scene, lines: [`${header}${singularNote(field.singularCount)}`, note, line] };
  }
  const eq = findEquilibria(sys, box, { checkpoint });
  const field = sampleField(sys, box, density, density, 0, checkpoint);
  const scene: Scene = {
    kind: "analyze_system",
    locale,
    system: spec,
    box,
    field,
    equilibria: withUniqueness(sys, eq.points, box, checkpoint),
    warning: eq.warning,
    truncated: eq.truncated,
    singularPoints: eq.singularPoints,
    underflowPlateau: eq.underflowPlateau,
    ...(eq.seeding.refineCapped ? { refineCapped: true } : {}),
    ...(second ? { secondOrder: second } : {}),
  };
  // P2.3: on a second-order equation the point (c, 0) of the phase plane is the constant solution x ≡ c.
  const meaning = second && scene.equilibria?.length ? [L.tool.equilibriaSecondNote] : [];
  return { scene, lines: [`${header}${singularNote(field.singularCount)}`, ...meaning, ...describeEquilibria(scene, locale)] };
}

// ---------- tools ----------

/**
 * Registers the seven analysis tools. Every tool is linked to the widget resource (`widgetUri`)
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
        `${CALL_FIRST_PREFIX} for any question that involves a concrete planar system x' = f(x, y), y' = g(x, y) ` +
        "(two first-order equations with actual right-hand sides), before saying anything about its equilibria, " +
        "their type or stability, or its phase portrait. Even when you can find and classify the equilibria in " +
        "closed form (a linear system, a textbook predator-prey model), " + CALL_FIRST_TAIL + " " +
        "WHAT IT COMPUTES: finds all equilibrium points of the planar system x' = f(x, y), y' = g(x, y) inside a viewing box and " +
        "classifies each one from its Jacobian (eigenvalues, trace, determinant): stable/unstable node, saddle, " +
        "stable/unstable spiral, star or degenerate node, center-or-weak-spiral, non-hyperbolic. Also returns a " +
        "sampled vector field for drawing the phase portrait. " +
        "USE THIS whenever a student asks about equilibria, fixed points, stability, the phase portrait, the type " +
        "of a critical point, eigenvalues of the linearization, or long-term behavior of a 2D autonomous system. " +
        "For a single first-order equation dy/dt = g(t, y) use analyze_first_order instead. " +
        NON_AUTONOMOUS_RULE + " " +
        EXPRESSION_RULES + " " + BOX_RULES + " " + LOCALE_RULE + " " + NEVER_COMPUTE,
      inputSchema: {
        f: expression.describe("Right-hand side of x' (dx/dt)."),
        g: expression.describe("Right-hand side of y' (dy/dt)."),
        params: paramsSchema,
        ...boxShape,
        density: density.describe("Grid points per axis for the returned vector field (5..60)."),
        t: snapshotTime,
        locale: localeSchema,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: ui,
    },
    (input) =>
      guarded(d, (checkpoint) => {
        const box = resolveBox(input);
        const spec: SystemSpec = input.params ? { f: input.f, g: input.g, params: input.params } : { f: input.f, g: input.g };
        const { scene, lines } = analyzePlanar(spec, box, input.density, input.locale, input.t, checkpoint);
        return ok(lines.join("\n"), scene);
      }),
  );

  registerAppTool(
    server,
    "analyze_second_order",
    {
      title: "Analyze a second-order equation x'' = F(t, x, x')",
      description:
        `${CALL_FIRST_PREFIX} for any question that involves a concrete second-order equation in x(t), given as ` +
        "x'' = F(t, x, x') or as a full equation such as x'' + a*x' + b*x = 0, before saying anything about its " +
        "equilibria, stability or phase plane. Even when you can solve the equation in closed form (a linear " +
        "oscillator with a characteristic equation is exactly the case you are tempted to skip), " + CALL_FIRST_TAIL + " " +
        SECOND_ORDER_NOTATION + " " +
        "WHAT IT COMPUTES: reduces the equation with v = x' to the planar system x' = v, v' = F(t, x, v), then does " +
        "exactly what analyze_system does for that system: all equilibrium points (x, x') inside the viewing box, each " +
        "classified from its Jacobian (eigenvalues, trace, determinant), plus a sampled vector field for the phase " +
        "portrait. The text summary starts with the reduction step, because students get that step wrong; read it " +
        "to the student. " +
        SECOND_ORDER_NON_AUTONOMOUS_RULE + " " +
        "USE THIS whenever a student gives ONE second-order equation, either as x'' = F(t, x, x') or as a full " +
        "equation such as x'' + a*x' + b*x = 0: harmonic, damped and forced oscillators, the pendulum x'' = -sin(x), " +
        "Van der Pol x'' - (1 - x^2)*x' + x = 0, Duffing x'' + d*x' + a*x + b*x^3 = 0, and questions about the " +
        "phase plane, equilibria or stability of such an equation. Do not reduce the equation yourself and call " +
        "analyze_system; pass the equation as written. For a system of two first-order equations use " +
        "analyze_system; for one first-order equation dy/dt = g(t, y) use analyze_first_order. " +
        "Input syntax for `equation`: the unknown is x, its derivatives are written x' and x'' with straight " +
        "apostrophes (v is accepted as an alias of x' and shown as x'), t is the independent variable and may appear " +
        "anywhere (a t in the equation makes it non-autonomous, also when it multiplies x''); y is rejected because " +
        "the problem has no y. Either a full " +
        "equation with exactly one = (x'' + 0.5*x' + x = 0, (1 + x^2)*x'' = -x) or just the right-hand side F " +
        "of x'' = F (-sin(x) - 0.2*x'). The equation must be affine in x'': the coefficient of x'' may depend on x, x' " +
        "and t, as in (1 + x^2)*x'' = -x or t*x'' + x' = 0, but forms that are not affine in x'' (x''^2, sin(x''), " +
        "x''*x'') are rejected. " +
        "The reduction is checked numerically at sample points spread over the viewing box and a generic square, at " +
        "several times t; a term that is only active away from every sample point (a piecewise x''^2 branch outside " +
        "the box) cannot be detected, so choose the box the student cares about. " +
        "Write multiplication explicitly: x*x', 2*x, not xx' (2x is accepted). Powers use ^, e.g. x^3. " +
        "Allowed functions: sin cos tan asin acos atan atan2 sinh cosh tanh exp log log10 sqrt abs sign pow min max floor ceil round; " +
        'constants pi and e. Any other constant goes into "params" as a number (e.g. {"a": 0.5}) and is referenced by name (v is reserved). ' +
        FRACTIONAL_POWER_NOTE + " " +
        SECOND_ORDER_BOX_RULES + " " + LOCALE_RULE + " " + NEVER_COMPUTE,
      inputSchema: {
        equation: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe("The second-order equation in x(t): x'' = F(t, x, x') written as a full equation with one =, or just F. Derivatives are x' and x'' (v means x'); t is the independent variable."),
        params: paramsSchema,
        ...secondOrderBoxShape,
        density: density.describe("Grid points per axis for the returned vector field (5..60)."),
        t: snapshotTime.describe("Snapshot time for a non-autonomous equation (t appears in F): the phase-plane field is sampled at this t. Ignored otherwise."),
        locale: localeSchema,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: ui,
    },
    (input) =>
      guarded(d, (checkpoint) => {
        const L = labels(input.locale);
        // The vertical range is the velocity x' (xpMin / xpMax); the kernel's box keeps calling it y.
        const box = resolveBox({ xMin: input.xMin, xMax: input.xMax, yMin: input.xpMin, yMax: input.xpMax }, "xp");
        const reduced = reduceSecondOrder(input.equation, input.params, { box });
        const second = { equation: reduced.equation, reduced: reduced.reduced };
        const { scene, lines } = analyzePlanar(reduced.spec, box, input.density, input.locale, input.t, checkpoint, second);
        const reduction = fill(L.tool.secondOrderReduced, { equation: reduced.equation, g: reduced.reduced.g });
        return ok([reduction, ...lines].join("\n"), scene);
      }),
  );

  registerAppTool(
    server,
    "trace_trajectory",
    {
      title: "Trace a trajectory",
      description:
        `${CALL_FIRST_PREFIX} whenever a question involves a concrete planar system x' = f(x, y), y' = g(x, y) AND a ` +
        "specific starting point or solution curve (where does the solution through (x0, y0) go, does it reach an " +
        "equilibrium or a cycle, draw the solution), before describing that solution. Even when the solution is " +
        "known in closed form (a linear system, a circle, an exponential), " + CALL_FIRST_TAIL + " " +
        "WHAT IT COMPUTES: numerically integrates the planar system x' = f(x, y), y' = g(x, y) from an initial point (x0, y0), " +
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
        // Non-autonomous: the curve is still the solution through the start point, from t = 0; the
        // student must hear that another start time gives another curve. Equilibria are not
        // defined for such a system, so no uniqueness probe is run either (decided before any
        // findEquilibria call).
        const td = detectTimeDependence(sys, box, { checkpoint });
        // A curve through an equilibrium where uniqueness fails (x' = sqrt(|x|) at the origin) is
        // one of infinitely many: find the equilibria, probe them, and flag such curves.
        const trajectories = td.dependsOnT
          ? traced
          : markNonUnique(traced, { equilibria: withUniqueness(sys, findEquilibria(sys, box, { checkpoint }).points, box, checkpoint) }, box);
        const scene: Scene = {
          kind: "trace_trajectory",
          locale: input.locale,
          system: spec,
          box,
          start,
          trajectories,
          ...(td.dependsOnT ? { timeDependent: { snapshotT: 0, maxRelDeviation: td.maxRelDeviation } } : {}),
        };
        const lines = trajectories.flatMap((t) => {
          const end = t.points[t.points.length - 1];
          const line = fill(L.tool.trajectoryLine, {
            direction: t.direction === "forward" ? L.tool.forward : L.tool.backward,
            tEnd: fmt(t.tEnd, 3),
            end: formatPoint(end),
            // Non-autonomous: a low-speed stop is not an equilibrium (lib/labels-trajectory).
            status: statusSentence(t.status, L, td.dependsOnT ? { snapshotT: 0, maxRelDeviation: td.maxRelDeviation } : undefined),
            steps: t.steps,
          });
          return t.nonUnique ? [line, L.tool.nonUniqueTrajectory] : [line];
        });
        if (td.dependsOnT) {
          const traced = input.direction === "both" ? L.tool.tracedBoth : input.direction === "forward" ? L.tool.tracedForward : L.tool.tracedBackward;
          lines.push(fill(L.tool.timeDependentTrajectory, { evidence: timeDependenceEvidence(L, td), traced }));
        }
        return ok(`${fill(L.tool.trajectoryHeader, { start: formatPoint(start), f: spec.f, g: spec.g })}\n${lines.join("\n")}`, scene);
      }),
  );

  registerAppTool(
    server,
    "sample_field",
    {
      title: "Sample the vector field",
      description:
        `${CALL_FIRST_PREFIX} whenever a question involves the direction field, vector field or phase-plane arrows ` +
        "of a concrete planar system x' = f(x, y), y' = g(x, y) and no equilibrium analysis is wanted. Even when the " +
        "field is simple enough to sketch by hand, " + CALL_FIRST_TAIL + " " +
        "WHAT IT COMPUTES: samples the vector field (f, g) of the planar system x' = f(x, y), y' = g(x, y) on a regular grid inside " +
        "the viewing box and returns the arrows (position, vector, magnitude) for drawing, plus the maximum " +
        "magnitude and how many grid points are singular. " +
        "USE THIS when a student just wants to see the direction field / vector field / phase plane arrows of a " +
        "system without an equilibrium analysis, or to render a picture in the widget. For equilibria and stability " +
        "use analyze_system, which also returns a field. " +
        NON_AUTONOMOUS_RULE + " " +
        EXPRESSION_RULES + " " + BOX_RULES + " " + LOCALE_RULE + " " + NEVER_COMPUTE,
      inputSchema: {
        f: expression.describe("Right-hand side of x' (dx/dt)."),
        g: expression.describe("Right-hand side of y' (dy/dt)."),
        params: paramsSchema,
        ...boxShape,
        density,
        t: snapshotTime,
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
        const td = detectTimeDependence(sys, box, { checkpoint, snapshotT: input.t });
        const field = sampleField(sys, box, input.density, input.density, input.t, checkpoint);
        const scene: Scene = {
          kind: "sample_field",
          locale: input.locale,
          system: spec,
          box,
          field,
          ...(td.dependsOnT ? { timeDependent: { snapshotT: input.t, maxRelDeviation: td.maxRelDeviation } } : {}),
        };
        const line = fill(L.tool.sampleFieldLine, { nx: field.nx, ny: field.ny, f: spec.f, g: spec.g, maxMag: fmt(field.maxMag), singular: field.singularCount });
        // The snapshot note comes first, so the field line it explains follows it.
        const note = td.dependsOnT ? fill(L.tool.timeDependent, { t: fmt(input.t), evidence: timeDependenceEvidence(L, td) }) + "\n" : "";
        return ok(`${note}${line} ${L.tool.widgetDraws}`, scene);
      }),
  );

  registerAppTool(
    server,
    "analyze_first_order",
    {
      title: "Analyze a first-order equation (dy/dt = g(t, y), or M dt + N dy = 0)",
      description:
        `${CALL_FIRST_PREFIX} for any question that involves a concrete first-order equation, given as dy/dt = g(t, y) ` +
        "or as M(t, y) dt + N(t, y) dy = 0 (exact, separable, linear, Bernoulli, logistic: any equation with actual " +
        "right-hand sides), before saying what method solves it or what its solutions do. Even when you can solve the " +
        "equation in closed form (a standard exact or separable equation is exactly the case you are tempted to skip), " +
        CALL_FIRST_TAIL + " " +
        "WHAT IT COMPUTES: for a single first-order ODE, given either explicitly as dy/dt = g(t, y) (parameter `expr`) or in " +
        "differential form M(t, y) dt + N(t, y) dy = 0 (parameters `M` and `N`, the natural form of exact " +
        "equations). Returns: the slope/direction field inside the viewing box (undirected segments for the " +
        "differential form, which has no natural direction); constant solutions y = c with their stability " +
        "(stable / unstable / semi-stable / varies with t; a line on the edge of the equation's domain, such as " +
        "y = 0 for dy/dt = sqrt(y), is judged on its defined side only: approached or left; note that a fractional " +
        "power of a negative base is undefined in this tool, so 3*y^(2/3) is reported as defined for y >= 0 only, " +
        "and the real branch must be written abs(y)^(2/3) or sign(y)*abs(y)^p), each with a " +
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
            untestableReason: eq.untestableReason,
            identicallyZero: eq.identicallyZero,
            solutions: eq.solutions,
            resolution: eq.resolution,
            zeroPlateaus: eq.zeroPlateaus,
            singularities: singular.points,
            singularitiesTruncated: singular.truncated,
            singularitiesWarning: singular.warning,
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
              // The truncation is stated once, by the singularitiesTruncated sentence below.
              truncated: "",
            }),
          );
          if (singular.warning === "possible_continuum") lines.push(L.ui.singularitiesContinuum);
          if (singular.truncated) lines.push(fill(L.ui.singularitiesTruncated, { max: singular.points.length }));
        }
        if (eq.solutions.length) {
          // Per line: the sentence, then the plateau / probe-count notes and the uniqueness sentence
          // when they apply (nothing is printed for a bounded uniqueness result).
          for (const s of eq.solutions) lines.push(...constantSolutionLines(L, s, spec));
        } else {
          lines.push(noConstantSentence(L, eq.autonomous, eq.untestableReason, eq.identicallyZero));
        }
        // The zero-plateau notice when it applies, and the scan resolution (always: a fact, not a warning).
        lines.push(...constantSolutionNotices(L, eq));
        lines.push(...describeForms(forms, locale));
        if (implicit) {
          lines.push(fill(L.tool.exactImplicit, { levels: implicit.levels.length, deviation: implicit.pathDeviation.toExponential(1) }));
        } else if (implicitCheck && !implicitCheck.passed) {
          lines.push(fill(L.tool.exactPathCheckFailed, { deviation: formatDeviation(implicitCheck.pathDeviation), tol: implicitCheck.tol.toExponential(0) }));
        }
        return ok(lines.join("\n"), scene);
      }),
  );

  registerAppTool(
    server,
    "query_solution",
    {
      title: "Evaluate the numerical solution: its value at a time, or when it reaches a value",
      description:
        `${CALL_FIRST_PREFIX} whenever the question is 'what is the value of the solution at some time' or 'when does ` +
        "the solution reach some value' for a concrete equation or system with an initial condition: y(2) for dy/dt = y " +
        "with y(0) = 1, the time at which a population reaches 500, when a trajectory first crosses x = 0, the position " +
        "of an oscillator at t = pi. Even when the solution is known in closed form (y = e^t, a logistic curve, cos t), " +
        "never evaluate that closed form mentally: " + CALL_FIRST_TAIL + " " +
        "WHAT IT COMPUTES: integrates the NUMERICAL solution through the initial point forward and backward (adaptive " +
        "Dormand-Prince, tolerance 1e-6) and then either re-integrates to exactly the target time (target.kind 't' for a " +
        "system) or finds every crossing of the target coordinate along the numerical solution (target.kind 't' or 'y' " +
        "for a first-order equation, where t is the horizontal coordinate; 'x' or 'y' for a system), each crossing " +
        "solved in time by re-integration, never by interpolating between points. Returns one line per hit with an " +
        "error estimate, a note when the target was not reached (with where each direction stopped and why: left the " +
        "box, blew up, reached an equilibrium, span ended), when the run stopped before the target time, or when a " +
        "periodic-looking solution may cross again beyond the span. " +
        "USE THIS for any 'value at a time' or 'when does it reach a value' question about a specific solution: such a " +
        "question must call this tool and is never answered from a closed form; use trace_trajectory to see " +
        "the whole curve, analyze_first_order / analyze_system for equilibria and stability. " +
        "Inputs: `mode` selects the equation form and which expression parameters are read: 'first' (expr: dy/dt = " +
        "g(t, y)), 'diff' (M and N: M dt + N dy = 0), 'system' (f and g: x' = f, y' = g), 'second' (equation: x'' = " +
        "F(t, x, x') or a full equation, reduced with v = x' to x' = v, v' = F as analyze_second_order does). " +
        "The initial point is (t0, y0) for first / diff (t0 is the initial t); (x0, y0) at time t0 for system " +
        "(t0 defaults to 0 and only matters when f or g mentions t); and x(t0) = x0, x'(t0) = xp0 for second " +
        "(xp0 is the initial velocity x'; t0 defaults to 0 and matters for a forced, non-autonomous equation). " +
        "`target` is { kind, value }: for first / diff kind 't' (a t coordinate) or 'y' (a y value); for system " +
        "kind 't' (a time), 'x' or 'y' (a coordinate value); for second kind 't' (a time), 'x' (a position) or 'y', " +
        "which there means the VELOCITY x' (the result names it x'). Every returned point of a 'second' query is " +
        "(t, x, x'): the second coordinate is x', never a y of its own. tSpan (default 20, at most 1000) is " +
        "integrated in EACH direction; the solution is followed up to 20 times beyond the viewing box. For mode " +
        "'diff' the curve M dt + N dy = 0 has no time and no direction: tSpan is the length of the curve's own " +
        "parameter followed on each side of the start (dt = N per unit of it), the hits are points (t, y) of the " +
        "picture, and the summary names the two sides, never a direction or a time reached. " +
        EXPRESSION_RULES + " For first / diff the variables are t and y only (x is rejected; write t). " +
        "For 'second' the unknown is x(t) with derivatives x' and x'' (v means x'), t is the independent variable, " +
        "and y is rejected; the viewing box's vertical range may be given as xpMin / xpMax (the x' range). " +
        BOX_RULES + " " + LOCALE_RULE + " " + NEVER_COMPUTE,
      inputSchema: {
        mode: z.enum(["first", "diff", "system", "second"]).describe("Which form the equation is given in: first (expr), diff (M, N), system (f, g), second (equation)."),
        expr: expression.optional().describe("mode first: the right-hand side g(t, y) of dy/dt = g(t, y)."),
        M: expression.optional().describe("mode diff: M(t, y) in M dt + N dy = 0."),
        N: expression.optional().describe("mode diff: N(t, y) in M dt + N dy = 0."),
        f: expression.optional().describe("mode system: the right-hand side of x'."),
        g: expression.optional().describe("mode system: the right-hand side of y'."),
        equation: z.string().trim().min(1).max(200).optional().describe("mode second: the second-order equation x'' = F(t, x, x') in x(t), as analyze_second_order takes it."),
        params: paramsSchema,
        t0: coordinate.optional().describe("mode first / diff: the t coordinate of the initial point (t0, y0), required. mode system / second: the start time of the solution (default 0; the initial values are given at this t)."),
        x0: coordinate.optional().describe("mode system: the initial x; mode second: the initial position x(t0). Not used for first / diff (give t0)."),
        y0: coordinate.optional().describe("mode first / diff / system: the initial y (required). mode second: use xp0 instead."),
        xp0: coordinate.optional().describe("mode second: the initial velocity x'(t0)."),
        target: z
          .object({
            kind: z.enum(["t", "x", "y"]).describe("first / diff: 't' (a t coordinate) or 'y'; system: 't' (a time), 'x' or 'y'; second: 't' (a time), 'x' (a position) or 'y' (meaning the velocity x')."),
            value: coordinate.describe("The target value."),
          })
          .describe("What is asked: the value at a time (kind 't' for a system) or the crossings of a coordinate value."),
        tSpan: z.number().positive().max(1000).default(20).describe("Time span integrated in each direction (0 < tSpan <= 1000)."),
        ...boxShape,
        xpMin: coordinate.optional().describe("mode second: bottom of the x' range (used instead of yMin)."),
        xpMax: coordinate.optional().describe("mode second: top of the x' range (used instead of yMax)."),
        locale: localeSchema,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: ui,
    },
    (input) =>
      guarded(d, (checkpoint) => {
        const L = labels(input.locale);
        const firstOrder = input.mode === "first" || input.mode === "diff";
        const secondMode = input.mode === "second";
        // A second-order picture's vertical range is x' (xpMin / xpMax when given); the kernel's box calls it y.
        const box = secondMode
          ? resolveBox({ xMin: input.xMin, xMax: input.xMax, yMin: input.xpMin ?? input.yMin, yMax: input.xpMax ?? input.yMax }, input.xpMin !== undefined || input.xpMax !== undefined ? "xp" : "y")
          : resolveBox(input);
        const need = (name: "expr" | "M" | "N" | "f" | "g" | "equation"): string => {
          const v = input[name];
          if (typeof v !== "string") throw new ToolInputError(`mode '${input.mode}' needs \`${name}\`.`);
          return v;
        };
        // The equation in the form the mode names, its planar system, and the text of the header.
        let spec: SystemSpec;
        let equation: string;
        let secondOrder: Scene["secondOrder"];
        let firstOrderSpec: FirstOrderSpec | undefined;
        let fieldStyle: Scene["fieldStyle"];
        if (input.mode === "first" || input.mode === "diff") {
          const fo: FirstOrderSpec =
            input.mode === "first"
              ? { kind: "explicit", g: need("expr"), ...(input.params ? { params: input.params } : {}) }
              : { kind: "differential", M: need("M"), N: need("N"), ...(input.params ? { params: input.params } : {}) };
          spec = toSystem(fo);
          firstOrderSpec = fo;
          compileOrExplainFirstOrder(fo, spec);
          equation = fo.kind === "explicit" ? `dy/dt = ${fo.g}` : `(${fo.M}) dt + (${fo.N}) dy = 0`;
          fieldStyle = fo.kind === "differential" ? "segments" : "arrows";
        } else if (input.mode === "system") {
          spec = input.params ? { f: need("f"), g: need("g"), params: input.params } : { f: need("f"), g: need("g") };
          equation = fill(L.ui.equationSystem, { f: spec.f, g: spec.g });
        } else {
          const reduced = reduceSecondOrder(need("equation"), input.params, { box });
          spec = reduced.spec;
          secondOrder = { equation: reduced.equation, reduced: reduced.reduced };
          equation = reduced.equation;
        }
        const sys = compileOrExplain(spec);
        // The initial point: (t0, y0) on a first-order picture; (x0, y0) at the start time t0 on a
        // planar one; x(t0) = x0, x'(t0) = xp0 on a second-order one (y0 is still read there as a
        // fallback, since the kernel's second coordinate is the velocity). No aliases between t0
        // and x0 (round P): t0 is always a t.
        let h: number;
        let startTime = 0;
        if (firstOrder) {
          if (typeof input.x0 === "number") throw new ToolInputError("A first-order equation has the coordinates t and y: give the initial point as t0 and y0, not x0.");
          if (typeof input.t0 !== "number") throw new ToolInputError("mode 'first' / 'diff' needs `t0`, the t coordinate of the initial point.");
          h = input.t0;
        } else {
          if (typeof input.x0 !== "number") throw new ToolInputError(secondMode ? "mode 'second' needs `x0`, the initial position x(t0)." : "mode 'system' needs `x0`, the initial x (t0 is the start time, not a coordinate).");
          h = input.x0;
          startTime = input.t0 ?? 0;
        }
        const v0 = secondMode ? (input.xp0 ?? input.y0) : input.y0;
        if (typeof v0 !== "number") throw new ToolInputError(secondMode ? "mode 'second' needs `xp0`, the initial velocity x'(t0)." : "`y0`, the initial y, is required.");
        if (secondMode && input.xp0 !== undefined && input.y0 !== undefined && input.xp0 !== input.y0) throw new ToolInputError("mode 'second' takes the initial velocity as `xp0`; do not give a different `y0` as well.");
        const start = { x: h, y: v0 };
        // The student's target kind -> the kernel's: on a first-order picture t is the horizontal
        // coordinate (kernel "x") and there is no separate time; on a planar one t is the time. On
        // a second-order picture the kind "y" is the velocity x' (the kernel's y).
        let target: QueryTarget;
        if (firstOrder) {
          if (input.target.kind === "x") throw new ToolInputError("A first-order equation has the coordinates t and y: use target.kind 't' (a t coordinate) or 'y', not 'x'.");
          target = { kind: input.target.kind === "t" ? "x" : "y", value: input.target.value };
        } else {
          target = { kind: input.target.kind === "t" ? "time" : input.target.kind, value: input.target.value };
        }
        const result = querySolution(sys, start, target, { tSpan: input.tSpan, stopBox: fixedStopBox(box), t0: startTime, checkpoint });
        const traced: TrajectoryView[] = [result.forward, result.backward].map((leg, i) => ({
          direction: i === 0 ? "forward" : "backward",
          points: thin(leg.points, 1000),
          status: leg.status,
          steps: leg.steps,
          tEnd: leg.tEnd,
          stop: "far",
        }));
        const td = firstOrder ? null : detectTimeDependence(sys, box, { checkpoint, snapshotT: startTime });
        const timeDependent = td?.dependsOnT ? { snapshotT: startTime, maxRelDeviation: td.maxRelDeviation } : undefined;
        // A curve through a point where uniqueness fails is one of many (as trace_trajectory does).
        const trajectories =
          firstOrderSpec
            ? markNonUnique(traced, {}, box, { sys, firstOrder: firstOrderSpec, checkpoint })
            : timeDependent
              ? traced
              : markNonUnique(traced, { equilibria: withUniqueness(sys, findEquilibria(sys, box, { checkpoint }).points, box, checkpoint) }, box);
        const scene: Scene = {
          kind: "query_solution",
          locale: input.locale,
          system: spec,
          box,
          start,
          trajectories,
          ...(fieldStyle ? { fieldStyle } : {}),
          ...(firstOrderSpec ? { firstOrderSpec } : {}),
          ...(secondOrder ? { secondOrder } : {}),
          ...(timeDependent ? { timeDependent } : {}),
          query: { target: input.target, hits: result.hits, note: result.note, reached: result.reached },
        };
        const targetText = queryTargetText(scene.query!, L, secondMode);
        const lines: string[] = [];
        lines.push(
          firstOrder
            ? fill(L.tool.queryHeaderFirst, { equation, t0: fmt(start.x), y0: fmt(start.y), target: targetText })
            : secondOrder
              ? fill(L.tool.queryHeaderSecond, { equation, t0: fmt(startTime), x0: fmt(start.x), xp0: fmt(start.y), target: targetText })
              : fill(L.tool.queryHeaderSystem, { f: spec.f, g: spec.g, start: formatPoint(start), t0: fmt(startTime), target: targetText }),
        );
        if (secondOrder) lines.unshift(fill(L.tool.secondOrderReduced, { equation: secondOrder.equation, g: secondOrder.reduced.g }));
        lines.push(...queryLines(scene, L));
        // Where each leg got to. The kernel's tEnd is its integration parameter: the student's t
        // only on a planar picture. On an explicit first-order picture the t reached is the end
        // point's horizontal coordinate; on a differential form there is no direction and no t
        // number at all, only the two end points (round P2.1).
        const differential = firstOrderSpec?.kind === "differential";
        if (differential) {
          for (const [i, t] of trajectories.entries()) {
            const end = t.points[t.points.length - 1];
            lines.push(fill(L.tool.queryLegDiff, { side: i === 0 ? L.tool.sideOne : L.tool.sideOther, end: formatPoint(end), status: trajectoryStatus(t, L, undefined, true) }));
          }
        } else {
          for (const t of trajectories) {
            const end = t.points[t.points.length - 1];
            const direction = t.direction === "forward" ? L.tool.forward : L.tool.backward;
            lines.push(
              firstOrder
                ? fill(L.tool.queryLegFirst, { direction, t: fmt(end.x, 3), end: formatPoint(end), status: trajectoryStatus(t, L) })
                : fill(L.tool.queryLeg, { direction, tEnd: fmt(t.tEnd, 3), end: pointText(L, end, secondMode), status: trajectoryStatus(t, L, timeDependent) }),
            );
          }
        }
        if (trajectories.some((t) => t.nonUnique)) lines.push(L.tool.nonUniqueTrajectory);
        if (timeDependent && td) lines.push(fill(L.tool.timeDependentTrajectory, { evidence: timeDependenceEvidence(L, td), traced: L.tool.tracedBoth }));
        return ok(lines.join("\n"), scene);
      }),
  );
}
