"use client";

/**
 * Draws a Scene (field arrows, trajectories, equilibria, first-order equilibrium lines) on a
 * canvas. Data in, pixels out: this component never calls lib/core and does not know whether it
 * lives in the web shell or in the MCP widget.
 */
import { useEffect, useRef, type MouseEvent } from "react";
import type { Equilibrium } from "@/lib/core/equilibria";
import type { Vec2 } from "@/lib/core/types";
import { arrowPolygon, scaleArrows, type ArrowMode } from "@/lib/render/arrows";
import { chooseTicks } from "@/lib/render/ticks";
import { screenToWorld, worldToScreen, type Viewport } from "@/lib/render/viewport";
import type { Scene } from "@/lib/scene";

export type VectorFieldCanvasProps = {
  scene: Scene;
  width?: number;
  height?: number;
  arrowMode?: ArrowMode;
  /** Called with the world coordinates of a click. */
  onClickWorld?: (p: Vec2) => void;
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
};

const STABLE: ReadonlySet<Equilibrium["classification"]> = new Set(["stable_node", "stable_spiral"]);
const UNSTABLE: ReadonlySet<Equilibrium["classification"]> = new Set(["unstable_node", "unstable_spiral"]);

export function VectorFieldCanvas({ scene, width = 640, height = 480, arrowMode = "unit", onClickWorld, className }: VectorFieldCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, scene, { width, height }, arrowMode);
  }, [scene, width, height, arrowMode]);

  const handleClick = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!onClickWorld || !scene.box) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const v: Viewport = { box: scene.box, width, height };
    onClickWorld(screenToWorld(v, { x: event.clientX - rect.left, y: event.clientY - rect.top }));
  };

  return (
    <canvas
      ref={ref}
      className={className}
      onClick={handleClick}
      style={{ display: "block", cursor: onClickWorld ? "crosshair" : "default", borderRadius: 6, border: "1px solid #e5e7eb" }}
      role="img"
      aria-label="Phase portrait"
    />
  );
}

function draw(ctx: CanvasRenderingContext2D, scene: Scene, size: { width: number; height: number }, arrowMode: ArrowMode): void {
  const { width, height } = size;
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);
  if (!scene.box) {
    ctx.fillStyle = COLORS.label;
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(scene.kind === "ping" ? `ping: ${scene.message ?? ""}` : "nothing to draw", 12, 24);
    return;
  }
  const v: Viewport = { box: scene.box, width, height };

  drawGrid(ctx, v);
  if (scene.field) drawArrows(ctx, v, scene, arrowMode);
  if (scene.firstOrder) drawFirstOrderLines(ctx, v, scene);
  if (scene.trajectories) drawTrajectories(ctx, v, scene);
  if (scene.equilibria) drawEquilibria(ctx, v, scene.equilibria);
  if (scene.firstOrder?.singularities?.length) drawSingularities(ctx, v, scene.firstOrder.singularities);
}

/** Direction-field singularities (M = N = 0): an orange ring with a dot, "no direction here". */
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

function drawGrid(ctx: CanvasRenderingContext2D, v: Viewport): void {
  const xTicks = chooseTicks(v.box.x, 8);
  const yTicks = chooseTicks(v.box.y, 6);
  ctx.lineWidth = 1;
  ctx.font = "11px system-ui, sans-serif";
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
    ctx.beginPath();
    t.points.forEach((p, i) => {
      const s = worldToScreen(v, p);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();
  }
  if (scene.start) {
    const s = worldToScreen(v, scene.start);
    ctx.fillStyle = COLORS.start;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3.5, 0, 2 * Math.PI);
    ctx.fill();
  }
}

function drawFirstOrderLines(ctx: CanvasRenderingContext2D, v: Viewport, scene: Scene): void {
  for (const sol of scene.firstOrder?.solutions ?? []) {
    const s = worldToScreen(v, { x: v.box.x.min, y: sol.y });
    ctx.lineWidth = 2;
    ctx.strokeStyle = sol.stability === "stable" ? COLORS.stable : sol.stability === "unstable" ? COLORS.unstable : COLORS.backward;
    ctx.setLineDash(sol.stability === "stable" ? [] : sol.stability === "unstable" ? [8, 5] : [2, 4]);
    ctx.beginPath();
    ctx.moveTo(0, s.y);
    ctx.lineTo(v.width, s.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(`y = ${Number(sol.y.toFixed(4))} (${sol.stability})`, v.width - 6, s.y - 3);
  }
}

/**
 * Markers: saddle = cross; stable = filled circle; unstable = hollow circle;
 * centre-or-weak-spiral / non-hyperbolic = dashed circle with a question mark (the analysis has a caveat).
 */
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
  }
}
