/**
 * Numerical detection of the standard first-order forms taught in the "first-order equations"
 * chapter. Every test here can only FAIL TO REFUTE a form: a handful of sample points agreeing with
 * an identity is evidence, never proof (an unlucky choice of points can let a non-separable
 * equation pass). Therefore every detection carries a non-empty caveat, all wording is
 * "consistent with", and callers must keep that uncertainty when they talk to students.
 *
 * Three-tier verdicts (decided 2026-09-03, H2.4): a binary pass/fail throws away the most useful
 * number, the size of the deviation. Every form is returned with its verdict and the largest
 * relative deviation actually measured:
 *   consistent    deviation < threshold / 10
 *   borderline    deviation within one order of magnitude of the threshold (either side)
 *   inconsistent  deviation > 10 x threshold
 *   untestable    fewer than MIN_SAMPLES usable sample points (undefined values, or rounding too
 *                 large to resolve the threshold)
 * Deviations are relative to the magnitude of the two quantities being compared, never to an
 * absolute 1e-8, so scaling the equation by a constant changes nothing. Derivative-based tests
 * (exact, integrating factors) carry an error estimate for the finite differences (Richardson
 * comparison + rounding); a sample point whose estimate cannot resolve the threshold is not used.
 *
 * Sample points sit at irrational-looking fractions of the box (1/√2, 1/√3, (√5-1)/2, 1/π, ...)
 * so they avoid integer points and symmetry axes where coincidences are common.
 */
import { compileDifferential, type FirstOrderSpec } from "./slope-field";
import type { Box, Locale, Vec2 } from "./types";

export type OdeForm =
  | "separable"
  | "autonomous"
  | "linear_in_y"
  | "homogeneous"
  | "bernoulli"
  | "exact"
  | "integrating_factor_x"
  | "integrating_factor_y";

export type Verdict = "consistent" | "borderline" | "inconsistent" | "untestable";

export type FormDetection = {
  form: OdeForm;
  verdict: Verdict;
  /** What was tested where, the largest relative deviation, the threshold and how it compares. */
  evidence: string;
  /** Always non-empty: this is numerical evidence, not a proof. */
  caveat: string;
  /** Largest relative deviation over the usable samples; null when untestable. */
  maxRelDeviation: number | null;
  /** Threshold the verdict was measured against. */
  threshold: number;
  /** Number of usable sample points (or point pairs) that took part. */
  samples: number;
  /** Sample points that had to be dropped (undefined values or unresolvable rounding). */
  dropped: number;
  /** Extra numbers a caller may show, e.g. the Bernoulli exponent. */
  details?: Record<string, number>;
  /** Bernoulli only: the exponent as a simple fraction when it snapped to one ("1/2", "-1", "3"). */
  exponent?: string;
};

export const ALL_FORMS: readonly OdeForm[] = [
  "separable", "autonomous", "linear_in_y", "homogeneous", "bernoulli",
  "exact", "integrating_factor_x", "integrating_factor_y",
];

/** Threshold for identities evaluated directly (products, ratios, interpolation). */
export const TOL_ALGEBRAIC = 1e-8;
/** Threshold for identities that involve numerically estimated derivatives. */
export const TOL_DERIVATIVE = 1e-6;
/** Fewer usable samples than this: no verdict. */
export const MIN_SAMPLES = 5;

const FORM_NAME: Record<Locale, Record<OdeForm, string>> = {
  zh: {
    separable: "可分离变量方程 dy/dx = f(x)·h(y)",
    autonomous: "自治方程（右端与 x 无关）",
    linear_in_y: "关于 y 的线性方程 dy/dx = P(x)·y + Q(x)",
    homogeneous: "零次齐次方程 g(tx, ty) = g(x, y)",
    bernoulli: "Bernoulli 方程 dy/dx = P(x)·y + Q(x)·yⁿ",
    exact: "恰当方程 ∂M/∂y = ∂N/∂x",
    integrating_factor_x: "存在只依赖 x 的积分因子 μ(x)",
    integrating_factor_y: "存在只依赖 y 的积分因子 μ(y)",
  },
  en: {
    separable: "separable equation dy/dx = f(x)·h(y)",
    autonomous: "autonomous equation (right-hand side independent of x)",
    linear_in_y: "linear equation in y, dy/dx = P(x)·y + Q(x)",
    homogeneous: "homogeneous equation of degree zero, g(tx, ty) = g(x, y)",
    bernoulli: "Bernoulli equation dy/dx = P(x)·y + Q(x)·yⁿ",
    exact: "exact equation ∂M/∂y = ∂N/∂x",
    integrating_factor_x: "integrating factor μ(x) depending on x only",
    integrating_factor_y: "integrating factor μ(y) depending on y only",
  },
};

const TESTED: Record<Locale, Record<OdeForm, string>> = {
  zh: {
    separable: "检验恒等式 g(x,y)·g(x₀,y₀) = g(x,y₀)·g(x₀,y)",
    autonomous: "比较 g(x,y) 与 g(x₀,y)",
    linear_in_y: "检验 g 在三个相距较远的 y 处是否共线（线性插值恒等式）",
    homogeneous: "检验 g(tx,ty) = g(x,y)，t 取 0.5、1.7、2.3",
    bernoulli: "把 g(x,y)/y 拟合成 a(x) + b(x)·y^(n−1) 并在其余点上核对",
    exact: "用带误差估计的高阶差分比较 ∂M/∂y 与 ∂N/∂x",
    integrating_factor_x: "检验 (∂M/∂y − ∂N/∂x)/N 是否与 y 无关",
    integrating_factor_y: "检验 (∂N/∂x − ∂M/∂y)/M 是否与 x 无关",
  },
  en: {
    separable: "checked the identity g(x,y)·g(x₀,y₀) = g(x,y₀)·g(x₀,y)",
    autonomous: "compared g(x,y) with g(x₀,y)",
    linear_in_y: "checked that g at three well-separated y values is collinear (linear interpolation identity)",
    homogeneous: "checked g(tx,ty) = g(x,y) for t = 0.5, 1.7, 2.3",
    bernoulli: "fitted g(x,y)/y as a(x) + b(x)·y^(n−1) and verified at the remaining points",
    exact: "compared ∂M/∂y with ∂N/∂x by high-order differences with error estimates",
    integrating_factor_x: "checked that (∂M/∂y − ∂N/∂x)/N does not depend on y",
    integrating_factor_y: "checked that (∂N/∂x − ∂M/∂y)/M does not depend on x",
  },
};

const VERDICT_WORD: Record<Locale, Record<Verdict, string>> = {
  zh: {
    consistent: "远小于阈值",
    borderline: "落在阈值附近一个数量级内，属于临界情况",
    inconsistent: "明显超出阈值",
    untestable: "有效采样点不足，无法检验",
  },
  en: {
    consistent: "far below the threshold",
    borderline: "within an order of magnitude of the threshold: a borderline case",
    inconsistent: "clearly above the threshold",
    untestable: "too few usable sample points to test",
  },
};

function evidenceText(locale: Locale, form: OdeForm, r: { verdict: Verdict; samples: number; dropped: number; dev: number | null; tol: number }, extra?: string): string {
  const d = r.dev === null ? "—" : r.dev.toExponential(1);
  const tol = r.tol.toExponential(0);
  const droppedZh = r.dropped ? `，另有 ${r.dropped} 个采样点因值无定义或舍入误差过大未用` : "";
  const droppedEn = r.dropped ? `; ${r.dropped} sample points were unusable (undefined values or rounding too large)` : "";
  if (locale === "zh") {
    return `在 ${r.samples} 个采样点上${TESTED.zh[form]}，最大相对偏差 ${d}（阈值 ${tol}，${VERDICT_WORD.zh[r.verdict]}）${droppedZh}${extra ? `；${extra}` : ""}。`;
  }
  const tested = TESTED.en[form];
  return `${tested[0].toUpperCase()}${tested.slice(1)} at ${r.samples} sample points; largest relative deviation ${d} (threshold ${tol}, ${VERDICT_WORD.en[r.verdict]})${droppedEn}${extra ? `; ${extra}` : ""}.`;
}

function caveatText(locale: Locale, form: OdeForm, verdict: Verdict, samples: number, dev: number | null, tol: number): string {
  const d = dev === null ? "—" : dev.toExponential(1);
  const t = tol.toExponential(0);
  if (locale === "zh") {
    switch (verdict) {
      case "consistent":
        return `这是数值证据，不是证明：方程只是在 ${samples} 个采样点上与「${FORM_NAME.zh[form]}」的形式一致。采样点碰巧落在特殊位置时，不满足该形式的方程也可能通过检验。向学生转述时请说「在数值上表现得像」，不要说「是」。`;
      case "borderline":
        return `临界判断：与「${FORM_NAME.zh[form]}」的最大偏差 ${d} 落在阈值 ${t} 附近一个数量级内。这可能只是浮点舍入，也可能说明方程并不严格属于这种形式（例如带有微小的扰动项）。转述时必须说明这是临界情况，不要当作肯定或否定的结论。`;
      case "inconsistent":
        return `在采样点上与「${FORM_NAME.zh[form]}」的偏差 ${d} 明显超出阈值 ${t}，因此不支持这种形式。这同样只是采样点上的数值结论。`;
      default:
        return `无法在这个范围内检验「${FORM_NAME.zh[form]}」：有效采样点不足（值无定义，或舍入误差大到无法分辨阈值 ${t}）。`;
    }
  }
  switch (verdict) {
    case "consistent":
      return `Numerical evidence, not a proof: the equation is merely consistent with a ${FORM_NAME.en[form]} at ${samples} sample points. An equation that is not of this form can pass if the points happen to be special. Tell students it "behaves numerically like" this form, not that it "is" one.`;
    case "borderline":
      return `Borderline: the largest deviation from a ${FORM_NAME.en[form]}, ${d}, lies within an order of magnitude of the threshold ${t}. This may be floating-point rounding, or the equation may not strictly be of this form (a tiny perturbation term, for instance). Say that it is a borderline case; do not present it as a yes or a no.`;
    case "inconsistent":
      return `The deviation from a ${FORM_NAME.en[form]} at the sample points, ${d}, is clearly above the threshold ${t}, so this form is not supported. This too is a numerical statement about sample points only.`;
    default:
      return `A ${FORM_NAME.en[form]} cannot be tested on this box: too few usable sample points (undefined values, or rounding too large to resolve the threshold ${t}).`;
  }
}

/** Shown when nothing was detected. Deliberately positive: the numerics do not care. */
export const NO_FORM_NOTE: Record<Locale, string> = {
  zh: "未检测到任何标准初等解法（可分离、线性、齐次、Bernoulli、恰当、积分因子）。这不是失败：斜率场和数值解与方程能否解出闭式无关，仍然完全有效。很多重要的方程（例如 Riccati 方程 dy/dx = x² + y²）就没有初等闭式解，数值方法正是为这种情况准备的。",
  en: "No standard elementary method was detected (separable, linear, homogeneous, Bernoulli, exact, integrating factor). That is not a failure: the slope field and the numerical solutions do not depend on a closed form and remain fully valid. Many important equations, such as the Riccati equation dy/dx = x² + y², have no elementary closed-form solution; numerical methods exist for exactly this case.",
};

// Irrational-looking fractions of the box for the 13 sample coordinates.
const FX = [0.2137, 0.3819, 0.5773, 0.7071, 0.866, 0.4472, 0.6281, 0.1618, 0.9271, 0.0729, 0.3183, 0.7853, 0.5236];
const FY = [0.7071, 0.2137, 0.866, 0.3819, 0.4472, 0.5773, 0.1618, 0.6281, 0.0729, 0.9271, 0.5236, 0.3183, 0.7853];

const EPS = 2.220446049250313e-16;
const finite = (v: number) => Number.isFinite(v);

/** Verdict from a deviation and a threshold: three tiers, one order of magnitude wide each side. */
export function verdictFor(dev: number, tol: number): Exclude<Verdict, "untestable"> {
  if (dev < tol / 10) return "consistent";
  if (dev <= tol * 10) return "borderline";
  return "inconsistent";
}

/**
 * Relative deviation between two quantities that should be equal, relative to their own magnitude.
 * `floor` is the magnitude below which both count as zero to working precision (then dev = 0).
 */
function relDev(a: number, b: number, floor: number): number {
  const scale = Math.max(Math.abs(a), Math.abs(b));
  if (scale <= floor) return 0;
  return Math.abs(a - b) / scale;
}

/** Accumulates per-sample deviations into a verdict. */
class Tally {
  private dev = 0;
  samples = 0;
  dropped = 0;
  constructor(readonly tol: number) {}
  add(d: number): void {
    this.samples++;
    this.dev = Math.max(this.dev, d);
  }
  drop(): void {
    this.dropped++;
  }
  result(): { verdict: Verdict; dev: number | null; samples: number; dropped: number; tol: number } {
    if (this.samples < MIN_SAMPLES) return { verdict: "untestable", dev: null, samples: this.samples, dropped: this.dropped, tol: this.tol };
    return { verdict: verdictFor(this.dev, this.tol), dev: this.dev, samples: this.samples, dropped: this.dropped, tol: this.tol };
  }
}

type Estimate = { value: number; error: number };

/**
 * Partial derivative by a 4th-order central difference at two step sizes, combined by Richardson
 * extrapolation, with an error estimate from their disagreement plus the rounding floor.
 * Tried at h, 10h and 100h (capped at hMax): where the function is huge compared with its
 * derivative (exp(10x) + y), rounding dominates and a larger step is the better estimate; the
 * candidate with the smallest estimated error wins.
 */
function partial(f: (p: Vec2) => number, p: Vec2, axis: "x" | "y", h: number, hMax: number): Estimate | null {
  const at = (d: number) => f(axis === "x" ? { x: p.x + d, y: p.y } : { x: p.x, y: p.y + d });
  const d4 = (s: number): { d: number; mag: number } | null => {
    const f1 = at(s), fm1 = at(-s), f2 = at(2 * s), fm2 = at(-2 * s);
    if (![f1, fm1, f2, fm2].every(finite)) return null;
    return { d: (-f2 + 8 * f1 - 8 * fm1 + fm2) / (12 * s), mag: (Math.abs(f2) + 8 * Math.abs(f1) + 8 * Math.abs(fm1) + Math.abs(fm2)) / (12 * s) };
  };
  let best: Estimate | null = null;
  for (const step of [h, 10 * h, 100 * h]) {
    if (step > hMax) break;
    const a = d4(step);
    const b = d4(step / 2);
    if (!a || !b) continue;
    const value = (16 * b.d - a.d) / 15;
    const truncation = Math.abs(a.d - b.d) / 15;
    const rounding = 8 * EPS * b.mag;
    const est = { value, error: truncation + rounding };
    if (!best || est.error < best.error) best = est;
  }
  return best;
}

/**
 * Compares two derivative estimates. Returns the relative deviation, or null when the estimates
 * cannot resolve the threshold (the sample must then be dropped). When both are zero to within
 * their own uncertainty the identity holds to working precision (deviation 0).
 */
function compareEstimates(a: Estimate, b: Estimate, tol: number): number | null {
  const scale = Math.max(Math.abs(a.value), Math.abs(b.value));
  const u = a.error + b.error;
  // Both derivatives are zero to within their own uncertainty: the identity holds to precision.
  if (Math.abs(a.value) <= a.error && Math.abs(b.value) <= b.error) return 0;
  // The estimates cannot resolve the threshold (rounding or truncation too large): no verdict here.
  if (u > (tol / 10) * scale) return null;
  return Math.abs(a.value - b.value) / scale;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Nearest fraction p/q with q <= maxDenominator; null when none is within `tol` of n. */
export function snapToRational(n: number, tol = 1e-7, maxDenominator = 6): { p: number; q: number; text: string } | null {
  let best: { p: number; q: number; err: number } | null = null;
  for (let q = 1; q <= maxDenominator; q++) {
    const p = Math.round(n * q);
    const err = Math.abs(p / q - n);
    if (err <= tol && (best === null || err < best.err - 1e-18 || (Math.abs(err - best.err) <= 1e-18 && q < best.q))) best = { p, q, err };
  }
  if (!best) return null;
  const g = gcd(Math.abs(best.p), best.q) || 1;
  const p = best.p / g, q = best.q / g;
  return { p, q, text: q === 1 ? String(p) : `${p}/${q}` };
}

export type DetectOptions = {
  /** Override the algebraic threshold (tests). */
  tolAlgebraic?: number;
  /** Override the derivative threshold (tests). */
  tolDerivative?: number;
};

/** Every form with its verdict, in ALL_FORMS order. */
export function detectForms(spec: FirstOrderSpec, box: Box, locale: Locale = "en", opts: DetectOptions = {}): FormDetection[] {
  const tolA = opts.tolAlgebraic ?? TOL_ALGEBRAIC;
  const tolD = opts.tolDerivative ?? TOL_DERIVATIVE;
  const { M, N } = compileDifferential(spec);
  const g = (p: Vec2): number => {
    const n = N(p);
    const m = M(p);
    if (!finite(m) || !finite(n) || n === 0) return NaN;
    return -m / n;
  };
  const w = box.x.max - box.x.min;
  const h = box.y.max - box.y.min;
  const points: Vec2[] = FX.map((fx, i) => ({ x: box.x.min + fx * w, y: box.y.min + FY[i] * h }));
  const valid = points.filter((p) => finite(g(p)));
  const gMax = valid.reduce((m, p) => Math.max(m, Math.abs(g(p))), 0);
  // Below this, a value of g is zero to working precision.
  const gFloor = 1e3 * EPS * gMax;

  const out: FormDetection[] = [];
  const emit = (form: OdeForm, t: Tally, extra?: string, details?: Record<string, number>, exponent?: string, verdictOverride?: Verdict) => {
    const r = { ...t.result(), ...(verdictOverride ? { verdict: verdictOverride } : {}) };
    out.push({
      form,
      verdict: r.verdict,
      evidence: evidenceText(locale, form, r, extra),
      caveat: caveatText(locale, form, r.verdict, r.samples, r.dev, r.tol),
      maxRelDeviation: r.dev,
      threshold: r.tol,
      samples: r.samples,
      dropped: r.dropped,
      details,
      exponent,
    });
  };

  // ---- separable: g(x,y) g(x0,y0) = g(x,y0) g(x0,y) ------------------------------------------
  {
    const t = new Tally(tolA);
    const base = valid.reduce((best, p) => (Math.abs(g(p)) > Math.abs(g(best)) ? p : best), valid[0]);
    if (base && Math.abs(g(base)) > 0) {
      for (const p of points) {
        if (p === base) continue;
        const lhs = g(p) * g(base);
        const rhs = g({ x: p.x, y: base.y }) * g({ x: base.x, y: p.y });
        if (!finite(lhs) || !finite(rhs)) { t.drop(); continue; }
        t.add(relDev(lhs, rhs, gFloor * gFloor));
      }
    } else {
      points.forEach(() => t.drop());
    }
    emit("separable", t);
  }

  // ---- autonomous: g independent of x -----------------------------------------------------------
  {
    const t = new Tally(tolA);
    const x0 = box.x.min + 0.5773 * w;
    for (const p of points) {
      const ref = g({ x: x0, y: p.y });
      const v = g(p);
      if (!finite(ref) || !finite(v)) { t.drop(); continue; }
      t.add(relDev(v, ref, gFloor));
    }
    emit("autonomous", t);
  }

  // ---- linear in y: g is collinear across three well-separated y values ------------------------
  {
    const t = new Tally(tolA);
    const ys = [0.2137, 0.5773, 0.866].map((f) => box.y.min + f * h);
    for (const p of points) {
      const [g1, g2, g3] = ys.map((y) => g({ x: p.x, y }));
      if (![g1, g2, g3].every(finite)) { t.drop(); continue; }
      const interp = g1 + ((g3 - g1) * (ys[1] - ys[0])) / (ys[2] - ys[0]);
      const scale = Math.max(Math.abs(g1), Math.abs(g2), Math.abs(g3));
      t.add(scale <= gFloor ? 0 : Math.abs(g2 - interp) / scale);
    }
    emit("linear_in_y", t);
  }

  // ---- homogeneous of degree 0: g(tx, ty) = g(x, y) -------------------------------------------
  {
    const t = new Tally(tolA);
    for (const p of points) {
      const v = g(p);
      if (!finite(v)) { t.drop(); continue; }
      let ok = true, local = 0;
      for (const s of [0.5, 1.7, 2.3]) {
        const gs = g({ x: s * p.x, y: s * p.y });
        if (!finite(gs)) { ok = false; break; }
        local = Math.max(local, relDev(gs, v, gFloor));
      }
      if (!ok) { t.drop(); continue; }
      t.add(local);
    }
    emit("homogeneous", t);
  }

  // ---- Bernoulli: g(x, y) / y = a(x) + b(x) y^(n-1) with n independent of x ---------------------
  {
    const t = new Tally(tolA);
    const ysRel = [0.137, 0.331, 0.577, 0.819, 0.963];
    const ys = ysRel.map((s) => (box.y.max > 0 ? Math.max(1e-3, box.y.min) + s * (box.y.max - Math.max(1e-3, box.y.min)) : 0.3 + s));
    const xs = [0.2137, 0.5773, 0.866].map((s) => box.x.min + s * w);
    const uMax = Math.max(...xs.flatMap((x) => ys.map((y) => Math.abs(g({ x, y }) / y))).filter(finite), 0);
    const uFloor = 1e3 * EPS * uMax;
    // Exponent m = n - 1 from three points at fixed x: F(m) = (u1-u2)(y2^m - y3^m) - (u2-u3)(y1^m - y2^m) = 0.
    const solveM = (u: number[]): number | undefined => {
      const F = (m: number) => (u[0] - u[1]) * (ys[1] ** m - ys[2] ** m) - (u[1] - u[2]) * (ys[0] ** m - ys[1] ** m);
      let prev = F(-12);
      for (let mm = -12 + 0.05; mm <= 12.0001; mm += 0.05) {
        const cur = F(mm);
        if (Math.abs(mm) < 0.1 || Math.abs(mm - 0.05) < 1e-9) { prev = cur; continue; } // skip the trivial root m = 0
        if (finite(prev) && finite(cur) && Math.sign(prev) !== Math.sign(cur)) {
          let lo = mm - 0.05, hi = mm, flo = prev;
          for (let k = 0; k < 100; k++) {
            const mid = (lo + hi) / 2, fm = F(mid);
            if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else hi = mid;
          }
          const cand = (lo + hi) / 2;
          if (Math.abs(cand) > 1e-3) return cand;
        }
        prev = cur;
      }
      return undefined;
    };
    // Fit a, b for a given m from the first two points; largest deviation on the rest.
    const fitDev = (u: number[], m: number): number | null => {
      const b = (u[0] - u[1]) / (ys[0] ** m - ys[1] ** m);
      const a = u[0] - b * ys[0] ** m;
      if (!finite(a) || !finite(b) || Math.abs(b) <= 1e-12 * Math.max(1, Math.abs(a))) return null;
      let local = 0;
      for (let i = 2; i < ys.length; i++) local = Math.max(local, relDev(u[i], a + b * ys[i] ** m, uFloor));
      return local;
    };
    const columns = xs.map((x) => ys.map((y) => g({ x, y }) / y)).filter((u) => u.every(finite));
    let n: number | undefined;
    let ok = columns.length === xs.length && ys.every((y) => y > 0);
    if (ok) {
      for (const u of columns) {
        const m = solveM(u);
        if (m === undefined) { ok = false; break; }
        const nHere = m + 1;
        if (n === undefined) n = nHere;
        else if (Math.abs(nHere - n) > 1e-6) { ok = false; break; }
      }
    }
    if (ok && n !== undefined && Math.abs(n - 1) > 1e-3 && Math.abs(n) > 1e-3) {
      // Snap to a simple fraction when that keeps the identity within tolerance (H2.5).
      const snapped = snapToRational(n);
      let used = n;
      let exponent: string | undefined;
      if (snapped) {
        const mS = snapped.p / snapped.q - 1;
        const devs = columns.map((u) => fitDev(u, mS));
        if (devs.every((d) => d !== null && d < tolA / 10)) {
          used = snapped.p / snapped.q;
          exponent = snapped.text;
        }
      }
      for (const u of columns) {
        const d = fitDev(u, used - 1);
        if (d === null) { ys.forEach(() => t.drop()); ok = false; continue; }
        for (let i = 0; i < ys.length; i++) t.add(i < 2 ? 0 : d);
      }
      const nRounded = Math.round(used * 1e6) / 1e6;
      const extra = exponent
        ? locale === "zh"
          ? `指数贴合到 n = ${exponent}（贴合后恒等式仍在容差内成立）`
          : `exponent snapped to n = ${exponent} (the identity still holds within tolerance after snapping)`
        : locale === "zh"
          ? `指数 n ≈ ${nRounded}（数值近似，未能贴合到分母不超过 6 的简单分数）`
          : `exponent n ≈ ${nRounded} (numerical estimate; no simple fraction with denominator ≤ 6 fits)`;
      emit("bernoulli", t, extra, { n: nRounded, ...(snapped && exponent ? { numerator: snapped.p, denominator: snapped.q } : {}) }, exponent);
    } else {
      // No single exponent fits (or the exponent is 1, i.e. linear): inconsistent with a Bernoulli
      // form; when the fit could not even be attempted, untestable.
      if (columns.length >= 1 && ys.every((y) => y > 0)) {
        if (n !== undefined && (Math.abs(n - 1) <= 1e-3 || Math.abs(n) <= 1e-3)) {
          // dy/dx = P y + Q y^0 and dy/dx = P y + Q y^1 are linear equations: Bernoulli proper needs n ≠ 0, 1.
          const nText = Math.abs(n) <= 1e-3 ? "0" : "1";
          columns.forEach((u) => { const d = fitDev(u, Math.round(n!) - 1); u.forEach((_, i) => t.add(i < 2 || d === null ? 0 : d)); });
          emit("bernoulli", t, locale === "zh" ? `拟合出的指数 n = ${nText}，这是线性方程；按课本定义 Bernoulli 方程要求 n ≠ 0, 1` : `the fitted exponent is n = ${nText}, i.e. a linear equation; a Bernoulli equation proper needs n ≠ 0, 1`, { n: Number(nText) }, undefined, "inconsistent");
        } else {
          columns.forEach((u) => u.forEach(() => t.add(1)));
          emit("bernoulli", t, locale === "zh" ? "没有一个统一的指数 n 能在所有 x 处拟合 g/y" : "no single exponent n fits g/y at every x");
        }
      } else {
        ys.forEach(() => t.drop());
        emit("bernoulli", t);
      }
    }
  }

  // ---- exact and integrating factors (differential form) ---------------------------------------
  {
    const hx = 1e-3 * w;
    const hy = 1e-3 * h;
    const My = (p: Vec2) => partial(M, p, "y", hy, 0.15 * h);
    const Nx = (p: Vec2) => partial(N, p, "x", hx, 0.15 * w);
    const tE = new Tally(tolD);
    const perPoint: Array<{ p: Vec2; my: Estimate; nx: Estimate } | null> = points.map((p) => {
      const my = My(p), nx = Nx(p);
      if (!my || !nx || !finite(M(p)) || !finite(N(p))) { tE.drop(); return null; }
      const d = compareEstimates(my, nx, tolD);
      if (d === null) { tE.drop(); return null; }
      tE.add(d);
      return { p, my, nx };
    });
    emit("exact", tE);
    const exactConsistent = out[out.length - 1].verdict === "consistent";

    if (exactConsistent) {
      // μ = 1 does the job; the integrating-factor identities hold trivially (r ≡ 0).
      for (const form of ["integrating_factor_x", "integrating_factor_y"] as const) {
        const t = new Tally(tolD);
        for (const q of perPoint) if (q) t.add(0); else t.drop();
        emit(form, t, locale === "zh" ? "方程已恰当，μ = 1 即可，这一条自动成立" : "the equation is already exact, so μ = 1 works and this holds trivially", { trivial: 1 });
      }
    } else {
      // μ(x): r = (M_y - N_x) / N must not depend on y. Compare across y at fixed x.
      const xs = [0.2137, 0.5773, 0.866, 0.4472, 0.7071].map((s) => box.x.min + s * w);
      const ysL = [0.1618, 0.3819, 0.7071, 0.866].map((s) => box.y.min + s * h);
      const ratio = (p: Vec2, num: (a: Estimate, b: Estimate) => Estimate, den: (p: Vec2) => number): Estimate | null => {
        const my = My(p), nx = Nx(p);
        const d = den(p);
        if (!my || !nx || !finite(d) || d === 0) return null;
        const e = num(my, nx);
        return { value: e.value / d, error: e.error / Math.abs(d) };
      };
      const diff = (a: Estimate, b: Estimate): Estimate => ({ value: a.value - b.value, error: a.error + b.error });

      const tX = new Tally(tolD);
      for (const x of xs) {
        const vals = ysL.map((y) => ratio({ x, y }, diff, N));
        if (vals.some((v) => v === null)) { ysL.slice(1).forEach(() => tX.drop()); continue; }
        const ref = vals[0]!;
        for (const v of vals.slice(1)) {
          const d = compareEstimates(v!, ref, tolD);
          if (d === null) tX.drop(); else tX.add(d);
        }
      }
      emit("integrating_factor_x", tX);

      // μ(y): s = (N_x - M_y) / M must not depend on x. Compare across x at fixed y.
      const tY = new Tally(tolD);
      for (const y of ysL) {
        const vals = xs.map((x) => ratio({ x, y }, (my, nx) => diff(nx, my), M));
        if (vals.some((v) => v === null)) { xs.slice(1).forEach(() => tY.drop()); continue; }
        const ref = vals[0]!;
        for (const v of vals.slice(1)) {
          const d = compareEstimates(v!, ref, tolD);
          if (d === null) tY.drop(); else tY.add(d);
        }
      }
      emit("integrating_factor_y", tY);
    }
  }

  return out;
}

/**
 * Forms a student may be told about: consistent or borderline (with the borderline caveat),
 * minus entries that only hold trivially (the integrating factors of an exact equation, μ = 1).
 */
export function reportedForms(detections: FormDetection[]): FormDetection[] {
  return detections.filter((d) => (d.verdict === "consistent" || d.verdict === "borderline") && !d.details?.trivial);
}

export function consistentForms(detections: FormDetection[]): FormDetection[] {
  return detections.filter((d) => d.verdict === "consistent");
}
