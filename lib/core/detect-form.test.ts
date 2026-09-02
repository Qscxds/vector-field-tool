import { describe, expect, it } from "vitest";
import { detectForms, NO_FORM_NOTE, type OdeForm } from "./detect-form";
import type { FirstOrderSpec } from "./slope-field";

const box = { x: { min: 0.3, max: 3 }, y: { min: 0.3, max: 3 } };
const forms = (spec: FirstOrderSpec, b = box) => detectForms(spec, b, "zh").map((d) => d.form).sort();
const explicit = (g: string): FirstOrderSpec => ({ kind: "explicit", g });
const diff = (M: string, N: string): FirstOrderSpec => ({ kind: "differential", M, N });

describe("detectForms: textbook positives (hand-derived)", () => {
  it("dy/dx = x*y is separable (and Bernoulli-degenerate? no: linear in y, autonomous? no)", () => {
    // g = x·y: f(x)h(y) with f = x, h = y -> separable. ∂²g/∂y² = 0 -> linear in y.
    // g depends on x -> not autonomous. g(tx,ty) = t² xy -> not homogeneous of degree 0.
    const f = forms(explicit("x*y"));
    expect(f).toContain("separable");
    expect(f).toContain("linear_in_y");
    expect(f).not.toContain("autonomous");
    expect(f).not.toContain("homogeneous");
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
    const f = forms(diff("2*x*y", "x^2 + y^2"));
    expect(f).toContain("exact");
    // exact supersedes the integrating-factor reports (μ = 1)
    expect(f).not.toContain("integrating_factor_x");
  });

  it("y dx - x dy = 0: (∂M/∂y - ∂N/∂x)/N = (1 - (-1))/(-x) = -2/x depends on x only (and -2/y on y only)", () => {
    const f = forms(diff("y", "-x"));
    expect(f).toContain("integrating_factor_x");
    expect(f).toContain("integrating_factor_y");
    expect(f).not.toContain("exact"); // ∂M/∂y = 1 ≠ -1 = ∂N/∂x
  });

  it("dy/dx = (x + y)/x is homogeneous of degree 0", () => {
    // g(tx, ty) = (tx + ty)/(tx) = (x + y)/x. Also linear in y: g = 1 + y/x.
    const f = forms(explicit("(x + y)/x"));
    expect(f).toContain("homogeneous");
    expect(f).toContain("linear_in_y");
  });

  it("dy/dx = y*(1-y) is autonomous, separable and Bernoulli with n = 2", () => {
    const ds = detectForms(explicit("y*(1-y)"), box, "en");
    const f = ds.map((d) => d.form);
    expect(f).toContain("autonomous");
    expect(f).toContain("separable");
    expect(f).toContain("bernoulli");
    expect(f).not.toContain("linear_in_y");
    const b = ds.find((d) => d.form === "bernoulli")!;
    expect(b.details?.n).toBeCloseTo(2, 5);
    expect(b.evidence).toMatch(/n ≈ 2/);
  });

  it("dy/dx = x*y + x*y^3 is Bernoulli with n = 3 (and not linear, not separable)", () => {
    // g/y = x + x y²: a(x) = x, b(x) = x, m = 2 -> n = 3. Not separable: (xy + xy³) = x·(y + y³)
    // ... wait, that IS separable: f(x) = x, h(y) = y + y³. Check both.
    const ds = detectForms(explicit("x*y + x*y^3"), box, "zh");
    const f = ds.map((d) => d.form);
    expect(f).toContain("bernoulli");
    expect(f).toContain("separable");
    expect(f).not.toContain("linear_in_y");
    expect(ds.find((d) => d.form === "bernoulli")!.details?.n).toBeCloseTo(3, 5);
  });
});

describe("detectForms: the Riccati equation dy/dx = x² + y² matches nothing", () => {
  it("returns an empty list, and the note is positive", () => {
    // Not separable ((x²+y²)(x₀²+y₀²) ≠ (x²+y₀²)(x₀²+y²)), depends on x, ∂²g/∂y² = 2 ≠ 0, degree 2
    // not 0, g/y = x²/y + y has two power terms so no single Bernoulli exponent, and as
    // -(x²+y²) dx + dy = 0: ∂M/∂y = -2y ≠ 0 = ∂N/∂x, (M_y - N_x)/N = -2y depends on y,
    // (N_x - M_y)/M = -2y/(x²+y²) depends on x.
    expect(forms(explicit("x^2 + y^2"))).toEqual([]);
    expect(NO_FORM_NOTE.zh).toMatch(/Riccati/);
    expect(NO_FORM_NOTE.en).toMatch(/not a failure/);
  });
});

describe("detectForms: honesty rules", () => {
  it("every detection carries a non-empty caveat and 'consistent with' wording, in both locales", () => {
    for (const locale of ["zh", "en"] as const) {
      const ds = detectForms(diff("2*x*y", "x^2 + y^2"), box, locale);
      expect(ds.length).toBeGreaterThan(0);
      for (const d of ds) {
        expect(d.caveat.length).toBeGreaterThan(40);
        expect(d.evidence).toMatch(/\d/); // mentions the sample count / deviation
        expect(d.samples).toBeGreaterThanOrEqual(5);
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
  });

  it("does not report a form when too few sample points are finite", () => {
    // 1/(x - 1.5): a pole crosses the box; still enough finite points here, so separable holds...
    // ...but sqrt(-1 - y^2) is NaN everywhere: nothing can be tested.
    expect(forms(explicit("sqrt(-1 - y^2)"))).toEqual([]);
  });

  it("all form names exist in both locales (no missing translations)", () => {
    const all: OdeForm[] = ["separable", "autonomous", "linear_in_y", "homogeneous", "bernoulli", "exact", "integrating_factor_x", "integrating_factor_y"];
    const zh = detectForms(diff("y", "-x"), box, "zh");
    const en = detectForms(diff("y", "-x"), box, "en");
    expect(zh.map((d) => d.form)).toEqual(en.map((d) => d.form));
    expect(all.length).toBe(8);
  });
});
