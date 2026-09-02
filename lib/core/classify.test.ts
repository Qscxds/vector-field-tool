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

  it("scales the tolerance with the matrix: a huge matrix with a relatively tiny eigenvalue is non-hyperbolic", () => {
    // det = 1e6 * (1e6 + 1e-4) - 1e6 * 1e6 = 100; the quadratic tolerance for entries of size 1e6 is
    // 1e-9 * 1e12 = 1e3, so |det| = 100 counts as zero. Eigenvalues are ~2e6 and ~5e-5: the small
    // one is 2.5e-11 of the large one, far below the 1e-9 relative resolution we claim.
    expect(classify([[1e6, 1e6], [1e6, 1e6 + 1e-4]]).classification).toBe("non_hyperbolic");
  });

  it("is purely relative: slow but hyperbolic systems keep their type", () => {
    expect(classify([[-1e-3, 0], [0, -2e-3]]).classification).toBe("stable_node");
    expect(classify([[1e-3, 0], [0, -1e-3]]).classification).toBe("saddle");
    expect(classify([[-1e-5, 0], [0, -2e-5]]).classification).toBe("stable_node");
    expect(classify([[1e-5, 0], [0, -1e-5]]).classification).toBe("saddle");
    expect(classify([[-1e-7, -1e-6], [1e-6, -1e-7]]).classification).toBe("stable_spiral");
  });

  it("the zero matrix is non-hyperbolic", () => {
    expect(classify([[0, 0], [0, 0]]).classification).toBe("non_hyperbolic");
  });

  it("pins the centre / spiral boundary at 1e-9 relative", () => {
    // trace 2e-8 on a matrix of size 1: above the 1e-9 band -> a (very slow) spiral
    expect(classify([[1e-8, -1], [1, 1e-8]]).classification).toBe("unstable_spiral");
    expect(classify([[-1e-8, -1], [1, -1e-8]]).classification).toBe("stable_spiral");
    // trace 2e-10: inside the band -> honest answer
    expect(classify([[1e-10, -1], [1, 1e-10]]).classification).toBe("center_or_weak_spiral");
  });

  it("star vs degenerate is decided at the sqrt(tol) level, consistently with the discriminant band", () => {
    // disc = (a-d)^2 = 4e-12 <= 1e-9: repeated within tolerance. |a-d| = 2e-6 <= sqrt(1e-9) ~ 3.2e-5 -> star.
    expect(classify([[1 + 1e-6, 0], [0, 1 - 1e-6]]).classification).toBe("star_node");
    // A genuine Jordan block stays degenerate.
    expect(classify([[3, 1], [0, 3]]).classification).toBe("degenerate_node");
    // Off-diagonal 1e-4 with disc = 0: b is above the sqrt(tol) level -> degenerate.
    expect(classify([[2, 1e-4], [0, 2]]).classification).toBe("degenerate_node");
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
