/**
 * The step-by-step derivations of round 12, shared word for word by the web shell's panel and the
 * MCP tools: how a power series solves a linear equation (substitute, shift the index, collect,
 * recurrence, coefficients, the split u = a0 u1 + a1 u2 (+ up), the radius of convergence) and how a
 * constant-coefficient equation splits into u = u_h + u_p (characteristic equation, roots, trial
 * solution, resonance, constants from the initial values).
 *
 * The sentences are lib/labels' `series` section; the mathematics is lib/series (exact) and its
 * notation module. Every symbol the derivation introduces is named where it first appears (round Z1.1:
 * what the tool writes itself, the tool explains): the coefficients a_n and the summation index n,
 * the index k before a shift, the basis solutions u1, u2 and the particular part up, the root r and
 * the constants C1, C2, the undetermined coefficients A, B. Letters that the student's parameters
 * already use are skipped (a parameter called a makes the coefficients c_n).
 */
import type { LabelTable } from "./labels";
import { surdValue, type Constants, type SolutionFormula } from "./series/decompose";
import type { EquationFailure, LinearEquation, SeriesMode } from "./series/equation";
import type { LinearFailureReason } from "./series/linear-form";
import { MAX_DEGREE } from "./series/linear-form";
import {
  coef, decimal, decimalDirected, decimalDown, decimalLn, distinctDigits, exactNum, f, roundedNumber, factored, fallingFactorialFormula, fillFormula, frac, type Formula, indexSpaced,
  indexText, isSumFormula, join, joinSigned, MINUS, newContext, type NotationContext, num, plain, pointsFormula, poly, polyFactor, power, quasiFormula,
  rootFormula, ROUNDED_DIGITS, shiftedVariable, signedSum, sub, sum, sup, surdFormula, termCount, tMultiple,
} from "./series/notation";
import { pcoef, pdeg, pdivmod, pexactDiv, pgcd, pmonic, plead, pscale, type Poly } from "./series/poly";
import type { Frobenius, FrobeniusRoot, NotPolynomial, SeriesAtSingularPoint, SeriesSolution } from "./series/power-series";
import { coefficientValues, polynomialOde, provenDegree, singularPolynomial } from "./series/power-series";
import { asPolynomial, qpIsZero, realPairs, type QuasiPoly } from "./series/quasi";
import { cmp, fromNumber, gcdBig, isZero, lnAbs, mul, neg, ONE, q, type Q, sign, sqrtExact, toNumber, ZERO } from "./series/rational";

/** The value a printed exact number stands for: a fraction "p/q" or a plain decimal; Infinity for anything else (so a rounded print never passes as a lower bound). */
function fromText(text: string): Q {
  const m = /^(\d+)\/(\d+)$/.exec(text);
  if (m) return q(BigInt(m[1]), BigInt(m[2]));
  const sci = /^(\d+(?:\.\d+)?)(?:·10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+))?$/.exec(text);
  if (sci) {
    const [i, fr = ""] = sci[1].split(".");
    const sup = "⁰¹²³⁴⁵⁶⁷⁸⁹";
    const e = sci[2] ? Number(sci[2].replace("⁻", "-").replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => String(sup.indexOf(c)))) : 0;
    const k = e - fr.length;
    const mant = BigInt(i + fr);
    return k >= 0 ? q(mant * BigInt(10) ** BigInt(k)) : q(mant, BigInt(10) ** BigInt(-k));
  }
  return q(BigInt(10) ** BigInt(4000));
}

export type DerivationStep = { readonly title: string; readonly lines: readonly Formula[] };
export type Derivation = { readonly title: Formula; readonly steps: readonly DerivationStep[]; readonly notes: readonly Formula[] };

/** The letters a derivation uses, chosen around the student's parameter names. */
export type SeriesLetters = { a: string; n: string; k: string; C: string; r: string; A: string; B: string; trialPool: readonly string[] };

export function seriesLetters(params: readonly string[]): SeriesLetters {
  const taken = new Set(params);
  const pick = (choices: readonly string[], also: readonly string[] = []) => choices.find((c) => !taken.has(c) && !also.includes(c)) ?? choices[choices.length - 1];
  const a = pick(["a", "c", "b", "d"]);
  const n = pick(["n", "m", "j", "i"], [a]);
  const k = pick(["k", "j", "i", "l"], [a, n]);
  const C = pick(["C", "K", "D"]);
  const r = pick(["r", "λ"]);
  const A = pick(["A", "P", "U"], [C]);
  const B = pick(["B", "Q", "W"], [C, A]);
  // The undetermined coefficients of several right-hand side terms each get their own pair of letters.
  const trialPool = [A, B, ...["D", "E", "G", "H", "M", "N", "P", "Q", "U", "W"].filter((x) => !taken.has(x) && x !== C && x !== A && x !== B)];
  return { a, n, k, C, r, A, B, trialPool };
}

/** The unknown and its derivatives in the student's notation: y and dy/dt, or x, x', x''. */
export function unknownNames(mode: SeriesMode): { u: string; derivative: (j: number) => Formula; prime: (j: number) => string } {
  if (mode === "first") return { u: "y", derivative: (j) => f(j === 0 ? "y" : "dy/dt"), prime: (j) => (j === 0 ? "y" : "y'") };
  return { u: "x", derivative: (j) => f(j === 0 ? "x" : j === 1 ? "x'" : "x''"), prime: (j) => (j === 0 ? "x" : j === 1 ? "x'" : "x''") };
}

// ---- the equation ----------------------------------------------------------------------------

/** A coefficient (polynomial in the variable, or any quasi-polynomial) times a symbol, as a signed term. */
function coefficientTerm(P: QuasiPoly, symbol: Formula, variable: Formula, ctx: NotationContext): { c: Q; body: Formula } | Formula {
  const p = asPolynomial(P);
  if (p !== null) {
    if (termCount(p) === 1) {
      const k = p.findIndex((v) => !isZero(v));
      const t = power(variable, k);
      return { c: p[k], body: f(t, t.length && symbol.length ? " " : "", symbol) };
    }
    // (1 − t²) as written ascending, (t² − 1/4) descending: a negative constant term with a positive top term reads better last.
    const descending = sign(p[0]) < 0 && sign(p[p.length - 1]) > 0;
    return { c: ONE, body: f("(", poly(p, variable, ctx, descending ? "desc" : "asc"), ")", symbol) };
  }
  return f("(", quasiFormula(P, ctx), ")", symbol);
}

/** The left-hand side sum_j P_j u^(j) (highest derivative first) = G. */
export function equationFormula(eq: LinearEquation, ctx: NotationContext, rhs: "keep" | "zero" = "keep"): Formula {
  const names = unknownNames(eq.mode);
  const pieces: Formula[] = [];
  for (let j = eq.order; j >= 0; j--) {
    if (qpIsZero(eq.P[j])) continue;
    const term = coefficientTerm(eq.P[j], names.derivative(j), f("t"), ctx);
    pieces.push(Array.isArray(term) ? (term as Formula) : signedSum([term as { c: Q; body: Formula }], ctx));
  }
  const left = joinSigned(pieces);
  const right = rhs === "zero" ? f("0") : quasiFormula(eq.G, ctx);
  return f(left, " = ", right);
}

/** The same in powers of s = t - t0 (polynomial coefficients only). */
function shiftedEquationTerms(P: readonly Poly[], s: Formula, order: number, mode: SeriesMode, ctx: NotationContext): Formula {
  const names = unknownNames(mode);
  const terms: { c: Q; body: Formula }[] = [];
  for (let j = order; j >= 0; j--) {
    P[j].forEach((c, k) => {
      const t = power(s, k);
      terms.push({ c, body: f(t, t.length ? " " : "", names.derivative(j)) });
    });
  }
  return signedSum(terms, ctx);
}

// ---- failures --------------------------------------------------------------------------------

const FAILURE_KEY: Record<LinearFailureReason, keyof LabelTable["series"]> = {
  nonlinear: "failNonlinear",
  unsupportedFunction: "failUnsupportedFunction",
  nonIntegerPower: "failNonIntegerPower",
  piecewise: "failPiecewise",
  divisionByNonPolynomial: "failDivision",
  divisionByZero: "failDivisionByZero",
  notFinite: "failNotFinite",
  tooComplex: "failTooComplex",
  tooManyDigits: "failTooManyDigits",
  invalidArgument: "failInvalidArgument",
  noSecondDerivative: "failNoSecondDerivative",
  exponentTooLarge: "failExponentTooLarge",
};

/** The notes under a derivation for an equation read approximately: an irrational constant, a typed literal longer than its double, or both. */
function approximationNotes(L: LabelTable, eq: LinearEquation): Formula[] {
  const notes: Formula[] = [];
  if (eq.approximateConstant) notes.push(f(L.series.approximateNote));
  if (eq.approximateLiteral) notes.push(f(L.series.approximateLiteralNote));
  return notes;
}

/**
 * The line announcing a cancelled common factor. Its zeros are said not to be singular points only
 * when that is true of the reduced equation: t^2 x'' + t x = 0 is t x'' + x = 0 after cancelling t,
 * and t = 0 is still a singular point.
 */
function cancelledLines(L: LabelTable, eq: LinearEquation, ctx: NotationContext, checkpoint?: () => void): Formula[] {
  const lines: Formula[] = [];
  if (eq.commonFactor) {
    const g = polyFactor(eq.commonFactor, f("t"), ctx);
    const ode = polynomialOde(eq);
    let stillSingular: boolean;
    if (ode.ok) stillSingular = pdeg(pgcd(singularPolynomial(ode.ode, checkpoint), eq.commonFactor, checkpoint)) >= 1;
    else {
      const top = asPolynomial(eq.P[eq.order]);
      stillSingular = top === null || pdeg(pgcd(top, eq.commonFactor, checkpoint)) >= 1;
    }
    lines.push(fillFormula(stillSingular ? L.series.cancelledFactorPlain : L.series.cancelledFactor, { g }));
  }
  if (eq.dividedExponential) lines.push(fillFormula(L.series.dividedExponential, { e: f("e", sup(tMultiple(eq.dividedExponential.re, ctx))) }));
  return lines;
}

/** Why the equation cannot be read as a linear equation (a parse failure gets the shell's or tool's own text). */
export function equationFailureText(L: LabelTable, mode: SeriesMode, failure: EquationFailure): Formula {
  if (failure.reason === "parse") return f(L.series.fixEquationFirst);
  return fillFormula(L.series[FAILURE_KEY[failure.reason]], { fragment: failure.fragment, u: unknownNames(mode).u, max: MAX_DEGREE });
}

/**
 * The sentence that comes first when a refusal speaks of an equation the tool divided by e^(lambda t):
 * it shows the divided equation, so "the coefficient of x is e⁻ᵗ" refers to what is on the screen.
 */
function dividedPrefix(L: LabelTable, eq: LinearEquation, ctx: NotationContext): Formula {
  // A cleared denominator or a divided exponential changes the coefficients a refusal names: say so
  // first and show the equation as it now reads.
  if (eq.dividedExponential) {
    return f(fillFormula(L.series.dividedEquation, { e: f("e", sup(tMultiple(eq.dividedExponential.re, ctx))), equation: equationFormula(eq, ctx) }), " ");
  }
  if (eq.cleared) return f(fillFormula(L.series.clearedEquation, { den: polyFactor(eq.cleared, f("t"), ctx), equation: equationFormula(eq, ctx) }), " ");
  return f("");
}

export function notPolynomialText(L: LabelTable, eq: LinearEquation, reason: NotPolynomial): Formula {
  const ctx = newContext();
  const names = unknownNames(eq.mode);
  const prefix = dividedPrefix(L, eq, ctx);
  if (reason.which === "rightHandSide") return f(prefix, fillFormula(L.series.seriesNotPolynomialRhs, { G: quasiFormula(eq.G, ctx) }));
  return f(prefix, fillFormula(L.series.seriesNotPolynomialCoefficient, { d: names.derivative(reason.order), P: quasiFormula(eq.P[reason.order], ctx) }));
}

/**
 * p / q reduced, both with integer coefficients and the denominator's leading coefficient positive:
 * "1/t", "1/(2t)", "−1/(1 + 2t)", or a polynomial when q divides p. Never a fraction inside a
 * fraction ("1/2/t" would read t/2).
 */
function ratioFormula(p: Poly, divisor: Poly, ctx: NotationContext, checkpoint?: () => void): Formula {
  const g = pgcd(p, divisor, checkpoint);
  let num = pexactDiv(p, g);
  let den = pexactDiv(divisor, g);
  if (pdeg(den) <= 0) return poly(pscale(num, ONE_OVER(den[0])), f("t"), ctx);
  // Scale both by the lcm of all denominators over the gcd of all numerators, the sign into the numerator.
  let lcm = BigInt(1);
  for (const c of [...num, ...den]) lcm = (lcm / gcdBig(lcm, c.d)) * c.d;
  let content = BigInt(0);
  for (const c of [...num, ...den]) content = gcdBig(content, (c.n * lcm) / c.d);
  const sgn = plead(den).n < BigInt(0) ? BigInt(-1) : BigInt(1);
  const scale = q(sgn * lcm, content === BigInt(0) ? BigInt(1) : content);
  num = pscale(num, scale);
  den = pscale(den, scale);
  const numText = poly(num, f("t"), ctx);
  const denText = poly(den, f("t"), ctx);
  // A denominator that is a sum or carries a coefficient is bracketed: 1/(2t), 1/(1 + t²).
  const bracketDen = termCount(den) >= 2 || cmp(plead(den), ONE) !== 0;
  return f(termCount(num) >= 2 ? f("(", numText, ")") : numText, "/", bracketDen ? f("(", denText, ")") : denText);
}
function ONE_OVER(v: Q): Q {
  return { n: v.d * (v.n < BigInt(0) ? BigInt(-1) : BigInt(1)), d: v.n < BigInt(0) ? -v.n : v.n };
}

/**
 * Why the solution formula does not apply, in the student's terms. The method needs the equation
 * divided by its leading coefficient to have constant coefficients and a right-hand side made of
 * polynomials, exponentials, sines and cosines. When every coefficient is a constant multiple of the
 * leading one, the right-hand side divided by it is the obstacle (1/(1 + t) of dy/dt = y + 1/(1 + t));
 * otherwise the first coefficient that varies is named AFTER that division (x'' + x/t = 0: the
 * coefficient of x is 1/t, not the t of t x'' + x = 0 the tool multiplied through to). The power
 * series is suggested only when it accepts the equation (polynomial coefficients and right-hand side).
 */
export function notConstantText(L: LabelTable, eq: LinearEquation, order: number, checkpoint?: () => void): Formula {
  const ctx = newContext();
  const names = unknownNames(eq.mode);
  const series = polynomialOde(eq).ok;
  const polys = eq.P.map(asPolynomial);
  const top = polys[eq.order];
  if (top !== null && top !== undefined && pdeg(top) >= 1 && polys.every((p) => p !== null)) {
    const ratios = (polys as Poly[]).map((p) => {
      const { quotient, remainder } = pdivmod(p, top, checkpoint);
      return remainder.length === 0 && pdeg(quotient) <= 0 ? null : p;
    });
    const varying = ratios.findIndex((r, j) => j < eq.order && r !== null);
    if (varying < 0) {
      // Constant coefficients once divided by the top one: the right-hand side so divided is the obstacle.
      const G = asPolynomial(eq.G);
      const shown = G !== null ? ratioFormula(G, top, ctx, checkpoint) : (() => {
        const g = quasiFormula(eq.G, ctx);
        const den = polyFactor(top, f("t"), ctx);
        return f(isSumFormula(g) ? f("(", g, ")") : g, "/", termCount(top) === 1 && cmp(plead(top), ONE) !== 0 ? f("(", den, ")") : den);
      })();
      return fillFormula(L.series.formulaRhsNotQuasiDivided, { top: names.derivative(eq.order), G: shown });
    }
    const values = { top: names.derivative(eq.order), d: names.derivative(varying), P: ratioFormula(polys[varying] as Poly, top, ctx, checkpoint) };
    return fillFormula(series ? L.series.formulaNotConstantDivided : L.series.formulaNotConstantDividedNoSeries, values);
  }
  const values = { d: names.derivative(order), P: quasiFormula(eq.P[order], ctx) };
  return f(dividedPrefix(L, eq, ctx), fillFormula(series ? L.series.formulaNotConstant : L.series.formulaNotConstantNoSeries, values));
}

// ---- power series ----------------------------------------------------------------------------

export type SeriesDerivationInput = {
  readonly equation: LinearEquation;
  readonly result: SeriesSolution | SeriesAtSingularPoint;
  /** The highest power shown (N). */
  readonly terms: number;
  /** u(t0) (and u'(t0)) for the last step, or null. */
  readonly initial: readonly Q[] | null;
  readonly letters: SeriesLetters;
  /** The caller's budget, called while the formulas are printed (hundreds of long coefficients). */
  readonly checkpoint?: () => void;
};

/** "x(0) = 1, x'(0) = 0". */
export function conditionsFormula(mode: SeriesMode, t0: Q, values: readonly Q[], ctx: NotationContext): Formula {
  const names = unknownNames(mode);
  const at = exactNum(t0, ctx);
  const parts: Formula[] = [f(names.u, "(", at, ") = ", num(values[0], ctx))];
  if (values.length > 1) parts.push(f(names.prime(1), "(", at, ") = ", num(values[1], ctx)));
  return join(parts, ", ");
}

/**
 * The series through s^N of a coefficient list, with "+ …" unless it ends there (degree known and <= N);
 * `cut` records a "+ …" and the highest power actually shown (less than N when the digit cap stopped
 * the coefficients first).
 */
function seriesThrough(coefficients: readonly Q[], N: number, s: Formula, ctx: NotationContext, degree: number | null, cut?: { value: boolean; last: number }): Formula {
  const last = degree === null ? N : Math.min(N, degree);
  const terms: { c: Q; body: Formula }[] = [];
  for (let k = 0; k <= last && k < coefficients.length; k++) terms.push({ c: coefficients[k], body: power(s, k) });
  const body = signedSum(terms, ctx);
  if (degree !== null && degree <= N) return body;
  if (cut) {
    cut.value = true;
    cut.last = Math.max(cut.last, Math.min(last, coefficients.length - 1));
  }
  return f(body, " + …");
}
/** "Shown through s^k" for the highest power a cut series actually showed. */
function shownThroughLine(L: LabelTable, s: Formula, cut: { last: number }): Formula {
  const p = power(s, cut.last);
  return fillFormula(L.series.shownThrough, { power: p.length ? p : f("1") });
}

/** A coefficient vector as a combination of a0 (a1) and 1. */
function vectorFormula(v: readonly Q[], order: number, letters: SeriesLetters, ctx: NotationContext): Formula {
  const terms: { c: Q; body: Formula }[] = [];
  for (let i = 0; i < order; i++) terms.push({ c: v[i], body: coef(letters.a, i) });
  terms.push({ c: v[order], body: [] });
  return signedSum(terms, ctx);
}

/** One equation term's series before and after the index shift. */
function termSeries(term: SeriesSolution["terms"][number], s: Formula, mode: SeriesMode, letters: SeriesLetters, ctx: NotationContext): Formula {
  const names = unknownNames(mode);
  const { n, k, a } = letters;
  const negative = sign(term.c) < 0;
  const abs = negative ? neg(term.c) : term.c;
  const scale = cmp(abs, ONE) === 0 ? f("") : num(abs, ctx);
  const label = signedSum([{ c: term.c, body: f(power(s, term.m), term.m ? " " : "", names.derivative(term.j)) }], ctx);
  const minus = negative ? MINUS : "";
  const exponentBefore = indexText(k, -term.delta);
  const before = f(minus, sum(k, term.j, f(scale, fallingFactorialFormula(k, 0, term.j), coef(a, k), power(s, exponentBefore === k ? k : exponentBefore))));
  const after = f(minus, sum(n, term.m, f(scale, fallingFactorialFormula(n, term.delta, term.j), coef(a, indexText(n, term.delta)), power(s, n))));
  if (term.delta === 0) return f(label, " = ", after);
  // The shift note stays on one line (non-breaking spaces): "(n = k − 2)" never wraps in the middle.
  return f(label, " = ", before, " = ", after, `   (${n} = ${indexSpaced(k, -term.delta)})`.replace(/(?<=\S) (?=\S)/g, " "));
}

/** The coefficient-of-s^n equation for n >= from: every term with its polynomial factor in n. */
function generalEquation(sol: SeriesSolution, letters: SeriesLetters, ctx: NotationContext): Formula {
  const pieces: Formula[] = [];
  for (const t of sol.terms) {
    const negative = sign(t.c) < 0;
    const abs = negative ? neg(t.c) : t.c;
    const scale = cmp(abs, ONE) === 0 ? f("") : num(abs, ctx);
    pieces.push(f(negative ? MINUS : "", scale, fallingFactorialFormula(letters.n, t.delta, t.j), coef(letters.a, indexText(letters.n, t.delta))));
  }
  return f(joinSigned(pieces), " = 0");
}

/** a_{n+r} = (...) / (...): the recurrence, factored. */
function recurrenceFormula(sol: SeriesSolution, letters: SeriesLetters, ctx: NotationContext): Formula {
  const { n, a } = letters;
  const rec = sol.recurrence;
  const lhs = coef(a, indexText(n, rec.order));
  if (rec.numerators.length === 0) return f(lhs, " = 0");
  const timesCoefficient = (p: Poly, delta: number): Formula => {
    const factor = plain(factored(p, n, ctx));
    const symbol = coef(a, indexText(n, delta));
    if (factor === "1") return symbol;
    if (factor === MINUS + "1") return f(MINUS, symbol);
    return f(factored(p, n, ctx), symbol);
  };
  // A negative leading coefficient of the denominator moves to the numerator: "−aₙ / 2", never "aₙ / (−2)".
  const flip = (p: Poly) => (sign(pcoef(p, pdeg(p))) < 0 ? p.map(neg) : p);
  const denPoly = rec.ratio ? rec.ratio.den : rec.denominator;
  const negate = sign(pcoef(denPoly, pdeg(denPoly))) < 0;
  const numerator = rec.ratio
    ? timesCoefficient(negate ? rec.ratio.num.map(neg) : rec.ratio.num, rec.ratio.delta)
    : joinSigned(rec.numerators.map((x) => timesCoefficient(negate ? x.poly.map(neg) : x.poly, x.delta)));
  const denominator = factored(flip(denPoly), n, ctx);
  const numText = plain(numerator);
  const denText = plain(denominator);
  if (denText === "1") return f(lhs, " = ", numerator);
  if (numText.startsWith(MINUS) && !/[+]| − /.test(numText.slice(1))) return f(lhs, " = ", MINUS, frac(numText.slice(1), denText));
  return f(lhs, " = ", frac(numText, denText));
}

/** |t − t0| < ρ (|t| < ρ at t0 = 0). */
function intervalFormula(center: Q, rho: Formula, ctx: NotationContext): Formula {
  return isZero(center) ? f("|t| < ", rho) : f("|t ", sign(center) > 0 ? MINUS : "+", " ", exactNum(sign(center) > 0 ? center : neg(center), ctx), "| < ", rho);
}

/** The radius sentences shared by the ordinary and the Frobenius case for a radius that is not infinite. */
function boundedRadiusLine(L: LabelTable, radius: Exclude<SeriesSolution["radius"], { kind: "infinite" }>, center: Q, d: Formula, ctx: NotationContext, frobenius: boolean): Formula {
  if (radius.kind === "lowerBound") {
    // A proven bound prints rounded down: it must never read larger than what was proven (also beyond the double range).
    const rho = f(decimalLn(radius.ln, 4, "down"));
    const interval = intervalFormula(center, rho, ctx);
    return fillFormula(frobenius ? L.series.frobeniusRadiusBound : L.series.radiusBound, { d, rho, interval });
  }
  const { points, rho, interval } = radiusParts(radius, center, ctx);
  return frobenius ? fillFormula(L.series.frobeniusRadius, { interval, points }) : fillFormula(L.series.radiusFinite, { d, points, rho, interval });
}

/** The nearest singular points, the distance ρ and the interval |t − t0| < ρ of a finite radius. */
function radiusParts(radius: Extract<SeriesSolution["radius"], { kind: "finite" }>, center: Q, ctx: NotationContext) {
  const points = pointsFormula(radius.nearest, ctx);
  const squared = radius.distance.squared;
  const exact = squared ? sqrtExact(squared) : null;
  const estimate = decimalLn(radius.distance.ln, 4);
  const rho = exact ? num(exact, ctx) : squared ? f(surdFormula(ONE, squared, ctx), " ≈ ", estimate) : f("≈ ", estimate);
  // The interval is a guarantee: an exact radius prints exactly, any decimal of it rounded DOWN from the proven bound.
  const lower = radius.distance.lower;
  const lowerText = Number.isFinite(lower) && lower > 0 ? decimalDown(lower) : decimalLn(radius.distance.ln + Math.log1p(-1e-13), 4, "down");
  // An exact rational radius too long to print exactly is rounded DOWN like every guaranteed bound.
  const exactShort = (v: Q): Formula => {
    const shown = num(v, ctx);
    if (cmp(fromText(plain(shown)), v) <= 0) return shown;
    ctx.rounded = true;
    return f(decimalLn(lnAbs(v), ROUNDED_DIGITS, "down"));
  };
  const rhoShort = exact ? exactShort(exact) : squared ? surdFormula(ONE, squared, ctx, "down") : f(lowerText);
  return { points, rho, interval: intervalFormula(center, rhoShort, ctx) };
}

function radiusLines(L: LabelTable, sol: SeriesSolution, names: ReturnType<typeof unknownNames>, ctx: NotationContext): Formula[] {
  const d = names.derivative(sol.order);
  if (sol.radius.kind === "infinite") return [fillFormula(L.series.radiusInfinite, { d })];
  return [boundedRadiusLine(L, sol.radius, sol.center, d, ctx, false), f(L.series.radiusNote)];
}

/** "n²aₙ = −aₙ₋₂" and "aₙ = −aₙ₋₂ / n²" for one Frobenius exponent. */
function frobeniusEquations(root: FrobeniusRoot, letters: SeriesLetters, ctx: NotationContext): { equation: Formula; recurrence: Formula } {
  const { n, a } = letters;
  const an = coef(a, n);
  const times = (p: Poly, symbol: Formula): Formula => {
    const factor = plain(factored(p, n, ctx));
    if (factor === "1") return symbol;
    if (factor === MINUS + "1") return f(MINUS, symbol);
    return f(factored(p, n, ctx), symbol);
  };
  const rhs = root.numerators.length ? joinSigned(root.numerators.map((x) => times(x.poly, coef(a, indexText(n, -x.shift))))) : f("0");
  const equation = f(times(root.denominator, an), " = ", rhs);
  if (root.numerators.length === 0) return { equation, recurrence: f(an, " = 0") };
  const numText = plain(rhs);
  const denText = plain(factored(root.denominator, n, ctx));
  const single = root.numerators.length === 1;
  const recurrence = single && numText.startsWith(MINUS) ? f(an, " = ", MINUS, frac(numText.slice(1), denText)) : f(an, " = ", frac(numText, denText));
  return { equation, recurrence };
}

/** The Frobenius step: the ansatz, each exponent's recurrence, coefficients and series, the second solution's fate, convergence. */
function frobeniusLines(L: LabelTable, result: SeriesAtSingularPoint, fr: Frobenius, N: number, letters: SeriesLetters, ctx: NotationContext): Formula[] {
  const names = unknownNames(result.order === 2 ? "second" : "first");
  const s = shiftedVariable(result.center, ctx);
  const { n, a, r } = letters;
  const t0 = exactNum(result.center, ctx);
  const lines: Formula[] = [fillFormula(L.series.frobeniusAnsatz, { u: names.u, sum: sum(n, 0, f(coef(a, n), power(s, `${n}+${r}`))), a0: coef(a, 0) })];
  const cut = { value: false, last: 0 };
  const describe = (root: FrobeniusRoot, index: number) => {
    const { equation, recurrence } = frobeniusEquations(root, letters, ctx);
    lines.push(fillFormula(L.series.frobeniusRoot, { r, root: num(root.exponent, ctx), equation, n, recurrence }));
    if (root.freeIndex !== null) {
      lines.push(fillFormula(L.series.frobeniusFree, { n, index: root.freeIndex, an: coef(a, n), aN: coef(a, root.freeIndex) }));
    }
    const shown: Formula[] = [];
    for (let k = 1; k <= Math.min(N, 8, root.coefficients.length - 1); k++) shown.push(f(coef(a, k), " = ", num(root.coefficients[k], ctx)));
    lines.push(f(join(shown, ", "), N > 8 ? ", …" : ""));
    const prefix = isZero(root.exponent) ? f("") : power(s, plain(num(root.exponent, ctx)));
    const body = seriesThrough(root.coefficients, N, s, ctx, root.degree, cut);
    const bracket = prefix.length === 0 ? body : plain(body) === "1" ? prefix : f(prefix, "(", body, ")");
    lines.push(f(names.u, sub(String(index)), "(t) = ", bracket));
  };
  describe(fr.first, 1);
  const log = f(names.u, sub("1"), "(t) ln|", s, "|");
  switch (fr.second.kind) {
    case "series":
      lines.push(fr.second.root.freeIndex !== null
        ? fillFormula(L.series.frobeniusSecondLucky, { gap: fr.second.root.freeIndex })
        : f(L.series.frobeniusSecondSeries));
      describe(fr.second.root, 2);
      break;
    case "logEqual":
      lines.push(fillFormula(L.series.frobeniusLogEqual, { log }));
      break;
    case "logInteger":
      lines.push(fillFormula(L.series.frobeniusLogInteger, { gap: fr.second.gap, n, log }));
      break;
    case "undecided":
      lines.push(fillFormula(L.series.frobeniusUndecided, { gap: fr.second.gap, n }));
      break;
    case "none":
      break;
  }
  if (fr.radius.kind === "infinite") lines.push(fillFormula(L.series.frobeniusRadiusInfinite, { t0 }));
  else lines.push(boundedRadiusLine(L, fr.radius, result.center, names.derivative(result.order), ctx, true));
  if (cut.value) lines.push(shownThroughLine(L, s, cut));
  return lines;
}

/** The power-series derivation (an ordinary point) or the description of the singular point. */
export function seriesDerivation(L: LabelTable, input: SeriesDerivationInput): Derivation {
  const ctx = newContext();
  ctx.checkpoint = input.checkpoint;
  const { equation, result, letters } = input;
  const mode = equation.mode;
  const names = unknownNames(mode);
  const t0 = exactNum(result.center, ctx);
  const s = shiftedVariable(result.center, ctx);
  const notes: Formula[] = [];
  const stepEquation: DerivationStep = {
    title: L.series.stepEquation,
    lines: [
      fillFormula(L.series.linearForm, { equation: equationFormula(equation, ctx) }),
      ...(equation.cleared ? [fillFormula(L.series.cleared, { den: polyFactor(equation.cleared, f("t"), ctx) })] : []),
      ...cancelledLines(L, equation, ctx),
    ],
  };
  const d = names.derivative(result.order);
  const topPoly = asPolynomial(equation.P[result.order]) ?? [];

  if (result.status === "singular") {
    const lines: Formula[] = [fillFormula(L.series.singularLine, { d, P: poly(topPoly, f("t"), ctx), t0 })];
    const steps: DerivationStep[] = [stepEquation, { title: L.series.stepSingular, lines }];
    if (result.point.kind === "regular") {
      const sumF = sum(letters.n, 0, f(coef(letters.a, letters.n), power(s, `${letters.n}+${letters.r}`)));
      const roots = join(result.point.roots.map((r) => f(letters.r, " = ", rootFormula(r, ctx), r.multiplicity > 1 ? ` (${L.series.multiplicity2})` : "")), ", ");
      lines.push(fillFormula(L.series.regularSingular, { t0, u: names.u, sum: sumF, r: letters.r, indicial: poly(result.point.indicial, f(letters.r), ctx, "desc"), roots }));
      const fr = result.point.frobenius;
      if ("blocked" in fr) lines.push(f(fr.blocked === "forcing" ? L.series.frobeniusForcing : L.series.frobeniusNotRational));
      else steps.push({ title: L.series.stepFrobenius, lines: frobeniusLines(L, result, fr, input.terms, letters, ctx) });
    } else {
      lines.push(fillFormula(L.series.irregularSingular, { t0 }));
    }
    const fr = result.point.kind === "regular" ? result.point.frobenius : null;
    if (fr && !("blocked" in fr) && (fr.first.digitLimited || (fr.second.kind === "series" && fr.second.root.digitLimited))) {
      const reached = Math.min(fr.first.coefficients.length, fr.second.kind === "series" ? fr.second.root.coefficients.length : Infinity) - 1;
      notes.push(fillFormula(L.series.digitsCap, { power: power(s, reached).length ? power(s, reached) : f("1") }));
    }
    notes.push(...approximationNotes(L, equation));
    if (ctx.rounded) notes.push(f(L.series.roundedNote));
    return { title: fillFormula(L.series.singularTitle, { t0 }), steps, notes };
  }

  const sol = result;
  const N = input.terms;
  const steps: DerivationStep[] = [stepEquation];
  // 1. ordinary point
  const leadValue = pcoef(sol.shifted.P[sol.order], 0);
  steps.push({
    title: L.series.stepOrdinary,
    lines: [
      pdeg(topPoly) <= 0
        ? fillFormula(L.series.ordinaryConstant, { d, P: num(leadValue, ctx) })
        : fillFormula(L.series.ordinaryAt, { d, P: poly(topPoly, f("t"), ctx), t0, value: num(leadValue, ctx) }),
      ...(isZero(sol.center)
        ? []
        : [fillFormula(L.series.shifted, { s, list: f(shiftedEquationTerms(sol.shifted.P, s, sol.order, mode, ctx), " = ", poly(sol.shifted.G, s, ctx)) })]),
    ],
  });
  // 2. the ansatz and its derivatives
  const { n, a } = letters;
  const an = coef(a, n);
  const derivs: Formula[] = [];
  for (let j = 1; j <= sol.order; j++) {
    derivs.push(f(names.derivative(j), " = ", sum(n, j, f(fallingFactorialFormula(n, 0, j), an, power(s, indexText(n, -j))))));
  }
  steps.push({
    title: L.series.stepAnsatz,
    lines: [
      fillFormula(L.series.ansatz, { u: names.u, sum: sum(n, 0, f(an, power(s, n))), an }),
      fillFormula(L.series.derivatives, { list: join(derivs, ", ") }),
    ],
  });
  // 3. substitute term by term
  const powerN = power(s, n);
  steps.push({
    title: L.series.stepSubstitute,
    lines: [
      fillFormula(L.series.substituteIntro, { power: powerN, k: letters.k }),
      ...sol.terms.map((t) => termSeries(t, s, mode, letters, ctx)),
      // The right-hand side in powers of (t − t0): only worth a line when the center moved it.
      ...(qpIsZero(equation.G) || isZero(sol.center) ? [] : [f(quasiFormula(equation.G, ctx), " = ", poly(sol.shifted.G, s, ctx))]),
    ],
  });
  // 4. collect the coefficient of s^n
  const collectLines: Formula[] = [];
  if (sol.low.length === 0) {
    collectLines.push(fillFormula(L.series.collectAll, { n }));
    collectLines.push(generalEquation(sol, letters, ctx));
  } else {
    collectLines.push(fillFormula(L.series.collectSeparately, { n }));
    for (const low of sol.low) {
      const lhs = signedSum(low.parts.map((p) => ({ c: p.value, body: coef(a, low.n + p.delta) })), ctx);
      const solved = f(coef(a, low.solvedIndex), " = ", vectorFormula(low.solved, sol.order, letters, ctx));
      const equationText = f(lhs, " = ", num(low.rhs, ctx));
      const direct = plain(equationText) === plain(solved);
      collectLines.push(direct ? fillFormula(L.series.lowLineDirect, { n, value: low.n, equation: equationText }) : fillFormula(L.series.lowLine, { n, value: low.n, equation: equationText, solved }));
    }
    collectLines.push(fillFormula(L.series.generalLine, { n, from: sol.recurrence.from, equation: generalEquation(sol, letters, ctx) }));
  }
  steps.push({ title: plain(fillFormula(L.series.stepCollect, { power: powerN })), lines: collectLines });
  // 5. the recurrence
  steps.push({
    title: L.series.stepRecurrence,
    lines: [
      fillFormula(L.series.recurrence, { formula: recurrenceFormula(sol, letters, ctx), n, from: sol.recurrence.from }),
      sol.order === 2
        ? fillFormula(L.series.freeCoefficients2, { a0: coef(a, 0), a1: coef(a, 1) })
        : fillFormula(L.series.freeCoefficients1, { a0: coef(a, 0) }),
    ],
  });
  // 6. the first coefficients
  const shownCoefficients: Formula[] = [];
  const lastShown = Math.min(N, 10, sol.coefficients.length - 1);
  for (let k = sol.order; k <= lastShown; k++) shownCoefficients.push(f(coef(a, k), " = ", vectorFormula(sol.coefficients[k], sol.order, letters, ctx)));
  steps.push({ title: L.series.stepCoefficients, lines: [f(join(shownCoefficients, ", "), lastShown < N ? ", …" : "")] });
  // 7. the split
  const basisNames = sol.basis.map((b) => f(names.u, sub(String(b.component + 1))));
  const particularName = f(names.u, sub("p"));
  const splitTerms = sol.basis.map((b, i) => f(coef(a, b.component), basisNames[i], "(t)"));
  if (sol.particular) splitTerms.push(f(particularName, "(t)"));
  const split = f(names.u, "(t) = ", join(splitTerms, " + "));
  const splitLines: Formula[] = [
    sol.order === 2 ? fillFormula(L.series.split2, { a0: coef(a, 0), a1: coef(a, 1), split }) : fillFormula(L.series.split1, { a0: coef(a, 0), split }),
  ];
  const cut = { value: false, last: 0 };
  sol.basis.forEach((b, i) => {
    splitLines.push(f(basisNames[i], "(t) = ", seriesThrough(b.coefficients, N, s, ctx, b.degree, cut)));
    if (b.degree !== null && b.degree >= 0) splitLines.push(fillFormula(L.series.polynomialNote, { name: basisNames[i], power: power(s, b.degree).length ? power(s, b.degree) : f("1") }));
  });
  if (sol.particular) {
    splitLines.push(f(particularName, "(t) = ", seriesThrough(sol.particular.coefficients, N, s, ctx, sol.particular.degree, cut)));
    splitLines.push(fillFormula(L.series.particularNote, { name: particularName, G: quasiFormula(equation.G, ctx) }));
  }
  splitLines.push(
    sol.order === 2
      ? fillFormula(L.series.initialMeaning2, { a0: coef(a, 0), a1: coef(a, 1), u: names.u, up: names.prime(1), t0 })
      : fillFormula(L.series.initialMeaning1, { a0: coef(a, 0), u: names.u, t0 }),
  );
  if (cut.value) splitLines.push(shownThroughLine(L, s, cut));
  steps.push({ title: L.series.stepSplit, lines: splitLines });
  // 8. the radius of convergence
  steps.push({ title: L.series.stepRadius, lines: radiusLines(L, sol, names, ctx) });
  // 9. the chosen initial values
  if (input.initial) {
    const values = coefficientValues(sol, input.initial);
    // Proven on the COMBINED coefficients: x'' + x = 1 from x(0) = 1, x'(0) = 0 is exactly x = 1,
    // although neither basis series stops.
    const degree = provenDegree(values, sol.recurrence);
    steps.push({
      title: L.series.stepInitial,
      lines: [fillFormula(L.series.initialLine, { conditions: conditionsFormula(mode, sol.center, input.initial, ctx), u: names.u, series: seriesThrough(values, N, s, ctx, degree) })],
    });
  }
  if (sol.digitLimited) notes.push(fillFormula(L.series.digitsCap, { power: power(s, sol.coefficients.length - 1).length ? power(s, sol.coefficients.length - 1) : f("1") }));
  notes.push(...approximationNotes(L, equation));
  if (ctx.rounded) notes.push(f(L.series.roundedNote));
  return { title: fillFormula(L.series.seriesTitle, { t0 }), steps, notes };
}

// ---- the solution formula --------------------------------------------------------------------

/** The outcome of the solution formula's self-check: an exact substitution, and a comparison with the numerical solution near t0. */
export type FormulaCheckResult = {
  /** sum_j P_j D^j u_p = G holds exactly (quasi-polynomial arithmetic, no rounding). */
  readonly residualExact: boolean;
  /** The comparison with the numerical solution on the range it actually covered, or null when none was possible. */
  readonly numeric: { readonly deviation: number; readonly ok: boolean; readonly covered: { readonly min: number; readonly max: number } } | null;
  /**
   * The formula's terms are this many times the solution's size and cancel (near resonance): a
   * floating-point comparison cannot resolve the formula, so none is claimed. null otherwise.
   */
  readonly cancellation?: number | null;
};

/** The ends of a compared range, each rounded INWARD with enough digits to keep the two apart ("99999 ≤ t ≤ 100001"). */
function rangeFormula(range: { readonly min: number; readonly max: number }): Formula {
  const width = range.max - range.min;
  const scale = Math.max(Math.abs(range.min), Math.abs(range.max));
  const digits = width > 0 && scale > 0 ? Math.min(17, Math.max(4, Math.ceil(Math.log10(scale / width)) + 3)) : 4;
  return f(decimalDirected(range.min, digits, "up"), " ≤ t ≤ ", decimalDirected(range.max, digits, "down"));
}

/** The undetermined-coefficient letters past the pool get primes: A, B, …, then A′, B′, … */
function trialLetter(pool: readonly string[], k: number): string {
  const round = Math.floor(k / pool.length);
  const marks = ["", "′", "″", "‴"];
  return `${pool[k % pool.length]}${round < marks.length ? marks[round] : String(round)}`;
}

export type FormulaDerivationInput = {
  readonly equation: LinearEquation;
  readonly formula: SolutionFormula;
  readonly t0: Q;
  readonly initial: readonly Q[] | null;
  readonly constants: Constants | null;
  readonly letters: SeriesLetters;
  readonly check: FormulaCheckResult | null;
};

/** The variable of the anchored basis: t, or (t − t0). */
function anchoredVariable(t0: Q, ctx: NotationContext): string {
  return plain(shiftedVariable(t0, ctx));
}
/** e^(c (t − t0)), nothing for c = 0. */
function expOf(c: Q, t0: Q, ctx: NotationContext): Formula {
  if (isZero(c)) return f("");
  const v = anchoredVariable(t0, ctx);
  const text = tMultiple(c, ctx, v);
  // e^(t − 1/2), not e^((t − 1/2)): the exponent's own grouping suffices.
  return f("e", sup(text === v && v.startsWith("(") ? v.slice(1, -1) : text));
}
/** β(t − t0) for the cos / sin of a complex pair. */
function argumentOf(roots: SolutionFormula["roots"] & { kind: "complex" }, t0: Q, ctx: NotationContext): Formula {
  const b = roots.beta;
  const v = anchoredVariable(t0, ctx);
  if ("exact" in b) {
    // β = 1 about t0 = 1 is cos(t − 1), not cos((t − 1)): the call's own parentheses suffice.
    const text = tMultiple(b.exact, ctx, v);
    return f(text === v && v.startsWith("(") ? v.slice(1, -1) : text);
  }
  const surd = surdFormula(b.scale, b.radicand, ctx);
  // (√2/2)t keeps its parentheses; a decimal the surd was rounded to does not need them.
  return /[√/]/.test(plain(surd)) ? f("(", surd, ")", v) : f(surd, v);
}

function rootsLine(L: LabelTable, sol: SolutionFormula, letters: SeriesLetters, ctx: NotationContext): Formula {
  const r = letters.r;
  const roots = sol.roots;
  const plusMinus = (center: Q, magnitude: Formula, imaginary: boolean) => {
    const unit = imaginary && plain(magnitude) === "1";
    return isZero(center) ? f("±", unit ? "" : magnitude, imaginary ? "i" : "") : f(num(center, ctx), " ± ", unit ? "" : magnitude, imaginary ? "i" : "");
  };
  switch (roots.kind) {
    case "single":
      return fillFormula(L.series.singleRoot, { roots: f(r, " = ", num(roots.root, ctx)) });
    case "distinct":
      return fillFormula(L.series.casePositive, { roots: f(r, sub("1"), " = ", num(roots.r1, ctx), ", ", r, sub("2"), " = ", num(roots.r2, ctx)) });
    case "distinctIrrational": {
      const value = toNumber(roots.scale) * Math.sqrt(toNumber(roots.disc));
      const exact = plusMinus(roots.center, surdFormula(roots.scale, roots.disc, ctx), false);
      const digits = approxDigits(sol);
      return fillFormula(L.series.casePositive, { roots: f(r, " = ", exact, " (≈ ", decimal(toNumber(roots.center) + value, digits), ", ", decimal(toNumber(roots.center) - value, digits), ")") });
    }
    case "repeated":
      return fillFormula(L.series.caseZero, { roots: f(r, " = ", num(roots.root, ctx)) });
    case "complex": {
      const beta = "exact" in roots.beta ? num(roots.beta.exact, ctx) : surdFormula(roots.beta.scale, roots.beta.radicand, ctx);
      // The decimal value next to a surd (√7/4 ≈ 0.6614), with the digits that keep the rates apart; not
      // when the surd itself already printed as a rounded decimal.
      const digits = approxDigits(sol);
      const im = decimal(surdValue(roots.beta), digits);
      const re = isZero(roots.alpha) ? "" : `${decimal(toNumber(roots.alpha), digits)} `;
      const approx = "exact" in roots.beta || !plain(beta).includes("√") ? f("") : f(" (≈ ", re, "±", re ? " " : "", im === "1" ? "" : im, "i)");
      return fillFormula(L.series.caseNegative, { roots: f(r, " = ", plusMinus(roots.alpha, beta, true), approx) });
    }
  }
}

/** The anchored basis functions as formulas: e^(r(t − t0)), (t − t0)e^(r(t − t0)), e^(α(t − t0))cos(β(t − t0)), ... */
function basisFormulas(sol: SolutionFormula, t0: Q, ctx: NotationContext): Formula[] {
  const roots = sol.roots;
  const v = anchoredVariable(t0, ctx);
  const one = (e: Formula) => (e.length ? e : f("1"));
  switch (roots.kind) {
    case "single":
      return [one(expOf(roots.root, t0, ctx))];
    case "distinct":
      return [one(expOf(roots.r1, t0, ctx)), one(expOf(roots.r2, t0, ctx))];
    case "distinctIrrational": {
      const c = isZero(roots.center) ? "" : `${plain(num(roots.center, ctx))} `;
      const s = plain(surdFormula(roots.scale, roots.disc, ctx));
      return [f("e", sup(`(${c}${c ? "+ " : ""}${s})${v}`)), f("e", sup(`(${c}${c ? MINUS + " " : MINUS}${s})${v}`))];
    }
    case "repeated": {
      const e = expOf(roots.root, t0, ctx);
      return [one(e), e.length ? f(v, e) : f(v)];
    }
    case "complex": {
      const e = expOf(roots.alpha, t0, ctx);
      const arg = argumentOf(roots, t0, ctx);
      return [f(e, "cos(", arg, ")"), f(e, "sin(", arg, ")")];
    }
  }
}

function homogeneousForm(sol: SolutionFormula, letters: SeriesLetters, t0: Q, ctx: NotationContext): Formula {
  const C = (i: number) => f(letters.C, sol.order === 1 ? "" : sub(String(i)));
  const basis = basisFormulas(sol, t0, ctx);
  const roots = sol.roots;
  const v = anchoredVariable(t0, ctx);
  if (roots.kind === "repeated") {
    const e = expOf(roots.root, t0, ctx);
    return e.length ? f("(", C(1), " + ", C(2), v, ")", e) : f(C(1), " + ", C(2), v);
  }
  if (roots.kind === "complex") {
    const e = expOf(roots.alpha, t0, ctx);
    const arg = argumentOf(roots, t0, ctx);
    const inner = f(C(1), " cos(", arg, ") + ", C(2), " sin(", arg, ")");
    return e.length ? f(e, "(", inner, ")") : inner;
  }
  return join(basis.map((b, i) => f(C(i + 1), plain(b) === "1" ? "" : b)), " + ");
}

/** The exact signs of the roots' real parts (an irrational pair decided from center ± scale √disc exactly). */
function realPartSigns(roots: SolutionFormula["roots"]): number[] {
  switch (roots.kind) {
    case "single": return [sign(roots.root)];
    case "distinct": return [sign(roots.r1), sign(roots.r2)];
    case "repeated": return [sign(roots.root)];
    case "complex": return [sign(roots.alpha)];
    case "distinctIrrational": {
      // center ± s √disc with s > 0: the larger root is positive iff center > 0 or center^2 < s^2 disc.
      const c = roots.center;
      const w2 = mul(mul(roots.scale, roots.scale), roots.disc);
      const c2 = mul(c, c);
      const larger = sign(c) >= 0 ? 1 : cmp(c2, w2) < 0 ? 1 : cmp(c2, w2) === 0 ? 0 : -1;
      const smaller = sign(c) <= 0 ? -1 : cmp(c2, w2) > 0 ? 1 : cmp(c2, w2) === 0 ? 0 : -1;
      return [larger, smaller];
    }
  }
}

type Behavior = "decay" | "grow" | "oscillate" | "linear" | "constant";
function behaviorOf(sol: SolutionFormula): Behavior {
  const maxSign = Math.max(...realPartSigns(sol.roots));
  if (maxSign < 0) return "decay";
  if (maxSign > 0) return "grow";
  if (sol.roots.kind === "complex") return "oscillate";
  if (sol.roots.kind === "repeated") return "linear";
  return "constant";
}
function behaviorLine(L: LabelTable, sol: SolutionFormula, uh: Formula): Formula {
  switch (behaviorOf(sol)) {
    case "decay": return fillFormula(L.series.behaviorDecay, { uh });
    case "grow": return fillFormula(L.series.behaviorGrow, { uh });
    case "oscillate": return fillFormula(L.series.behaviorOscillate, { uh, period: decimal((2 * Math.PI) / surdValue((sol.roots as Extract<SolutionFormula["roots"], { kind: "complex" }>).beta)) });
    case "linear": return fillFormula(L.series.behaviorLinear, { uh });
    case "constant": return fillFormula(L.series.behaviorConstant, { uh });
  }
}

const DAMPING_KEY = { undamped: "dampingUndamped", underdamped: "dampingUnder", critical: "dampingCritical", overdamped: "dampingOver" } as const;

function trialFormula(pair: { alpha: Q; beta: Q; degree: number }, s: number, A: string, B: string, ctx: NotationContext): { trial: Formula; unknowns: Formula; count: number } {
  const polyOf = (letter: string) => {
    if (pair.degree === 0) return { body: f(letter), names: [f(letter)] };
    const terms: Formula[] = [];
    const names: Formula[] = [];
    for (let k = 0; k <= pair.degree; k++) {
      terms.push(f(letter, sub(String(k)), power(f("t"), k)));
      names.push(f(letter, sub(String(k))));
    }
    return { body: f("(", join(terms, " + "), ")"), names };
  };
  const tPower = power(f("t"), s);
  const e = expOf(pair.alpha, ZERO, ctx);
  if (isZero(pair.beta)) {
    const a = polyOf(A);
    return { trial: f(tPower, e, a.body), unknowns: join(a.names, ", "), count: a.names.length };
  }
  const a = polyOf(A);
  const b = polyOf(B);
  const arg = f(tMultiple(pair.beta, ctx));
  const inner = f(a.body, " cos(", arg, ") + ", b.body, " sin(", arg, ")");
  const needsParens = tPower.length > 0 || e.length > 0;
  return { trial: f(tPower, e, needsParens ? f("(", inner, ")") : inner), unknowns: join([...a.names, ...b.names], ", "), count: a.names.length + b.names.length };
}

/** The real form of one right-hand side pair, e.g. "cos(t)", "3e^(2t)", "t²". */
function forcingPairFormula(pair: ReturnType<typeof realPairs>[number], ctx: NotationContext): Formula {
  return quasiFormula(pairToQuasi(pair), ctx);
}
function pairToQuasi(pair: ReturnType<typeof realPairs>[number]): QuasiPoly {
  // Rebuild the two conjugate terms (or the single real one) of a real pair.
  if (isZero(pair.beta)) return new Map([["r", { lambda: { re: pair.alpha, im: pair.beta }, coef: { re: pair.cos, im: [] } }]]);
  const half = q(1, 2);
  const re = pair.cos.map((c) => mul(c, half));
  const im = pair.sin.map((c) => neg(mul(c, half)));
  return new Map([
    ["p", { lambda: { re: pair.alpha, im: pair.beta }, coef: { re, im } }],
    ["m", { lambda: { re: pair.alpha, im: neg(pair.beta) }, coef: { re, im: im.map(neg) } }],
  ]);
}
/** Digits of a constant that is not exact. */
const CONSTANT_DIGITS = 6;
/** Decimal-coefficient combination (constants that are not exact); a magnitude that rounds to 1 prints no coefficient. */
function decimalSum(terms: readonly { v: number; body: Formula }[]): Formula {
  const kept = terms.filter((t) => t.v !== 0);
  if (kept.length === 0) return f("0");
  return joinSigned(kept.map((t) => {
    // A rounded constant keeps its zeros (−1.00000·10⁷ for −9999999.4): it must never read as exact.
    const magnitude = roundedNumber(Math.abs(t.v), CONSTANT_DIGITS);
    const unit = Math.abs(t.v) === 1 && t.body.length > 0;
    return f(t.v < 0 ? MINUS : "", unit ? "" : magnitude, !unit && t.body.length ? " " : "", t.body);
  }));
}

/** The constant-coefficient derivation u = u_h + u_p. */
/** The digits of an approximation (≈ …) printed next to an exact root: at least 4, more while two rates would read alike. */
function approxDigits(sol: SolutionFormula): number {
  return distinctDigits(printedRates(sol), 4);
}

/** Every exponent and frequency a formula prints with tMultiple: the roots' and the right-hand side's. */
function printedRates(sol: SolutionFormula): Q[] {
  const out: Q[] = [];
  const r = sol.roots;
  if (r.kind === "single" || r.kind === "repeated") out.push(r.root);
  if (r.kind === "distinct") out.push(r.r1, r.r2);
  if (r.kind === "distinctIrrational") {
    // The irrational pair prints as decimals too (center ± scale√disc): r1 = −1.0000001 must not read −1.
    const w = toNumber(r.scale) * Math.sqrt(toNumber(r.disc));
    for (const v of [toNumber(r.center) + w, toNumber(r.center) - w, w]) {
      const approx = fromNumber(v);
      if (approx) out.push(approx);
    }
  }
  if (r.kind === "complex") {
    out.push(r.alpha);
    if ("exact" in r.beta) out.push(r.beta.exact);
    else {
      // A surd prints its rounded decimal: compare that decimal with the other rates.
      const approx = fromNumber(surdValue(r.beta));
      if (approx) out.push(approx);
    }
  }
  for (const part of sol.parts) out.push(part.lambda.re, part.lambda.im);
  // The equation's own coefficients too: a root must not print like a coefficient it differs from
  // (r² + 1.0000000001 = 0 has r = ±1.00000000005i, never "±1.0000000001i").
  out.push(...sol.P);
  return out.filter((v) => !isZero(v));
}

export function formulaDerivation(L: LabelTable, input: FormulaDerivationInput): Derivation {
  const ctx = newContext();
  const { equation, formula: sol, letters, t0 } = input;
  // Rounded exponents keep enough digits to stay apart (cos(1.00000001t) next to cos(t)).
  const digits = distinctDigits(printedRates(sol));
  if (digits > ROUNDED_DIGITS) ctx.digits = digits;
  const names = unknownNames(equation.mode);
  const u = names.u;
  const uh = f(u, sub("h"));
  const up = f(u, sub("p"));
  const splitName = qpIsZero(equation.G) ? f(u, " = ", uh) : f(u, " = ", uh, " + ", up);
  const steps: DerivationStep[] = [];
  steps.push({
    title: L.series.stepEquation,
    lines: [
      fillFormula(L.series.linearForm, { equation: equationFormula(equation, ctx) }),
      ...cancelledLines(L, equation, ctx),
    ],
  });
  steps.push({
    title: L.series.stepSplitF,
    lines: [qpIsZero(equation.G) ? fillFormula(L.series.homogeneousOnly, { u, uh }) : fillFormula(L.series.splitIntro, { uh, up, u, homogeneous: equationFormula(equation, ctx, "zero") })],
  });
  // characteristic equation
  const r = letters.r;
  const chiLines: Formula[] = [fillFormula(L.series.characteristic, { u, trial: f("e", sup(`${r}t`)), chi: poly(sol.characteristic, f(r), ctx, "desc") })];
  if (sol.discriminant) {
    const [c0, b, a] = sol.P;
    const paren = (x: Q) => (sign(x) < 0 || !x.d.toString().match(/^1$/) ? f("(", num(x, ctx), ")") : num(x, ctx));
    const four = cmp(a, ONE) === 0 ? f("4·", paren(c0)) : f("4·", paren(a), "·", paren(c0));
    chiLines.push(fillFormula(L.series.discriminant, { expr: f(paren(b), sup("2"), ` ${MINUS} `, four), value: num(sol.discriminant, ctx) }));
  }
  chiLines.push(rootsLine(L, sol, letters, ctx));
  steps.push({ title: L.series.stepCharacteristic, lines: chiLines });
  // homogeneous solution, written in t − t0 when the initial values are given at t0 != 0
  const constantNames = sol.order === 1 ? f(letters.C) : f(letters.C, sub("1"), ", ", letters.C, sub("2"));
  const homLines: Formula[] = [
    fillFormula(sol.order === 1 ? L.series.homogeneous1 : L.series.homogeneous, { uh, form: homogeneousForm(sol, letters, t0, ctx), constants: constantNames }),
  ];
  homLines.push(behaviorLine(L, sol, uh));
  if (sol.damping && equation.mode === "second") homLines.push(f(L.series[DAMPING_KEY[sol.damping]]));
  steps.push({ title: L.series.stepHomogeneous, lines: homLines });
  // particular solution: one trial per right-hand side term, each with its own unknowns
  if (!qpIsZero(equation.G)) {
    const partLines: Formula[] = [];
    const pairs = realPairs(equation.G);
    const several = pairs.length > 1;
    pairs.forEach((pair, index) => {
      const part = sol.parts.find((p) => cmp(p.lambda.re, pair.alpha) === 0 && cmp(p.lambda.im, pair.beta) === 0);
      const s = part?.multiplicity ?? 0;
      const degree = Math.max(pdeg(pair.cos), pdeg(pair.sin), 0);
      const A = trialLetter(letters.trialPool, 2 * index);
      const B = trialLetter(letters.trialPool, 2 * index + 1);
      const name = several ? f(u, sub(`p${index + 1}`)) : up;
      const { trial, unknowns, count } = trialFormula({ alpha: pair.alpha, beta: pair.beta, degree }, s, A, B, ctx);
      const unknownsLine = fillFormula(count === 1 ? L.series.trialCoefficient : L.series.trialCoefficients, { names: unknowns });
      partLines.push(fillFormula(L.series.particularTry, { term: forcingPairFormula(pair, ctx), trial: f(name, " = ", trial), unknowns: unknownsLine }));
      if (s > 0) {
        const betaPart = cmp(pair.beta, ONE) === 0 ? "" : num(pair.beta, ctx);
        const mu = isZero(pair.beta) ? num(pair.alpha, ctx) : isZero(pair.alpha) ? f("±", betaPart, "i") : f(num(pair.alpha, ctx), " ± ", betaPart, "i");
        partLines.push(fillFormula(L.series.resonance, { mu, multiplicity: s === 1 ? L.series.multiplicity1 : L.series.multiplicity2, factor: power(f("t"), s) }));
      }
    });
    if (several) partLines.push(fillFormula(L.series.superposition, { up, sum: join(pairs.map((_, i) => f(u, sub(`p${i + 1}`))), " + ") }));
    partLines.push(fillFormula(L.series.particularFound, { up, value: quasiFormula(sol.particular, ctx) }));
    steps.push({ title: L.series.stepParticular, lines: partLines });
  }
  // constants and the solution
  if (input.initial && input.constants) {
    const C = (i: number) => f(letters.C, sol.order === 1 ? "" : sub(String(i)));
    const conditions = conditionsFormula(equation.mode, t0, input.initial, ctx);
    const exact = input.constants.exact;
    const values = exact
      ? join(exact.map((v, i) => f(C(i + 1), " = ", num(v, ctx))), ", ")
      : join(input.constants.values.map((v, i) => f(C(i + 1), " ≈ ", roundedNumber(v, CONSTANT_DIGITS))), ", ");
    steps.push({ title: L.series.stepConstants, lines: [fillFormula(exact ? L.series.constants : L.series.constantsApprox, { conditions, values })] });
    const basis = basisFormulas(sol, t0, ctx);
    let homogeneous: Formula;
    if (sol.roots.kind === "complex" && expOf(sol.roots.alpha, t0, ctx).length) {
      const e = expOf(sol.roots.alpha, t0, ctx);
      const arg = argumentOf(sol.roots, t0, ctx);
      const inner = exact
        ? signedSum([{ c: exact[0], body: f("cos(", arg, ")") }, { c: exact[1], body: f("sin(", arg, ")") }], ctx)
        : decimalSum([{ v: input.constants.values[0], body: f("cos(", arg, ")") }, { v: input.constants.values[1], body: f("sin(", arg, ")") }]);
      homogeneous = plain(inner) === "0" ? f("0") : f(e, "(", inner, ")");
    } else {
      homogeneous = exact
        ? signedSum(basis.map((b, i) => ({ c: exact[i], body: plain(b) === "1" ? [] : b })), ctx)
        : decimalSum(basis.map((b, i) => ({ v: input.constants!.values[i], body: plain(b) === "1" ? [] : b })));
    }
    const total = qpIsZero(equation.G) ? homogeneous : plain(homogeneous) === "0" ? quasiFormula(sol.particular, ctx) : joinSigned([homogeneous, quasiFormula(sol.particular, ctx)]);
    const solutionLines: Formula[] = [f(u, "(t) = ", total)];
    // "Steady state" only when u_h dies out AND u_p does not (every forcing exponent has real part 0:
    // constants, polynomials, undamped oscillations); u_p e^(-5t) dies out faster than u_h, and then
    // u ≈ u_p would be false.
    if (!qpIsZero(equation.G) && behaviorOf(sol) === "decay" && sol.parts.every((p) => isZero(p.lambda.re))) {
      solutionLines.push(fillFormula(L.series.steadyState, { uh, u, up }));
    }
    const check = input.check;
    if (check) {
      // A homogeneous equation has no u_p to substitute: its check speaks of the basis terms.
      const homogeneous = qpIsZero(equation.G);
      if (!check.residualExact) solutionLines.push(fillFormula(L.series.checkResidualFailed, { up }));
      else if (check.cancellation) {
        solutionLines.push(fillFormula(homogeneous ? L.series.checkUnresolvableHomogeneous : L.series.checkUnresolvable, { up, ratio: decimal(check.cancellation, 2) }));
      } else if (check.numeric) {
        const range = rangeFormula(check.numeric.covered);
        const key = check.numeric.ok ? (homogeneous ? "checkOkHomogeneous" : "checkOk") : homogeneous ? "checkFailedHomogeneous" : "checkFailed";
        solutionLines.push(fillFormula(L.series[key], { up, deviation: decimal(check.numeric.deviation, 2), range }));
      } else solutionLines.push(fillFormula(homogeneous ? L.series.checkExactOnlyHomogeneous : L.series.checkExactOnly, { up }));
    }
    steps.push({ title: L.series.stepSolution, lines: solutionLines });
  }
  const notes: Formula[] = [];
  notes.push(...approximationNotes(L, equation));
  if (ctx.rounded) notes.push((ctx.digits ?? ROUNDED_DIGITS) > ROUNDED_DIGITS ? fillFormula(L.series.roundedNoteDistinct, { digits: ctx.digits ?? ROUNDED_DIGITS }) : f(L.series.roundedNote));
  return { title: fillFormula(L.series.formulaTitle, { split: splitName }), steps, notes };
}

/** A derivation as plain Unicode text (tool summaries): the title, then each step with its lines. */
export function derivationText(d: Derivation): string {
  const lines: string[] = [plain(d.title)];
  d.steps.forEach((step, i) => {
    lines.push(`${i + 1}. ${step.title}`);
    for (const line of step.lines) lines.push(`   ${plain(line)}`);
  });
  for (const note of d.notes) lines.push(plain(note));
  return lines.join("\n");
}
