/**
 * Numerical Jacobian (central differences) and closed-form 2x2 eigenvalues.
 */
import type { CompiledSystem } from "./parse";
import type { Complex, Matrix2, Vec2 } from "./types";

/**
 * Central-difference Jacobian at p. The step is relative, 1e-6 * max(1, |p|), because a fixed
 * 1e-6 loses most of its digits far from the origin. Entries may be non-finite if the field is
 * singular near p; callers (classify) treat that as "cannot decide".
 */
export function jacobianAt(sys: CompiledSystem, p: Vec2, h?: number, t = 0): Matrix2 {
  const step = h ?? 1e-6 * Math.max(1, Math.hypot(p.x, p.y));
  const fxp = sys.eval({ x: p.x + step, y: p.y }, t);
  const fxm = sys.eval({ x: p.x - step, y: p.y }, t);
  const fyp = sys.eval({ x: p.x, y: p.y + step }, t);
  const fym = sys.eval({ x: p.x, y: p.y - step }, t);
  const inv = 1 / (2 * step);
  return [
    [(fxp.x - fxm.x) * inv, (fyp.x - fym.x) * inv],
    [(fxp.y - fxm.y) * inv, (fyp.y - fym.y) * inv],
  ];
}

/**
 * Jacobian with an error estimate: central differences at h and 2h (truncation ≈ |J_h - J_2h| / 3,
 * the leading h² term) plus the rounding floor eps * |f| / h. Callers use the error as the level
 * below which an entry is zero for this problem (review C4): a finite-difference Jacobian of
 * ~1e-12 at a double root is zero, an O(1) Jacobian in a field whose box-wide median is 1e9 is not.
 */
export function jacobianWithError(sys: CompiledSystem, p: Vec2, t = 0): { J: Matrix2; error: number } {
  const h = 1e-6 * Math.max(1, Math.hypot(p.x, p.y));
  const J = jacobianAt(sys, p, h, t);
  const J2 = jacobianAt(sys, p, 2 * h, t);
  let truncation = 0;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) truncation = Math.max(truncation, Math.abs(J[i][j] - J2[i][j]) / 3);
  const mags = [sys.eval({ x: p.x + h, y: p.y }, t), sys.eval({ x: p.x - h, y: p.y }, t), sys.eval({ x: p.x, y: p.y + h }, t), sys.eval({ x: p.x, y: p.y - h }, t)]
    .flatMap((v) => [Math.abs(v.x), Math.abs(v.y)])
    .filter(Number.isFinite);
  const rounding = (4 * 2.220446049250313e-16 * (mags.length ? Math.max(...mags) : 0)) / (2 * h);
  return { J, error: Number.isFinite(truncation) ? truncation + rounding : Infinity };
}

export function trace(J: Matrix2): number {
  return J[0][0] + J[1][1];
}

export function determinant(J: Matrix2): number {
  return J[0][0] * J[1][1] - J[0][1] * J[1][0];
}

/**
 * Eigenvalues of a 2x2 matrix from the characteristic polynomial λ² - tr λ + det = 0.
 * Real pairs are returned largest first; complex pairs with positive imaginary part first.
 */
export function eigenvalues2(J: Matrix2): [Complex, Complex] {
  const tr = trace(J);
  const det = determinant(J);
  const disc = tr * tr - 4 * det;
  if (disc >= 0) {
    const s = Math.sqrt(disc);
    return [
      { re: (tr + s) / 2, im: 0 },
      { re: (tr - s) / 2, im: 0 },
    ];
  }
  const im = Math.sqrt(-disc) / 2;
  return [
    { re: tr / 2, im },
    { re: tr / 2, im: -im },
  ];
}
