"use client";

/**
 * The time-series canvas (round Q): data in, pixels out, like VectorFieldCanvas. No interaction:
 * a click in a time-series picture cannot give an initial velocity, so curves are added through
 * the initial-value inputs and removed with Clear / Undo.
 */
import { useEffect, useRef } from "react";
import type { Viewport } from "@/lib/render/viewport";
import { drawTimeSeries, type TimeSeriesDrawing } from "./drawTimeSeries";
import { prepareCanvas } from "./VectorFieldCanvas";

export type TimeSeriesCanvasProps = {
  viewport: Viewport;
  drawing: TimeSeriesDrawing;
  /** Round W: lecture mode (larger text on the picture). Display only. */
  lecture?: boolean;
  className?: string;
};

export function TimeSeriesCanvas({ viewport, drawing, lecture = false, className }: TimeSeriesCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = prepareCanvas(canvas, viewport.width, viewport.height);
    if (!ctx) return;
    drawTimeSeries(ctx, viewport, drawing, { lecture });
  }, [viewport, drawing, lecture]);
  return (
    <canvas
      ref={ref}
      className={className}
      data-time-series
      style={{ display: "block", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", width: viewport.width, height: viewport.height }}
    />
  );
}
