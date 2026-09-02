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
