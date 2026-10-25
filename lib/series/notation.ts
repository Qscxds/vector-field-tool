/**
 * Mathematical notation for lib/series results (round 12): language-independent FORMULAS built from
 * a handful of runs (text, subscript, superscript, fraction, a sum sign with limits), rendered as
 * HTML by components/MathText and as Unicode text by `plain` (tool summaries). No words live here:
 * sentences come from lib/labels (the `series` section) and are filled with formulas by
 * `fillFormula`; this module only spells numbers, polynomials, sums and roots.
 *
 * Numbers: an exact rational prints as an integer or a fraction; one with more than
 * MAX_EXACT_DIGITS digits (numerator and denominator together) prints as a decimal with
 * ROUNDED_DIGITS significant digits, and the context records that something was rounded, so the
 * caller can say so in a note. A minus sign is the typographic minus (U+2212).
 */
import { pcoef, pdeg, pdivmod, type Poly } from "./poly";
import { realPairs, type QuasiPoly } from "./quasi";
import { bigLn, cmp, digitCount, div, isInteger, isZero, lnAbs, mul, neg, ONE, q, type Q, sign, toNumber } from "./rational";
import { rootsOf, type RootForm } from "./roots";

export type Run =
  | { readonly t: string }
  | { readonly sub: string }
  | { readonly sup: string }
  | { readonly frac: readonly [string, string] }
  | { readonly sum: readonly [string, string] };
export type Formula = readonly Run[];

export const MINUS = "−";
/** Numerator plus denominator digits beyond which a rational prints as a rounded decimal. */
export const MAX_EXACT_DIGITS = 16;
export const ROUNDED_DIGITS = 6;

/**
 * Collects what a rendering had to round (for the note under a derivation). `digits`: the significant
 * digits a rounded exponent or frequency gets (tMultiple; default ROUNDED_DIGITS), raised by a caller
 * so that different exponents never print alike (`distinctDigits`).
 */
export type NotationContext = { rounded: boolean; digits?: number; checkpoint?: () => void };
export function newContext(): NotationContext {
  return { rounded: false };
}

/** Concatenation; strings become text runs and adjacent text runs merge. */
export function f(...parts: readonly (Formula | string | null | undefined | false)[]): Formula {
  const out: Run[] = [];
  for (const part of parts) {
    if (part === null || part === undefined || part === false) continue;
    const runs: readonly Run[] = typeof part === "string" ? (part === "" ? [] : [{ t: part }]) : part;
    for (const r of runs) {
      const last = out[out.length - 1];
      if ("t" in r && last && "t" in last) out[out.length - 1] = { t: last.t + r.t };
      else out.push(r);
    }
  }
  return out;
}
export const sub = (s: string): Formula => [{ sub: s }];
export const sup = (s: string): Formula => [{ sup: s }];
export const frac = (num: string, den: string): Formula => [{ frac: [num, den] }];
export function isEmptyFormula(x: Formula): boolean {
  return x.length === 0;
}
/** Joins formulas with a separator. */
export function join(items: readonly Formula[], separator: string | Formula): Formula {
  const out: (Formula | string)[] = [];
  items.forEach((item, i) => {
    if (i > 0) out.push(separator);
    out.push(item);
  });
  return f(...out);
}

/** Fills `{name}` placeholders of a label template with formulas, strings or numbers. */
export function fillFormula(template: string, values: Readonly<Record<string, Formula | string | number>>): Formula {
  const parts: (Formula | string)[] = [];
  let last = 0;
  for (const m of template.matchAll(/\{(\w+)\}/g)) {
    parts.push(template.slice(last, m.index));
    const key = m[1];
    const value = values[key];
    parts.push(value === undefined ? m[0] : typeof value === "number" ? String(value) : value);
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(template.slice(last));
  return f(...parts);
}

const SUBSCRIPT: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", [MINUS]: "₋", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
  a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ", j: "ⱼ", k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", v: "ᵥ", x: "ₓ",
};
const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", [MINUS]: "⁻", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
  n: "ⁿ", i: "ⁱ", k: "ᵏ", m: "ᵐ", j: "ʲ", t: "ᵗ", r: "ʳ", s: "ˢ",
};
function mapScript(s: string, table: Record<string, string>): string | null {
  let out = "";
  for (const ch of s.replace(/ /g, "")) {
    const mapped = table[ch];
    if (mapped === undefined) return null;
    out += mapped;
  }
  return out;
}

/** Unicode text of a formula (tool summaries, PNG footers): scripts as Unicode where every character has one. */
export function plain(x: Formula): string {
  let out = "";
  x.forEach((r, i) => {
    if ("t" in r) out += r.t;
    else if ("sub" in r) out += mapScript(r.sub, SUBSCRIPT) ?? `_(${r.sub})`;
    else if ("sup" in r) {
      const mapped = mapScript(r.sup, SUPERSCRIPT);
      out += mapped ?? (r.sup.length === 1 ? `^${r.sup}` : `^(${r.sup})`);
    } else if ("frac" in r) {
      const next = x[i + 1];
      // A fraction followed by a factor ("(1/2)t", "(1/51) cos(7t)": signedSum puts a space before cos) is bracketed.
      const multiplies = next !== undefined && (!("t" in next) || /^ ?[A-Za-z(√α-ωΣ]/.test(next.t));
      const [a, b] = r.frac;
      // A single token over a single token reads a/b; anything bigger gets spaces around the
      // bar and parentheses where a sum or a product of groups would otherwise bind wrongly.
      const text = isToken(a) && isToken(b) ? `${a}/${b}` : `${hasTopLevelSum(a) ? `(${a})` : a} / ${isToken(b) || isOneGroup(b) ? b : `(${b})`}`;
      out += multiplies ? `(${text})` : text;
    } else {
      out += `Σ_{${r.sum[0]}}^{${r.sum[1]}} `;
    }
  });
  return out;
}

/** A token that needs no parentheses on either side of a fraction bar: "12", "√3", "aₙ", "n". */
function isToken(x: string): boolean {
  return !/[\s()+\u2212-]/.test(x);
}
/** One parenthesized group "( … )" from the first to the last character. */
function isOneGroup(x: string): boolean {
  if (!x.startsWith("(") || !x.endsWith(")")) return false;
  let depth = 0;
  for (let i = 0; i < x.length; i++) {
    if (x[i] === "(") depth++;
    else if (x[i] === ")") depth--;
    if (depth === 0 && i < x.length - 1) return false;
  }
  return true;
}
/** A + or − outside every parenthesis (after the first character): the text is a sum. */
function hasTopLevelSum(x: string): boolean {
  let depth = 0;
  for (let i = 0; i < x.length; i++) {
    const ch = x[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (depth === 0 && i > 0 && (ch === "+" || ch === "\u2212") && x[i - 1] === " ") return true;
  }
  return false;
}

// ---- numbers -------------------------------------------------------------------------------

/** A decimal with `digits` significant digits; scientific with a ·10ⁿ exponent outside [1e-3, 1e6). */
export function decimal(v: number, digits = 4): string {
  if (!Number.isFinite(v)) return String(v);
  if (v === 0) return "0";
  const a = Math.abs(v);
  let text: string;
  if (a < 1e-3 || a >= 1e6) {
    const [m, e] = v.toExponential(Math.max(0, digits - 1)).split("e");
    const mantissa = m.replace(/\.?0+$/, "");
    const exponent = String(Number(e));
    text = `${mantissa}·10${mapScript(exponent, SUPERSCRIPT) ?? `^${exponent}`}`;
  } else {
    text = String(Number(v.toPrecision(digits)));
  }
  return text.replace(/-/g, MINUS);
}

/**
 * A decimal rounded TOWARD a side, to `digits` significant digits: "down" never prints more than v, "up"
 * never less. A guaranteed lower bound prints rounded down (1.22065 for 1.2206555616, not 1.22066); the
 * ends of a range that was compared print rounded inward.
 */
export function decimalDirected(v: number, digits: number, toward: "up" | "down"): string {
  if (!Number.isFinite(v) || v === 0) return decimal(v, digits);
  const a = Math.abs(v);
  // The magnitude shrinks when rounding down a positive value or up a negative one.
  const shrink = (toward === "down") === v > 0;
  // The nearest `digits`-digit decimal m·10^(e - digits + 1), then at most two steps of one unit in
  // its last place toward the side asked for (exact BigInt digits: no floating loop near 10^308).
  const [mantissaText, exponentText] = a.toExponential(digits - 1).split("e");
  let m = BigInt(mantissaText.replace(".", ""));
  let e = Number(exponentText);
  const low = BigInt(10) ** BigInt(digits - 1);
  const high = low * BigInt(10);
  const valueOf = (mm: bigint, ee: number) => Number(`${mm}e${ee - digits + 1}`);
  for (let i = 0; i < 3; i++) {
    const x = valueOf(m, e);
    if (shrink ? x <= a : x >= a) break;
    m += shrink ? BigInt(-1) : BigInt(1);
    if (m < low) {
      m = high - BigInt(1);
      e -= 1;
    } else if (m >= high) {
      m = low;
      e += 1;
    }
  }
  return `${v < 0 ? MINUS : ""}${scientificText(m.toString(), e, digits)}`;
}

/** Digits d1 d2 … of a mantissa d1.d2… times 10^e in decimal()'s style (plain in [1e-3, 1e6), else ·10ⁿ), trailing zeros dropped. */
function scientificText(digitsText: string, e: number, digits: number): string {
  if (e >= -3 && e < 6) return decimal(Number(`${digitsText}e${e - digits + 1}`), digits);
  const mantissa = `${digitsText[0]}${digitsText.length > 1 ? `.${digitsText.slice(1)}` : ""}`.replace(/\.?0+$/, "");
  return `${mantissa}·10${mapScript(String(e), SUPERSCRIPT) ?? `^${String(e).replace(/-/g, MINUS)}`}`;
}

/**
 * A positive value given by its natural logarithm, as a decimal with `digits` significant digits,
 * rounded toward a side or to nearest: also beyond the double range (a distance of 10^400, a surd
 * of 2·10^-320), where the value itself would be Infinity or 0.
 */
export function decimalLn(ln: number, digits: number, toward: "up" | "down" | "nearest" = "nearest"): string {
  // Never a non-finite text: ln = -Infinity is the value 0 (a caller must not reach it for a bound).
  if (ln === -Infinity) return "0";
  if (!Number.isFinite(ln)) return toward === "down" ? decimalDirected(Number.MAX_VALUE, digits, "down") : "∞";
  const value = Math.exp(ln);
  // A directed rounding steps past the error of ln (about 1e-14 when two logarithms cancel) first.
  if (Number.isFinite(value) && value > 1e-300 && value < 1e300) {
    if (toward === "nearest") return decimal(value, digits);
    return decimalDirected(value * (toward === "down" ? 1 - 1e-12 : 1 + 1e-12), digits, toward);
  }
  let e = Math.floor(ln / Math.LN10);
  // mantissa in [1, 10): exp(ln - e ln10); the error of ln (about 1e-15 relative) is far below 6 digits.
  // floor(ln / ln10) can land one off at an exact power of ten: renormalize so the digits keep their exponent.
  let mantissa = Math.exp(ln - e * Math.LN10);
  // The margin first, THEN the renormalization: a mantissa of exactly 1 rounded down is 9.999… one exponent lower.
  if (toward === "down") mantissa *= 1 - 1e-12;
  if (toward === "up") mantissa *= 1 + 1e-12;
  if (mantissa < 1) {
    mantissa *= 10;
    e -= 1;
  } else if (mantissa >= 10) {
    mantissa /= 10;
    e += 1;
  }
  const scaled = mantissa * 10 ** (digits - 1);
  const m = toward === "down" ? Math.floor(scaled) : toward === "up" ? Math.ceil(scaled) : Math.round(scaled);
  const text = String(m);
  return text.length > digits ? scientificText(text.slice(0, digits), e + 1, digits) : scientificText(text, e, digits);
}
/** A positive value rounded down (a guaranteed lower bound). */
export function decimalDown(v: number, digits = 4): string {
  return decimalDirected(v, digits, "down");
}

/** Whether the plain text of a formula is a sum at its top level ("1 + t", not "(1 + t)" or "2t"). */
export function isSumFormula(x: Formula): boolean {
  return hasTopLevelSum(plain(x));
}

/**
 * |q| as a formula, the sign left to the caller: an integer or a fraction up to MAX_EXACT_DIGITS
 * digits; a terminating decimal of at most EXACT_DECIMAL_DIGITS significant digits exactly
 * (1.0000000001); anything longer rounded to ROUNDED_DIGITS, and a rounded value that would read
 * as an exact integer keeps its zeros (1.00000, never 1: 1 + 10⁻¹⁷ is not 1).
 */
function magnitude(v: Q, ctx: NotationContext): Formula {
  const a = sign(v) < 0 ? neg(v) : v;
  if (digitCount(a) > MAX_EXACT_DIGITS) {
    const exactDigits = terminatingDigits(a);
    if (exactDigits !== null && exactDigits <= EXACT_DECIMAL_DIGITS) return f(rationalDecimal(a, exactDigits));
    ctx.rounded = true;
    return f(roundedDecimal(a, ROUNDED_DIGITS));
  }
  return isInteger(a) ? f(String(a.n)) : frac(String(a.n), String(a.d));
}

/** rationalDecimal, with the zeros of a rounded value kept when it would otherwise read as an exact integer ("1.00000", "10.0000", "1.00000·10⁶"). */
function roundedDecimal(a: Q, digits: number): string {
  return keepZeros(rationalDecimal(a, digits), digits);
}

/**
 * A ROUNDED decimal text whose mantissa came out as a whole number ("1", "10", "−1·10⁷") gets its
 * zeros back ("1.00000", "10.0000", "−1.00000·10⁷"), so it never reads as an exact integer.
 */
export function keepZeros(text: string, digits: number): string {
  const [mantissa, exponent] = text.split("·10");
  const unsigned = mantissa.replace(MINUS, "");
  if (!/^\d+$/.test(unsigned)) return text;
  const padded = `${mantissa}.${"0".repeat(Math.max(1, digits - unsigned.length))}`;
  return exponent === undefined ? padded : `${padded}·10${exponent}`;
}

/** A decimal of a double rounded to `digits`, its zeros kept where it would read as exact (a rounded constant). */
export function roundedNumber(v: number, digits: number): string {
  const text = decimal(v, digits);
  const exact = Number(v.toPrecision(digits)) === v;
  return exact ? text : keepZeros(text, digits);
}

/**
 * A value the student typed (an expansion point, an initial time): exactly when it is a terminating
 * decimal of at most 17 significant digits (every double is; 0.3333333333333333 is not 0.333333,
 * and a statement about "t = 0.333333" would be about another point), else as num().
 */
export function exactNum(v: Q, ctx: NotationContext): Formula {
  const a = sign(v) < 0 ? neg(v) : v;
  if (digitCount(a) > MAX_EXACT_DIGITS) {
    const text = terminatingDecimalText(a, 17);
    if (text !== null) return f(sign(v) < 0 ? MINUS : "", text);
  }
  return num(v, ctx);
}

/**
 * A positive terminating decimal written from its EXACT digits (n 10^k / d is an integer), never through
 * a double: 24.015962814534298 stays 24.015962814534298. Plain in [1e-3, 1e6), else d.ddd·10ⁿ like
 * decimal(); null when it does not terminate or has more than `maxDigits` significant digits.
 */
function terminatingDecimalText(a: Q, maxDigits: number): string | null {
  const digits = terminatingDigits(a);
  if (digits === null || digits > maxDigits) return null;
  let d = a.d;
  let places = 0;
  const two = BigInt(2);
  const five = BigInt(5);
  let twos = 0;
  let fives = 0;
  while (d % two === BigInt(0)) {
    d /= two;
    twos++;
  }
  while (d % five === BigInt(0)) {
    d /= five;
    fives++;
  }
  places = Math.max(twos, fives);
  const scaled = ((a.n * BigInt(10) ** BigInt(places)) / a.d).toString();
  // value = scaled · 10^-places; its decimal exponent e: 10^e <= value < 10^(e+1).
  const e = scaled.length - 1 - places;
  const significant = scaled.replace(/0+$/, "");
  if (e >= -3 && e < 6) {
    const padded = places >= scaled.length ? "0".repeat(places - scaled.length + 1) + scaled : scaled;
    const point = padded.length - places;
    const intPart = padded.slice(0, point);
    const fracPart = padded.slice(point).replace(/0+$/, "");
    return fracPart ? `${intPart}.${fracPart}` : intPart;
  }
  const mantissa = `${significant[0]}${significant.length > 1 ? `.${significant.slice(1)}` : ""}`;
  return `${mantissa}·10${mapScript(String(e), SUPERSCRIPT) ?? `^${String(e).replace(/-/g, MINUS)}`}`;
}

/**
 * A positive rational as a decimal with `digits` significant digits, computed with BigInt so a value
 * beyond the double range (10^400, 10^-400) prints as 1.23·10⁴⁰⁰ and never as Infinity or 0.
 */
export function rationalDecimal(a: Q, digits: number): string {
  const v = toNumber(a);
  if (Number.isFinite(v) && v !== 0 && Math.abs(v) >= 1e-300 && Math.abs(v) <= 1e300) return decimal(v, digits);
  if (isZero(a)) return "0";
  const n = a.n < BigInt(0) ? -a.n : a.n;
  const ten = BigInt(10);
  // e = floor(log10(n/d)) exactly: 10^e <= n/d < 10^(e+1), from the digit counts corrected by one.
  const pow = (k: number) => ten ** BigInt(k);
  const atLeast = (k: number) => (k >= 0 ? n >= a.d * pow(k) : n * pow(-k) >= a.d);
  let e = n.toString().length - a.d.toString().length;
  if (!atLeast(e)) e -= 1;
  else if (atLeast(e + 1)) e += 1;
  // round(n/d * 10^(digits - 1 - e)), half away from zero: floor((2 n 10^shift + d) / (2 d)).
  const two = BigInt(2);
  const rounded = (k: number) => {
    const shift = digits - 1 - k;
    return shift >= 0 ? (two * n * pow(shift) + a.d) / (two * a.d) : (two * n + a.d * pow(-shift)) / (two * a.d * pow(-shift));
  };
  let m = rounded(e);
  // A carry to 10^digits (9.999996 -> 10.0000) moves the exponent up by one.
  if (m.toString().length > digits) {
    e += 1;
    m = rounded(e);
  }
  const text = m.toString();
  const mantissa = `${text[0]}${text.length > 1 ? `.${text.slice(1)}` : ""}`.replace(/\.?0+$/, "");
  const exponent = String(e).replace(/-/g, MINUS);
  return `${mantissa}·10${mapScript(String(e), SUPERSCRIPT) ?? `^${exponent}`}`;
}

/** A rational with its sign: "3", "−2/3", "1.23457·10⁻³²". */
export function num(v: Q, ctx: NotationContext): Formula {
  return f(sign(v) < 0 ? MINUS : "", magnitude(v, ctx));
}

/**
 * A signed sum of terms: each term is {coefficient, body}; a body of [] is a constant term. A
 * coefficient 1 or -1 in front of a non-empty body is not printed; terms with coefficient 0 are dropped.
 */
export function signedSum(terms: readonly { c: Q; body: Formula }[], ctx: NotationContext): Formula {
  const kept = terms.filter((t) => !isZero(t.c));
  if (kept.length === 0) return f("0");
  const parts: (Formula | string)[] = [];
  kept.forEach((t, i) => {
    // Printing hundreds of long fractions takes time too: on the caller's budget when it gave one.
    if ((i & 7) === 7) ctx.checkpoint?.();
    const negative = sign(t.c) < 0;
    if (i === 0) parts.push(negative ? MINUS : "");
    else parts.push(negative ? ` ${MINUS} ` : " + ");
    const abs = negative ? neg(t.c) : t.c;
    const shown = magnitude(abs, ctx);
    // A coefficient that is 1, or rounds to 1 when shown, is not printed before a body ("cos(t)", not "1 cos(t)").
    const unit = t.body.length > 0 && (cmp(abs, ONE) === 0 || plain(shown) === "1");
    // A coefficient before a function name gets a space: "2 cos(t)", not "2cos(t)".
    const first = t.body[0];
    const spaced = first !== undefined && "t" in first && /^(cos|sin)\(/.test(first.t);
    parts.push(unit ? t.body : f(shown, spaced ? " " : "", t.body));
  });
  return f(...parts);
}

/** base^k: nothing for k = 0, the base for k = 1. */
export function power(base: Formula, k: number | string): Formula {
  if (k === 0 || k === "0") return [];
  if (k === 1 || k === "1") return base;
  return f(base, sup(String(k).replace(/-/g, MINUS)));
}

/** The variable of a series about t0: "t" or "(t − 1)", "(t + 1/2)"; t0 printed exactly (exactNum). */
export function shiftedVariable(center: Q, ctx: NotationContext, variable = "t"): Formula {
  if (isZero(center)) return f(variable);
  const shown = exactNum(sign(center) > 0 ? center : neg(center), ctx);
  return f("(", variable, sign(center) > 0 ? ` ${MINUS} ` : " + ", shown, ")");
}

/** A polynomial in a variable, ascending ("1 − 3t²") or descending ("r² + 3r + 2"). */
export function poly(p: Poly, variable: Formula, ctx: NotationContext, order: "asc" | "desc" = "asc"): Formula {
  const terms: { c: Q; body: Formula }[] = [];
  for (let k = 0; k <= pdeg(p); k++) terms.push({ c: pcoef(p, k), body: power(variable, k) });
  return signedSum(order === "asc" ? terms : terms.reverse(), ctx);
}

/** The number of non-zero terms of a polynomial. */
export function termCount(p: Poly): number {
  return p.filter((c) => !isZero(c)).length;
}

/** A polynomial as a factor: wrapped in parentheses when it has two or more terms. */
export function polyFactor(p: Poly, variable: Formula, ctx: NotationContext): Formula {
  const body = poly(p, variable, ctx);
  return termCount(p) >= 2 ? f("(", body, ")") : body;
}

/** "n + 2", "n − 1", "n" (no spaces in a subscript). */
export function indexText(n: string, delta: number): string {
  return delta === 0 ? n : delta > 0 ? `${n}+${delta}` : `${n}${MINUS}${-delta}`;
}
/** "n + 2" with spaces, for running text. */
export function indexSpaced(n: string, delta: number): string {
  return delta === 0 ? n : delta > 0 ? `${n} + ${delta}` : `${n} ${MINUS} ${-delta}`;
}

/** The coefficient symbol a_index. */
export function coef(letter: string, index: string | number): Formula {
  return f(letter, sub(String(index)));
}

/** The falling factorial (n + delta)(n + delta − 1)... with j factors, as a product of linear factors. */
export function fallingFactorialFormula(n: string, delta: number, j: number): Formula {
  const parts: Formula[] = [];
  for (let i = 0; i < j; i++) {
    const d = delta - i;
    parts.push(d === 0 ? f(n) : f("(", indexSpaced(n, d), ")"));
  }
  // n(n − 1): the bare n first reads naturally; otherwise keep the order.
  return f(...parts);
}

/** Σ with the lower limit "n=from" and the upper ∞, followed by the body. */
export function sum(n: string, from: number | string, body: Formula): Formula {
  return f([{ sum: [`${n}=${String(from)}`, "∞"] }], body);
}

/**
 * sqrt(p/q) * scale written as c√m with a square-free integer m (small numbers only; else c√(p/q)).
 * `round: "down"`: a decimal it falls back to is rounded down (a guaranteed bound).
 */
export function surdFormula(scale: Q, radicand: Q, ctx: NotationContext, round: "nearest" | "down" = "nearest"): Formula {
  // sqrt(p/q) = sqrt(p q) / q
  const pq = radicand.n * radicand.d;
  let coefficient = div(scale, q(radicand.d));
  let m = pq;
  if (pq > BigInt(0) && pq <= BigInt(1e12)) {
    let rest = Number(pq);
    let outside = 1;
    for (let k = 2; k * k <= rest; k++) {
      while (rest % (k * k) === 0) {
        rest /= k * k;
        outside *= k;
      }
    }
    m = BigInt(rest);
    coefficient = mul(coefficient, q(outside));
  }
  const root = `√${m}`;
  if (m === BigInt(1)) return num(coefficient, ctx);
  const abs = sign(coefficient) < 0 ? neg(coefficient) : coefficient;
  const minus = sign(coefficient) < 0 ? MINUS : "";
  // The radicand's digits count too: a 30-digit integer under the root prints rounded, like a long
  // fraction. Computed from logarithms: a radicand of 300 digits overflows a double (2·10^-320 has one).
  if (digitCount(abs) + m.toString().length > MAX_EXACT_DIGITS) {
    ctx.rounded = true;
    const ln = lnAbs(abs) + bigLn(m) / 2;
    const digits = ctx.digits ?? ROUNDED_DIGITS;
    const text = decimalLn(ln, digits, round === "down" ? "down" : "nearest");
    return f(minus, keepZeros(text, digits));
  }
  if (isInteger(abs)) return f(minus, abs.n === BigInt(1) ? "" : String(abs.n), root);
  return f(minus, frac(`${abs.n === BigInt(1) ? "" : String(abs.n)}${root}`, String(abs.d)));
}

/** Numerical value of c·√(p/q). */
export function surdNumber(scale: Q, radicand: Q): number {
  return toNumber(scale) * Math.sqrt(toNumber(radicand));
}

/**
 * The singular points of a radius sentence: "t = 2", "t = −1/2 ± (√3/2)i", "t ≈ −0.7649 ± 0.3525i"; a
 * conjugate pair of numeric roots prints once with ±.
 */
export function pointsFormula(roots: readonly RootForm[], ctx: NotationContext): Formula {
  const items: Formula[] = [];
  const used = new Set<number>();
  roots.forEach((r, i) => {
    if (used.has(i)) return;
    if (r.kind !== "numeric") {
      items.push(f("t = ", rootFormula(r, ctx)));
      return;
    }
    // A part below the root's proven inclusion radius (or 1e-12 of its modulus) is rounding noise: printed as 0.
    const noise = Math.max(r.error, 1e-12 * Math.hypot(r.re, r.im));
    const tol = Math.max(noise, 1e-12 * Math.max(1, Math.abs(r.re), Math.abs(r.im)));
    const real = Math.abs(r.im) <= noise;
    const pureImaginary = !real && Math.abs(r.re) <= noise;
    const mate = real ? -1 : roots.findIndex((x, j) => j > i && !used.has(j) && x.kind === "numeric" && Math.abs(x.re - r.re) <= tol && Math.abs(x.im + r.im) <= tol);
    if (mate >= 0) used.add(mate);
    const re = decimal(r.re);
    const imText = decimal(Math.abs(r.im));
    const im = imText === "1" ? "i" : `${imText}i`;
    if (real) items.push(f("t ≈ ", re));
    else if (pureImaginary) items.push(f("t ≈ ", mate >= 0 ? "±" : r.im >= 0 ? "" : MINUS, im));
    else if (mate >= 0) items.push(f("t ≈ ", re, " ± ", im));
    else items.push(f("t ≈ ", re, r.im >= 0 ? " + " : ` ${MINUS} `, im));
  });
  return join(items, ", ");
}

/** One root as a formula: "2", "−1/2 ± (√3/2)i", "≈ 0.3473 + 1.234i". */
export function rootFormula(r: RootForm, ctx: NotationContext): Formula {
  if (r.kind === "rational") return num(r.value, ctx);
  if (r.kind === "quadratic") {
    const negativeDisc = sign(r.disc) < 0;
    const s = surdFormula(sign(r.scale) < 0 ? neg(r.scale) : r.scale, negativeDisc ? neg(r.disc) : r.disc, ctx);
    const centerPart = isZero(r.center) ? f("") : f(num(r.center, ctx), " ");
    // ±i, not ±1i: a unit imaginary part prints as i alone.
    const magnitudePart = negativeDisc && plain(s) === "1" ? f("") : s;
    // One branch of a real pair (the nearer one of a radius): center + s√d or center − s√d.
    const sym = r.branch === undefined ? "±" : (r.branch > 0) === sign(r.scale) > 0 ? "+" : MINUS;
    if (r.branch !== undefined && isZero(r.center)) return f(sym === "+" ? "" : MINUS, magnitudePart);
    return f(centerPart, sym, isZero(r.center) ? "" : " ", magnitudePart, negativeDisc ? "i" : "");
  }
  if (r.kind === "unlocated") return f("?");
  const re = decimal(r.re);
  if (Math.abs(r.im) <= 1e-12 * Math.max(1, Math.abs(r.re))) return f("≈ ", re);
  return f("≈ ", re, r.im >= 0 ? " + " : ` ${MINUS} `, decimal(Math.abs(r.im)), "i");
}

/**
 * A polynomial with rational roots written as a product of linear factors where it can be: lc ·
 * (n − 2)(n + 3) · (the rest expanded). A root p/q prints as the factor (q n − p) with the leading
 * coefficient divided by q, so no fraction sits inside a factor.
 */
export function factored(p: Poly, variable: string, ctx: NotationContext): Formula {
  if (pdeg(p) <= 0) return num(pcoef(p, 0), ctx);
  // The bare variable (root 0) first, then the other rational roots from the largest down:
  // n(n − 2), (n − 2)(n + 3), (n + 1)(n + 2); a repeated factor carries its power: n², (n − 1)².
  const roots = rootsOf(p)
    .filter((r): r is Extract<RootForm, { kind: "rational" }> => r.kind === "rational")
    .sort((x, y) => (isZero(x.value) ? -1 : isZero(y.value) ? 1 : cmp(y.value, x.value)));
  let lead = pcoef(p, pdeg(p));
  let restDegree = pdeg(p);
  const factors: Formula[] = [];
  let rest: Poly = p;
  for (const r of roots) {
    const d = q(r.value.d);
    // (q x - p) has the root p/q; the polynomial's leading coefficient absorbs 1/q per factor.
    for (let k = 0; k < r.multiplicity; k++) {
      lead = div(lead, d);
      rest = pdivmod(rest, [neg(r.value), ONE]).quotient;
      restDegree--;
    }
    const lin: Poly = [neg(q(r.value.n)), d];
    const base = isZero(r.value) ? f(variable) : f("(", poly(lin, f(variable), ctx, "desc"), ")");
    factors.push(power(base, r.multiplicity));
  }
  if (restDegree > 0) {
    const monicRest = rest.map((c) => div(c, pcoef(rest, pdeg(rest))));
    factors.push(f("(", poly(monicRest, f(variable), ctx, "desc"), ")"));
  }
  const leadPart = cmp(lead, ONE) === 0 ? f("") : cmp(lead, neg(ONE)) === 0 ? f(MINUS) : num(lead, ctx);
  return f(leadPart, ...factors);
}

/**
 * A real quasi-polynomial in t: sums of e^(αt)(A(t) cos(βt) + B(t) sin(βt)) with the polynomial
 * parts written out; a pure polynomial prints as one.
 */
export function quasiFormula(qp: QuasiPoly, ctx: NotationContext): Formula {
  const pieces: Formula[] = [];
  for (const pair of realPairs(qp)) {
    const exp = isZero(pair.alpha) ? f("") : f("e", sup(tMultiple(pair.alpha, ctx)));
    // Polynomial times a factor (cos, sin, or nothing): a monomial keeps its coefficient in front
    // ("(1/2)t sin(t)", "cos(t)"), a longer polynomial is bracketed ("(1 + t)cos(t)").
    const termsOf = (p: Poly, factor: Formula): { c: Q; body: Formula }[] => {
      if (termCount(p) === 1) {
        const k = p.findIndex((v) => !isZero(v));
        const t = power(f("t"), k);
        return [{ c: p[k], body: f(t, t.length && factor.length ? " " : "", factor) }];
      }
      if (factor.length === 0) return p.map((c, k) => ({ c, body: power(f("t"), k) }));
      return [{ c: ONE, body: f("(", poly(p, f("t"), ctx), ")", factor) }];
    };
    const terms: { c: Q; body: Formula }[] = [];
    if (isZero(pair.beta)) {
      terms.push(...termsOf(pair.cos, f("")));
    } else {
      const arg = tMultiple(pair.beta, ctx);
      if (pair.cos.length) terms.push(...termsOf(pair.cos, f("cos(", arg, ")")));
      if (pair.sin.length) terms.push(...termsOf(pair.sin, f("sin(", arg, ")")));
    }
    let body = signedSum(terms, ctx);
    if (!isZero(pair.alpha)) {
      const single = terms.filter((t) => !isZero(t.c)).length === 1;
      if (single && plain(body) === "1") body = exp;
      else if (single && plain(body) === MINUS + "1") body = f(MINUS, exp);
      // One term keeps its sign in front: "−(1/2)e⁻³ᵗ", never "e⁻³ᵗ(−1/2)".
      else if (single) body = plain(body).startsWith(MINUS) ? f(MINUS, withoutLeadingMinus(body), exp) : f(body, exp);
      else body = f(exp, "(", body, ")");
    }
    pieces.push(body);
  }
  if (pieces.length === 0) return f("0");
  return joinSigned(pieces);
}

/** A formula without the minus sign its first text run starts with. */
function withoutLeadingMinus(x: Formula): Formula {
  const first = x[0];
  if (!first || !("t" in first) || !first.t.startsWith(MINUS)) return x;
  return f(first.t.slice(MINUS.length), x.slice(1));
}

/** Significant digits beyond which a terminating decimal of an exponent or frequency is rounded. */
export const EXACT_DECIMAL_DIGITS = 12;

/** The significant digits of a positive rational's decimal when it terminates (denominator 2^a 5^b); null when it does not. */
export function terminatingDigits(a: Q): number | null {
  let d = a.d;
  let twos = 0;
  let fives = 0;
  const two = BigInt(2);
  const five = BigInt(5);
  while (d % two === BigInt(0)) {
    d /= two;
    twos++;
  }
  while (d % five === BigInt(0)) {
    d /= five;
    fives++;
  }
  if (d !== BigInt(1)) return null;
  const places = Math.max(twos, fives);
  const scaled = (a.n * BigInt(10) ** BigInt(places)) / a.d;
  return scaled.toString().replace(/0+$/, "").length;
}

/** |c| as the text of an exponent's or frequency's multiplier: exact up to MAX_EXACT_DIGITS (fraction) or EXACT_DECIMAL_DIGITS (decimal), else rounded to `digits`. */
function multiplierText(a: Q, digits: number): { text: string; rounded: boolean } {
  if (digitCount(a) <= MAX_EXACT_DIGITS) {
    if (a.d === BigInt(1)) return { text: String(a.n), rounded: false };
    return { text: `${a.n === BigInt(1) ? "" : String(a.n)}/${a.d}`, rounded: false };
  }
  const exactDigits = terminatingDigits(a);
  if (exactDigits !== null && exactDigits <= EXACT_DECIMAL_DIGITS) return { text: rationalDecimal(a, exactDigits), rounded: false };
  return { text: roundedDecimal(a, digits), rounded: true };
}

/**
 * c·v as running text for exponents and arguments: "2t", "−t", "t/2", "−3t/4", "−2(t − 1)",
 * "1.00000001t"; a longer rational prints rounded to ctx.digits (default ROUNDED_DIGITS) significant
 * digits ("3.14159t") and sets ctx.rounded; a multiplier that prints as 1 is left out ("t").
 */
export function tMultiple(c: Q, ctx?: NotationContext, variable = "t"): string {
  const negative = sign(c) < 0;
  const a = negative ? neg(c) : c;
  const { text, rounded } = multiplierText(a, ctx?.digits ?? ROUNDED_DIGITS);
  if (rounded && ctx) ctx.rounded = true;
  let body: string;
  if (text.includes("/")) {
    const [numerator, denominator] = text.split("/");
    body = `${numerator}${variable}/${denominator}`;
  } else body = text === "1" ? variable : `${text}${variable}`;
  return `${negative ? MINUS : ""}${body}`;
}

/**
 * The fewest significant digits (at least ROUNDED_DIGITS) at which different exponents or frequencies
 * of one formula still print differently: cos(1.00000001t) next to cos(t) must not both read cos(t).
 */
export function distinctDigits(values: readonly Q[], min = ROUNDED_DIGITS): number {
  for (let digits = min; digits < 17; digits++) {
    const seen = new Map<string, Q>();
    let clash = false;
    for (const v of values) {
      const negative = sign(v) < 0;
      // Compared by the value each one shows ROUNDED to these digits (a surd always prints rounded, a
      // short decimal exactly; rounding both is the stricter test): 1.00000000005 and 1 differ only at 12.
      const text = rationalDecimal(negative ? neg(v) : v, digits);
      const key = `${negative ? "-" : ""}${/^\d+(\.\d+)?$/.test(text) ? String(Number(text)) : text}`;
      const other = seen.get(key);
      if (other !== undefined && cmp(other, v) !== 0) clash = true;
      seen.set(key, v);
    }
    if (!clash) return digits;
  }
  return 17;
}

/** Joins formulas with " + ", turning a leading minus of a later one into " − ". */
export function joinSigned(items: readonly Formula[]): Formula {
  const parts: (Formula | string)[] = [];
  items.forEach((item, i) => {
    if (i === 0) {
      parts.push(item);
      return;
    }
    const first = item[0];
    if (first && "t" in first && first.t.startsWith(MINUS)) {
      parts.push(` ${MINUS} `, f(first.t.slice(1), item.slice(1)));
    } else {
      parts.push(" + ", item);
    }
  });
  return f(...parts);
}


