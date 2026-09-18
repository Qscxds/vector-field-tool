/**
 * The one-line footer of an exported PNG and the file name it is saved under (pure: no DOM, no
 * canvas). The footer says what the picture shows so a screenshot pasted into homework still
 * carries its equation, its displayed range and where it came from:
 *   "dy/dt = y*(1 - y) · t ∈ [0, 6], y ∈ [-0.5, 2] · https://example.org"
 * (an equation with symbolic parameters is followed by their values: "dy/dt = k*y with k = 2", round T)
 * and, for a time-dependent field, the snapshot instant ("t = 0") after the range. When the
 * entered range differs from what the viewport shows (equal-scale margin, zoom, pan) BOTH are
 * printed, labelled: "entered t ∈ [0, 6], y ∈ [-0.5, 2] · shown t ∈ [-0.3, 6.3], y ∈ [-0.5, 2]".
 */
import { coordinateNames } from "@/lib/coordinate-names";
import type { Box } from "@/lib/core/types";
import { fill, labels, withSceneParams, type Locale } from "@/lib/labels";
import type { Viewport } from "@/lib/render/viewport";
import type { Scene } from "@/lib/scene";

/** Separator between the footer's parts (not a sentence: the same in both languages). */
export const FOOTER_SEPARATOR = " · ";

/** A number with `digits` significant digits, trailing zeros removed and no exponent below 1e21 ("6", "-0.5", "1230", "0.000123"). */
export function formatSignificant(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return String(v);
  if (v === 0) return "0";
  return String(Number(v.toPrecision(digits)));
}

/** The equation the Scene shows, in the professor's notation, or "" for a scene without one. */
export function sceneEquationText(scene: Scene, locale: Locale): string {
  if (scene.firstOrder?.expr) return scene.firstOrder.expr;
  const firstOrder = scene.firstOrderSpec ?? scene.firstOrder?.spec;
  if (firstOrder) return firstOrder.kind === "explicit" ? `dy/dt = ${firstOrder.g}` : `(${firstOrder.M}) dt + (${firstOrder.N}) dy = 0`;
  if (scene.secondOrder) return scene.secondOrder.equation;
  if (scene.system) return fill(labels(locale).ui.equationSystem, { f: scene.system.f, g: scene.system.g });
  return "";
}

/**
 * Footer text: equation · range (3 significant digits; plus "t = t0" when time-dependent) · origin.
 * The range is the viewport's; when the ENTERED range (`enteredBox`, else the scene's featuresBox
 * or box) differs from it, both are printed, labelled "entered" and "shown".
 */
export function exportFooterText(scene: Scene, viewport: Viewport, locale: Locale, origin: string, enteredBox?: Box): string {
  const L = labels(locale);
  // (t, y) on a first-order picture, (x, y) on a planar one, (x, x') on a second-order one.
  const { hv, vv } = coordinateNames(scene);
  const parts: string[] = [];
  const equation = sceneEquationText(scene, locale);
  // Round T: the parameter values are part of where the picture came from ("… with k = 0.8, L = 2").
  if (equation) parts.push(withSceneParams(L, equation, scene));
  const range = (box: Box) =>
    fill(L.ui.exportRange, {
      hv,
      vv,
      xMin: formatSignificant(box.x.min),
      xMax: formatSignificant(box.x.max),
      yMin: formatSignificant(box.y.min),
      yMax: formatSignificant(box.y.max),
    });
  const shown = range(viewport.box);
  const entered = enteredBox ?? scene.featuresBox ?? scene.box;
  const enteredText = entered ? range(entered) : shown;
  if (enteredText === shown) parts.push(shown);
  else parts.push(fill(L.ui.exportEntered, { range: enteredText }), fill(L.ui.exportShown, { range: shown }));
  if (scene.timeDependent) parts.push(fill(L.ui.exportSnapshot, { t: formatSignificant(scene.timeDependent.snapshotT, 4) }));
  if (origin) parts.push(origin);
  return parts.join(FOOTER_SEPARATOR);
}

/**
 * Footer of an exported time-series picture (round Q): equation · the t range and the value range
 * of the drawn components ("t ∈ [0, 20], x, x' ∈ [-3, 3]") · the start instant when the equation
 * is non-autonomous · origin. `names` lists the drawn components in the student's notation.
 */
export function exportTimeSeriesFooterText(scene: Scene, box: Box, names: string, locale: Locale, origin: string): string {
  const L = labels(locale);
  const parts: string[] = [];
  const equation = sceneEquationText(scene, locale);
  // Round T: the parameter values are part of where the picture came from ("… with k = 0.8, L = 2").
  if (equation) parts.push(withSceneParams(L, equation, scene));
  parts.push(
    fill(L.ui.exportTimeRange, {
      tMin: formatSignificant(box.x.min),
      tMax: formatSignificant(box.x.max),
      names,
      vMin: formatSignificant(box.y.min),
      vMax: formatSignificant(box.y.max),
    }),
  );
  if (scene.timeDependent) parts.push(fill(L.ui.exportSnapshot, { t: formatSignificant(scene.timeDependent.snapshotT, 4) }));
  if (origin) parts.push(origin);
  return parts.join(FOOTER_SEPARATOR);
}

/** "vector-field-<tag>-<yyyymmdd-hhmmss>.png" in local time; the tag is a preset id or a mode, made file-safe. */
export function exportFileName(tag: string, now: Date): string {
  const safe = tag.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "scene";
  const two = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
  return `vector-field-${safe}-${stamp}.png`;
}
