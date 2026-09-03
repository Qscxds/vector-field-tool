import { describe, expect, it } from "vitest";
import {
  ALL_FORMS,
  consistentForms,
  detectForms,
  MIN_SAMPLES,
  NO_FORM_NOTE,
  reportedForms,
  snapToRational,
  TOL_ALGEBRAIC,
  TOL_DERIVATIVE,
  verdictFor,
  type OdeForm,
} from "./detect-form";
import type { FirstOrderSpec } from "./slope-field";

const box = { x: { min: 0.3, max: 3 }, y: { min: 0.3, max: 3 } };
const forms = (spec: FirstOrderSpec, b = box) => consistentForms(detectForms(spec, b, "zh")).map((d) => d.form).sort();
const one = (spec: FirstOrderSpec, form: OdeForm, b = box, locale: "zh" | "en" = "en") => detectForms(spec, b, locale).find((d) => d.form === form)!;
const explicit = (g: string): FirstOrderSpec => ({ kind: "explicit", g });
const diff = (M: string, N: string): FirstOrderSpec => ({ kind: "differential", M, N });

describe("detectForms: textbook positives (hand-derived)", () => {
  it("dy/dx = x*y is separable and linear in y, not autonomous, not homogeneous", () => {
    // g = x·y: f(x)h(y) with f = x, h = y -> separable. g is affine in y -> linear in y.
    // g depends on x -> not autonomous. g(tx,ty) = t² xy -> not homogeneous of degree 0.
    const f = forms(explicit("x*y"));
    expect(f).toContain("separable");
    expect(f).toContain("linear_in_y");
    expect(f).not.toContain("autonomous");
    expect(f).not.toContain("homogeneous");
    expect(one(explicit("x*y"), "autonomous").verdict).toBe("inconsistent");
    expect(one(explicit("x*y"), "homogeneous").verdict).toBe("inconsistent");
  });

  it("dy/dx = x + y is NOT separable but is linear in y", () => {
    // (x+y)(x₀+y₀) ≠ (x+y₀)(x₀+y) in general: e.g. (1+2)(3+4) = 21 vs (1+4)(3+2) = 25.
    const f = forms(explicit("x + y"));
    expect(f).not.toContain("separable");
    expect(f).toContain("linear_in_y");
  });

  it("dy/dx = x*y + sin(x) is linear in y", () => {
    const f = forms(explicit("x*y + sin(x)"));
    expect(f).toContain("linear_in_y");
    expect(f).not.toContain("separable"); // (xy + sin x) does not factor
  });

  it("2xy dx + (x² + y²) dy = 0 is exact: ∂M/∂y = 2x = ∂N/∂x", () => {
    const ds = detectForms(diff("2*x*y", "x^2 + y^2"), box, "en");
    const exact = ds.find((d) => d.form === "exact")!;
    expect(exact.verdict).toBe("consistent");
    expect(exact.maxRelDeviation).toBeLessThan(1e-10); // polynomial: the high-order stencil is exact up to rounding
    // exact ⇒ μ = 1: the integrating-factor identities hold trivially and say so
    const ifx = ds.find((d) => d.form === "integrating_factor_x")!;
    expect(ifx.verdict).toBe("consistent");
    expect(ifx.details?.trivial).toBe(1);
    expect(ifx.evidence).toMatch(/trivially/);
  });

  it("y dx - x dy = 0: (∂M/∂y - ∂N/∂x)/N = (1 - (-1))/(-x) = -2/x depends on x only (and -2/y on y only)", () => {
    const f = forms(diff("y", "-x"));
    expect(f).toContain("integrating_factor_x");
    expect(f).toContain("integrating_factor_y");
    expect(f).not.toContain("exact"); // ∂M/∂y = 1 ≠ -1 = ∂N/∂x
    expect(one(diff("y", "-x"), "exact").verdict).toBe("inconsistent");
    expect(one(diff("y", "-x"), "exact").maxRelDeviation).toBeCloseTo(2, 6); // |1 - (-1)| / max(1, 1)
  });

  it("dy/dx = (x + y)/x is homogeneous of degree 0", () => {
    // g(tx, ty) = (tx + ty)/(tx) = (x + y)/x. Also linear in y: g = 1 + y/x.
    const f = forms(explicit("(x + y)/x"));
    expect(f).toContain("homogeneous");
    expect(f).toContain("linear_in_y");
  });

  it("dy/dx = y*(1-y) is autonomous, separable and Bernoulli with n = 2 (an integer, so 'snapped')", () => {
    const ds = detectForms(explicit("y*(1-y)"), box, "en");
    const f = consistentForms(ds).map((d) => d.form);
    expect(f).toContain("autonomous");
    expect(f).toContain("separable");
    expect(f).toContain("bernoulli");
    expect(f).not.toContain("linear_in_y");
    const b = ds.find((d) => d.form === "bernoulli")!;
    expect(b.details?.n).toBe(2);
    expect(b.exponent).toBe("2");
    expect(b.evidence).toMatch(/n = 2/);
  });

  it("dy/dx = x*y + x*y^3 is Bernoulli with n = 3 and separable (x·(y + y³)), not linear", () => {
    const ds = detectForms(explicit("x*y + x*y^3"), box, "zh");
    const f = consistentForms(ds).map((d) => d.form);
    expect(f).toContain("bernoulli");
    expect(f).toContain("separable");
    expect(f).not.toContain("linear_in_y");
    expect(ds.find((d) => d.form === "bernoulli")!.exponent).toBe("3");
  });
});

describe("detectForms: three-tier verdicts with the measured deviation (H2.4)", () => {
  it("verdictFor: one order of magnitude on each side of the threshold is borderline", () => {
    expect(verdictFor(1e-16, 1e-8)).toBe("consistent");
    expect(verdictFor(0.99e-9, 1e-8)).toBe("consistent");
    expect(verdictFor(1e-9, 1e-8)).toBe("borderline");
    expect(verdictFor(1e-8, 1e-8)).toBe("borderline");
    expect(verdictFor(1e-7, 1e-8)).toBe("borderline");
    expect(verdictFor(1.01e-7, 1e-8)).toBe("inconsistent");
  });

  it("returns every form with a verdict, in a fixed order, always with a deviation unless untestable", () => {
    const ds = detectForms(explicit("x^2 + y^2"), box, "en");
    expect(ds.map((d) => d.form)).toEqual([...ALL_FORMS]);
    for (const d of ds) {
      expect(["consistent", "borderline", "inconsistent", "untestable"]).toContain(d.verdict);
      if (d.verdict !== "untestable") {
        expect(d.maxRelDeviation).not.toBeNull();
        expect(d.samples).toBeGreaterThanOrEqual(MIN_SAMPLES);
      }
      expect(d.evidence).toMatch(/threshold 1e-[68]/);
      expect(d.caveat.length).toBeGreaterThan(40);
    }
  });

  it("separable: a perturbation of size ε moves the deviation to about ε·|Δx·Δy| — three tiers, derived", () => {
    // g = xy(1 + εxy). To first order in ε the identity g(p)g(b) - g(x,y_b)g(x_b,y) equals
    // ε·(xy)(x_b y_b)(x - x_b)(y - y_b), so the relative deviation is ε·|(x - x_b)(y - y_b)|,
    // between ε·1 and ε·2.7² ≈ 7.3ε on this box (the base point is the sample where |g| is largest).
    const dev = (eps: string) => one(explicit(`x*y*(1 + ${eps}*x*y)`), "separable");
    const tiny = dev("1e-12"); // ≤ 7.3e-12 < 1e-9
    expect(tiny.verdict).toBe("consistent");
    expect(tiny.maxRelDeviation).toBeLessThan(1e-9);
    const mid = dev("1e-9"); // between 1e-9 and 7.3e-9: inside [1e-9, 1e-7]
    expect(mid.verdict).toBe("borderline");
    expect(mid.maxRelDeviation).toBeGreaterThan(1e-9);
    expect(mid.maxRelDeviation).toBeLessThan(1e-8);
    expect(mid.caveat).toMatch(/[Bb]orderline/);
    const big = dev("1e-5"); // ≥ 1e-5 > 1e-7
    expect(big.verdict).toBe("inconsistent");
    expect(big.maxRelDeviation).toBeGreaterThan(1e-6);
  });

  it("autonomous: g = y + ε·x deviates by about ε·|x - x₀| / |g|", () => {
    // |x - x₀| ≤ 2.7 and |g| ≥ 0.3 on this box: deviation ≤ 9ε; ≥ ε·|Δx| / 3.
    expect(one(explicit("y + 1e-12*x"), "autonomous").verdict).toBe("consistent");
    const mid = one(explicit("y + 1e-8*x"), "autonomous");
    expect(mid.verdict).toBe("borderline");
    expect(mid.maxRelDeviation).toBeGreaterThan(1e-9);
    expect(mid.maxRelDeviation).toBeLessThan(1e-7);
    expect(one(explicit("y + 1e-4*x"), "autonomous").verdict).toBe("inconsistent");
  });

  it("linear in y: g = y + ε·y² is caught at large separations (a second difference at a tiny step would not see it)", () => {
    // Interpolation between y₁ = 0.877 and y₃ = 2.638 at y₂ = 1.859: the quadratic term leaves
    // ε(y₂ - y₁)(y₃ - y₂) = 0.765ε, divided by max|g| ≈ 2.64 -> 0.29ε.
    expect(one(explicit("y + 1e-12*y^2"), "linear_in_y").verdict).toBe("consistent");
    const mid = one(explicit("y + 1e-8*y^2"), "linear_in_y");
    expect(mid.verdict).toBe("borderline");
    expect(mid.maxRelDeviation).toBeCloseTo(0.29e-8, 10);
    expect(one(explicit("y + 1e-3*y^2"), "linear_in_y").verdict).toBe("inconsistent");
  });

  it("scaling g by a constant changes none of the algebraic verdicts (deviations are relative to the compared terms)", () => {
    // dy/dx = c·g keeps separability, autonomy, linearity, homogeneity and the Bernoulli exponent.
    // (Exactness is a property of M dx + N dy = 0, and c·g changes M without N: a different equation.)
    const algebraic = ["separable", "autonomous", "linear_in_y", "homogeneous", "bernoulli"];
    const a = detectForms(explicit("x*y + x*y^3"), box, "en");
    const b = detectForms(explicit("1e-9*(x*y + x*y^3)"), box, "en");
    const c = detectForms(explicit("1e9*(x*y + x*y^3)"), box, "en");
    for (let i = 0; i < a.length; i++) {
      if (!algebraic.includes(a[i].form)) continue;
      expect(b[i].verdict, a[i].form).toBe(a[i].verdict);
      expect(c[i].verdict, a[i].form).toBe(a[i].verdict);
    }
  });

  it("scaling M and N together changes none of the verdicts, exactness included", () => {
    const a = detectForms(diff("2*x*y", "x^2 + y^2"), box, "en");
    const b = detectForms(diff("1e-9*2*x*y", "1e-9*(x^2 + y^2)"), box, "en");
    const c = detectForms(diff("1e9*2*x*y", "1e9*(x^2 + y^2)"), box, "en");
    const d = detectForms(diff("y", "-x"), box, "en");
    const e = detectForms(diff("1e7*y", "-1e7*x"), box, "en");
    for (let i = 0; i < a.length; i++) {
      expect(b[i].verdict, a[i].form).toBe(a[i].verdict);
      expect(c[i].verdict, a[i].form).toBe(a[i].verdict);
      expect(e[i].verdict, d[i].form).toBe(d[i].verdict);
    }
  });

  it("exact test: rounding at huge field values is detected and those points are dropped, not misjudged", () => {
    // M = exp(10x) + y, N = x + 0.5 y²: ∂M/∂y = 1 = ∂N/∂x, exact. Where M ≈ e^{10x} is huge, a
    // difference quotient in y loses everything below the ulp of M: the rounding floor
    // 8·eps·1.5·|M|/h exceeds 0.1·tol even with the largest step (0.15 of the box), i.e. once
    // e^{10x} ≳ 0.1·1e-6·0.4/(2.7e-15) ≈ 1.5e7, x ≳ 1.65. Those points must be dropped, not judged;
    // on [0.3, 3] the samples with x ≤ 1.65 (fractions ≤ 0.5) are 0.0729, 0.1618, 0.2137, 0.3183,
    // 0.3819, 0.4472: six, enough for a verdict.
    const d = one(diff("exp(10*x) + y", "x + 0.5*y^2"), "exact");
    expect(d.verdict).toBe("consistent");
    expect(d.dropped).toBeGreaterThan(0);
    expect(d.samples).toBeGreaterThanOrEqual(MIN_SAMPLES);
    expect(d.evidence).toMatch(/unusable/);
    // and a non-exact equation at the same scale is still recognised as such on the usable points:
    // N = x + 2xy gives ∂N/∂x = 1 + 2y ≠ 1.
    const bad = one(diff("exp(10*x) + y", "x + 2*x*y"), "exact");
    expect(bad.verdict).toBe("inconsistent");
    // on a box where every sample is unusable the verdict is untestable, not a guess
    const far = one(diff("exp(10*x) + y", "x + 0.5*y^2"), "exact", { x: { min: 3, max: 6 }, y: { min: 0.3, max: 3 } });
    expect(far.verdict).toBe("untestable");
    expect(far.maxRelDeviation).toBeNull();
  });

  it("exact test at a moderate scale: the high-order stencil handles a cubic exactly, sin(10y) within tolerance", () => {
    // M = y³ + sin(10y)·x: ∂M/∂y = 3y² + 10 cos(10y) x ; N = x·y³ - x cos(10y)... choose an exact pair:
    // F = x y³ - (x/10) cos(10 y) -> M = F_x = y³ - cos(10y)/10, N = F_y = 3 x y² + x sin(10 y).
    const d = one(diff("y^3 - cos(10*y)/10", "3*x*y^2 + x*sin(10*y)"), "exact");
    expect(d.verdict).toBe("consistent");
    expect(d.dropped).toBe(0);
  });

  it("thresholds are the documented constants", () => {
    expect(TOL_ALGEBRAIC).toBe(1e-8);
    expect(TOL_DERIVATIVE).toBe(1e-6);
    expect(one(explicit("x*y"), "separable").threshold).toBe(TOL_ALGEBRAIC);
    expect(one(diff("y", "-x"), "exact").threshold).toBe(TOL_DERIVATIVE);
  });
});

describe("Bernoulli: exponent search and snapping to simple fractions (H2.5)", () => {
  it("snapToRational finds the reduced fraction with denominator ≤ 6, or nothing", () => {
    expect(snapToRational(0.5)).toEqual({ p: 1, q: 2, text: "1/2" });
    expect(snapToRational(1.5 + 3e-8)).toEqual({ p: 3, q: 2, text: "3/2" });
    expect(snapToRational(-1)).toEqual({ p: -1, q: 1, text: "-1" });
    expect(snapToRational(2 / 3)).toEqual({ p: 2, q: 3, text: "2/3" });
    expect(snapToRational(7)).toEqual({ p: 7, q: 1, text: "7" });
    expect(snapToRational(Math.SQRT2)).toBeNull(); // 7/5 = 1.4 is 0.014 away
    expect(snapToRational(1 / 7)).toBeNull(); // needs denominator 7
  });

  it("dy/dx = y + x·√y is Bernoulli with n = 1/2, reported as the exact fraction", () => {
    const d = one(explicit("y + x*sqrt(y)"), "bernoulli");
    expect(d.verdict).toBe("consistent");
    expect(d.exponent).toBe("1/2");
    expect(d.details?.n).toBe(0.5);
    expect(d.evidence).toMatch(/n = 1\/2/);
    expect(d.evidence).toMatch(/snapped/);
  });

  it("dy/dx = y + y^(3/2) has n = 3/2; dy/dx = x/y + y has n = -1", () => {
    expect(one(explicit("y + y^1.5"), "bernoulli").exponent).toBe("3/2");
    // g/y = x/y² + 1 = a + b·y^m with m = -2 -> n = -1.
    expect(one(explicit("x/y + y"), "bernoulli").exponent).toBe("-1");
  });

  it("an exponent outside the old ±6 window is found: dy/dx = y + y^7 has n = 7", () => {
    const d = one(explicit("y + y^7"), "bernoulli");
    expect(d.verdict).toBe("consistent");
    expect(d.exponent).toBe("7");
  });

  it("an irrational exponent is reported as a numerical estimate, not snapped", () => {
    const d = one(explicit("y + x*y^1.41421356"), "bernoulli");
    expect(d.verdict).toBe("consistent");
    expect(d.exponent).toBeUndefined();
    expect(d.details?.n).toBeCloseTo(1.41421356, 5);
    expect(d.evidence).toMatch(/no simple fraction/);
  });

  it("a linear equation fits the Bernoulli template with n = 0 (or 1) but is reported as linear, not Bernoulli", () => {
    // g/y = x + sin(x)/y = a(x) + b(x)·y^{-1}: exponent m = -1, n = 0. The textbook Bernoulli
    // equation requires n ≠ 0, 1; n = 0 and n = 1 are the linear equation itself.
    const d = one(explicit("x*y + sin(x)"), "bernoulli");
    expect(d.verdict).toBe("inconsistent");
    expect(d.details?.n).toBe(0);
    expect(d.evidence).toMatch(/n = 0/);
    expect(d.evidence).toMatch(/linear/);
  });
});

describe("detectForms: the Riccati equation dy/dx = x² + y² matches nothing", () => {
  it("nothing is consistent or borderline, and the note is positive", () => {
    // Not separable ((x²+y²)(x₀²+y₀²) ≠ (x²+y₀²)(x₀²+y²)), depends on x, quadratic in y, degree 2
    // not 0, g/y = x²/y + y has two power terms so no single Bernoulli exponent, and as
    // -(x²+y²) dx + dy = 0: ∂M/∂y = -2y ≠ 0 = ∂N/∂x, (M_y - N_x)/N = -2y depends on y,
    // (N_x - M_y)/M = 2y/(x²+y²) depends on x.
    const ds = detectForms(explicit("x^2 + y^2"), box, "zh");
    expect(reportedForms(ds)).toEqual([]);
    expect(ds.every((d) => d.verdict === "inconsistent")).toBe(true);
    expect(NO_FORM_NOTE.zh).toMatch(/Riccati/);
    expect(NO_FORM_NOTE.en).toMatch(/not a failure/);
  });
});

describe("detectForms: honesty rules", () => {
  it("every detection carries a non-empty caveat and 'consistent with' wording, in both locales", () => {
    for (const locale of ["zh", "en"] as const) {
      const ds = consistentForms(detectForms(diff("2*x*y", "x^2 + y^2"), box, locale));
      expect(ds.length).toBeGreaterThan(0);
      for (const d of ds) {
        expect(d.caveat.length).toBeGreaterThan(40);
        expect(d.evidence).toMatch(/\d/); // mentions the sample count / deviation
        expect(d.samples).toBeGreaterThanOrEqual(MIN_SAMPLES);
        expect(d.maxRelDeviation).toBeGreaterThanOrEqual(0);
        if (locale === "zh") {
          expect(d.caveat).toMatch(/不是证明/);
          expect(d.caveat).toMatch(/一致/);
        } else {
          expect(d.caveat).toMatch(/not a proof/);
          expect(d.caveat).toMatch(/consistent with/);
        }
      }
    }
  });

  it("uses the sample count in the evidence and never claims exactness", () => {
    const [d] = detectForms(explicit("x*y"), box, "en").filter((d) => d.form === "separable");
    expect(d.evidence).toMatch(/sample points/);
    expect(d.evidence).not.toMatch(/\bis a\b/);
    expect(d.samples).toBeGreaterThanOrEqual(12);
  });

  it("does not report a form when too few sample points are finite: untestable, with no deviation", () => {
    // sqrt(-1 - y^2) is NaN everywhere: nothing can be tested.
    const ds = detectForms(explicit("sqrt(-1 - y^2)"), box, "en");
    expect(reportedForms(ds)).toEqual([]);
    for (const d of ds) {
      expect(d.verdict).toBe("untestable");
      expect(d.maxRelDeviation).toBeNull();
      expect(d.caveat).toMatch(/cannot be tested/);
    }
  });

  it("all form names exist in both locales (no missing translations)", () => {
    const all: OdeForm[] = ["separable", "autonomous", "linear_in_y", "homogeneous", "bernoulli", "exact", "integrating_factor_x", "integrating_factor_y"];
    const zh = detectForms(diff("y", "-x"), box, "zh");
    const en = detectForms(diff("y", "-x"), box, "en");
    expect(zh.map((d) => [d.form, d.verdict])).toEqual(en.map((d) => [d.form, d.verdict]));
    expect(all.length).toBe(8);
  });
});
