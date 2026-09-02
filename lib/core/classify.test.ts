import { describe, expect, it } from "vitest";
import { classify, type Classification } from "./classify";
import type { Matrix2 } from "./types";

// Textbook table for x' = A x. Expectations follow from trace/determinant/discriminant by hand.
const cases: Array<[Matrix2, Classification, string]> = [
  [[[1, 0], [0, -1]], "saddle", "eigenvalues 1, -1"],
  [[[-1, 0], [0, -2]], "stable_node", "eigenvalues -1, -2"],
  [[[2, 0], [0, 3]], "unstable_node", "eigenvalues 2, 3"],
  [[[-1, -1], [1, -1]], "stable_spiral", "eigenvalues -1 ± i"],
  [[[1, -1], [1, 1]], "unstable_spiral", "eigenvalues 1 ± i"],
  [[[0, -1], [1, 0]], "center_or_weak_spiral", "eigenvalues ± i"],
  [[[-1, 1], [0, -1]], "degenerate_node", "eigenvalue -1 twice, one eigenvector"],
  [[[2, 0], [0, 2]], "star_node", "eigenvalue 2 twice, two eigenvectors"],
  [[[0, 1], [0, 0]], "non_hyperbolic", "eigenvalue 0 twice"],
];

describe("classify: textbook linear systems", () => {
  for (const [A, expected, why] of cases) {
    it(`${JSON.stringify(A)} -> ${expected} (${why})`, () => {
      const r = classify(A);
      expect(r.classification).toBe(expected);
      expect(r.trace).toBe(A[0][0] + A[1][1]);
      expect(r.determinant).toBe(A[0][0] * A[1][1] - A[0][1] * A[1][0]);
      expect(r.eigenvalues).toHaveLength(2);
    });
  }
});

describe("classify: honesty rules", () => {
  it("never asserts a centre: purely imaginary eigenvalues come with a caveat", () => {
    const r = classify([[0, -1], [1, 0]]);
    expect(r.classification).toBe("center_or_weak_spiral");
    expect(r.caveat).toBeTruthy();
    expect(r.caveat!.length).toBeGreaterThan(20);
  });

  it("treats a tiny real part as indistinguishable from zero", () => {
    const r = classify([[1e-13, -1], [1, 1e-13]]);
    expect(r.classification).toBe("center_or_weak_spiral");
  });

  it("but a clearly non-zero real part is a spiral", () => {
    expect(classify([[-1e-3, -1], [1, -1e-3]]).classification).toBe("stable_spiral");
    expect(classify([[1e-3, -1], [1, 1e-3]]).classification).toBe("unstable_spiral");
  });

  it("flags det ≈ 0 as non-hyperbolic with a caveat, even with a non-zero eigenvalue", () => {
    const r = classify([[-1, 0], [0, 1e-12]]);
    expect(r.classification).toBe("non_hyperbolic");
    expect(r.caveat).toContain("Hartman");
  });

  it("scales the tolerance with the matrix: a large matrix with det = 0 is still non-hyperbolic", () => {
    // det = 1e6 * 1e6 - 1e6 * 1e6 = 0 exactly, but rounding of similar matrices lands near 1e-4.
    expect(classify([[1e6, 1e6], [1e6, 1e6 + 1e-4]]).classification).toBe("non_hyperbolic");
  });

  it("does not over-apply the tolerance to a genuinely small but hyperbolic matrix", () => {
    expect(classify([[-1e-3, 0], [0, -2e-3]]).classification).toBe("stable_node");
    expect(classify([[1e-3, 0], [0, -1e-3]]).classification).toBe("saddle");
  });

  it("gives no caveat for hyperbolic cases", () => {
    expect(classify([[1, 0], [0, -1]]).caveat).toBeUndefined();
    expect(classify([[-1, -1], [1, -1]]).caveat).toBeUndefined();
    expect(classify([[2, 0], [0, 2]]).caveat).toBeUndefined();
  });

  it("handles a non-finite Jacobian without throwing", () => {
    const r = classify([[Infinity, 0], [0, 1]]);
    expect(r.classification).toBe("non_hyperbolic");
    expect(r.eigenvalues).toEqual([]);
    expect(r.caveat).toBeTruthy();
  });
});

describe("classify: known physical systems", () => {
  it("damped oscillator x'=y, y'=-x-0.5y is a stable spiral with λ = -1/4 ± i√15/4", () => {
    const r = classify([[0, 1], [-1, -0.5]]);
    expect(r.classification).toBe("stable_spiral");
    expect(r.eigenvalues[0].re).toBeCloseTo(-0.25, 12);
    expect(Math.abs(r.eigenvalues[0].im)).toBeCloseTo(Math.sqrt(15) / 4, 12);
  });

  it("Van der Pol at the origin, x'=y, y'=(1-x²)y-x, is an unstable spiral", () => {
    // Jacobian at 0: [[0, 1], [-1, 1]] -> tr 1, det 1, disc -3
    expect(classify([[0, 1], [-1, 1]]).classification).toBe("unstable_spiral");
  });
});
