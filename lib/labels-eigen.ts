/**
 * Round 13 (AB): the words of the eigen features, shared by the web panel, the widget and the tool
 * summaries (the same derivation, rendered by components/MathText or as plain text):
 *
 * - `eigenDerivation`: the panel. A LINEAR system with constant coefficients gets the exact
 *   derivation (matrix form, equilibrium, characteristic equation and discriminant, eigenvalues,
 *   eigenvectors, type, general solution); any other autonomous picture gets the kernel's numerical
 *   linearization at each equilibrium found (Jacobian, eigenvalues, eigenvectors or Re ξ / Im ξ);
 *   a picture with no equilibrium, or a non-autonomous one, says that there is no eigenvalue to give
 *   and why.
 * - `snapHint` / `snapSentence`: what the canvas says next to a snapped pointer, and the full
 *   sentence under the picture.
 *
 * Every sentence is lib/labels' `eigen` section in both languages; this module only fills them with
 * formulas (lib/series/notation). The student's notation (round P): on a second-order picture the
 * coordinates are (x, x'), the general solution is x(t), and a point (c, 0) is the constant solution.
 *
 * The letters the derivation introduces never clash with the student's (CLAUDE.md rule 9): v is the
 * reduction's v = x', so an eigenvector is ξ and a generalized one η (Greek letters cannot be
 * parameter names); the matrix, the identity, the Jacobian and the constants of the general solution
 * take the first of a few letters that is not one of the student's parameters (`eigenLetters`); an
 * equilibrium is found by "x' = 0, y' = 0" in the student's own coordinates, never "A·p = −b".
 *
 * `surface`: the tool summaries ("text") have no picture, no pointer and no series panel, so the
 * notes about drawn lines, snapping and that panel are left out there; the widget ("widget") has the
 * picture and the pointer but no series panel.
 */
import type { Equilibrium } from "./core/equilibria";
import type { Vec2 } from "./core/types";
import { snapEquilibrium, snapStability, numericEigen, type Snap } from "./eigen/geometry";
import { centerByRounding, eigenvalueNumbers, fieldNumberValue, type FieldNumber, type FieldVector, type LinearAnalysis, type Radical, type ReadFailure, type Vec2Q } from "./eigen/linear-system";
import { fill, formatEigenvalues, formatNumber, labels, pointText, type LabelTable } from "./labels";
import type { Derivation, DerivationStep } from "./labels-series";
import { decimal, f, fillFormula, type Formula, matrix, MINUS, newContext, type NotationContext, num, plain, power, signedSum, sub, sup, surdFormula, tMultiple } from "./series/notation";
import { abs, digitCount, isOne, isZero, neg, ONE, q, type Q, sign, toNumber, ZERO } from "./series/rational";

export type EigenPicture = "system" | "second";

/** Where the derivation is shown (see the file header). */
export type EigenSurface = "web" | "widget" | "text";

/** The exact reading was not finished within the caller's time budget (it says so; never silently nothing). */
export type BudgetFailure = { readonly reason: "budget" };

/** What the panel is computed from. */
export type EigenDerivationInput = {
  picture: EigenPicture;
  /** The exact reading (lib/eigen linearAnalysisOf), or null when it was not attempted (a non-autonomous picture). */
  linear: { ok: true; analysis: LinearAnalysis } | { ok: false; failure: ReadFailure | BudgetFailure } | null;
  /** The kernel's equilibria in the features box (numerical linearization). */
  equilibria?: readonly Equilibrium[];
  /** The picture's field changes with t: no equilibria, no eigenvalues. */
  timeDependent?: boolean;
  /** The names of the student's parameters: the letters the derivation introduces avoid them. */
  params?: readonly string[];
  /** Default "web". */
  surface?: EigenSurface;
};

/** The letters the derivation introduces (matrix, identity, Jacobian, constants), none of them a parameter name of the student's. */
export type EigenLetters = { readonly A: string; readonly I: string; readonly J: string; readonly c: string };

export function eigenLetters(params: readonly string[] = []): EigenLetters {
  const taken = new Set(params);
  const pick = (choices: readonly string[], also: readonly string[] = []) => choices.find((x) => !taken.has(x) && !also.includes(x)) ?? choices[choices.length - 1];
  const A = pick(["A", "M", "B", "K"]);
  // E (the identity in many textbooks) is reserved by the parser, never a parameter: the last resort.
  const I = pick(["I", "E"], [A]);
  const J = pick(["J", "M", "K"], [A]);
  const c = pick(["c", "C", "k", "K"], [A, J]);
  return { A, I, J, c };
}

/** The panel's context: the labels, the letters, the surface, the notation context. */
type Ctx = { L: LabelTable; letters: EigenLetters; surface: EigenSurface; n: NotationContext };

/** A template with the letters filled in ({A}, {I}) and the given values. */
function T(cx: Ctx, template: string, values: Readonly<Record<string, Formula | string | number>> = {}): Formula {
  return fillFormula(template, { A: cx.letters.A, I: cx.letters.I, ...values });
}

// ---- numbers --------------------------------------------------------------------------------

/** λ₁, v₂: the index as a Unicode subscript inside a sentence. */
const SUBSCRIPT_DIGITS = ["₀", "₁", "₂"];

/** √m with the coefficient s (|s|), simplified by surdFormula; the imaginary unit after it when `imaginary`. */
function radicalPart(sAbs: Q, radical: Radical, ctx: NotationContext): Formula {
  if (radical.m === BigInt(1)) return radical.imaginary ? (isOne(sAbs) ? f("i") : f(num(sAbs, ctx), "i")) : num(sAbs, ctx);
  const root = surdFormula(sAbs, q(radical.m), ctx);
  if (!radical.imaginary) return root;
  // i√15 (never √15i, which reads as √(15i)); a fraction keeps the unit after it: (√15/4)i.
  return root.some((run) => "frac" in run) ? f(root, "i") : f("i", root);
}

/** r + s√m (or r + s i√m): "1/2 + √5/2", "−1 + √15 i", "√2". */
export function fieldFormula(x: FieldNumber, radical: Radical | null, ctx: NotationContext): Formula {
  if (isZero(x.s) || radical === null) return num(x.r, ctx);
  const part = radicalPart(abs(x.s), radical, ctx);
  if (isZero(x.r)) return f(sign(x.s) < 0 ? MINUS : "", part);
  return f(num(x.r, ctx), sign(x.s) < 0 ? ` ${MINUS} ` : " + ", part);
}

/** Whether an exact value's text has a fraction or a root in it (then a decimal follows it). */
function needsDecimal(exactText: string): boolean {
  return /[/√·]/.test(exactText);
}

/** "≈ 1.618" after a value that prints as a fraction or a root, or that had to be rounded to print at all. */
function approx(value: number, exactText: string, rounded = false): string {
  return Number.isFinite(value) && (rounded || needsDecimal(exactText)) ? ` ≈ ${decimal(value, 4)}` : "";
}

/** A formula built in a context of its own, to know whether IT was rounded (the panel's context learns it too). */
function tracked(ctx: NotationContext, build: (local: NotationContext) => Formula): { formula: Formula; rounded: boolean } {
  const local = newContext();
  const formula = build(local);
  if (local.rounded) ctx.rounded = true;
  return { formula, rounded: local.rounded };
}

function vectorFormula(v: readonly [Formula, Formula]): Formula {
  return f("(", v[0], ", ", v[1], ")");
}

/**
 * Display choice: an exact vector with a component longer than this (numerator and denominator
 * digits together; an approximate coefficient gives 16-digit integers) prints as decimals instead.
 */
export const HUGE_VECTOR_DIGITS = 9;

function hugeField(x: FieldNumber): boolean {
  return digitCount(x.r) > HUGE_VECTOR_DIGITS || (!isZero(x.s) && digitCount(x.s) > HUGE_VECTOR_DIGITS);
}

/**
 * Vectors as the derivation prints them, with the relation that goes before them: exact (" = ") when
 * every component is short, else all of them scaled by ONE common factor (the first component of the
 * first vector becomes 1: a generalized eigenvector must scale with its eigenvector) and printed as
 * decimals (" ≈ "), with `decimal` set for the note.
 */
type Shown = { readonly vectors: readonly Formula[]; readonly rel: string; readonly decimal: boolean };

function showVectors(vectors: readonly FieldVector[], radical: Radical | null, ctx: NotationContext): Shown {
  if (!vectors.some((v) => hugeField(v[0]) || hugeField(v[1]))) {
    return { vectors: vectors.map((v) => vectorFormula([fieldFormula(v[0], radical, ctx), fieldFormula(v[1], radical, ctx)])), rel: " = ", decimal: false };
  }
  const values = vectors.map((v) => [fieldNumberValue(v[0], radical), fieldNumberValue(v[1], radical)] as const);
  const first = values[0];
  const k = first[0] !== 0 ? first[0] : first[1];
  return { vectors: values.map(([x, y]) => f(`(${formatNumber(x / k, 4)}, ${formatNumber(y / k, 4)})`)), rel: " ≈ ", decimal: true };
}

const fieldOf = (v: Vec2Q): FieldVector => [{ r: v[0], s: ZERO }, { r: v[1], s: ZERO }];

function vecQ(v: Vec2Q, ctx: NotationContext): Formula {
  return vectorFormula([num(v[0], ctx), num(v[1], ctx)]);
}

/** e^(λt) with a rational λ as a superscript ("e³ᵗ", "e⁻ᵗ", "e^(t/2)"); 1 for λ = 0. */
function expRational(l: Q, ctx: NotationContext): Formula {
  if (isZero(l)) return [];
  return f("e", sup(tMultiple(l, ctx)));
}

/**
 * A numerical direction (defined up to a factor) scaled like the exact vectors read: its first
 * component 1, as (1, λ) on a second-order picture and (1, 2) for v₁ = (1, 2); the second component 1
 * when the first is under a tenth of it (a nearly vertical direction would otherwise print huge).
 */
function scaledDirection(v: Vec2): Vec2 {
  const ax = Math.abs(v.x);
  const ay = Math.abs(v.y);
  if (!(Math.max(ax, ay) > 0) || !Number.isFinite(ax + ay)) return v;
  const k = ax >= 0.1 * ay ? v.x : v.y;
  return { x: v.x / k, y: v.y / k };
}

function numericVector(v: Vec2, digits = 4): string {
  const s = scaledDirection(v);
  return `(${formatNumber(s.x, digits)}, ${formatNumber(s.y, digits)})`;
}

// ---- the exact derivation ---------------------------------------------------------------------

function typeLine(cx: Ctx, an: LinearAnalysis): Formula {
  const E = cx.L.eigen;
  switch (an.type) {
    case "saddle":
      return T(cx, E.typeSaddle);
    case "stable_node":
    case "unstable_node":
      return T(cx, E.typeNode, { kind: an.type === "stable_node" ? E.stable : E.unstable });
    case "stable_star":
    case "unstable_star":
      return T(cx, E.typeStar, { kind: an.type === "stable_star" ? E.stable : E.unstable });
    case "stable_degenerate":
    case "unstable_degenerate":
      return T(cx, E.typeDegenerate, { kind: an.type === "stable_degenerate" ? E.stable : E.unstable });
    case "stable_spiral":
    case "unstable_spiral":
      return T(cx, E.typeSpiral, { kind: an.type === "stable_spiral" ? E.stable : E.unstable, sense: an.rotation === "ccw" ? E.ccw : E.cw });
    case "center":
      return centerByRounding(an) ? T(cx, E.typeCenterRounded) : T(cx, E.typeCenter, { sense: an.rotation === "ccw" ? E.ccw : E.cw });
    case "zero_eigenvalue":
      return T(cx, E.typeZero);
  }
}

function equilibriumLines(cx: Ctx, an: LinearAnalysis, picture: EigenPicture): Formula[] {
  const E = cx.L.eigen;
  const ctx = cx.n;
  const eq = an.equilibrium;
  const second = picture === "second";
  const zeroB = isZero(an.system.b[0]) && isZero(an.system.b[1]);
  switch (eq.kind) {
    case "point": {
      const point = vecQ(eq.at, ctx);
      const lines = [T(cx, zeroB ? (second ? E.equilibriumOriginSecond : E.equilibriumOrigin) : second ? E.equilibriumPointSecond : E.equilibriumPoint, { point })];
      if (second) lines.push(fillFormula(E.equilibriumConstant, { c: num(eq.at[0], ctx) }));
      return lines;
    }
    case "line":
      // On a second-order picture the only line of equilibria is x' = 0 (P0 = 0 and G = 0): every constant solves it.
      return [second ? T(cx, E.equilibriumLineSecond) : T(cx, E.equilibriumLine, { through: vecQ(eq.through, ctx), direction: vecQ(eq.direction, ctx) })];
    case "plane":
      return [T(cx, E.equilibriumPlane)];
    case "none":
      return [T(cx, second ? E.equilibriumNoneSecond : E.equilibriumNone)];
  }
}

function characteristicLines(cx: Ctx, an: LinearAnalysis, picture: EigenPicture): Formula[] {
  const E = cx.L.eigen;
  const ctx = cx.n;
  const lambda = f("λ");
  const polynomial = signedSum([{ c: ONE, body: power(lambda, 2) }, { c: neg(an.trace), body: lambda }, { c: an.det, body: [] }], ctx);
  const lines: Formula[] = [
    T(cx, E.characteristic, { polynomial }),
    T(cx, E.traceDet, { trace: num(an.trace, ctx), det: num(an.det, ctx) }),
    T(cx, E.discriminant, { disc: num(an.disc, ctx), sign: sign(an.disc) > 0 ? E.discPositive : sign(an.disc) < 0 ? E.discNegative : E.discZero }),
  ];
  if (picture === "second") lines.push(fillFormula(E.characteristicSecond, { exp: f("e", sup("λt")) }));
  return lines;
}

function eigenvalueLines(cx: Ctx, an: LinearAnalysis): Formula[] {
  const E = cx.L.eigen;
  const ctx = cx.n;
  const r = an.roots;
  if (r.kind === "repeated") {
    const shown = tracked(ctx, (local) => num(r.value, local));
    return [fillFormula(E.eigenvalueRepeated, { l: f(shown.formula, approx(toNumber(r.value), plain(shown.formula), shown.rounded)) })];
  }
  if (r.kind === "distinct") {
    // The decimals without cancellation (Vieta for the small root: 1.41421… − √2 is not 0).
    const values = eigenvalueNumbers(an) ?? r.values.map((v) => fieldNumberValue(v, an.radical));
    return r.values.map((v, i) => {
      const exact = tracked(ctx, (local) => fieldFormula(v, an.radical, local));
      return f("λ", sub(String(i + 1)), " = ", exact.formula, approx(values[i], plain(exact.formula), exact.rounded));
    });
  }
  // α ± βi
  const radical = an.radical!;
  const alphaValue = toNumber(r.alpha);
  const betaValue = toNumber(r.beta) * Math.sqrt(Number(radical.m));
  const exact = tracked(ctx, (local) => (isZero(r.alpha) ? f("± ", radicalPart(r.beta, radical, local)) : f(num(r.alpha, local), " ± ", radicalPart(r.beta, radical, local))));
  const shown = `${isZero(r.alpha) ? "" : `${decimal(alphaValue, 4)} `}± ${decimal(betaValue, 4)}i`;
  return [
    f("λ = ", exact.formula, exact.rounded || needsDecimal(plain(exact.formula)) ? ` ≈ ${shown}` : ""),
    fillFormula(E.complexParts, { alpha: num(r.alpha, ctx), beta: radicalPart(r.beta, { ...radical, imaginary: false }, ctx) }),
  ];
}

/** The eigenvectors as printed (exact, or decimals for very long components; see showVectors). */
type VectorsShown =
  | { readonly kind: "two"; readonly shown: Shown }
  | { readonly kind: "one"; readonly shown: Shown }
  | { readonly kind: "every" }
  | { readonly kind: "complex"; readonly full: Formula; readonly re: Formula; readonly im: Formula; readonly rel: string; readonly decimal: boolean };

function vectorsShown(an: LinearAnalysis, ctx: NotationContext): VectorsShown {
  const v = an.vectors;
  switch (v.kind) {
    case "two": {
      // Two eigenvectors scale independently: each shown on its own.
      const each = v.v.map((vec) => showVectors([vec], an.radical, ctx));
      const decimal = each.some((x) => x.decimal);
      return { kind: "two", shown: { vectors: each.map((x) => x.vectors[0]), rel: decimal ? " ≈ " : " = ", decimal } };
    }
    case "one":
      // ξ and η share one factor: (A − λI)η = ξ.
      return { kind: "one", shown: showVectors([fieldOf(v.v), fieldOf(v.w)], null, ctx) };
    case "every":
      return { kind: "every" };
    case "complex": {
      const radical = an.radical!;
      const real = { ...radical, imaginary: false };
      const imField: FieldVector = [{ r: ZERO, s: v.im[0] }, { r: ZERO, s: v.im[1] }];
      const shown = showVectors([fieldOf(v.re), imField], real, ctx);
      if (shown.decimal) {
        // One real factor for Re ξ and Im ξ (re[0] = 2b·k ≠ 0, the first component of Re ξ becomes 1).
        const k = toNumber(v.re[0]);
        const root = Math.sqrt(Number(radical.m));
        const re = { x: 1, y: toNumber(v.re[1]) / k };
        const im = { x: (toNumber(v.im[0]) * root) / k, y: (toNumber(v.im[1]) * root) / k };
        return { kind: "complex", full: f(complexVectorText(re, im)), re: f(pairText(re)), im: f(pairText(im)), rel: " ≈ ", decimal: true };
      }
      const full = vectorFormula([fieldFormula({ r: v.re[0], s: v.im[0] }, radical, ctx), fieldFormula({ r: v.re[1], s: v.im[1] }, radical, ctx)]);
      return { kind: "complex", full, re: shown.vectors[0], im: shown.vectors[1], rel: " = ", decimal: false };
    }
  }
}

function pairText(v: Vec2): string {
  return `(${formatNumber(v.x, 4)}, ${formatNumber(v.y, 4)})`;
}

/** re + i·im as one vector, "(1, −0.25 + 0.9682i)". */
function complexVectorText(re: Vec2, im: Vec2): string {
  const part = (r: number, i: number) => {
    if (i === 0) return formatNumber(r, 4);
    const imag = `${formatNumber(Math.abs(i), 4)}i`;
    if (r === 0) return i < 0 ? `-${imag}` : imag;
    return `${formatNumber(r, 4)} ${i < 0 ? "-" : "+"} ${imag}`;
  };
  return `(${part(re.x, im.x)}, ${part(re.y, im.y)})`;
}

function eigenvectorLines(cx: Ctx, an: LinearAnalysis, shown: VectorsShown): Formula[] {
  const E = cx.L.eigen;
  switch (shown.kind) {
    case "two":
      return shown.shown.vectors.map((vec, i) => T(cx, E.eigenvectorOf, { i: SUBSCRIPT_DIGITS[i + 1], v: vec, rel: shown.shown.rel }));
    case "one":
      return [
        T(cx, an.type === "zero_eigenvalue" ? E.eigenvectorOnlyZero : E.eigenvectorOnly, { v: shown.shown.vectors[0], rel: shown.shown.rel }),
        T(cx, E.generalized, { w: shown.shown.vectors[1], rel: shown.shown.rel }),
      ];
    case "every":
      return [T(cx, E.eigenvectorEvery)];
    case "complex":
      return [T(cx, E.eigenvectorComplex, { v: shown.full, rel: shown.rel }), T(cx, E.complexReIm, { re: shown.re, im: shown.im, rel: shown.rel })];
  }
}

/** The general solution in the student's notation. */
function solutionLines(cx: Ctx, an: LinearAnalysis, picture: EigenPicture, shown: VectorsShown): Formula[] {
  const E = cx.L.eigen;
  const ctx = cx.n;
  const second = picture === "second";
  const unknown = second ? f("x(t)") : f("(x(t), y(t))");
  const eq = an.equilibrium;
  // The offset by the equilibrium when it is not the origin.
  const offset: Formula = eq.kind === "point" && !(isZero(eq.at[0]) && isZero(eq.at[1])) ? (second ? f(num(eq.at[0], ctx), " + ") : f(vecQ(eq.at, ctx), " + ")) : [];
  const c = (i: number) => f(cx.letters.c, sub(String(i)));
  const xi = (i?: number) => (i === undefined ? f("ξ") : f("ξ", sub(String(i))));
  const r = an.roots;
  const v = an.vectors;
  if (an.type === "zero_eigenvalue") {
    if (eq.kind === "none") return [T(cx, E.solutionNoEquilibrium)];
    if (eq.kind === "plane") return [T(cx, E.solutionPlane, { u: unknown, c1: c(1), c2: c(2) })];
    if (eq.kind !== "line") return [];
    // A line of equilibria: p0 + c1 d + c2 e^(λt) ξ (λ = tr A ≠ 0), or p0 + c1 ξ + c2 (t ξ + η) when
    // tr A = 0 too. On a second-order picture the line is x' = 0 and x(t) = c1 + c2 e^(λt) (or c1 + c2 t).
    const p0: Formula = isZero(eq.through[0]) && isZero(eq.through[1]) ? [] : f(vecQ(eq.through, ctx), " + ");
    if (v.kind === "two" && r.kind === "distinct" && shown.kind === "two") {
      const nonzero = r.values.findIndex((x) => !(isZero(x.r) && isZero(x.s)));
      const lam = r.values[nonzero];
      if (second) return [f(unknown, " = ", c(1), " + ", c(2), expRational(lam.r, ctx))];
      if (shown.shown.decimal) return [f(unknown, " = ", p0, c(1), " ", vecQ(eq.direction, ctx), " + ", c(2), expRational(lam.r, ctx), " ", xi(nonzero + 1)), T(cx, E.solutionWithValues)];
      return [f(unknown, " = ", p0, c(1), " ", vecQ(eq.direction, ctx), " + ", c(2), expRational(lam.r, ctx), " ", shown.shown.vectors[nonzero])];
    }
    if (v.kind === "one" && shown.kind === "one") {
      if (second) return [f(unknown, " = ", c(1), " + ", c(2), "t")];
      if (shown.shown.decimal) return [f(unknown, " = ", p0, c(1), " ξ + ", c(2), "(t ξ + η)"), T(cx, E.solutionWithVectors)];
      const [xv, eta] = shown.shown.vectors;
      return [f(unknown, " = ", p0, c(1), " ", xv, " + ", c(2), "(t ", xv, " + ", eta, ")")];
    }
    return [];
  }
  if (r.kind === "distinct" && shown.kind === "two") {
    const rational = r.values.every((x) => isZero(x.s));
    if (second) {
      const terms = rational ? r.values.map((x, i) => f(c(i + 1), expRational(x.r, ctx))) : [f(c(1), "e", sup("λ₁t")), f(c(2), "e", sup("λ₂t"))];
      return rational ? [f(unknown, " = ", offset, terms[0], " + ", terms[1])] : [f(unknown, " = ", offset, terms[0], " + ", terms[1]), T(cx, E.solutionWithValuesSecond)];
    }
    if (rational && !shown.shown.decimal) {
      const vecs = shown.shown.vectors;
      return [f(unknown, " = ", offset, c(1), expRational(r.values[0].r, ctx), " ", vecs[0], " + ", c(2), expRational(r.values[1].r, ctx), " ", vecs[1])];
    }
    return [f(unknown, " = ", offset, c(1), "e", sup("λ₁t"), " ", xi(1), " + ", c(2), "e", sup("λ₂t"), " ", xi(2)), T(cx, E.solutionWithValues)];
  }
  if (r.kind === "repeated") {
    const e = expRational(r.value, ctx);
    if (shown.kind === "every") return [f(unknown, " = ", offset, e, second ? "" : " ", second ? c(1) : f("(", c(1), ", ", c(2), ")"))];
    if (shown.kind === "one") {
      if (second) return [f(unknown, " = ", offset, "(", c(1), " + ", c(2), "t)", e)];
      if (shown.shown.decimal) return [f(unknown, " = ", offset, c(1), e, " ξ + ", c(2), e, "(t ξ + η)"), T(cx, E.solutionWithVectors)];
      const [xv, eta] = shown.shown.vectors;
      return [f(unknown, " = ", offset, c(1), e, " ", xv, " + ", c(2), e, "(t ", xv, " + ", eta, ")")];
    }
  }
  if (r.kind === "complex") {
    const growth = isZero(r.alpha) ? [] : f("e", sup("αt"));
    if (second) return [f(unknown, " = ", offset, growth, "(", c(1), " cos βt + ", c(2), " sin βt)"), T(cx, E.solutionComplexValuesSecond)];
    // e^(λt) ξ = e^(αt)[(Re ξ cos βt − Im ξ sin βt) + i (Re ξ sin βt + Im ξ cos βt)]: its real and imaginary parts.
    const body = f(c(1), "(Re ξ cos βt − Im ξ sin βt) + ", c(2), "(Re ξ sin βt + Im ξ cos βt)");
    return [f(unknown, " = ", offset, growth.length ? f(growth, "[", body, "]") : body), T(cx, E.solutionComplexValues)];
  }
  return [];
}

/** Whether the surface draws the picture and has the pointer (the notes about lines, arcs and snapping). */
function hasPicture(cx: Ctx): boolean {
  return cx.surface !== "text";
}

function exactDerivation(cx: Ctx, an: LinearAnalysis, picture: EigenPicture): Derivation {
  const E = cx.L.eigen;
  const ctx = cx.n;
  const [[a, b], [c, d]] = an.system.A;
  const matrixValue = matrix([[num(a, ctx), num(b, ctx)], [num(c, ctx), num(d, ctx)]]);
  const zeroB = isZero(an.system.b[0]) && isZero(an.system.b[1]);
  const steps: DerivationStep[] = [];
  const form = picture === "second"
    ? [T(cx, zeroB ? E.matrixFormSecond : E.matrixFormSecondAffine, { matrix: matrixValue, b: vecQ(an.system.b, ctx) })]
    : [T(cx, zeroB ? E.matrixForm : E.matrixFormAffine, { matrix: matrixValue, b: vecQ(an.system.b, ctx) })];
  steps.push({ title: E.stepMatrix, lines: [...form, ...equilibriumLines(cx, an, picture)] });
  steps.push({ title: E.stepCharacteristic, lines: characteristicLines(cx, an, picture) });
  steps.push({ title: E.stepEigenvalues, lines: eigenvalueLines(cx, an) });
  const shown = vectorsShown(an, ctx);
  steps.push({ title: E.stepEigenvectors, lines: eigenvectorLines(cx, an, shown) });
  steps.push({ title: E.stepType, lines: [typeLine(cx, an)] });
  const solution = solutionLines(cx, an, picture, shown);
  if (solution.length) steps.push({ title: E.stepSolution, lines: solution });
  const notes: Formula[] = [];
  const rounding = centerByRounding(an);
  if (hasPicture(cx) && an.equilibrium.kind === "point" && an.type !== "zero_eigenvalue") {
    if (an.vectors.kind === "two" || an.vectors.kind === "one") notes.push(f(E.noteLines));
    if (an.vectors.kind === "complex") notes.push(f(an.type === "center" && !rounding ? E.noteRotationClosed : E.noteRotationOpen));
    if (an.vectors.kind === "every") notes.push(f(E.noteStar));
  }
  if (an.type === "center" && !rounding) notes.push(f(E.noteCenterExact));
  if (hasPicture(cx) && an.type === "zero_eigenvalue") notes.push(f(E.noteZeroNoSnap));
  if (picture === "second" && cx.surface === "web") notes.push(T(cx, E.noteFormulaPanel, { c1: f(cx.letters.c, sub("1")), c2: f(cx.letters.c, sub("2")) }));
  if (an.system.approximate) notes.push(f(E.noteApproximate));
  for (const x of an.borderline) {
    const what = x.quantity === "trace" ? `tr ${cx.letters.A}` : x.quantity === "det" ? `det ${cx.letters.A}` : E.discriminantName;
    notes.push(fillFormula(x.exactZero ? E.noteBorderlineZero : E.noteBorderline, { what }));
  }
  if (shown.kind !== "every" && (shown.kind === "complex" ? shown.decimal : shown.shown.decimal)) notes.push(f(E.noteVectorDecimal));
  if (ctx.rounded) notes.push(f(E.noteRounded));
  return { title: f(E.titleExact), steps, notes };
}

// ---- the numerical linearization --------------------------------------------------------------

function failureLine(L: LabelTable, failure: ReadFailure | BudgetFailure, picture: EigenPicture): string {
  const E = L.eigen;
  switch (failure.reason) {
    case "budget":
      return E.budgetNote;
    case "nonlinear":
      return fill(picture === "second" ? E.notLinearSecond : E.notLinear, { fragment: failure.fragment });
    case "timeDependent":
      return E.notConstant;
    case "tooComplex":
      return E.notReadableSize;
    case "other":
      return fill(E.notReadable, { fragment: failure.fragment });
    case "parse":
      return E.notReadableParse;
  }
}

function numericStep(cx: Ctx, e: Equilibrium, picture: EigenPicture): DerivationStep {
  const L = cx.L;
  const E = L.eigen;
  const second = picture === "second";
  const [[a, b], [c, d]] = e.jacobian;
  const lines: Formula[] = [];
  const finite = [a, b, c, d].every(Number.isFinite);
  lines.push(finite ? f(`${cx.letters.J} ≈ `, [{ matrix: [[formatNumber(a, 4), formatNumber(b, 4)], [formatNumber(c, 4), formatNumber(d, 4)]] }]) : f(E.jacobianNotFinite));
  const n = numericEigen(e);
  const values = formatEigenvalues(e.eigenvalues);
  if (values) lines.push(f("λ ≈ ", values));
  switch (n.kind) {
    case "real":
      n.directions.forEach((dir, i) => lines.push(f(fill(n.note === "one" ? E.numericVectorOnly : E.numericVector, { i: SUBSCRIPT_DIGITS[i + 1], v: numericVector(dir.direction), l: formatNumber(dir.eigenvalue, 4) }))));
      break;
    case "complex":
      // numericEigen's Re ξ and Im ξ already share one factor (the first component of ξ is 1): print
      // both as they are, never rescale one of them alone (ξ would stop being an eigenvector).
      lines.push(f(fill(E.numericComplex, { xi: complexVectorText(n.re, n.im), re: pairText(n.re), im: pairText(n.im), sense: n.ccw ? E.ccw : E.cw })));
      break;
    case "every":
      lines.push(f(E.eigenvectorEvery));
      break;
    case "undecided":
      if (finite) lines.push(f(E.numericUndecided));
      break;
  }
  lines.push(f(L.classification[e.classification], e.caveat === "repeatedRoot" ? ` (${L.caveatShort.repeatedRoot})` : ""));
  return { title: fill(E.stepAt, { point: pointText(L, e.at, second) }), lines };
}

/** The eigen panel (see the file header). */
export function eigenDerivation(L: LabelTable, input: EigenDerivationInput): Derivation {
  const E = L.eigen;
  const cx: Ctx = { L, letters: eigenLetters(input.params), surface: input.surface ?? "web", n: newContext() };
  if (input.timeDependent) return { title: f(E.title), steps: [], notes: [f(input.picture === "second" ? E.timeDependentSecond : E.timeDependent)] };
  if (input.linear?.ok) return exactDerivation(cx, input.linear.analysis, input.picture);
  const notes: Formula[] = [];
  if (input.linear && !input.linear.ok) notes.push(f(failureLine(L, input.linear.failure, input.picture)));
  const equilibria = input.equilibria ?? [];
  if (equilibria.length === 0) {
    notes.push(f(E.noEquilibrium));
    return { title: f(E.title), steps: [], notes };
  }
  notes.push(f(hasPicture(cx) ? E.linearizedOnly : E.linearizedOnlyText));
  return { title: f(E.titleNumeric), steps: equilibria.map((e) => numericStep(cx, e, input.picture)), notes };
}

// ---- snapping -------------------------------------------------------------------------------

/**
 * " = " when the printed number is the value itself (to the last bits of a double: a direction of
 * slope 2 computes as 2.0000000000000004), else " ≈ ": a rounded λ never stands after "=".
 */
function printsExactly(v: number, digits: number): boolean {
  return Math.abs(Number(formatNumber(v, digits)) - v) <= 1e-12 * Math.max(1, Math.abs(v));
}

function relOf(...values: readonly number[]): string {
  return values.every((v) => printsExactly(v, 4)) ? " = " : " ≈ ";
}

/** The few words next to the snapped pointer (the canvas has little room). */
export function snapHint(L: LabelTable, snap: Snap): string {
  const E = L.eigen;
  const t = snap.target;
  if (t.kind === "line") return fill(E.hintLine, { l: formatNumber(t.eigenvalue, 3), rel: printsExactly(t.eigenvalue, 3) ? " = " : " ≈ " });
  if (t.kind === "segment") return E.hintSegment;
  return snapStability(t) === "stable" ? E.hintBranchStable : E.hintBranchUnstable;
}

/**
 * The full sentence under the picture while the pointer is snapped, ending with how not to snap:
 * hold Alt with a mouse; a finger has no Alt key (`touch`), so it is told what does work.
 */
export function snapSentence(L: LabelTable, snap: Snap, picture: EigenPicture, touch = false): string {
  const E = L.eigen;
  const t = snap.target;
  const point = pointText(L, snapEquilibrium(t), picture === "second");
  const toward = snapStability(t) === "stable" ? E.toward : E.awayFrom;
  const how = touch ? E.snapTouch : E.snapAlt;
  // A Chinese sentence ends with "。" and the next follows without a space.
  const join = (sentence: string) => `${sentence}${/[。！？]$/.test(sentence) ? "" : " "}${how}`;
  if (t.kind === "line") {
    const shown = scaledDirection(t.direction);
    return join(fill(E.snapLine, { point, v: `${relOf(shown.x, shown.y) === " = " ? " " : " ≈ "}${numericVector(t.direction)}`, l: formatNumber(t.eigenvalue, 4), rel: relOf(t.eigenvalue), toward }));
  }
  if (t.kind === "segment") return join(fill(E.snapSegment, { point, l: formatNumber(t.eigenvalue, 4) }));
  return join(fill(snapStability(t) === "stable" ? E.snapBranchStable : E.snapBranchUnstable, { point }));
}

/** The panel as plain text (the tool summaries). */
export function eigenText(locale: Parameters<typeof labels>[0], input: EigenDerivationInput): string {
  const d = eigenDerivation(labels(locale), input);
  const lines: string[] = [plain(d.title)];
  d.steps.forEach((step, i) => {
    lines.push(`${i + 1}. ${step.title}`);
    for (const line of step.lines) lines.push(`   ${plain(line)}`);
  });
  for (const note of d.notes) lines.push(plain(note));
  return lines.join("\n");
}
