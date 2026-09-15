/**
 * Second-order equations x'' = F(t, x, x') (or a full equation such as x'' + 0.5*x' + x = 0) reduced
 * to the planar system x' = y, y' = F(t, x, y) AT THE STRING LEVEL, so the reduced system can be
 * shown to the student, put into a Scene, and recompiled by any client exactly like a planar system.
 *
 * Notation (the professor's, round P): t is the INDEPENDENT variable, the unknown is x(t), its
 * derivatives are written x' and x'' (straight apostrophes; the unicode primes ′ ″, curly
 * apostrophes ’ ‘ (what iOS and Word type), backticks, ´ and a double quote are accepted and
 * normalized first, spaces between two primes too). The textbook alias v = x' is accepted on input
 * (a bare symbol v means x'); every display uses x'. The symbol y has NO meaning in this mode: the
 * student's problem has no y, so y (and y', y'') is refused with a sentence saying exactly that,
 * never with a generic unknown-symbol message. Internally the derivatives become the placeholder
 * symbols xd and xdd, which the parser accepts ONLY here, and the reduced system is the kernel's
 * planar (x, y) system, where y stands for x'; that y is an implementation detail and never
 * reaches a student: the reduction shown to students (`reduced`) writes it as v.
 *
 * Reduction: with E(x, x', x'', t) = lhs - rhs the equation is E = 0. E must be affine in x'':
 * E = a(x, x', t) * x'' + E0(x, x', t), so x'' = -E0 / a. Affinity is checked numerically (the
 * second difference E2 - 2 E1 + E0 in x'' must vanish relative to the magnitudes measured) at the
 * SAMPLE SET: nine generic points of [-1.7, 2.3]^2 plus, when the caller passes its viewing box,
 * the 13 irrational-fraction points of that box, each at the 5 probe times of
 * lib/core/time-dependence (so a coefficient that depends on t is seen to vary, and one that
 * vanishes at some sampled time, t*x'', is refused). The coefficient a must not vanish at any
 * sample. F is then built from the mathjs AST of E: the coefficient a is extracted symbolically
 * (E is affine, so a is the formal derivative of E in x'': sums, differences, products with a
 * factor free of x'', divisions by something free of x'', and piecewise branches), E0 is E with
 * x'' -> 0, and x' -> y throughout. Only when the coefficient cannot be extracted (x'' inside a
 * function or a power that still turned out affine) is the numerically constant coefficient used
 * as a literal, or the quotient form -E0 / (E1 - E0) kept. Every candidate string is cross-checked
 * against -E0/a at the whole sample set and re-validated through the ordinary "xy" whitelist.
 *
 * Simplification is deliberately conservative (mathjs simplifyCore): 0 +, 1 *, -(-a), parentheses.
 * No factor cancellation (x'/x' stays y/y, so a point where the equation is undefined stays
 * undefined in the reduced system) and no constant folding (-9.81/0.1 stays as written). The
 * DISPLAY string (`reduced.g`) prints numeric literals with at most 12 significant digits; the
 * COMPILED string (`spec.g`) keeps full precision. The two coincide unless a literal came from the
 * numerical fallback.
 *
 * Limitation (recorded): every check is numerical at the sample set. A term that is only active
 * away from every sample point (a piecewise x''^2 branch outside the box) cannot be detected.
 */
import type { MathNode } from "mathjs";
import { compileNode, compileScalar, mathjs, normalizeOperators, ParseError, type ParseErrorCode, parseValidated } from "./parse";
import { boxSamplePoints, PROBE_TIMES } from "./time-dependence";
import type { Box, SystemSpec, Vec2 } from "./types";

/** Placeholder symbols for x' and x''; accepted by the parser only through this module. */
export const XD = "xd";
export const XDD = "xdd";
/** The name the reduction SHOWN to students gives x' ("let v = x'"); the kernel's system keeps y. */
export const V = "v";

/** A bare symbol v (not part of a longer name): the textbook alias of x' on input. */
const V_SYMBOL = /(?<![A-Za-z0-9_])v(?![A-Za-z0-9_])/g;
/** A bare symbol y (also the y of y' and y''): meaningless in a second-order equation. */
const Y_SYMBOL = /(?<![A-Za-z0-9_])y(?![A-Za-z0-9_])/;

export const NOT_LINEAR_IN_XDD_MESSAGE =
  "x'' must appear linearly, e.g. x'' + 0.5*x' + x = 0 or x'' = -sin(x); x''^2, sin(x'') and the like cannot be reduced.";
export const XDD_COEFFICIENT_VANISHES_MESSAGE =
  "The coefficient of x'' vanishes (at least at some of the sample points and times), so the equation cannot be solved for x''. Check that x'' really appears and that its coefficient is never zero.";
export const XDD_WITHOUT_EQUALS_MESSAGE =
  "Write an equation with = (x'' + x = 0) or just the right-hand side F of x'' = F.";
export const DOUBLE_EQUALS_MESSAGE = 'Use a single "=" between the two sides of the equation (== is a comparison).';
export const TOO_MANY_EQUALS_MESSAGE = 'The equation must contain exactly one "=".';
export const OTHER_PRIME_MESSAGE =
  "Only the unknown x may carry primes: write x' for dx/dt and x'' for the second derivative. The unknown function is x and t is the independent variable.";
/** The professor's case (round P): the second variable of the phase plane is x', not a y of its own. */
export const Y_IN_SECOND_ORDER_MESSAGE =
  "In a second-order equation the variables are t (the independent variable), x and x' (dx/dt, also written v); y has no meaning here. Write x' for the derivative of x.";
export const V_PARAMETER_MESSAGE = 'Parameter name "v" is reserved in a second-order equation: v stands for x\'.';
/** The reduction's own cross-check failed: said without the reduction's private names (E0, a), round P2.6. */
export const INTERNAL_CHECK_MESSAGE =
  "The tool could not reduce this equation reliably (its own check of the reduction failed). Try writing it as x'' = F with F on the right-hand side, or report the equation.";
export const HIGHER_DERIVATIVE_MESSAGE =
  "Only the first and second derivatives x' and x'' are supported; x''' and higher cannot be reduced to a planar system.";
export const PLACEHOLDER_TYPED_MESSAGE =
  "\"xd\" / \"xdd\" is not a symbol of this problem: write x' for the derivative of x and x'' for the second derivative (a constant needs another name).";
export const UNDEFINED_AT_SAMPLES_MESSAGE =
  "The equation is undefined (not a finite number) at most of the sample points used to check it, so it cannot be reduced safely.";

/**
 * A name in which a placeholder is glued to other letters (xx'', tx'', x''x, kx'): the student left
 * the multiplication sign out. `name` and the hint are in the student's notation.
 */
export function implicitProductMessage(name: string): string {
  return `"${name}" is missing a multiplication sign; write the multiplication explicitly, e.g. ${implicitProductHint(name)}.`;
}

/** "xxdd" -> "x*x''", "txdd" -> "t*x''", "xddx" -> "x''*x", "kxd" -> "k*x'": the factors joined by *. */
export function implicitProductHint(name: string): string {
  const shown = studentNotation(name);
  const parts = shown.match(/x''|x'|[^x']+|x/g) ?? [shown];
  return parts.join("*");
}

/** The placeholders mapped back to the student's notation (xdd -> x'', xd -> x'), in any text. */
export function studentNotation(text: string): string {
  return text.replace(/xdd/g, "x''").replace(/xd/g, "x'");
}

export function unknownSymbolInSecondOrder(name: string): string {
  return (
    `Unknown symbol "${name}". The unknown function is x, its derivative is x' (dx/dt), which may also be written v, and its second derivative is x''; ` +
    "t is the independent variable. Allowed symbols: t, x, x', x'', pi, e, and the names in params."
  );
}

export type ReducedSecondOrder = {
  /** The reduced planar system x' = y, y' = F(t, x, y) (variables "xy": no `variables` field); `g` keeps full precision. The y here is the kernel's name for x' and is never shown. */
  spec: SystemSpec;
  /** What the student typed, with primes normalized to straight apostrophes and a v written as x' ("x'' = F" for a bare F). */
  equation: string;
  /**
   * The reduction shown to students, "let v = x': x' = v, v' = g": f is "v" and g is F with x'
   * written v (the kernel's y never appears); numeric literals in g have at most DISPLAY_DIGITS
   * significant digits.
   */
  reduced: { f: string; g: string };
};

export type ReduceOptions = {
  /** The viewing box: its 13 sample points join the nine generic ones in every numerical check. */
  box?: Box;
};

/** Relative tolerance of the affinity check, against the largest |E| measured at the sample. */
export const AFFINITY_REL_TOL = 1e-9;
/**
 * Values substituted for x'' at every sample point: both signs, non-integers and a large one, so
 * a function of x'' that is affine on one side only (abs, max, sign, round, a branch condition)
 * is caught. E must be affine across ALL of them: E(v) = E(0) + (E(1) - E(0)) v.
 */
export const XDD_PROBES: readonly number[] = [-3.7, -1, 0, 0.5, 1, 2, 3.7, 10];
/** Relative tolerance for "a is the same constant at every sample" (numerical fallback only). */
export const CONSTANT_REL_TOL = 1e-12;
/** Relative tolerance of the cross-check F == -E0/a. */
export const CROSS_CHECK_REL_TOL = 1e-12;
/** Significant digits of a numeric literal in the display string. */
export const DISPLAY_DIGITS = 12;
/** The affinity check needs at least this many samples where E is finite. */
const MIN_FINITE_POINTS = 3;

/**
 * Nine generic sample points in [-1.7, 2.3]^2: fractional parts of multiples of the golden ratio
 * and of sqrt(2) (never an integer, never 0, never symmetric), so a polynomial identity that holds
 * at all of them does not hold by accident of the sampling.
 */
export const SAMPLE_POINTS: readonly Vec2[] = (() => {
  const phi = (Math.sqrt(5) - 1) / 2;
  const s2 = Math.SQRT2;
  const frac = (v: number) => v - Math.floor(v);
  const pts: Vec2[] = [];
  for (let i = 1; i <= 9; i++) pts.push({ x: -1.7 + 4 * frac(i * phi), y: -1.7 + 4 * frac(i * s2) });
  return pts;
})();

/** Apostrophe-like characters that mean one prime, and quote-like characters that mean two. */
const SINGLE_PRIME_LIKE = /[’‘′`´]/g;
const DOUBLE_PRIME_LIKE = /[″“”]/g;

/** Every prime-like character turned into straight apostrophes (″ and curly double quotes into two). */
export function straightenPrimes(input: string): string {
  return input.replace(DOUBLE_PRIME_LIKE, "''").replace(SINGLE_PRIME_LIKE, "'");
}

/**
 * The function-of-t notation x(t), x'(t), x''(t) (straightened primes): the argument list is
 * dropped, since the unknown is always a function of t. The lookbehind keeps max(t) and exp(t).
 */
const FUNCTION_OF_T = /(?<![A-Za-z0-9_])(x\s*(?:'\s*'|"|')?)\s*\(\s*t\s*\)/g;

/** Primes straightened, operator look-alikes (−, ×, ·, ÷) normalized, (t) arguments dropped. */
function preprocess(input: string): string {
  return normalizeOperators(straightenPrimes(input.trim())).replace(FUNCTION_OF_T, "$1");
}

/**
 * Normalizes the prime notation: x'' / x″ / x’’ / x ' ' / x" -> xdd, then x' / x′ / x’ -> xd, then
 * the alias v -> xd. Trims whitespace. Double primes go first so the two apostrophes of x'' are
 * never read as x' followed by a stray quote; only an x DIRECTLY followed by a prime is touched, so
 * exp(x), max(x, 1) or x^2 are left alone. A v followed by a prime (v') becomes xd' and is refused
 * by the caller's prime check.
 */
export function normalizePrimes(input: string): string {
  return preprocess(input)
    .replace(/x\s*(?:'\s*'|")/g, XDD)
    .replace(/x\s*'/g, XD)
    .replace(V_SYMBOL, XD);
}

/** The student's text with every prime notation turned into straight, unspaced apostrophes and v written as x', for display. */
function displayForm(input: string): string {
  return preprocess(input)
    .replace(/x\s*"/g, "x''")
    .replace(/x\s*'\s*'/g, "x''")
    .replace(/x\s*'(?!')/g, "x'")
    .replace(V_SYMBOL, "x'");
}

function substitute(node: MathNode, xddValue: number): MathNode {
  return node.transform((n: MathNode) => {
    if (mathjs.isSymbolNode(n)) {
      if (n.name === XDD) return new mathjs.ConstantNode(xddValue);
      if (n.name === XD) return new mathjs.SymbolNode("y");
    }
    return n;
  });
}

function containsSymbol(node: MathNode, name: string): boolean {
  let found = false;
  node.traverse((n: MathNode) => {
    if (mathjs.isSymbolNode(n) && n.name === name) found = true;
  });
  return found;
}

/**
 * The coefficient of xdd in an expression that is affine in xdd (its formal derivative), built
 * structurally without any algebraic rewriting: null when xdd sits somewhere the structure does
 * not expose linearly (inside a function, a power, a denominator or a condition).
 */
function coefficientOf(node: MathNode): MathNode | null {
  if (!containsSymbol(node, XDD)) return new mathjs.ConstantNode(0);
  if (mathjs.isSymbolNode(node)) return new mathjs.ConstantNode(1);
  if (mathjs.isParenthesisNode(node)) return coefficientOf(node.content);
  if (mathjs.isOperatorNode(node)) {
    const args = node.args;
    if (node.fn === "unaryPlus") return coefficientOf(args[0]);
    if (node.fn === "unaryMinus") {
      const c = coefficientOf(args[0]);
      return c && new mathjs.OperatorNode("-", "unaryMinus", [c]);
    }
    if (node.fn === "add" || node.fn === "subtract") {
      const a = coefficientOf(args[0]);
      const b = coefficientOf(args[1]);
      return a && b && new mathjs.OperatorNode(node.op as "+" | "-", node.fn, [a, b]);
    }
    if (node.fn === "multiply") {
      const inA = containsSymbol(args[0], XDD);
      const inB = containsSymbol(args[1], XDD);
      if (inA && inB) return null;
      const c = coefficientOf(inA ? args[0] : args[1]);
      return c && new mathjs.OperatorNode("*", "multiply", inA ? [c, args[1]] : [args[0], c]);
    }
    if (node.fn === "divide") {
      if (containsSymbol(args[1], XDD)) return null;
      const c = coefficientOf(args[0]);
      return c && new mathjs.OperatorNode("/", "divide", [c, args[1]]);
    }
    return null;
  }
  if (mathjs.isConditionalNode(node)) {
    if (containsSymbol(node.condition, XDD)) return null;
    const a = coefficientOf(node.trueExpr);
    const b = coefficientOf(node.falseExpr);
    return a && b && new mathjs.ConditionalNode(node.condition, a, b);
  }
  return null;
}

/**
 * Two exact rewrites simplifyCore lacks: -0 -> 0 (a negated x'' leaves -0 behind), and a leading
 * minus over a sum whose first term is itself negated, -(-u + v) -> u - v and -(-u - v) -> u + v
 * (identities for every finite value; NaN stays NaN), so x'' - (1 - x^2)*x' + x = 0 reads
 * (1 - x^2)*y - x instead of -(-((1 - x^2)*y) + x).
 */
function liftLeadingMinus(node: MathNode): MathNode {
  return node.transform((n: MathNode) => {
    if (!mathjs.isOperatorNode(n) || n.fn !== "unaryMinus") return n;
    const inner = n.args[0];
    if (mathjs.isConstantNode(inner) && inner.value === 0) return new mathjs.ConstantNode(0);
    if (!mathjs.isOperatorNode(inner) || (inner.fn !== "add" && inner.fn !== "subtract")) return n;
    const [first, second] = inner.args;
    if (!mathjs.isOperatorNode(first) || first.fn !== "unaryMinus") return n;
    return inner.fn === "add"
      ? new mathjs.OperatorNode("-", "subtract", [first.args[0], second])
      : new mathjs.OperatorNode("+", "add", [first.args[0], second]);
  });
}

/** The conservative simplification (see the header), as a string. */
function simplifyConservative(node: MathNode): string {
  return mathjs.simplifyCore(liftLeadingMinus(mathjs.simplifyCore(node))).toString();
}

/** The value of a literal constant node, also of a negated one (-1 parses as unaryMinus(1)); undefined otherwise. */
function constantValue(node: MathNode): number | undefined {
  if (mathjs.isConstantNode(node)) return typeof node.value === "number" ? node.value : undefined;
  if (mathjs.isOperatorNode(node) && node.fn === "unaryMinus" && mathjs.isConstantNode(node.args[0]) && typeof node.args[0].value === "number") {
    return -node.args[0].value;
  }
  return undefined;
}

/** -E0 / a as a string for a coefficient known as a literal (a negative literal moves the sign). */
function quotientByConstant(E0: string, a: number): string {
  if (a === 1) return `-(${E0})`;
  if (a === -1) return `(${E0})`;
  return a < 0 ? `(${E0})/(${String(-a)})` : `-(${E0})/(${String(a)})`;
}

/**
 * The display form of the compiled g: the kernel's y (the placeholder for x') written as v, and
 * numeric literals rounded to DISPLAY_DIGITS significant digits; the same string when neither
 * applied. The symbol is renamed on the AST (never by text replacement), so nothing but the
 * variable y itself is touched.
 */
function displayString(g: string): string {
  let changed = 0;
  const node = mathjs.parse(g).transform((n: MathNode) => {
    if (mathjs.isSymbolNode(n) && n.name === "y") {
      changed++;
      return new mathjs.SymbolNode(V);
    }
    if (mathjs.isConstantNode(n) && typeof n.value === "number") {
      const short = Number(n.value.toPrecision(DISPLAY_DIGITS));
      if (short !== n.value) {
        changed++;
        return new mathjs.ConstantNode(short);
      }
    }
    return n;
  });
  return changed ? node.toString() : g;
}

type Sample = { p: Vec2; t: number };

/** Cross-check of a candidate F against the reference values at the samples (null = E undefined there). */
function matchesReference(F: (p: Vec2, t?: number) => number, samples: Sample[], reference: (number | null)[]): boolean {
  for (let i = 0; i < samples.length; i++) {
    const target = reference[i];
    if (target === null) continue;
    const value = F(samples[i].p, samples[i].t);
    if (!Number.isFinite(value)) return false;
    const scale = Math.max(Math.abs(value), Math.abs(target));
    if (Math.abs(value - target) > CROSS_CHECK_REL_TOL * scale) return false;
  }
  return true;
}

/** For E = (xdd) - (F) with F free of xdd: the node of F. Otherwise null. */
function directRightHandSide(node: MathNode): MathNode | null {
  if (!mathjs.isOperatorNode(node) || node.fn !== "subtract" || node.args.length !== 2) return null;
  const [lhs, rhs] = node.args;
  if (!mathjs.isParenthesisNode(lhs) || !mathjs.isSymbolNode(lhs.content) || lhs.content.name !== XDD) return null;
  if (!mathjs.isParenthesisNode(rhs) || containsSymbol(rhs.content, XDD)) return null;
  return rhs.content;
}

/**
 * Reduces a second-order equation in x(t) to the planar system x' = y, y' = F(x, y, t). Throws
 * ParseError with a code (see ParseErrorCode) and a readable English message when the text is not
 * an equation of this kind.
 */
export function reduceSecondOrder(input: string, params?: Record<string, number>, opts: ReduceOptions = {}): ReducedSecondOrder {
  if (typeof input !== "string" || input.trim() === "") throw new ParseError(input, "Expression is empty.");
  const raw = input.trim();
  const refuse = (message: string, code: ParseErrorCode): never => {
    throw new ParseError(raw, message, code);
  };
  if (/\bxdd?\b/.test(raw)) refuse(PLACEHOLDER_TYPED_MESSAGE, "second_order_placeholder_typed");
  if (params && Object.prototype.hasOwnProperty.call(params, V)) refuse(V_PARAMETER_MESSAGE, "second_order_v_parameter");
  if (/x\s*'\s*'\s*'/.test(straightenPrimes(raw))) refuse(HIGHER_DERIVATIVE_MESSAGE, "second_order_higher_derivative");
  const text = normalizePrimes(raw);
  // The professor's case: y (also y', y'') is not a variable of this problem. Checked before the
  // prime check so that y' gets this sentence and not the one about primes on other symbols.
  if (Y_SYMBOL.test(text)) refuse(Y_IN_SECOND_ORDER_MESSAGE, "second_order_y_symbol");
  if (/['"]/.test(text)) refuse(OTHER_PRIME_MESSAGE, "second_order_other_prime");
  if (/==/.test(text)) refuse(DOUBLE_EQUALS_MESSAGE, "second_order_double_equals");

  const hasXdd = new RegExp(`\\b${XDD}\\b`).test(text);
  // Split on the lone "=" only (== was rejected above; <=, >=, != belong to a piecewise F).
  const sides = text.split(/(?<![<>!])=/);
  let E: string;
  let equation: string;
  if (sides.length === 2) {
    E = `(${sides[0].trim()}) - (${sides[1].trim()})`;
    equation = displayForm(raw);
  } else if (sides.length > 2) {
    return refuse(TOO_MANY_EQUALS_MESSAGE, "second_order_too_many_equals");
  } else if (hasXdd) {
    return refuse(XDD_WITHOUT_EQUALS_MESSAGE, "second_order_no_equation");
  } else {
    E = `(${XDD}) - (${text})`;
    equation = `x'' = ${displayForm(raw)}`;
  }

  // Validation in the placeholder symbol set; errors carry the student's own text.
  let node: MathNode;
  try {
    node = parseValidated(E, params, {
      symbols: ["x", "t", XD, XDD],
      unknownSymbolMessage: unknownSymbolInSecondOrder,
      unknownSymbolCode: "second_order_unknown_symbol",
    });
  } catch (error) {
    if (!(error instanceof ParseError)) throw error;
    // A placeholder glued to other letters (xxdd, txdd, xddx) is a product missing its * sign.
    if (error.symbol !== undefined && /xd/.test(error.symbol)) {
      const shown = studentNotation(error.symbol);
      throw new ParseError(raw, implicitProductMessage(shown), "second_order_implicit_product", { symbol: shown });
    }
    throw new ParseError(raw, studentNotation(error.message), error.code, error.symbol === undefined ? undefined : { symbol: studentNotation(error.symbol) });
  }

  const node0 = substitute(node, 0);
  const node1 = substitute(node, 1);
  const probes = XDD_PROBES.map((v) => compileNode(E, substitute(node, v), params));
  const at0 = XDD_PROBES.indexOf(0);
  const at1 = XDD_PROBES.indexOf(1);

  // The sample set: generic points and the box's points, each at every probe time.
  const points = opts.box ? [...SAMPLE_POINTS, ...boxSamplePoints(opts.box)] : [...SAMPLE_POINTS];
  const samples: Sample[] = [];
  for (const t of PROBE_TIMES) for (const p of points) samples.push({ p, t });

  // Affinity in x'' and the coefficient a = E1 - E0 at every finite sample.
  const reference: (number | null)[] = [];
  const coefficients: number[] = [];
  for (const { p, t } of samples) {
    const values = probes.map((f) => f(p, t));
    const finite = values.filter((v) => Number.isFinite(v)).length;
    if (finite === 0) {
      reference.push(null);
      continue;
    }
    // An affine function that is finite at one value of x'' is finite at every value.
    if (finite < values.length) refuse(NOT_LINEAR_IN_XDD_MESSAGE, "second_order_not_affine");
    const v0 = values[at0];
    const a = values[at1] - v0;
    const scale = values.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    for (let k = 0; k < values.length; k++) {
      if (Math.abs(values[k] - (v0 + a * XDD_PROBES[k])) > AFFINITY_REL_TOL * scale) refuse(NOT_LINEAR_IN_XDD_MESSAGE, "second_order_not_affine");
    }
    if (a === 0) refuse(XDD_COEFFICIENT_VANISHES_MESSAGE, "second_order_zero_coefficient");
    coefficients.push(a);
    reference.push(-v0 / a);
  }
  if (coefficients.length < MIN_FINITE_POINTS) refuse(UNDEFINED_AT_SAMPLES_MESSAGE, "second_order_undefined_at_samples");

  // Build F. "x'' = F" with no x'' inside F: F itself, with x' -> y. Otherwise -E0 / a with the
  // coefficient extracted structurally; the numerical fallbacks only when that is impossible.
  let plain: string;
  const direct = directRightHandSide(node);
  if (direct) {
    plain = simplifyConservative(substitute(direct, 0));
  } else {
    const E0 = simplifyConservative(node0);
    const coefficient = coefficientOf(node);
    // The coefficient may contain x' (the placeholder xd): substitute maps it to y (no xdd is left in it).
    const coefficientNode = coefficient ? mathjs.simplifyCore(substitute(coefficient, 0)) : null;
    const literal = coefficientNode ? constantValue(coefficientNode) : undefined;
    if (literal !== undefined) {
      plain = quotientByConstant(E0, literal);
    } else if (coefficientNode) {
      plain = `-(${E0})/(${coefficientNode.toString()})`;
    } else {
      const aMax = coefficients.reduce((m, a) => Math.max(m, Math.abs(a)), 0);
      const constant = coefficients.every((a) => Math.abs(a - coefficients[0]) <= CONSTANT_REL_TOL * aMax);
      if (constant) {
        plain = quotientByConstant(E0, coefficients[0]);
      } else {
        plain = `-(${E0})/((${simplifyConservative(node1)}) - (${E0}))`;
      }
    }
  }

  // Simplify conservatively, but only keep the result when it still parses through the ordinary
  // whitelist and agrees with -E0/a at every sample.
  let g = plain;
  try {
    const simplified = simplifyConservative(mathjs.parse(plain));
    if (matchesReference(compileScalar(simplified, params), samples, reference)) g = simplified;
  } catch {
    // keep the un-simplified string
  }
  // The string a client recompiles must pass too. A failure here is internal: it carries the
  // student's own text, never the reduced string or a placeholder.
  let recompiled: (p: Vec2, t?: number) => number;
  try {
    recompiled = compileScalar(g, params);
  } catch (error) {
    const reason = error instanceof Error ? studentNotation(error.message) : String(error);
    throw new ParseError(raw, `${INTERNAL_CHECK_MESSAGE} (${reason})`, "second_order_internal");
  }
  if (!matchesReference(recompiled, samples, reference)) {
    throw new ParseError(raw, INTERNAL_CHECK_MESSAGE, "second_order_internal");
  }

  const spec: SystemSpec = params ? { f: "y", g, params } : { f: "y", g };
  return { spec, equation, reduced: { f: V, g: displayString(g) } };
}
