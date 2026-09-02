import { describe, expect, it } from "vitest";
import { ParseError, compileScalar, compileSystem } from "./parse";

const near = (a: number, b: number, eps = 1e-12) => Math.abs(a - b) <= eps;

describe("compileSystem", () => {
  it("evaluates a linear system", () => {
    const sys = compileSystem({ f: "y", g: "-x" });
    expect(sys.eval({ x: 1, y: 2 })).toEqual({ x: 2, y: -1 });
    expect(sys.spec.f).toBe("y");
  });

  it("uses named parameters", () => {
    const sys = compileSystem({ f: "a*x", g: "b*y", params: { a: 2, b: 3 } });
    expect(sys.eval({ x: 1, y: 1 })).toEqual({ x: 2, y: 3 });
  });

  it("passes time through and defaults it to 0", () => {
    const sys = compileSystem({ f: "t*x", g: "1" });
    expect(sys.eval({ x: 2, y: 0 }, 3).x).toBe(6);
    expect(sys.eval({ x: 2, y: 0 }).x).toBe(0);
  });
});

describe("compileScalar", () => {
  it("supports implicit multiplication and the constants pi and e", () => {
    const f = compileScalar("2x + pi - e");
    expect(near(f({ x: 1, y: 0 }), 2 + Math.PI - Math.E)).toBe(true);
  });

  it("returns NaN or Infinity instead of throwing", () => {
    expect(compileScalar("1/x")({ x: 0, y: 0 })).toBe(Infinity);
    expect(compileScalar("-1/x")({ x: 0, y: 0 })).toBe(-Infinity);
    expect(compileScalar("sqrt(x)")({ x: -1, y: 0 })).toBeNaN();
    expect(compileScalar("log(x)")({ x: -1, y: 0 })).toBeNaN();
    expect(compileScalar("log(x)")({ x: 0, y: 0 })).toBe(-Infinity);
    expect(compileScalar("0/0")({ x: 0, y: 0 })).toBeNaN();
  });

  it("evaluates every whitelisted function", () => {
    const at = (expr: string, x: number, y = 0) => compileScalar(expr)({ x, y });
    expect(near(at("sin(x)^2 + cos(x)^2", 0.7), 1)).toBe(true);
    expect(near(at("tan(x)", Math.PI / 4), 1)).toBe(true);
    expect(near(at("asin(x) + acos(x)", 0.3), Math.PI / 2)).toBe(true);
    expect(near(at("atan(x)", 1), Math.PI / 4)).toBe(true);
    expect(near(at("atan2(y, x)", 1, 1), Math.PI / 4)).toBe(true);
    expect(near(at("cosh(x)^2 - sinh(x)^2", 0.9), 1)).toBe(true);
    expect(at("tanh(x)", 0)).toBe(0);
    expect(near(at("exp(log(x))", 5), 5)).toBe(true);
    expect(near(at("log10(x)", 1000), 3)).toBe(true);
    expect(at("sqrt(x)", 9)).toBe(3);
    expect(at("abs(x)", -3)).toBe(3);
    expect(at("sign(x)", -2)).toBe(-1);
    expect(at("pow(x, 3)", 2)).toBe(8);
    expect(at("min(x, y)", 2, 5)).toBe(2);
    expect(at("max(x, y)", 2, 5)).toBe(5);
    expect(at("floor(x)", 2.7)).toBe(2);
    expect(at("ceil(x)", 2.2)).toBe(3);
    expect(at("round(x)", 2.5)).toBe(3);
  });

  it("supports comparisons and conditionals (piecewise right-hand sides)", () => {
    const f = compileScalar("x > 0 ? 1 : -1");
    expect(f({ x: 2, y: 0 })).toBe(1);
    expect(f({ x: -2, y: 0 })).toBe(-1);
    expect(compileScalar("(x >= 0) + 1")({ x: 1, y: 0 })).toBe(2);
  });
});

describe("rejections", () => {
  const rejected = [
    "x := 5",
    "f(a) = a",
    "process.exit()",
    "constructor",
    "__proto__",
    "while(1){}",
    "",
    "   ",
    "(x + y",
    "x.y",
    "[x, y]",
    "x!",
    "derivative(x^2, x)",
    'import("x")',
    '"abc" + x',
    "x = 1; y",
    "1:3",
    "x mod 2",
    "x and y",
  ];

  for (const expr of rejected) {
    it(`rejects ${JSON.stringify(expr)}`, () => {
      expect(() => compileScalar(expr)).toThrow(ParseError);
    });
  }

  it("names the unknown symbol", () => {
    expect(() => compileScalar("a + b")).toThrow(/"a"/);
  });

  it("hints at explicit multiplication for xy", () => {
    expect(() => compileScalar("xy")).toThrow(/x\*y/);
  });

  it("names a forbidden function", () => {
    expect(() => compileScalar("derivative(x, x)")).toThrow(/derivative/);
  });

  it("carries the offending expression on the error", () => {
    try {
      compileScalar("a + b");
      throw new Error("expected a ParseError");
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
      expect((error as ParseError).expr).toBe("a + b");
    }
  });

  it("rejects reserved, malformed or non-finite parameters", () => {
    expect(() => compileScalar("x", { x: 1 })).toThrow(ParseError);
    expect(() => compileScalar("x", { pi: 1 })).toThrow(ParseError);
    expect(() => compileScalar("x", { sin: 1 })).toThrow(ParseError);
    expect(() => compileScalar("x", { "1a": 1 })).toThrow(ParseError);
    expect(() => compileScalar("x", { a: NaN })).toThrow(ParseError);
  });

  it("does not let a parameter shadow a variable but allows underscores", () => {
    expect(compileScalar("k_1 * x", { k_1: 4 })({ x: 2, y: 0 })).toBe(8);
  });
});
