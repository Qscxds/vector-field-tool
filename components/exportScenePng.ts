/**
 * Renders a Scene to a PNG Blob at 2x: the same drawScene as the screen (so the file is the
 * picture the student sees), then a white footer strip with one line of 12 px text (at 1x)
 * built by lib/export-footer. Browser only (an offscreen <canvas>); cannot run under vitest.
 * The time-series view (round Q) exports the same way through exportTimeSeriesPng.
 */
import type { ArrowMode } from "@/lib/render/arrows";
import type { Viewport } from "@/lib/render/viewport";
import type { Scene } from "@/lib/scene";
import { drawScene } from "./drawScene";
import { drawTimeSeries, type TimeSeriesDrawing } from "./drawTimeSeries";

export const FOOTER_HEIGHT = 22;
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
};

export function exportScenePng({ scene, viewport, arrowMode, footer, scale = 2, lecture = false }: ExportScenePngInput): Promise<Blob> {
  return renderPng(viewport, footer, scale, (ctx, width, height) => drawScene(ctx, scene, viewport, { width, height }, { arrowMode, lecture }));
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

/** The time-series picture on screen (the same drawTimeSeries), with the footer strip. */
export function exportTimeSeriesPng({ viewport, drawing, footer, scale = 2, lecture = false }: ExportTimeSeriesPngInput): Promise<Blob> {
  return renderPng(viewport, footer, scale, (ctx) => drawTimeSeries(ctx, viewport, drawing, { lecture }));
}

function renderPng(viewport: Viewport, footer: string, scale: number, draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void): Promise<Blob> {
  const { width, height } = viewport;
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
