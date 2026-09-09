import { describe, expect, it } from "vitest";
import { classify, type CaveatKey, type Classification } from "./classify";
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
  it("never asserts a centre: purely imaginary eigenvalues come with the centre caveat", () => {
    const r = classify([[0, -1], [1, 0]]);
    expect(r.classification).toBe("center_or_weak_spiral");
    expect(r.caveat).toBe("center");
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
    expect(r.caveat).toBe("nonHyperbolic");
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

  it("is invariant under positive scaling even where products would overflow (entries ~1e200)", () => {
    // Classification depends only on the signs/ratios of tr, det and disc, so 1e200 * A has the same
    // type as A. Entries above ~1.3e154 make a*d, b*c and tr² overflow if computed directly.
    const big = 1e200;
    expect(classify([[big, -big], [big, big]]).classification).toBe("unstable_spiral"); // 1e200 (1 ± i)
    expect(classify([[big, 0], [0, big]]).classification).toBe("star_node");
    expect(classify([[big, 0], [0, -big]]).classification).toBe("saddle");
    expect(classify([[-big, 0], [0, -2 * big]]).classification).toBe("stable_node");
    expect(classify([[0, -big], [big, 0]]).classification).toBe("center_or_weak_spiral");
    // The band just above sqrt(MAX_VALUE), where only some products overflow.
    expect(classify([[1.4e154, 0], [0, 1.4e154]]).classification).toBe("star_node");
    expect(classify([[1.4e154, 1.4e154], [-1.4e154, 1.4e154]]).classification).toBe("unstable_spiral");
    // Eigenvalues are reported at the right magnitude, never NaN.
    const r = classify([[big, 0], [0, -big]]);
    expect(r.eigenvalues.map((e) => e.re).sort((p, q) => p - q)).toEqual([-big, big]);
    expect(r.eigenvalues.every((e) => Number.isFinite(e.re) && Number.isFinite(e.im))).toBe(true);
    expect(r.caveat).toBeUndefined();
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

  it("reports a real repeated eigenvalue when the discriminant is slightly negative inside the band", () => {
    // disc = -4e-12: numerically zero for a matrix of size 1. Verdict star node, eigenvalues 1, 1.
    const r = classify([[1, -1e-6], [1e-6, 1]]);
    expect(r.classification).toBe("star_node");
    expect(r.eigenvalues).toEqual([{ re: 1, im: 0 }, { re: 1, im: 0 }]);
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
    expect(r.caveat).toBe("notFinite");
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

describe("repeated roots inside the tolerance band carry a caveat (H2.8)", () => {
  it("diag(1 + 1e-6, 1 - 1e-6): called a star node, but with the repeated-root caveat", () => {
    // Eigenvalues 1 ± 1e-6 differ by 2e-6; disc = 4e-12 is inside the 1e-9 band, not zero.
    const r = classify([[1 + 1e-6, 0], [0, 1 - 1e-6]]);
    expect(r.classification).toBe("star_node");
    expect(r.caveat).toBe("repeatedRoot");
  });

  it("a genuinely repeated root (discriminant exactly zero) needs no caveat", () => {
    expect(classify([[2, 0], [0, 2]]).caveat).toBeUndefined();
    expect(classify([[3, 1], [0, 3]]).caveat).toBeUndefined(); // Jordan block, degenerate node
    expect(classify([[-1, 1], [0, -1]]).caveat).toBeUndefined();
  });

  it("a near-Jordan block is a degenerate node with the caveat", () => {
    // disc = (a-d)² + 4bc = 4e-12 ≠ 0.
    const r = classify([[3, 1], [1e-12, 3]]);
    expect(r.classification).toBe("degenerate_node");
    expect(r.caveat).toBe("repeatedRoot");
  });

  it("a slightly negative discriminant inside the band is also a near-repeated root", () => {
    // disc = (a-d)² + 4bc = -4e-12: inside the 1e-9 band, not zero. (With b, c = ±1e-12 the
    // product 1e-24 would vanish against 1 in double precision and the discriminant would be
    // exactly zero: that matrix IS the identity at working precision.)
    const r = classify([[1, -1e-6], [1e-6, 1]]);
    expect(r.classification).toBe("star_node");
    expect(r.caveat).toBe("repeatedRoot");
    // [[1, -1e-12], [1e-12, 1]] is, in exact arithmetic, a slow spiral (eigenvalues 1 ± 1e-12 i); in
    // double precision its discriminant is exactly 0 but the off-diagonals are not: still a caveat.
    expect(classify([[1, -1e-12], [1e-12, 1]]).classification).toBe("star_node");
    expect(classify([[1, -1e-12], [1e-12, 1]]).caveat).toBe("repeatedRoot");
  });

  it("a Jacobian within the numerical error of zero is zero, not a small star node", () => {
    // Purely relative: 1e-12 x I is a star node like any other multiple of the identity.
    expect(classify([[1e-12, 0], [0, 1e-12]]).classification).toBe("star_node");
    // With the finite-difference error of the Jacobian known to be ~4e-12, entries of 1e-12 are zero.
    const r = classify([[1e-12, 0], [0, 1e-12]], 1e-9, { zeroFloor: 4e-11 });
    expect(r.classification).toBe("non_hyperbolic");
    expect(r.caveat).toBe("nonHyperbolic");
    // A genuinely slow but hyperbolic system keeps its type: entries 1e-6 with an error of 1e-15.
    expect(classify([[1e-6, 0], [0, -1e-6]], 1e-9, { zeroFloor: 1e-14 }).classification).toBe("saddle");
    // and an O(1) saddle is a saddle whatever the field does elsewhere in the box
    expect(classify([[0, 1], [6, -1]], 1e-9, { zeroFloor: 1e-10 }).classification).toBe("saddle");
  });

  it("a star node decided with off-diagonal entries that are tiny but not zero carries the caveat", () => {
    // disc = 0 exactly (a = d, c = 0) but b = 1e-5 lies inside the sqrt(tol) band: this matrix has a
    // single eigenvector, so 'star node' is a tolerance verdict, not a fact.
    const r = classify([[2, 1e-5], [0, 2]]);
    expect(r.classification).toBe("star_node");
    expect(r.caveat).toBe("repeatedRoot");
    expect(classify([[2, 0], [0, 2]]).caveat).toBeUndefined();
  });
});

describe("error-based zero decisions for ill-scaled Jacobians (J.5c)", () => {
  it("diag(1e10, -1) with an entry error of 4.4e-5 is a saddle with eigenvalues 1e10 and -1", () => {
    // |det| = 1e10; first-order propagation of an entry error e gives an error of at most
    // e (|a| + |b| + |c| + |d|) = 4.4e-5 · (1e10 + 1) ~ 4.4e5 on det: not zero. Without an error
    // estimate the purely relative rule (|det| / scale² = 1e-10 < 1e-9) calls it non_hyperbolic,
    // which is all one can claim about a bare matrix.
    const r = classify([[1e10, 0], [0, -1]], 1e-9, { zeroFloor: 4.4e-5 });
    expect(r.classification).toBe("saddle");
    expect(r.caveat).toBeUndefined();
    // Eigenvalues come from the normalized matrix diag(1, -1e-10): (tr ± sqrt(disc)) / 2 with
    // absolute rounding ~1e-16, scaled back by 1e10, so the small one is -1 to about 1e-6.
    const eig = r.eigenvalues.map((e) => e.re).sort((a, b) => a - b);
    expect(Math.abs(eig[1] / 1e10 - 1)).toBeLessThan(1e-9);
    expect(Math.abs(eig[0] + 1)).toBeLessThan(1e-5);
    expect(classify([[1e10, 0], [0, -1]]).classification).toBe("non_hyperbolic");
  });

  it("the boundary is where the small eigenvalue meets the entry error", () => {
    // e = 4.4e-5: det = 1e10 · d is zero iff 1e10 |d| <= 4.4e-5 · (1e10 + |d|), i.e. |d| <~ 4.4e-5.
    expect(classify([[1e10, 0], [0, 1e-7]], 1e-9, { zeroFloor: 4.4e-5 }).classification).toBe("non_hyperbolic");
    expect(classify([[1e10, 0], [0, 1e-3]], 1e-9, { zeroFloor: 4.4e-5 }).classification).toBe("unstable_node");
  });

  it("the trace is zero when |tr| <= 2e", () => {
    // [[1e-13, -1], [1, 1e-13]]: complex pair with real part 1e-13, trace 2e-13.
    expect(classify([[1e-13, -1], [1, 1e-13]], 1e-9, { zeroFloor: 1e-12 }).classification).toBe("center_or_weak_spiral");
    expect(classify([[1e-13, -1], [1, 1e-13]], 1e-9, { zeroFloor: 1e-14 }).classification).toBe("unstable_spiral");
  });

  it("the repeated-root band is error-based too (review J item 9): diag(1 + 1e-6, 1 - 1e-6) is resolved with an entry error of 1e-12", () => {
    // disc = (a - d)² = 4e-12 against its propagated error 2 |a - d| (e_a + e_d) = 2 · 2e-6 · 2e-12
    // = 8e-18: the eigenvalues 1 ± 1e-6 are told apart, both positive -> unstable node, no caveat.
    // (Before J.9 the band stayed relative and called this a star node with the caveat.)
    const r = classify([[1 + 1e-6, 0], [0, 1 - 1e-6]], 1e-9, { zeroFloor: 1e-12 });
    expect(r.classification).toBe("unstable_node");
    expect(r.caveat).toBeUndefined();
    expect(r.eigenvalues.map((e) => e.re).sort()).toEqual([1 - 1e-6, 1 + 1e-6]);
    // With an entry error of 1e-5 the difference 2e-6 is within error: 4e-12 <= 2 · 2e-6 · 2e-5 =
    // 8e-11 -> repeated root to precision; |a - d| = 2e-6 <= e_a + e_d -> star node, with the caveat.
    const coarse = classify([[1 + 1e-6, 0], [0, 1 - 1e-6]], 1e-9, { zeroFloor: 1e-5 });
    expect(coarse.classification).toBe("star_node");
    expect(coarse.caveat).toBe("repeatedRoot");
  });

  it("J.6: per-entry errors keep the determinant of [[1e8, 1], [-1, 1e-8]] (det = 2)", () => {
    // Finite-difference errors at the origin of x' = 1e8 x + y, y' = -x + 1e-8 y: e_a ~ 4.4e-8
    // (rounding of |f| = 100 on the x stencil), e_b ~ 4.4e-16, e_c ~ 4.4e-16, e_d ~ 4.4e-24.
    // err(det) = e_a |d| + e_d |a| + e_b |c| + e_c |b| ~ 4.4e-16 + 4.4e-16 + 4.4e-16 + 4.4e-16 ~ 2e-15
    // << 2. tr = 1e8 + 1e-8 > 0, disc = (a - d)² + 4bc = 1e16 - 4 > 0: real, both positive
    // (eigenvalues ~1e8 and det / 1e8 = 2e-8) -> unstable node.
    const J: Matrix2 = [[1e8, 1], [-1, 1e-8]];
    const r = classify(J, 1e-9, { entryErrors: [[4.4e-8, 4.4e-16], [4.4e-16, 4.4e-24]] });
    expect(r.classification).toBe("unstable_node");
    expect(r.caveat).toBeUndefined();
    const eig = r.eigenvalues.map((e) => e.re).sort((a, b) => a - b);
    expect(eig[1] / 1e8).toBeCloseTo(1, 9);
    expect(eig[0] / 2e-8).toBeCloseTo(1, 6);
    // One error for all entries (the largest, 4.4e-8) hides it: 4.4e-8 (1e8 + 1 + 1 + 1e-8) ~ 4.4 > 2.
    expect(classify(J, 1e-9, { zeroFloor: 4.4e-8 }).classification).toBe("non_hyperbolic");
    // A non-finite entry error disables the error-based regime (purely relative: det / scale² = 2e-16 -> zero).
    expect(classify(J, 1e-9, { entryErrors: [[Infinity, 0], [0, 0]] }).classification).toBe("non_hyperbolic");
  });

  it("J.9: in the error-based regime a repeated root always carries the caveat, exact or not", () => {
    // Two finite-difference Jacobians of the same star node diag(π, π): one came out bit-identical
    // on the diagonal, the other differs by 1.3e-10 (rounding of the located root). With entry
    // errors of 4e-9 both discriminants are zero to precision ((1.3e-10)² <= 2 · 1.3e-10 · 8e-9),
    // both are star nodes (|a - d| <= e_a + e_d), and both must say so with the same caveat: the
    // matrix is only known to within its error, so an exactly zero difference is no more a fact.
    const errors: Matrix2 = [[4e-9, 4e-9], [4e-9, 4e-9]];
    const exact = classify([[Math.PI, 0], [0, Math.PI]], 1e-9, { entryErrors: errors });
    const noisy = classify([[Math.PI, 0], [0, Math.PI + 1.3e-10]], 1e-9, { entryErrors: errors });
    for (const r of [exact, noisy]) {
      expect(r.classification).toBe("star_node");
      expect(r.caveat).toBe("repeatedRoot");
      expect(r.eigenvalues[0].re).toBeCloseTo(Math.PI, 9);
    }
    // Without an error estimate the bare rule stands: an exactly zero discriminant needs no caveat.
    expect(classify([[Math.PI, 0], [0, Math.PI]]).caveat).toBeUndefined();
  });

  it("domainEdge is a caveat key consumers can look up", () => {
    // Attached by findEquilibria; classify itself never produces it (it does not see the field).
    const keys: CaveatKey[] = ["center", "nonHyperbolic", "notFinite", "repeatedRoot", "domainEdge"];
    expect(keys).toHaveLength(5);
  });
});
