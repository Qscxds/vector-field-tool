/**
 * The web shell's solution-query panel, pure part: which constraint kinds a picture offers, the
 * mapping of the student's kind to the kernel's (lib/core/query), the target value's validation,
 * and the text of one hit with the numbers ROUNDED TO THE ERROR ESTIMATE (2 significant digits
 * of the error; the hit's coordinates to the error's last decimal), so a student never reads
 * digits the estimate does not support. No React, no DOM.
 *
 * Student's kind -> kernel kind: on a first-order picture (variables "ty") the student's t is the
 * horizontal coordinate of the reduced planar system, so "t =" is the kernel's coordinate kind
 * "x" and there is no time kind at all ("x =" is not offered and rejected here); on a planar
 * picture "t =" is the kernel's absolute time and "x =", "y =" are the coordinates. A
 * second-order picture (variables "second") is a planar one whose second coordinate is x': the
 * kind is still the kernel's "y", but the student reads and types it as x' (round P).
 */
import { timeUncertainty, type QueryHit, type QueryKind } from "./core/query";
import type { Vec2 } from "./core/types";
import { parseDecimal, type InitialValueReason } from "./initial-value";
import { fill, formatNumber, type LabelTable } from "./labels";

export type UiQueryKind = "t" | "x" | "y";
export type PanelVariables = "xy" | "ty" | "second";

/** The constraint kinds the panel offers, in display order (the kind "y" of a second-order picture is shown as x'). */
export function queryKindsFor(variables: PanelVariables): UiQueryKind[] {
  return variables === "ty" ? ["t", "y"] : ["t", "x", "y"];
}

/** The name the student sees for a kind: the kind itself, except the velocity x' of a second-order picture. */
export function queryKindName(variables: PanelVariables, kind: UiQueryKind): string {
  return variables === "second" && kind === "y" ? "x'" : kind;
}

/** The kernel's kind for the student's; throws RangeError for "x" on a first-order picture (not offered). */
export function kernelQueryKind(variables: PanelVariables, kind: UiQueryKind): QueryKind {
  if (variables === "ty") {
    if (kind === "x") throw new RangeError("A first-order picture has the coordinates t and y; there is no x.");
    return kind === "t" ? "x" : "y";
  }
  return kind === "t" ? "time" : kind;
}

export type QueryValueResult = { ok: true; value: number } | { ok: false; reason: InitialValueReason };

/** The typed target value: the same rule as an initial value (finite decimal within MAX_ABS_VALUE). */
export function parseQueryValue(text: string): QueryValueResult {
  const r = parseDecimal(text);
  return "reason" in r ? { ok: false, reason: r.reason } : { ok: true, value: r.value };
}

/** Most decimals a value is printed with (toFixed's practical limit for double precision). */
const MAX_DECIMALS = 15;

/**
 * The error estimate at 2 significant digits and the decimals its last digit occupies: 0.00123 ->
 * "0.0012" and 4; 12.3 -> "12" and 0; 0.5 -> "0.50" and 2; 2.3e-7 -> "2.3e-7" and 8. Below 1e-3
 * the error is printed in exponent form (as formatNumber does); a zero or non-finite error gives
 * "0" and a fallback of 6 decimals (the estimate says nothing about the digits then).
 */
export function errorDigits(error: number): { text: string; decimals: number } {
  const e = Math.abs(error);
  if (!(e > 0) || !Number.isFinite(e)) return { text: "0", decimals: 6 };
  const e2 = Number(e.toPrecision(2));
  // A tiny nudge so exact powers of ten (0.1, 0.001) land on their own exponent.
  const exponent = Math.floor(Math.log10(e2) + 1e-12);
  const decimals = Math.min(MAX_DECIMALS, Math.max(0, 1 - exponent));
  const text = e2 >= 1e-3 && e2 < 1e6 ? e2.toFixed(decimals) : e2.toExponential(1);
  return { text, decimals };
}

/** `value` rounded to the last decimal of the 2-significant-digit error (see errorDigits). */
export function roundToError(value: number, error: number): string {
  if (!Number.isFinite(value)) return String(value);
  const { decimals } = errorDigits(error);
  const fixed = value.toFixed(decimals);
  // "-0.00" is 0 at this precision.
  return /^-0(\.0*)?$/.test(fixed) ? fixed.slice(1) : fixed;
}

/**
 * One hit as the student reads it. First-order picture: "t = <x>, y = <y> (±<position>)" (the
 * hit's horizontal coordinate IS t); planar: "t = <t>, x = <x>, y = <y> (±<position>)";
 * second order: "t = <t>, x = <x>, x' = <y> (±<position>)". The time carries its own bracket
 * " (±<t error>)" when it is not exact (a coordinate crossing); a time target lands on t exactly
 * and shows none. Coordinates are rounded to the position error, the time to its DISPLAYED
 * uncertainty (lib/core/query timeUncertainty: at least the position error over the speed, never
 * the bare Brent bracket).
 */
export function queryHitText(hit: QueryHit, variables: PanelVariables, L: LabelTable): string {
  const position = errorDigits(hit.error.position);
  const x = roundToError(hit.x, hit.error.position);
  const y = roundToError(hit.y, hit.error.position);
  if (variables === "ty") return fill(L.ui.queryHitFirst, { t: x, y, error: position.text });
  const tUncertainty = timeUncertainty(hit);
  const tError = errorDigits(tUncertainty);
  const t = tUncertainty > 0 ? `${roundToError(hit.t, tUncertainty)}${fill(L.ui.queryTimeError, { error: tError.text })}` : roundToError(hit.t, hit.error.position);
  return fill(variables === "second" ? L.ui.queryHitSecond : L.ui.queryHitSystem, { t, x, y, error: position.text });
}

/** The option text of a kept trajectory in the panel's <select>: its start point. */
export function trajectoryOptionText(start: Vec2): string {
  return `(${formatNumber(start.x, 4)}, ${formatNumber(start.y, 4)})`;
}

/**
 * Which kept trajectory the panel means: the one the student picked while it still exists and
 * nothing was added since (`count` is the number of starts when it was picked), else the most
 * recently added one; null with no trajectories. A deletion elsewhere keeps the pick (its start
 * is still there); an add selects the new curve.
 */
export function selectedTrajectoryIndex(starts: ReadonlyArray<Vec2>, pick: { start: Vec2; count: number } | null): number | null {
  if (starts.length === 0) return null;
  if (pick && starts.length <= pick.count) {
    const i = starts.findIndex((s) => s.x === pick.start.x && s.y === pick.start.y);
    if (i >= 0) return i;
  }
  return starts.length - 1;
}
