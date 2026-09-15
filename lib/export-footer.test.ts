import { describe, expect, it } from "vitest";
import { compileSystem } from "./core/parse";
import { toSystem, type FirstOrderSpec } from "./core/slope-field";
import { exportFileName, exportFooterText, FOOTER_SEPARATOR, formatSignificant, sceneEquationText } from "./export-footer";
import { computeFeatures } from "./interactive";
import { fitViewport } from "./render/viewport";
import type { Scene } from "./scene";

const ORIGIN = "https://example.org";

describe("sceneEquationText for a first-order query", () => {
  it("keeps explicit and differential equations in student notation in either locale without feature results", () => {
    const forms: FirstOrderSpec[] = [{ kind: "explicit", g: "a*y", params: { a: 1 } }, { kind: "differential", M: "-a*y", N: "1", params: { a: 1 } }];
    for (const locale of ["en", "zh"] as const) {
      for (const firstOrderSpec of forms) {
        const scene: Scene = { kind: "query_solution", locale, system: toSystem(firstOrderSpec), firstOrderSpec };
        const expected = firstOrderSpec.kind === "explicit" ? "dy/dt = a*y" : "(-a*y) dt + (1) dy = 0";
        expect(sceneEquationText(scene, locale)).toBe(expected);
      }
    }
  });
});

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

describe("entered and shown ranges (round N.3 e)", () => {
  it("prints both when the equal-scale viewport widens the entered range, labelled entered / shown", () => {
    // The logistic box [0, 6] x [-0.5, 2] on a 720 x 518 canvas at equal scale: the y span 2.5
    // must cover 518 px, so the scale is 207.2 px per unit and the x span shown is 720 / 207.2 =
    // 3.475 < 6: the x span is the binding one instead: 720 / 6 = 120 px per unit, and the y span
    // shown is 518 / 120 = 4.317, centred on 0.75: y ∈ [-1.41, 2.91] (3 significant digits).
    const { scene } = logisticScene();
    const viewport = fitViewport(scene.box!, 720, 518);
    const text = exportFooterText(scene, viewport, "en", ORIGIN);
    expect(text).toBe(`dy/dt = y*(1 - y)${FOOTER_SEPARATOR}entered t ∈ [0, 6], y ∈ [-0.5, 2]${FOOTER_SEPARATOR}shown t ∈ [0, 6], y ∈ [-1.41, 2.91]${FOOTER_SEPARATOR}${ORIGIN}`);
    expect(exportFooterText(scene, viewport, "zh", ORIGIN)).toContain("输入范围 t ∈ [0, 6]，y ∈ [-0.5, 2] · 显示范围 t ∈ [0, 6]，y ∈ [-1.41, 2.91]");
  });

  it("takes the entered box explicitly (the shell's home box) and falls back to the scene's featuresBox, then box", () => {
    const { scene, viewport } = logisticScene();
    const home = { x: { min: -1, max: 1 }, y: { min: -1, max: 1 } };
    expect(exportFooterText(scene, viewport, "en", ORIGIN, home)).toContain(`entered t ∈ [-1, 1], y ∈ [-1, 1]${FOOTER_SEPARATOR}shown t ∈ [0, 6], y ∈ [-0.5, 2]`);
    const zoomed = { box: { x: { min: 1, max: 2 }, y: { min: 0, max: 1 } }, width: 720, height: 518 };
    expect(exportFooterText({ ...scene, featuresBox: home }, zoomed, "en", ORIGIN)).toContain(`entered t ∈ [-1, 1], y ∈ [-1, 1]${FOOTER_SEPARATOR}shown t ∈ [1, 2], y ∈ [0, 1]`);
    // Identical ranges are printed once, without labels.
    expect(exportFooterText(scene, viewport, "en", ORIGIN, scene.box)).toBe(`dy/dt = y*(1 - y)${FOOTER_SEPARATOR}t ∈ [0, 6], y ∈ [-0.5, 2]${FOOTER_SEPARATOR}${ORIGIN}`);
  });
});
