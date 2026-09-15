/**
 * The student-facing names of the two coordinates of a picture (round P, the professor's rule:
 * every symbol a student sees must exist in the problem they wrote down).
 *
 * - First-order pictures (a system in variable mode "ty"): the horizontal coordinate is the
 *   student's t and the vertical one is y.
 * - Planar systems: x and y.
 * - Second-order equations x'' = F(t, x, x'): x and x' (the velocity). The kernel reduces the
 *   equation to a planar (x, y) system, but that y is an implementation detail: the student's
 *   problem has no y, so no shell, footer, axis or summary may show one.
 * Pure and React-free; both shells, the canvas base layer and the PNG footer use it.
 */
import type { Scene } from "./scene";

export type HorizontalName = "x" | "t";
export type VerticalName = "y" | "x'";
export type CoordinateNames = { hv: HorizontalName; vv: VerticalName };

/** The names for a Scene: from `system.variables` (t or x) and `secondOrder` (x' or y). */
export function coordinateNames(scene: Pick<Scene, "system" | "secondOrder">): CoordinateNames {
  return { hv: scene.system?.variables === "ty" ? "t" : "x", vv: scene.secondOrder ? "x'" : "y" };
}

/** The web shell's modes (lib/url-state AppMode). */
export type CoordinateMode = "first" | "diff" | "system" | "second";

/** The names for a mode of the web shell, before a Scene exists (range labels, range errors). */
export function coordinateNamesForMode(mode: CoordinateMode): CoordinateNames {
  return { hv: mode === "first" || mode === "diff" ? "t" : "x", vv: mode === "second" ? "x'" : "y" };
}
