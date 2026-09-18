/**
 * The time-series picture (round Q): t horizontally, the value of the drawn components vertically,
 * one polyline per kept curve and series, a legend, the query hits as diamonds. Pixels only, no
 * lib/core, shared by the screen canvas and the PNG export like drawScene.
 */
import type { Vec2 } from "@/lib/core/types";
import { chooseTicks } from "@/lib/render/ticks";
import { worldToScreen, type Viewport } from "@/lib/render/viewport";
import type { SeriesCurve, SeriesKey } from "@/lib/time-series";
import { COLORS, NON_UNIQUE_DASH } from "./drawScene";

export const SERIES_COLORS: Record<SeriesKey, string> = { x: COLORS.forward, y: COLORS.backward };

export type TimeSeriesDrawing = {
  /** One entry per kept curve: its series polylines (lib/time-series seriesCurves). */
  curves: SeriesCurve[][];
  /** Legend entries in drawing order: the series key and its student-facing name. */
  legend: { key: SeriesKey; name: string }[];
  /** Query hits to mark, in world coordinates (t, value). */
  hits?: { key: SeriesKey; at: Vec2 }[];
  /** The start time of the kept curves (a thin vertical line, so the initial values are visible). */
  t0?: number;
};

const TICK_FONT = "11px system-ui, sans-serif";
const AXIS_NAME_FONT = "italic 13px 'Times New Roman', Times, serif";
const LEGEND_FONT = "12px system-ui, sans-serif";
/** Round W: the same texts for a projector (lecture mode). */
const LECTURE_TICK_FONT = "15px system-ui, sans-serif";
const LECTURE_AXIS_NAME_FONT = "italic 19px 'Times New Roman', Times, serif";
const LECTURE_LEGEND_FONT = "16px system-ui, sans-serif";
/** Height of the t tick-label row at the bottom; value labels and the axis name stay above it. */
const TICK_ROW = 16;

export function drawTimeSeries(ctx: CanvasRenderingContext2D, v: Viewport, d: TimeSeriesDrawing, opts: { lecture?: boolean } = {}): void {
  const lecture = Boolean(opts.lecture);
  const { width, height } = v;
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);
  drawGrid(ctx, v, lecture);
  if (d.t0 !== undefined && d.t0 >= v.box.x.min && d.t0 <= v.box.x.max) {
    const s = worldToScreen(v, { x: d.t0, y: 0 });
    ctx.strokeStyle = COLORS.axis;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s.x, 0);
    ctx.lineTo(s.x, height);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.lineWidth = 1.8;
  ctx.lineJoin = "round";
  for (const curve of d.curves) {
    for (const series of curve) {
      if (series.points.length < 2) continue;
      ctx.strokeStyle = SERIES_COLORS[series.key];
      ctx.setLineDash(series.nonUnique ? NON_UNIQUE_DASH : []);
      ctx.beginPath();
      series.points.forEach((p, i) => {
        const s = worldToScreen(v, p);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  for (const hit of d.hits ?? []) drawHit(ctx, v, hit.at, SERIES_COLORS[hit.key]);
  drawAxisName(ctx, v, lecture);
  drawLegend(ctx, v, d.legend, lecture);
}

function drawGrid(ctx: CanvasRenderingContext2D, v: Viewport, lecture: boolean): void {
  const tTicks = chooseTicks(v.box.x, 8);
  const vTicks = chooseTicks(v.box.y, 6);
  ctx.lineWidth = 1;
  ctx.font = lecture ? LECTURE_TICK_FONT : TICK_FONT;
  ctx.fillStyle = COLORS.label;
  for (const t of tTicks) {
    const s = worldToScreen(v, { x: t, y: v.box.y.min });
    ctx.strokeStyle = t === 0 ? COLORS.axis : COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(s.x, 0);
    ctx.lineTo(s.x, v.height);
    ctx.stroke();
    // Labels at the bottom, kept inside the picture at the two ends.
    const label = String(t);
    const half = ctx.measureText(label).width / 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(label, Math.min(Math.max(s.x, half + 2), v.width - half - 2), v.height - 3);
  }
  for (const val of vTicks) {
    const s = worldToScreen(v, { x: v.box.x.min, y: val });
    ctx.strokeStyle = val === 0 ? COLORS.axis : COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(0, s.y);
    ctx.lineTo(v.width, s.y);
    ctx.stroke();
    // Labels at the left edge, kept off the top edge and off the t tick row.
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(String(val), 4, Math.min(Math.max(s.y, 7), v.height - TICK_ROW - 6));
  }
}

/** "t" at the right end, just above the value = 0 line (above the tick row when 0 is off-screen or at the bottom). */
function drawAxisName(ctx: CanvasRenderingContext2D, v: Viewport, lecture: boolean): void {
  ctx.font = lecture ? LECTURE_AXIS_NAME_FONT : AXIS_NAME_FONT;
  ctx.lineWidth = 3;
  ctx.strokeStyle = COLORS.background;
  ctx.fillStyle = COLORS.axis;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  const onScreen = v.box.y.min <= 0 && 0 <= v.box.y.max;
  const y = Math.min(onScreen ? worldToScreen(v, { x: 0, y: 0 }).y - 2 : v.height - TICK_ROW, v.height - TICK_ROW);
  ctx.strokeText("t", v.width - 4, y);
  ctx.fillText("t", v.width - 4, y);
}

function drawLegend(ctx: CanvasRenderingContext2D, v: Viewport, legend: { key: SeriesKey; name: string }[], lecture: boolean): void {
  ctx.font = lecture ? LECTURE_LEGEND_FONT : LEGEND_FONT;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  let x = 10;
  const y = 12;
  for (const entry of legend) {
    ctx.strokeStyle = SERIES_COLORS[entry.key];
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 18, y);
    ctx.stroke();
    ctx.fillStyle = COLORS.label;
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.background;
    ctx.strokeText(entry.name, x + 24, y);
    ctx.fillText(entry.name, x + 24, y);
    x += 24 + ctx.measureText(entry.name).width + 16;
  }
}

const HIT_RADIUS = 6;

function drawHit(ctx: CanvasRenderingContext2D, v: Viewport, at: Vec2, color: string): void {
  const s = worldToScreen(v, at);
  if (s.x < -HIT_RADIUS || s.x > v.width + HIT_RADIUS || s.y < -HIT_RADIUS || s.y > v.height + HIT_RADIUS) return;
  const r = HIT_RADIUS;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(s.x, s.y - r);
  ctx.lineTo(s.x + r, s.y);
  ctx.lineTo(s.x, s.y + r);
  ctx.lineTo(s.x - r, s.y);
  ctx.closePath();
  ctx.lineWidth = 4;
  ctx.strokeStyle = COLORS.background;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();
}
