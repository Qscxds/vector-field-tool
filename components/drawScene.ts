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
import { formatNumber, labels, pictureModeOf } from "@/lib/labels";
import { constantSolutionTag } from "@/lib/lecture";
import { nullclineNames, type EigenDirection, type PhaseAids, type Separatrix } from "@/lib/phase-aids";
import { worldToScreen, type Viewport } from "@/lib/render/viewport";
import type { Scene } from "@/lib/scene";

/**
 * `lecture` (round W): the picture as projected in class. The text on the canvas is larger, and the
 * numeric labels beside markers are left out (a query hit's coordinates, a constant solution's
 * value); every MARKER stays, the "!" of a point or line where uniqueness fails included, and so
 * do the axes and their ticks.
 */
export type DrawSceneOptions = { arrowMode: ArrowMode; lecture?: boolean };

/** Canvas fonts: the normal sizes, or the lecture-mode ones. */
type Fonts = { tick: string; tickSize: number; axisName: string; small: string; badge: string };
const FONTS: Fonts = { tick: "11px system-ui, sans-serif", tickSize: 11, axisName: "italic 13px 'Times New Roman', Times, serif", small: "11px system-ui, sans-serif", badge: "bold 11px system-ui, sans-serif" };
const LECTURE_FONTS: Fonts = { tick: "15px system-ui, sans-serif", tickSize: 15, axisName: "italic 19px 'Times New Roman', Times, serif", small: "15px system-ui, sans-serif", badge: "bold 12px system-ui, sans-serif" };

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
  // Round V overlays. The two nullcline families and the two kinds of direction / branch differ by
  // LINE STYLE (solid / dashed), never by hue alone.
  nullclineF: "#0f766e",
  nullclineG: "#b45309",
  aid: "#111827",
};

/** Round V line styles: the second nullcline family and everything "unstable" is dashed. */
const NULLCLINE_G_DASH = [7, 4];
const UNSTABLE_DASH = [9, 5];
/** Half-length of an eigen-direction line, as a fraction of the canvas's shorter side (the same on screen at every zoom). */
const EIGEN_HALF_LENGTH = 0.11;

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
  const { arrowMode, lecture = false } = options;
  const fonts = lecture ? LECTURE_FONTS : FONTS;
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);
  if (!v) {
    ctx.fillStyle = COLORS.label;
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(scene.kind === "ping" ? `ping: ${scene.message ?? ""}` : "nothing to draw", 12, 24);
    return;
  }
  drawGrid(ctx, v, fonts);
  if (scene.field) drawArrows(ctx, v, scene, arrowMode);
  // Round V: nullclines under everything that is a solution; separatrices under the kept curves;
  // eigen-directions under the equilibrium's own marker.
  if (scene.aids?.nullclines) drawNullclines(ctx, v, scene.aids.nullclines);
  if (scene.firstOrder?.implicit) drawImplicit(ctx, v, scene.firstOrder.implicit.levels);
  if (scene.firstOrder) drawFirstOrderLines(ctx, v, scene, lecture, fonts);
  if (scene.aids?.separatrices) drawSeparatrices(ctx, v, scene.aids.separatrices);
  if (scene.trajectories) drawTrajectories(ctx, v, scene, lecture, fonts);
  if (scene.aids?.eigenDirections) drawEigenDirections(ctx, v, scene.aids.eigenDirections);
  if (scene.equilibria) drawEquilibria(ctx, v, scene.equilibria);
  if (scene.firstOrder?.singularities?.length) drawSingularities(ctx, v, scene.firstOrder.singularities);
  // Last, so the names stay legible over the field. Data-driven (lib/coordinate-names): a
  // first-order scene calls its horizontal coordinate t, a planar system x; the vertical one is y,
  // or x' (the velocity) on a second-order scene.
  const names = coordinateNames(scene);
  drawAxisNames(ctx, v, names.hv, names.vv, fonts);
  // Data-driven: a non-autonomous scene says which instant the field was sampled at.
  if (scene.timeDependent) drawSnapshotTime(ctx, v, scene.timeDependent.snapshotT, fonts);
  if (scene.aids) drawAidsLegend(ctx, v, scene, scene.aids, fonts);
}

function strokeSegments(ctx: CanvasRenderingContext2D, v: Viewport, segments: readonly [Vec2, Vec2][]): void {
  ctx.beginPath();
  for (const [a, b] of segments) {
    const sa = worldToScreen(v, a);
    const sb = worldToScreen(v, b);
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
  }
  ctx.stroke();
}

/** f = 0 solid, g = 0 dashed, in two colors: where they cross is where the equilibria are. */
function drawNullclines(ctx: CanvasRenderingContext2D, v: Viewport, n: NonNullable<PhaseAids["nullclines"]>): void {
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.setLineDash([]);
  ctx.strokeStyle = COLORS.nullclineF;
  strokeSegments(ctx, v, n.f);
  ctx.setLineDash(NULLCLINE_G_DASH);
  ctx.strokeStyle = COLORS.nullclineG;
  strokeSegments(ctx, v, n.g);
  ctx.setLineDash([]);
  ctx.lineCap = "butt";
}

/** The branches of a saddle's manifolds: bold and dark, the stable ones solid, the unstable ones dashed. */
function drawSeparatrices(ctx: CanvasRenderingContext2D, v: Viewport, branches: readonly Separatrix[]): void {
  ctx.lineWidth = 2.6;
  ctx.lineJoin = "round";
  ctx.strokeStyle = COLORS.aid;
  for (const b of branches) {
    if (b.points.length < 2) continue;
    ctx.setLineDash(b.kind === "unstable" ? UNSTABLE_DASH : []);
    ctx.beginPath();
    b.points.forEach((p, i) => {
      const s = worldToScreen(v, p);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

/**
 * A short line through the equilibrium along each eigen-direction, the same length on screen at
 * every zoom; stable ones solid with arrow heads pointing IN, unstable ones dashed with heads
 * pointing OUT (so the two read without color, and without the legend).
 */
function drawEigenDirections(ctx: CanvasRenderingContext2D, v: Viewport, directions: readonly EigenDirection[]): void {
  const half = EIGEN_HALF_LENGTH * Math.min(v.width, v.height);
  ctx.strokeStyle = COLORS.aid;
  ctx.fillStyle = COLORS.aid;
  ctx.lineWidth = 2;
  for (const d of directions) {
    const c = worldToScreen(v, d.at);
    const tip = worldToScreen(v, { x: d.at.x + d.direction.x, y: d.at.y + d.direction.y });
    const len = Math.hypot(tip.x - c.x, tip.y - c.y);
    if (!(len > 0) || !Number.isFinite(len)) continue;
    const ux = (tip.x - c.x) / len;
    const uy = (tip.y - c.y) / len;
    ctx.setLineDash(d.kind === "unstable" ? UNSTABLE_DASH : []);
    ctx.beginPath();
    ctx.moveTo(c.x - half * ux, c.y - half * uy);
    ctx.lineTo(c.x + half * ux, c.y + half * uy);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const side of [1, -1]) {
      const outer = { x: c.x + side * half * ux, y: c.y + side * half * uy };
      const inner = { x: c.x + side * half * 0.55 * ux, y: c.y + side * half * 0.55 * uy };
      const head = d.kind === "unstable" ? arrowPolygon(inner, outer, 7) : arrowPolygon(outer, inner, 7);
      if (head.length !== 3) continue;
      ctx.beginPath();
      ctx.moveTo(head[0].x, head[0].y);
      ctx.lineTo(head[1].x, head[1].y);
      ctx.lineTo(head[2].x, head[2].y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

/** The legend of the overlays that are on (top right, under the snapshot time): a line sample and its name. */
function drawAidsLegend(ctx: CanvasRenderingContext2D, v: Viewport, scene: Scene, aids: PhaseAids, fonts: Fonts): void {
  const L = labels(scene.locale ?? "en");
  const mode = pictureModeOf(scene);
  const firstOrder = scene.firstOrderSpec ?? scene.firstOrder?.spec;
  const names = nullclineNames(mode === "first" ? (firstOrder?.kind === "differential" ? "differential" : "explicit") : mode);
  const entries: { text: string; color: string; dash: number[]; width: number }[] = [];
  if (aids.nullclines) {
    if (names.f) entries.push({ text: names.f, color: COLORS.nullclineF, dash: [], width: 1.8 });
    entries.push({ text: names.g, color: COLORS.nullclineG, dash: NULLCLINE_G_DASH, width: 1.8 });
  }
  if (aids.eigenDirections?.some((d) => d.kind === "stable")) entries.push({ text: L.ui.legendStableDirection, color: COLORS.aid, dash: [], width: 2 });
  if (aids.eigenDirections?.some((d) => d.kind === "unstable")) entries.push({ text: L.ui.legendUnstableDirection, color: COLORS.aid, dash: UNSTABLE_DASH, width: 2 });
  if (aids.separatrices?.some((b) => b.kind === "stable")) entries.push({ text: L.ui.legendSeparatrixStable, color: COLORS.aid, dash: [], width: 2.6 });
  if (aids.separatrices?.some((b) => b.kind === "unstable")) entries.push({ text: L.ui.legendSeparatrixUnstable, color: COLORS.aid, dash: UNSTABLE_DASH, width: 2.6 });
  if (entries.length === 0) return;
  ctx.font = fonts.tick;
  const sample = 30;
  const row = fonts.tickSize + 4;
  const textWidth = entries.reduce((w, e) => Math.max(w, ctx.measureText(e.text).width), 0);
  const boxW = sample + 8 + textWidth + 12;
  const boxH = entries.length * row + 8;
  const x0 = v.width - boxW - 6;
  const y0 = scene.timeDependent ? fonts.tickSize + 15 : 6;
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.fillRect(x0, y0, boxW, boxH);
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, boxW - 1, boxH - 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  entries.forEach((e, i) => {
    const y = y0 + 4 + row * i + row / 2;
    ctx.strokeStyle = e.color;
    ctx.lineWidth = e.width;
    ctx.setLineDash(e.dash);
    ctx.beginPath();
    ctx.moveTo(x0 + 6, y);
    ctx.lineTo(x0 + 6 + sample, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.axis;
    ctx.fillText(e.text, x0 + 6 + sample + 8, y);
  });
}

/** "t = 1.5" in the top-right corner: the picture is a snapshot of a field that changes with t. */
function drawSnapshotTime(ctx: CanvasRenderingContext2D, v: Viewport, t: number, fonts: Fonts): void {
  ctx.font = fonts.axisName;
  ctx.lineWidth = 3;
  ctx.strokeStyle = COLORS.background;
  ctx.fillStyle = COLORS.axis;
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  const text = `t = ${formatNumber(t, 4)}`;
  ctx.strokeText(text, v.width - 8, 6);
  ctx.fillText(text, v.width - 8, 6);
}

function drawGrid(ctx: CanvasRenderingContext2D, v: Viewport, fonts: Fonts): void {
  const xTicks = chooseTicks(v.box.x, 8);
  const yTicks = chooseTicks(v.box.y, 6);
  ctx.lineWidth = 1;
  ctx.font = fonts.tick;
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

function drawAxisNames(ctx: CanvasRenderingContext2D, v: Viewport, horizontal: string, vertical: string, fonts: Fonts): void {
  ctx.font = fonts.tick;
  const tickColumnWidth = chooseTicks(v.box.y, 6).reduce((w, y) => Math.max(w, ctx.measureText(String(y)).width), 0);
  const anchors = axisNameAnchors(v, { tickColumnWidth, tickRowHeight: fonts.tickSize });
  ctx.font = fonts.axisName;
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

function drawTrajectories(ctx: CanvasRenderingContext2D, v: Viewport, scene: Scene, lecture: boolean, fonts: Fonts): void {
  ctx.lineWidth = 1.8;
  ctx.lineJoin = "round";
  // A differential form M dt + N dy = 0 (undirected segments) has no forward or backward: its kept
  // curve is one color on both sides of the start (round P2.1), never a directed two-color curve.
  const undirected = scene.fieldStyle === "segments";
  for (const t of scene.trajectories ?? []) {
    if (t.points.length < 2) continue;
    ctx.strokeStyle = !undirected && t.direction === "backward" ? COLORS.backward : COLORS.forward;
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
  // Lecture mode keeps the marker and leaves its coordinates out.
  for (const hit of scene.query?.hits ?? []) drawQueryHit(ctx, v, hit, lecture, fonts);
}

const QUERY_HIT_RADIUS = 6;

function drawQueryHit(ctx: CanvasRenderingContext2D, v: Viewport, hit: Vec2, lecture: boolean, fonts: Fonts): void {
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
  if (lecture) return;
  const text = `(${formatNumber(hit.x, 4)}, ${formatNumber(hit.y, 4)})`;
  ctx.font = fonts.small;
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

function drawFirstOrderLines(ctx: CanvasRenderingContext2D, v: Viewport, scene: Scene, lecture: boolean, fonts: Fonts): void {
  const L = labels(scene.locale ?? "en");
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
    ctx.font = fonts.small;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    // The tag is a short label in the scene's language (never the internal key); lecture mode leaves
    // the value out and keeps the stability and the "!" (lib/lecture constantSolutionTag, tested).
    ctx.fillText(constantSolutionTag(L, sol, lecture), v.width - 6, s.y - (nonUnique ? 6 : 3));
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
