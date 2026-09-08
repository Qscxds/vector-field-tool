import { describe, expect, it } from "vitest";
import { assertNoLeftHandSide, COMPARISON_HINT, compileScalar, compileSystem, LHS_IN_EXPRESSION_MESSAGE, LHS_IN_SYSTEM_MESSAGE, ParseError } from "./parse";

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

  it("rejects parameter names that mathjs or JavaScript would interpret first", () => {
    for (const name of ["Infinity", "NaN", "toString", "constructor", "__proto__", "hasOwnProperty", "true", "i"]) {
      expect(() => compileScalar(`${name} * x`, { [name]: 2 }), name).toThrow(ParseError);
    }
  });
});

describe("hardening (public endpoint)", () => {
  it("evaluates negative bases with fractional exponents quickly (no fraction.js probing)", () => {
    // mathjs' own pow spends ~35 ms per call on x^1e-13 with x < 0; the JS operator returns NaN at once.
    const f = compileScalar("x^1e-13");
    const t0 = performance.now();
    for (let k = 0; k < 200; k++) f({ x: -1.5, y: 0 });
    expect(performance.now() - t0).toBeLessThan(50);
    expect(f({ x: -1.5, y: 0 })).toBeNaN();
    expect(compileScalar("x^0.3333333333333")({ x: -8, y: 0 })).toBeNaN();
    // ordinary powers are unchanged
    expect(compileScalar("x^2")({ x: -3, y: 0 })).toBe(9);
    expect(compileScalar("x^0.5")({ x: 4, y: 0 })).toBe(2);
    expect(compileScalar("pow(x, 3)")({ x: 2, y: 0 })).toBe(8);
    expect(compileScalar("2^x")({ x: 10, y: 0 })).toBe(1024);
  });

  it("turns pathological nesting into a ParseError, never a RangeError", () => {
    expect(() => compileScalar("x+".repeat(2600) + "x")).toThrow(ParseError);
    expect(() => compileScalar("-".repeat(6000) + "x")).toThrow(ParseError);
    expect(() => compileScalar("(".repeat(3000) + "x" + ")".repeat(3000))).toThrow(ParseError);
    expect(() => compileScalar("x".padEnd(501, " "))).toThrow(/too long/);
  });

  it("checks function arity", () => {
    for (const expr of ["sin()", "atan2(x)", "abs(x, y)", "sqrt(x, y)", "pow(x)", "pow(x, y, t)", "min()", "max()", "round(x, y, t)"]) {
      expect(() => compileScalar(expr), expr).toThrow(/argument/);
    }
    expect(compileScalar("min(x, y, t)")({ x: 3, y: 1 }, 2)).toBe(1);
    expect(compileScalar("log(x, 2)")({ x: 8, y: 0 })).toBeCloseTo(3, 12);
    expect(compileScalar("round(x, 1)")({ x: 2.34, y: 0 })).toBeCloseTo(2.3, 12);
  });

  it("compares to machine precision (no 1e-12 dead band)", () => {
    // mathjs' default relTol is 1e-12; ours is 1e-15, so 1 - 1e-13 is honestly below 1.
    expect(compileScalar("x < 1")({ x: 1 - 1e-13, y: 0 })).toBe(1);
    expect(compileScalar("x >= 1")({ x: 1 - 1e-13, y: 0 })).toBe(0);
    expect(compileScalar("x == 0")({ x: 1e-15, y: 0 })).toBe(0);
    expect(compileScalar("x == 0")({ x: 0, y: 0 })).toBe(1);
  });

  it("rejects non-finite literals and chained comparisons", () => {
    for (const expr of ["Infinity", "NaN", "1e999", "0 < x < 1"]) {
      expect(() => compileScalar(expr), expr).toThrow(ParseError);
    }
    // "50%" is parsed by mathjs as 50/100, plain arithmetic, and stays allowed.
    expect(compileScalar("50%")({ x: 0, y: 0 })).toBe(0.5);
  });

  it("hints when a parameter or variable is called like a function", () => {
    expect(() => compileScalar("a(x+1)", { a: 2 })).toThrow(/a\*\(\.\.\.\)/);
    expect(() => compileScalar("x(x+1)")).toThrow(/x\*\(\.\.\.\)/);
  });
});

describe('first-order variable mode { variables: "ty" }', () => {
  const ty = (expr: string, params?: Record<string, number>) => compileScalar(expr, params, { variables: "ty" });
  const codeOf = (fn: () => unknown): { code?: string; message: string } => {
    try {
      fn();
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
      return { code: (error as ParseError).code, message: (error as ParseError).message };
    }
    throw new Error("expected a ParseError");
  };

  it("binds t to the horizontal coordinate p.x and ignores the time argument", () => {
    const f = ty("t*y");
    expect(f({ x: 2, y: 3 })).toBe(6);
    expect(f({ x: 2, y: 3 }, 99)).toBe(6);
    expect(ty("t")({ x: 5, y: 0 }, 7)).toBe(5);
  });

  it("leaves the default xy mode unchanged: t is still the time there", () => {
    expect(compileScalar("t")({ x: 5, y: 0 }, 3)).toBe(3);
    expect(compileScalar("t", undefined, { variables: "xy" })({ x: 5, y: 0 }, 3)).toBe(3);
    expect(compileScalar("x*y")({ x: 2, y: 3 })).toBe(6);
  });

  it('rejects the symbol x with code "x_in_first_order" and a readable hint', () => {
    for (const expr of ["x", "x + y", "sin(x)", "x*y", "2x", "x(t+1)", "xy", "xt"]) {
      const e = codeOf(() => ty(expr));
      expect(e.code, expr).toBe("x_in_first_order");
      expect(e.message, expr).toContain("write t instead of x");
      expect(e.message, expr).toBe("In a first-order equation the independent variable is t (dy/dt = g(t, y)); write t instead of x.");
    }
  });

  it("accepts function names that contain the letter x", () => {
    expect(ty("exp(t)")({ x: 0, y: 0 })).toBe(1);
    expect(ty("max(t, y)")({ x: 2, y: 5 })).toBe(5);
    expect(ty("atan2(y, t)")({ x: 1, y: 1 })).toBeCloseTo(Math.PI / 4, 12);
  });

  it("lists t, y as the allowed symbols and hints at t*y, never at x*y", () => {
    const e = codeOf(() => ty("ty"));
    expect(e.code).toBeUndefined();
    expect(e.message).toMatch(/t\*y/);
    expect(e.message).toContain("Allowed symbols: t, y, pi, e.");
    expect(codeOf(() => ty("ty", { k: 1 })).message).toContain("Allowed symbols: t, y, pi, e, k.");
    expect(codeOf(() => ty("xy")).message).not.toMatch(/x\*y/);
    expect(codeOf(() => ty("a + b")).message).toContain('Unknown symbol "a"');
    // xy mode keeps its own list
    expect(codeOf(() => compileScalar("a")).message).toContain("Allowed symbols: x, y, t, pi, e.");
  });

  it("still reserves x, y and t as parameter names", () => {
    expect(() => ty("y", { x: 1 })).toThrow(/reserved/);
    expect(() => ty("y", { t: 1 })).toThrow(/reserved/);
    expect(() => ty("y", { y: 1 })).toThrow(/reserved/);
    expect(ty("k*t", { k: 3 })({ x: 2, y: 0 })).toBe(6);
  });

  it("words the assignment and chained-comparison messages in t and y", () => {
    expect(codeOf(() => ty("f(a) = a")).message).toContain("in t and y only");
    expect(codeOf(() => compileScalar("f(a) = a")).message).toContain("in x and y only");
    expect(codeOf(() => ty("0 < t < 1")).message).toContain("0 < t < 1");
  });

  it("compileSystem forwards the mode: the reduced system x' = 1, y' = t*y", () => {
    const sys = compileSystem({ f: "1", g: "t*y", variables: "ty" });
    expect(sys.eval({ x: 2, y: 3 })).toEqual({ x: 1, y: 6 });
    expect(compileSystem({ f: "1", g: "t", variables: "ty" }).eval({ x: 2, y: 0 }, 99)).toEqual({ x: 1, y: 2 });
    expect(() => compileSystem({ f: "1", g: "x*y", variables: "ty" })).toThrow(/write t instead of x/);
    // without the field the system is an ordinary xy system and t is the time
    expect(compileSystem({ f: "1", g: "t" }).eval({ x: 2, y: 0 }, 99)).toEqual({ x: 1, y: 99 });
  });

  it("an ordinary ParseError carries no code", () => {
    expect(codeOf(() => compileScalar("a + b")).code).toBeUndefined();
    expect(codeOf(() => ty("(t + y")).code).toBeUndefined();
  });
});

describe("a left-hand side in the expression", () => {
  const LHS = 'Enter only the right-hand side of the equation; the "dy/dt =" part is implied.';
  const LHS_SYSTEM = 'Enter only the right-hand side of the equation; the "x\' =" / "y\' =" part is implied.';
  const T_SENTENCE = "In a first-order equation the independent variable is t (dy/dt = g(t, y)); write t instead of x.";
  const check = (expr: string, opts?: { variables: "xy" | "ty" }) => {
    try {
      compileScalar(expr, undefined, opts);
    } catch (error) {
      expect(error, expr).toBeInstanceOf(ParseError);
      return error as ParseError;
    }
    throw new Error(`expected a ParseError for ${JSON.stringify(expr)}`);
  };

  it("exports the two mode-specific messages", () => {
    expect(LHS_IN_EXPRESSION_MESSAGE).toBe(LHS);
    expect(LHS_IN_SYSTEM_MESSAGE).toBe(LHS_SYSTEM);
    expect(LHS_IN_SYSTEM_MESSAGE).not.toMatch(/dy\/dt|instead of x/);
  });

  it('is reported with code "lhs_in_expression" and the mode\'s own wording', () => {
    for (const expr of ["dy/dt = t", "dy / dt = y", "y' = t", "y′ = t", "y = t", "x' = y", "  y' = y  ", "y=y", "y = 2", "x = y"]) {
      // planar system (the default): x is a state variable, so the message names x' = / y' = and never t
      for (const opts of [undefined, { variables: "xy" as const }]) {
        const e = check(expr, opts);
        expect(e.code, expr).toBe("lhs_in_expression");
        expect(e.message, expr).toBe(LHS_SYSTEM);
        expect(e.expr, expr).toBe(expr);
      }
      // first-order: dy/dt =, and none of these pasted sides mentions x as a variable
      const e = check(expr, { variables: "ty" });
      expect(e.code, expr).toBe("lhs_in_expression");
      expect(e.message, expr).toBe(LHS);
    }
  });

  it("dy/dx = ... gets the t-instead-of-x sentence in first-order mode only", () => {
    const ty = check("dy/dx = y", { variables: "ty" });
    expect(ty.code).toBe("lhs_in_expression");
    expect(ty.message).toBe(`${LHS} ${T_SENTENCE}`);
    expect(check("dy/dx = x", { variables: "ty" }).message).toBe(`${LHS} ${T_SENTENCE}`);
    expect(check("dy/dt = y", { variables: "ty" }).message).not.toContain("write t instead of x");
    // planar: dy/dx is not a first-order slip, and x is legitimately a variable
    for (const opts of [undefined, { variables: "xy" as const }]) {
      const xy = check("dy/dx = y", opts);
      expect(xy.code).toBe("lhs_in_expression");
      expect(xy.message).toBe(LHS_SYSTEM);
      expect(xy.message).not.toContain("instead of x");
    }
  });

  it("x' = y in a planar system is a left-hand side with the x'/y' wording and no t sentence", () => {
    const e = check("x' = y", { variables: "xy" });
    expect(e.code).toBe("lhs_in_expression");
    expect(e.message).toBe(LHS_SYSTEM);
    expect(e.message).not.toContain("instead of x");
  });

  it('a bare "y =" followed by a "?" is a comparison typo, not a left-hand side, and gets the == hint', () => {
    for (const opts of [{ variables: "ty" as const }, { variables: "xy" as const }, undefined]) {
      const e = check("y = 0 ? 1 : -1", opts);
      expect(e.code, JSON.stringify(opts)).not.toBe("lhs_in_expression");
      expect(e.code).toBeUndefined();
      expect(e.message).toContain("write ==");
      expect(e.message).toContain(COMPARISON_HINT);
      expect(e.message).toMatch(/Assignments are not allowed/);
    }
    // the prime forms are left-hand sides whatever follows
    expect(check("y' = 0 ? 1 : -1", { variables: "ty" }).code).toBe("lhs_in_expression");
    expect(check("dy/dt = y > 0 ? 1 : -1", { variables: "ty" }).code).toBe("lhs_in_expression");
    // and a bare "y =" with nothing conditional after it still is one
    expect(check("y = 2", { variables: "ty" }).code).toBe("lhs_in_expression");
    expect(check("y = 2", { variables: "ty" }).message).not.toContain("write ==");
  });

  it("a lone = that mathjs cannot parse also gets the == hint; == <= >= != do not", () => {
    const e = check("2 = y", { variables: "ty" });
    expect(e.code).toBeUndefined();
    expect(e.message).toMatch(/^Could not parse expression/);
    expect(e.message).toContain(COMPARISON_HINT);
    // a syntax error without any "=" gets no hint
    expect(check("(t + y", { variables: "ty" }).message).not.toContain("write ==");
    // "==" inside an otherwise broken expression is not a lone "="
    expect(check("(y == 0", { variables: "ty" }).message).not.toContain("write ==");
    expect(check("(y <= 0", { variables: "ty" }).message).not.toContain("write ==");
    expect(check("(y >= 0", { variables: "ty" }).message).not.toContain("write ==");
    expect(check("(y != 0", { variables: "ty" }).message).not.toContain("write ==");
  });

  it("legitimate comparisons, conditionals and expressions are still accepted", () => {
    const ty = { variables: "ty" as const };
    expect(compileScalar("y == 0 ? 1 : 0", undefined, ty)({ x: 0, y: 0 })).toBe(1);
    expect(compileScalar("y == 0 ? 1 : 0", undefined, ty)({ x: 0, y: 3 })).toBe(0);
    expect(compileScalar("y >= 0 ? 1 : -1", undefined, ty)({ x: 0, y: -2 })).toBe(-1);
    expect(compileScalar("y - 1", undefined, ty)({ x: 0, y: 4 })).toBe(3);
    expect(compileScalar("y*(1-y)", undefined, ty)({ x: 0, y: 0.5 })).toBe(0.25);
    expect(compileScalar("y == 0")({ x: 0, y: 0 })).toBe(1);
    expect(compileScalar("y >= 1")({ x: 0, y: 2 })).toBe(1);
    expect(compileScalar("y == 0 ? 1 : 2", undefined, ty)({ x: 0, y: 3 })).toBe(2);
    expect(compileScalar("y")({ x: 0, y: 4 })).toBe(4);
    expect(compileScalar("x == 0 ? 1 : -1")({ x: 0, y: 0 })).toBe(1);
  });

  it("assertNoLeftHandSide reports the raw text in the mode's wording and is silent otherwise", () => {
    const thrown = (expr: string, mode: "xy" | "ty") => {
      try {
        assertNoLeftHandSide(expr, mode);
      } catch (error) {
        expect(error).toBeInstanceOf(ParseError);
        return error as ParseError;
      }
      return null;
    };
    expect(thrown("dy/dt = y", "ty")).toMatchObject({ code: "lhs_in_expression", expr: "dy/dt = y", message: LHS });
    expect(thrown("dy/dx = y", "ty")).toMatchObject({ code: "lhs_in_expression", expr: "dy/dx = y", message: `${LHS} ${T_SENTENCE}` });
    expect(thrown("x' = y", "xy")).toMatchObject({ code: "lhs_in_expression", expr: "x' = y", message: LHS_SYSTEM });
    expect(thrown("dy/dx = y", "xy")).toMatchObject({ code: "lhs_in_expression", message: LHS_SYSTEM });
    expect(thrown("  y = t  ", "ty")?.expr).toBe("  y = t  ");
    for (const expr of ["y = 0 ? 1 : -1", "y == 0 ? 1 : 0", "y*(1-y)", "", "   ", "-(dy/dt = y)"]) {
      expect(thrown(expr, "ty"), expr).toBeNull();
      expect(thrown(expr, "xy"), expr).toBeNull();
    }
  });
});
