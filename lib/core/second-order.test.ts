import { describe, expect, it } from "vitest";
import { compileScalar, ParseError } from "./parse";
import {
  DOUBLE_EQUALS_MESSAGE,
  NOT_LINEAR_IN_XDD_MESSAGE,
  normalizePrimes,
  OTHER_PRIME_MESSAGE,
  reduceSecondOrder,
  SAMPLE_POINTS,
  XDD_COEFFICIENT_VANISHES_MESSAGE,
  XDD_WITHOUT_EQUALS_MESSAGE,
} from "./second-order";

const P = { x: 1.3, y: 0.7 };
/** |a - b| relative to the larger magnitude (never to an absolute 1). */
const relClose = (a: number, b: number, tol = 1e-12) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b));

function F(input: string, params?: Record<string, number>) {
  const r = reduceSecondOrder(input, params);
  return { r, F: compileScalar(r.reduced.g, params) };
}

describe("normalizePrimes", () => {
  it("turns every prime notation into the placeholders, double primes first", () => {
    expect(normalizePrimes("x'' + x' + x")).toBe("xdd + xd + x");
    expect(normalizePrimes("x″ + x′")).toBe("xdd + xd");
    expect(normalizePrimes('x" + 1')).toBe("xdd + 1");
    expect(normalizePrimes("  x '' ")).toBe("xdd");
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

  it("x'' = -sin(x): F(1.3, 0.7) = -sin(1.3)", () => {
    const { r, F: f } = F("x'' = -sin(x)");
    expect(r.equation).toBe("x'' = -sin(x)");
    expect(relClose(f(P), -Math.sin(1.3))).toBe(true);
  });

  it("a bare right-hand side is x'' = F", () => {
    const { r, F: f } = F("-sin(x) - 0.2*x'");
    expect(r.equation).toBe("x'' = -sin(x) - 0.2*x'");
    expect(relClose(f(P), -Math.sin(1.3) - 0.14)).toBe(true);
  });

  it("2*x'' + x = 0: F = -x/2 numerically", () => {
    const { F: f } = F("2*x'' + x = 0");
    expect(relClose(f(P), -0.65)).toBe(true);
    expect(relClose(f({ x: -2.2, y: 3 }), 1.1)).toBe(true);
  });

  it("(1 + x^2)*x'' = -x: the coefficient varies, F(x, y) = -x/(1 + x^2) numerically", () => {
    const { F: f } = F("(1 + x^2)*x'' = -x");
    expect(relClose(f(P), -1.3 / 2.69)).toBe(true);
    for (const p of [{ x: 0.3, y: -1 }, { x: -1.9, y: 0.2 }, { x: 2.1, y: 2.1 }]) {
      expect(relClose(f(p), -p.x / (1 + p.x * p.x))).toBe(true);
    }
  });

  it("x''^2 = x and sin(x'') = 0 are refused with the linearity message", () => {
    for (const input of ["x''^2 = x", "sin(x'') = 0", "x''*x'' + x = 0", "exp(x'') = x"]) {
      expect(() => reduceSecondOrder(input), input).toThrow(ParseError);
      expect(() => reduceSecondOrder(input), input).toThrow(NOT_LINEAR_IN_XDD_MESSAGE);
    }
  });

  it("x'' + y = 0 names y as unknown and says the unknown is x with x' its derivative", () => {
    let caught: unknown;
    try {
      reduceSecondOrder("x'' + y = 0");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ParseError);
    const message = (caught as ParseError).message;
    expect(message).toMatch(/Unknown symbol "y"/);
    expect(message).toMatch(/unknown function is x/);
    expect(message).toMatch(/x' \(dx\/dt\)/);
    expect((caught as ParseError).expr).toBe("x'' + y = 0");
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

  it("x'' without = is refused with the two accepted forms", () => {
    expect(() => reduceSecondOrder("x'' + x")).toThrow(XDD_WITHOUT_EQUALS_MESSAGE);
  });

  it("== and a second = are refused", () => {
    expect(() => reduceSecondOrder("x'' == -x")).toThrow(DOUBLE_EQUALS_MESSAGE);
    expect(() => reduceSecondOrder("x'' = -x = 0")).toThrow(ParseError);
  });

  it("primes on anything but x are refused with the notation sentence", () => {
    expect(() => reduceSecondOrder("y'' + y = 0")).toThrow(OTHER_PRIME_MESSAGE);
  });

  it("an equation without x'' (x' + x = 0) has a vanishing x'' coefficient", () => {
    expect(() => reduceSecondOrder("x' + x = 0")).toThrow(XDD_COEFFICIENT_VANISHES_MESSAGE);
    expect(() => reduceSecondOrder("0*x'' + x = 0")).toThrow(XDD_COEFFICIENT_VANISHES_MESSAGE);
  });

  it("the placeholders xd and xdd are rejected in every ordinary mode", () => {
    expect(() => compileScalar("xd + x")).toThrow(ParseError);
    expect(() => compileScalar("xdd")).toThrow(ParseError);
    expect(() => compileScalar("xd + y", undefined, { variables: "ty" })).toThrow(ParseError);
    expect(() => reduceSecondOrder("xdd + x = 0")).toThrow(/internal names/);
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

  it("Van der Pol x'' - (1 - x^2)*x' + x = 0: F(1.3, 0.7) = (1 - 1.69)*0.7 - 1.3", () => {
    const { F: f } = F("x'' - (1 - x^2)*x' + x = 0");
    expect(relClose(f(P), (1 - 1.69) * 0.7 - 1.3)).toBe(true);
  });
});
