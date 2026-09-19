import { describe, expect, it } from "vitest";
import { compileScalar, compileSystem, parameterNameProblem, ParseError, type ParseErrorCode } from "./parse";
import {
  DOUBLE_EQUALS_MESSAGE,
  freeSymbolsSecondOrder,
  HIGHER_DERIVATIVE_MESSAGE,
  NOT_LINEAR_IN_XDD_MESSAGE,
  normalizePrimes,
  OTHER_PRIME_MESSAGE,
  reduceSecondOrder,
  SAMPLE_POINTS,
  straightenPrimes,
  TOO_MANY_EQUALS_MESSAGE,
  UNDEFINED_AT_SAMPLES_MESSAGE,
  V_PARAMETER_MESSAGE,
  XDD_COEFFICIENT_VANISHES_MESSAGE,
  XDD_WITHOUT_EQUALS_MESSAGE,
  XDD_PROBES,
  Y_IN_SECOND_ORDER_MESSAGE,
  implicitProductHint,
} from "./second-order";
import { PROBE_TIMES } from "./time-dependence";
import type { Box, Vec2 } from "./types";

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

  it("[P1] maps the alias v to the x' placeholder, only as a whole symbol: exp(v), 2*v, but not vx or the letters of a name", () => {
    expect(normalizePrimes("x'' + v")).toBe("xdd + xd");
    expect(normalizePrimes("exp(v) - 2*v")).toBe("exp(xd) - 2*xd");
    expect(normalizePrimes("vx + v_1 + 1v")).toBe("vx + v_1 + 1v");
    // v followed by a prime is not silently x'': the caller's prime check sees the apostrophe.
    expect(normalizePrimes("v'")).toBe("xd'");
    // x followed by anything but a prime is untouched.
    expect(normalizePrimes("exp(x) + max(x, 1) + x^2 + x*(t)")).toBe("exp(x) + max(x, 1) + x^2 + x*(t)");
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
  it("x'' + x = 0 reduces to the kernel system x' = y, y' = -x, shown as let v = x': x' = v, v' = -x (F(1.3, 0.7) = -1.3, a clean string)", () => {
    const { r, F: f } = F("x'' + x = 0");
    expect(r.reduced.f).toBe("v");
    expect(r.spec.f).toBe("y");
    // No x' in F: the compiled string and the displayed one coincide.
    expect(r.spec.g).toBe(r.reduced.g);
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

  it("a bare right-hand side is x'' = F; the kernel's g writes x' as y, the shown g writes it as v, nothing else changes", () => {
    const { r, F: f } = F("-sin(x) - 0.2*x'");
    expect(r.equation).toBe("x'' = -sin(x) - 0.2*x'");
    expect(relClose(f(P), -Math.sin(1.3) - 0.14)).toBe(true);
    expect(r.spec.g.replace(/\s/g, "")).toBe("-sin(x)-0.2*y");
    expect(r.reduced.g.replace(/\s/g, "")).toBe("-sin(x)-0.2*v");
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

  it("[P1] y has no meaning in a second-order equation: x'' = y, x'' + y = 0, x'' = -x + y' and y'' = -y get the y sentence and its code", () => {
    for (const input of ["x'' = y", "x'' + y = 0", "x'' = -x + y'", "y'' + y = 0", "x'' = exp(y)"]) {
      const e = failure(input);
      expect(e.message, input).toBe(Y_IN_SECOND_ORDER_MESSAGE);
      expect(e.message, input).toMatch(/t \(the independent variable\), x and x'/);
      expect(e.message, input).toMatch(/y has no meaning/);
      expect(e.code, input).toBe("second_order_y_symbol");
      expect(e.expr, input).toBe(input);
    }
    // A longer name that merely contains y is still an unknown symbol, not the y sentence.
    const other = failure("x'' + yy = 0");
    expect(other.code).toBe("second_order_unknown_symbol");
    expect(other.symbol).toBe("yy");
  });

  it("[P1] an unknown symbol other than y names x, x' (dx/dt, also v), x'' and t as the independent variable, with the code and the symbol", () => {
    const e = failure("x'' + z = 0");
    expect(e.message).toMatch(/Unknown symbol "z"/);
    expect(e.message).toMatch(/unknown function is x/);
    expect(e.message).toMatch(/x' \(dx\/dt\)/);
    expect(e.message).toMatch(/t is the independent variable/);
    expect(e.message).toMatch(/Allowed symbols: t, x, x', x''/);
    expect(e.expr).toBe("x'' + z = 0");
    expect(e.code).toBe("second_order_unknown_symbol");
    expect(e.symbol).toBe("z");
  });

  it("[P1] the seven forms of the brief parse, t being the independent variable of F(t, x, x'); values derived by hand", () => {
    // Each case: the input, a kernel point {x, y = x'}, the time, and F(t, x, x') computed by hand.
    const cases: [string, Vec2, number, number][] = [
      ["x'' = -x", { x: 1.3, y: 0.7 }, 0, -1.3],
      ["x'' = -sin(x)", { x: 1.3, y: 0.7 }, 0, -Math.sin(1.3)],
      ["x'' = -x - 0.5*x'", { x: 1, y: 2 }, 0, -2],
      ["x'' = -x + cos(t)", { x: 1, y: 0 }, Math.PI, -2], // forced, non-autonomous: cos(pi) = -1
      ["x'' = -x - x'*abs(x')", { x: 1, y: -2 }, 0, 3], // quadratic damping: -1 - (-2)(2)
      ["x'' = (1 - x^2)*x' - x", { x: 1.3, y: 0.7 }, 0, (1 - 1.69) * 0.7 - 1.3], // Van der Pol
      ["x'' = -x + 0.5*cos(1.2*t)", { x: 0, y: 0 }, 0, 0.5], // beats
    ];
    for (const [input, p, t, expected] of cases) {
      const { r, F: f } = F(input);
      expect(r.equation, input).toBe(input);
      expect(relClose(f(p, t), expected, 1e-14), input).toBe(true);
      // The shown reduction never contains the kernel's y.
      expect(r.reduced.g, input).not.toMatch(/(^|[^A-Za-z0-9_])y(?![A-Za-z0-9_])/);
      expect(r.reduced.f, input).toBe("v");
    }
    // The static rule: F mentions t in exactly the two forced cases (what the shells reduce to the J.3 branch).
    for (const [input] of cases) {
      const mentionsT = /\bt\b/.test(F(input).r.spec.g);
      expect(mentionsT, input).toBe(input.includes("(t)") || input.includes("*t)"));
    }
  });

  it("[P1] v is accepted as the textbook alias of x' on input; the equation and the reduction are shown with x' and v, the kernel keeps y", () => {
    const withPrime = F("x'' = -x - 0.5*x'");
    const withV = F("x'' = -x - 0.5*v");
    expect(withV.r.spec).toEqual(withPrime.r.spec);
    expect(withV.r.equation).toBe("x'' = -x - 0.5*x'");
    expect(withV.r.reduced).toEqual(withPrime.r.reduced);
    expect(withV.r.reduced.g.replace(/\s/g, "")).toBe("-x-0.5*v");
    expect(withV.r.spec.g.replace(/\s/g, "")).toBe("-x-0.5*y");
    expect(relClose(withV.F({ x: 1, y: 2 }), -2)).toBe(true);
    // v inside a function and in a product; a name that merely contains v is not the alias.
    expect(F("x'' = -x - v*abs(v)").r.equation).toBe("x'' = -x - x'*abs(x')");
    expect(relClose(F("x'' = -x - v*abs(v)").F({ x: 1, y: -2 }), 3)).toBe(true);
    expect(F("x'' + 2*v + x = 0").r.spec).toEqual(F("x'' + 2*x' + x = 0").r.spec);
    expect(failure("x'' = -x + vv").code).toBe("second_order_unknown_symbol");
    // v' would be x'': refused by the prime check; a parameter cannot be named v.
    expect(failure("x'' = -x + v'").code).toBe("second_order_other_prime");
    const param = (() => {
      try {
        reduceSecondOrder("x'' = -v*x", { v: 2 });
      } catch (error) {
        return error as ParseError;
      }
      throw new Error("expected a v parameter to be refused");
    })();
    expect(param.message).toBe(V_PARAMETER_MESSAGE);
    expect(param.code).toBe("second_order_v_parameter");
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
    expect(relClose(compileScalar(r.spec.g, { c: 2, k: 3 })(P), -1.4 - 3.9)).toBe(true);
    expect(r.reduced.g.replace(/\s/g, "")).toBe("-(c*v+k*x)");
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
    const e = failure("u'' + u = 0");
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
    expect(e.message).toMatch(/not a symbol of this problem/);
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
      "second_order_undefined_at_samples", "second_order_unknown_symbol", "second_order_implicit_product",
      "second_order_y_symbol",
    ];
    for (const input of ["x''^2 = x", "x' + x = 0", "x'' + x", "x'' == -x", "x'' = -x = 0", "u'' + u = 0", "x''' = 0", "xdd + x = 0", "x'' = sqrt(x - 100)", "x'' + z = 0", "xx'' = 1", "x'' = y", "x'' = -x + y'"]) {
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

  it("Van der Pol x'' - (1 - x^2)*x' + x = 0: F(1.3, 0.7) = (1 - 1.69)*0.7 - 1.3, shown as (1 - x ^ 2) * v - x", () => {
    const { r, F: f } = F("x'' - (1 - x^2)*x' + x = 0");
    expect(relClose(f(P), (1 - 1.69) * 0.7 - 1.3)).toBe(true);
    expect(r.reduced.g.replace(/\s/g, "")).toBe("(1-x^2)*v-x");
    expect(r.spec.g.replace(/\s/g, "")).toBe("(1-x^2)*y-x");
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

  it("x'' = -x + x'/x' keeps the quotient (v / v shown, y / y compiled): the reduced field is undefined on x' = 0 and equals 1 - x elsewhere", () => {
    const { r, F: f } = F("x'' = -x + x'/x'");
    expect(r.reduced.g).toMatch(/v\s*\/\s*v/);
    expect(r.spec.g).toMatch(/y\s*\/\s*y/);
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

describe("[J-fix2] affinity is checked at both signs of x'' (XDD_PROBES)", () => {
  const boxes: Box[] = [
    { x: { min: -2, max: 2 }, y: { min: -2, max: 2 } },
    { x: { min: -1e-3, max: 1e-3 }, y: { min: -1e-3, max: 1e-3 } },
    { x: { min: 50, max: 250 }, y: { min: -7, max: 3 } },
  ];
  const oneSided = ["abs(x'') = x", "sqrt(x''^2) = x", "x''*sign(x'') = x", "round(x'') = x", "(x'' > 0 ? x'' : 0) = x", "max(x'', -1) = x", "x'' = -x + (x'' > -1 ? 0 : 1)"];
  /** The whole equation multiplied by a scale on both sides. */
  const scaledBy = (input: string, scale: string) => {
    const [lhs, rhs] = input.split("=");
    return `${scale}*(${lhs.trim()}) = ${scale}*(${rhs.trim()})`;
  };

  it("the probe values cover both signs, non-integers and a large value, and include 0 and 1", () => {
    expect(XDD_PROBES.some((v) => v < 0)).toBe(true);
    expect(XDD_PROBES.some((v) => v > 5)).toBe(true);
    expect(XDD_PROBES.some((v) => !Number.isInteger(v))).toBe(true);
    expect(XDD_PROBES).toContain(0);
    expect(XDD_PROBES).toContain(1);
  });

  it("abs, sqrt(.^2), sign, round, max and a condition on x'' are refused as not affine, on every box and at two scalings", () => {
    for (const input of oneSided) {
      for (const scaled of [input, scaledBy(input, "1e6"), scaledBy(input, "1e-6")]) {
        expect(failure(scaled).code, scaled).toBe("second_order_not_affine");
        for (const box of boxes) expect(failure(scaled, box).code, `${scaled} on box`).toBe("second_order_not_affine");
      }
    }
  });

  it("a bare conditional on x'' without = is refused as no equation; 1/x'' = x (finite at some x'' only) is not affine", () => {
    expect(failure("x'' > 0 ? x'' : 0").code).toBe("second_order_no_equation");
    expect(failure("1/x'' = x").code).toBe("second_order_not_affine");
  });

  it("the standard equations still reduce with the same values on three boxes (derived: -2, -sin 1, 1, -1/2)", () => {
    const cases: [string, Vec2, number, number][] = [
      ["x'' + 0.5*x' + x = 0", { x: 1, y: 2 }, 0, -2],
      ["x'' = -sin(x)", { x: 1, y: 2 }, 0, -Math.sin(1)],
      ["2*x'' = x'' + x", { x: 1, y: 2 }, 0, 1],
      ["(1 + t^2)*x'' = -x", { x: 1, y: 2 }, 1, -0.5],
    ];
    for (const [input, p, t, expected] of cases) {
      const g = F(input).r.reduced.g;
      for (const box of [undefined, ...boxes]) {
        const { r, F: f } = F(input, undefined, box);
        expect(relClose(f(p, t), expected), `${input} on ${JSON.stringify(box)}`).toBe(true);
        expect(r.reduced.g).toBe(g);
      }
    }
  });
});

describe("[J-fix2] a coefficient of x'' that contains x'", () => {
  const boxes: Box[] = [
    { x: { min: -2, max: 2 }, y: { min: -2, max: 2 } },
    { x: { min: -1e-3, max: 1e-3 }, y: { min: -1e-3, max: 1e-3 } },
    { x: { min: 50, max: 250 }, y: { min: -7, max: 3 } },
  ];

  it("(1 + x'^2)*x'' = -x reduces to g = -x/(1 + y^2), shown as -x/(1 + v^2): g(1, 2) = -1/5", () => {
    const { r, F: f } = F("(1 + x'^2)*x'' = -x");
    expect(relClose(f({ x: 1, y: 2 }), -0.2)).toBe(true);
    expect(r.spec.g.replace(/\s/g, "")).toBe("-x/(1+y^2)");
    expect(r.reduced.g.replace(/\s/g, "")).toBe("-x/(1+v^2)");
    expect(r.reduced.g).not.toMatch(/xd/);
  });

  it("x''/(1 + x'^2)^(3/2) = 1 reduces to g = (1 + y^2)^(3/2): g(1, 2) = 5^1.5", () => {
    const { r, F: f } = F("x''/(1 + x'^2)^(3/2) = 1");
    expect(relClose(f({ x: 1, y: 2 }), Math.pow(5, 1.5))).toBe(true);
    expect(r.reduced.g).not.toMatch(/xd/);
  });

  it("x'*x'' = -x reduces to g = -x/y (undefined on y = 0, kept so; shown as -x/v); (x' > 0 ? 1 : 2)*x'' = -x gives -1 and -1/2", () => {
    const { r, F: f } = F("x'*x'' = -x");
    expect(relClose(f({ x: 1, y: 2 }), -0.5)).toBe(true);
    expect(Number.isFinite(f({ x: 1, y: 0 }))).toBe(false);
    expect(r.spec.g.replace(/\s/g, "")).toBe("-x/y");
    expect(r.reduced.g.replace(/\s/g, "")).toBe("-x/v");
    const { F: h } = F("(x' > 0 ? 1 : 2)*x'' = -x");
    expect(relClose(h({ x: 1, y: 1 }), -1)).toBe(true);
    expect(relClose(h({ x: 1, y: -1 }), -0.5)).toBe(true);
  });

  it("box invariance and scale invariance: the same string and values on three boxes, and the equation times 1e6 / 1e-6 gives the same values", () => {
    const p = { x: 1, y: 2 };
    for (const [input, expected] of [["(1 + x'^2)*x'' = -x", -0.2], ["x''/(1 + x'^2)^(3/2) = 1", Math.pow(5, 1.5)]] as const) {
      const g = F(input).r.reduced.g;
      for (const box of boxes) {
        const { r, F: f } = F(input, undefined, box);
        expect(r.reduced.g).toBe(g);
        expect(relClose(f(p), expected)).toBe(true);
      }
      const [lhs, rhs] = input.split("=");
      for (const scale of ["1e6", "1e-6"]) {
        const { F: f } = F(`${scale}*(${lhs}) = ${scale}*(${rhs})`);
        expect(relClose(f(p), expected), `${scale} x ${input}`).toBe(true);
      }
    }
  });
});

describe("[J-fix2] notation: x(t), implicit products, unicode operators, no placeholder in any message", () => {
  it("x''(t) + x(t) = 0, x''(t) = -x(t) and x''(t) + x'(t) + x(t) = 0 reduce (g = -x, -x, and -3 at (1, 2)); exp(t) is untouched", () => {
    for (const input of ["x''(t) + x(t) = 0", "x''(t) = -x(t)", "x″(t) = −x(t)"]) {
      const { r, F: f } = F(input);
      expect(r.reduced.g.replace(/\s/g, ""), input).toBe("-x");
      expect(f({ x: 1, y: 2 })).toBe(-1);
    }
    expect(F("x''(t) + x(t) = 0").r.equation).toBe("x'' + x = 0");
    expect(F("x''(t) + x'(t) + x(t) = 0").F({ x: 1, y: 2 })).toBe(-3);
    expect(relClose(F("x'' = exp(t)").F({ x: 1, y: 2 }, 1), Math.E)).toBe(true);
  });

  it("xx'', tx'', x''x and x'x'' carry second_order_implicit_product with the student's name and an explicit-product hint", () => {
    const cases: [string, string, string][] = [["xx'' = 1", "xx''", "x*x''"], ["tx'' = -x", "tx''", "t*x''"], ["x''x = 1", "x''x", "x''*x"], ["x'x'' = 1", "x'x''", "x'*x''"]];
    for (const [input, name, hint] of cases) {
      const e = failure(input);
      expect(e.code, input).toBe("second_order_implicit_product");
      expect(e.symbol, input).toBe(name);
      expect(e.message, input).toContain(hint);
      expect(e.expr, input).toBe(input);
    }
    expect(implicitProductHint("kxd")).toBe("k*x'");
  });

  it("unicode minus, ×, · and ÷ are normalized: g = -x, 2 (2×x at x = 1), 2 (x·x' at (1, 2)), 0.5 (x÷2)", () => {
    expect(F("x'' = −x").r.reduced.g.replace(/\s/g, "")).toBe("-x");
    expect(F("x'' = −x").r.equation).toBe("x'' = -x");
    expect(F("x'' = 2×x").F({ x: 1, y: 2 })).toBe(2);
    expect(F("x'' = x·x'").F({ x: 1, y: 2 })).toBe(2);
    expect(F("x'' = x÷2").F({ x: 1, y: 2 })).toBe(0.5);
  });

  it("no refusal message, expr or symbol ever contains the placeholders xd / xdd", () => {
    for (const input of ["xx'' = 1", "x''(t + 1) = 0", "(1 + x'^2)*x'' = -x = 0", "x'' + y = 0", "x''^2 = x", "x'' = sqrt(x - 100)", "x'(x) = 1", "x'' = x'(t+1)"]) {
      const e = failure(input);
      expect(e.message, input).not.toMatch(/xd/);
      expect(e.expr, input).toBe(input);
      if (e.symbol !== undefined) expect(e.symbol, input).not.toMatch(/xd/);
    }
  });
});

describe("[T] symbolic parameters in a second-order equation", () => {
  it("derived: x'' = -k*x with k = 2 gives x'' = -6 at x = 3; the damped oscillator with b = 0.25, w = 1 gives -2 at (x, x') = (1, 2)", () => {
    const hooke = compileSystem(reduceSecondOrder("x'' = -k*x", { k: 2 }).spec);
    expect(hooke.eval({ x: 3, y: 0 })).toEqual({ x: 0, y: -6 });
    // x'' = -(2*b*x' + w^2*x) = -(2*0.25*2 + 1*1) = -2; the first component is x' itself (2)
    const damped = compileSystem(reduceSecondOrder("x'' + 2*b*x' + w^2*x = 0", { b: 0.25, w: 1 }).spec);
    const value = damped.eval({ x: 1, y: 2 });
    expect(value.x).toBe(2);
    expect(value.y).toBeCloseTo(-2, 12);
  });

  it("freeSymbolsSecondOrder: the names on both sides that are not t, x, x', x'', v, pi, e or a called function", () => {
    expect(freeSymbolsSecondOrder("x'' + 2*b*x' + w^2*x = F*cos(g*t)")).toEqual(["b", "w", "F", "g"]);
    expect(freeSymbolsSecondOrder("x'' = -x + F*cos(g*t)")).toEqual(["F", "g"]);
    // a bare right-hand side, the alias v, unicode primes
    expect(freeSymbolsSecondOrder("-k*v - x")).toEqual(["k"]);
    expect(freeSymbolsSecondOrder("x″ + c*x′ + x = 0")).toEqual(["c"]);
    expect(freeSymbolsSecondOrder("x'' = -sin(x)")).toEqual([]);
    // a piecewise right-hand side keeps its comparisons: <= is not an equation sign
    expect(freeSymbolsSecondOrder("x'' = (x <= a ? -x : -k*x)")).toEqual(["a", "k"]);
    // a half-typed equation is null (not "no parameters"), so a caller keeps its rows meanwhile
    expect(freeSymbolsSecondOrder("x'' + 2*b*")).toBeNull();
    expect(freeSymbolsSecondOrder("")).toBeNull();
  });

  it("y is free but reserved, so it can never be offered as a parameter; the reduction still refuses it in its own words", () => {
    expect(freeSymbolsSecondOrder("x'' = -y")).toEqual(["y"]);
    expect(parameterNameProblem("y")).toBe("reserved");
    expect(() => reduceSecondOrder("x'' = -y")).toThrow(/y has no meaning here/);
  });

  it("a missing parameter is an unknown-symbol error that names it (the web shell offers it before compiling)", () => {
    try {
      reduceSecondOrder("x'' + 2*b*x' + x = 0");
      throw new Error("expected a ParseError");
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      expect((e as ParseError).code).toBe("second_order_unknown_symbol");
      expect((e as ParseError).symbol).toBe("b");
    }
  });
});

describe("[Y] a function glued to its argument in a second-order equation", () => {
  it("x'' = -sinx: the unknown-symbol error names the call that was meant (sin(x)), with its code and symbol", () => {
    for (const [eq, call] of [["x'' = -sinx", "sin(x)"], ["x'' + x = cost", "cos(t)"], ["x'' = -sinhx", "sinh(x)"], ["x'' = -sinv - x", "sin(v)"]] as const) {
      try {
        reduceSecondOrder(eq);
        throw new Error(`expected a ParseError for ${eq}`);
      } catch (e) {
        expect(e, eq).toBeInstanceOf(ParseError);
        expect((e as ParseError).code, eq).toBe("second_order_unknown_symbol");
        expect((e as ParseError).message, eq).toContain(`Did you mean "${call}"?`);
      }
    }
    // an ordinary missing parameter gets no such hint
    expect(() => reduceSecondOrder("x'' = -k*x")).not.toThrow(/Did you mean/);
  });

  it("ln in a second-order equation: x'' = -ln(1 + x^2) reduces and evaluates (derived: -ln 2 at x = 1)", () => {
    const sys = compileSystem(reduceSecondOrder("x'' = -ln(1 + x^2)").spec);
    expect(sys.eval({ x: 1, y: 0.5 }).x).toBe(0.5);
    expect(sys.eval({ x: 1, y: 0.5 }).y).toBeCloseTo(-Math.LN2, 14);
  });
});
