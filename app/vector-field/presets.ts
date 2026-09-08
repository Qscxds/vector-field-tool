/** One-click examples for the web shell. Boxes are chosen so the interesting features are visible. */
import type { Locale } from "@/lib/labels";

export type PresetMode = "system" | "explicit" | "differential";

export type Preset = {
  id: string;
  name: Record<Locale, string>;
  mode: PresetMode;
  /** x' (system) — unused otherwise. */
  f: string;
  /** y' (system) or g(t, y) (explicit first-order dy/dt = g). */
  g: string;
  /** Differential form M(t, y) dt + N(t, y) dy = 0 (first-order expressions use t and y only). */
  M: string;
  N: string;
  box: { xMin: number; xMax: number; yMin: number; yMax: number };
  note: Record<Locale, string>;
};

const sys = (id: string, name: Record<Locale, string>, f: string, g: string, box: Preset["box"], note: Record<Locale, string>): Preset => ({
  id, name, mode: "system", f, g, M: "", N: "", box, note,
});

export const PRESETS: Preset[] = [
  sys("harmonic", { zh: "简谐振子", en: "Harmonic oscillator" }, "y", "-x", { xMin: -3, xMax: 3, yMin: -3, yMax: 3 }, {
    zh: "原点是中心（线性化只能说到「中心或弱螺旋」），轨线是圆。",
    en: "The origin is a center (linearization can only say 'center or weak spiral'); orbits are circles.",
  }),
  sys("damped", { zh: "阻尼振子", en: "Damped oscillator" }, "y", "-x - 0.5*y", { xMin: -3, xMax: 3, yMin: -3, yMax: 3 }, {
    zh: "原点是稳定螺旋点，特征值 -1/4 ± i√15/4。",
    en: "The origin is a stable spiral, eigenvalues -1/4 ± i√15/4.",
  }),
  sys("lotka", { zh: "Lotka–Volterra", en: "Lotka–Volterra" }, "x - x*y", "x*y - y", { xMin: -0.5, xMax: 4, yMin: -0.5, yMax: 4 }, {
    zh: "(0,0) 鞍点，(1,1) 中心或弱螺旋；H = x - ln x + y - ln y 守恒。",
    en: "(0,0) is a saddle, (1,1) a center-or-weak-spiral; H = x - ln x + y - ln y is conserved.",
  }),
  sys("vdp", { zh: "Van der Pol", en: "Van der Pol" }, "y", "(1 - x^2)*y - x", { xMin: -4, xMax: 4, yMin: -4, yMax: 4 }, {
    zh: "原点是不稳定螺旋点，轨线趋向一个极限环。",
    en: "The origin is an unstable spiral; trajectories approach a limit cycle.",
  }),
  sys("saddle", { zh: "鞍点", en: "Saddle" }, "x", "-y", { xMin: -3, xMax: 3, yMin: -3, yMax: 3 }, {
    zh: "特征值 1 与 -1，坐标轴是稳定流形和不稳定流形。",
    en: "Eigenvalues 1 and -1; the axes are the stable and unstable manifolds.",
  }),
  sys("pendulum", { zh: "单摆", en: "Pendulum" }, "y", "-sin(x)", { xMin: -7, xMax: 7, yMin: -3, yMax: 3 }, {
    zh: "x = 2kπ 是中心或弱螺旋，x = (2k+1)π 是鞍点。",
    en: "x = 2kπ are centers-or-weak-spirals, x = (2k+1)π are saddles.",
  }),
  {
    id: "logistic", name: { zh: "Logistic（一阶）", en: "Logistic (first order)" }, mode: "explicit", f: "1", g: "y*(1 - y)", M: "", N: "",
    box: { xMin: 0, xMax: 6, yMin: -0.5, yMax: 2 },
    note: { zh: "dy/dt = y(1-y)：y = 0 不稳定，y = 1 稳定；可分离、自治、Bernoulli（n = 2）。", en: "dy/dt = y(1-y): y = 0 unstable, y = 1 stable; separable, autonomous, Bernoulli (n = 2)." },
  },
  {
    id: "circles", name: { zh: "圆族 t dt + y dy = 0", en: "Circles t dt + y dy = 0" }, mode: "differential", f: "", g: "", M: "t", N: "y",
    box: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 },
    note: { zh: "恰当方程，解是圆 t² + y² = C；在 y = 0 处有竖直切线，微分形式下不是奇点。", en: "Exact; solutions are circles t² + y² = C. Vertical tangents at y = 0 are not singularities in differential form." },
  },
  {
    id: "exact", name: { zh: "恰当方程 2ty dt + (t²+y²) dy = 0", en: "Exact 2ty dt + (t²+y²) dy = 0" }, mode: "differential", f: "", g: "", M: "2*t*y", N: "t^2 + y^2",
    box: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 },
    note: { zh: "∂M/∂y = 2t = ∂N/∂t，隐式解 t²y + y³/3 = C 画成紫色等值线。", en: "∂M/∂y = 2t = ∂N/∂t; the implicit solutions t²y + y³/3 = C are the violet level curves." },
  },
  {
    id: "riccati", name: { zh: "Riccati dy/dt = t² + y²", en: "Riccati dy/dt = t² + y²" }, mode: "explicit", f: "1", g: "t^2 + y^2", M: "", N: "",
    box: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 },
    note: { zh: "没有初等闭式解，所有类型探测都是否定的；斜率场和数值解照样有效。", en: "No elementary closed form; every form probe is negative, yet the slope field and numerical solutions are fully valid." },
  },
];
