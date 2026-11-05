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
import { eigenDerivation, eigenLetters, eigenText, snapHint, snapSentence, type EigenSurface } from "./labels-eigen";

function text(locale: "zh" | "en", source: Parameters<typeof linearAnalysisOf>[0], surface: EigenSurface = "web"): string {
  return eigenText(locale, { picture: source.mode, linear: linearAnalysisOf(source), params: Object.keys(source.params ?? {}), surface });
}

describe("the exact derivation", () => {
  it("x' = x + y, y' = 4x + y: λ² − 2λ − 3, λ = 3, −1, ξ = (1, 2), (1, −2), a saddle", () => {
    const t = text("en", { mode: "system", f: "x + y", g: "4*x + y" });
    expect(t).toContain("A = [[1, 1], [4, 1]]");
    expect(t).toContain("det(A − λI) = λ² − 2λ − 3 = 0");
    expect(t).toContain("λ₁ = 3");
    expect(t).toContain("λ₂ = −1");
    expect(t).toContain("(solve (A − λ₁I)·ξ = 0): ξ₁ = (1, 2)");
    expect(t).toContain("ξ₂ = (1, −2)");
    expect(t).toContain("a saddle");
    expect(t).toContain("(x(t), y(t)) = c₁e³ᵗ (1, 2) + c₂e⁻ᵗ (1, −2)");
  });

  it("keeps an irrational eigenvalue exact, with its decimal", () => {
    // x' = y, y' = x + y: λ = (1 ± √5)/2, ξ = (2, 1 ± √5).
    const t = text("zh", { mode: "system", f: "y", g: "x + y" });
    expect(t).toContain("λ₁ = 1/2 + √5/2 ≈ 1.618");
    expect(t).toContain("ξ₁ = (2, 1 + √5)");
  });

  it("writes the equilibrium of an affine system and offsets the solution by it", () => {
    const t = text("en", { mode: "system", f: "x + y - 3", g: "x - y - 1" });
    // In the student's coordinates: x' = 0, y' = 0, never a p or a b of the tool's own.
    expect(t).toContain("solving x' = 0, y' = 0 gives the only equilibrium (x, y) = (2, 1)");
    expect(t).not.toContain("A·p");
    expect(t).toContain("(x(t), y(t)) = (2, 1) + c₁e^(λ₁t) ξ₁");
  });

  it("an exact center says center, and why the list says center-or-weak-spiral", () => {
    const t = text("en", { mode: "system", f: "-y", g: "x" });
    expect(t).toContain("λ = ± i");
    // A = [[0, −1], [1, 0]]: A(1, −i) = (i, 1) = i·(1, −i).
    expect(t).toContain("ξ = (1, −i)");
    expect(t).toContain("Re ξ = (1, 0), imaginary part Im ξ = (0, −1)");
    expect(t).toContain("this is a center");
    expect(t).toContain("counterclockwise");
    expect(t).toContain("center or weak spiral");
  });

  it("a second-order equation speaks of (x, x'), x(t) and the characteristic roots", () => {
    // x'' + 0.5x' + x = 0: λ = −1/4 ± (√15/4)i, ξ = (4, −1 + i√15), clockwise.
    const t = text("en", { mode: "second", equation: "x'' + 0.5*x' + x = 0" });
    expect(t).toContain("Let v = x'");
    expect(t).toContain("(x, x') = (0, 0)");
    expect(t).toContain("λ = −1/4 ± (√15/4)i ≈ −0.25 ± 0.9682i");
    expect(t).toContain("ξ = (4, −1 + i√15)");
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
    expect(t).toContain("η = (0, 1)");
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
  // The pendulum's bottom: J = [[0, 1], [−1, 0]]; disc −4, ξ = (1, 0 + i·2/2) = (1, i): Re ξ = (1, 0), Im ξ = (0, 1); c = −1: clockwise.
  const center: Equilibrium = { at: { x: 0, y: 0 }, jacobian: [[0, 1], [-1, 0]], resolution: 1e-12, classification: "center_or_weak_spiral", trace: 0, determinant: 1, eigenvalues: [{ re: 0, im: 1 }, { re: 0, im: -1 }], caveat: "center" };

  it("lists J, λ and the eigenvector parts per equilibrium, and says why it is not exact", () => {
    const t = eigenText("en", { picture: "system", linear: linearAnalysisOf({ mode: "system", f: "y", g: "-sin(x)" }), equilibria: [center] });
    expect(t).toContain("sin(x) is not linear in x and y");
    expect(t).toContain("Equilibrium (0, 0)");
    expect(t).toContain("J ≈ [[0, 1], [−1, 0]]".replace("−", "-"));
    expect(t).toContain("λ ≈ ±1i");
    expect(t).toContain("ξ ≈ (1, 1i), Re ξ ≈ (1, 0), Im ξ ≈ (0, 1); turning clockwise.");
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
    // The direction scaled so its first component is 1, as the panel writes v₁ = (1, 2).
    expect(s).toContain("(1, 2)");
    expect(s).toContain("straight away from the equilibrium");
  });

  it("a second-order picture names the point (x, x')", () => {
    const snap: Snap = { point: { x: 1, y: -1 }, target: { kind: "line", through: { x: 0, y: 0 }, direction: { x: Math.SQRT1_2, y: -Math.SQRT1_2 }, eigenvalue: -1 }, distancePx: 2 };
    const s = snapSentence(labels("zh"), snap, "second");
    expect(s).toContain("(x, x') =");
    expect(s).toContain("径直趋向平衡点");
  });
});

describe("the second review's findings (round 13)", () => {
  it("a complex pair of a linearization prints Re ξ and Im ξ with one common factor", () => {
    // x'' + 22x' + 200 sin x at (0, 0): J = [[0, 1], [−200, −22]]; disc (0 + 22)² + 4·1·(−200) = −316;
    // ξ = (1, (d − a)/(2b) + i√316/(2b)) = (1, −11 + 8.8882i); check: J ξ = (−11 + 8.8882i, 42 − 195.54i)
    // and λξ with λ = −11 + 8.8882i gives the same second component (−11 + 8.8882i)² = 42 − 195.54i.
    const spiral: Equilibrium = { at: { x: 0, y: 0 }, jacobian: [[0, 1], [-200, -22]], resolution: 1e-12, classification: "stable_spiral", trace: -22, determinant: 200, eigenvalues: [{ re: -11, im: Math.sqrt(316) / 2 }, { re: -11, im: -Math.sqrt(316) / 2 }] };
    const t = eigenText("en", { picture: "second", linear: linearAnalysisOf({ mode: "second", equation: "x'' + 22*x' + 200*sin(x) = 0" }), equilibria: [spiral], surface: "text" });
    expect(t).toContain("ξ ≈ (1, -11 + 8.8882i), Re ξ ≈ (1, -11), Im ξ ≈ (0, 8.8882)");
  });

  it("never names a tool letter like one of the student's parameters", () => {
    // f = a x + b y, g = c x + d y with a = −1, b = 2, c = −2, d = −1: the spiral −1 ± 2i, ξ = (1, i).
    const t = text("en", { mode: "system", f: "a*x + b*y", g: "c*x + d*y", params: { a: -1, b: 2, c: -2, d: -1 } }, "text");
    expect(t).toContain("Re ξ = (1, 0), imaginary part Im ξ = (0, 1)");
    // The constants of the general solution avoid the parameter c.
    expect(t).toContain("e^(αt)[C₁(Re ξ cos βt − Im ξ sin βt) + C₂(Re ξ sin βt + Im ξ cos βt)]");
    expect(t).not.toMatch(/\bc₁|\ba = |\bb = Im/);
    // A parameter A moves the matrix to M.
    const m = text("en", { mode: "system", f: "A*x + y", g: "4*x + y", params: { A: 1 } }, "text");
    expect(m).toContain("(x', y') = M·(x, y) with M = [[1, 1], [4, 1]]");
    expect(m).toContain("det(M − λI) = λ² − 2λ − 3 = 0");
    expect(m).not.toMatch(/\bA\b/);
    expect(eigenLetters(["A", "I", "J", "c"])).toEqual({ A: "M", I: "E", J: "K", c: "C" });
    expect(eigenLetters()).toEqual({ A: "A", I: "I", J: "J", c: "c" });
  });

  it("the tool text says nothing about a picture, a pointer or a panel it does not have", () => {
    const saddle = { mode: "system" as const, f: "x + y", g: "4*x + y" };
    const second = { mode: "second" as const, equation: "x'' + 3*x' + 2*x = 0" };
    const L = labels("en");
    expect(text("en", saddle, "web")).toContain(L.eigen.noteLines);
    expect(text("en", saddle, "widget")).toContain(L.eigen.noteLines);
    expect(text("en", saddle, "text")).not.toContain(L.eigen.noteLines);
    expect(text("en", saddle, "text")).not.toMatch(/pointer|snap|Alt|picture/i);
    // The series panel exists in the web shell only.
    expect(text("en", second, "web")).toContain("Series and solution formula");
    expect(text("en", second, "widget")).not.toContain("Series and solution formula");
    expect(text("en", second, "text")).not.toContain("Series and solution formula");
    // A linearization: no snapping sentence in the text either.
    const numeric = eigenText("en", { picture: "system", linear: linearAnalysisOf({ mode: "system", f: "y", g: "-sin(x)" }), equilibria: [], surface: "text" });
    expect(numeric).not.toMatch(/snap/i);
  });

  it("a center that only rounding made is not certified, and not drawn closed", () => {
    // 0.10000000000000000001 enters as the nearest double, whose shortest decimal is 1/10: tr A = 1/10 − 1/10 = 0
    // exactly, a cancellation of approximate terms. det = −1/100 + 1 = 99/100, disc = −99/25 < 0: a center of THIS system.
    const t = text("en", { mode: "system", f: "0.10000000000000000001*x + y", g: "-x - 0.1*y" }, "web");
    const L = labels("en");
    expect(t).toContain("with the 16-digit decimals put in, tr A = 0");
    expect(t).toContain("tr A is exactly 0, but only because approximate coefficients cancelled");
    expect(t).not.toContain(L.eigen.noteCenterExact);
    expect(t).not.toContain(L.eigen.noteRotationClosed);
    expect(t).toContain(L.eigen.noteRotationOpen);
    // π·y, −π·x: a = d = 0, no cancellation: an exact center, certified.
    const pi = text("en", { mode: "system", f: "pi*y", g: "-pi*x" }, "web");
    expect(pi).toContain(L.eigen.noteCenterExact);
    expect(pi).not.toContain("only because approximate coefficients cancelled");
  });

  it("a tiny eigenvalue's decimal comes from Vieta, never from a cancellation", () => {
    // A = [[√2, 2], [1, √2]] with √2 the double s: disc (s − s)² + 4·2 = 8, λ = s ± √2. λ₂ = s − √2 is about
    // 1e-16 (s is above √2 in its last bits), and det A = s² − 2 = λ₁λ₂, so λ₂ = det / λ₁, never "≈ 0".
    const t = text("en", { mode: "system", f: "sqrt(2)*x + 2*y", g: "x + sqrt(2)*y" });
    const line = t.split("\n").find((l) => l.includes("λ₂ ="))!;
    expect(line).toMatch(/≈ \d(\.\d+)?·10⁻¹⁷$/);
  });

  it("a rounded eigenvalue shows its decimal, and a very long eigenvector prints scaled with ≈", () => {
    // A = [[π, 1], [1, 0]]: λ₁ = (π + √(π² + 4))/2 ≈ 3.433, ξ₁ ∝ (2, −π + √(π² + 4)) = (2, 0.5826) ∝ (1, 0.2913),
    // ξ₂ ∝ (2, −π − √(π² + 4)) ∝ (1, −3.4329).
    const t = text("en", { mode: "system", f: "pi*x + y", g: "x" });
    expect(t).toMatch(/λ₁ = .* ≈ 3\.433\n/);
    expect(t).toContain("ξ₁ ≈ (1, 0.2913)");
    expect(t).toContain("ξ₂ ≈ (1, -3.4329)");
    expect(t).toContain(labels("en").eigen.noteVectorDecimal);
    expect(t).toContain("c₁e^(λ₁t) ξ₁ + c₂e^(λ₂t) ξ₂");
  });

  it("a budget that stopped the exact reading says so", () => {
    const t = eigenText("zh", { picture: "system", linear: { ok: false, failure: { reason: "budget" } }, equilibria: [], surface: "text" });
    expect(t).toContain(labels("zh").eigen.budgetNote);
  });

  it("second-order lines of equilibria and no equilibrium are said in x and x'", () => {
    // x'' + x' = 0: P0 = 0 and G = 0, every constant solves it: the line x' = 0. x'' + x' = 1: P0 = 0, G = 1: none.
    const line = text("en", { mode: "second", equation: "x'' + x' = 0" });
    expect(line).toContain("the whole line x' = 0: every constant is a solution");
    const none = text("en", { mode: "second", equation: "x'' + x' = 1" });
    expect(none).toContain("there is no constant solution and so no equilibrium");
    for (const t of [line, none]) expect(t).not.toMatch(/\(x, y\)|y\(t\)| s·/);
  });
});

describe("snapping words after the second review", () => {
  const L = labels("en");
  const line = (eigenvalue: number, direction: { x: number; y: number }): Snap => ({ point: { x: 1, y: 2 }, target: { kind: "line", through: { x: 0, y: 0 }, direction, eigenvalue }, distancePx: 2 });

  it("an exact λ and direction after =, a rounded one after ≈", () => {
    const exact = snapSentence(L, line(3, { x: 1 / Math.sqrt(5), y: 2 / Math.sqrt(5) }), "system");
    expect(exact).toContain("eigen-direction (1, 2) of the equilibrium (0, 0) (λ = 3)");
    // λ = (1 + √5)/2, direction (2, 1 + √5) ∝ (1, 1.618).
    const golden = (1 + Math.sqrt(5)) / 2;
    const n = Math.hypot(1, golden);
    const rounded = snapSentence(L, line(golden, { x: 1 / n, y: golden / n }), "system");
    expect(rounded).toContain("eigen-direction ≈ (1, 1.618) of the equilibrium (0, 0) (λ ≈ 1.618)");
    expect(snapHint(L, line(golden, { x: 1 / n, y: golden / n }))).toBe("straight-line solution, λ ≈ 1.618");
  });

  it("a finger is not told to hold Alt", () => {
    const s = line(3, { x: 1 / Math.sqrt(5), y: 2 / Math.sqrt(5) });
    expect(snapSentence(L, s, "system")).toMatch(/Hold Alt/);
    expect(snapSentence(L, s, "system", true)).not.toMatch(/Alt/);
    expect(snapSentence(L, s, "system", true)).toContain(L.eigen.snapTouch);
    // Chinese: no space between the two sentences.
    expect(snapSentence(labels("zh"), s, "system")).toContain("。按住 Alt");
  });
});
