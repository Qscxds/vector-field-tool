"use client";

/**
 * The chart of the series / solution-formula panel (round 12): the solution graph's own drawing
 * (drawTimeSeries: grid, ticks, the t name, lecture fonts) with no kept curves, only the panel's
 * labeled curves and bands. Data in, pixels out; no pointer interaction.
 */
import { useEffect, useRef } from "react";
import { plain } from "@/lib/series/notation";
import type { SeriesChart as SeriesChartData } from "@/lib/series-panel";
import { fitViewport } from "@/lib/render/viewport";
import { drawTimeSeries, type TimeSeriesDrawing } from "./drawTimeSeries";
import { prepareCanvas } from "./VectorFieldCanvas";

export function SeriesChart({ chart, width, lecture = false }: { chart: SeriesChartData; width: number; lecture?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const height = Math.round(width * 0.5);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = prepareCanvas(canvas, width, height);
    if (!ctx) return;
    const box = { x: chart.tRange, y: chart.vRange };
    if (!(box.x.max > box.x.min) || !(box.y.max > box.y.min)) return;
    const viewport = fitViewport(box, width, height, { equalScale: false });
    const drawing: TimeSeriesDrawing = {
      curves: [],
      legend: [],
      t0: chart.t0,
      extras: chart.curves.map((c) => ({ segments: c.segments, color: c.color, dash: c.dash, width: c.width, label: plain(c.label) })),
      bands: chart.bands.map((b) => ({ min: b.min, max: b.max, color: b.color, label: plain(b.label) })),
    };
    drawTimeSeries(ctx, viewport, drawing, { lecture });
  }, [chart, width, height, lecture]);
  return (
    <canvas
      ref={ref}
      data-series-chart
      style={{ display: "block", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", width, height }}
    />
  );
}
