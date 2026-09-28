/**
 * Colour encoding of vector magnitude: blue (slow) -> red (fast) on an HSL ramp.
 * Neutral grey for singular samples or when there is no finite magnitude to scale by.
 */
export const NEUTRAL_COLOR = "hsl(0 0% 60%)";

export function magnitudeColor(mag: number, maxMag: number): string {
  if (!Number.isFinite(mag) || !(maxMag > 0) || !Number.isFinite(maxMag)) return NEUTRAL_COLOR;
  const t = Math.min(1, Math.max(0, mag / maxMag));
  const hue = Math.round(240 * (1 - t)); // 240 = blue, 0 = red
  return `hsl(${hue} 80% 45%)`;
}

/**
 * Round Z2.4: the color of a KEPT CURVE of the web shell, by its index, the same in the phase plane
 * and in the solution graph so a reader can follow one solution across the two pictures. The first
 * two are the phase plane's former forward / backward colors; none is the green / red / violet of
 * an equilibrium marker (the test checks), the teal solid of a nullcline or the near-black of an
 * overlay. Cycles after CURVE_PALETTE.length curves (the store keeps at most 20).
 */
export const CURVE_PALETTE: readonly string[] = ["#1d4ed8", "#d97706", "#db2777", "#0891b2", "#65a30d", "#9333ea", "#a16207"];

export function curveColor(index: number): string {
  const n = CURVE_PALETTE.length;
  return CURVE_PALETTE[((Math.floor(index) % n) + n) % n];
}
