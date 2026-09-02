/** One-click examples for the web shell. Boxes are chosen so the interesting features are visible. */

export type PresetMode = "system" | "first_order";

export type Preset = {
  name: string;
  mode: PresetMode;
  /** x' expression (ignored in first_order mode, where x' = 1). */
  f: string;
  /** y' expression, or the right-hand side g(x, y) of dy/dx = g in first_order mode. */
  g: string;
  box: { xMin: number; xMax: number; yMin: number; yMax: number };
  note: string;
};

export const PRESETS: Preset[] = [
  { name: "简谐振子", mode: "system", f: "y", g: "-x", box: { xMin: -3, xMax: 3, yMin: -3, yMax: 3 }, note: "原点是中心（线性化只能说到「中心或弱螺旋」），轨线是圆。" },
  { name: "阻尼振子", mode: "system", f: "y", g: "-x - 0.5*y", box: { xMin: -3, xMax: 3, yMin: -3, yMax: 3 }, note: "原点是稳定螺旋点，特征值 -1/4 ± i√15/4。" },
  { name: "Lotka–Volterra", mode: "system", f: "x - x*y", g: "x*y - y", box: { xMin: -0.5, xMax: 4, yMin: -0.5, yMax: 4 }, note: "(0,0) 鞍点，(1,1) 中心或弱螺旋；H = x - ln x + y - ln y 守恒。" },
  { name: "Van der Pol", mode: "system", f: "y", g: "(1 - x^2)*y - x", box: { xMin: -4, xMax: 4, yMin: -4, yMax: 4 }, note: "原点是不稳定螺旋点，轨线趋向一个极限环。" },
  { name: "鞍点", mode: "system", f: "x", g: "-y", box: { xMin: -3, xMax: 3, yMin: -3, yMax: 3 }, note: "特征值 1 与 -1，坐标轴是稳定流形和不稳定流形。" },
  { name: "单摆", mode: "system", f: "y", g: "-sin(x)", box: { xMin: -7, xMax: 7, yMin: -3, yMax: 3 }, note: "x = 2kπ 是中心或弱螺旋，x = (2k+1)π 是鞍点。" },
  { name: "Logistic（一阶）", mode: "first_order", f: "1", g: "y*(1 - y)", box: { xMin: 0, xMax: 6, yMin: -0.5, yMax: 2 }, note: "dy/dx = y(1-y)：y = 0 不稳定，y = 1 稳定。" },
];
