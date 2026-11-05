/**
 * Round 13 (AB): the words of the eigen features, shared by the web panel, the widget and the tool
 * summaries (the same derivation, rendered by components/MathText or as plain text):
 *
 * - `eigenDerivation`: the panel. A LINEAR system with constant coefficients gets the exact
 *   derivation (matrix form, equilibrium, characteristic equation and discriminant, eigenvalues,
 *   eigenvectors, type, general solution); any other autonomous picture gets the kernel's numerical
 *   linearization at each equilibrium found (Jacobian, eigenvalues, eigenvectors or Re v / Im v);
 *   a picture with no equilibrium, or a non-autonomous one, says that there is no eigenvalue to give
 *   and why.
 * - `snapHint` / `snapSentence`: what the canvas says next to a snapped pointer, and the full
 *   sentence under the picture.
 *
 * Every sentence is lib/labels' `eigen` section in both languages; this module only fills them with
 * formulas (lib/series/notation). The student's notation (round P): on a second-order picture the
 * coordinates are (x, x'), the general solution is x(t), and a point (c, 0) is the constant solution.
 */
import type { Equilibrium } from "./core/equilibria";
import type { Vec2 } from "./core/types";
import { snapEquilibrium, snapStability, numericEigen, type Snap } from "./eigen/geometry";
import { fieldNumberValue, type FieldNumber, type LinearAnalysis, type Radical, type ReadFailure, type Vec2Q } from "./eigen/linear-system";
import { fill, formatEigenvalues, formatNumber, labels, pointText, type LabelTable } from "./labels";
import type { Derivation, DerivationStep } from "./labels-series";
import { decimal, f, fillFormula, type Formula, matrix, MINUS, newContext, type NotationContext, num, plain, power, signedSum, sub, sup, surdFormula, tMultiple } from "./series/notation";
import { abs, isOne, isZero, neg, ONE, q, type Q, sign, toNumber } from "./series/rational";

export type EigenPicture = "system" | "second";

/** What the panel is computed from. */
export type EigenDerivationInput = {
  picture: EigenPicture;
  /** The exact reading (lib/eigen linearAnalysisOf), or null when it was not attempted (a non-autonomous picture). */
  linear: { ok: true; analysis: LinearAnalysis } | { ok: false; failure: ReadFailure } | null;
  /** The kernel's equilibria in the features box (numerical linearization). */
  equilibria?: readonly Equilibrium[];
  /** The picture's field changes with t: no equilibria, no eigenvalues. */
  timeDependent?: boolean;
};

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

/** "≈ 1.618" after a value that prints as a fraction or a root. */
function approx(value: number, exactText: string): string {
  return Number.isFinite(value) && needsDecimal(exactText) ? ` ≈ ${decimal(value, 4)}` : "";
}

function vectorFormula(v: readonly [Formula, Formula]): Formula {
  return f("(", v[0], ", ", v[1], ")");
}

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
function numericVector(v: Vec2, digits = 4): string {
  const ax = Math.abs(v.x);
  const ay = Math.abs(v.y);
  if (!(Math.max(ax, ay) > 0) || !Number.isFinite(ax + ay)) return `(${formatNumber(v.x, digits)}, ${formatNumber(v.y, digits)})`;
  const k = ax >= 0.1 * ay ? v.x : v.y;
  return `(${formatNumber(v.x / k, digits)}, ${formatNumber(v.y / k, digits)})`;
}

// ---- the exact derivation ---------------------------------------------------------------------

function typeLine(L: LabelTable, an: LinearAnalysis): string {
  const E = L.eigen;
  switch (an.type) {
    case "saddle":
      return E.typeSaddle;
    case "stable_node":
    case "unstable_node":
      return fill(E.typeNode, { kind: an.type === "stable_node" ? E.stable : E.unstable });
    case "stable_star":
    case "unstable_star":
      return fill(E.typeStar, { kind: an.type === "stable_star" ? E.stable : E.unstable });
    case "stable_degenerate":
    case "unstable_degenerate":
      return fill(E.typeDegenerate, { kind: an.type === "stable_degenerate" ? E.stable : E.unstable });
    case "stable_spiral":
    case "unstable_spiral":
      return fill(E.typeSpiral, { kind: an.type === "stable_spiral" ? E.stable : E.unstable, sense: an.rotation === "ccw" ? E.ccw : E.cw });
    case "center":
      return fill(E.typeCenter, { sense: an.rotation === "ccw" ? E.ccw : E.cw });
    case "zero_eigenvalue":
      return E.typeZero;
  }
}

function equilibriumLines(L: LabelTable, an: LinearAnalysis, picture: EigenPicture, ctx: NotationContext): Formula[] {
  const E = L.eigen;
  const eq = an.equilibrium;
  const second = picture === "second";
  const zeroB = isZero(an.system.b[0]) && isZero(an.system.b[1]);
  switch (eq.kind) {
    case "point": {
      const point = vecQ(eq.at, ctx);
      const lines = [fillFormula(zeroB ? (second ? E.equilibriumOriginSecond : E.equilibriumOrigin) : second ? E.equilibriumPointSecond : E.equilibriumPoint, { point })];
      if (second) lines.push(fillFormula(E.equilibriumConstant, { c: num(eq.at[0], ctx) }));
      return lines;
    }
    case "line":
      return [fillFormula(E.equilibriumLine, { through: vecQ(eq.through, ctx), direction: vecQ(eq.direction, ctx) })];
    case "plane":
      return [f(E.equilibriumPlane)];
    case "none":
      return [f(E.equilibriumNone)];
  }
}

function characteristicLines(L: LabelTable, an: LinearAnalysis, picture: EigenPicture, ctx: NotationContext): Formula[] {
  const E = L.eigen;
  const lambda = f("λ");
  const polynomial = signedSum([{ c: ONE, body: power(lambda, 2) }, { c: neg(an.trace), body: lambda }, { c: an.det, body: [] }], ctx);
  const lines: Formula[] = [
    fillFormula(E.characteristic, { polynomial }),
    fillFormula(E.traceDet, { trace: num(an.trace, ctx), det: num(an.det, ctx) }),
    fillFormula(E.discriminant, { disc: num(an.disc, ctx), sign: sign(an.disc) > 0 ? E.discPositive : sign(an.disc) < 0 ? E.discNegative : E.discZero }),
  ];
  if (picture === "second") lines.push(fillFormula(E.characteristicSecond, { exp: f("e", sup("λt")) }));
  return lines;
}

function eigenvalueLines(L: LabelTable, an: LinearAnalysis, ctx: NotationContext): Formula[] {
  const E = L.eigen;
  const r = an.roots;
  if (r.kind === "repeated") {
    const text = plain(num(r.value, ctx));
    return [fillFormula(E.eigenvalueRepeated, { l: f(num(r.value, ctx), approx(toNumber(r.value), text)) })];
  }
  if (r.kind === "distinct") {
    return r.values.map((v, i) => {
      const exact = fieldFormula(v, an.radical, ctx);
      return f("λ", sub(String(i + 1)), " = ", exact, approx(fieldNumberValue(v, an.radical), plain(exact)));
    });
  }
  // α ± βi
  const radical = an.radical!;
  const beta = radicalPart(r.beta, radical, ctx);
  const alphaValue = toNumber(r.alpha);
  const betaValue = toNumber(r.beta) * Math.sqrt(Number(radical.m));
  const exact = isZero(r.alpha) ? f("± ", beta) : f(num(r.alpha, ctx), " ± ", beta);
  const shown = `${isZero(r.alpha) ? "" : `${decimal(alphaValue, 4)} `}± ${decimal(betaValue, 4)}i`;
  return [
    f("λ = ", exact, needsDecimal(plain(exact)) ? ` ≈ ${shown}` : ""),
    fillFormula(E.complexParts, { alpha: num(r.alpha, ctx), beta: radicalPart(r.beta, { ...radical, imaginary: false }, ctx) }),
  ];
}

function eigenvectorLines(L: LabelTable, an: LinearAnalysis, ctx: NotationContext): Formula[] {
  const E = L.eigen;
  const v = an.vectors;
  switch (v.kind) {
    case "two":
      return v.v.map((vec, i) => fillFormula(E.eigenvectorOf, { i: SUBSCRIPT_DIGITS[i + 1], v: vectorFormula([fieldFormula(vec[0], an.radical, ctx), fieldFormula(vec[1], an.radical, ctx)]) }));
    case "one":
      return [fillFormula(an.type === "zero_eigenvalue" ? E.eigenvectorOnlyZero : E.eigenvectorOnly, { v: vecQ(v.v, ctx) }), fillFormula(E.generalized, { w: vecQ(v.w, ctx) })];
    case "every":
      return [f(E.eigenvectorEvery)];
    case "complex": {
      const radical = an.radical!;
      const real = { ...radical, imaginary: false };
      const reF = vecQ(v.re, ctx);
      const imF = vectorFormula([fieldFormula({ r: q(0), s: v.im[0] }, real, ctx), fieldFormula({ r: q(0), s: v.im[1] }, real, ctx)]);
      const full = vectorFormula([
        fieldFormula({ r: v.re[0], s: v.im[0] }, radical, ctx),
        fieldFormula({ r: v.re[1], s: v.im[1] }, radical, ctx),
      ]);
      return [fillFormula(E.eigenvectorComplex, { v: full }), fillFormula(E.complexReIm, { re: reF, im: imF })];
    }
  }
}

/** The general solution in the student's notation. */
function solutionLines(L: LabelTable, an: LinearAnalysis, picture: EigenPicture, ctx: NotationContext): Formula[] {
  const E = L.eigen;
  const second = picture === "second";
  const unknown = second ? f("x(t)") : f("(x(t), y(t))");
  const eq = an.equilibrium;
  // The offset by the equilibrium when it is not the origin.
  const offset: Formula = eq.kind === "point" && !(isZero(eq.at[0]) && isZero(eq.at[1])) ? (second ? f(num(eq.at[0], ctx), " + ") : f(vecQ(eq.at, ctx), " + ")) : [];
  const c = (i: number) => f("c", sub(String(i)));
  const r = an.roots;
  const v = an.vectors;
  if (an.type === "zero_eigenvalue") {
    if (eq.kind === "none") return [f(E.solutionNoEquilibrium)];
    if (eq.kind === "plane") return [fillFormula(E.solutionPlane, { u: unknown })];
    if (eq.kind !== "line") return [];
    // A line of equilibria: p0 + c1 v0 + c2 e^(λt) v (λ = tr A ≠ 0), or p0 + c1 v + c2 (t v + w) when
    // tr A = 0 too. On a second-order picture the line is x' = 0 and x(t) = c1 + c2 e^(λt) (or c1 + c2 t).
    const p0: Formula = isZero(eq.through[0]) && isZero(eq.through[1]) ? [] : f(vecQ(eq.through, ctx), " + ");
    if (v.kind === "two" && r.kind === "distinct") {
      const nonzero = r.values.findIndex((x) => !(isZero(x.r) && isZero(x.s)));
      const lam = r.values[nonzero];
      if (second) return [f(unknown, " = ", c(1), " + ", c(2), expRational(lam.r, ctx))];
      const vec = v.v[nonzero];
      return [f(unknown, " = ", p0, c(1), " ", vecQ(eq.direction, ctx), " + ", c(2), expRational(lam.r, ctx), " ", vectorFormula([fieldFormula(vec[0], an.radical, ctx), fieldFormula(vec[1], an.radical, ctx)]))];
    }
    if (v.kind === "one") {
      return second ? [f(unknown, " = ", c(1), " + ", c(2), "t")] : [f(unknown, " = ", p0, c(1), " ", vecQ(v.v, ctx), " + ", c(2), "(t ", vecQ(v.v, ctx), " + ", vecQ(v.w, ctx), ")")];
    }
    return [];
  }
  if (r.kind === "distinct" && v.kind === "two") {
    const rational = r.values.every((x) => isZero(x.s));
    if (second) {
      const terms = rational ? r.values.map((x, i) => f(c(i + 1), expRational(x.r, ctx))) : [f(c(1), "e", sup("λ₁t")), f(c(2), "e", sup("λ₂t"))];
      return rational ? [f(unknown, " = ", offset, terms[0], " + ", terms[1])] : [f(unknown, " = ", offset, terms[0], " + ", terms[1]), f(E.solutionWithValuesSecond)];
    }
    const vecs = v.v.map((vec) => vectorFormula([fieldFormula(vec[0], an.radical, ctx), fieldFormula(vec[1], an.radical, ctx)]));
    if (rational) {
      return [f(unknown, " = ", offset, c(1), expRational(r.values[0].r, ctx), " ", vecs[0], " + ", c(2), expRational(r.values[1].r, ctx), " ", vecs[1])];
    }
    return [f(unknown, " = ", offset, c(1), "e", sup("λ₁t"), " v", sub("1"), " + ", c(2), "e", sup("λ₂t"), " v", sub("2")), f(E.solutionWithValues)];
  }
  if (r.kind === "repeated") {
    const e = expRational(r.value, ctx);
    if (v.kind === "every") return [f(unknown, " = ", offset, e, second ? "" : " ", second ? c(1) : f("(", c(1), ", ", c(2), ")"))];
    if (v.kind === "one") {
      if (second) return [f(unknown, " = ", offset, "(", c(1), " + ", c(2), "t)", e)];
      return [f(unknown, " = ", offset, c(1), e, " ", vecQ(v.v, ctx), " + ", c(2), e, "(t ", vecQ(v.v, ctx), " + ", vecQ(v.w, ctx), ")")];
    }
  }
  if (r.kind === "complex") {
    const growth = isZero(r.alpha) ? [] : f("e", sup("αt"));
    if (second) return [f(unknown, " = ", offset, growth, "(", c(1), " cos βt + ", c(2), " sin βt)"), f(E.solutionComplexValuesSecond)];
    const body = f(c(1), "(a cos βt − b sin βt) + ", c(2), "(a sin βt + b cos βt)");
    return [f(unknown, " = ", offset, growth.length ? f(growth, "[", body, "]") : body), f(E.solutionComplexValues)];
  }
  return [];
}

function exactDerivation(L: LabelTable, an: LinearAnalysis, picture: EigenPicture): Derivation {
  const E = L.eigen;
  const ctx = newContext();
  const [[a, b], [c, d]] = an.system.A;
  const A = matrix([[num(a, ctx), num(b, ctx)], [num(c, ctx), num(d, ctx)]]);
  const zeroB = isZero(an.system.b[0]) && isZero(an.system.b[1]);
  const steps: DerivationStep[] = [];
  const form = picture === "second"
    ? [fillFormula(zeroB ? E.matrixFormSecond : E.matrixFormSecondAffine, { A, b: vecQ(an.system.b, ctx) })]
    : [fillFormula(zeroB ? E.matrixForm : E.matrixFormAffine, { A, b: vecQ(an.system.b, ctx) })];
  steps.push({ title: E.stepMatrix, lines: [...form, ...equilibriumLines(L, an, picture, ctx)] });
  steps.push({ title: E.stepCharacteristic, lines: characteristicLines(L, an, picture, ctx) });
  steps.push({ title: E.stepEigenvalues, lines: eigenvalueLines(L, an, ctx) });
  steps.push({ title: E.stepEigenvectors, lines: eigenvectorLines(L, an, ctx) });
  steps.push({ title: E.stepType, lines: [f(typeLine(L, an))] });
  const solution = solutionLines(L, an, picture, ctx);
  if (solution.length) steps.push({ title: E.stepSolution, lines: solution });
  const notes: Formula[] = [];
  if (an.equilibrium.kind === "point" && an.type !== "zero_eigenvalue") {
    if (an.vectors.kind === "two" || an.vectors.kind === "one") notes.push(f(E.noteLines));
    if (an.vectors.kind === "complex") notes.push(f(an.type === "center" ? E.noteRotationClosed : E.noteRotationOpen));
    if (an.vectors.kind === "every") notes.push(f(E.noteStar));
  }
  if (an.type === "center") notes.push(f(E.noteCenterExact));
  if (an.type === "zero_eigenvalue") notes.push(f(E.noteZeroNoSnap));
  if (picture === "second") notes.push(f(E.noteFormulaPanel));
  if (an.system.approximate) notes.push(f(E.noteApproximate));
  for (const key of an.borderline) notes.push(fillFormula(E.noteBorderline, { what: key === "trace" ? "tr A" : key === "det" ? "det A" : E.discriminantName }));
  if (ctx.rounded) notes.push(f(E.noteRounded));
  return { title: f(E.titleExact), steps, notes };
}

// ---- the numerical linearization --------------------------------------------------------------

function failureLine(L: LabelTable, failure: ReadFailure, picture: EigenPicture): string {
  const E = L.eigen;
  switch (failure.reason) {
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

function numericStep(L: LabelTable, e: Equilibrium, picture: EigenPicture): DerivationStep {
  const E = L.eigen;
  const second = picture === "second";
  const [[a, b], [c, d]] = e.jacobian;
  const lines: Formula[] = [];
  const finite = [a, b, c, d].every(Number.isFinite);
  lines.push(finite ? f("J ≈ ", [{ matrix: [[formatNumber(a, 4), formatNumber(b, 4)], [formatNumber(c, 4), formatNumber(d, 4)]] }]) : f(E.jacobianNotFinite));
  const n = numericEigen(e);
  const values = formatEigenvalues(e.eigenvalues);
  if (values) lines.push(f("λ ≈ ", values));
  switch (n.kind) {
    case "real":
      n.directions.forEach((dir, i) => lines.push(f(fill(n.note === "one" ? E.numericVectorOnly : E.numericVector, { i: SUBSCRIPT_DIGITS[i + 1], v: numericVector(dir.direction), l: formatNumber(dir.eigenvalue, 4) }))));
      break;
    case "complex":
      lines.push(f(fill(E.numericComplex, { re: numericVector(n.re), im: `(${formatNumber(n.im.x, 4)}, ${formatNumber(n.im.y, 4)})`, sense: n.ccw ? E.ccw : E.cw })));
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
  if (input.timeDependent) return { title: f(E.title), steps: [], notes: [f(input.picture === "second" ? E.timeDependentSecond : E.timeDependent)] };
  if (input.linear?.ok) return exactDerivation(L, input.linear.analysis, input.picture);
  const notes: Formula[] = [];
  if (input.linear && !input.linear.ok) notes.push(f(failureLine(L, input.linear.failure, input.picture)));
  const equilibria = input.equilibria ?? [];
  if (equilibria.length === 0) {
    notes.push(f(E.noEquilibrium));
    return { title: f(E.title), steps: [], notes };
  }
  notes.push(f(E.linearizedOnly));
  return { title: f(E.titleNumeric), steps: equilibria.map((e) => numericStep(L, e, input.picture)), notes };
}

// ---- snapping -------------------------------------------------------------------------------

/** The few words next to the snapped pointer (the canvas has little room). */
export function snapHint(L: LabelTable, snap: Snap): string {
  const E = L.eigen;
  const t = snap.target;
  if (t.kind === "line") return fill(E.hintLine, { l: formatNumber(t.eigenvalue, 3) });
  if (t.kind === "segment") return E.hintSegment;
  return snapStability(t) === "stable" ? E.hintBranchStable : E.hintBranchUnstable;
}

/** The full sentence under the picture while the pointer is snapped. */
export function snapSentence(L: LabelTable, snap: Snap, picture: EigenPicture): string {
  const E = L.eigen;
  const t = snap.target;
  const point = pointText(L, snapEquilibrium(t), picture === "second");
  const toward = snapStability(t) === "stable" ? E.toward : E.awayFrom;
  if (t.kind === "line") return fill(E.snapLine, { point, v: numericVector(t.direction), l: formatNumber(t.eigenvalue, 4), toward });
  if (t.kind === "segment") return fill(E.snapSegment, { point, l: formatNumber(t.eigenvalue, 4) });
  return fill(snapStability(t) === "stable" ? E.snapBranchStable : E.snapBranchUnstable, { point });
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
