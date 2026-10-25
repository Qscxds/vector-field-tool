/**
 * The series / solution-formula panel as pure state and one pure computation (round 12), shared by
 * the web shell (components/SeriesPanel) and the MCP tools (app/mcp/series-tools): what the
 * settings are, their defaults and bounds, and what one computation returns, a derivation (lib/labels-series)
 * plus the curves of its chart (lib/series/chart).
 *
 * - "series": the power series about t0 of a linear equation with polynomial coefficients, the
 *   partial sum through the chosen power next to the numerical solution with the same initial
 *   values, and the interval where convergence is guaranteed;
 * - "formula": the split u = u_h + u_p of a constant-coefficient equation, the three curves u, u_h
 *   and u_p, and the check of the formula against the numerical solution.
 *
 * Available in the two modes that ARE one equation for one unknown: dy/dt = g(t, y) ("first") and
 * a second-order equation ("second"). Nothing here knows lecture mode; switching it recomputes nothing.
 */
import type { Range, Vec2 } from "./core/types";
import type { LabelTable } from "./labels";
import {
  equationFailureText, formulaDerivation, notConstantText, notPolynomialText, seriesDerivation, seriesLetters, unknownNames, type Derivation,
  type FormulaCheckResult,
} from "./labels-series";
import { reduceSecondOrder } from "./core/second-order";
import { checkFormula, clipPolyline, numericalSolution, OFF_CHART_HEIGHTS, REFERENCE_ATOL, REFERENCE_RTOL, sampleCurve } from "./series/chart";
import { constantCoefficientOde, constantsFor, evaluateSolution, growthRate, particularResidualIsZero, solutionFormula, termScale } from "./series/decompose";
import { linearEquation, type ReductionOutcome, secondOrderSyntaxPasses, type SeriesMode } from "./series/equation";
import { f, fillFormula, type Formula, newContext, num, power, shiftedVariable, sub, terminatingDigits } from "./series/notation";
import { coefficientValues, MAX_SHOWN_TERMS, partialSum, polynomialOde, powerSeries } from "./series/power-series";
import { qpIsZero } from "./series/quasi";
import { type CQ, fromNumber, isZero, neg, type Q, SeriesTooExpensive, sign, toNumber } from "./series/rational";

export type SeriesKind = "series" | "formula";
export const SERIES_KINDS: readonly SeriesKind[] = ["series", "formula"];
export const DEFAULT_SERIES_TERMS = 8;
export const MIN_SERIES_TERMS = 1;
export const MAX_SERIES_TERMS = MAX_SHOWN_TERMS;

export type SeriesSettings = {
  /** null: the panel is off. */
  readonly kind: SeriesKind | null;
  /** The highest power N shown (MIN_SERIES_TERMS..MAX_SERIES_TERMS). */
  readonly terms: number;
  /** The expansion point t0, also where the initial values are given. */
  readonly center: number;
  /** u(t0) and u'(t0); the second is used by second-order equations only. */
  readonly initial: readonly [number, number];
};

export const DEFAULT_SERIES_SETTINGS: SeriesSettings = { kind: null, terms: DEFAULT_SERIES_TERMS, center: 0, initial: [1, 0] };

/** The panel's mode for an app mode, or null where it is not offered (a differential form, a planar system). */
export function seriesModeOf(mode: string): SeriesMode | null {
  return mode === "first" ? "first" : mode === "second" ? "second" : null;
}

/** How many initial values a mode takes: y(t0), or x(t0) and x'(t0). */
export function initialCount(mode: SeriesMode): 1 | 2 {
  return mode === "first" ? 1 : 2;
}

/** Line styles of the chart: the line style tells the curves apart, the colors only help. */
export const CHART_STYLE = {
  numerical: { color: "#1f2933", dash: [] as number[], width: 2 },
  partialSum: { color: "#c2410c", dash: [8, 4], width: 2.2 },
  band: "rgba(37, 99, 235, 0.10)",
  total: { color: "#1f2933", dash: [] as number[], width: 2.2 },
  homogeneous: { color: "#0f766e", dash: [8, 4], width: 1.8 },
  particular: { color: "#b45309", dash: [2, 3], width: 2 },
} as const;

export type ChartCurve = { readonly segments: readonly Vec2[][]; readonly color: string; readonly dash: readonly number[]; readonly width: number; readonly label: Formula };
export type ChartBand = { readonly min: number; readonly max: number; readonly color: string; readonly label: Formula };
export type SeriesChart = {
  readonly tRange: Range;
  readonly vRange: Range;
  readonly t0: number;
  readonly curves: readonly ChartCurve[];
  readonly bands: readonly ChartBand[];
  readonly caption: Formula;
};

export type SeriesPanelResult =
  | { readonly status: "off" }
  /** `parseMessage`: the parser's own (English) sentence when the text does not parse in its mode; a text-only caller reports it as an input error. */
  | { readonly status: "unavailable"; readonly message: Formula; readonly parseMessage?: string }
  | { readonly status: "ok"; readonly kind: SeriesKind; readonly derivation: Derivation; readonly chart: SeriesChart | null; readonly check: FormulaCheckResult | null };

export type SeriesPanelInput = {
  readonly mode: SeriesMode;
  /** g of dy/dt = g(t, y), or the second-order equation as typed. */
  readonly text: string;
  readonly params?: Record<string, number>;
  readonly settings: SeriesSettings;
  /** The t range of the picture: a first-order picture's horizontal range, the solution graph's t range. */
  readonly tRange: Range;
  /** The value range: a first-order picture's y range, a second-order picture's x range. */
  readonly vRange: Range;
  /** A wall-clock budget for the exact arithmetic and the reference integration (the shells pass one; lib stays clock-free). */
  readonly checkpoint?: () => void;
  /** false: no chart (a text-only caller); the power series then skips the reference integration, which only feeds the chart. Default true. */
  readonly chart?: boolean;
  /** The caller's own reduceSecondOrder outcome for this text and these parameters (the web page has it for its picture), so it is not run twice. */
  readonly reduction?: ReductionOutcome;
};

/** How far around t0 a series chart reaches when the radius ρ is finite: 2.5 ρ on each side. */
export const SERIES_CHART_RADII = 2.5;
/** The solution formula is compared with the numerical solution on |t − t0| <= this (where the reference is well conditioned). */
export const CHECK_HALF_WIDTH = 1;
/**
 * ... and never farther than this many e-foldings of the fastest mode (|Re r| times the half-width):
 * an error of the reference grows like e^(|Re r| |t − t0|) in one direction or the other, so e^8 ≈ 3000
 * times REFERENCE_RTOL stays far below CHECK_RELATIVE_TOL. y' = 40(y − t) is compared on |t| <= 0.2.
 */
export const CHECK_GROWTH = 8;
/**
 * Terms of the formula more than this many times the solution's own size (near resonance: 10^11 and
 * cancelling): evaluating it in floating point errs by about the ratio times 10^-16, which here
 * approaches CHECK_RELATIVE_TOL, so the comparison is not made and the check says why. Measured
 * (round 12, third review): cos(1.000000001 t) against x'' + x, ratio 1e9, still compares to 9.4e-8,
 * a tenth of the tolerance; ratio 2e10 reaches 2.1e-6.
 */
export const CANCELLATION_LIMIT = 1e9;
/** The formula's terms times this (about 5 ulps) is its own rounding noise when it is drawn. */
const DRAW_NOISE = 1e-15;
/** A series chart narrower than this many ulps of t0 cannot be drawn (a radius of a few ulps); the panel then has no chart. */
export const MIN_CHART_ULPS = 1024;

function exact(v: number): Q {
  return fromNumber(v) ?? fromNumber(0)!;
}

/**
 * The caller's checkpoint for what comes AFTER the exact derivation (the check's floating-point work and
 * the chart). `checkpoint` throws once, when the budget runs out, to stop a reference integration (which
 * catches it and returns no curve); `quiet` never throws (the 401 samples of a curve are cheap); `spent`
 * says whether it ran out. A finished derivation is never thrown away for its check or its picture.
 */
type AfterBudget = { readonly checkpoint?: () => void; readonly quiet?: () => void; readonly spent: () => boolean };
function afterBudget(checkpoint?: () => void): AfterBudget {
  if (!checkpoint) return { spent: () => false };
  let spent: unknown = null;
  // Once spent it KEEPS throwing, so a later integration stops at its first step instead of running unbudgeted.
  const guarded = () => {
    if (spent !== null) throw spent;
    try {
      checkpoint();
    } catch (error) {
      spent = error;
      throw error;
    }
  };
  return {
    checkpoint: guarded,
    quiet: () => {
      try {
        guarded();
      } catch {
        // spent: the curve is finished quietly
      }
    },
    spent: () => spent !== null,
  };
}

/** Whether a curve's pieces show inside the value range (a point within it, or a step across it), not merely within the off-chart margin. */
function visible(segments: readonly Vec2[][], values: Range): boolean {
  const inside = (y: number) => y >= values.min && y <= values.max;
  const across = (a: number, b: number) => (a < values.min && b > values.max) || (a > values.max && b < values.min);
  return segments.some((piece) => piece.some((p, i) => inside(p.y) || (i > 0 && across(piece[i - 1].y, p.y))));
}

/** Whether an exponent looks like the double of an irrational value (16+ significant digits, or not a terminating decimal) rather than a short typed number. */
function looksRounded(mu: CQ): boolean {
  return [mu.re, mu.im].some((v) => {
    if (isZero(v)) return false;
    const digits = terminatingDigits(sign(v) < 0 ? neg(v) : v);
    return digits === null || digits >= 16;
  });
}

/** The derivation and the chart for the panel's settings (status "off" when the panel is off). */
export function computeSeriesPanel(L: LabelTable, input: SeriesPanelInput): SeriesPanelResult {
  const { settings, mode } = input;
  if (settings.kind === null) return { status: "off" };
  // The second-order reduction once (the caller's when it has one): the exact reader takes its syntax
  // verdict, the reference integration its reduced system.
  // Without one from the caller, the reduction's costly sampling (no budget, seconds on a long product)
  // is skipped when the syntax pre-filter passes: the exact reader decides the numerical refusals
  // itself, and a reference integration reduces lazily if it is needed at all.
  let reduction = input.reduction;
  if (mode === "second" && !reduction) {
    if (secondOrderSyntaxPasses(input.text, input.params)) reduction = { error: null };
    else {
      try {
        reduction = { error: null, reduced: reduceSecondOrder(input.text, input.params) };
      } catch (error) {
        reduction = { error };
      }
    }
  }
  const reduced = reduction?.reduced;
  input.checkpoint?.();
  const parsed = linearEquation(mode, input.text, input.params, input.checkpoint, reduction);
  if (!parsed.ok) {
    const message = equationFailureText(L, mode, parsed.failure);
    return parsed.failure.reason === "parse" ? { status: "unavailable", message, parseMessage: parsed.failure.message } : { status: "unavailable", message };
  }
  const equation = parsed.equation;
  const letters = seriesLetters(Object.keys(input.params ?? {}));
  const center = exact(settings.center);
  const count = initialCount(mode);
  const initialNumbers = settings.initial.slice(0, count);
  const initial = initialNumbers.map(exact);
  const names = unknownNames(mode);
  const t0 = toNumber(center);

  if (settings.kind === "series") {
    const ode = polynomialOde(equation);
    if (!ode.ok) return { status: "unavailable", message: notPolynomialText(L, equation, ode.reason) };
    const terms = Math.min(MAX_SERIES_TERMS, Math.max(MIN_SERIES_TERMS, Math.round(settings.terms)));
    let result: ReturnType<typeof powerSeries>;
    try {
      result = powerSeries(ode.ode, center, { terms, checkpoint: input.checkpoint });
    } catch (error) {
      // A center whose exact digits make the expansion out of reach is an answer, not a failure.
      if (error instanceof SeriesTooExpensive) return { status: "unavailable", message: f(L.series.tooExpensive) };
      throw error;
    }
    const derivation = seriesDerivation(L, { equation, result, terms, initial, letters, checkpoint: input.checkpoint });
    if (result.status !== "ok" || input.chart === false) return { status: "ok", kind: "series", derivation, chart: null, check: null };
    // The band and the chart's reach: the radius (a numeric one is proven to far below a pixel), or the proven bound.
    const rho = result.radius.kind === "finite" ? result.radius.distance.value : result.radius.kind === "lowerBound" ? result.radius.value : Infinity;
    const half = SERIES_CHART_RADII * rho;
    // A radius a few ulps wide (a singular point at 1.0000000000000002 about t0 = 1) leaves nothing to draw.
    if (Number.isFinite(half) && !(half > MIN_CHART_ULPS * Number.EPSILON * Math.max(1, Math.abs(t0)))) {
      return { status: "ok", kind: "series", derivation, chart: null, check: null };
    }
    const tRange = Number.isFinite(half) ? { min: t0 - half, max: t0 + half } : input.tRange;
    const values = coefficientValues(result, initial);
    const budget = afterBudget(input.checkpoint);
    const numerical = numericalSolution(mode, input.text, input.params, t0, initialNumbers, tRange, budget.checkpoint, { holdAtEquilibrium: true, reduced });
    const numericalSegments = numerical ? clipPolyline(numerical, input.vRange) : [];
    const sumSegments = sampleCurve((t) => partialSum(values, terms, center, t), tRange, input.vRange, budget.quiet);
    const numericalShown = visible(numericalSegments, input.vRange);
    const sumShown = visible(sumSegments, input.vRange);
    const curves: ChartCurve[] = [];
    if (numericalShown) curves.push({ ...CHART_STYLE.numerical, segments: numericalSegments, label: f(L.series.legendNumerical) });
    if (sumShown) {
      curves.push({ ...CHART_STYLE.partialSum, segments: sumSegments, label: fillFormula(L.series.legendPartialSum, { power: power(shiftedVariable(center, newContext()), terms) }) });
    }
    const bands = Number.isFinite(rho) ? [{ min: t0 - rho, max: t0 + rho, color: CHART_STYLE.band, label: f(L.series.legendBand) }] : [];
    // Nothing shows inside the value range (y ≡ 10 on a chart of -3..3): no chart rather than an empty one.
    if (curves.length === 0 && bands.length === 0) return { status: "ok", kind: "series", derivation, chart: null, check: null };
    // The caption and the legend name only what shows inside the chart.
    const curvesCaption = numericalShown && sumShown ? L.series.chartSeriesBoth : sumShown ? L.series.chartSeriesOnly : numericalShown ? L.series.chartNumericalOnly : "";
    const caption = f(curvesCaption, bands.length ? f(curvesCaption ? " " : "", L.series.chartBand) : "");
    return { status: "ok", kind: "series", derivation, chart: { tRange, vRange: input.vRange, t0, curves, bands, caption }, check: null };
  }

  const ode = constantCoefficientOde(equation);
  if (!ode.ok) return { status: "unavailable", message: notConstantText(L, equation, ode.order, input.checkpoint) };
  let formula: ReturnType<typeof solutionFormula>;
  try {
    formula = solutionFormula(ode.ode, input.checkpoint);
  } catch (error) {
    if (error instanceof SeriesTooExpensive) return { status: "unavailable", message: f(L.series.tooExpensiveFormula) };
    throw error;
  }
  // A forcing exponent that came in as the double of an irrational value (π, √2) or of a literal longer
  // than a double, and sits on a characteristic root within its rounding: the exact formula for that
  // double is noise (coefficients near 1e15). Say so instead. An exponent typed as a short exact decimal
  // is never refused for an unrelated π elsewhere. "Frequency" only for an oscillation of a second-order equation.
  if (equation.approximate && formula.nearResonance && looksRounded(formula.nearResonance)) {
    const oscillation = equation.order === 2 && !isZero(formula.nearResonance.im);
    return { status: "unavailable", message: f(oscillation ? L.series.formulaNearResonance : L.series.formulaNearResonanceExponent) };
  }
  const constants = constantsFor(formula, center, initial, input.checkpoint);
  const parts = evaluateSolution(formula, constants.values, t0);
  const atT0 = [parts.total(t0), parts.particular(t0)];
  if (!constants.values.every(Number.isFinite) || !atT0.every(Number.isFinite)) {
    // Moving t0 helps only when the trouble is e^(mu t0) of a finite rate; otherwise no t0 does.
    const finiteRates = Number.isFinite(growthRate(formula.roots)) && formula.parts.every((p) => Number.isFinite(toNumber(p.lambda.re)) && Number.isFinite(toNumber(p.lambda.im)));
    const atZero = evaluateSolution(formula, constantsFor(formula, fromNumber(0)!, initial, input.checkpoint).values, 0);
    const fixed = t0 === 0 || !finiteRates || !Number.isFinite(atZero.total(0)) || !Number.isFinite(atZero.particular(0));
    return { status: "unavailable", message: fixed ? f(L.series.formulaOverflowFixed) : fillFormula(L.series.formulaOverflow, { t0: num(center, newContext()) }) };
  }
  // The self-check: the exact substitution of u_p, and a comparison with the numerical solution near
  // t0, where the reference is well conditioned: |t − t0| <= CHECK_HALF_WIDTH and at most CHECK_GROWTH
  // e-foldings of the fastest mode (a mode the initial values suppress would otherwise amplify the
  // integrator's own error and fail a correct formula). The reference's absolute tolerance follows the
  // solution's size (a solution of size 1e-7 is checked against a reference good to 1e-17, not 1e-12).
  // A formula whose terms cancel beyond CANCELLATION_LIMIT is not compared at all; its size there is
  // the reference's, never the cancelling evaluation's own. All of it runs on the budget: a budget spent
  // here leaves the derivation with the exact part of its check.
  const residualExact = particularResidualIsZero(formula, input.checkpoint);
  const rate = growthRate(formula.roots);
  const halfWidth = rate > 0 ? Math.min(CHECK_HALF_WIDTH, CHECK_GROWTH / rate) : CHECK_HALF_WIDTH;
  const checkRange = { min: t0 - halfWidth, max: t0 + halfWidth };
  const budget = afterBudget(input.checkpoint);
  const size = termScale(formula, constants.values, t0);
  let numericCheck: FormulaCheckResult["numeric"] = null;
  let cancellation: number | null = null;
  try {
    let formulaSize = 0;
    let preTerms = 0;
    for (let i = 0; i <= 40; i++) {
      if (i % 10 === 0) budget.checkpoint?.();
      const t = checkRange.min + ((checkRange.max - checkRange.min) * i) / 40;
      preTerms = Math.max(preTerms, size(t));
      formulaSize = Math.max(formulaSize, Math.abs(parts.total(t)));
    }
    const initialSize = Math.max(...initialNumbers.map(Math.abs), 0);
    const expected = Math.max(initialSize, Math.min(formulaSize, preTerms));
    const atol = expected > 0 ? Math.min(REFERENCE_ATOL, REFERENCE_RTOL * expected) : REFERENCE_ATOL;
    const numerical = numericalSolution(mode, input.text, input.params, t0, initialNumbers, checkRange, budget.checkpoint, { atol, reduced });
    const inside = numerical ? numerical.filter((p) => p.x >= checkRange.min && p.x <= checkRange.max) : [];
    // The terms and the solution's size are measured over the SAME range: the one the reference
    // covered (an early stop of the reference is not a cancellation), or t0 alone without a reference.
    const from = inside.length ? Math.min(...inside.map((p) => p.x)) : t0;
    const to = inside.length ? Math.max(...inside.map((p) => p.x)) : t0;
    let terms = 0;
    for (let i = 0; i <= 40; i++) terms = Math.max(terms, size(from + ((to - from) * i) / 40));
    const solutionSize = Math.max(initialSize, ...inside.map((p) => Math.abs(p.y)));
    const ratio = terms / Math.max(solutionSize, Number.MIN_VALUE);
    // A non-finite size (an exponent of 710 overflows) supports no claim either way: the exact part only.
    if (!Number.isFinite(ratio)) cancellation = null;
    else if (ratio > CANCELLATION_LIMIT) cancellation = ratio;
    else if (numerical && !budget.spent()) {
      const compared = checkFormula(parts.total, numerical, checkRange, initialNumbers, budget.checkpoint);
      numericCheck = compared && compared.covered ? { deviation: compared.deviation, ok: compared.ok, covered: compared.covered } : null;
    }
  } catch (error) {
    if (!budget.spent()) throw error;
  }
  if (budget.spent()) {
    numericCheck = null;
    cancellation = null;
  }
  const check: FormulaCheckResult = { residualExact, numeric: numericCheck, cancellation };
  const derivation = formulaDerivation(L, { equation, formula, t0: center, initial, constants, letters, check });
  if (input.chart === false) return { status: "ok", kind: "formula", derivation, chart: null, check };
  const tRange = input.tRange;
  const u = f(names.u);
  const uh = f(names.u, sub("h"));
  const up = f(names.u, sub("p"));
  const homogeneousOnly = qpIsZero(equation.G);
  // A formula that floating point cannot evaluate to a pixel (its terms cancel) is not drawn from its
  // own evaluation: the chart shows the numerical solution instead and says so. Judged only where the
  // curve is drawn (cosh 2t at t = 20 is 10^17 and never on the chart: no cancellation there).
  if (budget.spent()) return { status: "ok", kind: "formula", derivation, chart: null, check };
  const height = input.vRange.max - input.vRange.min;
  let noisy = cancellation !== null;
  for (let i = 0; i <= 400 && !noisy; i++) {
    const t = tRange.min + ((tRange.max - tRange.min) * i) / 400;
    const value = parts.total(t);
    const drawn = Number.isFinite(value) && value >= input.vRange.min - OFF_CHART_HEIGHTS * height && value <= input.vRange.max + OFF_CHART_HEIGHTS * height;
    if (drawn && DRAW_NOISE * size(t) > 1e-3 * height) noisy = true;
  }
  if (noisy) {
    const numerical = numericalSolution(mode, input.text, input.params, t0, initialNumbers, tRange, budget.checkpoint, { holdAtEquilibrium: true, reduced });
    const segments = numerical ? clipPolyline(numerical, input.vRange) : [];
    if (!visible(segments, input.vRange)) return { status: "ok", kind: "formula", derivation, chart: null, check };
    const curves: ChartCurve[] = [{ ...CHART_STYLE.numerical, segments, label: f(L.series.legendNumerical) }];
    return { status: "ok", kind: "formula", derivation, chart: { tRange, vRange: input.vRange, t0, curves, bands: [], caption: f(L.series.chartCancellation) }, check };
  }
  const all: ChartCurve[] = [{ ...CHART_STYLE.total, segments: sampleCurve(parts.total, tRange, input.vRange, budget.quiet), label: u }];
  if (!homogeneousOnly) {
    all.push({ ...CHART_STYLE.homogeneous, segments: sampleCurve(parts.homogeneous, tRange, input.vRange, budget.quiet), label: uh });
    all.push({ ...CHART_STYLE.particular, segments: sampleCurve(parts.particular, tRange, input.vRange, budget.quiet), label: up });
  }
  // Only what shows inside the chart is in the legend; the caption names the three curves only when all three show.
  const curves = all.filter((c) => visible(c.segments, input.vRange));
  const caption = homogeneousOnly || curves.length < 3 ? f("") : fillFormula(L.series.chartFormula, { u, uh, up });
  return { status: "ok", kind: "formula", derivation, chart: { tRange, vRange: input.vRange, t0, curves, bands: [], caption }, check };
}
