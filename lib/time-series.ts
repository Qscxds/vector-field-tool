/**
 * The time-series view (round Q): the solution's value against t, for a planar system (x(t) and
 * y(t)) or a second-order equation (x(t), optionally x'(t)). The phase plane is the wrong picture
 * for a forced, non-autonomous equation (it is only a snapshot), and the time series is the one
 * the second-order chapter needs: forced oscillations, beats, resonance.
 *
 * Pure helpers: which view a picture opens with, the box of the view, the series to draw (t against
 * one component of every kept curve), the marker positions of a query's hits, the footer text.
 * No React, no canvas (components/drawTimeSeries.ts draws).
 */
import type { Box, Range, Vec2 } from "./core/types";
import type { QueryHit } from "./core/query";
import type { PictureMode } from "./labels";
import type { TrajectoryView } from "./scene";

export type ViewKind = "phase" | "time";

/** The default t range of the view (also the URL default: tmin / tmax omitted at these values). */
export const DEFAULT_TIME_RANGE: Range = { min: 0, max: 20 };

/**
 * The view a picture opens with when the link does not say: an autonomous system or equation
 * shows its phase plane; a non-autonomous one, for which the phase plane is only a snapshot,
 * shows the time series. First-order pictures are already graphs of y(t): always "phase" (the
 * (t, y) picture), and the toggle is not offered there.
 */
export function defaultView(mode: PictureMode, timeDependent: boolean): ViewKind {
  if (mode === "first") return "phase";
  return timeDependent ? "time" : "phase";
}

/** Whether a picture offers the time-series view at all. */
export function hasTimeSeries(mode: PictureMode): boolean {
  return mode !== "first";
}

/** Which components of the kernel's (x, y) are drawn: the first is always x; the second is y or x' (when shown). */
export type SeriesKey = "x" | "y";

/**
 * The series of a picture: a planar system draws x(t) and y(t); a second-order equation draws x(t)
 * and, when the student wants it, x'(t) (the kernel's y).
 */
export function seriesOf(mode: PictureMode, showSecond: boolean): SeriesKey[] {
  if (mode === "system") return ["x", "y"];
  return showSecond ? ["x", "y"] : ["x"];
}

/** The legend name of a series, in the student's notation: x(t) and y(t), or x(t) and x'(t). */
export function seriesName(mode: PictureMode, key: SeriesKey): string {
  if (key === "x") return "x(t)";
  return mode === "second" ? "x'(t)" : "y(t)";
}

/**
 * The box of the view: t across the requested range, the value axis spanning the entered phase
 * box's range of every drawn component (the union), so a curve inside the phase box is inside the
 * time-series picture too. Never equal-scale: t and a value have different units.
 */
export function timeSeriesBox(phaseBox: Box, series: SeriesKey[], timeRange: Range): Box {
  const ranges = series.map((k) => (k === "x" ? phaseBox.x : phaseBox.y));
  const min = Math.min(...ranges.map((r) => r.min));
  const max = Math.max(...ranges.map((r) => r.max));
  return { x: { min: timeRange.min, max: timeRange.max }, y: { min, max } };
}

export type SeriesCurve = { key: SeriesKey; points: Vec2[]; nonUnique?: boolean };

/**
 * The polylines to draw for one kept curve (its forward and backward legs, each with `times`): for
 * every series, the points (t, component) of both legs joined into one polyline ordered by t. A
 * leg without `times` (an older tool result) contributes nothing.
 */
export function seriesCurves(legs: readonly TrajectoryView[], series: SeriesKey[]): SeriesCurve[] {
  const out: SeriesCurve[] = [];
  for (const key of series) {
    const points: Vec2[] = [];
    let nonUnique = false;
    // Backward leg reversed (it runs from the start toward smaller t), then the forward leg.
    const ordered = [...legs].sort((a, b) => (a.direction === "backward" ? -1 : 1) - (b.direction === "backward" ? -1 : 1));
    for (const leg of ordered) {
      if (!leg.times || leg.times.length !== leg.points.length) continue;
      if (leg.nonUnique) nonUnique = true;
      const pts = leg.points.map((p, i) => ({ x: leg.times![i], y: key === "x" ? p.x : p.y }));
      if (leg.direction === "backward") pts.reverse();
      // The start point appears in both legs: skip the duplicate.
      points.push(...(points.length && pts.length && pts[0].x === points[points.length - 1].x ? pts.slice(1) : pts));
    }
    if (points.length) out.push({ key, points, ...(nonUnique ? { nonUnique: true } : {}) });
  }
  return out;
}

/** Where a query's hits are marked in the view: (t, component) for every drawn series. */
export function seriesHits(hits: readonly QueryHit[], series: SeriesKey[]): { key: SeriesKey; at: Vec2 }[] {
  return hits.flatMap((h) => series.map((key) => ({ key, at: { x: h.t, y: key === "x" ? h.x : h.y } })));
}

/** Parses the two t-range fields of the form; null while they are not a valid range (mid-typing). */
export function parseTimeRange(minText: string, maxText: string): Range | null {
  // An empty field is not a number (Number("") would be 0).
  const num = (s: string) => (s.trim() === "" ? NaN : Number(s.trim()));
  const min = num(minText);
  const max = num(maxText);
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(min < max)) return null;
  return { min, max };
}
