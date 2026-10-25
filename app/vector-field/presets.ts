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
 *
 * Round Z (Z1.1, the professor's "it is unclear what is y here"): WHATEVER THE TOOL WRITES INTO THE
 * EQUATION BOX BY ITSELF MUST EXPLAIN ITS OWN SYMBOLS. A student who writes x' = y chose that y; a
 * preset that writes x' = y introduced it, so a preset that is a second-order equation written as
 * a system (harmonic, damped, vdp, resonance) carries the original equation and "y = x'" in its
 * NAME and opens its note with the reduction (let y = x', the velocity). The other planar presets
 * (Lotka-Volterra, saddle, star node) are untouched: their x and y are two unknown functions with
 * no hidden meaning. Z1.3: such a preset and its second-order twin point at each other (`twin`).
 *
 * Round 12: the last chapter opens the SERIES PANEL (`series`): power series of linear equations
 * with polynomial coefficients (Airy, Legendre, Hermite, dy/dt = 2ty) and the solution formula
 * u = u_h + u_p of constant-coefficient equations (the forced damped oscillator, dy/dt = -k y + 1,
 * x'' + w^2 x = cos t). Their notes are derived by hand for the preset's own values, name every
 * symbol they introduce (a_n, x_1, x_h, x_p, C, r) and say what dragging the slider does; the facts
 * they state are checked through lib/series in presets.test.ts. Each one's start is the panel's own
 * initial value at t0 = 0, so the kept curve is the solution the panel expands.
 */
import type { Locale, Range, Vec2 } from "@/lib/core/types";
import type { ParamEntry, SliderEntry } from "@/lib/params";
import { DEFAULT_SERIES_SETTINGS, type SeriesSettings } from "@/lib/series-panel";
import { DEFAULT_STATE, encodeState, type AppBox, type AppMode, type AppState, type ViewChoice } from "@/lib/url-state";

/** The form vocabulary of VectorFieldApp (explicit / differential); presets use the link vocabulary AppMode. */
export type PresetMode = "system" | "explicit" | "differential" | "second";

export type PresetGroupId = "separable" | "linear" | "exact" | "bernoulli" | "homogeneous" | "noClosedForm" | "uniqueness" | "secondOrder" | "systems" | "nonAutonomous" | "series";

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
  /**
   * Round Z1.3: the same model written the other way (a second-order equation <-> the planar system
   * it reduces to), shown as a clickable hint after the note; `label` says what the reader gets.
   * When the two are NOT the same equation (resonance's forcing is sin t, the beats' is F cos(g t))
   * the label says "related", never "the same equation" (tested).
   */
  twin?: { id: string; label: Record<Locale, string> };
  /** Round Z2.1: the view the preset opens with ("both" for the four mechanical presets written as systems); absent = the default rule. */
  view?: ViewChoice;
  /** Round 12: the series panel the preset opens with (the power series or the solution formula); absent = the panel is off. */
  series?: SeriesSettings;
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
  // Round 12: the series panel's chapter (power series, the split u = u_h + u_p).
  { id: "series", name: { zh: "幂级数与解的公式", en: "Power series and solution formulas" } },
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
    twin: { id: "harmonic", label: { zh: "同一个方程写成系统 x' = y, y' = −x（y = x'）", en: "The same equation written as a system: x' = y, y' = −x (y = x')" } },
    note: {
      zh: "x'' = −x：令 v = x' 得 x' = v，v' = −x；平衡点 (x, x') = (0, 0) 是常数解 x ≡ 0（静止）。线性化只能说「中心或弱螺旋」；能量 x'²/2 + x²/2 守恒，所以它其实是中心，相平面里的轨线是圆 x² + x'² = C。",
      en: "x'' = −x: with v = x', x' = v, v' = −x; the equilibrium (x, x') = (0, 0) is the constant solution x ≡ 0 (at rest). Linearization can only say 'center or weak spiral'; the energy x'²/2 + x²/2 is conserved, so it is in fact a center and the trajectories of the phase plane are the circles x² + x'² = C.",
    },
  },
  {
    id: "vdp2", group: "secondOrder", mode: "second", name: { zh: "Van der Pol x'' = (1 − x²)x' − x", en: "Van der Pol x'' = (1 − x²)x' − x" },
    expressions: { eq: "x'' = (1 - x^2)*x' - x" }, box: sq(4), starts: [{ x: 0.1, y: 0 }, { x: 3, y: 3 }],
    twin: { id: "vdp", label: { zh: "同一个方程写成系统 x' = y, y' = (1 − x²)y − x（y = x'）", en: "The same equation written as a system: x' = y, y' = (1 − x²)y − x (y = x')" } },
    note: {
      zh: "x'' = (1 − x²)x' − x：令 v = x' 得 x' = v，v' = (1 − x²)v − x，与「Van der Pol」平面系统是同一个系统；平衡点 (x, x') = (0, 0) 是不稳定螺旋点（迹 1，行列式 1），里外的轨线都趋向同一个极限环。",
      en: "x'' = (1 − x²)x' − x: with v = x', x' = v, v' = (1 − x²)v − x, the same system as the planar 'Van der Pol'; the equilibrium (x, x') = (0, 0) is an unstable spiral (trace 1, determinant 1), and trajectories from inside and outside approach the same limit cycle.",
    },
  },
  // ---- Planar systems ----
  {
    id: "harmonic", group: "systems", mode: "system", name: { zh: "简谐振子 x'' = −x（写成系统，y = x'）", en: "Harmonic oscillator x'' = −x (as a system, y = x')" },
    expressions: { f: "y", g: "-x" }, box: sq(3), starts: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
    view: "both",
    twin: { id: "harmonic2", label: { zh: "同一个方程的二阶写法 x'' = −x", en: "The same equation written as a second-order equation: x'' = −x" } },
    note: {
      zh: "x'' = −x 写成系统：令 y = x'（速度），得 x' = y、y' = −x。原点是中心（线性化只能说到「中心或弱螺旋」），轨线是圆 x² + y² = C，也就是 x² + x'² = C。",
      en: "x'' = −x written as a system: let y = x' (the velocity), so x' = y, y' = −x. The origin is a center (linearization can only say 'center or weak spiral'); the orbits are the circles x² + y² = C, that is x² + x'² = C.",
    },
  },
  {
    id: "damped", group: "systems", mode: "system", name: { zh: "阻尼振子 x'' + 0.5x' + x = 0（写成系统，y = x'）", en: "Damped oscillator x'' + 0.5x' + x = 0 (as a system, y = x')" },
    expressions: { f: "y", g: "-x - 0.5*y" }, box: sq(3), starts: [{ x: 2, y: 0 }],
    view: "both",
    twin: { id: "damped2", label: { zh: "同一个方程的二阶写法 x'' + 2b·x' + w²x = 0（b = 0.25、w = 1）", en: "The same equation written as a second-order equation: x'' + 2b·x' + w²x = 0 with b = 0.25, w = 1" } },
    note: {
      zh: "x'' + 0.5x' + x = 0 写成系统：令 y = x'（速度），得 x' = y、y' = −x − 0.5y。原点是稳定螺旋点，特征值 −1/4 ± i√15/4。",
      en: "x'' + 0.5x' + x = 0 written as a system: let y = x' (the velocity), so x' = y, y' = −x − 0.5y. The origin is a stable spiral, eigenvalues −1/4 ± i√15/4.",
    },
  },
  {
    id: "damped2", group: "secondOrder", mode: "second", name: { zh: "阻尼振子 x'' + 2b·x' + w²x = 0", en: "Damped oscillator x'' + 2b·x' + w²x = 0" },
    expressions: { eq: "x'' + 2*b*x' + w^2*x = 0" }, params: [{ name: "b", value: 0.25 }, { name: "w", value: 1 }],
    // The lesson is the passage through critical damping b = w = 1: the slider runs well past it.
    sliders: [{ name: "b", min: 0, max: 2, step: 0.01 }],
    box: sq(3), starts: [{ x: 2, y: 0 }],
    twin: { id: "damped", label: { zh: "同一个方程写成系统 x' = y, y' = −x − 0.5y（y = x'）", en: "The same equation written as a system: x' = y, y' = −x − 0.5y (y = x')" } },
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
    id: "vdp", group: "systems", mode: "system", name: { zh: "Van der Pol x'' = (1 − x²)x' − x（写成系统，y = x'）", en: "Van der Pol x'' = (1 − x²)x' − x (as a system, y = x')" },
    expressions: { f: "y", g: "(1 - x^2)*y - x" }, box: sq(4), starts: [{ x: 0.1, y: 0 }, { x: 3, y: 3 }],
    view: "both",
    twin: { id: "vdp2", label: { zh: "同一个方程的二阶写法 x'' = (1 − x²)x' − x", en: "The same equation written as a second-order equation: x'' = (1 − x²)x' − x" } },
    note: {
      zh: "x'' = (1 − x²)x' − x 写成系统：令 y = x'（速度），得 x' = y、y' = (1 − x²)y − x。原点是不稳定螺旋点（迹 1，行列式 1），里外的轨线都趋向同一个极限环。",
      en: "x'' = (1 − x²)x' − x written as a system: let y = x' (the velocity), so x' = y, y' = (1 − x²)y − x. The origin is an unstable spiral (trace 1, determinant 1); trajectories from inside and outside approach the same limit cycle.",
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
    id: "resonance", group: "nonAutonomous", mode: "system", name: { zh: "受迫振子 x'' = −x + sin t（写成系统，y = x'）", en: "Forced oscillator x'' = −x + sin t (as a system, y = x')" },
    expressions: { f: "y", g: "-x + sin(t)" }, box: sq(3), starts: [{ x: 0, y: 0 }],
    // Not the same equation as the beats preset (its forcing is F cos(g t)): the label says "related".
    view: "both",
    twin: { id: "beats", label: { zh: "相关预设：受迫振子的二阶写法 x'' = −x + F·cos(g·t)（外力换成 F·cos(g·t)；把 g 拖到 1 就是共振）", en: "Related preset: the forced oscillator as a second-order equation, x'' = −x + F·cos(g·t) (the forcing is F·cos(g·t) there; drag g to 1 for resonance)" } },
    note: {
      zh: "x'' = −x + sin t 写成系统：令 y = x'（速度），得 x' = y、y' = −x + sin t。非自治系统，向量场随 t 变化，图上只是所选快照时刻的场，平衡点与线性化稳定性在此不适用；外力频率等于固有频率 1，共振使 x = (sin t − t·cos t)/2 的振幅随 t 线性增长。",
      en: "x'' = −x + sin t written as a system: let y = x' (the velocity), so x' = y, y' = −x + sin t. A non-autonomous system: the field changes with t, the picture is the snapshot at the chosen time, and equilibria / linearized stability do not apply; the forcing frequency equals the natural frequency 1, so resonance makes x = (sin t − t·cos t)/2 grow linearly in amplitude.",
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
    // Not the same equation as the resonance preset (its forcing is sin t): the label says "related".
    twin: { id: "resonance", label: { zh: "相关预设：写成系统的共振例子 x' = y, y' = −x + sin t（y = x'；外力 sin t 正好在固有频率上）", en: "Related preset: the resonance example written as a system, x' = y, y' = −x + sin t (y = x'; the forcing sin t is exactly at the natural frequency)" } },
    note: {
      zh: "x'' = −x + F·cos(g·t)，F = 0.5、g = 1.2：右端含 t，方程非自治，相平面只是 t₀ 时刻的快照，不做平衡点分析。从静止出发的解是 x = F/(g² − 1)·(cos t − cos g·t) = (0.5/0.44)(cos t − cos 1.2t) = 2.27·sin(0.1t)·sin(1.1t)：外力频率 g = 1.2 接近固有频率 1，振幅按 sin(0.1t) 缓慢起伏，这就是拍。把 g 调向 1：振幅 F/|g² − 1| 变大，起伏变慢；g = 1 时是共振，x = (F/2)·t·sin t，振幅随 t 线性增长，在 t ≤ 70 内最大到 16.9，所以纵轴取到 ±20。",
      en: "x'' = −x + F·cos(g·t) with F = 0.5, g = 1.2: t appears on the right, so the equation is non-autonomous, the phase plane is only the snapshot at t₀ and no equilibrium analysis is made. From rest the solution is x = F/(g² − 1)·(cos t − cos g·t) = (0.5/0.44)(cos t − cos 1.2t) = 2.27·sin(0.1t)·sin(1.1t): the forcing frequency g = 1.2 is close to the natural frequency 1, so the amplitude rises and falls slowly with sin(0.1t): beats. Move g toward 1: the amplitude F/|g² − 1| grows and the beats slow down; at g = 1 it is resonance, x = (F/2)·t·sin t, whose amplitude grows linearly in t and reaches 16.9 within t ≤ 70, which is why the vertical axis runs to ±20.",
    },
  },
  // ---- Round 12: power series and solution formulas (the series panel opens with the preset) ----
  {
    id: "airy", group: "series", mode: "second", name: { zh: "Airy 方程 x'' − t·x = 0（幂级数）", en: "Airy equation x'' − t·x = 0 (power series)" },
    expressions: { eq: "x'' - t*x = 0" }, box: sq(3), starts: [{ x: 1, y: 0 }],
    // x(0) = 1, x'(0) = 0 oscillates for t < 0 and grows fast for t > 0: x(2) = 1 + 8/6 + 64/180 + ... = 2.7.
    timeRange: { min: -8, max: 2 },
    series: { kind: "series", terms: 9, center: 0, initial: [1, 0] },
    note: {
      zh: "x'' − t·x = 0（Airy 方程）：设 x = Σ aₙtⁿ，比较 tⁿ 的系数得 (n + 2)(n + 1)aₙ₊₂ = aₙ₋₁，所以 a₂ = 0、aₙ₊₂ = aₙ₋₁/((n + 2)(n + 1))，级数拆成 x = a₀x₁ + a₁x₂，其中 a₀ = x(0)、a₁ = x'(0)。x₁ = 1 + t³/6 + t⁶/180 + … 和 x₂ = t + t⁴/12 + … 都不会终止。系数都是多项式、x'' 的系数是常数 1，没有奇点，所以级数对所有 t 收敛；不过有限项的部分和在 |t| 大时仍会离开解。",
      en: "x'' − t·x = 0 (Airy): put x = Σ aₙtⁿ; the power tⁿ gives (n + 2)(n + 1)aₙ₊₂ = aₙ₋₁, so a₂ = 0 and aₙ₊₂ = aₙ₋₁/((n + 2)(n + 1)), and the series splits as x = a₀x₁ + a₁x₂ with a₀ = x(0), a₁ = x'(0). Neither x₁ = 1 + t³/6 + t⁶/180 + … nor x₂ = t + t⁴/12 + … stops. The coefficients are polynomials and the coefficient of x'' is the constant 1, so there is no singular point and the series converges for every t; a partial sum with finitely many terms still leaves the solution once |t| is large.",
    },
  },
  {
    id: "legendre", group: "series", mode: "second",
    name: { zh: "Legendre 方程 (1 − t²)x'' − 2t·x' + l(l + 1)x = 0", en: "Legendre equation (1 − t²)x'' − 2t·x' + l(l + 1)x = 0" },
    expressions: { eq: "(1 - t^2)*x'' - 2*t*x' + l*(l + 1)*x = 0" }, params: [{ name: "l", value: 2 }],
    // Every whole l from 0 to 5 is on the slider's grid: each one gives a polynomial basis series.
    sliders: [{ name: "l", min: 0, max: 5, step: 0.5 }],
    // x₁ = 1 − 3t² and x₁' = −6t on |t| < 1: x from −2 to 1, x' from −6 to 6.
    box: { xMin: -3, xMax: 3, yMin: -7, yMax: 7 }, starts: [{ x: 1, y: 0 }],
    // The solution graph shows the interval where convergence is guaranteed (the coefficient of x'' vanishes at t = ±1).
    timeRange: { min: -1, max: 1 },
    series: { kind: "series", terms: 8, center: 0, initial: [1, 0] },
    note: {
      zh: "(1 − t²)x'' − 2t·x' + l(l + 1)x = 0，参数 l = 2：设 x = Σ aₙtⁿ，得 aₙ₊₂ = (n − l)(n + l + 1)aₙ/((n + 2)(n + 1))，所以 l = 2 时偶次级数立刻终止：x₁ = 1 − 3t²（a₀ = x(0) = 1、a₁ = x'(0) = 0）。l 取任何非负整数时，两个基本级数中总有一个是多项式（l 为偶数时是偶次的那个，奇数时是奇次的那个）；拖动 l，其他取值下两个都是无穷级数。系数 1 − t² 在 t = ±1 处为零，这两点是奇点，所以只保证在 |t| < 1 内收敛。",
      en: "(1 − t²)x'' − 2t·x' + l(l + 1)x = 0 with the parameter l = 2: with x = Σ aₙtⁿ, aₙ₊₂ = (n − l)(n + l + 1)aₙ/((n + 2)(n + 1)), so at l = 2 the even series stops at once: x₁ = 1 − 3t² (a₀ = x(0) = 1, a₁ = x'(0) = 0). For every whole number l one of the two basis series is a polynomial (the even one for even l, the odd one for odd l); drag l and every other value gives two infinite series. The coefficient 1 − t² vanishes at t = ±1, the singular points, so convergence is guaranteed only for |t| < 1.",
    },
  },
  {
    id: "hermite", group: "series", mode: "second", name: { zh: "Hermite 方程 x'' − 2t·x' + 2m·x = 0", en: "Hermite equation x'' − 2t·x' + 2m·x = 0" },
    expressions: { eq: "x'' - 2*t*x' + 2*m*x = 0" }, params: [{ name: "m", value: 2 }],
    sliders: [{ name: "m", min: 0, max: 6, step: 1 }],
    // x₁ = 1 − 2t² and x₁' = −4t on |t| <= 2: x from −7 to 1, x' from −8 to 8.
    box: sq(8), starts: [{ x: 1, y: 0 }],
    timeRange: { min: -2, max: 2 },
    series: { kind: "series", terms: 8, center: 0, initial: [1, 0] },
    note: {
      zh: "x'' − 2t·x' + 2m·x = 0，参数 m = 2：设 x = Σ aₙtⁿ，得 aₙ₊₂ = 2(n − m)aₙ/((n + 2)(n + 1))，所以 m = 2 时偶次级数终止：x₁ = 1 − 2t²（a₀ = x(0) = 1、a₁ = x'(0) = 0）。m 取任何非负整数时，两个基本级数中总有一个是多项式（拖动 m：m 为偶数时是偶次的那个，奇数时是奇次的那个）。系数都是多项式、x'' 的系数是 1，所以级数对所有 t 收敛。",
      en: "x'' − 2t·x' + 2m·x = 0 with the parameter m = 2: with x = Σ aₙtⁿ, aₙ₊₂ = 2(n − m)aₙ/((n + 2)(n + 1)), so at m = 2 the even series stops: x₁ = 1 − 2t² (a₀ = x(0) = 1, a₁ = x'(0) = 0). For every whole number m one of the two basis series is a polynomial (drag m: the even one for even m, the odd one for odd m). The coefficients are polynomials and the coefficient of x'' is 1, so the series converges for every t.",
    },
  },
  {
    id: "gauss", group: "series", mode: "first", name: { zh: "dy/dt = 2ty（幂级数）", en: "dy/dt = 2ty (power series)" },
    expressions: { g: "2*t*y" },
    // y = e^(t²) from y(0) = 1: e^(1.5²) = 9.5 is inside the picture, e^4 = 54.6 at t = ±2 far above it.
    box: { xMin: -2, xMax: 2, yMin: -2, yMax: 10 }, starts: [{ x: 0, y: 1 }],
    series: { kind: "series", terms: 10, center: 0, initial: [1, 0] },
    note: {
      zh: "dy/dt = 2ty：设 y = Σ aₙtⁿ，比较 tⁿ 的系数得 (n + 1)aₙ₊₁ = 2aₙ₋₁，所以 a₁ = 0、aₙ₊₁ = 2aₙ₋₁/(n + 1)；奇次系数全为 0，a₂ₖ = a₀/k!。y(0) = a₀ = 1 时级数就是 y = Σ t²ᵏ/k! = e^(t²)，和分离变量得到的解相同，对所有 t 收敛。",
      en: "dy/dt = 2ty: with y = Σ aₙtⁿ the power tⁿ gives (n + 1)aₙ₊₁ = 2aₙ₋₁, so a₁ = 0 and aₙ₊₁ = 2aₙ₋₁/(n + 1); every odd coefficient vanishes and a₂ₖ = a₀/k!. For y(0) = a₀ = 1 the series is y = Σ t²ᵏ/k! = e^(t²), the solution separation of variables gives, and it converges for every t.",
    },
  },
  {
    // "forced" is the first-order dy/dt = −y + sin t of the linear chapter; second-order versions carry a 2 (harmonic2, damped2).
    id: "forced2", group: "series", mode: "second",
    name: { zh: "受迫阻尼振子 x'' + b·x' + k·x = F·cos(w·t)（解的公式）", en: "Forced damped oscillator x'' + b·x' + k·x = F·cos(w·t) (solution formula)" },
    expressions: { eq: "x'' + b*x' + k*x = F*cos(w*t)" },
    params: [{ name: "b", value: 0.5 }, { name: "k", value: 4 }, { name: "F", value: 1 }, { name: "w", value: 1 }],
    // b runs past critical damping b = 2√k = 4 (k = 4); w runs past the natural frequency √k = 2.
    sliders: [{ name: "b", min: 0, max: 5, step: 0.05 }, { name: "w", min: 0, max: 4, step: 0.05 }],
    // x_h decays like e^(−bt/2) = e^(−t/4): e^(−7.5) = 0.0006 at t = 30, so the graph ends on the steady state.
    box: { xMin: -2, xMax: 2, yMin: -3, yMax: 3 }, starts: [{ x: 1, y: 0 }],
    timeRange: { min: 0, max: 30 },
    series: { kind: "formula", terms: 8, center: 0, initial: [1, 0] },
    note: {
      zh: "x'' + b·x' + k·x = F·cos(w·t)，阻尼 b = 0.5、刚度 k = 4、外力振幅 F = 1、外力频率 w = 1：解的公式是 x = xₕ + xₚ（xₕ 是右端换成 0 的齐次方程的通解，xₚ 是一个特解）。特征方程 r² + b·r + k = 0 决定 xₕ：b² − 4k < 0 欠阻尼（这里 0.25 − 16 < 0），= 0 临界阻尼（k = 4 时 b = 4），> 0 过阻尼；b > 0 时两个根的实部都是负的，xₕ 衰减到 0，剩下的 xₚ = A·cos(w·t) + B·sin(w·t)（A、B 由待定系数法求出）就是稳态。b = 0 且 w = 2 = √k 时外力频率等于固有频率：共振，xₚ = (t/4)·sin(2t) 随 t 增长。",
      en: "x'' + b·x' + k·x = F·cos(w·t) with damping b = 0.5, stiffness k = 4, forcing amplitude F = 1 and forcing frequency w = 1: the solution formula is x = xₕ + xₚ (xₕ solves the equation with right-hand side 0, xₚ is one particular solution). The characteristic equation r² + b·r + k = 0 decides xₕ: b² − 4k < 0 is underdamped (here 0.25 − 16 < 0), = 0 critical (b = 4 at k = 4), > 0 overdamped; for b > 0 both roots have a negative real part, so xₕ dies out and xₚ = A·cos(w·t) + B·sin(w·t) (A, B from undetermined coefficients) is the steady state that remains. At b = 0 and w = 2 = √k the forcing is at the natural frequency: resonance, xₚ = (t/4)·sin(2t) grows.",
    },
  },
  {
    id: "cooling", group: "series", mode: "first", name: { zh: "dy/dt = −k·y + 1（解的公式）", en: "dy/dt = −k·y + 1 (solution formula)" },
    expressions: { g: "-k*y + 1" }, params: [{ name: "k", value: 1 }],
    sliders: [{ name: "k", min: 0, max: 3, step: 0.1 }],
    // From y(0) = 0: y = 1 − e^(−t) rises to the line y = 1/k = 1; at k = 0 the line y = t reaches 3 at t = 3.
    box: { xMin: 0, xMax: 8, yMin: -1, yMax: 3 }, starts: [{ x: 0, y: 0 }],
    series: { kind: "formula", terms: 8, center: 0, initial: [0, 0] },
    note: {
      zh: "dy/dt = −k·y + 1 即 dy/dt + k·y = 1，参数 k = 1：解的公式是 y = yₕ + yₚ，其中 yₕ = C·e^(−kt) 是 dy/dt + k·y = 0 的通解（C 是常数，r + k = 0 的根是 r = −k），常数试探解给出特解 yₚ = 1/k；所以 y = 1/k + (y(0) − 1/k)·e^(−kt)，k > 0 时 → 1/k，从 y(0) = 0 出发就是 y = 1 − e^(−t)。k = 0 时根 r = 0 正好是右端 1 = e^(0·t) 的指数，试探解要多乘一个 t：yₚ = t，y = y(0) + t。",
      en: "dy/dt = −k·y + 1, that is dy/dt + k·y = 1, with the parameter k = 1: the solution formula is y = yₕ + yₚ, where yₕ = C·e^(−kt) solves dy/dt + k·y = 0 (C a constant, r = −k the root of r + k = 0) and the constant trial gives the particular solution yₚ = 1/k; so y = 1/k + (y(0) − 1/k)·e^(−kt), which tends to 1/k for k > 0, and from y(0) = 0 it is y = 1 − e^(−t). At k = 0 the root r = 0 is the exponent of the right-hand side 1 = e^(0·t), so the trial gets the factor t: yₚ = t and y = y(0) + t.",
    },
  },
  {
    id: "resonance-formula", group: "series", mode: "second", name: { zh: "x'' + w²·x = cos t（解的公式，共振）", en: "x'' + w²·x = cos t (solution formula, resonance)" },
    expressions: { eq: "x'' + w^2*x = cos(t)" }, params: [{ name: "w", value: 1.5 }],
    // w = 1 (resonance) is on the slider's grid: 0.5 + 10 * 0.05.
    sliders: [{ name: "w", min: 0.5, max: 3, step: 0.05 }],
    // From rest |x| = |cos t − cos(w t)|/|w² − 1| <= 2/0.75 = 2.67 at w = 0.5, 2/1.25 = 1.6 at w = 1.5.
    box: sq(3), starts: [{ x: 0, y: 0 }],
    timeRange: { min: 0, max: 60 },
    series: { kind: "formula", terms: 8, center: 0, initial: [0, 0] },
    note: {
      zh: "x'' + w²·x = cos t，固有频率 w = 1.5：x = xₕ + xₚ，齐次部分 xₕ = C₁·cos(w·t) + C₂·sin(w·t)（C₁、C₂ 是常数，r² + w² = 0 的根是 ±w·i），w ≠ 1 时特解 xₚ = cos t/(w² − 1)；从静止 x(0) = x'(0) = 0 出发，x = (cos t − cos(1.5t))/1.25。w = 1 时外力 cos t 本身就是齐次方程的解，试探解要多乘一个 t，xₚ = (t/2)·sin t 无界增长：共振。",
      en: "x'' + w²·x = cos t with the natural frequency w = 1.5: x = xₕ + xₚ, the homogeneous part xₕ = C₁·cos(w·t) + C₂·sin(w·t) (C₁, C₂ constants; the roots of r² + w² = 0 are ±w·i) and, for w ≠ 1, the particular solution xₚ = cos t/(w² − 1); from rest, x(0) = x'(0) = 0, x = (cos t − cos(1.5t))/1.25. At w = 1 the forcing cos t itself solves the homogeneous equation, so the trial gets the factor t and xₚ = (t/2)·sin t grows without bound: resonance.",
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
    ...(p.view ? { view: p.view } : {}),
    series: p.series ? { ...p.series, initial: [p.series.initial[0], p.series.initial[1]] } : DEFAULT_SERIES_SETTINGS,
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
