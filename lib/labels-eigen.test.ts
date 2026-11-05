/**
 * Round 13: the eigen panel's words. The exact numbers were derived by hand in
 * lib/eigen/linear-system.test.ts; here the derivation must SAY them, in both languages, in the
 * student's notation, with every placeholder filled.
 */
import { describe, expect, it } from "vitest";
import type { Equilibrium } from "./core/equilibria";
import type { Snap } from "./eigen/geometry";
import { linearAnalysisOf } from "./eigen/linear-system";
import { labels, LOCALES } from "./labels";
import { eigenDerivation, eigenText, snapHint, snapSentence } from "./labels-eigen";

function text(locale: "zh" | "en", source: Parameters<typeof linearAnalysisOf>[0]): string {
  return eigenText(locale, { picture: source.mode, linear: linearAnalysisOf(source) });
}

describe("the exact derivation", () => {
  it("x' = x + y, y' = 4x + y: λ² − 2λ − 3, λ = 3, −1, v = (1, 2), (1, −2), a saddle", () => {
    const t = text("en", { mode: "system", f: "x + y", g: "4*x + y" });
    expect(t).toContain("A = [[1, 1], [4, 1]]");
    expect(t).toContain("det(A − λI) = λ² − 2λ − 3 = 0");
    expect(t).toContain("λ₁ = 3");
    expect(t).toContain("λ₂ = −1");
    expect(t).toContain("v₁ = (1, 2)");
    expect(t).toContain("v₂ = (1, −2)");
    expect(t).toContain("a saddle");
    expect(t).toContain("(x(t), y(t)) = c₁e³ᵗ (1, 2) + c₂e⁻ᵗ (1, −2)");
  });

  it("keeps an irrational eigenvalue exact, with its decimal", () => {
    // x' = y, y' = x + y: λ = (1 ± √5)/2, v = (2, 1 ± √5).
    const t = text("zh", { mode: "system", f: "y", g: "x + y" });
    expect(t).toContain("λ₁ = 1/2 + √5/2 ≈ 1.618");
    expect(t).toContain("v₁ = (2, 1 + √5)");
  });

  it("writes the equilibrium of an affine system and offsets the solution by it", () => {
    const t = text("en", { mode: "system", f: "x + y - 3", g: "x - y - 1" });
    expect(t).toContain("p = (2, 1)");
    expect(t).toContain("(x(t), y(t)) = (2, 1) + c₁e^(λ₁t) v₁");
  });

  it("an exact center says center, and why the list says center-or-weak-spiral", () => {
    const t = text("en", { mode: "system", f: "-y", g: "x" });
    expect(t).toContain("λ = ± i");
    expect(t).toContain("v = (1, −i)");
    expect(t).toContain("a = Re v = (1, 0), b = Im v = (0, −1)");
    expect(t).toContain("this is a center");
    expect(t).toContain("counterclockwise");
    expect(t).toContain("center or weak spiral");
  });

  it("a second-order equation speaks of (x, x'), x(t) and the characteristic roots", () => {
    // x'' + 0.5x' + x = 0: λ = −1/4 ± (√15/4)i, v = (4, −1 + i√15), clockwise.
    const t = text("en", { mode: "second", equation: "x'' + 0.5*x' + x = 0" });
    expect(t).toContain("Let v = x'");
    expect(t).toContain("(x, x') = (0, 0)");
    expect(t).toContain("λ = −1/4 ± (√15/4)i ≈ −0.25 ± 0.9682i");
    expect(t).toContain("v = (4, −1 + i√15)");
    expect(t).toContain("clockwise");
    expect(t).toContain("x(t) = e^(αt)(c₁ cos βt + c₂ sin βt)");
    expect(t).toContain("characteristic roots");
    // The kernel's y never shows on a second-order picture (round P).
    expect(t).not.toMatch(/\(x, y\)|y\(t\)/);
  });

  it("a forced constant gives the constant solution and the offset", () => {
    // x'' + 3x' + 2x = 4: λ = −1, −2; equilibrium (2, 0), x ≡ 2; x(t) = 2 + c₁e⁻ᵗ + c₂e⁻²ᵗ.
    const t = text("zh", { mode: "second", equation: "x'' + 3*x' + 2*x = 4" });
    expect(t).toContain("(x, x') = (2, 0)");
    expect(t).toContain("x ≡ 2");
    expect(t).toContain("x(t) = 2 + c₁e⁻ᵗ + c₂e⁻²ᵗ");
  });

  it("a degenerate node writes the generalized eigenvector", () => {
    const t = text("en", { mode: "system", f: "y", g: "-x - 2*y" });
    expect(t).toContain("Discriminant (tr A)² − 4 det A = 0: one repeated eigenvalue.");
    expect(t).toContain("w = (0, 1)");
    expect(t).toContain("(x(t), y(t)) = c₁e⁻ᵗ (1, −1) + c₂e⁻ᵗ(t (1, −1) + (0, 1))");
  });

  it("no equilibrium: says so and writes no formula", () => {
    const t = text("en", { mode: "system", f: "1", g: "x" });
    expect(t).toContain("this system has no equilibrium");
    expect(t).not.toContain("(x(t), y(t)) =");
  });

  it("fills every placeholder in both languages", () => {
    const sources: Parameters<typeof linearAnalysisOf>[0][] = [
      { mode: "system", f: "x + y", g: "4*x + y" },
      { mode: "system", f: "y", g: "x + y" },
      { mode: "system", f: "-y", g: "x" },
      { mode: "system", f: "2*x", g: "2*y" },
      { mode: "system", f: "x + y", g: "2*x + 2*y" },
      { mode: "system", f: "1", g: "x" },
      { mode: "system", f: "pi*y", g: "-pi*x" },
      { mode: "second", equation: "x'' + 2*x' + x = 0" },
    ];
    for (const locale of LOCALES) for (const s of sources) expect(text(locale, s)).not.toMatch(/\{\w+\}/);
  });
});

describe("the numerical linearization", () => {
  // The pendulum's bottom: J = [[0, 1], [−1, 0]]; disc −4, v = (1, 0 + i·2/2) = (1, i): a = (1, 0), b = (0, 1); c = −1: clockwise.
  const center: Equilibrium = { at: { x: 0, y: 0 }, jacobian: [[0, 1], [-1, 0]], resolution: 1e-12, classification: "center_or_weak_spiral", trace: 0, determinant: 1, eigenvalues: [{ re: 0, im: 1 }, { re: 0, im: -1 }], caveat: "center" };

  it("lists J, λ and the eigenvector parts per equilibrium, and says why it is not exact", () => {
    const t = eigenText("en", { picture: "system", linear: linearAnalysisOf({ mode: "system", f: "y", g: "-sin(x)" }), equilibria: [center] });
    expect(t).toContain("sin(x) is not linear in x and y");
    expect(t).toContain("Equilibrium (0, 0)");
    expect(t).toContain("J ≈ [[0, 1], [−1, 0]]".replace("−", "-"));
    expect(t).toContain("λ ≈ ±1i");
    expect(t).toContain("a ≈ (1, 0), b ≈ (0, 1); turning clockwise.");
    expect(t).toContain("center or weak spiral");
  });

  it("no equilibrium found: no eigenvalue, and why", () => {
    const d = eigenDerivation(labels("zh"), { picture: "system", linear: linearAnalysisOf({ mode: "system", f: "x*y + 1", g: "x" }), equilibria: [] });
    expect(d.steps).toHaveLength(0);
    expect(d.notes.length).toBeGreaterThanOrEqual(2);
  });

  it("a non-autonomous picture has no eigenvalue", () => {
    const t = eigenText("en", { picture: "second", linear: null, timeDependent: true });
    expect(t).toContain("there are no eigenvalues to compute");
  });
});

describe("snapping words", () => {
  const L = labels("en");
  it("a line of a linear system is a straight-line solution", () => {
    const snap: Snap = { point: { x: 1, y: 2 }, target: { kind: "line", through: { x: 0, y: 0 }, direction: { x: 1 / Math.sqrt(5), y: 2 / Math.sqrt(5) }, eigenvalue: 3 }, distancePx: 2 };
    expect(snapHint(L, snap)).toBe("straight-line solution, λ = 3");
    const s = snapSentence(L, snap, "system");
    // The direction scaled so its larger component is 1: (0.5, 1).
    expect(s).toContain("(0.5, 1)");
    expect(s).toContain("straight away from the equilibrium");
  });

  it("a second-order picture names the point (x, x')", () => {
    const snap: Snap = { point: { x: 1, y: -1 }, target: { kind: "line", through: { x: 0, y: 0 }, direction: { x: Math.SQRT1_2, y: -Math.SQRT1_2 }, eigenvalue: -1 }, distancePx: 2 };
    const s = snapSentence(labels("zh"), snap, "second");
    expect(s).toContain("(x, x') =");
    expect(s).toContain("径直趋向平衡点");
  });
});
