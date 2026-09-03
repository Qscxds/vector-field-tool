/**
 * First-order equations.
 *
 * The general representation is the differential form  M(x, y) dx + N(x, y) dy = 0. Its solution
 * curves are the trajectories of the planar system  x' = N, y' = -M  (so dy/dx = -M/N), which
 * lets slope fields reuse every other module. The explicit form dy/dx = g(x, y) is the special
 * case M = -g, N = 1, giving x' = 1, y' = g.
 *
 * Why the differential form is the base and not a branch: textbook exact equations arrive as
 * M dx + N dy = 0, and solution curves with vertical tangents (N = 0) are perfectly finite there,
 * whereas g = -M/N blows up and would be mistaken for a singularity. The direction field is only
 * genuinely undefined where M = N = 0; those points are reported separately.
 */
import { findEquilibria } from "./equilibria";
import { compileScalar, compileSystem } from "./parse";
import type { Box, Range, SystemSpec, Vec2 } from "./types";

export type FirstOrderSpec =
  | { kind: "explicit"; g: string; params?: Record<string, number> }
  | { kind: "differential"; M: string; N: string; params?: Record<string, number> };

/** x' = N, y' = -M. For the explicit form this is x' = 1, y' = g. */
export function toSystem(spec: FirstOrderSpec): SystemSpec {
  const base: SystemSpec =
    spec.kind === "explicit" ? { f: "1", g: spec.g } : { f: spec.N, g: `-(${spec.M})` };
  return spec.params ? { ...base, params: spec.params } : base;
}

/** M and N of the differential form, as expression strings. */
export function toDifferential(spec: FirstOrderSpec): { M: string; N: string } {
  return spec.kind === "explicit" ? { M: `-(${spec.g})`, N: "1" } : { M: spec.M, N: spec.N };
}

/** Backwards-compatible helper: dy/dx = expr as a system. */
export function firstOrderToSystem(expr: string, params?: Record<string, number>): SystemSpec {
  return toSystem(params ? { kind: "explicit", g: expr, params } : { kind: "explicit", g: expr });
}

/** Compiled M and N with the shared parameter set. */
export function compileDifferential(spec: FirstOrderSpec): { M: (p: Vec2) => number; N: (p: Vec2) => number } {
  const { M, N } = toDifferential(spec);
  return { M: compileScalar(M, spec.params), N: compileScalar(N, spec.params) };
}

// ---------------------------------------------------------------------------------------------
// Singular points of the direction field: M = N = 0.
// ---------------------------------------------------------------------------------------------

export type SingularPoints = {
  points: Vec2[];
  warning?: "possible_continuum" | "hit_limit";
};

/**
 * Points where the direction is undefined. They are exactly the equilibria of x' = N, y' = -M,
 * so the Newton search is reused; the classification it computes is meaningless for a direction
 * field and is dropped. The explicit form (N = 1) never has any.
 */
export function firstOrderSingularities(spec: FirstOrderSpec, box: Box, opts: { seedGrid?: number; maxPoints?: number } = {}): SingularPoints {
  if (spec.kind === "explicit") return { points: [] };
  const eq = findEquilibria(compileSystem(toSystem(spec)), box, { seedGrid: opts.seedGrid, maxPoints: opts.maxPoints ?? 20 });
  const out: SingularPoints = { points: eq.points.map((p) => p.at) };
  if (eq.warning === "possible_continuum" || eq.warning === "hit_limit") out.warning = eq.warning;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Constant solutions y = c.
// ---------------------------------------------------------------------------------------------

export type EquilibriumSolution = {
  y: number;
  /**
   * Sign pattern of dy/dx just below and above y = c, at every x probe: stable if solutions
   * approach the line from both sides everywhere, 'varies' if the pattern changes with x.
   */
  stability: "stable" | "unstable" | "semi_stable" | "varies";
};

export type FirstOrderEquilibria = {
  /** Whether g = -M/N is independent of x (informational; constant solutions no longer require it). */
  autonomous: boolean;
  solutions: EquilibriumSolution[];
};

export type FirstOrderEquilibriaOptions = {
  /** Scan resolution in y. Default 400. */
  samples?: number;
  /** x interval used for the "for all x" checks; defaults to a fixed spread around the origin. */
  xRange?: Range;
  /** Relative residual tolerance for a root. Default 1e-9. */
  tol?: number;
};

/** Irrational-looking fractions so that a polynomial in x chosen to vanish on "nice" points is still caught. */
const PROBE_FRACTIONS = [0.0729, 0.2137, 0.3819, 0.5, 0.6181, 0.7863, 0.9271];
const DEFAULT_PROBES = [-1.7, -0.61, 0.37, 1.23, 2.91];

/**
 * Constant solutions of M dx + N dy = 0: y = c such that M(x, c) = 0 for every x while N(x, c) != 0.
 * (For dy/dx = g this is g(x, c) = 0 for every x.) Candidates come from the zeros of c -> M(x_ref, c)
 * on a scan of the y range (sign changes bisected, tangential zeros Newton-polished), then each is
 * verified at every other x probe.
 *
 * Accepts the legacy (expr, yRange, { params }) call as well: a bare string is dy/dx = expr.
 */
export function firstOrderEquilibria(
  specOrExpr: FirstOrderSpec | string,
  yRange: Range,
  opts: FirstOrderEquilibriaOptions & { params?: Record<string, number> } = {},
): FirstOrderEquilibria {
  const spec: FirstOrderSpec =
    typeof specOrExpr === "string"
      ? opts.params
        ? { kind: "explicit", g: specOrExpr, params: opts.params }
        : { kind: "explicit", g: specOrExpr }
      : specOrExpr;
  if (!Number.isFinite(yRange.min) || !Number.isFinite(yRange.max) || !(yRange.min < yRange.max)) {
    throw new RangeError("y range must satisfy min < max with finite bounds.");
  }
  const { M, N } = compileDifferential(spec);
  const samples = opts.samples ?? 400;
  const tol = opts.tol ?? 1e-9;
  const span = yRange.max - yRange.min;
  const xProbe = opts.xRange
    ? PROBE_FRACTIONS.map((t) => opts.xRange!.min + t * (opts.xRange!.max - opts.xRange!.min))
    : DEFAULT_PROBES;

  const ys = Array.from({ length: samples + 1 }, (_, i) => yRange.min + (i * span) / samples);
  const slope = (x: number, y: number) => {
    const n = N({ x, y });
    const m = M({ x, y });
    return n === 0 ? (m === 0 ? NaN : (m > 0 ? -Infinity : Infinity)) : -m / n;
  };

  // Reference column for the scan: the probe x with the most finite M values.
  const table = xProbe.map((x) => ys.map((y) => M({ x, y })));
  const finiteCounts = table.map((col) => col.filter(Number.isFinite).length);
  const refIndex = finiteCounts.indexOf(Math.max(...finiteCounts));
  const ref = table[refIndex];
  const xRef = xProbe[refIndex];
  // Scales of M and N over the probe table: every tolerance below is relative to them (review C7),
  // so an equation whose right-hand side is 1e-12 everywhere is not a sheet of 'constant solutions'.
  const mValues = table.flat().filter(Number.isFinite).map(Math.abs);
  const mScale = mValues.length ? Math.max(...mValues) : 0;
  const nValues = xProbe.flatMap((x) => ys.filter((_, i) => i % 8 === 0).map((y) => N({ x, y }))).filter(Number.isFinite).map(Math.abs);
  const nScale = nValues.length ? Math.max(...nValues) : 0;
  if (!(mScale > 0) || !(nScale > 0)) {
    // M ≡ 0 (every y is trivially constant: no direction field to speak of) or N ≡ 0 (no slope anywhere).
    return { autonomous: false, solutions: [] };
  }
  const fTol = tol * mScale;
  const nFloor = 1e3 * 2.220446049250313e-16 * nScale;

  // Autonomy of the slope (informational), relative to the slopes actually seen.
  const slopeValues: number[] = [];
  for (let i = 0; i < ys.length; i += 5) for (const x of xProbe) { const s = slope(x, ys[i]); if (Number.isFinite(s)) slopeValues.push(Math.abs(s)); }
  const sFloor = 1e3 * 2.220446049250313e-16 * (slopeValues.length ? Math.max(...slopeValues) : 0);
  let comparable = 0;
  let autonomous = true;
  outer: for (let i = 0; i < ys.length; i += 5) {
    const s0 = slope(xRef, ys[i]);
    if (!Number.isFinite(s0)) continue;
    for (const x of xProbe) {
      if (x === xRef) continue;
      const s = slope(x, ys[i]);
      if (!Number.isFinite(s)) continue;
      comparable++;
      if (Math.abs(s - s0) > 1e-9 * Math.max(Math.abs(s0), Math.abs(s), sFloor)) {
        autonomous = false;
        break outer;
      }
    }
  }
  if (comparable < 3) autonomous = false;

  const mAt = (y: number) => M({ x: xRef, y });
  const isRootAtRef = (y: number) => Number.isFinite(y) && Math.abs(mAt(y)) <= fTol;

  const polish = (y0: number): number => {
    let y = y0;
    for (let k = 0; k < 100; k++) {
      const h = 1e-6 * Math.max(1, Math.abs(y));
      const d = (mAt(y + h) - mAt(y - h)) / (2 * h);
      if (!Number.isFinite(d) || d === 0) break;
      const yn = y - mAt(y) / d;
      if (!Number.isFinite(yn)) break;
      const done = Math.abs(yn - y) <= 1e-15 * Math.max(1, Math.abs(y));
      y = yn;
      if (done) break;
    }
    return y;
  };

  const candidates: number[] = [];
  const pushCandidate = (y: number) => {
    if (!isRootAtRef(y)) return;
    if (y < yRange.min - 1e-12 * span || y > yRange.max + 1e-12 * span) return;
    if (candidates.some((r) => Math.abs(r - y) <= 1e-6 * span)) return;
    candidates.push(y);
  };

  for (let i = 0; i < ys.length; i++) {
    const v = ref[i];
    if (!Number.isFinite(v)) continue;
    if (Math.abs(v) <= fTol) {
      pushCandidate(polish(ys[i]));
      continue;
    }
    if (i + 1 < ys.length && Number.isFinite(ref[i + 1]) && ref[i + 1] !== 0 && Math.sign(v) !== Math.sign(ref[i + 1])) {
      let lo = ys[i], hi = ys[i + 1], flo = v;
      for (let k = 0; k < 200; k++) {
        const mid = (lo + hi) / 2;
        const fm = mAt(mid);
        if (!Number.isFinite(fm)) break;
        if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else { hi = mid; }
        if (hi - lo <= 1e-14 * Math.max(1, Math.abs(lo))) break;
      }
      pushCandidate((lo + hi) / 2);
      continue;
    }
    if (i > 0 && i + 1 < ys.length && Number.isFinite(ref[i - 1]) && Number.isFinite(ref[i + 1])) {
      const a = Math.abs(ref[i - 1]), b = Math.abs(v), c = Math.abs(ref[i + 1]);
      const isMin = b <= a && b <= c && (b < a || b < c);
      if (isMin && Math.sign(ref[i - 1]) === Math.sign(ref[i + 1])) pushCandidate(polish(ys[i]));
    }
  }

  // Verify "for all x": M(x, c) = 0 and N(x, c) != 0 at every probe.
  const probe = Math.max(1e-6 * span, 1e-9);
  const solutions: EquilibriumSolution[] = [];
  for (const c of candidates.sort((u, v) => u - v)) {
    let ok = true;
    const goodX: number[] = [];
    for (const x of xProbe) {
      const m = M({ x, y: c });
      const n = N({ x, y: c });
      // M or N undefined at this probe (dy/dx = y/x at x = 0): the line may still be a solution on
      // either side; skip the probe rather than reject the line, like the singular case below.
      if (!Number.isFinite(m) || !Number.isFinite(n)) continue;
      if (Math.abs(m) > fTol) {
        ok = false;
        break;
      }
      // M = N = 0 here: the line passes through a singular point of the direction field. That is
      // not a counterexample (dy = 0 still holds on either side), so the probe is skipped instead of
      // counted against the line; otherwise a probe landing exactly on the point would make the
      // answer depend on whether the box happens to be symmetric. A line singular at (almost)
      // every probe is not a solution of anything and is dropped.
      if (Math.abs(n) <= nFloor) continue;
      goodX.push(x);
    }
    if (!ok || goodX.length < 3) continue;

    let stability: EquilibriumSolution["stability"] | undefined;
    for (const x of goodX) {
      const below = slope(x, c - probe);
      const above = slope(x, c + probe);
      let s: EquilibriumSolution["stability"];
      if (below > 0 && above < 0) s = "stable";
      else if (below < 0 && above > 0) s = "unstable";
      else s = "semi_stable";
      if (stability === undefined) stability = s;
      else if (stability !== s) {
        stability = "varies";
        break;
      }
    }
    solutions.push({ y: c, stability: stability ?? "semi_stable" });
  }
  return { autonomous, solutions };
}
