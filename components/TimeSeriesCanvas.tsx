"use client";

/**
 * The solution-graph canvas (round Q's time-series picture): data in, pixels out, like
 * VectorFieldCanvas. Its only interaction (round Z2.4) is naming the kept curve under the pointer,
 * through the pure pointer machine of lib/linked-views, so the phase plane can emphasize the same
 * curve. A click here does nothing on purpose: a point (t, x) cannot give an initial value (it
 * lacks x', or y), so curves are added through the initial-value inputs or a click on the phase
 * plane, and the cursor stays the default arrow, never a hand.
 */
import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { reduceGraphPointer } from "@/lib/linked-views";
import type { Viewport } from "@/lib/render/viewport";
import { drawTimeSeries, type TimeSeriesDrawing } from "./drawTimeSeries";
import { prepareCanvas } from "./VectorFieldCanvas";

export type TimeSeriesCanvasProps = {
  viewport: Viewport;
  drawing: TimeSeriesDrawing;
  /** Round W: lecture mode (larger text on the picture). Display only. */
  lecture?: boolean;
  /** Round Z2.4: the kept curve under the pointer (its index in `drawing.curves`), null when the pointer leaves or is over none. */
  onHoverCurve?: (index: number | null) => void;
  className?: string;
};

export function TimeSeriesCanvas({ viewport, drawing, lecture = false, onHoverCurve, className }: TimeSeriesCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = prepareCanvas(canvas, viewport.width, viewport.height);
    if (!ctx) return;
    drawTimeSeries(ctx, viewport, drawing, { lecture });
  }, [viewport, drawing, lecture]);

  // The pointer machine's state: what was last reported, so a hover is reported once per change.
  const hovered = useRef<number | null>(null);
  const dispatch = (event: Parameters<typeof reduceGraphPointer>[1]) => {
    if (!onHoverCurve) return;
    const result = reduceGraphPointer(hovered.current, event, drawing.curves, viewport);
    hovered.current = result.hovered;
    for (const a of result.actions) onHoverCurve(a.index);
  };
  const screenOf = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  return (
    <canvas
      ref={ref}
      className={className}
      data-time-series
      onPointerMove={(event) => dispatch({ type: "move", screen: screenOf(event) })}
      onPointerLeave={() => dispatch({ type: "leave" })}
      onPointerCancel={() => dispatch({ type: "leave" })}
      onClick={(event) => dispatch({ type: "click", screen: screenOf(event) })}
      style={{ display: "block", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", width: viewport.width, height: viewport.height, cursor: "default" }}
    />
  );
}
