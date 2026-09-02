/**
 * Chinese display labels shared by the MCP tool summaries and the web shell. Pure strings.
 */
import type { Classification } from "./core/classify";
import type { IntegrationStatus } from "./core/integrate";
import type { EquilibriumSolution } from "./core/slope-field";
import type { Complex } from "./core/types";

export const CLASS_ZH: Record<Classification, string> = {
  stable_node: "稳定结点",
  unstable_node: "不稳定结点",
  saddle: "鞍点",
  stable_spiral: "稳定螺旋点（稳定焦点）",
  unstable_spiral: "不稳定螺旋点（不稳定焦点）",
  star_node: "星形结点",
  degenerate_node: "退化结点",
  center_or_weak_spiral: "中心或弱螺旋（线性化无法区分）",
  non_hyperbolic: "非双曲平衡点（线性化无法判定）",
};

export const STATUS_ZH: Record<IntegrationStatus, string> = {
  completed: "积分到指定时间结束",
  left_box: "轨线离开了观察范围后停止",
  reached_equilibrium: "轨线趋近一个平衡点后停止（速度小于 1e-8）",
  blew_up: "解在有限时间内发散（数值爆破），在最后一个有限点停止",
  max_steps: "达到步数上限后停止",
};

export const STABILITY_ZH: Record<EquilibriumSolution["stability"], string> = {
  stable: "稳定（两侧的解都趋向它）",
  unstable: "不稳定（两侧的解都离开它）",
  semi_stable: "半稳定（一侧趋向、一侧离开）",
  varies: "稳定性随 x 变化（在观察范围内两侧解的走向不一致）",
};

export const WARNING_ZH = {
  none_found: "在观察范围内没有找到平衡点。",
  possible_continuum:
    "警告：找到的平衡点几乎都是非双曲的，而且排成一条线，这很可能是一个连续的平衡点集合（例如整条坐标轴），下面只列出其中一部分代表点。",
  hit_limit: "警告：平衡点数量超过了上限，下面只列出前几个。",
} as const;

export function formatNumber(v: number, digits = 4): string {
  if (!Number.isFinite(v)) return String(v);
  const s = v.toFixed(digits).replace(/\.?0+$/, "");
  return s === "" || s === "-0" || s === "-" ? "0" : s;
}

export function formatEigenvalue(e: Complex, digits = 5): string {
  if (Math.abs(e.im) < 1e-15) return formatNumber(e.re, digits);
  return `${formatNumber(e.re, digits)} ${e.im >= 0 ? "+" : "-"} ${formatNumber(Math.abs(e.im), digits)}i`;
}
