import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useInteractiveScene, type InteractiveInput, type InteractiveScene } from "../components/useInteractiveScene";
import { compileSystem } from "./core/parse";
import { constantSolutionNotices, equilibriaNotices, labels } from "./labels";
import { toSystem } from "./core/slope-field";
import type { Box, SystemSpec } from "./core/types";
import type { Scene } from "./scene";

const box: Box = { x: { min: -2, max: 2 }, y: { min: -2, max: 2 } };

// Server-rendering runs the real hook's initial render, including feature computation and Scene
// assembly, without a DOM or mocked hooks. These tests guard the data actually consumed by both
// shells, rather than just the separate computeFeatures result.
function renderScene(spec: SystemSpec, homeBox = box, options: Partial<InteractiveInput> = {}, interact?: (model: InteractiveScene) => void): Scene {
  const observed: Array<Scene | null> = [];
  function Harness() {
    const model = useInteractiveScene({
      sys: compileSystem(spec), spec, firstOrder: null, homeBox,
      width: 640, height: 480, density: 10, locale: "en",
      kind: "analyze_system", fieldStyle: "arrows", systemKey: "test", withFeatures: true,
      ...options,
    });
    observed.push(model.scene);
    // A render-phase update lets React apply the real callback/store logic and render the result
    // once more without installing a DOM renderer. Only the test harness performs this update.
    if (observed.length === 1) interact?.(model);
    return null;
  }
  renderToStaticMarkup(createElement(Harness));
  expect(observed.length).toBeGreaterThan(0);
  const scene = observed[observed.length - 1];
  expect(scene).not.toBeNull();
  return scene!;
}

describe("interactive Scene diagnostics", () => {
  it("retains a direction-dependent singularity for the shells' equilibrium notices", () => {
    const scene = renderScene({ f: "x*y/(x^2+y^2)", g: "y-x" });
    expect(scene.equilibria).toEqual([]);
    expect(scene.singularPoints).toHaveLength(1);
    expect(Math.hypot(scene.singularPoints![0].x, scene.singularPoints![0].y)).toBeLessThan(1e-9);
    expect(equilibriaNotices(labels("en"), scene).some((line) => line.includes("undefined or discontinuous"))).toBe(true);
  });

  it("retains underflow-plateau information for the shells' equilibrium notices", () => {
    const scene = renderScene({ f: "y", g: "exp(x)" }, { x: { min: -2000, max: -900 }, y: { min: -5, max: 5 } });
    expect(scene.equilibria).toEqual([]);
    expect(scene.underflowPlateau).toBe(true);
    expect(equilibriaNotices(labels("en"), scene)).toContain(labels("en").tool.underflowPlateau);
  });

  it("delivers both constant-solution scan and plateau notices through the real hook", () => {
    const firstOrder = { kind: "explicit" as const, g: "exp(-y^2)" };
    const scene = renderScene(toSystem(firstOrder), { x: box.x, y: { min: -30, max: 30 } }, {
      firstOrder, kind: "analyze_first_order",
    });
    expect(scene.firstOrder?.resolution).toBe(60 / 400);
    expect(scene.firstOrder?.zeroPlateaus).toHaveLength(2);
    const notices = constantSolutionNotices(labels("en"), scene.firstOrder!);
    expect(notices).toHaveLength(2);
    expect(notices).toContain(labels("en").tool.zeroPlateau);
  });

  it.each([
    { kind: "explicit" as const, g: "sqrt(y)" },
    { kind: "differential" as const, M: "-sqrt(y)", N: "1" },
  ])("keeps a query's $kind identity and flags a newly kept solution without feature analysis", (firstOrder) => {
    const toolScene: Scene = { kind: "query_solution", system: toSystem(firstOrder), box, firstOrderSpec: firstOrder };
    const scene = renderScene(toolScene.system!, box, {
      firstOrder: toolScene.firstOrder?.spec ?? toolScene.firstOrderSpec ?? null,
      kind: toolScene.kind,
      fieldStyle: firstOrder.kind === "differential" ? "segments" : "arrows",
      withFeatures: false,
    }, (model) => model.addTrajectory({ x: 0, y: 0.25 }));
    expect(scene.firstOrder).toBeUndefined();
    expect(scene.firstOrderSpec).toEqual(firstOrder);
    expect(scene.trajectories).toHaveLength(2);
    expect(scene.trajectories!.find((t) => t.direction === "backward")?.nonUnique).toBe(true);
    expect(scene.trajectories!.find((t) => t.direction === "forward")?.nonUnique).toBeUndefined();
  });
});
