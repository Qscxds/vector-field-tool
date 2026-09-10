/**
 * The "Initial value" row of the web shell: two typed numbers become the start of a kept
 * trajectory, exactly as a click would (the shell hands the point to the hook's addTrajectory).
 * Pure validation: finite decimal numbers within the link's bound (MAX_ABS_VALUE, so the start
 * round-trips through `traj`); the point may lie OUTSIDE the entered box (the fixed trajectory's
 * stop box is 20x the box, and the view can be panned to it).
 */
import type { Vec2 } from "@/lib/core/types";
import { MAX_ABS_VALUE } from "@/lib/url-state";

export type InitialValueReason = "empty" | "notANumber" | "outOfRange";

export type InitialValueResult = { ok: true; point: Vec2 } | { ok: false; reason: InitialValueReason; field: "first" | "second" };

/** Names of the two coordinates as the student reads them: (t₀, y₀) for a first-order picture, (x₀, y₀) for a planar one. */
export function initialValueNames(variables: "xy" | "ty"): { first: string; second: string } {
  return variables === "ty" ? { first: "t₀", second: "y₀" } : { first: "x₀", second: "y₀" };
}

function parseOne(text: string): { value: number } | { reason: InitialValueReason } {
  const trimmed = text.trim();
  if (trimmed === "") return { reason: "empty" };
  // Number() accepts what a student types ("-1", "0.5", ".5", "1e-3"); "1,5", "1/2" and "pi" are
  // not numbers here (the expression syntax is for the equation, not the initial value).
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { reason: "notANumber" };
  if (Math.abs(value) > MAX_ABS_VALUE) return { reason: "outOfRange" };
  return { value };
}

/** The point (first, second) = (horizontal, y), or the first field that fails and why. */
export function parseInitialValue(first: string, second: string): InitialValueResult {
  const a = parseOne(first);
  if ("reason" in a) return { ok: false, reason: a.reason, field: "first" };
  const b = parseOne(second);
  if ("reason" in b) return { ok: false, reason: b.reason, field: "second" };
  return { ok: true, point: { x: a.value, y: b.value } };
}
