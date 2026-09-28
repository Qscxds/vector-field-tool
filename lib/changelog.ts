/**
 * The site's change log (round S): one typed entry per round, both languages, newest shown first
 * on the home page ("What's new", the latest HOME_NEWS_COUNT entries). Data only: the rendering
 * lives in components/HomeContent.tsx and never changes when an entry is added.
 *
 * Maintenance: every round APPENDS one entry at the end of CHANGELOG (the date decides the order,
 * so appending is enough); nothing else is edited. Dates are ISO (yyyy-mm-dd) and are rendered as
 * written: never a relative time, which drifts. `action` is what the reader must DO (a widget
 * version bump means removing and re-adding the connector); it is rendered set apart from the
 * points so it cannot be missed.
 */
import type { Locale } from "./labels";

export type ChangelogEntry = {
  /** ISO date yyyy-mm-dd. */
  date: string;
  title: Record<Locale, string>;
  points: Record<Locale, string[]>;
  /** Something the reader must do; rendered in the highlighted box. */
  action?: Record<Locale, string>;
};

/** How many entries the home page shows. */
export const HOME_NEWS_COUNT = 3;

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Append at the END; the order shown is by date, newest first. */
export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    date: "2026-09-15",
    title: {
      zh: "二阶方程记号、时间序列视图、术语统一、运维",
      en: "Second-order notation, time-series view, terminology, operations",
    },
    points: {
      zh: [
        "二阶方程现在按 F(t, x, x') 输入，自变量是 t；受迫方程如 x'' = -x + cos(t) 可以直接用。",
        "二阶模式的坐标轴和标签改用 x'，不再出现内部的 y；平衡点写成 (x, x') = (…)。",
        "新增时间序列视图（x 对 t），右端含 t 时默认打开它。",
        "微分形式 M dt + N dy = 0：以前报告为 t 的数值其实是曲线的内部参数，已修正。",
        "术语按模式区分：解曲线与轨线，常数解、平衡点与奇点。",
        "轨线条数上限会明确提示；嵌入页有「使用说明」链接；每页都有「报告问题」链接。",
      ],
      en: [
        "Second-order equations now take F(t, x, x'); the independent variable is t. Forced equations like x'' = -x + cos(t) work.",
        "Axes and labels in second-order mode now use x' instead of the internal y. Equilibria read (x, x') = (…).",
        "New time-series view (x against t), the default when t appears on the right-hand side.",
        "Differential form M dt + N dy = 0: values that were reported as t were in fact an internal curve parameter. Fixed.",
        "Terminology now follows the mode: solution curve vs trajectory, constant solution vs equilibrium point vs singular point.",
        "The trajectory limit is now announced, embeds have a Help link, and every page has a \"Report a problem\" link.",
      ],
    },
    action: {
      zh: "MCP 用户必须删除连接器后重新添加。Claude 会缓存添加连接器时的 widget 资源地址，已有的连接会静默地无法渲染。请删除连接器，再重新添加 https://tools.studycase.net/mcp。",
      en: "MCP users must remove and re-add the connector. Claude caches the widget resource address from when the connector was added, so an existing connection will silently fail to render. Remove the connector and add https://tools.studycase.net/mcp again.",
    },
  },
  {
    date: "2026-09-18",
    title: {
      zh: "参数与滑块、零斜线 / 特征方向 / 分界线、讲课模式",
      en: "Parameters and sliders, nullclines / eigen-directions / separatrices, lecture mode",
    },
    points: {
      zh: [
        "方程里可以直接写字母参数了，例如 k*y*(1 - y/L)、-k*(y - Ta)。写下的名字会自动出现在表达式下面的「参数」区，填上取值即可；四种方程类型共用一组参数。",
        "参数取值编进链接（&p=k:0.8,L:2），可以把「k = 0.8、L = 2 的 logistic」作为直达链接放进讲义；结果区、导出的 PNG 和 Claude 读到的摘要都会写明这张图用的是哪组参数。",
        "每个参数可以打开一个滑块，拖动时方向场、曲线、平衡点及其分类实时重算：阻尼振子 x'' + 2*b*x' + w^2*x = 0 拖动 b 过 w，稳定螺旋点在 b = w 处变成稳定结点；受迫振子在时间序列视图里把 g 拖向 1，振幅越来越大。滑块也编在链接里。",
        "时间序列视图里的曲线现在跟随你填的 t 范围（不再固定只算到 t₀ ± 50），足够看到一整个拍的包络。",
        "「在图上显示」新增三个开关：零斜线（两族曲线的交点就是平衡点）、特征方向（稳定 / 不稳定方向；退化结点只有一条）、鞍点的分界线（把相平面分成命运不同的区域）。默认关闭，用线型而不只靠颜色区分。",
        "讲课模式（右上角按钮，链接里是 lecture=1，嵌入页同样支持）：投屏时隐藏特征值、坐标、偏差等具体数值并放大文字，保留分类名和短句形式的注意事项——「中心或弱螺旋」绝不会缩成「中心」；每一行仍可点 ⓘ 展开全部内容。",
        "五个预设改写成带参数的形式（Logistic、牛顿冷却、阻尼振子、受迫 / 拍频、Lotka–Volterra），打开就能看到参数区和滑块怎么用。",
      ],
      en: [
        "Equations may now contain letters for constants, for example k*y*(1 - y/L) or -k*(y - Ta). Every name you write appears by itself in the Parameters area under the expression; give it a value. The four equation types share one set of parameters.",
        "The parameter values are part of the link (&p=k:0.8,L:2), so \"the logistic equation with k = 0.8, L = 2\" can go into a handout as a direct link; the results, the exported PNG and the summary Claude reads all say which values the picture was computed for.",
        "Every parameter can show a slider, and dragging it recomputes the field, the curves, the equilibria and their classification live: drag b past w on the damped oscillator x'' + 2*b*x' + w^2*x = 0 and the stable spiral becomes a stable node at b = w; drag g toward 1 on the forced oscillator, in the time-series view, and the amplitude grows. Sliders are part of the link too.",
        "In the time-series view the curves now follow the t range you enter (no longer only t₀ ± 50), long enough to see a whole envelope of the beats.",
        "\"Show on the picture\" has three new switches: nullclines (the equilibria are where the two families cross), eigen-directions (stable and unstable; a degenerate node has only one) and the separatrices of saddles (they divide the phase plane into regions with different fates). Off by default, and told apart by line style, not by color alone.",
        "Lecture mode (the button at the top right; lecture=1 in a link, and the embedded page takes it too): for projecting, it hides the specific numbers (eigenvalues, coordinates, deviations) and enlarges the text, keeping the classification names and every caveat in short form: \"center or weak spiral\" is never shortened to \"center\". Every line can still be opened in full with its ⓘ.",
        "Five presets are now written with parameters (Logistic, Newton cooling, Damped oscillator, Forced oscillator / beats, Lotka–Volterra), so opening one shows what the Parameters area and the sliders are for.",
      ],
    },
    action: {
      zh: "MCP 用户必须删除连接器后重新添加。这一版 widget 的摘要会写明参数取值，widget 资源地址变了；Claude 会缓存添加连接器时的地址，已有的连接会静默地无法渲染。请删除连接器，再重新添加 https://tools.studycase.net/mcp。",
      en: "MCP users must remove and re-add the connector. The widget's summary now names the parameter values, so the widget resource address changed; Claude caches the address from when the connector was added, so an existing connection will silently fail to render. Remove the connector and add https://tools.studycase.net/mcp again.",
    },
  },
  {
    date: "2026-09-18",
    title: {
      zh: "小修：siny 这类漏括号、ln、讲课模式保留位置、拍频的纵轴",
      en: "Polish: a missing parenthesis like siny, ln, lecture mode keeps positions, the beats' vertical axis",
    },
    points: {
      zh: [
        "漏写括号不再被当成参数：以前一阶方程里写 siny，会悄悄多出一个参数 siny = 1，图按 dy/dt = 1 画。现在 siny、cost、sqrty、sinhx 这类「函数名紧跟变量」会报错并提示「是不是想写 sin(y)？」。k、Ta、sigma 这样的参数名照旧。",
        "可以写 ln 了：ln(y) 和 log(y) 是同一个函数（自然对数）；log10 以 10 为底。",
        "讲课模式改为「位置保留，证据隐藏」：平衡点的坐标和常数解的值重新显示（最多 3 位有效数字，如 (3, 2)、(3.14, 0)），特征值、迹与行列式、偏差、阈值和范围行仍然隐藏；每行的 ⓘ 照旧展开全部内容。",
        "预设「受迫振子 / 拍频」的纵轴从 ±3 改为 ±20：把 g 拖到 1（共振）时曲线不再跑出画面（t ≤ 70 内最大到 16.9）。",
        "拖动滑块时分类「每个值都更新」的条件放宽了一倍，较慢的电脑上也能连续看到螺旋点变成结点。",
        "英文界面里定义域边界上的常数解，标签从 “domain edge, left” 改为 “domain edge, solutions leave”（原来的 left 容易读成「左边」）。",
        "帮助页补了两句实话：零斜线靠符号变化找出来，相切型的零点画不出来；单摆两个鞍点之间稳定与不稳定流形重合，图上只见一条，工具不对这种连接做数值判定。",
      ],
      en: [
        "A missing parenthesis is no longer taken for a parameter: writing siny in a first-order equation used to add a parameter siny = 1 silently and draw the picture of dy/dt = 1. Names like siny, cost, sqrty and sinhx (a function glued to a variable) now give an error that asks \"Did you mean sin(y)?\". Parameter names such as k, Ta and sigma work as before.",
        "You can write ln: ln(y) and log(y) are the same function, the natural logarithm; log10 is base 10.",
        "Lecture mode now keeps positions and hides evidence: the coordinates of equilibria and the values of constant solutions are shown again (to at most 3 significant digits, such as (3, 2) and (3.14, 0)), while eigenvalues, trace and determinant, deviations, thresholds and the range lines stay hidden; each line's ⓘ still opens everything.",
        "The preset \"Forced oscillator / beats\" now has a vertical axis of ±20 instead of ±3: dragging g to 1 (resonance) no longer takes the curve out of the picture (it reaches 16.9 within t ≤ 70).",
        "While a slider is dragged, the condition for updating the classification at every value is twice as generous, so slower computers also show the spiral turning into a node continuously.",
        "In English, a constant solution on the edge of the domain is now tagged \"domain edge, solutions leave\" instead of \"domain edge, left\" (which read like a direction).",
        "The help page says two more honest things: nullclines are found from sign changes, so a zero where the function only touches zero cannot be drawn; and between the pendulum's two saddles the stable and unstable manifolds coincide, so only one line is seen, and the tool makes no numerical judgement on such connections.",
      ],
    },
    action: {
      zh: "MCP 用户必须删除连接器后重新添加。上面那个英文标签也画在 widget 的图上，所以 widget 资源地址变了；Claude 会缓存添加连接器时的地址，已有的连接会静默地无法渲染。请删除连接器，再重新添加 https://tools.studycase.net/mcp。（今天的两次更新只需要重新添加一次。）",
      en: "MCP users must remove and re-add the connector. The English tag above is also drawn on the widget's picture, so the widget resource address changed; Claude caches the address from when the connector was added, so an existing connection will silently fail to render. Remove the connector and add https://tools.studycase.net/mcp again. (Today's two updates need only one re-add.)",
    },
  },
  {
    date: "2026-09-28",
    title: {
      zh: "四个「写成系统」的预设改名并写明 y = x'；新增「两张一起」视图，视图切换移到图的正上方；widget 新增解的图像",
      en: "Four presets renamed to state y = x'; new Both view, the view switch moved above the pictures; the widget gains the solution graph",
    },
    points: {
      zh: [
        "预设「简谐振子」「阻尼振子（系统）」「Van der Pol」「受迫振子 x' = y, y' = −x + sin t」改名为「简谐振子 x'' = −x（写成系统，y = x'）」「阻尼振子 x'' + 0.5x' + x = 0（写成系统，y = x'）」「Van der Pol x'' = (1 − x²)x' − x（写成系统，y = x'）」「受迫振子 x'' = −x + sin t（写成系统，y = x'）」；四条说明的第一句改为降阶「令 y = x'（速度），得 x' = y、y' = …」；说明下面新增一条可点的链接，切到同一个方程的二阶写法，四个二阶预设也新增指回系统写法的链接。",
        "视图切换从左栏的单选钮改为图正上方的三个按钮「相平面 / 解的图像 / 两张一起」；新增「两张一起」：两张图并排（窗口窄时上下堆叠）。默认视图改为：二阶方程 → 两张一起，自治平面系统 → 相平面，非自治平面系统 → 解的图像；链接新增 view=both，旧链接的 view=phase / view=time 不变。",
        "每张图上方新增一行坐标说明：相平面「横轴 x，纵轴 x'（速度）」（平面系统写「纵轴 y」），解的图像「横轴 t，纵轴 x」（画了 x'(t) 时「纵轴 x 与 x'」）；讲课模式下保留。",
        "固定曲线改为每条一个颜色，两张图相同；相平面上不再用蓝色 / 橙色区分向前 / 向后，改为在初值点画同色小圆点。鼠标放到任一张图的曲线上，两张图里它都加粗；相平面的预览曲线同时画在解的图像里；查询到的点两张图都标。解的图像上点击不再有任何反应（鼠标不变手型），说明行写明用「初值」或在相平面上点添加曲线。",
        "「时间序列」改名「解的图像」；两张一起时「下载 PNG」改为导出两张图并排的一张图片；嵌入页支持 view=both；帮助页嵌入高度改为 1200 / 900 并补了两张图时的高度；参数区空提示在二阶模式下改为 k*x。",
        "widget 新增解的图像、同样的三选一按钮、联动和每曲线一色；trace_trajectory 和 query_solution 返回的曲线新增每个点的时刻 times（与点同步抽稀，每条最多 1000 个）。",
      ],
      en: [
        "The presets \"Harmonic oscillator\", \"Damped oscillator (system)\", \"Van der Pol\" and \"Forced oscillator x' = y, y' = −x + sin t\" are renamed \"Harmonic oscillator x'' = −x (as a system, y = x')\", \"Damped oscillator x'' + 0.5x' + x = 0 (as a system, y = x')\", \"Van der Pol x'' = (1 − x²)x' − x (as a system, y = x')\" and \"Forced oscillator x'' = −x + sin t (as a system, y = x')\"; the first sentence of their notes is now the reduction \"let y = x' (the velocity), so x' = y, y' = …\"; a clickable link under each note switches to the same equation written as a second-order equation, and the four second-order presets get the link back to the system.",
        "The view switch moved from a radio button in the form to three buttons right above the pictures, Phase plane / Solution graph / Both; Both is new: the two pictures side by side (stacked in a narrow window). The default view changed to: a second-order equation → Both, an autonomous planar system → Phase plane, a non-autonomous planar system → Solution graph; links gain view=both, and view=phase / view=time in old links are unchanged.",
        "A caption is added above each picture naming its coordinates: the phase plane \"horizontal x, vertical x' (velocity)\" (\"vertical y\" for a planar system), the solution graph \"horizontal t, vertical x\" (\"vertical x and x'\" with x'(t) drawn); kept in lecture mode.",
        "Kept curves now have one color each, the same in both pictures; the phase plane no longer colors forward blue and backward orange, and instead marks the initial point with a dot of the curve's color. Pointing at a curve in either picture emphasizes it in both; the phase plane's preview curve is drawn in the solution graph too; a query's points are marked in both. A click on the solution graph now does nothing (the pointer stays an arrow), and its caption says to add a curve under Initial value or by clicking the phase plane.",
        "\"Time series\" is renamed \"Solution graph\"; with both pictures shown, Download PNG now exports the two pictures side by side as one file; the embedded page takes view=both; the embed heights on the help page changed to 1200 / 900 with the heights for two pictures added; the empty parameter area's example reads k*x in second-order mode.",
        "The widget gains the solution graph, the same three-way switch, the same linkage and one color per curve; the curves returned by trace_trajectory and query_solution gain the time of every point (times, thinned with the points, 1000 per leg at most).",
      ],
    },
    action: {
      zh: "MCP 用户必须删除连接器后重新添加。widget 有了解的图像，资源地址变了；Claude 会缓存添加连接器时的地址，已有的连接会静默地无法渲染。请删除连接器，再重新添加 https://tools.studycase.net/mcp。",
      en: "MCP users must remove and re-add the connector. The widget gained the solution graph, so the widget resource address changed; Claude caches the address from when the connector was added, so an existing connection will silently fail to render. Remove the connector and add https://tools.studycase.net/mcp again.",
    },
  },
];

/** The newest `count` entries, newest first (same date: the later entry in the array first). */
export function latestEntries(count = HOME_NEWS_COUNT, entries: readonly ChangelogEntry[] = CHANGELOG): ChangelogEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (a.entry.date < b.entry.date ? 1 : a.entry.date > b.entry.date ? -1 : b.index - a.index))
    .slice(0, count)
    .map((x) => x.entry);
}
