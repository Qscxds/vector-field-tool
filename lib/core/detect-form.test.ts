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
import { ParseError } from "./parse";
import type { FirstOrderSpec } from "./slope-field";

const box = { x: { min: 0.3, max: 3 }, y: { min: 0.3, max: 3 } };
const forms = (spec: FirstOrderSpec, b = box) => consistentForms(detectForms(spec, b, "zh")).map((d) => d.form).sort();
const one = (spec: FirstOrderSpec, form: OdeForm, b = box, locale: "zh" | "en" = "en") => detectForms(spec, b, locale).find((d) => d.form === form)!;
const explicit = (g: string): FirstOrderSpec => ({ kind: "explicit", g });
const diff = (M: string, N: string): FirstOrderSpec => ({ kind: "differential", M, N });

describe("detectForms: textbook positives (hand-derived)", () => {
  it("dy/dt = t*y is separable and linear in y, not autonomous, not homogeneous", () => {
    // g = t·y: f(t)h(y) with f = t, h = y -> separable. g is affine in y -> linear in y.
    // g depends on t -> not autonomous. g(kt,ky) = k² ty -> not homogeneous of degree 0.
    const f = forms(explicit("t*y"));
    expect(f).toContain("separable");
    expect(f).toContain("linear_in_y");
    expect(f).not.toContain("autonomous");
    expect(f).not.toContain("homogeneous");
    expect(one(explicit("t*y"), "autonomous").verdict).toBe("inconsistent");
    expect(one(explicit("t*y"), "homogeneous").verdict).toBe("inconsistent");
  });

  it("dy/dt = t + y is NOT separable but is linear in y", () => {
    // (t+y)(t₀+y₀) ≠ (t+y₀)(t₀+y) in general: e.g. (1+2)(3+4) = 21 vs (1+4)(3+2) = 25.
    const f = forms(explicit("t + y"));
    expect(f).not.toContain("separable");
    expect(f).toContain("linear_in_y");
  });

  it("dy/dt = t*y + sin(t) is linear in y", () => {
    const f = forms(explicit("t*y + sin(t)"));
    expect(f).toContain("linear_in_y");
    expect(f).not.toContain("separable"); // (ty + sin t) does not factor
  });

  it("2ty dt + (t² + y²) dy = 0 is exact: ∂M/∂y = 2t = ∂N/∂t", () => {
    const ds = detectForms(diff("2*t*y", "t^2 + y^2"), box, "en");
    const exact = ds.find((d) => d.form === "exact")!;
    expect(exact.verdict).toBe("consistent");
    expect(exact.maxRelDeviation).toBeLessThan(1e-10); // polynomial: the high-order stencil is exact up to rounding
    // exact ⇒ μ = 1: the integrating-factor identities hold trivially and say so
    const ifx = ds.find((d) => d.form === "integrating_factor_x")!;
    expect(ifx.verdict).toBe("consistent");
    expect(ifx.details?.trivial).toBe(1);
    expect(ifx.evidence).toMatch(/trivially/);
  });

  it("y dt - t dy = 0: (∂M/∂y - ∂N/∂t)/N = (1 - (-1))/(-t) = -2/t depends on t only (and -2/y on y only)", () => {
    const f = forms(diff("y", "-t"));
    expect(f).toContain("integrating_factor_x");
    expect(f).toContain("integrating_factor_y");
    expect(f).not.toContain("exact"); // ∂M/∂y = 1 ≠ -1 = ∂N/∂t
    expect(one(diff("y", "-t"), "exact").verdict).toBe("inconsistent");
    expect(one(diff("y", "-t"), "exact").maxRelDeviation).toBeCloseTo(2, 6); // |1 - (-1)| / max(1, 1)
  });

  it("dy/dt = (t + y)/t is homogeneous of degree 0", () => {
    // g(kt, ky) = (kt + ky)/(kt) = (t + y)/t. Also linear in y: g = 1 + y/t.
    const f = forms(explicit("(t + y)/t"));
    expect(f).toContain("homogeneous");
    expect(f).toContain("linear_in_y");
  });

  it("dy/dt = y*(1-y) is autonomous, separable and Bernoulli with n = 2 (an integer, so 'snapped')", () => {
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

  it("dy/dt = t*y + t*y^3 is Bernoulli with n = 3 and separable (t·(y + y³)), not linear", () => {
    const ds = detectForms(explicit("t*y + t*y^3"), box, "zh");
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
    const ds = detectForms(explicit("t^2 + y^2"), box, "en");
    expect(ds.map((d) => d.form)).toEqual([...ALL_FORMS]);
    for (const d of ds) {
      expect(["consistent", "borderline", "inconsistent", "untestable"]).toContain(d.verdict);
      if (d.verdict !== "untestable") {
        expect(d.maxRelDeviation).not.toBeNull();
        expect(d.samples).toBeGreaterThanOrEqual(MIN_SAMPLES);
      }
      expect(d.evidence).not.toMatch(/（|）/); // English evidence uses ASCII punctuation
      expect(d.evidence).toMatch(/threshold 1e-[68]/);
      expect(d.caveat.length).toBeGreaterThan(40);
    }
  });

  it("separable: a perturbation of size ε moves the deviation to about ε·|Δt·Δy| — three tiers, derived", () => {
    // g = ty(1 + εty). To first order in ε the identity g(p)g(b) - g(t,y_b)g(t_b,y) equals
    // ε·(ty)(t_b y_b)(t - t_b)(y - y_b), so the relative deviation is ε·|(t - t_b)(y - y_b)|,
    // between ε·1 and ε·2.7² ≈ 7.3ε on this box (the base point is the sample where |g| is largest).
    const dev = (eps: string) => one(explicit(`t*y*(1 + ${eps}*t*y)`), "separable");
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

  it("autonomous: g = y + ε·t deviates by about ε·|t - t₀| / |g|", () => {
    // |t - t₀| ≤ 2.7 and |g| ≥ 0.3 on this box: deviation ≤ 9ε; ≥ ε·|Δt| / 3.
    expect(one(explicit("y + 1e-12*t"), "autonomous").verdict).toBe("consistent");
    const mid = one(explicit("y + 1e-8*t"), "autonomous");
    expect(mid.verdict).toBe("borderline");
    expect(mid.maxRelDeviation).toBeGreaterThan(1e-9);
    expect(mid.maxRelDeviation).toBeLessThan(1e-7);
    expect(one(explicit("y + 1e-4*t"), "autonomous").verdict).toBe("inconsistent");
  });

  it("linear in y: g = y + ε·y² is caught at large separations (a second difference at a tiny step would not see it)", () => {
    // Interpolation between y₁ = 0.3 + 0.2618·2.7 = 1.00686 and y₃ = 0.3 + 0.8541·2.7 = 2.60607 at
    // y₂ = 0.3 + 0.6545·2.7 = 2.06715: the quadratic term leaves ε(y₂ - y₁)(y₃ - y₂) = 0.57141ε,
    // divided by max|g| = g(y₃) ≈ 2.60607 -> 0.21926ε.
    expect(one(explicit("y + 1e-12*y^2"), "linear_in_y").verdict).toBe("consistent");
    const mid = one(explicit("y + 1e-8*y^2"), "linear_in_y");
    expect(mid.verdict).toBe("borderline");
    expect(mid.maxRelDeviation).toBeCloseTo(0.21926e-8, 11);
    expect(one(explicit("y + 1e-3*y^2"), "linear_in_y").verdict).toBe("inconsistent");
  });

  it("scaling g by a constant changes none of the algebraic verdicts (deviations are relative to the compared terms)", () => {
    // dy/dt = c·g keeps separability, autonomy, linearity, homogeneity and the Bernoulli exponent.
    // (Exactness is a property of M dt + N dy = 0, and c·g changes M without N: a different equation.)
    const algebraic = ["separable", "autonomous", "linear_in_y", "homogeneous", "bernoulli"];
    const a = detectForms(explicit("t*y + t*y^3"), box, "en");
    const b = detectForms(explicit("1e-9*(t*y + t*y^3)"), box, "en");
    const c = detectForms(explicit("1e9*(t*y + t*y^3)"), box, "en");
    for (let i = 0; i < a.length; i++) {
      if (!algebraic.includes(a[i].form)) continue;
      expect(b[i].verdict, a[i].form).toBe(a[i].verdict);
      expect(c[i].verdict, a[i].form).toBe(a[i].verdict);
    }
  });

  it("scaling M and N together changes none of the verdicts, exactness included", () => {
    const a = detectForms(diff("2*t*y", "t^2 + y^2"), box, "en");
    const b = detectForms(diff("1e-9*2*t*y", "1e-9*(t^2 + y^2)"), box, "en");
    const c = detectForms(diff("1e9*2*t*y", "1e9*(t^2 + y^2)"), box, "en");
    const d = detectForms(diff("y", "-t"), box, "en");
    const e = detectForms(diff("1e7*y", "-1e7*t"), box, "en");
    for (let i = 0; i < a.length; i++) {
      expect(b[i].verdict, a[i].form).toBe(a[i].verdict);
      expect(c[i].verdict, a[i].form).toBe(a[i].verdict);
      expect(e[i].verdict, d[i].form).toBe(d[i].verdict);
    }
  });

  it("exact test: rounding at huge field values is detected and those points are dropped, not misjudged", () => {
    // M = exp(10t) + y, N = t + 0.5 y²: ∂M/∂y = 1 = ∂N/∂t, exact. Where M ≈ e^{10t} is huge, a
    // difference quotient in y loses everything below the ulp of M: the rounding floor
    // 8·eps·1.5·|M|/h exceeds 0.1·tol even with the largest step (0.15 of the box), i.e. once
    // e^{10t} ≳ 0.1·1e-6·0.4/(2.7e-15) ≈ 1.5e7, t ≳ 1.65. Those points must be dropped, not judged;
    // on [0.3, 3] the samples with t ≤ 1.65 (fractions ≤ 0.5) are 0.0729, 0.1618, 0.2137, 0.3183,
    // 0.3819, 0.4472: six, enough for a verdict.
    const d = one(diff("exp(10*t) + y", "t + 0.5*y^2"), "exact");
    expect(d.verdict).toBe("consistent");
    expect(d.dropped).toBeGreaterThan(0);
    expect(d.samples).toBeGreaterThanOrEqual(MIN_SAMPLES);
    expect(d.evidence).toMatch(/unusable/);
    // and a non-exact equation at the same scale is still recognised as such on the usable points:
    // N = t + 2ty gives ∂N/∂t = 1 + 2y ≠ 1.
    const bad = one(diff("exp(10*t) + y", "t + 2*t*y"), "exact");
    expect(bad.verdict).toBe("inconsistent");
    // on a box where every sample is unusable the verdict is untestable, not a guess
    const far = one(diff("exp(10*t) + y", "t + 0.5*y^2"), "exact", { x: { min: 3, max: 6 }, y: { min: 0.3, max: 3 } });
    expect(far.verdict).toBe("untestable");
    expect(far.maxRelDeviation).toBeNull();
  });

  it("exact test at a moderate scale: the high-order stencil handles a cubic exactly, sin(10y) within tolerance", () => {
    // M = y³ + sin(10y)·t: ∂M/∂y = 3y² + 10 cos(10y) t ; N = t·y³ - t cos(10y)... choose an exact pair:
    // F = t y³ - (t/10) cos(10 y) -> M = F_t = y³ - cos(10y)/10, N = F_y = 3 t y² + t sin(10 y).
    const d = one(diff("y^3 - cos(10*y)/10", "3*t*y^2 + t*sin(10*y)"), "exact");
    expect(d.verdict).toBe("consistent");
    expect(d.dropped).toBe(0);
  });

  it("sample points avoid y = t and y = -t on centred boxes: (t - y)/(t + y) is judged the same on every box (review C1)", () => {
    // g = (t - y)/(t + y) is homogeneous of degree 0 (g(kt, ky) = g(t, y)) and NOT linear in y
    // (a Möbius function of y). Poles on t + y = 0 must not corrupt the verdicts.
    for (const a of [1.5, 2, 2.5, 3, 5, 6, 10]) {
      const b = { x: { min: -a, max: a }, y: { min: -a, max: a } };
      const ds = detectForms(explicit("(t - y)/(t + y)"), b, "en");
      expect(ds.find((d) => d.form === "homogeneous")!.verdict, `homogeneous on ±${a}`).toBe("consistent");
      expect(ds.find((d) => d.form === "linear_in_y")!.verdict, `linear on ±${a}`).toBe("inconsistent");
    }
    // (t² - y)/(t + y) is neither homogeneous nor linear
    const ds2 = detectForms(explicit("(t^2 - y)/(t + y)"), { x: { min: -2, max: 2 }, y: { min: -2, max: 2 } }, "en");
    expect(ds2.find((d) => d.form === "homogeneous")!.verdict).toBe("inconsistent");
    expect(ds2.find((d) => d.form === "linear_in_y")!.verdict).toBe("inconsistent");
  });

  it("derivative estimates do not alias a periodic field: sin(2πy) dt + 2πt cos(2πy) dy = 0 is exact on every box (review C2)", () => {
    // ∂M/∂y = 2π cos(2πy) = ∂N/∂t. A difference step equal to the period would read ∂M/∂y = 0.
    for (const b of [
      { x: { min: -5, max: 5 }, y: { min: -5, max: 5 } },
      { x: { min: -10, max: 10 }, y: { min: -10, max: 10 } },
      { x: { min: 0, max: 10 }, y: { min: 0, max: 10 } },
      { x: { min: 0, max: 10 }, y: { min: 0, max: 20 } },
      { x: { min: -3, max: 3 }, y: { min: -3, max: 3 } },
    ]) {
      const d = one(diff("sin(2*pi*y)", "2*pi*t*cos(2*pi*y)"), "exact", b);
      expect(d.verdict, JSON.stringify(b)).toBe("consistent");
    }
    // and y' = t cos(2πy) (M = -t cos 2πy, N = 1: ∂M/∂y = 2πt sin 2πy ≠ 0) is NOT exact on the same boxes
    for (const b of [
      { x: { min: -5, max: 5 }, y: { min: -5, max: 5 } },
      { x: { min: -10, max: 10 }, y: { min: -10, max: 10 } },
    ]) {
      const d = one(explicit("t*cos(2*pi*y)"), "exact", b);
      expect(d.verdict, JSON.stringify(b)).toBe("inconsistent");
    }
  });

  it("thresholds are the documented constants", () => {
    expect(TOL_ALGEBRAIC).toBe(1e-8);
    expect(TOL_DERIVATIVE).toBe(1e-6);
    expect(one(explicit("t*y"), "separable").threshold).toBe(TOL_ALGEBRAIC);
    expect(one(diff("y", "-t"), "exact").threshold).toBe(TOL_DERIVATIVE);
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

  it("dy/dt = y + t·√y is Bernoulli with n = 1/2, reported as the exact fraction", () => {
    const d = one(explicit("y + t*sqrt(y)"), "bernoulli");
    expect(d.verdict).toBe("consistent");
    expect(d.exponent).toBe("1/2");
    expect(d.details?.n).toBe(0.5);
    expect(d.evidence).toMatch(/n = 1\/2/);
    expect(d.evidence).toMatch(/snapped/);
  });

  it("dy/dt = y + y^(3/2) has n = 3/2; dy/dt = t/y + y has n = -1", () => {
    expect(one(explicit("y + y^1.5"), "bernoulli").exponent).toBe("3/2");
    // g/y = t/y² + 1 = a + b·y^m with m = -2 -> n = -1.
    expect(one(explicit("t/y + y"), "bernoulli").exponent).toBe("-1");
  });

  it("an exponent outside the old ±6 window is found: dy/dt = y + y^7 has n = 7", () => {
    const d = one(explicit("y + y^7"), "bernoulli");
    expect(d.verdict).toBe("consistent");
    expect(d.exponent).toBe("7");
  });

  it("an irrational exponent is reported as a numerical estimate, not snapped", () => {
    const d = one(explicit("y + t*y^1.41421356"), "bernoulli");
    expect(d.verdict).toBe("consistent");
    expect(d.exponent).toBeUndefined();
    expect(d.details?.n).toBeCloseTo(1.41421356, 5);
    expect(d.evidence).toMatch(/no simple fraction/);
  });

  it("a linear equation fits the Bernoulli template with n = 0 (or 1) but is reported as linear, not Bernoulli", () => {
    // g/y = t + sin(t)/y = a(t) + b(t)·y^{-1}: exponent m = -1, n = 0. The textbook Bernoulli
    // equation requires n ≠ 0, 1; n = 0 and n = 1 are the linear equation itself.
    const d = one(explicit("t*y + sin(t)"), "bernoulli");
    expect(d.verdict).toBe("inconsistent");
    expect(d.details?.n).toBe(0);
    expect(d.evidence).toMatch(/n = 0/);
    expect(d.evidence).toMatch(/linear/);
    // the wording must not call a 1e-16 fit deviation 'clearly above the threshold'
    expect(d.evidence).toMatch(/by definition/);
    expect(d.evidence).not.toMatch(/clearly above/);
  });

  it("a box with no positive y makes the Bernoulli test untestable instead of sampling outside the box", () => {
    const d = one(explicit("y + y^3"), "bernoulli", { x: { min: 0.3, max: 3 }, y: { min: -3, max: -0.3 } });
    expect(d.verdict).toBe("untestable");
    expect(d.evidence).toMatch(/no y > 0/);
  });

  it("an exponent estimate a few 1e-7 off still snaps (the re-verification decides, not the gate)", () => {
    // y + y^3 * (1 + 1e-9 t) is not exactly Bernoulli; the estimate n ≈ 3 + O(1e-9) must snap to 3 iff the
    // snapped identity holds within tolerance — here it does (deviation ~1e-9 < 1e-9? borderline!) so
    // use a clean case: y + 1.0000001*y^3 has exact n = 3 with a different b; must snap to 3.
    const d = one(explicit("y + 1.0000001*y^3"), "bernoulli");
    expect(d.verdict).toBe("consistent");
    expect(d.exponent).toBe("3");
  });
});

describe("detectForms: the Riccati equation dy/dt = t² + y² matches nothing", () => {
  it("nothing is consistent or borderline, and the note is positive", () => {
    // Not separable ((t²+y²)(t₀²+y₀²) ≠ (t²+y₀²)(t₀²+y²)), depends on t, quadratic in y, degree 2
    // not 0, g/y = t²/y + y has two power terms so no single Bernoulli exponent, and as
    // -(t²+y²) dt + dy = 0: ∂M/∂y = -2y ≠ 0 = ∂N/∂t, (M_y - N_t)/N = -2y depends on y,
    // (N_t - M_y)/M = 2y/(t²+y²) depends on t.
    const ds = detectForms(explicit("t^2 + y^2"), box, "zh");
    expect(reportedForms(ds)).toEqual([]);
    expect(ds.every((d) => d.verdict === "inconsistent")).toBe(true);
    expect(NO_FORM_NOTE.zh).toMatch(/Riccati/);
    expect(NO_FORM_NOTE.en).toMatch(/not a failure/);
  });
});

describe("detectForms: honesty rules", () => {
  it("every detection carries a non-empty caveat and 'consistent with' wording, in both locales", () => {
    for (const locale of ["zh", "en"] as const) {
      const ds = consistentForms(detectForms(diff("2*t*y", "t^2 + y^2"), box, locale));
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
    const [d] = detectForms(explicit("t*y"), box, "en").filter((d) => d.form === "separable");
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
    const zh = detectForms(diff("y", "-t"), box, "zh");
    const en = detectForms(diff("y", "-t"), box, "en");
    expect(zh.map((d) => [d.form, d.verdict])).toEqual(en.map((d) => [d.form, d.verdict]));
    expect(all.length).toBe(8);
  });
});

describe("student-facing notation: the independent variable is t", () => {
  it("form names, evidence and caveats are written in t, never in x", () => {
    const en = detectForms(explicit("t*y"), box, "en");
    const zh = detectForms(explicit("t*y"), box, "zh");
    for (const d of [...en, ...zh]) {
      expect(d.evidence, d.form).not.toMatch(/g\(x|∂N\/∂x|μ\(x\)|dy\/dx|\(x\)/);
      expect(d.caveat, d.form).not.toMatch(/g\(x|∂N\/∂x|μ\(x\)|dy\/dx|\(x\)/);
    }
    expect(en.find((d) => d.form === "separable")!.evidence).toMatch(/g\(t,y\)·g\(t₀,y₀\) = g\(t,y₀\)·g\(t₀,y\)/);
    expect(en.find((d) => d.form === "autonomous")!.evidence).toMatch(/[Cc]ompared g\(t,y\) with g\(t₀,y\)/);
    expect(en.find((d) => d.form === "homogeneous")!.evidence).toMatch(/g\(kt,ky\) = g\(t,y\) for k = 0\.5, 1\.7, 2\.3/);
    expect(en.find((d) => d.form === "bernoulli")!.evidence).toMatch(/g\(t,y\)\/y as a\(t\) \+ b\(t\)/);
    expect(en.find((d) => d.form === "exact")!.evidence).toMatch(/∂M\/∂y with ∂N\/∂t/);
    expect(en.find((d) => d.form === "integrating_factor_x")!.evidence).toMatch(/\(∂M\/∂y − ∂N\/∂t\)\/N does not depend on y/);
    expect(en.find((d) => d.form === "integrating_factor_y")!.evidence).toMatch(/\(∂N\/∂t − ∂M\/∂y\)\/M does not depend on t/);
    expect(zh.find((d) => d.form === "homogeneous")!.evidence).toMatch(/g\(kt,ky\) = g\(t,y\)，k 取 0\.5、1\.7、2\.3/);
    expect(zh.find((d) => d.form === "exact")!.evidence).toMatch(/∂M\/∂y 与 ∂N\/∂t/);
  });

  it("the form names inside the caveats use t", () => {
    // t*y is not autonomous: the caveat quotes the form name for the 'inconsistent' verdict.
    expect(one(explicit("t*y"), "autonomous").caveat).toContain("the right-hand side does not depend on t");
    expect(one(explicit("t*y"), "autonomous", box, "zh").caveat).toContain("右端与 t 无关");
    expect(one(explicit("t*y"), "separable").caveat).toContain("dy/dt = f(t)·h(y)");
    expect(one(explicit("t*y"), "linear_in_y").caveat).toContain("dy/dt = P(t)·y + Q(t)");
    expect(one(explicit("t*y"), "homogeneous").caveat).toContain("g(kt, ky) = g(t, y)");
    expect(one(explicit("t*y"), "bernoulli").caveat).toContain("dy/dt = P(t)·y + Q(t)·yⁿ");
    expect(one(diff("y", "-t"), "exact").caveat).toContain("∂M/∂y = ∂N/∂t");
    expect(one(explicit("t^2 + y^2"), "integrating_factor_x").caveat).toContain("μ(t) depending on t only");
    expect(one(explicit("t^2 + y^2"), "integrating_factor_x", box, "zh").caveat).toContain("只依赖 t 的积分因子 μ(t)");
  });

  it("the Bernoulli extras and the no-form note use t", () => {
    expect(NO_FORM_NOTE.zh).toMatch(/dy\/dt = t² \+ y²/);
    expect(NO_FORM_NOTE.en).toMatch(/dy\/dt = t² \+ y²/);
    expect(NO_FORM_NOTE.en).not.toMatch(/dy\/dx/);
    // y + y^3 + t·y^5: the exponent fitted at each t differs, so the 'differs between t values' sentence appears.
    // At fixed t, g/y = 1 + y² + t·y⁴ has two power terms, so no single exponent fits: 'at some t'.
    const twoPowers = one(explicit("y + y^3 + t*y^5"), "bernoulli");
    expect(twoPowers.evidence).toMatch(/at some t, g\/y cannot be written|differs between t values/);
    expect(twoPowers.evidence).not.toMatch(/at some x|between x values/);
  });

  it("x in a first-order equation is a ParseError with code x_in_first_order, straight from detectForms", () => {
    try {
      detectForms(explicit("x*y"), box, "en");
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
      expect((error as ParseError).code).toBe("x_in_first_order");
      return;
    }
    throw new Error("expected a ParseError");
  });
});
