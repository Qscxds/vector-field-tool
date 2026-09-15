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
];

/** The newest `count` entries, newest first (same date: the later entry in the array first). */
export function latestEntries(count = HOME_NEWS_COUNT, entries: readonly ChangelogEntry[] = CHANGELOG): ChangelogEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (a.entry.date < b.entry.date ? 1 : a.entry.date > b.entry.date ? -1 : b.index - a.index))
    .slice(0, count)
    .map((x) => x.entry);
}
