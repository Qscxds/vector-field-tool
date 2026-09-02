/**
 * Numerical detection of the standard first-order forms taught in the "first-order equations"
 * chapter. Every test here can only FAIL TO REFUTE a form: a handful of sample points agreeing with
 * an identity is evidence, never proof (an unlucky choice of points can let a non-separable
 * equation pass). Therefore every detection carries a non-empty caveat, all wording is
 * "consistent with", and callers must keep that uncertainty when they talk to students.
 *
 * Sample points sit at irrational-looking fractions of the box (1/√2, 1/√3, (√5-1)/2, ...) so they
 * avoid integer points and symmetry axes where coincidences are common.
 */
import { compileDifferential, toDifferential, type FirstOrderSpec } from "./slope-field";
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

export type FormDetection = {
  form: OdeForm;
  /** What was tested where, and the largest relative deviation seen. */
  evidence: string;
  /** Always non-empty: this is numerical evidence, not a proof. */
  caveat: string;
  /** Largest relative deviation over the samples (0 = exact agreement to rounding). */
  maxRelDeviation: number;
  /** Number of sample points (or point pairs) that took part. */
  samples: number;
  /** Extra numbers a caller may show, e.g. the Bernoulli exponent. */
  details?: Record<string, number>;
};

export const ALL_FORMS: readonly OdeForm[] = [
  "separable", "autonomous", "linear_in_y", "homogeneous", "bernoulli",
  "exact", "integrating_factor_x", "integrating_factor_y",
];

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
    linear_in_y: "用二阶中心差分检验 ∂²g/∂y² = 0",
    homogeneous: "检验 g(tx,ty) = g(x,y)，t 取 0.5、1.7、2.3",
    bernoulli: "把 g(x,y)/y 拟合成 a(x) + b(x)·y^(n−1) 并在其余点上核对",
    exact: "用中心差分比较 ∂M/∂y 与 ∂N/∂x",
    integrating_factor_x: "检验 (∂M/∂y − ∂N/∂x)/N 是否与 y 无关",
    integrating_factor_y: "检验 (∂N/∂x − ∂M/∂y)/M 是否与 x 无关",
  },
  en: {
    separable: "checked the identity g(x,y)·g(x₀,y₀) = g(x,y₀)·g(x₀,y)",
    autonomous: "compared g(x,y) with g(x₀,y)",
    linear_in_y: "checked ∂²g/∂y² = 0 with second-order central differences",
    homogeneous: "checked g(tx,ty) = g(x,y) for t = 0.5, 1.7, 2.3",
    bernoulli: "fitted g(x,y)/y as a(x) + b(x)·y^(n−1) and verified at the remaining points",
    exact: "compared ∂M/∂y with ∂N/∂x by central differences",
    integrating_factor_x: "checked that (∂M/∂y − ∂N/∂x)/N does not depend on y",
    integrating_factor_y: "checked that (∂N/∂x − ∂M/∂y)/M does not depend on x",
  },
};

function evidenceText(locale: Locale, form: OdeForm, samples: number, dev: number, extra?: string): string {
  const d = dev.toExponential(1);
  return locale === "zh"
    ? `在 ${samples} 个采样点上${TESTED.zh[form]}，最大相对偏差 ${d}${extra ? `；${extra}` : ""}。`
    : `${TESTED.en[form][0].toUpperCase()}${TESTED.en[form].slice(1)} at ${samples} sample points; largest relative deviation ${d}${extra ? `; ${extra}` : ""}.`;
}

function caveatText(locale: Locale, form: OdeForm, samples: number): string {
  return locale === "zh"
    ? `这是数值证据，不是证明：方程只是在 ${samples} 个采样点上与「${FORM_NAME.zh[form]}」的形式一致。采样点碰巧落在特殊位置时，不满足该形式的方程也可能通过检验。向学生转述时请说「在数值上表现得像」，不要说「是」。`
    : `Numerical evidence, not a proof: the equation is merely consistent with a ${FORM_NAME.en[form]} at ${samples} sample points. An equation that is not of this form can pass if the points happen to be special. Tell students it "behaves numerically like" this form, not that it "is" one.`;
}

/** Shown when nothing was detected. Deliberately positive: the numerics do not care. */
export const NO_FORM_NOTE: Record<Locale, string> = {
  zh: "未检测到任何标准初等解法（可分离、线性、齐次、Bernoulli、恰当、积分因子）。这不是失败：斜率场和数值解与方程能否解出闭式无关，仍然完全有效。很多重要的方程（例如 Riccati 方程 dy/dx = x² + y²）就没有初等闭式解，数值方法正是为这种情况准备的。",
  en: "No standard elementary method was detected (separable, linear, homogeneous, Bernoulli, exact, integrating factor). That is not a failure: the slope field and the numerical solutions do not depend on a closed form and remain fully valid. Many important equations, such as the Riccati equation dy/dx = x² + y², have no elementary closed-form solution; numerical methods exist for exactly this case.",
};

// Irrational-looking fractions of the box for sample coordinates.
const FX = [0.2137, 0.3819, 0.5773, 0.7071, 0.866, 0.4472, 0.6281];
const FY = [0.7071, 0.2137, 0.866, 0.3819, 0.4472, 0.5773, 0.1618];

const REL_ALGEBRAIC = 1e-8; // identities evaluated directly
const REL_DIFFERENCE = 1e-6; // identities involving finite differences

const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-300);
const finite = (v: number) => Number.isFinite(v);

export type DetectOptions = {
  /** Reject a form when the largest relative deviation exceeds this. Defaults per test type. */
  tolerance?: number;
};

export function detectForms(spec: FirstOrderSpec, box: Box, locale: Locale = "en", opts: DetectOptions = {}): FormDetection[] {
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
  const out: FormDetection[] = [];
  const push = (form: OdeForm, samples: number, dev: number, tol: number, extra?: string, details?: Record<string, number>) => {
    if (samples < 5 || !(dev <= (opts.tolerance ?? tol))) return;
    out.push({ form, evidence: evidenceText(locale, form, samples, dev, extra), caveat: caveatText(locale, form, samples), maxRelDeviation: dev, samples, details });
  };

  // ---- separable: g(x,y) g(x0,y0) = g(x,y0) g(x0,y) ------------------------------------------
  if (valid.length >= 5) {
    const base = valid.reduce((best, p) => (Math.abs(g(p)) > Math.abs(g(best)) ? p : best), valid[0]);
    if (Math.abs(g(base)) > 0) {
      let dev = 0, n = 0;
      for (const p of valid) {
        if (p === base) continue;
        const lhs = g(p) * g(base);
        const rhs = g({ x: p.x, y: base.y }) * g({ x: base.x, y: p.y });
        if (!finite(lhs) || !finite(rhs)) continue;
        n++;
        dev = Math.max(dev, rel(lhs, rhs));
      }
      push("separable", n, dev, REL_ALGEBRAIC);
    }
  }

  // ---- autonomous: g independent of x -----------------------------------------------------------
  {
    const x0 = box.x.min + 0.5773 * w;
    let dev = 0, n = 0;
    for (const p of valid) {
      const ref = g({ x: x0, y: p.y });
      const v = g(p);
      if (!finite(ref)) continue;
      n++;
      dev = Math.max(dev, Math.abs(v - ref) / Math.max(Math.abs(ref), 1));
    }
    push("autonomous", n, dev, REL_ALGEBRAIC);
  }

  // ---- linear in y: second central difference in y vanishes ------------------------------------
  {
    let dev = 0, n = 0;
    for (const p of valid) {
      const step = 1e-3 * Math.max(1, Math.abs(p.y));
      const gp = g({ x: p.x, y: p.y + step }), g0 = g(p), gm = g({ x: p.x, y: p.y - step });
      if (![gp, g0, gm].every(finite)) continue;
      const d2 = gp - 2 * g0 + gm;
      const scale = Math.abs(gp) + 2 * Math.abs(g0) + Math.abs(gm) + 1e-300;
      n++;
      dev = Math.max(dev, Math.abs(d2) / scale);
    }
    push("linear_in_y", n, dev, REL_ALGEBRAIC);
  }

  // ---- homogeneous of degree 0: g(tx, ty) = g(x, y) -------------------------------------------
  {
    let dev = 0, n = 0;
    for (const p of valid) {
      const v = g(p);
      let ok = true, local = 0;
      for (const t of [0.5, 1.7, 2.3]) {
        const s = g({ x: t * p.x, y: t * p.y });
        if (!finite(s)) { ok = false; break; }
        local = Math.max(local, rel(s, v));
      }
      if (!ok) continue;
      n++;
      dev = Math.max(dev, local);
    }
    push("homogeneous", n, dev, REL_ALGEBRAIC);
  }

  // ---- Bernoulli: g(x, y) / y = a(x) + b(x) y^(n-1) with n independent of x ---------------------
  {
    const ysRel = [0.137, 0.331, 0.577, 0.819, 0.963];
    const ys = ysRel.map((t) => (box.y.max > 0 ? Math.max(1e-3, box.y.min) + t * (box.y.max - Math.max(1e-3, box.y.min)) : 0.3 + t));
    const xs = [0.2137, 0.5773, 0.866].map((t) => box.x.min + t * w);
    let n: number | undefined;
    let dev = 0;
    let samples = 0;
    let consistent = ys.length >= 5 && ys.every((y) => y > 0);
    for (const x of xs) {
      if (!consistent) break;
      const u = ys.map((y) => g({ x, y }) / y);
      if (!u.every(finite)) { consistent = false; break; }
      // Solve F(m) = (u1-u2)(y2^m - y3^m) - (u2-u3)(y1^m - y2^m) = 0 for m != 0 by scanning + bisection.
      const F = (m: number) => (u[0] - u[1]) * (ys[1] ** m - ys[2] ** m) - (u[1] - u[2]) * (ys[0] ** m - ys[1] ** m);
      let m: number | undefined;
      let prev = F(-6);
      for (let mm = -6 + 0.05; mm <= 6.0001; mm += 0.05) {
        const cur = F(mm);
        if (Math.abs(mm) < 0.1 || Math.abs(mm - 0.05) < 1e-9) { prev = cur; continue; } // skip the trivial root m = 0
        if (finite(prev) && finite(cur) && Math.sign(prev) !== Math.sign(cur)) {
          let lo = mm - 0.05, hi = mm, flo = prev;
          for (let k = 0; k < 100; k++) {
            const mid = (lo + hi) / 2, fm = F(mid);
            if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else hi = mid;
          }
          const cand = (lo + hi) / 2;
          if (Math.abs(cand) > 1e-3) { m = cand; break; }
        }
        prev = cur;
      }
      if (m === undefined) { consistent = false; break; }
      // a, b from the first two points, verify on the rest
      const b = (u[0] - u[1]) / (ys[0] ** m - ys[1] ** m);
      const a = u[0] - b * ys[0] ** m;
      if (!finite(a) || !finite(b) || Math.abs(b) <= 1e-12 * Math.max(1, Math.abs(a))) { consistent = false; break; }
      let local = 0;
      for (let i = 2; i < ys.length; i++) local = Math.max(local, rel(u[i], a + b * ys[i] ** m));
      const nHere = m + 1;
      if (n === undefined) n = nHere;
      else if (Math.abs(nHere - n) > 1e-6) { consistent = false; break; }
      dev = Math.max(dev, local);
      samples += ys.length;
    }
    if (consistent && n !== undefined && Math.abs(n - 1) > 1e-3) {
      const nRounded = Math.round(n * 1e6) / 1e6;
      push("bernoulli", samples, dev, REL_DIFFERENCE, locale === "zh" ? `估计的指数 n ≈ ${nRounded}` : `estimated exponent n ≈ ${nRounded}`, { n: nRounded });
    }
  }

  // ---- exact and integrating factors (differential form) ---------------------------------------
  {
    const { M: Mexpr, N: Nexpr } = toDifferential(spec);
    void Mexpr; void Nexpr;
    const My = (p: Vec2) => {
      const step = 1e-5 * Math.max(1, Math.abs(p.y));
      return (M({ x: p.x, y: p.y + step }) - M({ x: p.x, y: p.y - step })) / (2 * step);
    };
    const Nx = (p: Vec2) => {
      const step = 1e-5 * Math.max(1, Math.abs(p.x));
      return (N({ x: p.x + step, y: p.y }) - N({ x: p.x - step, y: p.y })) / (2 * step);
    };
    const pts = points.filter((p) => finite(M(p)) && finite(N(p)));
    let dev = 0, n = 0;
    for (const p of pts) {
      const a = My(p), b = Nx(p);
      if (!finite(a) || !finite(b)) continue;
      n++;
      dev = Math.max(dev, Math.abs(a - b) / (Math.abs(a) + Math.abs(b) + 1e-300));
    }
    const exact = n >= 5 && dev <= (opts.tolerance ?? REL_DIFFERENCE);
    if (exact) push("exact", n, dev, REL_DIFFERENCE);

    if (!exact) {
      // μ(x): r = (M_y - N_x) / N must not depend on y. Compare across y at fixed x.
      const xs = [0.2137, 0.5773, 0.866, 0.4472, 0.7071].map((t) => box.x.min + t * w);
      const ysL = [0.1618, 0.3819, 0.7071, 0.866].map((t) => box.y.min + t * h);
      let devX = 0, nX = 0, okX = true;
      for (const x of xs) {
        const vals = ysL.map((y) => { const p = { x, y }; const nn = N(p); return finite(nn) && nn !== 0 ? (My(p) - Nx(p)) / nn : NaN; });
        if (!vals.every(finite)) { okX = false; break; }
        const ref = vals[0];
        for (const v of vals.slice(1)) { nX++; devX = Math.max(devX, Math.abs(v - ref) / Math.max(Math.abs(ref), 1e-12)); }
      }
      if (okX) push("integrating_factor_x", nX, devX, REL_DIFFERENCE);

      // μ(y): s = (N_x - M_y) / M must not depend on x. Compare across x at fixed y.
      let devY = 0, nY = 0, okY = true;
      for (const y of ysL) {
        const vals = xs.map((x) => { const p = { x, y }; const mm = M(p); return finite(mm) && mm !== 0 ? (Nx(p) - My(p)) / mm : NaN; });
        if (!vals.every(finite)) { okY = false; break; }
        const ref = vals[0];
        for (const v of vals.slice(1)) { nY++; devY = Math.max(devY, Math.abs(v - ref) / Math.max(Math.abs(ref), 1e-12)); }
      }
      if (okY) push("integrating_factor_y", nY, devY, REL_DIFFERENCE);
    }
  }

  return out;
}
