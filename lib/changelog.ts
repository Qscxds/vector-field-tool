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
];

/** The newest `count` entries, newest first (same date: the later entry in the array first). */
export function latestEntries(count = HOME_NEWS_COUNT, entries: readonly ChangelogEntry[] = CHANGELOG): ChangelogEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (a.entry.date < b.entry.date ? 1 : a.entry.date > b.entry.date ? -1 : b.index - a.index))
    .slice(0, count)
    .map((x) => x.entry);
}
