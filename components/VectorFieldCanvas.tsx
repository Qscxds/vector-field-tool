"use client";

/**
 * Draws a Scene on two stacked canvases: the base layer (grid, field, trajectories, equilibria,
 * implicit curves) and an overlay (hover preview). Data in, pixels out: this component never calls
 * lib/core and does not know whether it lives in the web shell or in the MCP widget. Interaction is
 * reported to the parent as world / screen coordinates and deltas; the parent owns the viewport.
 */
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { Equilibrium } from "@/lib/core/equilibria";
import type { Vec2 } from "@/lib/core/types";
import { arrowPolygon, scaleArrows, type ArrowMode } from "@/lib/render/arrows";
import { axisNameAnchors } from "@/lib/render/axis-names";
import { chooseTicks } from "@/lib/render/ticks";
import { formatNumber } from "@/lib/labels";
import { fitViewport, screenToWorld, worldToScreen, type Viewport } from "@/lib/render/viewport";
import type { Scene, TrajectoryView } from "@/lib/scene";

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
  onClickWorld?: (p: Vec2) => void;
  /** World and screen position while the pointer moves; null when it leaves. */
  onHoverWorld?: (world: Vec2 | null, screen: Vec2 | null) => void;
  onWheelZoom?: (screenPoint: Vec2, factor: number) => void;
  onPan?: (dxScreen: number, dyScreen: number) => void;
  onDoubleClick?: () => void;
  className?: string;
};

const COLORS = {
  background: "#ffffff",
  grid: "#e5e7eb",
  axis: "#6b7280",
  label: "#6b7280",
  forward: "#1d4ed8",
  backward: "#d97706",
  start: "#111827",
  stable: "#15803d",
  unstable: "#b91c1c",
  saddle: "#7c3aed",
  uncertain: "#4b5563",
  implicit: "#7c3aed",
  hover: "rgba(14, 116, 144, 0.75)",
};

/** Longer than the OS double-click interval is not needed: the second pointerup cancels the first click. */
const CLICK_DELAY_MS = 220;

/**
 * Non-uniqueness marks, all data-driven from the Scene (uniqueness verdict "unbounded"):
 * a trajectory through such a point is dashed (it is one of infinitely many); a constant solution
 * gets a dotted companion line on each side (a double line) and a "!" badge; an equilibrium gets
 * the "!" badge beside its marker. A domain-edge constant solution has its own dash-dot pattern.
 */
const NON_UNIQUE_DASH = [6, 4];
const NON_UNIQUE_COMPANION_DASH = [2, 3];
const NON_UNIQUE_COMPANION_OFFSET = 4;
const DOMAIN_EDGE_DASH = [10, 4, 2, 4];
const BADGE_RADIUS = 7;

const STABLE: ReadonlySet<Equilibrium["classification"]> = new Set(["stable_node", "stable_spiral"]);
const UNSTABLE: ReadonlySet<Equilibrium["classification"]> = new Set(["unstable_node", "unstable_spiral"]);

export function VectorFieldCanvas({
  scene,
  viewport,
  width = 640,
  height = 480,
  arrowMode = "unit",
  overlay,
  overlayHint,
  onClickWorld,
  onHoverWorld,
  onWheelZoom,
  onPan,
  onDoubleClick,
  className,
}: VectorFieldCanvasProps) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean; active: boolean }>({ x: 0, y: 0, moved: false, active: false });
  const v: Viewport | null = viewport ?? (scene.box ? fitViewport(scene.box, width, height) : null);

  // Base layer: only when the scene or viewport changes.
  useEffect(() => {
    const canvas = baseRef.current;
    if (!canvas) return;
    const ctx = prepare(canvas, width, height);
    if (!ctx) return;
    drawBase(ctx, scene, v, { width, height }, arrowMode);
  }, [scene, v, width, height, arrowMode]);

  // Overlay: hover curve(s) and hint; cheap to redraw on every pointer frame.
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = prepare(canvas, width, height);
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (!v) return;
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
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = "#92400e";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(overlayHint.text, Math.min(s.x + 10, width - 160), Math.max(s.y - 8, 12));
    }
  }, [overlay, overlayHint, v, width, height]);

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

  const handleDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const s = screenOf(event);
    drag.current = { x: s.x, y: s.y, moved: false, active: true };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const s = screenOf(event);
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
    cancelPendingClick();
    onDoubleClick?.();
  };

  const handleLeave = () => {
    drag.current.active = false;
    drag.current.moved = false;
    onHoverWorld?.(null, null);
  };

  const interactive = Boolean(onClickWorld || onHoverWorld || onPan || onWheelZoom);
  return (
    <div className={className} style={{ position: "relative", width, height, borderRadius: 6, border: "1px solid #e5e7eb", overflow: "hidden", background: "#fff" }}>
      <canvas ref={baseRef} style={{ position: "absolute", left: 0, top: 0, display: "block" }} role="img" aria-label="Phase portrait" />
      <canvas
        ref={overlayRef}
        style={{ position: "absolute", left: 0, top: 0, display: "block", cursor: interactive ? "crosshair" : "default", touchAction: "none" }}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerLeave={handleLeave}
        onDoubleClick={handleDoubleClick}
      />
    </div>
  );
}

function prepare(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D | null {
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

function drawBase(ctx: CanvasRenderingContext2D, scene: Scene, v: Viewport | null, size: { width: number; height: number }, arrowMode: ArrowMode): void {
  const { width, height } = size;
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);
  if (!v) {
    ctx.fillStyle = COLORS.label;
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(scene.kind === "ping" ? `ping: ${scene.message ?? ""}` : "nothing to draw", 12, 24);
    return;
  }
  drawGrid(ctx, v);
  if (scene.field) drawArrows(ctx, v, scene, arrowMode);
  if (scene.firstOrder?.implicit) drawImplicit(ctx, v, scene.firstOrder.implicit.levels);
  if (scene.firstOrder) drawFirstOrderLines(ctx, v, scene);
  if (scene.trajectories) drawTrajectories(ctx, v, scene);
  if (scene.equilibria) drawEquilibria(ctx, v, scene.equilibria);
  if (scene.firstOrder?.singularities?.length) drawSingularities(ctx, v, scene.firstOrder.singularities);
  // Last, so the names stay legible over the field. Data-driven: a first-order scene (system in
  // variable mode "ty") calls its horizontal coordinate t, a planar system calls it x.
  drawAxisNames(ctx, v, scene.system?.variables === "ty" ? "t" : "x", "y");
  // Data-driven: a non-autonomous scene says which instant the field was sampled at.
  if (scene.timeDependent) drawSnapshotTime(ctx, v, scene.timeDependent.snapshotT);
}

/** "t = 1.5" in the top-right corner: the picture is a snapshot of a field that changes with t. */
function drawSnapshotTime(ctx: CanvasRenderingContext2D, v: Viewport, t: number): void {
  ctx.font = AXIS_NAME_FONT;
  ctx.lineWidth = 3;
  ctx.strokeStyle = COLORS.background;
  ctx.fillStyle = COLORS.axis;
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  const text = `t = ${formatNumber(t, 4)}`;
  ctx.strokeText(text, v.width - 8, 6);
  ctx.fillText(text, v.width - 8, 6);
}

function drawGrid(ctx: CanvasRenderingContext2D, v: Viewport): void {
  const xTicks = chooseTicks(v.box.x, 8);
  const yTicks = chooseTicks(v.box.y, 6);
  ctx.lineWidth = 1;
  ctx.font = TICK_FONT;
  ctx.fillStyle = COLORS.label;
  for (const x of xTicks) {
    const s = worldToScreen(v, { x, y: v.box.y.min });
    ctx.strokeStyle = x === 0 ? COLORS.axis : COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(s.x, 0);
    ctx.lineTo(s.x, v.height);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(String(x), s.x, v.height - 3);
  }
  for (const y of yTicks) {
    const s = worldToScreen(v, { x: v.box.x.min, y });
    ctx.strokeStyle = y === 0 ? COLORS.axis : COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(0, s.y);
    ctx.lineTo(v.width, s.y);
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(String(y), 4, s.y);
  }
}

const AXIS_NAME_FONT = "italic 13px 'Times New Roman', Times, serif";
const TICK_FONT = "11px system-ui, sans-serif";

function drawAxisNames(ctx: CanvasRenderingContext2D, v: Viewport, horizontal: string, vertical: string): void {
  ctx.font = TICK_FONT;
  const tickColumnWidth = chooseTicks(v.box.y, 6).reduce((w, y) => Math.max(w, ctx.measureText(String(y)).width), 0);
  const anchors = axisNameAnchors(v, { tickColumnWidth, tickRowHeight: 11 });
  ctx.font = AXIS_NAME_FONT;
  ctx.lineWidth = 3;
  ctx.strokeStyle = COLORS.background; // halo so the letter reads over arrows and curves
  ctx.fillStyle = COLORS.axis;
  for (const [name, a] of [[horizontal, anchors.horizontal], [vertical, anchors.vertical]] as const) {
    ctx.textAlign = a.align;
    ctx.textBaseline = a.baseline;
    ctx.strokeText(name, a.x, a.y);
    ctx.fillText(name, a.x, a.y);
  }
}

function drawArrows(ctx: CanvasRenderingContext2D, v: Viewport, scene: Scene, mode: ArrowMode): void {
  if (!scene.field) return;
  const arrows = scaleArrows(scene.field, v, mode);
  const segments = scene.fieldStyle === "segments";
  ctx.lineWidth = segments ? 1.6 : 1.2;
  for (const a of arrows) {
    if (a.singular) {
      ctx.strokeStyle = a.color;
      ctx.beginPath();
      ctx.arc(a.from.x, a.from.y, 3, 0, 2 * Math.PI);
      ctx.stroke();
      continue;
    }
    const len = Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y);
    ctx.strokeStyle = a.color;
    ctx.fillStyle = a.color;
    if (len < 0.5) {
      ctx.beginPath();
      ctx.arc(a.from.x, a.from.y, 1.5, 0, 2 * Math.PI);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(a.from.x, a.from.y);
    ctx.lineTo(a.to.x, a.to.y);
    ctx.stroke();
    if (segments) continue; // undirected: no arrow head
    const head = arrowPolygon(a.from, a.to, Math.min(6, len * 0.45));
    if (head.length === 3) {
      ctx.beginPath();
      ctx.moveTo(head[0].x, head[0].y);
      ctx.lineTo(head[1].x, head[1].y);
      ctx.lineTo(head[2].x, head[2].y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawTrajectories(ctx: CanvasRenderingContext2D, v: Viewport, scene: Scene): void {
  ctx.lineWidth = 1.8;
  ctx.lineJoin = "round";
  for (const t of scene.trajectories ?? []) {
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
  if (scene.start) {
    const s = worldToScreen(v, scene.start);
    ctx.fillStyle = COLORS.start;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3.5, 0, 2 * Math.PI);
    ctx.fill();
  }
}

/** The "!" badge marking a point or line where uniqueness fails. */
function drawBadge(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color;
  ctx.fillStyle = COLORS.background;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(x, y, BADGE_RADIUS, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", x, y + 0.5);
}

function drawFirstOrderLines(ctx: CanvasRenderingContext2D, v: Viewport, scene: Scene): void {
  for (const sol of scene.firstOrder?.solutions ?? []) {
    const s = worldToScreen(v, { x: v.box.x.min, y: sol.y });
    const approached = sol.stability === "stable" || sol.stability === "edge_approach";
    const left = sol.stability === "unstable" || sol.stability === "edge_leave";
    const color = approached ? COLORS.stable : left ? COLORS.unstable : sol.stability === "varies" ? COLORS.uncertain : COLORS.backward;
    const nonUnique = sol.uniqueness?.verdict === "unbounded";
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    // Domain-edge lines have their own dash-dot pattern; interior lines keep solid / dashed / dotted.
    ctx.setLineDash(sol.domainEdge ? DOMAIN_EDGE_DASH : sol.stability === "stable" ? [] : sol.stability === "unstable" ? [8, 5] : [2, 4]);
    ctx.beginPath();
    ctx.moveTo(0, s.y);
    ctx.lineTo(v.width, s.y);
    ctx.stroke();
    if (nonUnique) {
      // Double line: a dotted companion on each side, then the badge at the left end.
      ctx.lineWidth = 1;
      ctx.setLineDash(NON_UNIQUE_COMPANION_DASH);
      for (const dy of [-NON_UNIQUE_COMPANION_OFFSET, NON_UNIQUE_COMPANION_OFFSET]) {
        ctx.beginPath();
        ctx.moveTo(0, s.y + dy);
        ctx.lineTo(v.width, s.y + dy);
        ctx.stroke();
      }
      drawBadge(ctx, 2 * BADGE_RADIUS + 4, s.y, color);
    }
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(`y = ${Number(sol.y.toFixed(4))} (${sol.stability})${nonUnique ? " !" : ""}`, v.width - 6, s.y - (nonUnique ? 6 : 3));
  }
}

function drawImplicit(ctx: CanvasRenderingContext2D, v: Viewport, levels: { level: number; segments: [Vec2, Vec2][] }[]): void {
  ctx.strokeStyle = COLORS.implicit;
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.85;
  for (const { segments } of levels) {
    ctx.beginPath();
    for (const [a, b] of segments) {
      const sa = worldToScreen(v, a);
      const sb = worldToScreen(v, b);
      ctx.moveTo(sa.x, sa.y);
      ctx.lineTo(sb.x, sb.y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawSingularities(ctx: CanvasRenderingContext2D, v: Viewport, points: Vec2[]): void {
  for (const p of points) {
    const s = worldToScreen(v, p);
    ctx.strokeStyle = COLORS.backward;
    ctx.fillStyle = COLORS.backward;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 6, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s.x, s.y, 1.5, 0, 2 * Math.PI);
    ctx.fill();
  }
}

function drawEquilibria(ctx: CanvasRenderingContext2D, v: Viewport, equilibria: Equilibrium[]): void {
  const r = 6;
  for (const e of equilibria) {
    const s = worldToScreen(v, e.at);
    ctx.lineWidth = 2;
    if (e.classification === "saddle") {
      ctx.strokeStyle = COLORS.saddle;
      ctx.beginPath();
      ctx.moveTo(s.x - r, s.y - r);
      ctx.lineTo(s.x + r, s.y + r);
      ctx.moveTo(s.x - r, s.y + r);
      ctx.lineTo(s.x + r, s.y - r);
      ctx.stroke();
      if (e.uniqueness?.verdict === "unbounded") drawBadge(ctx, s.x + r + BADGE_RADIUS + 2, s.y - r - 2, COLORS.saddle);
      continue;
    }
    const uncertain = e.classification === "center_or_weak_spiral" || e.classification === "non_hyperbolic";
    const stable = STABLE.has(e.classification) || (!uncertain && !UNSTABLE.has(e.classification) && e.trace < 0);
    const color = uncertain ? COLORS.uncertain : stable ? COLORS.stable : COLORS.unstable;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.setLineDash(uncertain ? [3, 3] : []);
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, 2 * Math.PI);
    if (stable && !uncertain) ctx.fill();
    else ctx.stroke();
    ctx.setLineDash([]);
    if (uncertain) {
      ctx.font = "bold 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", s.x, s.y + 0.5);
    }
    if (e.uniqueness?.verdict === "unbounded") drawBadge(ctx, s.x + r + BADGE_RADIUS + 2, s.y - r - 2, color);
  }
}
