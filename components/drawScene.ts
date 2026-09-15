/**
 * The base layer of a Scene: grid, field, trajectories, equilibria, constant solutions, implicit
 * curves, axis names and the snapshot time. Pixels only: this module never calls lib/core and has
 * no React. It is shared by VectorFieldCanvas (the screen) and exportScenePng (the PNG file), so
 * the picture a student downloads is the picture on the screen.
 */
import { coordinateNames } from "@/lib/coordinate-names";
import type { Equilibrium } from "@/lib/core/equilibria";
import type { Vec2 } from "@/lib/core/types";
import { arrowPolygon, scaleArrows, type ArrowMode } from "@/lib/render/arrows";
import { axisNameAnchors } from "@/lib/render/axis-names";
import { chooseTicks } from "@/lib/render/ticks";
import { formatNumber, labels } from "@/lib/labels";
import { worldToScreen, type Viewport } from "@/lib/render/viewport";
import type { Scene } from "@/lib/scene";

export type DrawSceneOptions = { arrowMode: ArrowMode };

export const COLORS = {
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
  queryHit: "#be123c",
};

/**
 * Non-uniqueness marks, all data-driven from the Scene (uniqueness verdict "unbounded"):
 * a trajectory through such a point is dashed (it is one of infinitely many); a constant solution
 * gets a dotted companion line on each side (a double line) and a "!" badge; an equilibrium gets
 * the "!" badge beside its marker. A domain-edge constant solution has its own dash-dot pattern.
 */
export const NON_UNIQUE_DASH = [6, 4];
const NON_UNIQUE_COMPANION_DASH = [2, 3];
const NON_UNIQUE_COMPANION_OFFSET = 4;
const DOMAIN_EDGE_DASH = [10, 4, 2, 4];
const BADGE_RADIUS = 7;

const STABLE: ReadonlySet<Equilibrium["classification"]> = new Set(["stable_node", "stable_spiral"]);
const UNSTABLE: ReadonlySet<Equilibrium["classification"]> = new Set(["unstable_node", "unstable_spiral"]);

export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, v: Viewport | null, size: { width: number; height: number }, options: DrawSceneOptions): void {
  const { width, height } = size;
  const { arrowMode } = options;
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
  // Last, so the names stay legible over the field. Data-driven (lib/coordinate-names): a
  // first-order scene calls its horizontal coordinate t, a planar system x; the vertical one is y,
  // or x' (the velocity) on a second-order scene.
  const names = coordinateNames(scene);
  drawAxisNames(ctx, v, names.hv, names.vv);
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
  // query_solution: every hit of the numerical solution as a filled diamond with a white halo and
  // its coordinates beside it (data from the Scene): "(t, y)" on a first-order picture, "(x, y)"
  // on a planar one; both are the hit's horizontal coordinate and y.
  for (const hit of scene.query?.hits ?? []) drawQueryHit(ctx, v, hit);
}

const QUERY_HIT_RADIUS = 6;

function drawQueryHit(ctx: CanvasRenderingContext2D, v: Viewport, hit: Vec2): void {
  const s = worldToScreen(v, hit);
  const r = QUERY_HIT_RADIUS;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(s.x, s.y - r);
  ctx.lineTo(s.x + r, s.y);
  ctx.lineTo(s.x, s.y + r);
  ctx.lineTo(s.x - r, s.y);
  ctx.closePath();
  ctx.lineWidth = 4;
  ctx.strokeStyle = COLORS.background; // halo, so the marker reads over the curve
  ctx.stroke();
  ctx.fillStyle = COLORS.queryHit;
  ctx.fill();
  const text = `(${formatNumber(hit.x, 4)}, ${formatNumber(hit.y, 4)})`;
  ctx.font = "11px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  // Left of the marker when the label would run off the right edge.
  const width = ctx.measureText(text).width;
  const fitsRight = s.x + r + 4 + width <= v.width - 4;
  ctx.textAlign = fitsRight ? "left" : "right";
  const x = fitsRight ? s.x + r + 4 : s.x - r - 4;
  const y = Math.min(Math.max(s.y, 8), v.height - 8);
  ctx.lineWidth = 3;
  ctx.strokeStyle = COLORS.background;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = COLORS.queryHit;
  ctx.fillText(text, x, y);
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
  const { stabilityShort } = labels(scene.locale ?? "en");
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
    // The tag is a short label in the scene's language (never the internal key).
    ctx.fillText(`y = ${Number(sol.y.toFixed(4))} (${stabilityShort[sol.stability]})${nonUnique ? " !" : ""}`, v.width - 6, s.y - (nonUnique ? 6 : 3));
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
