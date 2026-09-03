/**
 * All student- and user-facing text, in two languages, looked up by key. The kernel returns keys
 * (classification names, caveat keys, statuses); the presentation layer (MCP tool summaries, web
 * shell, widget) picks a locale and reads the table. Mathematical symbols, variable names and
 * expressions are never translated.
 *
 * lib/labels.test.ts asserts that both tables have exactly the same keys, so adding a string to one
 * language without the other fails the build.
 */
import type { CaveatKey, Classification } from "./core/classify";
import type { OdeForm } from "./core/detect-form";
import type { IntegrationStatus } from "./core/integrate";
import type { EquilibriumSolution } from "./core/slope-field";
import type { Complex, Locale } from "./core/types";

export type { Locale };
export const LOCALES: readonly Locale[] = ["zh", "en"];

export type LabelTable = {
  classification: Record<Classification, string>;
  stability: Record<EquilibriumSolution["stability"], string>;
  status: Record<IntegrationStatus, string>;
  warning: Record<"none_found" | "possible_continuum" | "multiple_non_hyperbolic" | "hit_limit", string>;
  caveat: Record<CaveatKey, string>;
  form: Record<OdeForm, string>;
  /** Tool summary fragments. `{name}` placeholders are filled by `fill`. */
  tool: Record<
    | "systemHeader" | "singularSamples" | "equilibriumLine" | "eigenvaluesUnavailable" | "note"
    | "trajectoryHeader" | "forward" | "backward" | "trajectoryLine" | "sampleFieldLine" | "widgetDraws"
    | "firstOrderHeader" | "differentialUndirected" | "directionSingular" | "truncated" | "constantSolution"
    | "noConstantAutonomous" | "noConstantGeneral" | "formsHeader" | "formLine" | "formBorderlineLine" | "formsCaveat"
    | "formsInconsistentLine" | "formsUntestableLine" | "exactImplicit" | "exactPathCheckFailed" | "listSeparator",
    string
  >;
  /** Web shell and widget interface strings. */
  ui: Record<
    | "title" | "subtitle" | "presets" | "type" | "typeSystem" | "typeExplicit" | "typeDifferential"
    | "fLabel" | "gLabel" | "gExplicitLabel" | "mLabel" | "nLabel" | "xMin" | "xMax" | "yMin" | "yMax"
    | "density" | "arrowLength" | "arrowUnit" | "arrowScaled" | "clearTrajectories" | "syntaxHint"
    | "fixErrorHint" | "singularNote" | "equilibriaHeading" | "constantSolutionsHeading" | "singularHeading"
    | "formsHeading" | "implicitHeading" | "lastTrajectory" | "toward" | "language" | "shownRange"
    | "interactionHint" | "hoverUndefined" | "connectedWaiting" | "computing" | "connected" | "notConnected"
    | "notRenderedByHost" | "localComputeUnavailable" | "rangeError" | "xRangeError" | "yRangeError" | "exprError"
    | "featuresBox" | "leftFarBox",
    string
  >;
};

export const LABELS: Record<Locale, LabelTable> = {
  zh: {
    classification: {
      stable_node: "稳定结点",
      unstable_node: "不稳定结点",
      saddle: "鞍点",
      stable_spiral: "稳定螺旋点（稳定焦点）",
      unstable_spiral: "不稳定螺旋点（不稳定焦点）",
      star_node: "星形结点",
      degenerate_node: "退化结点",
      center_or_weak_spiral: "中心或弱螺旋（线性化无法区分）",
      non_hyperbolic: "非双曲平衡点（线性化无法判定）",
    },
    stability: {
      stable: "稳定（两侧的解都趋向它）",
      unstable: "不稳定（两侧的解都离开它）",
      semi_stable: "半稳定（一侧趋向、一侧离开）",
      varies: "稳定性随 x 变化（在观察范围内两侧解的走向不一致）",
    },
    status: {
      completed: "积分到指定时间结束",
      left_box: "轨线离开了观察范围后停止",
      reached_equilibrium: "轨线趋近一个平衡点后停止（速度降到起始速度的 1e-8 以下）",
      blew_up: "解的位置在有限时间内发散（离开了有限范围），在最后一个有限点停止",
      singular: "在最后一个有限点停止：向量场在这里无定义或无穷大，无法继续积分",
      domain_edge: "到达向量场定义域的边界后停止（场在这一点有限，再往前就无定义）",
      arc_length: "画到指定长度后停止",
      max_steps: "在到达指定时间前停止（步数或步长耗尽），解仍然有界",
    },
    warning: {
      none_found: "在观察范围内没有找到平衡点。",
      possible_continuum: "警告：找到的平衡点几乎都是非双曲的，而且排成一条线或一条曲线，这很可能是一个连续的平衡点集合（例如整条坐标轴或一个圆），下面只列出其中一部分代表点。",
      multiple_non_hyperbolic: "注意：找到了多个非双曲平衡点，但它们并不排成一条线或曲线，看起来是彼此孤立的退化平衡点。线性化对其中每一个都无法判定稳定性，需要逐个做非线性分析。",
      hit_limit: "警告：平衡点数量超过了上限，下面只列出前几个。",
    },
    caveat: {
      center: "线性化给出一对纯虚特征值（实部在数值精度内为零）。仅凭线性化无法区分真正的中心与极缓慢的螺旋：两者的相图完全不同，判定需要守恒量（例如能量或 Hamilton 函数）或更高阶的非线性分析。",
      nonHyperbolic: "雅可比矩阵至少有一个特征值在数值精度内为零（行列式约等于零），这个平衡点是非双曲的。Hartman–Grobman 定理不适用，线性化不足以判定它的稳定性，需要中心流形或 Lyapunov 函数等非线性方法。",
      notFinite: "在这一点上雅可比矩阵无法求出有限值（向量场在附近奇异或未定义），因此无法给出任何分类。",
      repeatedRoot: "两个特征值在数值精度内无法区分（判别式落在容差带内而不是精确为零）。它们可能是真正的重根，此时「星形结点 / 退化结点」的名字才严格成立；也可能是极其接近的两个相异实根，此时实际上是一个普通的结点。请把这里的分类当作「重根或近重根」，而不是确定的类型。",
    },
    form: {
      separable: "可分离变量方程",
      autonomous: "自治方程",
      linear_in_y: "关于 y 的线性方程",
      homogeneous: "零次齐次方程",
      bernoulli: "Bernoulli 方程",
      exact: "恰当方程",
      integrating_factor_x: "有只依赖 x 的积分因子的方程",
      integrating_factor_y: "有只依赖 y 的积分因子的方程",
    },
    tool: {
      systemHeader: "系统 x' = {f}，y' = {g}，观察范围 x∈[{xMin}, {xMax}]，y∈[{yMin}, {yMax}]。",
      singularSamples: "向量场在 {count} 个采样点上无定义或无穷大。",
      equilibriumLine: "{index}. 平衡点 {point}：{classification}。 特征值 {eigenvalues}；迹 {trace}，行列式 {determinant}。",
      eigenvaluesUnavailable: "无法求出",
      note: " 注意：{caveat}",
      trajectoryHeader: "从 {start} 出发，系统 x' = {f}，y' = {g}。",
      forward: "正向（t 增大）",
      backward: "逆向（t 减小）",
      trajectoryLine: "{direction}：积到 t = {tEnd}，终点 {end}，{status}。共 {steps} 步。",
      sampleFieldLine: "在 {nx}×{ny} 网格上采样了向量场 ({f}, {g})。最大模长 {maxMag}，{singular} 个采样点无定义或无穷大。",
      widgetDraws: "图像已交给 widget 绘制。",
      firstOrderHeader: "方程 {equation}，观察范围 x∈[{xMin}, {xMax}]，y∈[{yMin}, {yMax}]。",
      differentialUndirected: "微分形式没有天然的正方向，方向场画成无向线段。",
      directionSingular: "方向场奇点（M = N = 0，此处方向无定义）：{points}{truncated}。",
      truncated: "（数量已截断）",
      constantSolution: "常数解 y = {y}：{stability}。",
      noConstantAutonomous: "方程是自治的，但在观察范围内没有常数解。",
      noConstantGeneral: "在观察范围内没有常数解（右端依赖 x；斜率场仍然有效）。",
      formsHeader: "方程类型（数值探测，只表示「与该形式一致」，不是证明）：",
      formLine: "- 在数值上表现得像{form}。{evidence}",
      formBorderlineLine: "- 临界情况：与{form}的偏差落在阈值附近，可能只是舍入误差，也可能真的不是该形式。{evidence}",
      formsCaveat: "注意：{caveat}",
      formsInconsistentLine: "未通过检验的形式（括号内为最大相对偏差）：{list}。",
      formsUntestableLine: "无法在此范围内检验的形式（有效采样点不足）：{list}。",
      exactImplicit: "方程恰当：已数值求出势函数 F(x, y)，图中紫色曲线是隐式解 F(x, y) = C（画了 {levels} 条等值线）。两条积分路径的相对偏差 {deviation}，这本身就是恰当性的独立验证。",
      exactPathCheckFailed: "恰当性判据通过，但势函数的数值积分没有通过路径无关性自检：两条积分路径的相对偏差为 {deviation}，超过了阈值 {tol}，因此不显示等值线。这本身有教学价值：数值方法有自己的失败模式（例如积分路径穿过奇点，或者方程只在局部恰当），而这个工具知道自己什么时候不可靠。",
      listSeparator: "、",
    },
    ui: {
      title: "向量场 / 相图",
      subtitle: "输入 x' = f(x, y)，y' = g(x, y)，或一阶方程 dy/dx = g(x, y) / M dx + N dy = 0。鼠标悬停预览经过该点的解曲线，点击固定它（正向蓝色、逆向橙色）；滚轮缩放，拖动平移，双击复位。",
      presets: "预设：",
      type: "类型",
      typeSystem: "二维系统 x' = f, y' = g",
      typeExplicit: "一阶方程 dy/dx = g(x, y)",
      typeDifferential: "一阶方程 M dx + N dy = 0",
      fLabel: "x' = f(x, y)",
      gLabel: "y' = g(x, y)",
      gExplicitLabel: "dy/dx = g(x, y)",
      mLabel: "M(x, y)",
      nLabel: "N(x, y)",
      xMin: "x 最小",
      xMax: "x 最大",
      yMin: "y 最小",
      yMax: "y 最大",
      density: "网格密度",
      arrowLength: "箭头长度",
      arrowUnit: "等长（颜色表示模长）",
      arrowScaled: "按模长缩放",
      clearTrajectories: "清除轨线（{count} 条）",
      syntaxHint: "语法：乘号要写出来（x*y，不是 xy），幂用 ^，函数 sin cos exp log sqrt abs 等，常数 pi、e。",
      fixErrorHint: "修正上面的错误后会重新绘图",
      singularNote: "向量场在 {count} 个采样点上无定义或无穷大（画成灰色小圆环）。",
      equilibriaHeading: "平衡点",
      constantSolutionsHeading: "常数解",
      singularHeading: "方向场奇点（M = N = 0）",
      formsHeading: "方程类型（数值探测，不是证明）",
      implicitHeading: "隐式解 F(x, y) = C（紫色曲线）",
      lastTrajectory: "最近一条轨线：",
      toward: "到 t = {t}，{status}",
      language: "语言",
      shownRange: "实际显示范围（等比缩放后）：x∈[{xMin}, {xMax}]，y∈[{yMin}, {yMax}]",
      interactionHint: "悬停预览解曲线 · 点击固定 · 滚轮缩放 · 拖动平移 · 双击复位",
      hoverUndefined: "此处靠近方向场奇点，方向无定义",
      connectedWaiting: "已连接，等待工具调用…",
      computing: "计算中…",
      connected: "connected to host",
      notConnected: "not connected to an MCP host",
      notRenderedByHost: "This page is meant to be rendered by Claude after calling one of the vector-field tools.",
      localComputeUnavailable: "本地重算不可用（表达式无法在此环境编译），显示服务器给出的静态图；缩放、平移和悬停已禁用。",
      rangeError: "范围必须是四个有限的数字。",
      xRangeError: "x 范围无效：左端 {min} 必须小于右端 {max}。",
      yRangeError: "y 范围无效：下端 {min} 必须小于上端 {max}。",
      exprError: "表达式「{expr}」有问题：{message}",
      featuresBox: "以下结果按当前可见范围 x∈[{xMin}, {xMax}]，y∈[{yMin}, {yMax}] 计算；缩放或平移后会重新计算，结论依赖于所考察的范围。",
      leftFarBox: "轨线跑到输入范围的 20 倍以外后停止",
    },
  },
  en: {
    classification: {
      stable_node: "stable node",
      unstable_node: "unstable node",
      saddle: "saddle",
      stable_spiral: "stable spiral (stable focus)",
      unstable_spiral: "unstable spiral (unstable focus)",
      star_node: "star node",
      degenerate_node: "degenerate node",
      center_or_weak_spiral: "center or weak spiral (linearization cannot tell)",
      non_hyperbolic: "non-hyperbolic equilibrium (linearization is inconclusive)",
    },
    stability: {
      stable: "stable (solutions approach it from both sides)",
      unstable: "unstable (solutions leave it on both sides)",
      semi_stable: "semi-stable (approached on one side, left on the other)",
      varies: "stability changes with x (the sign pattern differs across the viewing range)",
    },
    status: {
      completed: "integrated to the requested time",
      left_box: "stopped after leaving the viewing box",
      reached_equilibrium: "stopped after approaching an equilibrium (speed fell below 1e-8 of its initial value)",
      blew_up: "the position diverges in finite time (it left the finite range); stopped at the last finite point",
      singular: "stopped at the last finite point: the vector field is undefined or infinite there, so the integration cannot continue",
      domain_edge: "stopped at the edge of the region where the field is defined (finite here, undefined just beyond)",
      arc_length: "stopped after reaching the requested curve length",
      max_steps: "stopped before the requested time (step budget or step size exhausted); the solution stayed bounded",
    },
    warning: {
      none_found: "No equilibrium points were found in the viewing box.",
      possible_continuum: "Warning: almost all equilibria found are non-hyperbolic and lie on a line or a curve; this is most likely a continuum of equilibria (a whole axis, a circle). Only a few representative points are listed.",
      multiple_non_hyperbolic: "Note: several non-hyperbolic equilibria were found, but they do not lie on a line or a curve; they look like isolated degenerate equilibria. Linearization cannot decide the stability of any of them; each needs a nonlinear analysis.",
      hit_limit: "Warning: more equilibria than the limit; only the first few are listed.",
    },
    caveat: {
      center: "The linearization gives a purely imaginary pair of eigenvalues (real part zero to numerical precision). Linearization alone cannot distinguish a true center from an extremely slow spiral: their phase portraits are entirely different, and deciding requires a conserved quantity (such as an energy or Hamiltonian) or a higher-order nonlinear analysis.",
      nonHyperbolic: "At least one eigenvalue of the Jacobian is zero to numerical precision (determinant approximately zero), so this equilibrium is non-hyperbolic. The Hartman–Grobman theorem does not apply and linearization cannot decide its stability; a nonlinear method such as a center manifold or a Lyapunov function is needed.",
      notFinite: "The Jacobian cannot be evaluated to a finite value at this point (the vector field is singular or undefined nearby), so no classification can be given.",
      repeatedRoot: "The two eigenvalues cannot be told apart at working precision (the discriminant lies inside the tolerance band rather than being exactly zero). They may be a genuine repeated root, in which case the name star node / degenerate node is strictly correct, or two distinct real roots extremely close together, in which case this is really an ordinary node. Read this classification as 'repeated or nearly repeated root', not as a definite type.",
    },
    form: {
      separable: "a separable equation",
      autonomous: "an autonomous equation",
      linear_in_y: "an equation linear in y",
      homogeneous: "a homogeneous equation of degree zero",
      bernoulli: "a Bernoulli equation",
      exact: "an exact equation",
      integrating_factor_x: "an equation with an integrating factor depending on x only",
      integrating_factor_y: "an equation with an integrating factor depending on y only",
    },
    tool: {
      systemHeader: "System x' = {f}, y' = {g}; viewing box x ∈ [{xMin}, {xMax}], y ∈ [{yMin}, {yMax}].",
      singularSamples: "The vector field is undefined or infinite at {count} sample points.",
      equilibriumLine: "{index}. Equilibrium {point}: {classification}. Eigenvalues {eigenvalues}; trace {trace}, determinant {determinant}.",
      eigenvaluesUnavailable: "unavailable",
      note: " Note: {caveat}",
      trajectoryHeader: "Starting from {start}, system x' = {f}, y' = {g}.",
      forward: "Forward (t increasing)",
      backward: "Backward (t decreasing)",
      trajectoryLine: "{direction}: reached t = {tEnd}, end point {end}, {status}. {steps} steps.",
      sampleFieldLine: "Sampled the vector field ({f}, {g}) on a {nx}×{ny} grid. Largest magnitude {maxMag}; {singular} sample points undefined or infinite.",
      widgetDraws: "The picture is drawn by the widget.",
      firstOrderHeader: "Equation {equation}; viewing box x ∈ [{xMin}, {xMax}], y ∈ [{yMin}, {yMax}].",
      differentialUndirected: "The differential form has no natural direction, so the direction field is drawn as undirected segments.",
      directionSingular: "Singular points of the direction field (M = N = 0, direction undefined): {points}{truncated}.",
      truncated: " (list truncated)",
      constantSolution: "Constant solution y = {y}: {stability}.",
      noConstantAutonomous: "The equation is autonomous but has no constant solution in the viewing range.",
      noConstantGeneral: "No constant solution in the viewing range (the right-hand side depends on x; the slope field is still valid).",
      formsHeader: "Equation type (numerical probes; 'consistent with', never a proof):",
      formLine: "- Numerically behaves like {form}. {evidence}",
      formBorderlineLine: "- Borderline: the deviation from {form} lies near the threshold; this may be rounding, or the equation may not be of this form. {evidence}",
      formsCaveat: "Note: {caveat}",
      formsInconsistentLine: "Forms that failed the test (largest relative deviation in brackets): {list}.",
      formsUntestableLine: "Forms that could not be tested on this box (too few usable sample points): {list}.",
      exactImplicit: "The equation is exact: the potential F(x, y) was integrated numerically and the violet curves are the implicit solutions F(x, y) = C ({levels} level curves). The two integration paths differ by a relative {deviation}, which is itself an independent check of exactness.",
      exactPathCheckFailed: "The exactness criterion passed, but the numerical integration of the potential failed its path-independence self-check: the two integration paths differ by a relative {deviation}, above the threshold {tol}, so no level curves are shown. This is worth teaching: numerical methods have failure modes of their own (an integration path through a singular point, or an equation that is only locally exact), and this tool knows when it cannot be trusted.",
      listSeparator: ", ",
    },
    ui: {
      title: "Vector field / phase portrait",
      subtitle: "Enter x' = f(x, y), y' = g(x, y), or a first-order equation dy/dx = g(x, y) / M dx + N dy = 0. Hover to preview the solution curve through a point and click to keep it (blue forward, orange backward); wheel to zoom, drag to pan, double-click to reset.",
      presets: "Presets:",
      type: "Type",
      typeSystem: "Planar system x' = f, y' = g",
      typeExplicit: "First-order equation dy/dx = g(x, y)",
      typeDifferential: "First-order equation M dx + N dy = 0",
      fLabel: "x' = f(x, y)",
      gLabel: "y' = g(x, y)",
      gExplicitLabel: "dy/dx = g(x, y)",
      mLabel: "M(x, y)",
      nLabel: "N(x, y)",
      xMin: "x min",
      xMax: "x max",
      yMin: "y min",
      yMax: "y max",
      density: "Grid density",
      arrowLength: "Arrow length",
      arrowUnit: "Uniform (color encodes magnitude)",
      arrowScaled: "Scaled by magnitude",
      clearTrajectories: "Clear trajectories ({count})",
      syntaxHint: "Syntax: write multiplication explicitly (x*y, not xy), powers with ^, functions sin cos exp log sqrt abs …, constants pi and e.",
      fixErrorHint: "Fix the error above to redraw",
      singularNote: "The vector field is undefined or infinite at {count} sample points (drawn as gray rings).",
      equilibriaHeading: "Equilibria",
      constantSolutionsHeading: "Constant solutions",
      singularHeading: "Singular points of the direction field (M = N = 0)",
      formsHeading: "Equation type (numerical probes, not proofs)",
      implicitHeading: "Implicit solutions F(x, y) = C (violet curves)",
      lastTrajectory: "Last trajectory:",
      toward: "to t = {t}, {status}",
      language: "Language",
      shownRange: "Displayed range (equal scale): x ∈ [{xMin}, {xMax}], y ∈ [{yMin}, {yMax}]",
      interactionHint: "Hover to preview a solution · click to keep it · wheel to zoom · drag to pan · double-click to reset",
      hoverUndefined: "Near a singular point of the direction field: direction undefined",
      connectedWaiting: "Connected, waiting for a tool call…",
      computing: "Computing…",
      connected: "connected to host",
      notConnected: "not connected to an MCP host",
      notRenderedByHost: "This page is meant to be rendered by Claude after calling one of the vector-field tools.",
      localComputeUnavailable: "Local recomputation is unavailable (the expression could not be compiled here); showing the server's static picture. Zoom, pan and hover are disabled.",
      rangeError: "The range must be four finite numbers.",
      xRangeError: "Invalid x range: the left end {min} must be smaller than the right end {max}.",
      yRangeError: "Invalid y range: the lower end {min} must be smaller than the upper end {max}.",
      exprError: "Problem in the expression “{expr}”: {message}",
      featuresBox: "The results below are computed for the visible range x ∈ [{xMin}, {xMax}], y ∈ [{yMin}, {yMax}]; they are recomputed after zooming or panning, because conclusions depend on the range examined.",
      leftFarBox: "stopped after running 20 times beyond the entered range",
    },
  },
};

export function labels(locale: Locale): LabelTable {
  return LABELS[locale] ?? LABELS.en;
}

/** Fills `{name}` placeholders. Missing names are left as-is so mistakes stay visible. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in values ? String(values[key]) : m));
}

/** Picks a locale from a BCP 47 tag (navigator.language): Chinese -> zh, everything else -> en. */
export function localeFromLanguageTag(tag: string | undefined | null): Locale {
  return typeof tag === "string" && /^zh\b/i.test(tag) ? "zh" : "en";
}

export function formatNumber(v: number, digits = 4): string {
  if (!Number.isFinite(v)) return String(v);
  const s = v.toFixed(digits).replace(/\.?0+$/, "");
  return s === "" || s === "-0" || s === "-" ? "0" : s;
}

export function formatEigenvalue(e: Complex, digits = 5): string {
  if (Math.abs(e.im) < 1e-15) return formatNumber(e.re, digits);
  return `${formatNumber(e.re, digits)} ${e.im >= 0 ? "+" : "-"} ${formatNumber(Math.abs(e.im), digits)}i`;
}

export function formatPoint(p: { x: number; y: number }, digits = 4): string {
  return `(${formatNumber(p.x, digits)}, ${formatNumber(p.y, digits)})`;
}
