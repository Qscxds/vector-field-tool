/**
 * Open Graph image (1200 x 630): a drawn slope field of the logistic equation dy/dt = y(1 - y)
 * (the course's first picture) with the site name and tagline. Rendered by next/og at build
 * time; no external fonts or assets (the default font of ImageResponse is used).
 */
import { ImageResponse } from "next/og";
import { SITE_TEXT } from "@/lib/site-text";

// English first (the site's default language); the Chinese name and tagline are the second lines.
export const alt = `${SITE_TEXT.en.meta.ogAlt} / ${SITE_TEXT.zh.meta.ogAlt}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Slope field geometry: the world box t in [0, 10], y in [-0.5, 1.5] mapped onto the whole image.
const T_MIN = 0, T_MAX = 10, Y_MIN = -0.5, Y_MAX = 1.5;
const COLS = 24, ROWS = 12, SEGMENT = 30;

function slopeSegments() {
  const out: { left: number; top: number; angle: number; stable: boolean }[] = [];
  const sx = size.width / (T_MAX - T_MIN), sy = size.height / (Y_MAX - Y_MIN);
  for (let i = 0; i < COLS; i++) {
    for (let j = 0; j < ROWS; j++) {
      const t = T_MIN + ((i + 0.5) / COLS) * (T_MAX - T_MIN);
      const y = Y_MIN + ((j + 0.5) / ROWS) * (Y_MAX - Y_MIN);
      const slope = y * (1 - y);
      // Screen angle: the y axis points up in the world and down on the screen; equal scale is not
      // needed for a decoration, but the sign is (dy/dt > 0 must rise to the right).
      const angle = -Math.atan2(slope * sy, sx) * (180 / Math.PI);
      out.push({ left: (t - T_MIN) * sx - SEGMENT / 2, top: (Y_MAX - y) * sy, angle, stable: y > 0.5 });
    }
  }
  return out;
}

export default function OpenGraphImage() {
  const segments = slopeSegments();
  const yOne = (Y_MAX - 1) * (size.height / (Y_MAX - Y_MIN));
  const yZero = (Y_MAX - 0) * (size.height / (Y_MAX - Y_MIN));
  return new ImageResponse(
    (
      <div style={{ width: size.width, height: size.height, display: "flex", position: "relative", background: "#ffffff", overflow: "hidden" }}>
        {segments.map((s, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: s.left,
              top: s.top,
              width: SEGMENT,
              height: 3,
              background: s.stable ? "#9db7f5" : "#c7d2fe",
              transform: `rotate(${s.angle}deg)`,
            }}
          />
        ))}
        <div style={{ position: "absolute", left: 0, top: yOne, width: size.width, height: 4, background: "#15803d" }} />
        <div style={{ position: "absolute", left: 0, top: yZero, width: size.width, height: 4, background: "#b91c1c", opacity: 0.85 }} />
        <div
          style={{
            position: "absolute",
            left: 80,
            top: 150,
            display: "flex",
            flexDirection: "column",
            padding: "36px 44px",
            background: "rgba(255,255,255,0.92)",
            border: "3px solid #1f2933",
            borderRadius: 18,
            color: "#1f2933",
          }}
        >
          <div style={{ fontSize: 64, fontWeight: 700, display: "flex" }}>{SITE_TEXT.en.site.name}</div>
          <div style={{ fontSize: 44, fontWeight: 700, display: "flex", color: "#1d4ed8" }}>{SITE_TEXT.zh.site.name}</div>
          <div style={{ fontSize: 26, marginTop: 18, display: "flex", color: "#52606d" }}>{SITE_TEXT.en.site.tagline}</div>
          <div style={{ fontSize: 24, display: "flex", color: "#52606d" }}>{SITE_TEXT.zh.site.tagline}</div>
          <div style={{ fontSize: 22, marginTop: 18, display: "flex", color: "#1f2933" }}>dy/dt = y(1 − y)</div>
        </div>
      </div>
    ),
    size,
  );
}
