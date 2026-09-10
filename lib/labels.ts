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
import { hasFractionalPower, PROBES_NOTED, type FirstOrderSpec } from "./core/slope-field";
import type { UniquenessVerdict } from "./core/uniqueness";

export type { Locale };
export const LOCALES: readonly Locale[] = ["zh", "en"];

export type LabelTable = {
  classification: Record<Classification, string>;
  /**
   * Full sentences per stability value; the domain-edge ones take `{side}` (the side where the
   * equation is defined, from `side`), and a domain-edge line whose sign pattern changes with t
   * uses `edge_varies` instead of `varies` (which speaks of two sides). Fill through stabilitySentence.
   */
  stability: Record<EquilibriumSolution["stability"] | "edge_varies", string>;
  /** Short tags for the constant-solution line label drawn on the canvas. */
  stabilityShort: Record<EquilibriumSolution["stability"], string>;
  /** The side of a horizontal line, as a word for the `{side}` placeholder. */
  side: Record<NonNullable<EquilibriumSolution["domainEdge"]>, string>;
  status: Record<IntegrationStatus, string>;
  warning: Record<"none_found" | "possible_continuum" | "multiple_non_hyperbolic" | "hit_limit" | "region_of_equilibria", string>;
  caveat: Record<CaveatKey, string>;
  form: Record<OdeForm, string>;
  /**
   * Uniqueness of solutions at a constant solution ({y}, {alpha}) or an equilibrium ({point},
   * {alpha}). There is deliberately NO sentence for a bounded result: the probe cannot prove the
   * Lipschitz condition, so nothing is claimed; the structured result still carries the verdict.
   */
  uniqueness: Record<"unbounded" | "borderline" | "unboundedPoint" | "borderlinePoint", string>;
  /** Tool summary fragments. `{name}` placeholders are filled by `fill`. */
  tool: Record<
    | "systemHeader" | "singularSamples" | "singularPoint" | "equilibriumLine" | "eigenvaluesUnavailable" | "note"
    | "trajectoryHeader" | "forward" | "backward" | "trajectoryLine" | "sampleFieldLine" | "widgetDraws"
    | "firstOrderHeader" | "differentialUndirected" | "directionSingular" | "truncated" | "constantSolution"
    | "noConstantAutonomous" | "noConstantGeneral" | "noConstantUntestable" | "formsHeader" | "formLine" | "formBorderlineLine" | "formsCaveat"
    | "formsInconsistentLine" | "formsUntestableLine" | "exactImplicit" | "exactPathCheckFailed" | "listSeparator"
    | "parenOpen" | "parenClose"
    | "nonUniqueTrajectory"
    | "timeDependent" | "timeDependentTrajectory" | "secondOrderReduced"
    | "timeDependenceMeasured" | "timeDependenceNoChange" | "timeDependenceDomainMoves" | "timeDependenceUntested"
    | "underflowPlateau"
    | "constantSolutionProbes" | "constantSolutionPlateau" | "zeroPlateau" | "scanResolution" | "fractionalPowerHint" | "noConstantAllZero"
    | "formsExcludedLine" | "tracedBoth" | "tracedForward" | "tracedBackward"
    | "identicallyZero"
    | "queryHeaderFirst" | "queryHeaderSystem" | "queryTargetT" | "queryTargetX" | "queryTargetY"
    | "queryHitFirst" | "queryHitSystem" | "queryAccuracy" | "queryNotReached" | "queryStoppedBefore"
    | "queryMoreBeyond" | "queryTargetIsStart" | "queryLeg" | "stoppedNonAutonomous" | "refineCapped",
    string
  >;
  /** Web shell and widget interface strings. */
  ui: Record<
    | "title" | "tagline" | "help" | "details" | "presets" | "type" | "typeSystem" | "typeExplicit" | "typeDifferential"
    | "fLabel" | "gLabel" | "gExplicitLabel" | "mLabel" | "nLabel" | "xMin" | "xMax" | "yMin" | "yMax"
    | "density" | "arrowLength" | "arrowUnit" | "arrowScaled" | "clearTrajectories" | "syntaxHint"
    | "fixErrorHint" | "singularNote" | "equilibriaHeading" | "constantSolutionsHeading" | "singularHeading"
    | "formsHeading" | "implicitHeading" | "lastTrajectory" | "toward" | "language"
    | "interactionHint" | "hoverUndefined" | "connectedWaiting" | "computing" | "connected" | "notConnected"
    | "notRenderedByHost" | "localComputeUnavailable" | "rangeError" | "xRangeError" | "yRangeError" | "exprError"
    | "featuresBox" | "featuresBoxDetail" | "leftFarBox"
    | "tMin" | "tMax" | "syntaxHintFirstOrder" | "xInFirstOrder" | "lhsInExpression"
    | "equalScale" | "equalScaleDetail" | "equalScaleWarning" | "shownRangeEqual" | "shownRangeFilled"
    | "lhsInExpressionSystem" | "towardT" | "trajectorySides"
    | "equilibriaTruncated" | "singularitiesTruncated"
    | "nonUniqueTrajectory"
    | "timeDependentNote" | "timeDependentShort" | "snapshotT"
    | "typeSecond" | "secondOrderLabel" | "secondOrderReduced" | "syntaxHintSecondOrder"
    | "singularitiesContinuum"
    | "secondOrderNotAffine" | "secondOrderZeroCoefficient" | "secondOrderNoEquation" | "secondOrderDoubleEquals"
    | "secondOrderTooManyEquals" | "secondOrderOtherPrime" | "secondOrderHigherDerivative" | "secondOrderPlaceholderTyped"
    | "secondOrderUndefinedAtSamples" | "secondOrderUnknownSymbol"
    | "copyLink" | "copied" | "copyLinkFallback" | "urlProblems"
    | "urlReasonQueryTooLong" | "urlReasonTooLong" | "urlReasonInvalidExpression" | "urlReasonNotANumber"
    | "urlReasonNotInteger" | "urlReasonOutOfRange" | "urlReasonInvertedRange" | "urlReasonTooNarrow"
    | "urlReasonBadChoice" | "urlReasonTooMany" | "urlReasonMalformedPair" | "urlReasonUnusedInMode"
    | "openFullPage" | "equationSystem" | "equationExplicit" | "equationDifferential" | "equationSecond"
    | "presetCustom"
    | "secondOrderImplicitProduct"
    | "downloadPng" | "downloadFailed" | "exportRange" | "exportSnapshot" | "interactionHintTouch"
    | "exportEntered" | "exportShown",
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
      varies: "稳定性随 t 变化（在观察范围内两侧解的走向不一致）",
      edge_approach: "定义域边界上的常数解：方程只在这条线的{side}有定义，该侧的解趋向它",
      edge_leave: "定义域边界上的常数解：方程只在这条线的{side}有定义，该侧的解离开它",
      edge_varies: "定义域边界上的常数解：方程只在这条线的{side}有定义，该侧的解是趋向还是离开它随 t 变化（在观察范围内两种情况都出现）",
    },
    stabilityShort: {
      stable: "稳定",
      unstable: "不稳定",
      semi_stable: "半稳定",
      varies: "随 t 变化",
      edge_approach: "定义域边界，趋向",
      edge_leave: "定义域边界，离开",
    },
    side: {
      above: "上方",
      below: "下方",
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
      region_of_equilibria: "注意：向量场在观察范围内的一整片区域上恒为零：这片区域中的每一个点都是平衡点。下面列出的只是其中一些代表点，线性化对它们都无法判定稳定性。",
    },
    caveat: {
      center: "线性化给出一对纯虚特征值（实部在数值精度内为零）。仅凭线性化无法区分真正的中心与极缓慢的螺旋：两者的相图完全不同，判定需要守恒量（例如能量或 Hamilton 函数）或更高阶的非线性分析。",
      nonHyperbolic: "雅可比矩阵至少有一个特征值在数值精度内为零（行列式约等于零），这个平衡点是非双曲的。Hartman–Grobman 定理不适用，线性化不足以判定它的稳定性，需要中心流形或 Lyapunov 函数等非线性方法。",
      notFinite: "在这一点上雅可比矩阵无法求出有限值（向量场在附近奇异或未定义），因此无法给出任何分类。",
      repeatedRoot: "两个特征值在数值精度内重合：判别式在雅可比矩阵各元素的估计误差之内为零。它们是真正的重根（星形结点：每个方向都是特征方向；或退化结点），还是极其接近的两个相异实根（此时实际上是一个普通的结点），数值上无法判定。请把这里的分类当作「重根或近重根」，而不是确定的类型。",
      domainEdge: "这个平衡点位于向量场定义域的边缘：向量场在它的一侧有定义，在另一侧没有定义（例如 x' = sqrt(x) 在 x = 0 处）。这里不存在线性化（导数只有单侧的），所以无法给出任何分类；请用定义域内一侧的解的走向来讨论它。",
    },
    form: {
      separable: "可分离变量方程",
      autonomous: "自治方程",
      linear_in_y: "关于 y 的线性方程",
      homogeneous: "零次齐次方程",
      bernoulli: "Bernoulli 方程",
      exact: "恰当方程",
      integrating_factor_x: "有只依赖 t 的积分因子 μ(t) 的方程",
      integrating_factor_y: "有只依赖 y 的积分因子 μ(y) 的方程",
    },
    uniqueness: {
      unbounded: "在 y = {y} 处 ∂g/∂y 无界（差商随靠近该点按 δ^−{alpha} 增长），Lipschitz 条件不成立，解的唯一性不能保证——经过这一点可能有不止一条解曲线。",
      borderline: "在 y = {y} 处差商的增长指数约为 {alpha}，落在阈值附近：这一点的唯一性不能担保（可能只是数值噪声，也可能 Lipschitz 条件确实不成立）。",
      unboundedPoint: "在平衡点 {point} 处向量场的导数无界（差商随靠近该点按 δ^−{alpha} 增长），Lipschitz 条件不成立，解的唯一性不能保证——经过这一点可能有不止一条轨线。",
      borderlinePoint: "在平衡点 {point} 处差商的增长指数约为 {alpha}，落在阈值附近：这一点的唯一性不能担保（可能只是数值噪声，也可能 Lipschitz 条件确实不成立）。",
    },
    tool: {
      systemHeader: "系统 x' = {f}，y' = {g}，观察范围 x∈[{xMin}, {xMax}]，y∈[{yMin}, {yMax}]。",
      singularSamples: "向量场在 {count} 个采样点上无定义或无穷大。",
      singularPoint: "向量场在 {point} 处无定义或不连续（从不同方向趋近时极限不同），这一点不是平衡点。",
      equilibriumLine: "{index}. 平衡点 {point}：{classification}。 特征值 {eigenvalues}；迹 {trace}，行列式 {determinant}。",
      eigenvaluesUnavailable: "无法求出",
      note: " 注意：{caveat}",
      trajectoryHeader: "从 {start} 出发，系统 x' = {f}，y' = {g}。",
      forward: "正向（t 增大）",
      backward: "逆向（t 减小）",
      trajectoryLine: "{direction}：积到 t = {tEnd}，终点 {end}，{status}。共 {steps} 步。",
      sampleFieldLine: "在 {nx}×{ny} 网格上采样了向量场 ({f}, {g})。最大模长 {maxMag}，{singular} 个采样点无定义或无穷大。",
      widgetDraws: "图像已交给 widget 绘制。",
      firstOrderHeader: "方程 {equation}，观察范围 t∈[{xMin}, {xMax}]，y∈[{yMin}, {yMax}]。",
      differentialUndirected: "微分形式没有天然的正方向，方向场画成无向线段。",
      directionSingular: "方向场奇点（M = N = 0，此处方向无定义）：{points}{truncated}。",
      truncated: "（数量已截断）",
      constantSolution: "常数解 y = {y}：{stability}。",
      noConstantAutonomous: "方程是自治的（右端不含 t），但在观察范围内没有常数解。",
      noConstantGeneral: "在观察范围内没有常数解（右端含有 t，方程不是自治的；斜率场仍然有效）。",
      noConstantUntestable: "在观察范围内没有常数解；方程是否自治无法检验（右端在这个范围的绝大部分上没有定义）。",
      formsHeader: "方程类型（数值探测，只表示「与该形式一致」，不是证明）：",
      formLine: "- 在数值上表现得像{form}。{evidence}",
      formBorderlineLine: "- 临界情况：与{form}的偏差落在阈值附近，可能只是舍入误差，也可能真的不是该形式。{evidence}",
      formsCaveat: "注意：{caveat}",
      formsInconsistentLine: "未通过检验的形式（括号内为最大相对偏差）：{list}。",
      formsUntestableLine: "无法在此范围内检验的形式（有效采样点不足）：{list}。",
      exactImplicit: "方程恰当：已数值求出势函数 F(t, y)，图中紫色曲线是隐式解 F(t, y) = C（画了 {levels} 条等值线）。两条积分路径的相对偏差 {deviation}，这本身就是恰当性的独立验证。",
      exactPathCheckFailed: "恰当性判据通过，但势函数的数值积分没有通过路径无关性自检：两条积分路径的相对偏差为 {deviation}，超过了阈值 {tol}，因此不显示等值线。这本身有教学价值：数值方法有自己的失败模式（例如积分路径穿过奇点，或者方程只在局部恰当），而这个工具知道自己什么时候不可靠。",
      listSeparator: "、",
      parenOpen: "（",
      parenClose: "）",
      nonUniqueTrajectory: "这条数值解经过了一个唯一性不成立的点：它只是经过该点的无穷多条解中的一条。积分器沿着其中一条走下去（通常是常数解），无法显示其他的解。",
      timeDependent: "这是非自治系统：右端出现了 t，向量场随 t 变化。{evidence}采样场是 t = {t} 时刻的快照。平衡点与线性化稳定性分析是针对自治系统的工具，对随时间变化的向量场本工具不做这项分析，因此没有给出。要看另一个时刻的场，请用参数 t 指定快照时刻。",
      timeDependentTrajectory: "这是非自治系统：右端出现了 t，向量场随 t 变化。{evidence}{traced}从同一点在另一个时刻出发会得到不同的曲线。",
      secondOrderReduced: "二阶方程 {equation}：令 y = x'，降阶为系统 x' = y，y' = {g}。",
      timeDependenceMeasured: "在观察范围内取若干时刻采样，向量场的最大相对变化为 {deviation}。",
      timeDependenceNoChange: "在观察范围内取若干时刻采样时没有测到变化（含 t 的项可能在这些时刻恰好为零或相互抵消），但 t 确实出现在方程中，因此仍按非自治系统处理。",
      timeDependenceDomainMoves: "向量场在部分采样时刻有定义、在其他时刻无定义：它的定义域随 t 变化。",
      timeDependenceUntested: "向量场在所有采样时刻都无法计算，因此无法测量它随 t 的变化幅度。",
      underflowPlateau: "注意：在观察范围的一部分区域里，方程右端的值小于计算机能表示的最小数，计算结果恰好为 0；这些点并不是平衡点，因此没有列出。",
      constantSolutionProbes: "这条线只在 {n} 个 t 值上得到检验（共尝试 {total} 个）：方程只在这些 t 处有定义。",
      constantSolutionPlateau: "在 |y − {y}| < {w} 上，右端低于最小可表示的数、计算结果恰为 0；这个常数解取该区间的中心，右端从两侧连续地趋于它。",
      zeroPlateau: "在这个范围的一部分上，右端的计算结果恰为 0（那里它恒为 0，或低于最小可表示的数）；那里不声称任何常数解。",
      scanResolution: "扫描分辨率为 Δy = {dy}；间距小于它的常数解可能被合并或漏掉。",
      fractionalPowerHint: "提示：这里负数的分数次幂没有定义，例如 y^(2/3) 在 y < 0 时；要取实数分支，请写 abs(y)^(2/3) 或 sign(y)*abs(y)^p。",
      noConstantAllZero: "在观察范围内没有找到常数解：右端在每个采样点的计算结果都恰为 0（那里它恒为 0，或低于最小可表示的数）或无定义，因此常数解和方程是否自治都无法检验。",
      formsExcludedLine: "按定义排除的形式（括号内为原因）：{list}。",
      tracedBoth: "轨线从 t = 0 出发：正向部分是 t > 0 时的解，逆向部分是 t < 0 时的解。",
      tracedForward: "轨线从 t = 0 出发并正向积分，因此它是 t > 0 时的解。",
      tracedBackward: "轨线从 t = 0 出发并逆向积分，因此它是 t < 0 时的解。",
      identicallyZero: "右端恒等于 0：每一条水平线 y = c 都是常数解，方向场是平的。",
      queryHeaderFirst: "方程 {equation} 经过 (t, y) = ({t0}, {y0}) 的解，求 {target}。",
      queryHeaderSystem: "系统 x' = {f}，y' = {g} 经过 {start}（t = {t0}）的解，求 {target}。",
      queryTargetT: "t = {value}",
      queryTargetX: "x = {value}",
      queryTargetY: "y = {value}",
      queryHitFirst: "t = {t}（±{tError}），y = {y}（±{error}）",
      queryHitSystem: "t = {t}（±{tError}）：(x, y) = ({x}, {y})（±{error}）",
      queryAccuracy: "以上是数值解的取值与穿越点：精度来自积分器的容差（rtol 1e-6），括号里的 ± 是估计值而不是严格上界；越过目标的位置是沿数值解重新积分求出的，不是在折线上线性插值。",
      queryNotReached: "在积分的时间范围内没有到达目标：两个方向的数值解都没有穿过它。下面列出每个方向积到了哪里、为什么停下。",
      queryStoppedBefore: "无法把解一直跟到目标时刻：积分在此之前就停止了（见下面的停止原因）。如果停止原因是「积分到指定时间结束」，说明时间范围先用完了，请加大 tSpan。",
      queryMoreBeyond: "同一方向出现了三次或更多穿越，看起来是周期性的：在积分范围之外可能还有更多穿越点。",
      queryTargetIsStart: "目标就是出发点本身。",
      queryLeg: "{direction}：积到 t = {tEnd}，终点 {end}，{status}。",
      stoppedNonAutonomous: "在该时刻速度降到接近零（低于起始速度的 1e-8）后停止；这是非自治系统，这里不是平衡点：向量场在这一点会随 t 变化",
      refineCapped: "变号搜索达到了单元数上限：有些 f 和 g 同时变号的单元没有搜索，可能漏掉平衡点。",
    },
    ui: {
      title: "向量场 / 相图",
      tagline: "斜率场、相图、平衡点。",
      help: "使用说明",
      details: "详情",
      presets: "预设：",
      type: "类型",
      typeSystem: "二维系统 x' = f, y' = g",
      typeExplicit: "一阶方程 dy/dt = g(t, y)",
      typeDifferential: "一阶方程 M dt + N dy = 0",
      fLabel: "x' = f(x, y)",
      gLabel: "y' = g(x, y)",
      gExplicitLabel: "dy/dt = g(t, y)",
      mLabel: "M(t, y)",
      nLabel: "N(t, y)",
      xMin: "x 最小",
      xMax: "x 最大",
      yMin: "y 最小",
      yMax: "y 最大",
      density: "网格密度",
      arrowLength: "箭头",
      arrowUnit: "等长",
      arrowScaled: "按模长",
      clearTrajectories: "清除轨线（{count} 条）",
      syntaxHint: "语法：乘号要写出来（x*y，不是 xy），幂用 ^，函数 sin cos exp log sqrt abs 等，常数 pi、e。",
      fixErrorHint: "修正上面的错误后会重新绘图",
      singularNote: "向量场在 {count} 个采样点上无定义或无穷大（画成灰色小圆环）。",
      equilibriaHeading: "平衡点",
      constantSolutionsHeading: "常数解",
      singularHeading: "方向场奇点（M = N = 0）",
      formsHeading: "方程类型（数值探测，不是证明）",
      implicitHeading: "隐式解 F(t, y) = C（紫色曲线）",
      lastTrajectory: "最近一条轨线：",
      toward: "到 t = {t}，{status}",
      language: "语言",
      interactionHint: "悬停预览解曲线 · 点击固定 · 滚轮缩放 · 拖动平移 · 双击复位",
      hoverUndefined: "此处靠近方向场奇点，方向无定义",
      connectedWaiting: "已连接，等待工具调用…",
      computing: "计算中…",
      connected: "connected to host",
      notConnected: "not connected to an MCP host",
      notRenderedByHost: "This page is meant to be rendered by Claude after calling one of the vector-field tools.",
      localComputeUnavailable: "本地重算不可用（表达式无法在此环境编译），显示服务器给出的静态图；缩放、平移和悬停已禁用。",
      rangeError: "范围必须是四个有限的数字。",
      xRangeError: "{hv} 范围无效：左端 {min} 必须小于右端 {max}。",
      yRangeError: "y 范围无效：下端 {min} 必须小于上端 {max}。",
      exprError: "表达式「{expr}」有问题：{message}",
      featuresBox: "以下结果按 {hv} ∈ [{xMin}, {xMax}]，y ∈ [{yMin}, {yMax}] 计算",
      featuresBoxDetail: "复位时这是输入范围，缩放或平移后是可见范围。平衡点、常数解和方程类型都只在这个范围内扫描；结论依赖于所考察的范围。",
      leftFarBox: "轨线跑到输入范围的 20 倍以外后停止",
      tMin: "t 最小",
      tMax: "t 最大",
      syntaxHintFirstOrder: "语法：变量只有 t（自变量）和 y，写 x 会被拒绝；只输入方程右端，不要写「dy/dt =」。乘号要写出来（t*y，不是 ty），幂用 ^，函数 sin cos exp log sqrt abs 等，常数 pi、e。",
      xInFirstOrder: "一阶方程的自变量是 t（dy/dt = g(t, y)），请把 x 写成 t。",
      lhsInExpression: "只需输入方程的右端，「dy/dt =」这一部分是默认的。",
      equalScale: "等比",
      equalScaleDetail: "{hv} 与 y 每单位像素相同，斜率可以从图上读出；范围会向一个方向扩大以填满画布。取消勾选后输入范围填满画布，两个方向的比例不同，图上的角度不再是真实斜率。",
      equalScaleWarning: "横纵比例不同，图上的角度不代表真实斜率。",
      shownRangeEqual: "{hv} ∈ [{xMin}, {xMax}]，y ∈ [{yMin}, {yMax}]（等比）",
      shownRangeFilled: "{hv} ∈ [{xMin}, {xMax}]，y ∈ [{yMin}, {yMax}]（填满）",
      lhsInExpressionSystem: "只需输入方程的右端，「x' =」「y' =」这一部分是默认的。",
      towardT: "到 t = {t}，{status}",
      trajectorySides: "一侧：{first}；另一侧：{second}",
      equilibriaTruncated: "平衡点数量超过上限 {max}，只列出前 {max} 个（按 x 坐标排序）；是否构成连续平衡点集是根据全部找到的点判断的，不只是列出的这些。",
      singularitiesTruncated: "方向场奇点数量超过上限 {max}，只列出前 {max} 个（按 t 坐标排序）；是否构成连续奇点集是根据全部找到的点判断的，不只是列出的这些。",
      nonUniqueTrajectory: "这条数值解经过了一个唯一性不成立的点：它只是经过该点的无穷多条解中的一条。积分器沿着其中一条走下去（通常是常数解），无法显示其他的解。",
      timeDependentNote: "这是非自治系统：右端出现了 t，向量场随 t 变化，图上显示的是 t = {t} 时刻的快照。平衡点与线性化稳定性分析是针对自治系统的工具，对随时间变化的向量场这里不做这项分析。悬停和点击得到的解曲线从 t = {t} 出发。",
      timeDependentShort: "非自治系统：t = {t} 时刻的快照，不做平衡点分析",
      snapshotT: "快照时刻 t",
      typeSecond: "二阶方程 x'' = F(x, x')",
      secondOrderLabel: "x'' = F(x, x')，或写成完整方程，例如 x'' + 0.5*x' + x = 0",
      secondOrderReduced: "令 y = x'，降阶为系统 x' = y，y' = {g}。横轴是 x（位置），纵轴是 y = x'（速度）。",
      syntaxHintSecondOrder: "语法：未知函数是 x，t 是时间；导数用直引号写成 x' 和 x''（例如 x'' + 0.5*x' + x = 0，或只写 x'' = F 的右端 F）。x'' 必须线性出现；这一点以及 x'' 的系数不为零，是在观察范围和一个固定方块内的若干采样点、若干时刻上数值检验的，只在采样点之外才出现的项（例如只在范围外生效的分段 x''^2 项）检查不到。乘号要写出来（x*x'，不是 xx'），幂用 ^，函数 sin cos exp log sqrt abs 等，常数 pi、e。",
      singularitiesContinuum: "找到的方向场奇点排成一条线或一条曲线：方向很可能在整条曲线上都无定义，而不只是在孤立的点上；列表只给出其中的代表点。",
      secondOrderNotAffine: "x'' 必须线性出现，例如 x'' + 0.5*x' + x = 0 或 x'' = -sin(x)；x''^2、sin(x'') 之类无法降阶。",
      secondOrderZeroCoefficient: "x'' 的系数为零（至少在部分采样点和时刻上），方程无法解出 x''。请检查 x'' 是否真的出现，以及它的系数是否恒不为零。",
      secondOrderNoEquation: "请写成带 = 的方程（x'' + x = 0），或只写 x'' = F 的右端 F。",
      secondOrderDoubleEquals: "方程两边之间只用一个「=」（== 是比较运算）。",
      secondOrderTooManyEquals: "方程必须恰好包含一个「=」。",
      secondOrderOtherPrime: "只有未知函数 x 可以带撇号：x' 表示 dx/dt，x'' 表示二阶导数。未知函数是 x，t 是时间。",
      secondOrderHigherDerivative: "只支持一阶和二阶导数 x' 与 x''；x''' 及更高阶导数无法降阶为平面系统。",
      secondOrderPlaceholderTyped: "xd 和 xdd 是内部名称；请用 x' 和 x'' 表示 x 的导数。",
      secondOrderUndefinedAtSamples: "方程在大多数用于检验的采样点上无定义（不是有限数），无法安全地降阶。",
      secondOrderUnknownSymbol: "未知符号「{name}」。未知函数是 x，它的导数是 x'（dx/dt），二阶导数是 x''；t 是时间。允许的符号：x、x'、x''、t、pi、e。",
      copyLink: "复制链接",
      copied: "已复制",
      copyLinkFallback: "无法访问剪贴板，请手动复制下面的链接：",
      urlProblems: "链接里的这些参数无效，已忽略并使用默认值：{list}。",
      urlReasonQueryTooLong: "链接过长，全部参数已忽略",
      urlReasonTooLong: "表达式超过 200 个字符",
      urlReasonInvalidExpression: "表达式无法解析",
      urlReasonNotANumber: "不是数字",
      urlReasonNotInteger: "不是整数",
      urlReasonOutOfRange: "超出允许范围",
      urlReasonInvertedRange: "范围下限不小于上限",
      urlReasonTooNarrow: "范围太窄",
      urlReasonBadChoice: "不是允许的取值",
      urlReasonTooMany: "轨线起点超过 20 个，只保留前 20 个",
      urlReasonMalformedPair: "有格式错误的轨线起点，已跳过",
      urlReasonUnusedInMode: "当前方程类型不使用这个参数",
      openFullPage: "在新窗口打开",
      equationSystem: "x' = {f}，y' = {g}",
      equationExplicit: "dy/dt = {g}",
      equationDifferential: "({M}) dt + ({N}) dy = 0",
      equationSecond: "{equation}",
      presetCustom: "自定义",
      secondOrderImplicitProduct: "「{name}」缺少乘号；乘号要写出来，例如 x*x'' 或 t*x''。",
      downloadPng: "下载 PNG",
      downloadFailed: "生成图片失败，请重试。",
      exportRange: "{hv} ∈ [{xMin}, {xMax}]，y ∈ [{yMin}, {yMax}]",
      exportSnapshot: "t = {t}",
      exportEntered: "输入范围 {range}",
      exportShown: "显示范围 {range}",
      interactionHintTouch: "轻点预览解曲线 · 长按固定 · 双指缩放 · 拖动平移 · 双击复位",
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
      varies: "stability varies with t (the sign pattern differs across the viewing range)",
      edge_approach: "a constant solution on the edge of the domain: the equation is defined only {side} this line, and the solutions on that side approach it",
      edge_leave: "a constant solution on the edge of the domain: the equation is defined only {side} this line, and the solutions on that side leave it",
      edge_varies: "a constant solution on the edge of the domain: the equation is defined only {side} this line, and whether the solutions on that side approach or leave it changes with t (both happen across the viewing range)",
    },
    stabilityShort: {
      stable: "stable",
      unstable: "unstable",
      semi_stable: "semi-stable",
      varies: "varies with t",
      edge_approach: "domain edge, approached",
      edge_leave: "domain edge, left",
    },
    side: {
      above: "above",
      below: "below",
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
      region_of_equilibria: "Note: the vector field vanishes on a whole region of the viewing box: every point of that region is an equilibrium. The points listed below are only representative samples of it, and linearization cannot decide the stability of any of them.",
    },
    caveat: {
      center: "The linearization gives a purely imaginary pair of eigenvalues (real part zero to numerical precision). Linearization alone cannot distinguish a true center from an extremely slow spiral: their phase portraits are entirely different, and deciding requires a conserved quantity (such as an energy or Hamiltonian) or a higher-order nonlinear analysis.",
      nonHyperbolic: "At least one eigenvalue of the Jacobian is zero to numerical precision (determinant approximately zero), so this equilibrium is non-hyperbolic. The Hartman–Grobman theorem does not apply and linearization cannot decide its stability; a nonlinear method such as a center manifold or a Lyapunov function is needed.",
      notFinite: "The Jacobian cannot be evaluated to a finite value at this point (the vector field is singular or undefined nearby), so no classification can be given.",
      repeatedRoot: "The two eigenvalues coincide to numerical precision: the discriminant is zero within the estimated error of the Jacobian entries. Whether this is an exact repeated root (a star node, where every direction is an eigendirection, or a degenerate node) or two distinct real roots extremely close together (in which case this is really an ordinary node) cannot be decided numerically. Read this classification as 'repeated or nearly repeated root', not as a definite type.",
      domainEdge: "This equilibrium lies on the edge of the region where the vector field is defined: the field is defined on one side of it and undefined on the other (for example x' = sqrt(x) at x = 0). No linearization exists there (only a one-sided derivative does), so no classification can be given; discuss it through the behavior of the solutions on the side where the field is defined.",
    },
    form: {
      separable: "a separable equation",
      autonomous: "an autonomous equation",
      linear_in_y: "an equation linear in y",
      homogeneous: "a homogeneous equation of degree zero",
      bernoulli: "a Bernoulli equation",
      exact: "an exact equation",
      integrating_factor_x: "an equation with an integrating factor μ(t) depending on t only",
      integrating_factor_y: "an equation with an integrating factor μ(y) depending on y only",
    },
    uniqueness: {
      unbounded: "At y = {y} the derivative ∂g/∂y is unbounded (the difference quotients grow like δ^−{alpha} as the point is approached), so the Lipschitz condition fails and uniqueness of solutions is not guaranteed: more than one solution curve may pass through this point.",
      borderline: "At y = {y} the growth exponent of the difference quotients is about {alpha}, near the threshold: uniqueness cannot be vouched for at this point (this may be numerical noise, or the Lipschitz condition may genuinely fail).",
      unboundedPoint: "At the equilibrium {point} the derivative of the vector field is unbounded (the difference quotients grow like δ^−{alpha} as the point is approached), so the Lipschitz condition fails and uniqueness of solutions is not guaranteed: more than one trajectory may pass through this point.",
      borderlinePoint: "At the equilibrium {point} the growth exponent of the difference quotients is about {alpha}, near the threshold: uniqueness cannot be vouched for at this point (this may be numerical noise, or the Lipschitz condition may genuinely fail).",
    },
    tool: {
      systemHeader: "System x' = {f}, y' = {g}; viewing box x ∈ [{xMin}, {xMax}], y ∈ [{yMin}, {yMax}].",
      singularSamples: "The vector field is undefined or infinite at {count} sample points.",
      singularPoint: "The vector field is undefined or discontinuous at {point} (its limit depends on the direction of approach); this point is not an equilibrium.",
      equilibriumLine: "{index}. Equilibrium {point}: {classification}. Eigenvalues {eigenvalues}; trace {trace}, determinant {determinant}.",
      eigenvaluesUnavailable: "unavailable",
      note: " Note: {caveat}",
      trajectoryHeader: "Starting from {start}, system x' = {f}, y' = {g}.",
      forward: "Forward (t increasing)",
      backward: "Backward (t decreasing)",
      trajectoryLine: "{direction}: reached t = {tEnd}, end point {end}, {status}. {steps} steps.",
      sampleFieldLine: "Sampled the vector field ({f}, {g}) on a {nx}×{ny} grid. Largest magnitude {maxMag}; {singular} sample points undefined or infinite.",
      widgetDraws: "The picture is drawn by the widget.",
      firstOrderHeader: "Equation {equation}; viewing box t ∈ [{xMin}, {xMax}], y ∈ [{yMin}, {yMax}].",
      differentialUndirected: "The differential form has no natural direction, so the direction field is drawn as undirected segments.",
      directionSingular: "Singular points of the direction field (M = N = 0, direction undefined): {points}{truncated}.",
      truncated: " (list truncated)",
      constantSolution: "Constant solution y = {y}: {stability}.",
      noConstantAutonomous: "The equation is autonomous (the right-hand side does not mention t) but has no constant solution in the viewing range.",
      noConstantGeneral: "No constant solution in the viewing range (the right-hand side mentions t, so the equation is not autonomous; the slope field is still valid).",
      noConstantUntestable: "No constant solution in the viewing range; whether the equation is autonomous could not be tested (the right-hand side is undefined on most of the range).",
      formsHeader: "Equation type (numerical probes; 'consistent with', never a proof):",
      formLine: "- Numerically behaves like {form}. {evidence}",
      formBorderlineLine: "- Borderline: the deviation from {form} lies near the threshold; this may be rounding, or the equation may not be of this form. {evidence}",
      formsCaveat: "Note: {caveat}",
      formsInconsistentLine: "Forms that failed the test (largest relative deviation in brackets): {list}.",
      formsUntestableLine: "Forms that could not be tested on this box (too few usable sample points): {list}.",
      exactImplicit: "The equation is exact: the potential F(t, y) was integrated numerically and the violet curves are the implicit solutions F(t, y) = C ({levels} level curves). The two integration paths differ by a relative {deviation}, which is itself an independent check of exactness.",
      exactPathCheckFailed: "The exactness criterion passed, but the numerical integration of the potential failed its path-independence self-check: the two integration paths differ by a relative {deviation}, above the threshold {tol}, so no level curves are shown. This is worth teaching: numerical methods have failure modes of their own (an integration path through a singular point, or an equation that is only locally exact), and this tool knows when it cannot be trusted.",
      listSeparator: ", ",
      parenOpen: " (",
      parenClose: ")",
      nonUniqueTrajectory: "This numerical solution passes through a point where uniqueness fails: it is only one of infinitely many solutions through that point. The integrator follows one of them (typically the constant one) and cannot show the others.",
      timeDependent: "This is a non-autonomous system: t appears in the right-hand side, so the vector field changes with t. {evidence} The sampled field is a snapshot at t = {t}. Equilibrium points and linearized stability analysis are tools for autonomous systems; this tool does not attempt them for a time-dependent field, so none are given. To see the field at another time, pass the snapshot time in the parameter t.",
      timeDependentTrajectory: "This is a non-autonomous system: t appears in the right-hand side, so the vector field changes with t. {evidence} {traced} Starting from the same point at another time would give a different curve.",
      secondOrderReduced: "Second-order equation {equation}: with y = x' it becomes the system x' = y, y' = {g}.",
      timeDependenceMeasured: "Sampled at several times inside the viewing box, its largest relative change is {deviation}.",
      timeDependenceNoChange: "At the several times sampled inside the viewing box no change was measured (the t term may vanish or cancel there), but t is present, so the system is treated as non-autonomous all the same.",
      timeDependenceDomainMoves: "The field is defined at some of the sampled times and undefined at others: its domain moves with t.",
      timeDependenceUntested: "The field could not be evaluated at any of the sampled times, so how much it changes with t could not be measured.",
      underflowPlateau: "Note: in part of this viewing box the right-hand side is below the smallest number the computer can represent and evaluates to exactly 0; those points are not equilibria and are not listed.",
      constantSolutionProbes: "This line could be checked at only {n} of the {total} t values tried: the equation is defined at those t only.",
      constantSolutionPlateau: "For |y − {y}| < {w} the right-hand side is below the smallest representable number and evaluates to exactly 0; this constant solution is reported at the center of that interval, which the right-hand side approaches continuously from both sides.",
      zeroPlateau: "On part of this range the right-hand side evaluates to exactly 0 (it is identically 0 there, or below the smallest representable number); no constant solution is claimed there.",
      scanResolution: "The scan resolution was Δy = {dy}; constant solutions closer together than that may have been merged or missed.",
      fractionalPowerHint: "Hint: a fractional power of a negative number is undefined here, e.g. y^(2/3) for y < 0; write abs(y)^(2/3) or sign(y)*abs(y)^p for the real branch.",
      noConstantAllZero: "No constant solution was found in the viewing range: at every sample the right-hand side evaluates to exactly 0 (it is identically 0 there, or below the smallest representable number) or is undefined, so neither constant solutions nor autonomy could be tested.",
      formsExcludedLine: "Forms ruled out by definition (reason in brackets): {list}.",
      tracedBoth: "Here the trajectory starts at t = 0: the forward part is the solution for t > 0 and the backward part the solution for t < 0.",
      tracedForward: "Here the trajectory starts at t = 0 and runs forward, so it is the solution for t > 0.",
      tracedBackward: "Here the trajectory starts at t = 0 and runs backward, so it is the solution for t < 0.",
      identicallyZero: "The right-hand side is identically zero: every horizontal line y = c is a constant solution, and the direction field is flat.",
      queryHeaderFirst: "Solution of {equation} through (t, y) = ({t0}, {y0}), asked for {target}.",
      queryHeaderSystem: "Solution of the system x' = {f}, y' = {g} through {start} (at t = {t0}), asked for {target}.",
      queryTargetT: "t = {value}",
      queryTargetX: "x = {value}",
      queryTargetY: "y = {value}",
      queryHitFirst: "t = {t} (±{tError}), y = {y} (±{error})",
      queryHitSystem: "t = {t} (±{tError}): (x, y) = ({x}, {y}) (±{error})",
      queryAccuracy: "These are values and crossings of the NUMERICAL solution: their accuracy comes from the integrator tolerance (rtol 1e-6), and the ± figures are estimates, not bounds; each crossing was found by re-integrating along the numerical solution, never by interpolating linearly between its points.",
      queryNotReached: "The target was not reached within the integrated span: neither direction of the numerical solution crossed it. Where each direction got to, and why it stopped, is listed below.",
      queryStoppedBefore: "The solution could not be followed to the target time: the integration stopped before it (see the stop below). If the stop says the integration completed, the span ran out first: ask for a larger tSpan.",
      queryMoreBeyond: "Three or more crossings in one direction look periodic: more crossings may exist beyond the integrated span.",
      queryTargetIsStart: "The target is the start point itself.",
      queryLeg: "{direction}: reached t = {tEnd}, end point {end}, {status}.",
      stoppedNonAutonomous: "stopped after the speed fell close to zero at that time (below 1e-8 of its initial value); for a non-autonomous system this is not an equilibrium: the field at that point changes with t",
      refineCapped: "The sign-change search hit its cell cap: some cells where both f and g change sign were not searched, so equilibria may be missing.",
    },
    ui: {
      title: "Vector field / phase portrait",
      tagline: "Slope fields, phase portraits, equilibria.",
      help: "Help",
      details: "Details",
      presets: "Presets:",
      type: "Type",
      typeSystem: "Planar system x' = f, y' = g",
      typeExplicit: "First-order equation dy/dt = g(t, y)",
      typeDifferential: "First-order equation M dt + N dy = 0",
      fLabel: "x' = f(x, y)",
      gLabel: "y' = g(x, y)",
      gExplicitLabel: "dy/dt = g(t, y)",
      mLabel: "M(t, y)",
      nLabel: "N(t, y)",
      xMin: "x min",
      xMax: "x max",
      yMin: "y min",
      yMax: "y max",
      density: "Grid density",
      arrowLength: "Arrows",
      arrowUnit: "Uniform",
      arrowScaled: "Scaled",
      clearTrajectories: "Clear trajectories ({count})",
      syntaxHint: "Syntax: write multiplication explicitly (x*y, not xy), powers with ^, functions sin cos exp log sqrt abs …, constants pi and e.",
      fixErrorHint: "Fix the error above to redraw",
      singularNote: "The vector field is undefined or infinite at {count} sample points (drawn as gray rings).",
      equilibriaHeading: "Equilibria",
      constantSolutionsHeading: "Constant solutions",
      singularHeading: "Singular points of the direction field (M = N = 0)",
      formsHeading: "Equation type (numerical probes, not proofs)",
      implicitHeading: "Implicit solutions F(t, y) = C (violet curves)",
      lastTrajectory: "Last trajectory:",
      toward: "to t = {t}, {status}",
      language: "Language",
      interactionHint: "Hover to preview a solution · click to keep it · wheel to zoom · drag to pan · double-click to reset",
      hoverUndefined: "Near a singular point of the direction field: direction undefined",
      connectedWaiting: "Connected, waiting for a tool call…",
      computing: "Computing…",
      connected: "connected to host",
      notConnected: "not connected to an MCP host",
      notRenderedByHost: "This page is meant to be rendered by Claude after calling one of the vector-field tools.",
      localComputeUnavailable: "Local recomputation is unavailable (the expression could not be compiled here); showing the server's static picture. Zoom, pan and hover are disabled.",
      rangeError: "The range must be four finite numbers.",
      xRangeError: "Invalid {hv} range: the left end {min} must be smaller than the right end {max}.",
      yRangeError: "Invalid y range: the lower end {min} must be smaller than the upper end {max}.",
      exprError: "Problem in the expression “{expr}”: {message}",
      featuresBox: "Results for {hv} ∈ [{xMin}, {xMax}], y ∈ [{yMin}, {yMax}]",
      featuresBoxDetail: "This is the entered range at the home view and the visible range after zooming or panning. Equilibria, constant solutions and equation types are scanned inside this range only; conclusions depend on the range examined.",
      leftFarBox: "stopped after running 20 times beyond the entered range",
      tMin: "t min",
      tMax: "t max",
      syntaxHintFirstOrder: "Syntax: the only variables are t (independent) and y; x is rejected. Enter only the right-hand side, not “dy/dt =”. Write multiplication explicitly (t*y, not ty), powers with ^, functions sin cos exp log sqrt abs …, constants pi and e.",
      xInFirstOrder: "In a first-order equation the independent variable is t (dy/dt = g(t, y)); write t instead of x.",
      lhsInExpression: "Enter only the right-hand side of the equation; the “dy/dt =” part is implied.",
      equalScale: "Equal scale",
      equalScaleDetail: "The same pixels per unit for {hv} and y, so slopes can be read from the picture; the range is widened in one direction to fill the canvas. Unchecked, the entered range fills the canvas, the two directions are scaled differently, and angles in the picture are no longer true slopes.",
      equalScaleWarning: "Axes are not to the same scale: angles in the picture do not represent true slopes.",
      shownRangeEqual: "{hv} ∈ [{xMin}, {xMax}], y ∈ [{yMin}, {yMax}] (equal scale)",
      shownRangeFilled: "{hv} ∈ [{xMin}, {xMax}], y ∈ [{yMin}, {yMax}] (filled)",
      lhsInExpressionSystem: "Enter only the right-hand side of each equation; the “x' =” / “y' =” part is implied.",
      towardT: "to t = {t}, {status}",
      trajectorySides: "one side: {first}; other side: {second}",
      equilibriaTruncated: "More than {max} equilibria were found; only the first {max} are listed (sorted by x). Whether they form a continuum was judged from all the points found, not only from the listed ones.",
      singularitiesTruncated: "More than {max} singular points of the direction field were found; only the first {max} are listed (sorted by t). Whether they form a continuum was judged from all the points found, not only from the listed ones.",
      nonUniqueTrajectory: "This numerical solution passes through a point where uniqueness fails: it is only one of infinitely many solutions through that point. The integrator follows one of them (typically the constant one) and cannot show the others.",
      timeDependentNote: "This is a non-autonomous system: t appears in the right-hand side, so the vector field changes with t, and the picture shows the snapshot at t = {t}. Equilibrium points and linearized stability analysis are tools for autonomous systems; they are not attempted for a time-dependent field. The solution curves you get by hovering and clicking start at t = {t}.",
      timeDependentShort: "Non-autonomous: snapshot at t = {t}, no equilibrium analysis",
      snapshotT: "Snapshot time t",
      typeSecond: "Second-order equation x'' = F(x, x')",
      secondOrderLabel: "x'' = F(x, x'), or a full equation such as x'' + 0.5*x' + x = 0",
      secondOrderReduced: "With y = x' this becomes the system x' = y, y' = {g}. The horizontal axis is x (position), the vertical axis is y = x' (velocity).",
      syntaxHintSecondOrder: "Syntax: the unknown is x and t is the time; write the derivatives as x' and x'' with straight apostrophes (x'' + 0.5*x' + x = 0, or just the right-hand side F of x'' = F). x'' must appear linearly; this, and that its coefficient never vanishes, is checked numerically at sample points spread over the viewing box and a fixed square, at several times, so a term that is only active away from every sample point (a piecewise x''^2 branch outside the box) cannot be detected. Write multiplication explicitly (x*x', not xx'), powers with ^, functions sin cos exp log sqrt abs …, constants pi and e.",
      singularitiesContinuum: "The singular points found line up along a line or a curve: the direction is most likely undefined on a whole curve, not just at isolated points; the list shows representative points only.",
      secondOrderNotAffine: "x'' must appear linearly, e.g. x'' + 0.5*x' + x = 0 or x'' = -sin(x); x''^2, sin(x'') and the like cannot be reduced.",
      secondOrderZeroCoefficient: "The coefficient of x'' vanishes (at least at some of the sample points and times), so the equation cannot be solved for x''. Check that x'' really appears and that its coefficient is never zero.",
      secondOrderNoEquation: "Write an equation with = (x'' + x = 0) or just the right-hand side F of x'' = F.",
      secondOrderDoubleEquals: "Use a single “=” between the two sides of the equation (== is a comparison).",
      secondOrderTooManyEquals: "The equation must contain exactly one “=”.",
      secondOrderOtherPrime: "Only the unknown x may carry primes: write x' for dx/dt and x'' for the second derivative. The unknown function is x and t is the time.",
      secondOrderHigherDerivative: "Only the first and second derivatives x' and x'' are supported; x''' and higher cannot be reduced to a planar system.",
      secondOrderPlaceholderTyped: "xd and xdd are internal names; write x' and x'' for the derivatives of x.",
      secondOrderUndefinedAtSamples: "The equation is undefined (not a finite number) at most of the sample points used to check it, so it cannot be reduced safely.",
      secondOrderUnknownSymbol: "Unknown symbol “{name}”. The unknown function is x, its derivative is x' (dx/dt) and its second derivative is x''; t is the time. Allowed symbols: x, x', x'', t, pi, e.",
      copyLink: "Copy link",
      copied: "Copied",
      copyLinkFallback: "The clipboard is not available; copy the link below by hand:",
      urlProblems: "These link parameters were invalid and have been ignored (defaults used): {list}.",
      urlReasonQueryTooLong: "link too long, all parameters ignored",
      urlReasonTooLong: "expression over 200 characters",
      urlReasonInvalidExpression: "expression could not be parsed",
      urlReasonNotANumber: "not a number",
      urlReasonNotInteger: "not an integer",
      urlReasonOutOfRange: "outside the allowed range",
      urlReasonInvertedRange: "range minimum is not below its maximum",
      urlReasonTooNarrow: "range too narrow",
      urlReasonBadChoice: "not an allowed value",
      urlReasonTooMany: "more than 20 trajectory starts; only the first 20 kept",
      urlReasonMalformedPair: "malformed trajectory start skipped",
      urlReasonUnusedInMode: "not used by this equation type",
      openFullPage: "Open full page",
      equationSystem: "x' = {f}, y' = {g}",
      equationExplicit: "dy/dt = {g}",
      equationDifferential: "({M}) dt + ({N}) dy = 0",
      equationSecond: "{equation}",
      presetCustom: "Custom",
      secondOrderImplicitProduct: "“{name}” is missing a multiplication sign; write the multiplication explicitly, e.g. x*x'' or t*x''.",
      downloadPng: "Download PNG",
      downloadFailed: "The picture could not be generated; please try again.",
      exportRange: "{hv} ∈ [{xMin}, {xMax}], y ∈ [{yMin}, {yMax}]",
      exportSnapshot: "t = {t}",
      exportEntered: "entered {range}",
      exportShown: "shown {range}",
      interactionHintTouch: "Tap to preview a solution · hold to keep it · pinch to zoom · drag to pan · double-tap to reset",
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

/**
 * The uniqueness sentence for a constant solution (`{ y }`) or an equilibrium (`{ point }`), or
 * null when there is nothing to say: only the "unbounded" and "borderline" verdicts speak. A
 * bounded result is a measurement at the tested scales, not a proof of the Lipschitz condition,
 * so it stays silent (the structured result still carries it). Shared by the tool summaries and
 * both shells so the wording exists once.
 */
export function uniquenessSentence(
  L: LabelTable,
  u: { verdict: UniquenessVerdict; exponent: number } | undefined,
  subject: { y: number } | { point: { x: number; y: number } },
): string | null {
  if (!u || (u.verdict !== "unbounded" && u.verdict !== "borderline")) return null;
  const alpha = formatNumber(u.exponent, 2);
  if ("y" in subject) return fill(u.verdict === "unbounded" ? L.uniqueness.unbounded : L.uniqueness.borderline, { y: formatNumber(subject.y, 6), alpha });
  return fill(u.verdict === "unbounded" ? L.uniqueness.unboundedPoint : L.uniqueness.borderlinePoint, { point: formatPoint(subject.point), alpha });
}

/**
 * The stability sentence of a constant solution: a domain-edge line names the side where the
 * equation is defined, and one whose sign pattern changes with t gets `edge_varies` (the plain
 * `varies` sentence speaks of both sides, which a one-sided line does not have). With the
 * equation given, a domain-edge sentence carries the fractional-power hint only when the
 * expression text has a fractional power (y^(2/3), y^0.5): a logarithm or sqrt(1 - y²) ends the
 * domain for another reason and gets no hint. Shared by the tool summary and both shells.
 */
export function stabilitySentence(L: LabelTable, s: Pick<EquilibriumSolution, "stability" | "domainEdge">, spec?: FirstOrderSpec): string {
  const key = s.domainEdge && s.stability === "varies" ? "edge_varies" : s.stability;
  const sentence = fill(L.stability[key], { side: s.domainEdge ? L.side[s.domainEdge] : "" });
  return s.domainEdge && spec && hasFractionalPower(spec) ? `${sentence}${L.tool.parenOpen}${L.tool.fractionalPowerHint}${L.tool.parenClose}` : sentence;
}

/** A number to 2 significant digits, for a resolution or a half-width (0.0063, 1300, 1.6e-12). */
export function formatShort(v: number): string {
  return Number.isFinite(v) ? String(Number(v.toPrecision(2))) : String(v);
}

/**
 * The lines of one constant solution, in order: the sentence itself; the plateau note when the
 * right-hand side underflows on an interval around the line; the probe count when the line could
 * be checked at fewer than PROBES_NOTED of the t values tried (it is defined on part of the t
 * range); the uniqueness sentence when it speaks. Shared by the tool summary and both shells.
 */
export function constantSolutionLines(L: LabelTable, s: EquilibriumSolution, spec?: FirstOrderSpec): string[] {
  const lines = [fill(L.tool.constantSolution, { y: formatNumber(s.y, 6), stability: stabilitySentence(L, s, spec) })];
  if (s.plateauHalfWidth !== undefined) lines.push(fill(L.tool.constantSolutionPlateau, { y: formatNumber(s.y, 6), w: formatShort(s.plateauHalfWidth) }));
  if (s.probes && s.probes.usable < PROBES_NOTED) lines.push(fill(L.tool.constantSolutionProbes, { n: s.probes.usable, total: s.probes.total }));
  const uniqueness = uniquenessSentence(L, s.uniqueness, { y: s.y });
  if (uniqueness) lines.push(uniqueness);
  return lines;
}

/**
 * The lines that follow the constant-solution list: the plateau notice when the right-hand side
 * evaluates to exactly 0 on part of the range with no solution claimed there, and the scan
 * resolution (always: a fact about the scan, not a warning). Shared by the tool summary and both
 * shells.
 */
export function constantSolutionNotices(L: LabelTable, fo: { zeroPlateaus?: readonly unknown[]; resolution?: number }): string[] {
  const lines: string[] = [];
  if (fo.zeroPlateaus?.length) lines.push(L.tool.zeroPlateau);
  if (fo.resolution !== undefined) lines.push(fill(L.tool.scanResolution, { dy: formatShort(fo.resolution) }));
  return lines;
}

/**
 * The sentence for a first-order scene without constant solutions. An identically zero right-hand
 * side (`identicallyZero`: every sample exactly 0 with no underflow, lib/core/slope-field.ts) has
 * every line y = c as a constant solution and gets its own sentence. Otherwise the autonomy
 * verdict is the static rule (t occurs in the right-hand side or not); "untestable" is kept for
 * older scenes only and must never be read as either of the other two. Shared by the tool
 * summary and both shells.
 */
export function noConstantSentence(L: LabelTable, autonomous: boolean | "untestable", reason?: "undefined" | "all_zero", identicallyZero?: boolean): string {
  if (identicallyZero) return L.tool.identicallyZero;
  if (autonomous === true) return L.tool.noConstantAutonomous;
  if (autonomous === false) return L.tool.noConstantGeneral;
  return reason === "all_zero" ? L.tool.noConstantAllZero : L.tool.noConstantUntestable;
}

/**
 * The evidence sentence of the time-dependence probe (lib/core/time-dependence): the verdict is
 * static (t appears), the probe only measured how much the field changed. Four cases: a measured
 * change, no change at the sampled times, a domain that moves with t (Infinity), or nothing could
 * be evaluated (0 samples). Shared by the tool summaries so the wording exists once.
 */
export function timeDependenceEvidence(L: LabelTable, td: { maxRelDeviation: number; samples: number }): string {
  if (td.samples === 0) return L.tool.timeDependenceUntested;
  if (!Number.isFinite(td.maxRelDeviation)) return L.tool.timeDependenceDomainMoves;
  if (td.maxRelDeviation === 0) return L.tool.timeDependenceNoChange;
  return fill(L.tool.timeDependenceMeasured, { deviation: td.maxRelDeviation.toExponential(1) });
}

/**
 * The notice lines above an equilibria list: the search's warning, then the truncation sentence,
 * then one line per singular point of the field (a candidate the vanishing test dropped because
 * the field is undefined or discontinuous there). "hit_limit" only says that the cap was hit,
 * which the truncation sentence says with the count, so it is not printed twice. Shared by the
 * tool summary and both shells.
 */
export function equilibriaNotices(
  L: LabelTable,
  scene: { warning?: keyof LabelTable["warning"]; truncated?: boolean; equilibria?: readonly unknown[]; singularPoints?: readonly { x: number; y: number }[]; underflowPlateau?: boolean; refineCapped?: boolean },
): string[] {
  const lines: string[] = [];
  if (scene.warning && !(scene.warning === "hit_limit" && scene.truncated)) lines.push(L.warning[scene.warning]);
  if (scene.truncated) lines.push(fill(L.ui.equilibriaTruncated, { max: scene.equilibria?.length ?? 0 }));
  // The sign-change quadtree's cap (round N): said unless the result is a continuum, where the
  // cap is expected (every sub-cell along the curve shows both sign changes) and the continuum
  // sentence already says that only representatives are listed.
  if (scene.refineCapped && scene.warning !== "possible_continuum" && scene.warning !== "region_of_equilibria") lines.push(L.tool.refineCapped);
  for (const s of scene.singularPoints ?? []) lines.push(fill(L.tool.singularPoint, { point: formatPoint(s) }));
  // Part of the box evaluates to exactly 0 by underflow (lib/core/equilibria underflowPlateau): said once, after the points.
  if (scene.underflowPlateau) lines.push(L.tool.underflowPlateau);
  return lines;
}

/** Picks a locale from a BCP 47 tag (navigator.language): Chinese -> zh, everything else -> en. */
export function localeFromLanguageTag(tag: string | undefined | null): Locale {
  return typeof tag === "string" && /^zh\b/i.test(tag) ? "zh" : "en";
}

/**
 * Numbers for students, by significant digits, never collapsed to "0" by the units or the zoom:
 * a value with |v| < 1e-3 or |v| >= 1e6, or one whose fixed form would show no nonzero digit,
 * prints in exponential form with `digits` significant digits (1e-5, -2.5e-7, 1e+30); everything
 * else prints with `digits` decimals and trailing zeros stripped (2.5, 0.0045). Only an exact 0
 * prints as "0" (a root found at 3e-17 is shown as 3e-17: what was measured, not what was hoped).
 */
export function formatNumber(v: number, digits = 4): string {
  if (!Number.isFinite(v)) return String(v);
  if (v === 0) return "0";
  const magnitude = Math.abs(v);
  const fixed = magnitude < 1e-3 || magnitude >= 1e6 ? null : v.toFixed(digits);
  if (fixed === null || /^-?0(\.0*)?$/.test(fixed)) {
    return v.toExponential(Math.max(0, digits - 1)).replace(/\.?0+e/, "e");
  }
  return fixed.replace(/\.?0+$/, "");
}

/** A pair is printed as complex whenever the imaginary part is not negligible RELATIVE to the real part (never an absolute floor). */
export function formatEigenvalue(e: Complex, digits = 5): string {
  if (Math.abs(e.im) <= 1e-15 * Math.abs(e.re)) return formatNumber(e.re, digits);
  return `${formatNumber(e.re, digits)} ${e.im >= 0 ? "+" : "-"} ${formatNumber(Math.abs(e.im), digits)}i`;
}

export function formatPoint(p: { x: number; y: number }, digits = 4): string {
  return `(${formatNumber(p.x, digits)}, ${formatNumber(p.y, digits)})`;
}

/**
 * The eigenvalue list of one equilibrium, compact: a conjugate pair (same real part, opposite
 * non-negligible imaginary parts, as lib/core/classify produces them from one formula) prints as
 * "±0.968i" (real part exactly 0) or "-0.25 ± 0.968i"; anything else is the plain list. Display
 * only: the Scene keeps both numbers. An empty list gives "" (the caller says "unavailable").
 */
export function formatEigenvalues(eigenvalues: readonly Complex[], digits = 4): string {
  if (eigenvalues.length === 2) {
    const [a, b] = eigenvalues;
    const complex = Math.abs(a.im) > 1e-15 * Math.abs(a.re);
    const sameRe = a.re === b.re || Math.abs(a.re - b.re) <= 1e-12 * Math.max(Math.abs(a.re), Math.abs(b.re));
    const conjugate = Math.abs(a.im + b.im) <= 1e-12 * Math.abs(a.im);
    if (complex && sameRe && conjugate) {
      const im = `${formatNumber(Math.abs(a.im), digits)}i`;
      return a.re === 0 ? `±${im}` : `${formatNumber(a.re, digits)} ± ${im}`;
    }
  }
  return eigenvalues.map((e) => formatEigenvalue(e, digits)).join(", ");
}

/** A short line with the full text behind a disclosure; `detail` empty means nothing is folded. */
export type Folded = { short: string; detail: string[] };

/**
 * One equilibrium as the shells show it: the short line is the point's classification (already
 * honest on its own: "center or weak spiral (linearization cannot tell)"); the detail is the
 * caveat sentence and the uniqueness sentence when they speak. Display only.
 */
export function equilibriumDetail(L: LabelTable, p: { at: { x: number; y: number }; caveat?: CaveatKey | null; uniqueness?: { verdict: UniquenessVerdict; exponent: number } }): string[] {
  const lines: string[] = [];
  if (p.caveat) lines.push(L.caveat[p.caveat]);
  const u = uniquenessSentence(L, p.uniqueness, { point: p.at });
  if (u) lines.push(u);
  return lines;
}

/**
 * One constant solution folded: the short line is "Constant solution y = 1: stable" with the
 * canvas tag (`stabilityShort`, a domain-edge line says so), the detail is every full line of
 * `constantSolutionLines` (the stability sentence with the side and the fractional-power hint,
 * the plateau and probe notes, the uniqueness sentence).
 */
export function constantSolutionFolded(L: LabelTable, s: EquilibriumSolution, spec?: FirstOrderSpec): Folded {
  return {
    short: fill(L.tool.constantSolution, { y: formatNumber(s.y, 6), stability: L.stabilityShort[s.stability] }),
    detail: constantSolutionLines(L, s, spec),
  };
}

/** The non-autonomous notice folded: the snapshot time on the line, the full sentence behind it. */
export function timeDependentFolded(L: LabelTable, snapshotT: number): Folded {
  const t = formatNumber(snapshotT, 4);
  return { short: fill(L.ui.timeDependentShort, { t }), detail: [fill(L.ui.timeDependentNote, { t })] };
}

/**
 * A detected form folded: the verdict sentence on the line ("Numerically behaves like a separable
 * equation." / the borderline sentence, both hedged on their own), the measured evidence and the
 * caveat behind it. The tool summary prints all of it on one line (app/mcp/tools.ts, untouched).
 */
export function formFolded(L: LabelTable, f: { form: OdeForm; verdict: "consistent" | "borderline"; evidence: string; caveat: string }): Folded {
  const template = f.verdict === "consistent" ? L.tool.formLine : L.tool.formBorderlineLine;
  return {
    short: fill(template, { form: L.form[f.form], evidence: "" }).replace(/^- /, "").trim(),
    detail: [f.evidence, f.caveat].filter((line) => line.trim().length > 0),
  };
}
