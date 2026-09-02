/**
 * Linear classification of an equilibrium from its Jacobian.
 *
 * Honesty over confidence. Floating point cannot tell Re(λ) = 0 from Re(λ) = 1e-14, and those are
 * different phase portraits (a true centre vs an extremely slow spiral). So a purely imaginary pair
 * is reported as 'center_or_weak_spiral' with a caveat, never as a centre; a vanishing determinant
 * is reported as 'non_hyperbolic' with a caveat, because linearisation then says nothing about
 * stability. Caveats are complete sentences meant to be read aloud to a student.
 *
 * All decisions are made on the matrix normalised by its largest entry: the classification is
 * invariant under positive scaling, the tolerance becomes purely relative, and no intermediate
 * product can overflow (entries up to Number.MAX_VALUE stay classifiable).
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

export type ClassifyResult = {
  classification: Classification;
  /** Computed directly from J; may overflow to ±Infinity for astronomically large entries. */
  trace: number;
  /** Computed directly from J; may overflow to ±Infinity for astronomically large entries. */
  determinant: number;
  eigenvalues: Complex[];
  /** Present whenever the linear analysis is not conclusive. Read it to the student as-is. */
  caveat?: string;
};

export const CAVEATS = {
  center:
    "线性化给出一对纯虚特征值（实部在数值精度内为零）。仅凭线性化无法区分真正的中心与极缓慢的螺旋：两者的相图完全不同，判定需要守恒量（例如能量或 Hamilton 函数）或更高阶的非线性分析。",
  nonHyperbolic:
    "雅可比矩阵至少有一个特征值在数值精度内为零（行列式约等于零），这个平衡点是非双曲的。Hartman–Grobman 定理不适用，线性化不足以判定它的稳定性，需要中心流形或 Lyapunov 函数等非线性方法。",
  notFinite:
    "在这一点上雅可比矩阵无法求出有限值（向量场在附近奇异或未定义），因此无法给出任何分类。",
} as const;

/**
 * @param tol Relative tolerance (default 1e-9), applied to the matrix normalised by its largest
 *            entry: linear in the entries for eigenvalue real parts, quadratic for determinant and
 *            discriminant.
 */
export function classify(J: Matrix2, tol = 1e-9): ClassifyResult {
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

  // Normalised matrix: every entry in [-1, 1], so products cannot overflow.
  const N: Matrix2 = [
    [J[0][0] / scale, J[0][1] / scale],
    [J[1][0] / scale, J[1][1] / scale],
  ];
  const [[a, b], [c, d]] = N;
  const trN = a + d;
  const detN = a * d - b * c;
  const discN = trN * trN - 4 * detN;
  const eigenvalues = eigenvalues2(N).map((e) => ({ re: e.re * scale, im: e.im * scale })) as [Complex, Complex];
  const base = { trace: tr, determinant: det, eigenvalues };

  if (Math.abs(detN) <= tol) {
    return { classification: "non_hyperbolic", ...base, caveat: CAVEATS.nonHyperbolic };
  }

  if (discN < -tol) {
    // complex pair
    if (Math.abs(trN) <= tol) {
      return { classification: "center_or_weak_spiral", ...base, caveat: CAVEATS.center };
    }
    return { classification: trN < 0 ? "stable_spiral" : "unstable_spiral", ...base };
  }

  if (Math.abs(discN) <= tol) {
    // Repeated real eigenvalue (non-zero, since det != 0). disc = (a-d)^2 + 4bc, so within the
    // discriminant band the asymmetry that separates a star (J = λI) from a degenerate node lives at
    // the sqrt(tol) level; using the same level here keeps the two tests consistent.
    const epsRoot = Math.sqrt(tol);
    const isScalarMultiple = Math.abs(b) <= epsRoot && Math.abs(c) <= epsRoot && Math.abs(a - d) <= epsRoot;
    // Report the eigenvalue we actually decided on (tr/2 twice), so a slightly negative discriminant
    // inside the band does not leave a complex pair next to a "node" verdict.
    const repeated = { re: (trN / 2) * scale, im: 0 };
    return { classification: isScalarMultiple ? "star_node" : "degenerate_node", ...base, eigenvalues: [repeated, { ...repeated }] };
  }

  // real, distinct
  if (detN < 0) return { classification: "saddle", ...base };
  return { classification: trN < 0 ? "stable_node" : "unstable_node", ...base };
}
