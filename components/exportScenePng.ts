/**
 * Renders a Scene to a PNG Blob at 2x: the same drawScene as the screen (so the file is the
 * picture the student sees), then a white footer strip with one line of 12 px text (at 1x)
 * built by lib/export-footer. Browser only (an offscreen <canvas>); cannot run under vitest.
 */
import type { ArrowMode } from "@/lib/render/arrows";
import type { Viewport } from "@/lib/render/viewport";
import type { Scene } from "@/lib/scene";
import { drawScene } from "./drawScene";

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
};

export function exportScenePng({ scene, viewport, arrowMode, footer, scale = 2 }: ExportScenePngInput): Promise<Blob> {
  const { width, height } = viewport;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round((height + FOOTER_HEIGHT) * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("2d context unavailable"));
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  drawScene(ctx, scene, viewport, { width, height }, { arrowMode });
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
