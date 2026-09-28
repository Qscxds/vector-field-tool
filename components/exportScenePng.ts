/**
 * Renders a Scene to a PNG Blob at 2x: the same drawScene as the screen (so the file is the
 * picture the student sees), then a white footer strip with one line of 12 px text (at 1x)
 * built by lib/export-footer. Browser only (an offscreen <canvas>); cannot run under vitest.
 * The solution graph (round Q) exports the same way through exportTimeSeriesPng, and the "both"
 * view (round Z2.5) exports the two pictures side by side through exportDualPng.
 */
import type { Vec2 } from "@/lib/core/types";
import type { ArrowMode } from "@/lib/render/arrows";
import type { Viewport } from "@/lib/render/viewport";
import type { Scene } from "@/lib/scene";
import { drawScene, type DrawSceneOptions } from "./drawScene";
import { drawTimeSeries, type TimeSeriesDrawing } from "./drawTimeSeries";

export const FOOTER_HEIGHT = 22;
/** Round Z2.5: the white gap between the two pictures of a "both" export. */
export const DUAL_GAP = 16;
const FOOTER_FONT = "12px system-ui, sans-serif";
const FOOTER_COLOR = "#374151";

export type ExportScenePngInput = {
  scene: Scene;
  viewport: Viewport;
  arrowMode: ArrowMode;
  /** One line of text under the picture (lib/export-footer exportFooterText). */
  footer: string;
  /** Device-pixel scale of the file; 2 gives a crisp picture on high-density screens and in print. */
  scale?: number;
  /** Round W: the file follows the mode on screen (a clean picture in lecture mode); the footer keeps the equation, the parameter values and the range: provenance, not clutter. */
  lecture?: boolean;
  /** Round Z2.4: the web shell's per-curve colors and start markers (drawScene options), so the file is the picture on screen. */
  trajectoryColors?: DrawSceneOptions["trajectoryColors"];
  starts?: DrawSceneOptions["starts"];
};

export function exportScenePng({ scene, viewport, arrowMode, footer, scale = 2, lecture = false, trajectoryColors, starts }: ExportScenePngInput): Promise<Blob> {
  return renderPng(viewport, footer, scale, (ctx, width, height) => drawScene(ctx, scene, viewport, { width, height }, { arrowMode, lecture, trajectoryColors, starts }));
}

export type ExportTimeSeriesPngInput = {
  viewport: Viewport;
  drawing: TimeSeriesDrawing;
  /** One line of text under the picture (lib/export-footer exportTimeSeriesFooterText). */
  footer: string;
  scale?: number;
  /** Round W: the file follows the mode on screen. */
  lecture?: boolean;
};

/** The solution graph on screen (the same drawTimeSeries), with the footer strip. */
export function exportTimeSeriesPng({ viewport, drawing, footer, scale = 2, lecture = false }: ExportTimeSeriesPngInput): Promise<Blob> {
  return renderPng(viewport, footer, scale, (ctx) => drawTimeSeries(ctx, viewport, drawing, { lecture }));
}

export type ExportDualPngInput = ExportScenePngInput & {
  /** The solution graph as drawn on screen, placed to the right of the phase plane. */
  graph: { viewport: Viewport; drawing: TimeSeriesDrawing };
};

/**
 * Round Z2.5: the "both" view as one file, the phase plane on the left and the solution graph on
 * the right (each at its own on-screen size, a white gap between them), the footer under both.
 */
export function exportDualPng({ scene, viewport, arrowMode, footer, scale = 2, lecture = false, trajectoryColors, starts, graph }: ExportDualPngInput): Promise<Blob> {
  const size = { width: viewport.width + DUAL_GAP + graph.viewport.width, height: Math.max(viewport.height, graph.viewport.height) };
  return renderPng(size, footer, scale, (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, viewport.width, viewport.height);
    ctx.clip();
    drawScene(ctx, scene, viewport, { width: viewport.width, height: viewport.height }, { arrowMode, lecture, trajectoryColors, starts });
    ctx.restore();
    ctx.save();
    ctx.translate(viewport.width + DUAL_GAP, 0);
    ctx.beginPath();
    ctx.rect(0, 0, graph.viewport.width, graph.viewport.height);
    ctx.clip();
    drawTimeSeries(ctx, graph.viewport, graph.drawing, { lecture });
    ctx.restore();
  });
}

function renderPng(size: { width: number; height: number }, footer: string, scale: number, draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void): Promise<Blob> {
  const { width, height } = size;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round((height + FOOTER_HEIGHT) * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("2d context unavailable"));
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  draw(ctx, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, height, width, FOOTER_HEIGHT);
  ctx.fillStyle = FOOTER_COLOR;
  ctx.font = FOOTER_FONT;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(footer, 8, height + FOOTER_HEIGHT / 2, width - 16);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob returned null"))), "image/png");
  });
}

/** Re-exported for callers that build start markers (the web shell). */
export type StartMarker = { at: Vec2; color: string };
