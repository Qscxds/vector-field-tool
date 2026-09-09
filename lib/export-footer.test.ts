import { describe, expect, it } from "vitest";
import { compileSystem } from "./core/parse";
import { toSystem, type FirstOrderSpec } from "./core/slope-field";
import { exportFileName, exportFooterText, FOOTER_SEPARATOR, formatSignificant, sceneEquationText } from "./export-footer";
import { computeFeatures } from "./interactive";
import { fitViewport } from "./render/viewport";
import type { Scene } from "./scene";

const ORIGIN = "https://example.org";

/** The logistic preset as the web shell builds it: features from lib/interactive, the entered box, equal-scale viewport. */
function logisticScene(): { scene: Scene; viewport: ReturnType<typeof fitViewport> } {
  const spec: FirstOrderSpec = { kind: "explicit", g: "y*(1 - y)" };
  const system = toSystem(spec);
  const box = { x: { min: 0, max: 6 }, y: { min: -0.5, max: 2 } };
  const features = computeFeatures(compileSystem(system), spec, box, "en");
  // The exported picture is the ENTERED box filled to the canvas (equalScale false in the shell), so the
  // range in the footer is the entered one; the equal-scale viewport would widen y, which is also honest.
  const viewport = { box, width: 720, height: 518 };
  return { scene: { kind: "analyze_first_order", locale: "en", system, box, ...features }, viewport };
}

describe("formatSignificant", () => {
  it("keeps 3 significant digits and drops trailing zeros", () => {
    expect(formatSignificant(6)).toBe("6");
    expect(formatSignificant(-0.5)).toBe("-0.5");
    expect(formatSignificant(0)).toBe("0");
    expect(formatSignificant(1234.5)).toBe("1230");
    expect(formatSignificant(0.00012345)).toBe("0.000123");
    expect(formatSignificant(2.00001)).toBe("2");
    expect(formatSignificant(-1.23456)).toBe("-1.23");
  });
});

describe("exportFooterText", () => {
  it("logistic: equation, t-range, y-range and the origin, in that order", () => {
    const { scene, viewport } = logisticScene();
    const text = exportFooterText(scene, viewport, "en", ORIGIN);
    expect(text).toContain("dy/dt = y*(1 - y)");
    expect(text).toContain("t ∈ [0, 6]");
    expect(text).toContain("y ∈ [-0.5, 2]");
    expect(text).toContain(ORIGIN);
    expect(text).toBe(`dy/dt = y*(1 - y)${FOOTER_SEPARATOR}t ∈ [0, 6], y ∈ [-0.5, 2]${FOOTER_SEPARATOR}${ORIGIN}`);
  });

  it("Chinese uses the Chinese range template with the same numbers", () => {
    const { scene, viewport } = logisticScene();
    const text = exportFooterText(scene, viewport, "zh", ORIGIN);
    expect(text).toContain("t ∈ [0, 6]，y ∈ [-0.5, 2]");
    expect(text.startsWith("dy/dt = y*(1 - y)")).toBe(true);
  });

  it("the range is the VIEWPORT's box (what is on the picture), rounded to 3 significant digits", () => {
    const { scene } = logisticScene();
    const viewport = { box: { x: { min: -1.23456, max: 4.56789 }, y: { min: -0.987654, max: 0.123456 } }, width: 600, height: 400 };
    const text = exportFooterText(scene, viewport, "en", ORIGIN);
    expect(text).toContain("t ∈ [-1.23, 4.57], y ∈ [-0.988, 0.123]");
  });

  it("a planar system writes x' = f, y' = g and calls the horizontal coordinate x", () => {
    const system = { f: "y", g: "-x" };
    const scene: Scene = { kind: "analyze_system", locale: "en", system, box: { x: { min: -2, max: 2 }, y: { min: -2, max: 2 } } };
    const viewport = fitViewport(scene.box!, 400, 400);
    const text = exportFooterText(scene, viewport, "en", ORIGIN);
    expect(text).toBe(`x' = y, y' = -x${FOOTER_SEPARATOR}x ∈ [-2, 2], y ∈ [-2, 2]${FOOTER_SEPARATOR}${ORIGIN}`);
  });

  it("a time-dependent scene adds the snapshot instant after the range", () => {
    const system = { f: "y", g: "-x + cos(t)" };
    const scene: Scene = {
      kind: "analyze_system",
      locale: "en",
      system,
      box: { x: { min: -2, max: 2 }, y: { min: -2, max: 2 } },
      timeDependent: { snapshotT: 0, maxRelDeviation: 1 },
    };
    const viewport = { box: scene.box!, width: 400, height: 400 };
    const text = exportFooterText(scene, viewport, "en", ORIGIN);
    expect(text).toBe(`x' = y, y' = -x + cos(t)${FOOTER_SEPARATOR}x ∈ [-2, 2], y ∈ [-2, 2]${FOOTER_SEPARATOR}t = 0${FOOTER_SEPARATOR}${ORIGIN}`);
    expect(exportFooterText({ ...scene, timeDependent: { snapshotT: 1.5, maxRelDeviation: 1 } }, viewport, "en", ORIGIN)).toContain("t = 1.5");
  });

  it("a second-order scene shows the student's equation, not the reduced system", () => {
    const scene: Scene = {
      kind: "analyze_system",
      locale: "en",
      system: { f: "y", g: "-x" },
      secondOrder: { equation: "y'' + y = 0", reduced: { f: "y", g: "-x" } },
      box: { x: { min: -2, max: 2 }, y: { min: -2, max: 2 } },
    };
    expect(sceneEquationText(scene, "en")).toBe("y'' + y = 0");
  });

  it("an empty origin is left out rather than leaving a dangling separator", () => {
    const { scene, viewport } = logisticScene();
    const text = exportFooterText(scene, viewport, "en", "");
    expect(text.endsWith("y ∈ [-0.5, 2]")).toBe(true);
  });
});

describe("exportFileName", () => {
  it("is vector-field-<tag>-<yyyymmdd-hhmmss>.png in local time", () => {
    const now = new Date(2026, 8, 9, 3, 7, 5); // 2026-09-09 03:07:05 local
    expect(exportFileName("logistic", now)).toBe("vector-field-logistic-20260909-030705.png");
    expect(exportFileName("system", now)).toBe("vector-field-system-20260909-030705.png");
  });

  it("makes the tag file-safe and never leaves it empty", () => {
    const now = new Date(2026, 0, 1, 0, 0, 0);
    expect(exportFileName("Van der Pol/μ=1", now)).toBe("vector-field-van-der-pol-1-20260101-000000.png");
    expect(exportFileName("///", now)).toBe("vector-field-scene-20260101-000000.png");
  });
});
