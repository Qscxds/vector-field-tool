/**
 * Power-series engine (round 12). Every expectation below is derived by hand from the recurrence
 * written in the comment next to it, never read off the code.
 */
import { describe, expect, it } from "vitest";
import { linearEquation, type SeriesMode } from "./equation";
import { coefficientValues, partialSum, polynomialOde, powerSeries, type SeriesAtSingularPoint, type SeriesSolution } from "./power-series";
import { rationalDecimal } from "./notation";
import { fromNumber, isqrt, q, type Q, toNumber } from "./rational";

const Z = q(0);

function solve(mode: SeriesMode, text: string, center: Q = Z, params?: Record<string, number>): SeriesSolution {
  const eq = linearEquation(mode, text, params);
  if (!eq.ok) throw new Error(JSON.stringify(eq.failure));
  const ode = polynomialOde(eq.equation);
  if (!ode.ok) throw new Error(JSON.stringify(ode.reason));
  const result = powerSeries(ode.ode, center);
  if (result.status !== "ok") throw new Error("singular");
  return result;
}
function singularAt(mode: SeriesMode, text: string, center: Q = Z): SeriesAtSingularPoint {
  const eq = linearEquation(mode, text);
  if (!eq.ok) throw new Error(JSON.stringify(eq.failure));
  const ode = polynomialOde(eq.equation);
  if (!ode.ok) throw new Error(JSON.stringify(ode.reason));
  const result = powerSeries(ode.ode, center);
  if (result.status !== "singular") throw new Error("ordinary");
  return result;
}
/** "n/d" text of each component of a_k: [coef of a0, (coef of a1), constant]. */
function vec(sol: SeriesSolution, k: number): string[] {
  return sol.coefficients[k].map((v) => (v.d === BigInt(1) ? `${v.n}` : `${v.n}/${v.d}`));
}
function polyText(p: readonly Q[]): string[] {
  return p.map((v) => (v.d === BigInt(1) ? `${v.n}` : `${v.n}/${v.d}`));
}

describe("ordinary points: coefficients from the recurrence", () => {
  it("Airy x'' - t x = 0: a_{n+2} = a_{n-1}/((n+2)(n+1)) for n >= 1, and 2 a_2 = 0", () => {
    const s = solve("second", "x'' - t*x = 0");
    expect(s.recurrence.from).toBe(1);
    expect(polyText(s.recurrence.denominator)).toEqual(["2", "3", "1"]); // (n+2)(n+1) = n^2 + 3n + 2
    expect(s.recurrence.numerators.map((x) => [x.delta, polyText(x.poly)])).toEqual([[-1, ["1"]]]);
    expect(s.low).toHaveLength(1);
    expect(s.low[0].parts).toEqual([{ delta: 2, value: q(2) }]);
    expect(vec(s, 2)).toEqual(["0", "0", "0"]);
    expect(vec(s, 3)).toEqual(["1/6", "0", "0"]); // a3 = a0 / (3*2)
    expect(vec(s, 4)).toEqual(["0", "1/12", "0"]); // a4 = a1 / (4*3)
    expect(vec(s, 5)).toEqual(["0", "0", "0"]); // a5 = a2 / 20 = 0
    expect(vec(s, 6)).toEqual(["1/180", "0", "0"]); // a6 = a3 / 30
    expect(vec(s, 7)).toEqual(["0", "1/504", "0"]); // a7 = a4 / 42
    expect(s.radius.kind).toBe("infinite");
    expect(s.basis.map((b) => b.degree)).toEqual([null, null]);
    expect(s.particular).toBeNull();
  });

  it("x'' + x = 0: a_{n+2} = -a_n/((n+2)(n+1)) gives cos and sin", () => {
    const s = solve("second", "x'' + x = 0");
    expect(s.recurrence.from).toBe(0);
    expect(s.low).toHaveLength(0);
    expect(vec(s, 2)).toEqual(["-1/2", "0", "0"]);
    expect(vec(s, 3)).toEqual(["0", "-1/6", "0"]);
    expect(vec(s, 4)).toEqual(["1/24", "0", "0"]);
    expect(vec(s, 5)).toEqual(["0", "1/120", "0"]);
    expect(s.recurrence.ratio && polyText(s.recurrence.ratio.num)).toEqual(["-1"]);
  });

  it("Legendre l = 2: (1-t^2)x'' - 2t x' + 6x = 0, x1 = 1 - 3t^2 is a proven polynomial", () => {
    const s = solve("second", "(1-t^2)*x'' - 2*t*x' + 6*x = 0");
    // n = 0: 2a2 + 6a0 = 0; n = 1: 6a3 - 2a1 + 6a1 = 0 ; n >= 2: (n+2)(n+1)a_{n+2} = (n-2)(n+3) a_n
    expect(s.recurrence.from).toBe(2);
    expect(s.low.map((l) => l.n)).toEqual([0, 1]);
    expect(s.low[0].parts).toEqual([{ delta: 2, value: q(2) }, { delta: 0, value: q(6) }]);
    expect(s.low[1].parts).toEqual([{ delta: 2, value: q(6) }, { delta: 0, value: q(4) }]);
    expect(vec(s, 2)).toEqual(["-3", "0", "0"]);
    expect(vec(s, 3)).toEqual(["0", "-2/3", "0"]);
    expect(vec(s, 4)).toEqual(["0", "0", "0"]);
    expect(vec(s, 5)).toEqual(["0", "-1/5", "0"]); // (1)(6)/(5*4) * (-2/3)
    expect(s.recurrence.ratio && polyText(s.recurrence.ratio.num)).toEqual(["-6", "1", "1"]); // n^2 + n - 6
    expect(s.basis[0].degree).toBe(2);
    expect(s.basis[1].degree).toBeNull();
    expect(s.radius.kind).toBe("finite");
    if (s.radius.kind === "finite") {
      expect(s.radius.distance.value).toBe(1);
      expect(s.radius.distance.squared).toEqual(q(1));
    }
  });

  it("a parameter value enters as its decimal: L = 2 gives the same series as 6", () => {
    const s = solve("second", "(1-t^2)*x'' - 2*t*x' + L*(L+1)*x = 0", Z, { L: 2 });
    expect(vec(s, 2)).toEqual(["-3", "0", "0"]);
    expect(s.basis[0].degree).toBe(2);
  });

  it("Hermite x'' - 2t x' + 4x = 0: a_{n+2} = 2(n-2)a_n/((n+2)(n+1)), x1 = 1 - 2t^2", () => {
    const s = solve("second", "x'' - 2*t*x' + 4*x = 0");
    expect(vec(s, 2)).toEqual(["-2", "0", "0"]);
    expect(vec(s, 4)).toEqual(["0", "0", "0"]);
    expect(s.basis[0].degree).toBe(2);
    expect(vec(s, 3)).toEqual(["0", "-1/3", "0"]); // 2(1-2)/(3*2) = -1/3
  });

  it("dy/dt = y: (n+1) a_{n+1} = a_n, a_n = a0/n!", () => {
    const s = solve("first", "y");
    expect(vec(s, 1)).toEqual(["1", "0"]);
    expect(vec(s, 2)).toEqual(["1/2", "0"]);
    expect(vec(s, 3)).toEqual(["1/6", "0"]);
    expect(vec(s, 5)).toEqual(["1/120", "0"]);
  });

  it("dy/dt = 2ty: a1 = 0, a_{n+1} = 2a_{n-1}/(n+1), the series of e^(t^2)", () => {
    const s = solve("first", "2*t*y");
    expect(s.recurrence.from).toBe(1);
    expect(vec(s, 1)).toEqual(["0", "0"]);
    expect(vec(s, 2)).toEqual(["1", "0"]);
    expect(vec(s, 4)).toEqual(["1/2", "0"]);
    expect(vec(s, 6)).toEqual(["1/6", "0"]);
    expect(vec(s, 7)).toEqual(["0", "0"]);
  });

  it("x'' - t x = 1 + t: 2a2 = 1, 6a3 - a0 = 1, then the homogeneous recurrence", () => {
    const s = solve("second", "x'' - t*x = 1 + t");
    expect(s.recurrence.from).toBe(2);
    expect(vec(s, 2)).toEqual(["0", "0", "1/2"]);
    expect(vec(s, 3)).toEqual(["1/6", "0", "1/6"]);
    expect(vec(s, 4)).toEqual(["0", "1/12", "0"]); // a4 = a1/12
    expect(vec(s, 5)).toEqual(["0", "0", "1/40"]); // a5 = a2/20 = 1/40
    expect(s.particular).not.toBeNull();
  });

  it("x'' = 0 terminates at once: every basis solution is a polynomial (1 and t)", () => {
    const s = solve("second", "x'' = 0");
    expect(s.basis.map((b) => b.degree)).toEqual([0, 1]);
  });

  it("dy/dt = 1 - y has the particular part 1 (constant solution) and the basis e^(-t)", () => {
    const s = solve("first", "1 - y");
    // a_{n+1} = (g_n - a_n ... ): y' + y = 1: n=0: a1 + a0 = 1; n>=1: (n+1)a_{n+1} + a_n = 0
    expect(vec(s, 1)).toEqual(["-1", "1"]);
    expect(vec(s, 2)).toEqual(["1/2", "-1/2"]);
    const values = coefficientValues(s, [q(1)]);
    expect(values.slice(0, 4).map(toNumber)).toEqual([1, 0, 0, 0]);
  });

  it("partial sums follow the exact coefficients", () => {
    const s = solve("second", "x'' + x = 0");
    const values = coefficientValues(s, [q(1), q(0)]);
    expect(partialSum(values, 4, Z, 1)).toBeCloseTo(1 - 1 / 2 + 1 / 24, 15);
  });
});

describe("centers and radii", () => {
  it("about t0 = 1/2 the Legendre series converges at least for |t - 1/2| < 1/2", () => {
    const s = solve("second", "(1-t^2)*x'' - 2*t*x' + 6*x = 0", q(1, 2));
    expect(s.radius.kind === "finite" && s.radius.distance.squared).toEqual(q(1, 4));
  });

  it("(1 + t^2) x'' + x = 0: singular points +-i, radius 1 about 0 and sqrt(2) about 1", () => {
    const s0 = solve("second", "(1+t^2)*x'' + x = 0");
    expect(s0.radius.kind === "finite" && s0.radius.distance.squared).toEqual(q(1));
    const s1 = solve("second", "(1+t^2)*x'' + x = 0", q(1));
    expect(s1.radius.kind === "finite" && s1.radius.distance.squared).toEqual(q(2));
  });

  it("a cancelled factor is not a singular point: (t-1) x'' + (t-1) x = 0 converges everywhere", () => {
    const s = solve("second", "(t-1)*x'' + (t-1)*x = 0");
    expect(s.radius.kind).toBe("infinite");
  });

  it("x'' + x/(t-2) = 0 is multiplied by t - 2 and has the singular point 2", () => {
    const s = solve("second", "x'' + x/(t-2) = 0");
    expect(s.radius.kind === "finite" && s.radius.distance.squared).toEqual(q(4));
  });

  it("the shifted coefficients are the Taylor shift: 1 - t^2 about 1 is -2s - s^2", () => {
    const eq = linearEquation("second", "(1-t^2)*x'' + x = 0");
    if (!eq.ok) throw new Error();
    const ode = polynomialOde(eq.equation);
    if (!ode.ok) throw new Error();
    const r = powerSeries(ode.ode, q(1));
    expect(r.status).toBe("singular");
    expect(polyText(r.shifted.P[2])).toEqual(["0", "-2", "-1"]);
  });
});

describe("singular points", () => {
  it("t x'' + x' + t x = 0 (Bessel, order 0): regular, indicial r^2 = 0", () => {
    const s = singularAt("second", "t*x'' + x' + t*x = 0");
    expect(s.point.kind).toBe("regular");
    if (s.point.kind === "regular") {
      expect(polyText(s.point.indicial)).toEqual(["0", "0", "1"]);
      expect(s.point.roots).toEqual([{ kind: "rational", value: q(0), multiplicity: 2 }]);
    }
  });

  it("t^2 x'' + t x' - x = 0: indicial r^2 - 1, roots -1 and 1", () => {
    const s = singularAt("second", "t^2*x'' + t*x' - x = 0");
    expect(s.point.kind === "regular" && s.point.roots.map((r) => (r.kind === "rational" ? toNumber(r.value) : NaN))).toEqual([-1, 1]);
  });

  it("t^3 x'' + x = 0 is an irregular singular point", () => {
    expect(singularAt("second", "t^3*x'' + x = 0").point.kind).toBe("irregular");
  });

  it("first order: t dy/dt = y (dy/dt = y/t) is regular singular with indicial r - 1 = 0", () => {
    const s = singularAt("first", "y/t");
    expect(s.point.kind === "regular" && s.point.roots).toEqual([{ kind: "rational", value: q(1), multiplicity: 1 }]);
  });
});

describe("Frobenius series at a regular singular point", () => {
  function frob(text: string) {
    const s = singularAt("second", text);
    if (s.point.kind !== "regular" || "blocked" in s.point.frobenius) throw new Error("no Frobenius series");
    return s.point.frobenius;
  }
  const qs = (xs: readonly Q[], k: number) => xs.slice(0, k).map((v) => (v.d === BigInt(1) ? `${v.n}` : `${v.n}/${v.d}`));

  it("Bessel order 0, t x'' + x' + t x = 0: r = 0 double, a_n = -a_{n-2}/n^2, the second solution needs a logarithm", () => {
    const fr = frob("t*x'' + x' + t*x = 0");
    // a2 = -1/4, a4 = -a2/16 = 1/64, a6 = -a4/36 = -1/2304, odd ones 0
    expect(qs(fr.first.coefficients, 7)).toEqual(["1", "0", "-1/4", "0", "1/64", "0", "-1/2304"]);
    expect(fr.second.kind).toBe("logEqual");
    expect(fr.radius.kind).toBe("infinite");
  });

  it("t^2 x'' + t x' - x = 0: x1 = t (r = 1), and r = -1 still gives x2 = 1/t because a_2 is left free", () => {
    const fr = frob("t^2*x'' + t*x' - x = 0");
    expect(fr.first.exponent).toEqual(q(1));
    expect(fr.first.degree).toBe(0);
    expect(fr.second.kind).toBe("series");
    if (fr.second.kind === "series") {
      expect(fr.second.root.exponent).toEqual(q(-1));
      expect(fr.second.root.freeIndex).toBe(2);
      expect(fr.second.root.degree).toBe(0);
    }
  });

  it("Bessel order 1/2: r = 1/2 gives sin(t)/sqrt(t), r = -1/2 gives cos(t)/sqrt(t) (a_1 free)", () => {
    const fr = frob("t^2*x'' + t*x' + (t^2 - 1/4)*x = 0");
    // r = 1/2: n(n+1) a_n = -a_{n-2}: a2 = -1/6, a4 = 1/120 (sin t / t = 1 - t^2/3! + t^4/5!)
    expect(qs(fr.first.coefficients, 5)).toEqual(["1", "0", "-1/6", "0", "1/120"]);
    if (fr.second.kind !== "series") throw new Error();
    // r = -1/2: n(n-1) a_n = -a_{n-2}: a2 = -1/2, a4 = 1/24 (cos t)
    expect(qs(fr.second.root.coefficients, 5)).toEqual(["1", "0", "-1/2", "0", "1/24"]);
    expect(fr.second.root.freeIndex).toBe(1);
  });

  it("Bessel order 1: the smaller root fails at n = 2 (a logarithm), the larger gives t(1 - t^2/8 + t^4/192 ...)", () => {
    const fr = frob("t^2*x'' + t*x' + (t^2 - 1)*x = 0");
    expect(qs(fr.first.coefficients, 5)).toEqual(["1", "0", "-1/8", "0", "1/192"]);
    expect(fr.second).toEqual({ kind: "logInteger", gap: 2 });
  });

  it("2t x'' + x' + x = 0: roots 1/2 and 0 do not differ by an integer; a_n = -a_{n-1}/(n(2n+1)) and -a_{n-1}/(n(2n-1))", () => {
    const fr = frob("2*t*x'' + x' + x = 0");
    expect(qs(fr.first.coefficients, 3)).toEqual(["1", "-1/3", "1/30"]);
    if (fr.second.kind !== "series") throw new Error();
    expect(qs(fr.second.root.coefficients, 3)).toEqual(["1", "-1", "1/6"]);
  });

  it("irrational exponents and a right-hand side are not expanded, and say why", () => {
    const irr = singularAt("second", "t^2*x'' + t*x' - 2*x = 0");
    expect(irr.point.kind === "regular" && irr.point.frobenius).toEqual({ blocked: "notRational" });
    const forced = singularAt("second", "t*x'' + x = 1");
    expect(forced.point.kind === "regular" && forced.point.frobenius).toEqual({ blocked: "forcing" });
  });

  it("the series converge up to the nearest OTHER singular point: t(1 - t) x'' + x = 0 about 0 reaches 1", () => {
    const s = singularAt("second", "t*(1-t)*x'' + x = 0");
    if (s.point.kind !== "regular" || "blocked" in s.point.frobenius) throw new Error();
    const r = s.point.frobenius.radius;
    expect(r.kind === "finite" && r.distance.squared).toEqual(q(1));
  });
});

describe("what the series path refuses", () => {
  it("nonlinear terms name the fragment in the student's notation", () => {
    const r = linearEquation("second", "x'' + sin(x) = 0");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure).toEqual({ reason: "nonlinear", fragment: "sin(x)" });
    const p = linearEquation("second", "x'' + x*x' = 0");
    expect(!p.ok && p.failure.reason).toBe("nonlinear");
    const y2 = linearEquation("first", "y^2 + t");
    expect(!y2.ok && y2.failure.reason).toBe("nonlinear");
  });

  it("sin(t) as a coefficient is linear but not polynomial", () => {
    const r = linearEquation("second", "x'' + sin(t)*x = 0");
    expect(r.ok).toBe(true);
    if (r.ok) expect(polynomialOde(r.equation)).toEqual({ ok: false, reason: { which: "coefficient", order: 0 } });
    const f = linearEquation("second", "x'' + x = cos(2*t)");
    if (f.ok) expect(polynomialOde(f.equation)).toEqual({ ok: false, reason: { which: "rightHandSide" } });
  });

  it("unsupported functions, powers and piecewise terms have their own reasons", () => {
    expect(linearEquation("second", "x'' + abs(t)*x = 0")).toMatchObject({ ok: false, failure: { reason: "unsupportedFunction" } });
    expect(linearEquation("second", "x'' + t^0.5*x = 0")).toMatchObject({ ok: false, failure: { reason: "nonIntegerPower" } });
    expect(linearEquation("second", "x'' + (t > 0 ? 1 : 0)*x = 0")).toMatchObject({ ok: false, failure: { reason: "piecewise" } });
  });

  it("pi enters approximately and says so", () => {
    const r = linearEquation("second", "x'' + pi*x = 0");
    expect(r.ok && r.equation.approximate).toBe(true);
    const exact = linearEquation("second", "x'' + 0.1*x = 0");
    expect(exact.ok && exact.equation.approximate).toBe(false);
  });

  it("a parse error keeps the tool's own sentence", () => {
    const r = linearEquation("second", "y'' + y = 0");
    expect(!r.ok && r.failure.reason).toBe("parse");
  });

  it("isqrt is exact far beyond double precision (Newton from above)", () => {
    // (10^145 + 7)^2 is a perfect square; one less is not
    const r = BigInt(10) ** BigInt(145) + BigInt(7);
    expect(isqrt(r * r)).toBe(r);
    expect(isqrt(r * r - BigInt(1))).toBe(r - BigInt(1));
    expect(isqrt(BigInt(99))).toBe(BigInt(9));
  });

  it("rationals beyond the double range print as decimals with an exponent, never Infinity or 0", () => {
    // 10^400 * 3/2 = 1.5·10^400; 7/10^400 = 7·10^-400
    expect(rationalDecimal(q(BigInt(10) ** BigInt(400) * BigInt(3), 2), 6)).toBe("1.5·10⁴⁰⁰");
    expect(rationalDecimal(q(7, BigInt(10) ** BigInt(400)), 6)).toBe("7·10⁻⁴⁰⁰");
    expect(rationalDecimal(q(1, 3), 4)).toBe("0.3333");
  });

  it("decimals are read as written", () => {
    expect(fromNumber(0.1)).toEqual(q(1, 10));
    expect(fromNumber(-2.5e-7)).toEqual(q(-1, 4000000));
  });
});
