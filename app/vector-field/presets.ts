/**
 * Preset library of the web shell: chapter groups of textbook examples. Each preset is a complete
 * page state (mode, expressions, box, optional fixed trajectory starts) with a bilingual name and
 * a one-sentence note saying what the picture demonstrates. Every note is derived by hand and
 * stays honest ("center or weak spiral", never "center"). Boxes are chosen so the features are
 * visible; starts are chosen so the traced curves make the point. presetUrl() makes each preset a
 * shareable link (the home page can list them).
 */
import type { Locale, Vec2 } from "@/lib/core/types";
import { DEFAULT_STATE, encodeState, type AppBox, type AppMode, type AppState } from "@/lib/url-state";

/** The form vocabulary of VectorFieldApp (explicit / differential); presets use the link vocabulary AppMode. */
export type PresetMode = "system" | "explicit" | "differential" | "second";

export type PresetGroupId = "separable" | "linear" | "exact" | "bernoulli" | "homogeneous" | "noClosedForm" | "uniqueness" | "systems" | "nonAutonomous";

export type PresetGroup = { id: PresetGroupId; name: Record<Locale, string> };

export type Preset = {
  id: string;
  group: PresetGroupId;
  mode: AppMode;
  name: Record<Locale, string>;
  /** One sentence: what the picture demonstrates. */
  note: Record<Locale, string>;
  /** The expressions the mode uses: g (first), M and N (diff), f and g (system), eq (second). */
  expressions: Partial<Record<"f" | "g" | "M" | "N" | "eq", string>>;
  /** For first / diff the horizontal range is the t range. */
  box: AppBox;
  /** Fixed trajectory starts that make the picture instructive (traced on load). */
  starts?: Vec2[];
};

/** Route the preset links point to. */
export const PRESET_PATH = "/vector-field";

export const PRESET_GROUPS: PresetGroup[] = [
  { id: "separable", name: { zh: "一阶·可分离", en: "First order · separable" } },
  { id: "linear", name: { zh: "一阶·线性", en: "First order · linear" } },
  { id: "exact", name: { zh: "一阶·恰当", en: "First order · exact" } },
  { id: "bernoulli", name: { zh: "一阶·Bernoulli", en: "First order · Bernoulli" } },
  { id: "homogeneous", name: { zh: "一阶·齐次", en: "First order · homogeneous" } },
  { id: "noClosedForm", name: { zh: "一阶·解不出来的", en: "First order · no closed form" } },
  { id: "uniqueness", name: { zh: "一阶·唯一性失效", en: "First order · uniqueness fails" } },
  { id: "systems", name: { zh: "二阶/系统", en: "Second order / systems" } },
  { id: "nonAutonomous", name: { zh: "非自治", en: "Non-autonomous" } },
];

const sq = (r: number): AppBox => ({ xMin: -r, xMax: r, yMin: -r, yMax: r });

export const PRESETS: Preset[] = [
  // ---- 一阶·可分离 ----
  {
    id: "logistic", group: "separable", mode: "first", name: { zh: "Logistic dy/dt = y(1−y)", en: "Logistic dy/dt = y(1−y)" },
    expressions: { g: "y*(1 - y)" }, box: { xMin: 0, xMax: 6, yMin: -0.5, yMax: 2 }, starts: [{ x: 0, y: 0.1 }, { x: 0, y: 1.8 }],
    note: {
      zh: "dy/dt = y(1−y)：可分离；常数解 y = 0 不稳定、y = 1 稳定；它也是自治方程和 n = 2 的 Bernoulli 方程。",
      en: "dy/dt = y(1−y): separable; the constant solutions are y = 0 (unstable) and y = 1 (stable); it is also autonomous and a Bernoulli equation with n = 2.",
    },
  },
  {
    id: "gaussian", group: "separable", mode: "first", name: { zh: "dy/dt = −2ty", en: "dy/dt = −2ty" },
    expressions: { g: "-2*t*y" }, box: sq(2), starts: [{ x: 0, y: 1 }, { x: 0, y: -1 }],
    note: {
      zh: "dy/dt = −2ty：可分离，解 y = C·e^(−t²) 是钟形曲线；常数解 y = 0 在 t < 0 时被解离开、t > 0 时被解趋近，稳定性随 t 变化。",
      en: "dy/dt = −2ty: separable, the solutions y = C·e^(−t²) are bell curves; the constant solution y = 0 is left by the solutions for t < 0 and approached for t > 0, so its stability varies with t.",
    },
  },
  // ---- 一阶·线性 ----
  {
    id: "forced", group: "linear", mode: "first", name: { zh: "受迫响应 dy/dt = −y + sin t", en: "Forced response dy/dt = −y + sin t" },
    expressions: { g: "-y + sin(t)" }, box: { xMin: 0, xMax: 12, yMin: -2, yMax: 2 }, starts: [{ x: 0, y: 1.5 }, { x: 0, y: -1.5 }],
    note: {
      zh: "dy/dt = −y + sin t：线性、非自治，没有常数解；通解 y = (sin t − cos t)/2 + C·e^(−t)，每条解都趋向同一个受迫响应（振幅 √2/2 的正弦波）。",
      en: "dy/dt = −y + sin t: linear and non-autonomous, no constant solution; y = (sin t − cos t)/2 + C·e^(−t), so every solution approaches the same forced response (a sine wave of amplitude √2/2).",
    },
  },
  {
    id: "linear-t", group: "linear", mode: "first", name: { zh: "dy/dt = −y + t", en: "dy/dt = −y + t" },
    expressions: { g: "-y + t" }, box: { xMin: -1, xMax: 5, yMin: -2, yMax: 5 }, starts: [{ x: 0, y: 2 }, { x: 0, y: -1 }],
    note: {
      zh: "dy/dt = −y + t：线性，解 y = t − 1 + C·e^(−t)，全部趋向直线 y = t − 1（它不是常数解，而是一条斜渐近线）。",
      en: "dy/dt = −y + t: linear, y = t − 1 + C·e^(−t); every solution approaches the line y = t − 1 (not a constant solution but an oblique asymptote).",
    },
  },
  // ---- 一阶·恰当 ----
  {
    id: "exact", group: "exact", mode: "diff", name: { zh: "2ty dt + (t²+y²) dy = 0", en: "2ty dt + (t²+y²) dy = 0" },
    expressions: { M: "2*t*y", N: "t^2 + y^2" }, box: sq(2),
    note: {
      zh: "∂M/∂y = 2t = ∂N/∂t，恰当方程；隐式解 t²y + y³/3 = C 画成紫色等值线。",
      en: "∂M/∂y = 2t = ∂N/∂t, so the equation is exact; the implicit solutions t²y + y³/3 = C are the violet level curves.",
    },
  },
  {
    id: "circles", group: "exact", mode: "diff", name: { zh: "圆族 t dt + y dy = 0", en: "Circles t dt + y dy = 0" },
    expressions: { M: "t", N: "y" }, box: sq(2),
    note: {
      zh: "恰当方程，解是圆 t² + y² = C；在 y = 0 处切线竖直，微分形式下这不是奇点。",
      en: "Exact; the solutions are the circles t² + y² = C. The vertical tangents at y = 0 are not singular points in differential form.",
    },
  },
  // ---- 一阶·Bernoulli ----
  {
    id: "bernoulli", group: "bernoulli", mode: "first", name: { zh: "Bernoulli dy/dt = y + t√y", en: "Bernoulli dy/dt = y + t√y" },
    expressions: { g: "y + t*sqrt(y)" }, box: { xMin: -2, xMax: 3, yMin: -0.5, yMax: 4 }, starts: [{ x: 0, y: 1 }, { x: 0, y: 0.1 }],
    note: {
      zh: "dy/dt = y + t√y：Bernoulli 方程（n = 1/2），令 v = √y 化为线性方程 v' = v/2 + t/2，解 y = (C·e^(t/2) − t − 2)²；只在 y ≥ 0 有定义，y = 0 是定义域边界上的常数解。",
      en: "dy/dt = y + t√y: a Bernoulli equation (n = 1/2); v = √y turns it into the linear equation v' = v/2 + t/2, so y = (C·e^(t/2) − t − 2)²; defined only for y ≥ 0, with y = 0 a constant solution on the edge of the domain.",
    },
  },
  // ---- 一阶·齐次 ----
  {
    id: "homogeneous", group: "homogeneous", mode: "first", name: { zh: "齐次 dy/dt = (t+y)/t", en: "Homogeneous dy/dt = (t+y)/t" },
    expressions: { g: "(t + y)/t" }, box: { xMin: 0.2, xMax: 4, yMin: -4, yMax: 4 }, starts: [{ x: 1, y: 0 }, { x: 1, y: 1 }],
    note: {
      zh: "dy/dt = (t+y)/t：齐次方程（右端只依赖 y/t），令 v = y/t 得 t·v' = 1，解 y = t(ln t + C)；t = 0 处方程无定义，所以范围从 t = 0.2 开始。",
      en: "dy/dt = (t+y)/t: homogeneous (the right-hand side depends on y/t only); v = y/t gives t·v' = 1, so y = t(ln t + C); the equation is undefined at t = 0, hence the range starts at t = 0.2.",
    },
  },
  // ---- 一阶·解不出来的 ----
  {
    id: "riccati", group: "noClosedForm", mode: "first", name: { zh: "Riccati dy/dt = t² + y²", en: "Riccati dy/dt = t² + y²" },
    expressions: { g: "t^2 + y^2" }, box: sq(2), starts: [{ x: 0, y: 0 }],
    note: {
      zh: "dy/dt = t² + y²（Riccati）：没有初等闭式解，八种类型探测全部否定；斜率场和数值解照样有效，而且 y' ≥ y² 使每条解都在有限时间内爆破。",
      en: "dy/dt = t² + y² (Riccati): no elementary closed form and every form probe is negative; the slope field and numerical solutions are fully valid, and y' ≥ y² makes every solution blow up in finite time.",
    },
  },
  {
    id: "sinty", group: "noClosedForm", mode: "first", name: { zh: "dy/dt = sin(ty)", en: "dy/dt = sin(ty)" },
    expressions: { g: "sin(t*y)" }, box: sq(4), starts: [{ x: 0, y: 1 }, { x: 0, y: -1 }],
    note: {
      zh: "dy/dt = sin(ty)：没有初等闭式解；y = 0 是唯一的常数解，t < 0 时被解趋近、t > 0 时被解离开（稳定性随 t 变化）；图案沿双曲线 ty = 常数重复。",
      en: "dy/dt = sin(ty): no elementary closed form; y = 0 is the only constant solution, approached for t < 0 and left for t > 0 (its stability varies with t); the pattern repeats along the hyperbolas ty = const.",
    },
  },
  // ---- 一阶·唯一性失效 ----
  {
    id: "sqrt", group: "uniqueness", mode: "first", name: { zh: "dy/dt = √y", en: "dy/dt = √y" },
    expressions: { g: "sqrt(y)" }, box: { xMin: -2, xMax: 4, yMin: -0.3, yMax: 1.5 }, starts: [{ x: 0, y: 0.25 }],
    note: {
      zh: "dy/dt = √y：y = 0 是常数解，但 ∂g/∂y = 1/(2√y) 在 y = 0 处无界，唯一性定理不适用——经过 (t₀, 0) 有无穷多条解（先沿 y = 0 走一段，再沿 y = (t − C)²/4 上升）。",
      en: "dy/dt = √y: y = 0 is a constant solution, but ∂g/∂y = 1/(2√y) is unbounded there and the uniqueness theorem does not apply: infinitely many solutions pass through (t₀, 0) (stay on y = 0 for a while, then rise along y = (t − C)²/4).",
    },
  },
  // ---- 二阶/系统 ----
  {
    id: "harmonic", group: "systems", mode: "system", name: { zh: "简谐振子", en: "Harmonic oscillator" },
    expressions: { f: "y", g: "-x" }, box: sq(3), starts: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
    note: {
      zh: "x' = y，y' = −x：原点是中心（线性化只能说到「中心或弱螺旋」），轨线是圆 x² + y² = C。",
      en: "x' = y, y' = −x: the origin is a center (linearization can only say 'center or weak spiral'); the orbits are the circles x² + y² = C.",
    },
  },
  {
    id: "damped", group: "systems", mode: "system", name: { zh: "阻尼振子（系统）", en: "Damped oscillator (system)" },
    expressions: { f: "y", g: "-x - 0.5*y" }, box: sq(3), starts: [{ x: 2, y: 0 }],
    note: {
      zh: "x' = y，y' = −x − 0.5y：原点是稳定螺旋点，特征值 −1/4 ± i√15/4。",
      en: "x' = y, y' = −x − 0.5y: the origin is a stable spiral, eigenvalues −1/4 ± i√15/4.",
    },
  },
  {
    id: "damped2", group: "systems", mode: "second", name: { zh: "阻尼振子（二阶方程）", en: "Damped oscillator (second order)" },
    expressions: { eq: "x'' + 0.5*x' + x = 0" }, box: sq(3), starts: [{ x: 2, y: 0 }],
    note: {
      zh: "x'' + 0.5x' + x = 0：令 y = x' 得 x' = y，y' = −x − 0.5y，与「阻尼振子（系统）」是同一个系统；原点是稳定螺旋点。",
      en: "x'' + 0.5x' + x = 0: with y = x' it is x' = y, y' = −x − 0.5y, the same system as 'Damped oscillator (system)'; the origin is a stable spiral.",
    },
  },
  {
    id: "pendulum", group: "systems", mode: "second", name: { zh: "单摆 x'' = −sin x", en: "Pendulum x'' = −sin x" },
    expressions: { eq: "x'' = -sin(x)" }, box: { xMin: -7, xMax: 7, yMin: -3, yMax: 3 }, starts: [{ x: 0, y: 1 }, { x: 0, y: 2.5 }],
    note: {
      zh: "x'' = −sin x：令 y = x' 得 x' = y，y' = −sin x；x = 2kπ 是中心或弱螺旋（线性化分不清），x = (2k+1)π 是鞍点；能量 y²/2 − cos x 守恒，过 (0, ±2) 的分界线把振动（内）与旋转（外）分开。",
      en: "x'' = −sin x: with y = x', x' = y, y' = −sin x; x = 2kπ are centers-or-weak-spirals (linearization cannot tell), x = (2k+1)π are saddles; the energy y²/2 − cos x is conserved, and the separatrix through (0, ±2) divides libration (inside) from rotation (outside).",
    },
  },
  {
    id: "vdp", group: "systems", mode: "system", name: { zh: "Van der Pol", en: "Van der Pol" },
    expressions: { f: "y", g: "(1 - x^2)*y - x" }, box: sq(4), starts: [{ x: 0.1, y: 0 }, { x: 3, y: 3 }],
    note: {
      zh: "x' = y，y' = (1 − x²)y − x：原点是不稳定螺旋点（迹 1，行列式 1），里外的轨线都趋向同一个极限环。",
      en: "x' = y, y' = (1 − x²)y − x: the origin is an unstable spiral (trace 1, determinant 1); trajectories from inside and outside approach the same limit cycle.",
    },
  },
  {
    id: "lotka", group: "systems", mode: "system", name: { zh: "Lotka–Volterra", en: "Lotka–Volterra" },
    expressions: { f: "x - x*y", g: "x*y - y" }, box: { xMin: -0.5, xMax: 4, yMin: -0.5, yMax: 4 }, starts: [{ x: 1.5, y: 1.5 }, { x: 3, y: 1 }],
    note: {
      zh: "x' = x − xy，y' = xy − y：(0,0) 是鞍点，(1,1) 是中心或弱螺旋；H = x − ln x + y − ln y 守恒，所以第一象限的轨线是闭曲线。",
      en: "x' = x − xy, y' = xy − y: (0,0) is a saddle, (1,1) a center-or-weak-spiral; H = x − ln x + y − ln y is conserved, so the orbits in the first quadrant are closed curves.",
    },
  },
  {
    id: "saddle", group: "systems", mode: "system", name: { zh: "鞍点", en: "Saddle" },
    expressions: { f: "x", g: "-y" }, box: sq(3), starts: [{ x: 0.1, y: 2 }, { x: -0.1, y: -2 }],
    note: {
      zh: "x' = x，y' = −y：特征值 1 与 −1，坐标轴是不稳定流形和稳定流形，其他轨线是双曲线 xy = C。",
      en: "x' = x, y' = −y: eigenvalues 1 and −1; the axes are the unstable and stable manifolds, the other orbits are the hyperbolas xy = C.",
    },
  },
  {
    id: "star", group: "systems", mode: "system", name: { zh: "星形结点", en: "Star node" },
    expressions: { f: "x", g: "y" }, box: sq(3), starts: [{ x: 0.3, y: 0.3 }, { x: -0.3, y: 0.5 }, { x: 0.5, y: -0.2 }],
    note: {
      zh: "x' = x，y' = y：特征值 1 是二重根，且有两个线性无关的特征向量——不稳定的星形结点，每条从原点出发的射线都是轨线。",
      en: "x' = x, y' = y: the eigenvalue 1 is repeated with two independent eigenvectors: an unstable star node, and every ray from the origin is an orbit.",
    },
  },
  // ---- 非自治 ----
  {
    id: "resonance", group: "nonAutonomous", mode: "system", name: { zh: "受迫振子 x' = y, y' = −x + sin t", en: "Forced oscillator x' = y, y' = −x + sin t" },
    expressions: { f: "y", g: "-x + sin(t)" }, box: sq(3), starts: [{ x: 0, y: 0 }],
    note: {
      zh: "x' = y，y' = −x + sin t：非自治系统，向量场随 t 变化，图上只是所选快照时刻的场，平衡点与线性化稳定性在此不适用；外力频率等于固有频率 1，共振使 x = (sin t − t·cos t)/2 的振幅随 t 线性增长。",
      en: "x' = y, y' = −x + sin t: a non-autonomous system; the field changes with t, the picture is the snapshot at the chosen time, and equilibria / linearized stability do not apply; the forcing frequency equals the natural frequency 1, so resonance makes x = (sin t − t·cos t)/2 grow linearly in amplitude.",
    },
  },
];

/** The whole page state of a preset (unused expressions keep the defaults, so links stay short). */
export function presetState(p: Preset): AppState {
  return {
    ...DEFAULT_STATE,
    ...p.expressions,
    mode: p.mode,
    box: { ...p.box },
    trajectoryStarts: (p.starts ?? []).map((q) => ({ x: q.x, y: q.y })),
  };
}

/** Shareable link of a preset: PRESET_PATH plus the encoded state. */
export function presetUrl(p: Preset): string {
  const q = encodeState(presetState(p));
  return `${PRESET_PATH}${q ? `?${q}` : ""}`;
}

/** Presets by chapter, in declaration order (for a <select> with one <optgroup> per chapter). */
export function presetsByGroup(): { group: PresetGroup; presets: Preset[] }[] {
  return PRESET_GROUPS.map((group) => ({ group, presets: PRESETS.filter((p) => p.group === group.id) }));
}
