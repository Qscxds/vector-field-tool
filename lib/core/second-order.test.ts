import { describe, expect, it } from "vitest";
import { compileScalar, ParseError, type ParseErrorCode } from "./parse";
import {
  DOUBLE_EQUALS_MESSAGE,
  HIGHER_DERIVATIVE_MESSAGE,
  NOT_LINEAR_IN_XDD_MESSAGE,
  normalizePrimes,
  OTHER_PRIME_MESSAGE,
  reduceSecondOrder,
  SAMPLE_POINTS,
  straightenPrimes,
  TOO_MANY_EQUALS_MESSAGE,
  UNDEFINED_AT_SAMPLES_MESSAGE,
  XDD_COEFFICIENT_VANISHES_MESSAGE,
  XDD_WITHOUT_EQUALS_MESSAGE,
} from "./second-order";
import { PROBE_TIMES } from "./time-dependence";
import type { Box } from "./types";

const P = { x: 1.3, y: 0.7 };
/** |a - b| relative to the larger magnitude (never to an absolute 1). */
const relClose = (a: number, b: number, tol = 1e-12) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b));

function F(input: string, params?: Record<string, number>, box?: Box) {
  const r = reduceSecondOrder(input, params, box ? { box } : {});
  return { r, F: compileScalar(r.spec.g, params) };
}

/** The ParseError an input raises: its code, message, expr and symbol. */
function failure(input: string, box?: Box): ParseError {
  try {
    reduceSecondOrder(input, undefined, box ? { box } : {});
  } catch (error) {
    if (error instanceof ParseError) return error;
    throw error;
  }
  throw new Error(`expected ${input} to be refused`);
}

describe("normalizePrimes", () => {
  it("turns every prime notation into the placeholders, double primes first", () => {
    expect(normalizePrimes("x'' + x' + x")).toBe("xdd + xd + x");
    expect(normalizePrimes("x″ + x′")).toBe("xdd + xd");
    expect(normalizePrimes('x" + 1')).toBe("xdd + 1");
    expect(normalizePrimes("  x '' ")).toBe("xdd");
  });

  it("accepts curly apostrophes (iOS / Word), two unicode primes, spaced primes, backticks and acute accents", () => {
    expect(normalizePrimes("x’’ + x’")).toBe("xdd + xd");
    expect(normalizePrimes("x′′ + x′")).toBe("xdd + xd");
    expect(normalizePrimes("x ' ' + x '")).toBe("xdd + xd");
    expect(normalizePrimes("x`` + x´")).toBe("xdd + xd");
    expect(normalizePrimes("x‘‘ + x”")).toBe("xdd + xdd");
    expect(straightenPrimes("x’’ x″ x`")).toBe("x'' x'' x'");
  });
});

describe("reduceSecondOrder", () => {
  it("x'' + x = 0 reduces to x' = y, y' = -x (F(1.3, 0.7) = -1.3, a clean string)", () => {
    const { r, F: f } = F("x'' + x = 0");
    expect(r.reduced.f).toBe("y");
    expect(r.spec).toEqual({ f: "y", g: r.reduced.g });
    expect(r.spec.variables).toBeUndefined();
    expect(r.equation).toBe("x'' + x = 0");
    expect(f(P)).toBe(-1.3);
    expect(r.reduced.g.replace(/\s/g, "")).toMatch(/^(-x|-1\*x|-\(x\))$/);
  });

  it("x'' + 0.5*x' + x = 0: F(1.3, 0.7) = -1.3 - 0.35 = -1.65", () => {
    const { F: f } = F("x'' + 0.5*x' + x = 0");
    expect(relClose(f(P), -1.65)).toBe(true);
  });

  it("x'' = -sin(x): F(1.3, 0.7) = -sin(1.3), and the right-hand side is shown as written", () => {
    const { r, F: f } = F("x'' = -sin(x)");
    expect(r.equation).toBe("x'' = -sin(x)");
    expect(relClose(f(P), -Math.sin(1.3))).toBe(true);
    expect(r.reduced.g.replace(/\s/g, "")).toBe("-sin(x)");
  });

  it("a bare right-hand side is x'' = F, shown with x' -> y and nothing else changed", () => {
    const { r, F: f } = F("-sin(x) - 0.2*x'");
    expect(r.equation).toBe("x'' = -sin(x) - 0.2*x'");
    expect(relClose(f(P), -Math.sin(1.3) - 0.14)).toBe(true);
    expect(r.reduced.g.replace(/\s/g, "")).toBe("-sin(x)-0.2*y");
  });

  it("2*x'' + x = 0: F = -x/2 numerically, and the coefficient is divided out symbolically", () => {
    const { r, F: f } = F("2*x'' + x = 0");
    expect(relClose(f(P), -0.65)).toBe(true);
    expect(relClose(f({ x: -2.2, y: 3 }), 1.1)).toBe(true);
    expect(r.reduced.g.replace(/\s/g, "")).toBe("-x/2");
  });

  it("(1 + x^2)*x'' = -x: the coefficient varies, F(x, y) = -x/(1 + x^2) numerically, shown as -x / (1 + x ^ 2)", () => {
    const { r, F: f } = F("(1 + x^2)*x'' = -x");
    expect(relClose(f(P), -1.3 / 2.69)).toBe(true);
    for (const p of [{ x: 0.3, y: -1 }, { x: -1.9, y: 0.2 }, { x: 2.1, y: 2.1 }]) {
      expect(relClose(f(p), -p.x / (1 + p.x * p.x))).toBe(true);
    }
    expect(r.reduced.g.replace(/\s/g, "")).toBe("-x/(1+x^2)");
  });

  it("-x'' = x and x''/2 = -x: a negated or divided x'' is handled symbolically (F = -x and F = -2x)", () => {
    const neg = F("-x'' = x");
    expect(relClose(neg.F(P), -1.3)).toBe(true);
    expect(neg.r.reduced.g.replace(/\s/g, "")).toBe("-x");
    const half = F("x''/2 = -x");
    expect(relClose(half.F(P), -2.6)).toBe(true);
  });

  it("x''^2 = x and sin(x'') = 0 are refused with the linearity message and code", () => {
    for (const input of ["x''^2 = x", "sin(x'') = 0", "x''*x'' + x = 0", "exp(x'') = x"]) {
      const e = failure(input);
      expect(e.message, input).toBe(NOT_LINEAR_IN_XDD_MESSAGE);
      expect(e.code, input).toBe("second_order_not_affine");
    }
  });

  it("x'' + y = 0 names y as unknown, says the unknown is x with x' its derivative, and carries the code and the symbol", () => {
    const e = failure("x'' + y = 0");
    expect(e.message).toMatch(/Unknown symbol "y"/);
    expect(e.message).toMatch(/unknown function is x/);
    expect(e.message).toMatch(/x' \(dx\/dt\)/);
    expect(e.expr).toBe("x'' + y = 0");
    expect(e.code).toBe("second_order_unknown_symbol");
    expect(e.symbol).toBe("y");
  });

  it("x'' = -x + sin(t): the reduced g contains t and evaluates with the time", () => {
    const { r, F: f } = F("x'' = -x + sin(t)");
    expect(r.reduced.g).toMatch(/\bt\b/);
    expect(relClose(f({ x: 0, y: 0 }, Math.PI / 2), 1)).toBe(true);
    expect(relClose(f({ x: 0.5, y: 0 }, 0), -0.5)).toBe(true);
  });

  it("params: x'' + c*x' + k*x = 0 with {c: 0.5, k: 1}", () => {
    const params = { c: 0.5, k: 1 };
    const { r, F: f } = F("x'' + c*x' + k*x = 0", params);
    expect(r.spec.params).toEqual(params);
    expect(r.spec.f).toBe("y");
    expect(relClose(f(P), -1.65)).toBe(true);
    expect(relClose(compileScalar(r.reduced.g, { c: 2, k: 3 })(P), -1.4 - 3.9)).toBe(true);
  });

  it("unicode primes are accepted and displayed as straight apostrophes", () => {
    const { r, F: f } = F("x″ + 0.5*x′ + x = 0");
    expect(r.equation).toBe("x'' + 0.5*x' + x = 0");
    expect(relClose(f(P), -1.65)).toBe(true);
  });

  it("curly apostrophes, two unicode primes, spaced primes and backticks all reduce x'' + x = 0 to g = -x with the equation shown straight", () => {
    for (const input of ["x’’ + x = 0", "x′′ + x = 0", "x ' ' + x = 0", "x`` + x = 0", "x‘‘ + x = 0"]) {
      const { r, F: f } = F(input);
      expect(r.equation, input).toBe("x'' + x = 0");
      expect(f(P), input).toBe(-1.3);
    }
    const spaced = F("x ' ' + 0.5*x ' + x = 0");
    expect(spaced.r.equation).toBe("x'' + 0.5*x' + x = 0");
    expect(relClose(spaced.F(P), -1.65)).toBe(true);
  });

  it("x''' is refused as a higher derivative, with its own code, not as a prime on another symbol", () => {
    for (const input of ["x''' + x = 0", "x’’’ = x", "x ' ' ' = 0"]) {
      const e = failure(input);
      expect(e.message, input).toBe(HIGHER_DERIVATIVE_MESSAGE);
      expect(e.code, input).toBe("second_order_higher_derivative");
    }
  });

  it("x'' without = is refused with the two accepted forms and the code", () => {
    const e = failure("x'' + x");
    expect(e.message).toBe(XDD_WITHOUT_EQUALS_MESSAGE);
    expect(e.code).toBe("second_order_no_equation");
  });

  it("== and a second = are refused with their codes", () => {
    const double = failure("x'' == -x");
    expect(double.message).toBe(DOUBLE_EQUALS_MESSAGE);
    expect(double.code).toBe("second_order_double_equals");
    const many = failure("x'' = -x = 0");
    expect(many.message).toBe(TOO_MANY_EQUALS_MESSAGE);
    expect(many.code).toBe("second_order_too_many_equals");
  });

  it("primes on anything but x are refused with the notation sentence and the code", () => {
    const e = failure("y'' + y = 0");
    expect(e.message).toBe(OTHER_PRIME_MESSAGE);
    expect(e.code).toBe("second_order_other_prime");
  });

  it("an equation without x'' (x' + x = 0) has a vanishing x'' coefficient, with the code", () => {
    for (const input of ["x' + x = 0", "0*x'' + x = 0"]) {
      const e = failure(input);
      expect(e.message, input).toBe(XDD_COEFFICIENT_VANISHES_MESSAGE);
      expect(e.code, input).toBe("second_order_zero_coefficient");
    }
  });

  it("the placeholders xd and xdd are rejected in every ordinary mode, and typed placeholders carry their code", () => {
    expect(() => compileScalar("xd + x")).toThrow(ParseError);
    expect(() => compileScalar("xdd")).toThrow(ParseError);
    expect(() => compileScalar("xd + y", undefined, { variables: "ty" })).toThrow(ParseError);
    const e = failure("xdd + x = 0");
    expect(e.message).toMatch(/internal names/);
    expect(e.code).toBe("second_order_placeholder_typed");
  });

  it("an equation undefined at almost every sample is refused with the code", () => {
    // sqrt(x - 100) is NaN at every generic point and every time; no box is given.
    const e = failure("x'' = sqrt(x - 100)");
    expect(e.message).toBe(UNDEFINED_AT_SAMPLES_MESSAGE);
    expect(e.code).toBe("second_order_undefined_at_samples");
  });

  it("every refusal carries one of the second_order_* codes", () => {
    const codes: ParseErrorCode[] = [
      "second_order_not_affine", "second_order_zero_coefficient", "second_order_no_equation", "second_order_double_equals",
      "second_order_too_many_equals", "second_order_other_prime", "second_order_higher_derivative", "second_order_placeholder_typed",
      "second_order_undefined_at_samples", "second_order_unknown_symbol",
    ];
    for (const input of ["x''^2 = x", "x' + x = 0", "x'' + x", "x'' == -x", "x'' = -x = 0", "y'' + y = 0", "x''' = 0", "xdd + x = 0", "x'' = sqrt(x - 100)", "x'' + y = 0"]) {
      expect(codes, input).toContain(failure(input).code);
    }
  });

  it("the sample points are generic: inside [-1.7, 2.3]^2, no integers, all distinct", () => {
    expect(SAMPLE_POINTS).toHaveLength(9);
    const seen = new Set<string>();
    for (const p of SAMPLE_POINTS) {
      expect(p.x).toBeGreaterThan(-1.7);
      expect(p.x).toBeLessThan(2.3);
      expect(p.y).toBeGreaterThan(-1.7);
      expect(p.y).toBeLessThan(2.3);
      expect(Number.isInteger(p.x)).toBe(false);
      expect(Number.isInteger(p.y)).toBe(false);
      seen.add(`${p.x},${p.y}`);
    }
    expect(seen.size).toBe(9);
  });

  it("Van der Pol x'' - (1 - x^2)*x' + x = 0: F(1.3, 0.7) = (1 - 1.69)*0.7 - 1.3, shown as (1 - x ^ 2) * y - x", () => {
    const { r, F: f } = F("x'' - (1 - x^2)*x' + x = 0");
    expect(relClose(f(P), (1 - 1.69) * 0.7 - 1.3)).toBe(true);
    expect(r.reduced.g.replace(/\s/g, "")).toBe("(1-x^2)*y-x");
  });
});

describe("reduceSecondOrder: coefficients that depend on t (review J-C.1)", () => {
  it("(1 + t^2)*x'' = -x keeps t: g(1, 0, t = 2) = -1/5 and the reduced string contains t", () => {
    // x'' = -x / (1 + t^2); at (x, y, t) = (1, 0, 2) that is -1/5 = -0.2.
    const { r, F: f } = F("(1 + t^2)*x'' = -x");
    expect(r.reduced.g).toMatch(/\bt\b/);
    expect(relClose(f({ x: 1, y: 0 }, 2), -0.2)).toBe(true);
    expect(relClose(f({ x: 1, y: 0 }, 0), -1)).toBe(true);
    expect(r.reduced.g.replace(/\s/g, "")).toBe("-x/(1+t^2)");
  });

  it("exp(t)*x'' + x = 0: g(0.5, 0, t = 1) = -0.5/e", () => {
    const { r, F: f } = F("exp(t)*x'' + x = 0");
    expect(r.reduced.g).toMatch(/\bt\b/);
    expect(relClose(f({ x: 0.5, y: 0 }, 1), -0.5 / Math.E)).toBe(true);
  });

  it("t*x'' = -x is refused: the coefficient vanishes at the sampled time t = 0", () => {
    expect(PROBE_TIMES).toContain(0);
    expect(failure("t*x'' = -x").code).toBe("second_order_zero_coefficient");
  });

  it("(cos(t)^2 + sin(t)^2)*x'' = -x is kept as written (no algebra is done on the coefficient), and is numerically -x", () => {
    const { r, F: f } = F("cos(t)^2*x'' + sin(t)^2*x'' = -x");
    expect(r.reduced.g).toMatch(/cos\(t\)/);
    for (const t of PROBE_TIMES) expect(relClose(f(P, t), -1.3, 1e-14)).toBe(true);
  });
});

describe("reduceSecondOrder: the viewing box joins the sample set (review J-C.2)", () => {
  const box: Box = { x: { min: 0, max: 10 }, y: { min: -3, max: 3 } };

  it("(x > 5 ? 2 : 1)*x'' = -x on x in [0, 10]: the coefficient is seen to vary, g(7, 0) = -7/2 and g(2, 0) = -2", () => {
    const { r, F: f } = F("(x > 5 ? 2 : 1)*x'' = -x", undefined, box);
    expect(relClose(f({ x: 7, y: 0 }), -3.5)).toBe(true);
    expect(relClose(f({ x: 2, y: 0 }), -2)).toBe(true);
    expect(r.reduced.g).toMatch(/x > 5/);
  });

  it("x'' = -x + (x > 5 ? x''^2 : 0) on x in [0, 10] is refused as not affine (the box samples reach the quadratic branch)", () => {
    const e = failure("x'' = -x + (x > 5 ? x''^2 : 0)", box);
    expect(e.code).toBe("second_order_not_affine");
  });

  it("an equation defined only inside the student's box (sqrt(x - 100) for x in [100, 200]) is reducible with the box and refused without it", () => {
    const far: Box = { x: { min: 100, max: 200 }, y: { min: -1, max: 1 } };
    const { F: f } = F("x'' = -sqrt(x - 100)", undefined, far);
    expect(relClose(f({ x: 104, y: 0 }), -2)).toBe(true);
    expect(failure("x'' = -sqrt(x - 100)").code).toBe("second_order_undefined_at_samples");
  });

  it("box invariance: the same equation on three boxes gives the same reduced string and the same values", () => {
    const boxes: Box[] = [
      { x: { min: -3, max: 3 }, y: { min: -3, max: 3 } },
      { x: { min: 10, max: 20 }, y: { min: -1, max: 1 } },
      { x: { min: -1e3, max: 1e3 }, y: { min: -5e2, max: 5e2 } },
    ];
    for (const input of ["(1 + x^2)*x'' = -x", "x'' + 0.5*x' + x = 0", "(1 + t^2)*x'' = -x"]) {
      const results = boxes.map((b) => F(input, undefined, b));
      for (const { r, F: f } of results) {
        expect(r.spec.g, input).toBe(results[0].r.spec.g);
        expect(r.reduced.g, input).toBe(results[0].r.reduced.g);
        for (const p of [{ x: 0.3, y: -1 }, { x: 15, y: 0.5 }, { x: -700, y: 200 }]) expect(f(p, 1.5), input).toBe(results[0].F(p, 1.5));
      }
    }
  });

  it("scale invariance: multiplying the whole equation by 1e6 or 1e-6 gives the same F numerically", () => {
    const base = F("(1 + x^2)*x'' = -x").F;
    for (const k of ["1e6", "1e-6"]) {
      const { F: f } = F(`${k}*(1 + x^2)*x'' = -${k}*x`);
      for (const p of [P, { x: 0.3, y: -1 }, { x: -1.9, y: 0.2 }, { x: 2.1, y: 2.1 }]) expect(relClose(f(p), base(p), 1e-14), k).toBe(true);
    }
  });
});

describe("reduceSecondOrder: conservative simplification (review J-C.4)", () => {
  it("x'' = -9.81/0.1*sin(x) is shown without a folded constant and evaluates to -98.1 sin(x)", () => {
    const { r, F: f } = F("x'' = -9.81/0.1*sin(x)");
    expect(r.reduced.g).toMatch(/9\.81/);
    expect(r.reduced.g).not.toMatch(/98\.1/);
    expect(r.spec.g).toBe(r.reduced.g);
    expect(relClose(f(P), -98.1 * Math.sin(1.3))).toBe(true);
  });

  it("x'' = -x + x'/x' keeps y / y: the reduced field is undefined on y = 0 and equals 1 - x elsewhere", () => {
    const { r, F: f } = F("x'' = -x + x'/x'");
    expect(r.reduced.g).toMatch(/y\s*\/\s*y/);
    expect(Number.isNaN(f({ x: 1, y: 0 }))).toBe(true);
    expect(f({ x: 1, y: 0.5 })).toBe(0);
    expect(relClose(f(P), 1 - 1.3)).toBe(true);
  });

  it("x'' = -x^2/x keeps the quotient: undefined at x = 0, -x elsewhere", () => {
    const { r, F: f } = F("x'' = -x^2/x");
    expect(r.reduced.g).toMatch(/x\s*\^\s*2\s*\/\s*x/);
    expect(Number.isNaN(f({ x: 0, y: 1 }))).toBe(true);
    expect(relClose(f(P), -1.3)).toBe(true);
  });

  it("(1/3)*x'' + x = 0 keeps the student's fraction (no folding) and evaluates to -3x", () => {
    const { r, F: f } = F("(1/3)*x'' + x = 0");
    expect(r.reduced.g).toMatch(/1\s*\/\s*3/);
    expect(r.reduced.g).not.toMatch(/0\.333/);
    expect(relClose(f(P), -3.9)).toBe(true);
  });

  it("a literal from the numerical fallback is displayed with at most 12 significant digits while the compiled string keeps full precision", () => {
    // (x''/3)^1: x'' sits under a power, so the coefficient is not extracted symbolically; it is
    // numerically constant (1/3, with rounding) and enters as a literal. F = -3x.
    const { r, F: f } = F("(x''/3)^1 = -x");
    expect(relClose(f(P), -3.9)).toBe(true);
    expect(r.spec.g).not.toBe(r.reduced.g);
    expect(r.spec.g).toMatch(/0\.33333333333333/);
    expect(r.reduced.g).toMatch(/0\.333333333333(?!\d)/);
    expect(relClose(compileScalar(r.reduced.g)(P), -3.9, 1e-11)).toBe(true);
  });

  it("x'' = -x + 0*x' drops the zero term (0 * y -> 0, -x + 0 -> -x)", () => {
    expect(F("x'' = -x + 0*x'").r.reduced.g.replace(/\s/g, "")).toBe("-x");
  });
});
