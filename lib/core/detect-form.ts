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
    separable: "可分离变量方程 dy/dt = f(t)·h(y)",
    autonomous: "自治方程（右端与 t 无关）",
    linear_in_y: "关于 y 的线性方程 dy/dt = P(t)·y + Q(t)",
    homogeneous: "零次齐次方程 g(kt, ky) = g(t, y)",
    bernoulli: "Bernoulli 方程 dy/dt = P(t)·y + Q(t)·yⁿ",
    exact: "恰当方程 ∂M/∂y = ∂N/∂t",
    integrating_factor_x: "存在只依赖 t 的积分因子 μ(t)",
    integrating_factor_y: "存在只依赖 y 的积分因子 μ(y)",
  },
  // English names carry their own article (a / an) so the caveat templates never have to guess it.
  en: {
    separable: "a separable equation dy/dt = f(t)·h(y)",
    autonomous: "an autonomous equation (the right-hand side does not depend on t)",
    linear_in_y: "a linear equation in y, dy/dt = P(t)·y + Q(t)",
    homogeneous: "a homogeneous equation of degree zero, g(kt, ky) = g(t, y)",
    bernoulli: "a Bernoulli equation dy/dt = P(t)·y + Q(t)·yⁿ",
    exact: "an exact equation ∂M/∂y = ∂N/∂t",
    integrating_factor_x: "an integrating factor μ(t) depending on t only",
    integrating_factor_y: "an integrating factor μ(y) depending on y only",
  },
};

/** "an exact equation" -> "An exact equation", for a form name that starts a sentence. */
function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

const TESTED: Record<Locale, Record<OdeForm, string>> = {
  zh: {
    separable: "检验恒等式 g(t,y)·g(t₀,y₀) = g(t,y₀)·g(t₀,y)",
    autonomous: "比较 g(t,y) 与 g(t₀,y)",
    linear_in_y: "检验 g 在三个相距较远的 y 处是否共线（线性插值恒等式）",
    homogeneous: "检验 g(kt,ky) = g(t,y)，k 取 0.5、1.7、2.3",
    bernoulli: "把 g(t,y)/y 拟合成 a(t) + b(t)·y^(n−1) 并在其余点上核对",
    exact: "用带误差估计的高阶差分比较 ∂M/∂y 与 ∂N/∂t",
    integrating_factor_x: "检验 (∂M/∂y − ∂N/∂t)/N 是否与 y 无关",
    integrating_factor_y: "检验 (∂N/∂t − ∂M/∂y)/M 是否与 t 无关",
  },
  en: {
    separable: "checked the identity g(t,y)·g(t₀,y₀) = g(t,y₀)·g(t₀,y)",
    autonomous: "compared g(t,y) with g(t₀,y)",
    linear_in_y: "checked that g at three well-separated y values is collinear (linear interpolation identity)",
    homogeneous: "checked g(kt,ky) = g(t,y) for k = 0.5, 1.7, 2.3",
    bernoulli: "fitted g(t,y)/y as a(t) + b(t)·y^(n−1) and verified at the remaining points",
    exact: "compared ∂M/∂y with ∂N/∂t by high-order differences with error estimates",
    integrating_factor_x: "checked that (∂M/∂y − ∂N/∂t)/N does not depend on y",
    integrating_factor_y: "checked that (∂N/∂t − ∂M/∂y)/M does not depend on t",
  },
};

type VerdictWord = Verdict | "excluded";
const VERDICT_WORD: Record<Locale, Record<VerdictWord, string>> = {
  zh: {
    consistent: "远小于阈值",
    borderline: "落在阈值附近一个数量级内，属于临界情况",
    inconsistent: "明显超出阈值",
    untestable: "有效采样点不足，无法检验",
    excluded: "拟合本身成立，但按定义不属于该形式",
  },
  en: {
    consistent: "far below the threshold",
    borderline: "within an order of magnitude of the threshold: a borderline case",
    inconsistent: "clearly above the threshold",
    untestable: "too few usable sample points to test",
    excluded: "the fit itself holds, but by definition this is not that form",
  },
};

function evidenceText(locale: Locale, form: OdeForm, r: { verdict: VerdictWord; samples: number; dropped: number; dev: number | null; tol: number }, extra?: string): string {
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
  const name = FORM_NAME.en[form];
  switch (verdict) {
    case "consistent":
      return `Numerical evidence, not a proof: the equation is merely consistent with ${name} at ${samples} sample points. An equation that is not of this form can pass if the points happen to be special. Tell students it "behaves numerically like" this form, not that it "is" one.`;
    case "borderline":
      return `Borderline: the largest deviation from ${name}, ${d}, lies within an order of magnitude of the threshold ${t}. This may be floating-point rounding, or the equation may not strictly be of this form (a tiny perturbation term, for instance). Say that it is a borderline case; do not present it as a yes or a no.`;
    case "inconsistent":
      return `The deviation from ${name} at the sample points, ${d}, is clearly above the threshold ${t}, so this form is not supported. This too is a numerical statement about sample points only.`;
    default:
      return `${capitalize(name)} cannot be tested on this box: too few usable sample points (undefined values, or rounding too large to resolve the threshold ${t}).`;
  }
}

/** Shown when nothing was detected. Deliberately positive: the numerics do not care. */
export const NO_FORM_NOTE: Record<Locale, string> = {
  zh: "未检测到任何标准初等解法（可分离、线性、齐次、Bernoulli、恰当、积分因子）。这不是失败：斜率场和数值解与方程能否解出闭式无关，仍然完全有效。很多重要的方程（例如 Riccati 方程 dy/dt = t² + y²）就没有初等闭式解，数值方法正是为这种情况准备的。",
  en: "No standard elementary method was detected (separable, linear, homogeneous, Bernoulli, exact, integrating factor). That is not a failure: the slope field and the numerical solutions do not depend on a closed form and remain fully valid. Many important equations, such as the Riccati equation dy/dt = t² + y², have no elementary closed-form solution; numerical methods exist for exactly this case.",
};

// Irrational-looking fractions of the box for the 13 sample coordinates. No pair has FX = FY or
// FX + FY = 1: on a box centred at the origin those would put the sample on y = t or y = -t, where
// textbook equations such as (t - y)/(t + y) have zeros or poles (review C1).
const FX = [0.2137, 0.3819, 0.5773, 0.7071, 0.866, 0.4472, 0.6281, 0.1618, 0.9271, 0.0729, 0.3183, 0.7853, 0.5236];
const FY = [0.6281, 0.1618, 0.9271, 0.4472, 0.3183, 0.7853, 0.2137, 0.866, 0.5773, 0.7071, 0.0729, 0.3819, 0.4472];
/** y fractions for the linearity test; none equals an FX entry or 1 - an FX entry. */
const LINEAR_YS = [0.2618, 0.6545, 0.8541];
/** t fractions (horizontal axis) for the autonomy reference column and the integrating-factor grids. */
const AUTONOMY_X0 = 0.618;
const IF_XS = [0.2137, 0.5773, 0.866, 0.4472, 0.7071];
const IF_YS = [0.1459, 0.3455, 0.6545, 0.9098];

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

/** Step multipliers for the derivative estimate: non-round, so no two are commensurate with a round period. */
const STEP_MULTIPLIERS = [1, 4.3, 18.7, 81, 350];

/**
 * Partial derivative by a 4th-order central difference at two step sizes, combined by Richardson
 * extrapolation, with an error estimate from their disagreement plus the rounding floor.
 * Tried at several step sizes (capped at hMax): where the function is huge compared with its
 * derivative (exp(10t) + y), rounding dominates and a larger step is the better estimate.
 * A larger step is only trusted when it AGREES with the smallest-step estimate within their
 * combined error bounds: two stencils that agree with each other are not proof of accuracy when
 * both alias a periodic function (sin(2πy) sampled at multiples of its period gives 0 twice;
 * review C2), whereas the smallest step is the least likely to alias.
 */
function partial(f: (p: Vec2) => number, p: Vec2, axis: "x" | "y", h: number, hMax: number): Estimate | null {
  const at = (d: number) => f(axis === "x" ? { x: p.x + d, y: p.y } : { x: p.x, y: p.y + d });
  const d4 = (s: number): { d: number; mag: number } | null => {
    const f1 = at(s), fm1 = at(-s), f2 = at(2 * s), fm2 = at(-2 * s);
    if (![f1, fm1, f2, fm2].every(finite)) return null;
    return { d: (-f2 + 8 * f1 - 8 * fm1 + fm2) / (12 * s), mag: (Math.abs(f2) + 8 * Math.abs(f1) + 8 * Math.abs(fm1) + Math.abs(fm2)) / (12 * s) };
  };
  // Three stencils (s, s/2, s/4) give two Richardson extrapolations of order 6; their difference
  // bounds the error of the coarser one and is a safe estimate for the finer, which is returned.
  const estimate = (step: number): Estimate | null => {
    const a = d4(step);
    const b = d4(step / 2);
    const c = d4(step / 4);
    if (!a || !b || !c) return null;
    const e1 = (16 * b.d - a.d) / 15;
    const e2 = (16 * c.d - b.d) / 15;
    return { value: e2, error: Math.abs(e1 - e2) + 8 * EPS * c.mag };
  };
  let base: Estimate | null = null;
  let best: Estimate | null = null;
  for (const m of STEP_MULTIPLIERS) {
    const step = m * h;
    if (step > hMax) break;
    const est = estimate(step);
    if (!est) continue;
    if (!base) {
      base = est;
      best = est;
      continue;
    }
    const agrees = Math.abs(est.value - base.value) <= 3 * (est.error + base.error);
    if (agrees && best && est.error < best.error) best = est;
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

/** Value at a quantile of a list (0..1); 0 for an empty list. */
function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1) + 0.5))];
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
  /** Called between form tests and per sample point of the derivative tests (wall-clock budgets). */
  checkpoint?: () => void;
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
  // Typical magnitude of g: the 75th percentile of |g| over the samples, so that one sample next
  // to a pole (|g| ~ 1e16 from rounding noise in a denominator) does not set the scale.
  const gTypical = percentile(valid.map((p) => Math.abs(g(p))), 0.75);
  // Below this, a value of g is zero to working precision.
  const gFloor = 1e3 * EPS * gTypical;

  const out: FormDetection[] = [];
  const emit = (form: OdeForm, t: Tally, extra?: string, details?: Record<string, number>, exponent?: string, verdictOverride?: Verdict, word?: VerdictWord) => {
    const r = { ...t.result(), ...(verdictOverride ? { verdict: verdictOverride } : {}) };
    out.push({
      form,
      verdict: r.verdict,
      evidence: evidenceText(locale, form, { ...r, verdict: word ?? r.verdict }, extra),
      caveat: caveatText(locale, form, r.verdict, r.samples, r.dev, r.tol),
      maxRelDeviation: r.dev,
      threshold: r.tol,
      samples: r.samples,
      dropped: r.dropped,
      details,
      exponent,
    });
  };

  const checkpoint = opts.checkpoint;

  // ---- separable: g(t,y) g(t0,y0) = g(t,y0) g(t0,y) ------------------------------------------
  {
    checkpoint?.();
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

  // ---- autonomous: g independent of t -----------------------------------------------------------
  {
    checkpoint?.();
    const t = new Tally(tolA);
    const x0 = box.x.min + AUTONOMY_X0 * w;
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
    checkpoint?.();
    const t = new Tally(tolA);
    const ys = LINEAR_YS.map((f) => box.y.min + f * h);
    for (const p of points) {
      const [g1, g2, g3] = ys.map((y) => g({ x: p.x, y }));
      if (![g1, g2, g3].every(finite)) { t.drop(); continue; }
      const interp = g1 + ((g3 - g1) * (ys[1] - ys[0])) / (ys[2] - ys[0]);
      const scale = Math.max(Math.abs(g1), Math.abs(g2), Math.abs(g3));
      t.add(scale <= gFloor ? 0 : Math.abs(g2 - interp) / scale);
    }
    emit("linear_in_y", t);
  }

  // ---- homogeneous of degree 0: g(kt, ky) = g(t, y) -------------------------------------------
  {
    checkpoint?.();
    const t = new Tally(tolA);
    for (const p of points) {
      const v = g(p);
      if (!finite(v)) { t.drop(); continue; }
      let ok = true, local = 0;
      for (const k of [0.5, 1.7, 2.3]) {
        const gs = g({ x: k * p.x, y: k * p.y });
        if (!finite(gs)) { ok = false; break; }
        local = Math.max(local, relDev(gs, v, gFloor));
      }
      if (!ok) { t.drop(); continue; }
      t.add(local);
    }
    emit("homogeneous", t);
  }

  // ---- Bernoulli: g(t, y) / y = a(t) + b(t) y^(n-1) with n independent of t ---------------------
  {
    checkpoint?.();
    const t = new Tally(tolA);
    const ysRel = [0.137, 0.331, 0.577, 0.819, 0.963];
    // y^n needs y > 0: sample the positive part of the box. A box with no positive y is untestable.
    const yLo = Math.max(1e-3 * Math.max(1, Math.abs(box.y.max)), box.y.min);
    const ys = box.y.max > yLo ? ysRel.map((s) => yLo + s * (box.y.max - yLo)) : [];
    const xs = [0.2137, 0.5773, 0.866].map((s) => box.x.min + s * w);
    const uMax = Math.max(...xs.flatMap((x) => ys.map((y) => Math.abs(g({ x, y }) / y))).filter(finite), 0);
    const uFloor = 1e3 * EPS * uMax;
    // Exponent m = n - 1 from three points at fixed t: F(m) = (u1-u2)(y2^m - y3^m) - (u2-u3)(y1^m - y2^m) = 0.
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
    const columns = ys.length ? xs.map((x) => ys.map((y) => g({ x, y }) / y)).filter((u) => u.every(finite)) : [];
    let n: number | undefined;
    const exponents: number[] = [];
    let ok = ys.length > 0 && columns.length === xs.length;
    if (ok) {
      for (const u of columns) {
        const m = solveM(u);
        if (m === undefined) { ok = false; break; }
        exponents.push(m + 1);
      }
      if (ok) {
        n = exponents[0];
        if (Math.max(...exponents) - Math.min(...exponents) > 1e-6) ok = false;
      }
    }
    if (ok && n !== undefined && Math.abs(n - 1) > 1e-3 && Math.abs(n) > 1e-3) {
      // Snap to a simple fraction when that keeps the identity within tolerance (H2.5). The gate
      // is loose (1e-4): the re-verification below is what decides.
      const snapped = snapToRational(n, 1e-4);
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
      if (ys.length === 0) {
        // No positive y in the box: y^n cannot be sampled.
        ysRel.forEach(() => t.drop());
        emit("bernoulli", t, locale === "zh" ? "观察范围内没有 y > 0 的部分，y^n 无法采样" : "the box has no y > 0, so y^n cannot be sampled");
      } else if (columns.length === xs.length && n !== undefined && (Math.abs(n - 1) <= 1e-3 || Math.abs(n) <= 1e-3) && exponents.length === xs.length && Math.max(...exponents) - Math.min(...exponents) <= 1e-6) {
        // dy/dt = P y + Q y^0 and dy/dt = P y + Q y^1 are linear equations: Bernoulli proper needs n ≠ 0, 1.
        const nText = Math.abs(n) <= 1e-3 ? "0" : "1";
        columns.forEach((u) => { const d = fitDev(u, Math.round(n!) - 1); u.forEach((_, i) => t.add(i < 2 || d === null ? 0 : d)); });
        emit("bernoulli", t, locale === "zh" ? `拟合出的指数 n = ${nText}，这是线性方程；按课本定义 Bernoulli 方程要求 n ≠ 0, 1` : `the fitted exponent is n = ${nText}, i.e. a linear equation; a Bernoulli equation proper needs n ≠ 0, 1`, { n: Number(nText) }, undefined, "inconsistent", "excluded");
      } else if (columns.length === xs.length && exponents.length === xs.length) {
        // Every column fits some exponent, but not the same one: the spread of n across t is the deviation.
        const spread = (Math.max(...exponents) - Math.min(...exponents)) / Math.max(1, Math.abs(exponents[0]));
        columns.forEach((u) => u.forEach(() => t.add(spread)));
        emit("bernoulli", t, locale === "zh" ? `各 t 处拟合出的指数不一致（n 在 ${Math.min(...exponents).toFixed(3)} 到 ${Math.max(...exponents).toFixed(3)} 之间变化）` : `the fitted exponent differs between t values (n ranges from ${Math.min(...exponents).toFixed(3)} to ${Math.max(...exponents).toFixed(3)})`);
      } else {
        // At some t no exponent fits at all (g/y is not of the form a + b y^m there): structurally excluded.
        columns.forEach((u) => u.forEach(() => t.add(1)));
        emit("bernoulli", t, locale === "zh" ? "在某些 t 处 g/y 无法写成 a + b·y^(n−1)，不存在统一的指数" : "at some t, g/y cannot be written as a + b·y^(n−1): no exponent exists", undefined, undefined, undefined, "excluded");
      }
    }
  }

  // ---- exact and integrating factors (differential form) ---------------------------------------
  {
    // Base step 1e-4 of the box side (accurate for smooth fields); multipliers up to 350x for fields
    // whose magnitude swamps the derivative. Largest step 0.0731 of the side: a non-round fraction,
    // so a whole-box period cannot alias.
    const hx = 1e-4 * w;
    const hy = 1e-4 * h;
    const My = (p: Vec2) => partial(M, p, "y", hy, 0.0731 * h);
    const Nx = (p: Vec2) => partial(N, p, "x", hx, 0.0731 * w);
    const tE = new Tally(tolD);
    const perPoint: Array<{ p: Vec2; my: Estimate; nx: Estimate } | null> = points.map((p) => {
      checkpoint?.();
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
      // μ(t): r = (M_y - N_t) / N must not depend on y. Compare across y at fixed t.
      const xs = IF_XS.map((s) => box.x.min + s * w);
      const ysL = IF_YS.map((s) => box.y.min + s * h);
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
        checkpoint?.();
        const vals = ysL.map((y) => ratio({ x, y }, diff, N));
        if (vals.some((v) => v === null)) { ysL.slice(1).forEach(() => tX.drop()); continue; }
        const ref = vals[0]!;
        for (const v of vals.slice(1)) {
          const d = compareEstimates(v!, ref, tolD);
          if (d === null) tX.drop(); else tX.add(d);
        }
      }
      emit("integrating_factor_x", tX);

      // μ(y): s = (N_t - M_y) / M must not depend on t. Compare across t at fixed y.
      const tY = new Tally(tolD);
      for (const y of ysL) {
        checkpoint?.();
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
