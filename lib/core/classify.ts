/**
 * Linear classification of an equilibrium from its Jacobian.
 *
 * Honesty over confidence. Floating point cannot tell Re(λ) = 0 from Re(λ) = 1e-14, and those are
 * different phase portraits (a true centre vs an extremely slow spiral). So a purely imaginary pair
 * is reported as 'center_or_weak_spiral' with a caveat, never as a centre; a vanishing determinant
 * is reported as 'non_hyperbolic' with a caveat, because linearisation then says nothing about
 * stability. Caveats are keys into bilingual sentences (lib/labels.ts) meant to be read aloud to a
 * student.
 *
 * All decisions are made on the matrix normalised by its largest entry: the classification is
 * invariant under positive scaling, the tolerance becomes purely relative, and no intermediate
 * product can overflow (entries up to Number.MAX_VALUE stay classifiable).
 *
 * Two regimes for "det ~ 0", "trace ~ 0" and "discriminant ~ 0" (J.5c, review J items 6 and 9):
 * - no error given (a bare matrix): purely relative, |det| <= tol on the normalised matrix.
 *   That is the resolution we CLAIM for a matrix we know nothing else about.
 * - an error given (the local numerical error of the entries, from findEquilibria; `entryErrors`
 *   per entry, or the older scalar `zeroFloor` for all four): decisions are error-based, by
 *   first-order propagation: det = ad - bc moves by at most e_a |d| + e_d |a| + e_b |c| + e_c |b|,
 *   the trace by e_a + e_d, the discriminant (a - d)² + 4bc by 2 |a - d| (e_a + e_d) +
 *   4 (e_b |c| + e_c |b|). J = diag(1e10, -1) with e ~ 1e-6 then has a resolvable determinant
 *   (-1e10 against an error of ~1e4) and is a saddle, whereas the relative rule would call
 *   |det| / scale² = 1e-10 zero and hide the perfectly good eigenvalue -1; and per-entry errors
 *   let [[1e8, 1], [-1, 1e-8]] keep its determinant 2 (the 1e8 entry's rounding is ~4e-8 but
 *   multiplies |d| = 1e-8, and the 1e-8 entry is measured to ~1e-24).
 *   The repeated-root band is then error-based too: a discriminant within its propagated error is
 *   zero to precision, and the verdict (star or degenerate node) ALWAYS carries the repeatedRoot
 *   caveat, because the matrix is only known to within its error and an exactly zero difference
 *   of two finite-difference entries is a coincidence of rounding, not a fact (identical lattice
 *   points of x' = sin(πx), y' = sin(πy) used to get the caveat "at random").
 */
import { determinant, eigenvalues2, trace } from "./jacobian";
import type { Complex, Matrix2 } from "./types";

export type Classification =
  | "stable_node"
  | "unstable_node"
  | "saddle"
  | "stable_spiral"
  | "unstable_spiral"
  | "star_node"
  | "degenerate_node"
  | "center_or_weak_spiral"
  | "non_hyperbolic";

/**
 * Which honesty caveat applies. The student-facing sentences live in lib/labels.ts (per locale);
 * consumers must show the sentence for this key verbatim.
 */
export type CaveatKey = "center" | "nonHyperbolic" | "notFinite" | "repeatedRoot" | "domainEdge";

export type ClassifyResult = {
  classification: Classification;
  /** Computed directly from J; may overflow to ±Infinity for astronomically large entries. */
  trace: number;
  /** Computed directly from J; may overflow to ±Infinity for astronomically large entries. */
  determinant: number;
  eigenvalues: Complex[];
  /** Present whenever the linear analysis is not conclusive. */
  caveat?: CaveatKey;
};

const CAVEATS: Record<CaveatKey, CaveatKey> = { center: "center", nonHyperbolic: "nonHyperbolic", notFinite: "notFinite", repeatedRoot: "repeatedRoot", domainEdge: "domainEdge" };

export type ClassifyOptions = {
  /**
   * Absolute level below which an entry of J is zero for this problem: the error estimate of the
   * numerical Jacobian (jacobianWithError), scaled by the caller. At a multiple root
   * (f = (x² - 1)²) Newton stops a hair from the root and the finite-difference Jacobian is
   * ~1e-12 x I with an error of the same size, which a purely relative classification would call
   * a perfectly good star node. Never derive this from a box-wide statistic (review C4): an O(1)
   * saddle in a field whose median over a huge box is 1e9 is still a saddle. Without this option
   * (and without entryErrors) the classification is purely relative; with it, the determinant,
   * trace and discriminant zero decisions are error-based (see the file header), so an ill-scaled
   * Jacobian keeps its resolvable eigenvalues. One level for all four entries.
   */
  zeroFloor?: number;
  /**
   * Per-entry absolute errors (same layout as J), the precise form of zeroFloor: each entry's own
   * truncation and rounding (jacobianWithError.errors, scaled by the caller). Takes precedence
   * over zeroFloor when given. Non-finite or negative entries disable the error-based regime.
   */
  entryErrors?: Matrix2;
};

/**
 * @param tol Relative tolerance (default 1e-9), applied to the matrix normalised by its largest
 *            entry: linear in the entries for eigenvalue real parts, quadratic for determinant and
 *            discriminant.
 */
export function classify(J: Matrix2, tol = 1e-9, opts: ClassifyOptions = {}): ClassifyResult {
  const entries = [J[0][0], J[0][1], J[1][0], J[1][1]];
  const tr = trace(J);
  const det = determinant(J);

  if (!entries.every(Number.isFinite)) {
    return { classification: "non_hyperbolic", trace: tr, determinant: det, eigenvalues: [], caveat: CAVEATS.notFinite };
  }

  const scale = Math.max(...entries.map(Math.abs));
  if (!(scale > 0)) {
    return { classification: "non_hyperbolic", trace: tr, determinant: det, eigenvalues: [{ re: 0, im: 0 }, { re: 0, im: 0 }], caveat: CAVEATS.nonHyperbolic };
  }
  const errors: Matrix2 | undefined = opts.entryErrors
    ? opts.entryErrors
    : opts.zeroFloor !== undefined
      ? [[opts.zeroFloor, opts.zeroFloor], [opts.zeroFloor, opts.zeroFloor]]
      : undefined;
  const flatErrors = errors ? errors.flat() : [];
  const errorBased = errors !== undefined && flatErrors.every((e) => Number.isFinite(e) && e >= 0);
  if (errorBased && entries.every((v, k) => Math.abs(v) <= flatErrors[k])) {
    // Every entry is within the numerical error of zero: both eigenvalues vanish to precision.
    return { classification: "non_hyperbolic", trace: tr, determinant: det, eigenvalues: eigenvalues2(J), caveat: CAVEATS.nonHyperbolic };
  }

  // Normalised matrix: every entry in [-1, 1], so products cannot overflow.
  const N: Matrix2 = [
    [J[0][0] / scale, J[0][1] / scale],
    [J[1][0] / scale, J[1][1] / scale],
  ];
  const [[a, b], [c, d]] = N;
  const trN = a + d;
  const detN = a * d - b * c;
  // (a - d)² + 4bc, not tr² - 4 det: the latter cancels to rounding noise (~4 eps) for a near-star
  // matrix, far above the propagated error 2 |a - d| (e_a + e_d) of a repeated root.
  const discN = (a - d) * (a - d) + 4 * b * c;
  const eigenvalues = eigenvalues2(N).map((e) => ({ re: e.re * scale, im: e.im * scale })) as [Complex, Complex];
  const base = { trace: tr, determinant: det, eigenvalues };

  // Zero decisions, on the normalised matrix (e_ij / scale are the normalised entry errors):
  // relative without an error estimate, error-propagated with one. |det| <= e_a |d| + e_d |a| +
  // e_b |c| + e_c |b|, |tr| <= e_a + e_d and |disc| <= 2 |a - d| (e_a + e_d) + 4 (e_b |c| + e_c |b|)
  // in the original units are the same inequalities divided by scale², scale and scale².
  const [ea, eb, ec, ed] = errorBased ? flatErrors.map((e) => e / scale) : [0, 0, 0, 0];
  const detIsZero = errorBased ? Math.abs(detN) <= ea * Math.abs(d) + ed * Math.abs(a) + eb * Math.abs(c) + ec * Math.abs(b) : Math.abs(detN) <= tol;
  const traceIsZero = errorBased ? Math.abs(trN) <= ea + ed : Math.abs(trN) <= tol;
  const discIsZero = errorBased ? Math.abs(discN) <= 2 * Math.abs(a - d) * (ea + ed) + 4 * (eb * Math.abs(c) + ec * Math.abs(b)) : Math.abs(discN) <= tol;

  if (detIsZero) {
    return { classification: "non_hyperbolic", ...base, caveat: CAVEATS.nonHyperbolic };
  }

  if (discIsZero) {
    // Repeated real eigenvalue (non-zero, since det != 0). disc = (a-d)^2 + 4bc, so within the
    // relative band the asymmetry that separates a star (J = λI) from a degenerate node lives at
    // the sqrt(tol) level; using the same level here keeps the two tests consistent. In the
    // error-based regime the split is at the entry errors themselves.
    const epsRoot = Math.sqrt(tol);
    const isScalarMultiple = errorBased
      ? Math.abs(b) <= eb && Math.abs(c) <= ec && Math.abs(a - d) <= ea + ed
      : Math.abs(b) <= epsRoot && Math.abs(c) <= epsRoot && Math.abs(a - d) <= epsRoot;
    // Report the eigenvalue we actually decided on (tr/2 twice), so a slightly negative discriminant
    // inside the band does not leave a complex pair next to a "node" verdict.
    const repeated = { re: (trN / 2) * scale, im: 0 };
    // Inside the band but not exactly zero (H2.8): the two eigenvalues cannot be told apart at
    // working precision. diag(1 + 1e-6, 1 - 1e-6) is called a star node although its eigenvalues
    // differ; the name must come with that admission. An exactly zero discriminant (diag(2, 2),
    // a Jordan block) is a genuine repeated root and needs no caveat, but only for a bare matrix:
    // an entry known to within an error is not exact, so the error-based regime always admits it.
    // The star / degenerate split is itself a tolerance decision: a star node with off-diagonal
    // entries that are tiny but not zero is really a near-Jordan block, so it gets the caveat too.
    const exactStar = b === 0 && c === 0 && a === d;
    const caveat = !errorBased && discN === 0 && (isScalarMultiple ? exactStar : true) ? undefined : CAVEATS.repeatedRoot;
    return { classification: isScalarMultiple ? "star_node" : "degenerate_node", ...base, eigenvalues: [repeated, { ...repeated }], ...(caveat ? { caveat } : {}) };
  }

  if (discN < 0) {
    // complex pair
    if (traceIsZero) {
      return { classification: "center_or_weak_spiral", ...base, caveat: CAVEATS.center };
    }
    return { classification: trN < 0 ? "stable_spiral" : "unstable_spiral", ...base };
  }

  // real, distinct
  if (detN < 0) return { classification: "saddle", ...base };
  return { classification: trN < 0 ? "stable_node" : "unstable_node", ...base };
}
