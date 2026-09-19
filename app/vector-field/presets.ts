/**
 * Preset library of the web shell: chapter groups of textbook examples. Each preset is a complete
 * page state (mode, expressions, box, optional fixed trajectory starts) with a bilingual name and
 * a one-sentence note saying what the picture demonstrates. Every note is derived by hand and
 * stays honest ("center or weak spiral", never "center"). Boxes are chosen so the features are
 * visible; starts are chosen so the traced curves make the point. presetUrl() makes each preset a
 * shareable link (the home page can list them).
 *
 * Round T: five presets are written with SYMBOLIC PARAMETERS (logistic k, L; Newton cooling k, Ta;
 * the damped oscillator b, w; beats F, g; Lotka-Volterra a, b, c, d), so a student who opens one
 * sees what the parameter area is for. Their notes are derived for the preset's own values and say
 * what changing a parameter does.
 */
import type { Locale, Range, Vec2 } from "@/lib/core/types";
import type { ParamEntry, SliderEntry } from "@/lib/params";
import { DEFAULT_STATE, encodeState, type AppBox, type AppMode, type AppState } from "@/lib/url-state";

/** The form vocabulary of VectorFieldApp (explicit / differential); presets use the link vocabulary AppMode. */
export type PresetMode = "system" | "explicit" | "differential" | "second";

export type PresetGroupId = "separable" | "linear" | "exact" | "bernoulli" | "homogeneous" | "noClosedForm" | "uniqueness" | "secondOrder" | "systems" | "nonAutonomous";

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
  /** Round T: the values of the symbolic parameters the expressions use (every free name, no spare ones; tested). */
  params?: ParamEntry[];
  /** Round U: sliders the preset opens with (the parameter the lesson is about). */
  sliders?: SliderEntry[];
  /** Round U: the t range of the time-series view, when the lesson needs more than the default 0..20. */
  timeRange?: Range;
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
  // Round P2.8: the second-order chapter's examples are entered as the student sees them (x'' = F),
  // and the same models as planar systems live in their own group.
  { id: "secondOrder", name: { zh: "二阶方程", en: "Second-order equations" } },
  { id: "systems", name: { zh: "平面系统", en: "Planar systems" } },
  { id: "nonAutonomous", name: { zh: "非自治", en: "Non-autonomous" } },
];

const sq = (r: number): AppBox => ({ xMin: -r, xMax: r, yMin: -r, yMax: r });

export const PRESETS: Preset[] = [
  // ---- First order: separable ----
  {
    id: "logistic", group: "separable", mode: "first", name: { zh: "Logistic dy/dt = k·y(1 − y/L)", en: "Logistic dy/dt = k·y(1 − y/L)" },
    expressions: { g: "k*y*(1 - y/L)" }, params: [{ name: "k", value: 0.8 }, { name: "L", value: 2 }],
    box: { xMin: 0, xMax: 10, yMin: -0.5, yMax: 3 }, starts: [{ x: 0, y: 0.1 }, { x: 0, y: 2.8 }],
    note: {
      zh: "dy/dt = k·y(1 − y/L)，k = 0.8、L = 2：可分离；常数解 y = 0 不稳定、y = L = 2 稳定，解是 y = L/(1 + ((L − y₀)/y₀)·e^(−kt))；它也是自治方程和 n = 2 的 Bernoulli 方程。改 L，稳定的那条线跟着移动；改 k（保持 k > 0），只改变趋近的快慢。",
      en: "dy/dt = k·y(1 − y/L) with k = 0.8, L = 2: separable; the constant solutions are y = 0 (unstable) and y = L = 2 (stable), and y = L/(1 + ((L − y₀)/y₀)·e^(−kt)); it is also autonomous and a Bernoulli equation with n = 2. Change L and the stable line moves with it; change k (keeping k > 0) and only the speed of approach changes.",
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
  // ---- First order: linear ----
  {
    id: "newton", group: "linear", mode: "first", name: { zh: "牛顿冷却 dy/dt = −k(y − Ta)", en: "Newton cooling dy/dt = −k(y − Ta)" },
    expressions: { g: "-k*(y - Ta)" }, params: [{ name: "k", value: 0.3 }, { name: "Ta", value: 20 }],
    box: { xMin: 0, xMax: 15, yMin: 0, yMax: 40 }, starts: [{ x: 0, y: 35 }, { x: 0, y: 5 }],
    note: {
      zh: "dy/dt = −k(y − Ta)，k = 0.3、环境温度 Ta = 20：线性（也可分离、自治）；解 y = Ta + (y₀ − Ta)·e^(−kt)，常数解 y = Ta = 20 稳定，热的、冷的物体都趋向环境温度。改 Ta，那条线跟着移动；k 越大趋近越快。",
      en: "dy/dt = −k(y − Ta) with k = 0.3 and ambient temperature Ta = 20: linear (also separable and autonomous); y = Ta + (y₀ − Ta)·e^(−kt), and the constant solution y = Ta = 20 is stable: a hot body and a cold one both approach the ambient temperature. Change Ta and the line moves with it; a larger k approaches faster.",
    },
  },
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
  // ---- First order: exact ----
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
  // ---- First order: Bernoulli ----
  {
    id: "bernoulli", group: "bernoulli", mode: "first", name: { zh: "Bernoulli dy/dt = y + t√y", en: "Bernoulli dy/dt = y + t√y" },
    expressions: { g: "y + t*sqrt(y)" }, box: { xMin: -2, xMax: 3, yMin: -0.5, yMax: 4 }, starts: [{ x: 0, y: 1 }, { x: 0, y: 0.1 }],
    note: {
      zh: "dy/dt = y + t√y：Bernoulli 方程（n = 1/2），令 v = √y 化为线性方程 v' = v/2 + t/2，解 y = (C·e^(t/2) − t − 2)²；只在 y ≥ 0 有定义，y = 0 是定义域边界上的常数解。",
      en: "dy/dt = y + t√y: a Bernoulli equation (n = 1/2); v = √y turns it into the linear equation v' = v/2 + t/2, so y = (C·e^(t/2) − t − 2)²; defined only for y ≥ 0, with y = 0 a constant solution on the edge of the domain.",
    },
  },
  // ---- First order: homogeneous ----
  {
    id: "homogeneous", group: "homogeneous", mode: "first", name: { zh: "齐次 dy/dt = (t+y)/t", en: "Homogeneous dy/dt = (t+y)/t" },
    expressions: { g: "(t + y)/t" }, box: { xMin: 0.2, xMax: 4, yMin: -4, yMax: 4 }, starts: [{ x: 1, y: 0 }, { x: 1, y: 1 }],
    note: {
      zh: "dy/dt = (t+y)/t：齐次方程（右端只依赖 y/t），令 v = y/t 得 t·v' = 1，解 y = t(ln t + C)；t = 0 处方程无定义，所以范围从 t = 0.2 开始。",
      en: "dy/dt = (t+y)/t: homogeneous (the right-hand side depends on y/t only); v = y/t gives t·v' = 1, so y = t(ln t + C); the equation is undefined at t = 0, hence the range starts at t = 0.2.",
    },
  },
  // ---- First order: no closed form ----
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
  // ---- First order: uniqueness fails ----
  {
    id: "sqrt", group: "uniqueness", mode: "first", name: { zh: "dy/dt = √y", en: "dy/dt = √y" },
    expressions: { g: "sqrt(y)" }, box: { xMin: -2, xMax: 4, yMin: -0.3, yMax: 1.5 }, starts: [{ x: 0, y: 0.25 }],
    note: {
      zh: "dy/dt = √y：y = 0 是常数解，但 ∂g/∂y = 1/(2√y) 在 y = 0 处无界，唯一性定理不适用——经过 (t₀, 0) 有无穷多条解（先沿 y = 0 走一段，再沿 y = (t − C)²/4 上升）。",
      en: "dy/dt = √y: y = 0 is a constant solution, but ∂g/∂y = 1/(2√y) is unbounded there and the uniqueness theorem does not apply: infinitely many solutions pass through (t₀, 0) (stay on y = 0 for a while, then rise along y = (t − C)²/4).",
    },
  },
  // ---- Second-order equations (as the student writes them: x'' = F(t, x, x'), phase plane (x, x')) ----
  {
    id: "harmonic2", group: "secondOrder", mode: "second", name: { zh: "简谐振子 x'' = −x", en: "Harmonic oscillator x'' = −x" },
    expressions: { eq: "x'' = -x" }, box: sq(3), starts: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
    note: {
      zh: "x'' = −x：令 v = x' 得 x' = v，v' = −x；平衡点 (x, x') = (0, 0) 是常数解 x ≡ 0（静止）。线性化只能说「中心或弱螺旋」；能量 x'²/2 + x²/2 守恒，所以它其实是中心，相平面里的轨线是圆 x² + x'² = C。",
      en: "x'' = −x: with v = x', x' = v, v' = −x; the equilibrium (x, x') = (0, 0) is the constant solution x ≡ 0 (at rest). Linearization can only say 'center or weak spiral'; the energy x'²/2 + x²/2 is conserved, so it is in fact a center and the trajectories of the phase plane are the circles x² + x'² = C.",
    },
  },
  {
    id: "vdp2", group: "secondOrder", mode: "second", name: { zh: "Van der Pol x'' = (1 − x²)x' − x", en: "Van der Pol x'' = (1 − x²)x' − x" },
    expressions: { eq: "x'' = (1 - x^2)*x' - x" }, box: sq(4), starts: [{ x: 0.1, y: 0 }, { x: 3, y: 3 }],
    note: {
      zh: "x'' = (1 − x²)x' − x：令 v = x' 得 x' = v，v' = (1 − x²)v − x，与「Van der Pol」平面系统是同一个系统；平衡点 (x, x') = (0, 0) 是不稳定螺旋点（迹 1，行列式 1），里外的轨线都趋向同一个极限环。",
      en: "x'' = (1 − x²)x' − x: with v = x', x' = v, v' = (1 − x²)v − x, the same system as the planar 'Van der Pol'; the equilibrium (x, x') = (0, 0) is an unstable spiral (trace 1, determinant 1), and trajectories from inside and outside approach the same limit cycle.",
    },
  },
  // ---- Planar systems ----
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
    id: "damped2", group: "secondOrder", mode: "second", name: { zh: "阻尼振子 x'' + 2b·x' + w²x = 0", en: "Damped oscillator x'' + 2b·x' + w²x = 0" },
    expressions: { eq: "x'' + 2*b*x' + w^2*x = 0" }, params: [{ name: "b", value: 0.25 }, { name: "w", value: 1 }],
    // The lesson is the passage through critical damping b = w = 1: the slider runs well past it.
    sliders: [{ name: "b", min: 0, max: 2, step: 0.01 }],
    box: sq(3), starts: [{ x: 2, y: 0 }],
    note: {
      zh: "x'' + 2b·x' + w²x = 0，b = 0.25、w = 1：令 v = x' 得 x' = v，v' = −2b·v − w²x，与「阻尼振子（系统）」是同一个系统；特征值 −b ± √(b² − w²) = −1/4 ± i√15/4，平衡点 (x, x') = (0, 0)（物体静止）是稳定螺旋点（欠阻尼）。把 b 调过 w：b = w 是临界阻尼（重根），b > w 是过阻尼，螺旋点变成稳定结点。",
      en: "x'' + 2b·x' + w²x = 0 with b = 0.25, w = 1: with v = x' it is x' = v, v' = −2b·v − w²x, the same system as 'Damped oscillator (system)'; the eigenvalues are −b ± √(b² − w²) = −1/4 ± i√15/4, so the equilibrium (x, x') = (0, 0) (the body at rest) is a stable spiral (underdamped). Move b past w: b = w is critical damping (a repeated root), b > w is overdamped and the spiral becomes a stable node.",
    },
  },
  {
    id: "pendulum", group: "secondOrder", mode: "second", name: { zh: "单摆 x'' = −sin x", en: "Pendulum x'' = −sin x" },
    expressions: { eq: "x'' = -sin(x)" }, box: { xMin: -7, xMax: 7, yMin: -3, yMax: 3 }, starts: [{ x: 0, y: 1 }, { x: 0, y: 2.5 }],
    note: {
      zh: "x'' = −sin x：令 v = x' 得 x' = v，v' = −sin x；(x, x') = (2kπ, 0) 是中心或弱螺旋（线性化分不清），(x, x') = ((2k+1)π, 0) 是鞍点；能量 x'²/2 − cos x 守恒，过 (x, x') = (0, ±2) 的分界线把振动（内）与旋转（外）分开。",
      en: "x'' = −sin x: with v = x', x' = v, v' = −sin x; (x, x') = (2kπ, 0) are centers-or-weak-spirals (linearization cannot tell), (x, x') = ((2k+1)π, 0) are saddles; the energy x'²/2 − cos x is conserved, and the separatrix through (x, x') = (0, ±2) divides libration (inside) from rotation (outside).",
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
    expressions: { f: "a*x - b*x*y", g: "d*x*y - c*y" },
    params: [{ name: "a", value: 1 }, { name: "b", value: 0.5 }, { name: "c", value: 0.75 }, { name: "d", value: 0.25 }],
    box: { xMin: -0.5, xMax: 8, yMin: -0.5, yMax: 6 }, starts: [{ x: 3, y: 1 }, { x: 6.5, y: 2 }],
    note: {
      zh: "x' = a·x − b·xy，y' = d·xy − c·y，a = 1、b = 0.5、c = 0.75、d = 0.25：(0,0) 是鞍点（特征值 a 与 −c），(c/d, a/b) = (3, 2) 是中心或弱螺旋（特征值 ±i√(ac)）；H = d·x − c·ln x + b·y − a·ln y 守恒，所以第一象限的轨线是闭曲线。改参数，第二个平衡点跟着 (c/d, a/b) 移动。",
      en: "x' = a·x − b·xy, y' = d·xy − c·y with a = 1, b = 0.5, c = 0.75, d = 0.25: (0,0) is a saddle (eigenvalues a and −c), (c/d, a/b) = (3, 2) a center-or-weak-spiral (eigenvalues ±i√(ac)); H = d·x − c·ln x + b·y − a·ln y is conserved, so the orbits in the first quadrant are closed curves. Change a parameter and the second equilibrium moves with (c/d, a/b).",
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
  // ---- Non-autonomous ----
  {
    id: "resonance", group: "nonAutonomous", mode: "system", name: { zh: "受迫振子 x' = y, y' = −x + sin t", en: "Forced oscillator x' = y, y' = −x + sin t" },
    expressions: { f: "y", g: "-x + sin(t)" }, box: sq(3), starts: [{ x: 0, y: 0 }],
    note: {
      zh: "x' = y，y' = −x + sin t：非自治系统，向量场随 t 变化，图上只是所选快照时刻的场，平衡点与线性化稳定性在此不适用；外力频率等于固有频率 1，共振使 x = (sin t − t·cos t)/2 的振幅随 t 线性增长。",
      en: "x' = y, y' = −x + sin t: a non-autonomous system; the field changes with t, the picture is the snapshot at the chosen time, and equilibria / linearized stability do not apply; the forcing frequency equals the natural frequency 1, so resonance makes x = (sin t − t·cos t)/2 grow linearly in amplitude.",
    },
  },
  {
    id: "beats", group: "nonAutonomous", mode: "second", name: { zh: "受迫振子 / 拍频 x'' = −x + F·cos(g·t)", en: "Forced oscillator / beats x'' = −x + F·cos(g·t)" },
    expressions: { eq: "x'' = -x + F*cos(g*t)" }, params: [{ name: "F", value: 0.5 }, { name: "g", value: 1.2 }],
    // The lesson is the forcing frequency approaching the natural frequency 1. The envelope
    // sin((g - 1)t/2) of the beats has period 4 pi / |g - 1| = 62.8 at g = 1.2: the t range shows one whole envelope.
    sliders: [{ name: "g", min: 0.5, max: 1.5, step: 0.01 }], timeRange: { min: 0, max: 70 },
    // Round Y: ±20, not ±3. Dragging g to 1 is the lesson, and at resonance x = (F/2) t sin t reaches
    // 0.25 * 67.5 = 16.9 inside t <= 70 (at t = 3 pi/2 + 20 pi), the largest |x| over the whole slider
    // range: with ±3 the curve left the picture long before g reached 1. x' has the same size.
    box: sq(20), starts: [{ x: 0, y: 0 }],
    note: {
      zh: "x'' = −x + F·cos(g·t)，F = 0.5、g = 1.2：右端含 t，方程非自治，相平面只是 t₀ 时刻的快照，不做平衡点分析。从静止出发的解是 x = F/(g² − 1)·(cos t − cos g·t) = (0.5/0.44)(cos t − cos 1.2t) = 2.27·sin(0.1t)·sin(1.1t)：外力频率 g = 1.2 接近固有频率 1，振幅按 sin(0.1t) 缓慢起伏，这就是拍。把 g 调向 1：振幅 F/|g² − 1| 变大，起伏变慢；g = 1 时是共振，x = (F/2)·t·sin t，振幅随 t 线性增长，在 t ≤ 70 内最大到 16.9，所以纵轴取到 ±20。",
      en: "x'' = −x + F·cos(g·t) with F = 0.5, g = 1.2: t appears on the right, so the equation is non-autonomous, the phase plane is only the snapshot at t₀ and no equilibrium analysis is made. From rest the solution is x = F/(g² − 1)·(cos t − cos g·t) = (0.5/0.44)(cos t − cos 1.2t) = 2.27·sin(0.1t)·sin(1.1t): the forcing frequency g = 1.2 is close to the natural frequency 1, so the amplitude rises and falls slowly with sin(0.1t): beats. Move g toward 1: the amplitude F/|g² − 1| grows and the beats slow down; at g = 1 it is resonance, x = (F/2)·t·sin t, whose amplitude grows linearly in t and reaches 16.9 within t ≤ 70, which is why the vertical axis runs to ±20.",
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
    params: (p.params ?? []).map((e) => ({ ...e })),
    sliders: (p.sliders ?? []).map((e) => ({ ...e })),
    ...(p.timeRange ? { timeRange: { ...p.timeRange } } : {}),
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
