"use client";

/**
 * Draws a Scene on two stacked canvases: the base layer (grid, field, trajectories, equilibria,
 * implicit curves) and an overlay (hover preview). Data in, pixels out: this component never calls
 * lib/core and does not know whether it lives in the web shell or in the MCP widget. Interaction is
 * reported to the parent as world / screen coordinates and deltas; the parent owns the viewport.
 */
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { Vec2 } from "@/lib/core/types";
import type { ArrowMode } from "@/lib/render/arrows";
import { fitViewport, screenToWorld, worldToScreen, type Viewport } from "@/lib/render/viewport";
import type { Scene, TrajectoryView } from "@/lib/scene";
import { COLORS, drawScene, NON_UNIQUE_DASH } from "./drawScene";
import { IDLE_GESTURE, longPressDueAt, reduceGesture, type GestureAction, type GestureEvent, type GestureState } from "@/lib/gestures";

export type VectorFieldCanvasProps = {
  scene: Scene;
  /** Viewport (equal-scale or filled; the parent decides); defaults to the equal-scale fitViewport(scene.box). */
  viewport?: Viewport;
  width?: number;
  height?: number;
  arrowMode?: ArrowMode;
  /** Hover preview curves, drawn on the overlay only. */
  overlay?: TrajectoryView[];
  /** Short text shown on the overlay near the cursor (e.g. "direction undefined here"). */
  overlayHint?: { at: Vec2; text: string } | null;
  /** Kept curves under the pointer (a click removes them): redrawn on the overlay with a thicker stroke. */
  highlight?: TrajectoryView[];
  /** Cursor over the canvas while interactive (default crosshair; the parent passes "pointer" over a removable curve). */
  cursor?: string;
  /** A click, or a touch long press (lib/gestures): the parent decides whether it keeps or removes a curve. */
  onClickWorld?: (p: Vec2) => void;
  /** World and screen position while the pointer moves; null when it leaves. `touch` marks a finger's tap. */
  onHoverWorld?: (world: Vec2 | null, screen: Vec2 | null, touch?: boolean) => void;
  onWheelZoom?: (screenPoint: Vec2, factor: number) => void;
  onPan?: (dxScreen: number, dyScreen: number) => void;
  /**
   * One touch pinch step: the world point under `from` must end under `to` and the scale is
   * multiplied by `factor`, as ONE viewport update (see pinchAt). Without it the step falls back to
   * onPan then onWheelZoom, which lose the midpoint's motion when both read the same stale viewport.
   */
  onPinch?: (from: Vec2, to: Vec2, factor: number) => void;
  onDoubleClick?: () => void;
  className?: string;
};


/** Longer than the OS double-click interval is not needed: the second pointerup cancels the first click. */
const CLICK_DELAY_MS = 220;
/** A dblclick synthesized from touch taps within this window is ignored: the gesture machine already handled the double tap. */
const TOUCH_DBLCLICK_GUARD_MS = 1000;


export function VectorFieldCanvas({
  scene,
  viewport,
  width = 640,
  height = 480,
  arrowMode = "unit",
  overlay,
  overlayHint,
  highlight,
  cursor,
  onClickWorld,
  onHoverWorld,
  onWheelZoom,
  onPan,
  onPinch,
  onDoubleClick,
  className,
}: VectorFieldCanvasProps) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  // Whether the last pointer that touched the canvas was a finger: only then is the context menu
  // (the long-press menu) suppressed and the overlay hint drawn one size larger. Mouse and pen
  // behave exactly as before the touch support.
  const lastPointerWasTouch = useRef(false);
  const drag = useRef<{ x: number; y: number; moved: boolean; active: boolean }>({ x: 0, y: 0, moved: false, active: false });
  const v: Viewport | null = viewport ?? (scene.box ? fitViewport(scene.box, width, height) : null);

  // Base layer: only when the scene or viewport changes.
  useEffect(() => {
    const canvas = baseRef.current;
    if (!canvas) return;
    const ctx = prepareCanvas(canvas, width, height);
    if (!ctx) return;
    drawScene(ctx, scene, v, { width, height }, { arrowMode });
  }, [scene, v, width, height, arrowMode]);

  // Overlay: hover curve(s) and hint; cheap to redraw on every pointer frame.
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = prepareCanvas(canvas, width, height);
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (!v) return;
    if (highlight?.length) {
      // The pair a click would remove, over its base-layer stroke (1.8 px), in its own colors.
      ctx.lineWidth = 4;
      ctx.lineJoin = "round";
      for (const t of highlight) {
        if (t.points.length < 2) continue;
        ctx.strokeStyle = t.direction === "forward" ? COLORS.forward : COLORS.backward;
        ctx.setLineDash(t.nonUnique ? NON_UNIQUE_DASH : []);
        ctx.beginPath();
        t.points.forEach((p, i) => {
          const s = worldToScreen(v, p);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    if (overlay?.length) {
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = COLORS.hover;
      ctx.lineJoin = "round";
      for (const t of overlay) {
        if (t.points.length < 2) continue;
        // A preview through a point where uniqueness fails is dashed, like a kept curve.
        ctx.setLineDash(t.nonUnique ? NON_UNIQUE_DASH : []);
        ctx.beginPath();
        t.points.forEach((p, i) => {
          const s = worldToScreen(v, p);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    if (overlayHint) {
      const s = worldToScreen(v, overlayHint.at);
      ctx.font = `${lastPointerWasTouch.current ? 12 : 11}px system-ui, sans-serif`;
      ctx.fillStyle = "#92400e";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(overlayHint.text, Math.min(s.x + 10, width - 160), Math.max(s.y - 8, 12));
    }
  }, [overlay, overlayHint, highlight, v, width, height]);

  // Wheel must be non-passive to prevent the page from scrolling; React's onWheel is passive.
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas || !onWheelZoom) return;
    const handler = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = Math.min(2, Math.max(0.5, Math.exp(-event.deltaY * 0.0015)));
      onWheelZoom({ x: event.clientX - rect.left, y: event.clientY - rect.top }, factor);
    };
    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, [onWheelZoom]);

  const screenOf = (event: ReactPointerEvent<HTMLCanvasElement>): Vec2 => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  // Touch pointers go through the pure gesture machine (lib/gestures); mouse and pen keep the
  // handlers below unchanged. The long press needs a timer, the only clock in this component.
  const gesture = useRef<GestureState>(IDLE_GESTURE);
  const longPressTimer = useRef<number | null>(null);
  const lastTouchAt = useRef<number>(-Infinity);
  const applyGesture = (a: GestureAction) => {
    switch (a.type) {
      case "pan":
        onPan?.(a.dx, a.dy);
        onHoverWorld?.(null, null);
        return;
      case "pinch":
        if (onPinch) onPinch(a.from, a.center, a.factor);
        else {
          onPan?.(a.center.x - a.from.x, a.center.y - a.from.y);
          onWheelZoom?.(a.center, a.factor);
        }
        onHoverWorld?.(null, null);
        return;
      case "tap":
        // The preview stays until the next tap or gesture (there is no pointerleave to clear it).
        if (v && onHoverWorld) onHoverWorld(screenToWorld(v, a.at), a.at, true);
        return;
      case "doubleTap":
        cancelPendingClick();
        onDoubleClick?.();
        return;
      case "longPress":
        // Same as a click: on a kept curve the parent removes it, on empty canvas it keeps the solution.
        if (v && onClickWorld) onClickWorld(screenToWorld(v, a.at));
        onHoverWorld?.(null, null);
        return;
    }
  };
  const dispatchTouch = (event: GestureEvent) => {
    lastTouchAt.current = event.t;
    const result = reduceGesture(gesture.current, event);
    gesture.current = result.state;
    for (const a of result.actions) applyGesture(a);
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    const due = longPressDueAt(result.state);
    if (due !== null) {
      longPressTimer.current = window.setTimeout(() => {
        longPressTimer.current = null;
        dispatchTouch({ type: "tick", t: performance.now() });
      }, Math.max(0, due - performance.now()) + 1);
    }
  };
  useEffect(
    () => () => {
      if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current);
    },
    [],
  );
  const isTouch = (event: ReactPointerEvent<HTMLCanvasElement>) => event.pointerType === "touch";

  const handleDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const s = screenOf(event);
    lastPointerWasTouch.current = isTouch(event);
    if (isTouch(event)) {
      try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* the pointer may already be gone (pointercancel) or synthetic: capture is a nicety, not a requirement */
    }
      dispatchTouch({ type: "down", id: event.pointerId, x: s.x, y: s.y, t: performance.now() });
      return;
    }
    drag.current = { x: s.x, y: s.y, moved: false, active: true };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* the pointer may already be gone (pointercancel) or synthetic: capture is a nicety, not a requirement */
    }
  };

  const handleMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const s = screenOf(event);
    if (isTouch(event)) {
      dispatchTouch({ type: "move", id: event.pointerId, x: s.x, y: s.y, t: performance.now() });
      return;
    }
    if (drag.current.active) {
      const dx = s.x - drag.current.x;
      const dy = s.y - drag.current.y;
      if (drag.current.moved || Math.hypot(dx, dy) > 3) {
        drag.current.moved = true;
        drag.current.x = s.x;
        drag.current.y = s.y;
        onPan?.(dx, dy);
        onHoverWorld?.(null, null);
        return;
      }
    }
    if (v && onHoverWorld) onHoverWorld(screenToWorld(v, s), s);
  };

  // A click is only reported after a short pause, so the two clicks of a double-click are not
  // turned into two trajectories before the reset fires.
  const clickTimer = useRef<number | null>(null);
  const cancelPendingClick = () => {
    if (clickTimer.current !== null) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
  };
  useEffect(() => cancelPendingClick, []);

  const handleUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const s = screenOf(event);
    if (isTouch(event)) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      dispatchTouch({ type: "up", id: event.pointerId, x: s.x, y: s.y, t: performance.now() });
      return;
    }
    const wasDrag = drag.current.moved;
    drag.current.active = false;
    drag.current.moved = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    if (!wasDrag && v && onClickWorld) {
      const world = screenToWorld(v, s);
      cancelPendingClick();
      clickTimer.current = window.setTimeout(() => {
        clickTimer.current = null;
        onClickWorld(world);
      }, CLICK_DELAY_MS);
    }
  };

  const handleDoubleClick = () => {
    // Browsers synthesize dblclick from two touch taps; the gesture machine already reset the view.
    if (performance.now() - lastTouchAt.current < TOUCH_DBLCLICK_GUARD_MS) return;
    cancelPendingClick();
    onDoubleClick?.();
  };

  const handleCancel = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (isTouch(event)) dispatchTouch({ type: "cancel", id: event.pointerId, t: performance.now() });
  };

  const handleLeave = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    // A touch pointer "leaves" as soon as it lifts; the tap preview must survive that.
    if (isTouch(event)) return;
    drag.current.active = false;
    drag.current.moved = false;
    onHoverWorld?.(null, null);
  };

  const interactive = Boolean(onClickWorld || onHoverWorld || onPan || onWheelZoom || onPinch);
  return (
    <div className={className} style={{ position: "relative", width, height, borderRadius: 6, border: "1px solid #e5e7eb", overflow: "hidden", background: "#fff" }}>
      <canvas ref={baseRef} style={{ position: "absolute", left: 0, top: 0, display: "block" }} role="img" aria-label="Phase portrait" />
      <canvas
        ref={overlayRef}
        style={{ position: "absolute", left: 0, top: 0, display: "block", cursor: interactive ? (cursor ?? "crosshair") : "default", touchAction: "none" }}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerLeave={handleLeave}
        onPointerCancel={handleCancel}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(event) => {
          // A finger held on the canvas is a "keep" gesture, not a menu request; the mouse keeps its menu.
          if (lastPointerWasTouch.current) event.preventDefault();
        }}
      />
    </div>
  );
}

export function prepareCanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D | null {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
