import { describe, expect, it } from "vitest";
import { compileSystem } from "./core/parse";
import { toSystem, type FirstOrderSpec } from "./core/slope-field";
import { traceFixed } from "./interactive";
import { fill, labels } from "./labels";
import { groupTrajectories, statusPictureOf, statusSentence, trajectoryLines, trajectoryMode, trajectoryStatus } from "./labels-trajectory";
import type { Scene, TrajectoryView } from "./scene";

const en = labels("en");
const zh = labels("zh");

const firstOrderScene = (spec: FirstOrderSpec): Pick<Scene, "system" | "fieldStyle"> => ({
  system: toSystem(spec),
  fieldStyle: spec.kind === "differential" ? "segments" : "arrows",
});

describe("trajectoryMode", () => {
  it("planar without the ty tag, explicit for ty + arrows, differential for ty + segments", () => {
    expect(trajectoryMode({ system: { f: "y", g: "-x" } })).toBe("planar");
    expect(trajectoryMode({ system: { f: "y", g: "-x", variables: "xy" }, fieldStyle: "arrows" })).toBe("planar");
    expect(trajectoryMode({})).toBe("planar");
    expect(trajectoryMode({ system: { f: "1", g: "y", variables: "ty" }, fieldStyle: "arrows" })).toBe("explicit");
    expect(trajectoryMode({ system: { f: "1", g: "y", variables: "ty" } })).toBe("explicit");
    expect(trajectoryMode({ system: { f: "y", g: "-(t)", variables: "ty" }, fieldStyle: "segments" })).toBe("differential");
  });
});

describe("groupTrajectories", () => {
  const tv = (direction: "forward" | "backward"): TrajectoryView => ({ direction, points: [{ x: 0, y: 0 }], status: "completed", steps: 1, tEnd: 1 });
  it("pairs a forward trajectory with the backward one that follows it, and leaves the rest alone", () => {
    expect(groupTrajectories([])).toEqual([]);
    const f = tv("forward"), b = tv("backward");
    expect(groupTrajectories([f])).toEqual([[f]]);
    expect(groupTrajectories([f, b])).toEqual([[f, b]]);
    expect(groupTrajectories([f, b, f, b])).toEqual([[f, b], [f, b]]);
    expect(groupTrajectories([b, f])).toEqual([[b], [f]]);
    expect(groupTrajectories([f, f, b])).toEqual([[f], [f, b]]);
  });
});

describe("trajectoryLines for an explicit first-order scene (logistic preset clicked at (3, 0.5))", () => {
  // Preset: dy/dt = y(1 - y), t in [0, 6], y in [-0.5, 2]. The reduced system is t' = 1, y' = y(1-y);
  // the fixed trajectory integrates 50 units of the parameter each way and stops at 20x the home box
  // (t in [-57, 63], y in [-24.25, 25.75]). x' = 1 exactly, so the forward end point has t = 3 + 50 = 53
  // and the backward one t = 3 - 50 = -47; y stays in (0, 1). Both sides complete. tEnd is 50, the
  // parameter, which is NOT the t coordinate reached: the old line printed it.
  const spec: FirstOrderSpec = { kind: "explicit", g: "y*(1 - y)" };
  const home = { x: { min: 0, max: 6 }, y: { min: -0.5, max: 2 } };
  const pair = traceFixed(compileSystem(toSystem(spec)), { x: 3, y: 0.5 }, home);
  const scene = firstOrderScene(spec);

  it("prints the direction with the t coordinate of the end point, not the integration parameter", () => {
    const [fwd, back] = pair;
    expect(fwd.status).toBe("completed");
    expect(fwd.tEnd).toBeCloseTo(50, 9);
    expect(fwd.points[fwd.points.length - 1].x).toBeCloseTo(53, 9);
    expect(back.points[back.points.length - 1].x).toBeCloseTo(-47, 9);
    const lines = trajectoryLines(scene, pair, en);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(`${en.tool.forward} to t = 53, ${en.status.completed}`);
    expect(lines[1]).toBe(`${en.tool.backward} to t = -47, ${en.status.completed}`);
    expect(lines[0]).not.toContain("t = 50");
    expect(lines[0]).not.toContain("t = 0.5");
    const zhLines = trajectoryLines(scene, pair, zh);
    expect(zhLines[0]).toBe(`${zh.tool.forward} 到 t = 53，${zh.status.completed}`);
    expect(zhLines[1]).toContain("t = -47");
  });

  it("uses the far-box wording and still the end point's t when the curve leaves the 20x box", () => {
    // dy/dt = 0 from (0.5, 0) on the home box [-1, 1]²: t' = 1 reaches the far box edge t = 20 at
    // parameter 19.5. The line must say t = 20 (the coordinate), not 19.5 (the parameter).
    const flat: FirstOrderSpec = { kind: "explicit", g: "0" };
    const [fwd] = traceFixed(compileSystem(toSystem(flat)), { x: 0.5, y: 0 }, { x: { min: -1, max: 1 }, y: { min: -1, max: 1 } });
    expect(fwd.status).toBe("left_box");
    expect(fwd.stop).toBe("far");
    expect(fwd.tEnd).toBeCloseTo(19.5, 9);
    const [line] = trajectoryLines(firstOrderScene(flat), [fwd], en);
    expect(line).toBe(`${en.tool.forward} to t = 20, ${en.ui.leftFarBox}`);
    expect(line).not.toContain("19.5");
  });
});

describe("trajectoryLines for a differential-form scene (circles preset t dt + y dy = 0)", () => {
  // Preset: M = t, N = y on [-2, 2]². The reduced system is x' = y, y' = -t: circles. Clicked at
  // (1, 0) the solution is the unit circle, 50 parameter units each way stay inside the 20x box, so
  // both sides complete. The form has no direction: no direction words, no t number.
  const spec: FirstOrderSpec = { kind: "differential", M: "t", N: "y" };
  const home = { x: { min: -2, max: 2 }, y: { min: -2, max: 2 } };
  const pair = traceFixed(compileSystem(toSystem(spec)), { x: 1, y: 0 }, home);
  const scene = firstOrderScene(spec);

  it("lists the two sides by status only", () => {
    expect(pair.map((t) => t.status)).toEqual(["completed", "completed"]);
    const lines = trajectoryLines(scene, pair, en);
    expect(lines).toHaveLength(1);
    // Round P2.1: the differential form's "completed" never says "requested time" (the span is the curve's parameter).
    expect(lines[0]).toBe(`one side: ${en.tool.completedDiff}; other side: ${en.tool.completedDiff}`);
    expect(lines[0]).not.toMatch(/t =/);
    expect(lines[0]).not.toMatch(/forward|backward/i);
    expect(lines[0]).not.toContain(en.tool.forward);
    expect(lines[0]).not.toContain(en.status.completed);
    const [zhLine] = trajectoryLines(scene, pair, zh);
    expect(zhLine).toBe(`一侧：${zh.tool.completedDiff}；另一侧：${zh.tool.completedDiff}`);
    expect(zhLine).not.toContain(zh.tool.forward);
    expect(zhLine).not.toContain("t =");
  });

  it("a single trajectory in a differential scene is just its status", () => {
    expect(trajectoryLines(scene, [pair[0]], en)).toEqual([en.tool.completedDiff]);
  });
});

describe("trajectoryLines adds the non-uniqueness sentence once per group (J.2)", () => {
  const tv = (direction: "forward" | "backward", nonUnique?: boolean): TrajectoryView => ({
    direction,
    points: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    status: "completed",
    steps: 1,
    tEnd: 1,
    ...(nonUnique ? { nonUnique } : {}),
  });

  it("explicit first order: after the status lines, in the shell's language", () => {
    const scene = firstOrderScene({ kind: "explicit", g: "sqrt(y)" });
    const lines = trajectoryLines(scene, [tv("forward"), tv("backward", true)], en);
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe(en.ui.nonUniqueTrajectory);
    expect(trajectoryLines(scene, [tv("forward"), tv("backward", true)], zh)[2]).toBe(zh.ui.nonUniqueTrajectory);
    expect(trajectoryLines(scene, [tv("forward"), tv("backward")], en)).toHaveLength(2);
  });

  it("planar and differential scenes get it too", () => {
    const planar = trajectoryLines({ system: { f: "sqrt(abs(x))", g: "-y" } }, [tv("forward", true)], en);
    expect(planar).toEqual([`${en.tool.forward} to t = 1, ${en.status.completed}`, en.ui.nonUniqueTrajectory]);
    const diff = trajectoryLines(firstOrderScene({ kind: "differential", M: "-sqrt(y)", N: "1" }), [tv("forward"), tv("backward", true)], en);
    expect(diff).toEqual([`one side: ${en.tool.completedDiff}; other side: ${en.tool.completedDiff}`, en.ui.nonUniqueTrajectory]);
  });
});

describe("trajectoryLines for a planar system keeps today's text", () => {
  it("harmonic oscillator clicked at (1, 0): direction, tEnd and status", () => {
    const home = { x: { min: -3, max: 3 }, y: { min: -3, max: 3 } };
    const pair = traceFixed(compileSystem({ f: "y", g: "-x" }), { x: 1, y: 0 }, home);
    const scene: Pick<Scene, "system" | "fieldStyle"> = { system: { f: "y", g: "-x" }, fieldStyle: "arrows" };
    const lines = trajectoryLines(scene, pair, en);
    expect(lines).toEqual([
      `${en.tool.forward} ${fill(en.ui.toward, { t: "50", status: en.status.completed })}`,
      `${en.tool.backward} ${fill(en.ui.toward, { t: "-50", status: en.status.completed })}`,
    ]);
    expect(lines[0]).toContain("t = 50");
  });

  it("the far-box status wording is used for a clicked trajectory that left the 20x box", () => {
    const [fwd] = traceFixed(compileSystem({ f: "5", g: "0" }), { x: 0, y: 0 }, { x: { min: -1, max: 1 }, y: { min: -1, max: 1 } });
    expect(trajectoryStatus(fwd, en)).toBe(en.ui.leftFarBox);
    expect(trajectoryStatus({ ...fwd, stop: "view" }, en)).toBe(en.status.left_box);
    expect(trajectoryLines({ system: { f: "5", g: "0" } }, [fwd], en)[0]).toBe(`${en.tool.forward} to t = 4, ${en.ui.leftFarBox}`);
  });
});

describe("non-autonomous status wording (round N.3 b)", () => {
  const stopped: TrajectoryView = { direction: "forward", points: [{ x: 0, y: 0 }, { x: 0, y: 1 }], status: "reached_equilibrium", steps: 10, tEnd: Math.PI / 2 };
  it("reached_equilibrium over a time-dependent scene is worded as a low-speed stop, not an equilibrium, in both languages", () => {
    for (const L of [en, zh]) {
      expect(trajectoryStatus(stopped, L)).toBe(L.status.reached_equilibrium);
      expect(trajectoryStatus(stopped, L, { snapshotT: 0, maxRelDeviation: 1 })).toBe(L.tool.stoppedNonAutonomous);
      expect(statusSentence("reached_equilibrium", L, { snapshotT: 0, maxRelDeviation: 1 })).toBe(L.tool.stoppedNonAutonomous);
      // Every other status is unchanged by time dependence.
      expect(statusSentence("completed", L, { snapshotT: 0, maxRelDeviation: 1 })).toBe(L.status.completed);
      expect(statusSentence("left_box", L, { snapshotT: 0, maxRelDeviation: 1 })).toBe(L.status.left_box);
    }
    expect(en.tool.stoppedNonAutonomous).toMatch(/not an equilibrium/);
    expect(zh.tool.stoppedNonAutonomous).toMatch(/不是平衡点/);
  });

  it("trajectoryLines of a planar time-dependent scene carries the neutral wording", () => {
    // x' = 0, y' = cos(t) from (0, 0) to t = pi/2: the speed |cos t| is 6e-17 at the end point.
    const scene: Pick<Scene, "system" | "fieldStyle" | "timeDependent"> = { system: { f: "0", g: "cos(t)" }, timeDependent: { snapshotT: 0, maxRelDeviation: 1 } };
    const lines = trajectoryLines(scene, [stopped], en);
    expect(lines).toEqual([`${en.tool.forward} ${fill(en.ui.toward, { t: "1.57", status: en.tool.stoppedNonAutonomous })}`]);
    expect(trajectoryLines({ system: { f: "0", g: "1" } }, [stopped], en)[0]).toContain(en.status.reached_equilibrium);
  });
});

describe("[P2.1] differential-form statuses never speak of time, and its low-speed stop is a singular point", () => {
  it("statusSentence on a differential form rewords completed, max_steps, reached_equilibrium and blew_up; the others are unchanged", () => {
    for (const L of [en, zh]) {
      expect(statusSentence("completed", L, undefined, "differential")).toBe(L.tool.completedDiff);
      expect(statusSentence("max_steps", L, undefined, "differential")).toBe(L.tool.maxStepsDiff);
      expect(statusSentence("reached_equilibrium", L, undefined, "differential")).toBe(L.tool.reachedSingularDiff);
      expect(statusSentence("blew_up", L, undefined, "differential")).toBe(L.tool.blewUpDiff);
      for (const status of ["left_box", "singular", "domain_edge", "arc_length"] as const) {
        expect(statusSentence(status, L, undefined, "differential")).toBe(L.status[status]);
      }
      // A planar picture keeps the shared sentences.
      expect(statusSentence("completed", L)).toBe(L.status.completed);
      expect(statusSentence("blew_up", L, undefined, "planar")).toBe(L.status.blew_up);
      expect(L.tool.completedDiff).not.toMatch(/requested time|指定时间/);
      expect(L.tool.maxStepsDiff).not.toMatch(/requested time|指定时间/);
    }
  });

  it("statusSentence on an explicit first-order picture says y becomes infinite, and on a second-order one speaks of x and x'", () => {
    for (const L of [en, zh]) {
      expect(statusSentence("blew_up", L, undefined, "explicit")).toBe(L.tool.blewUpFirst);
      expect(statusSentence("completed", L, undefined, "explicit")).toBe(L.status.completed);
      expect(statusSentence("blew_up", L, undefined, "second")).toBe(L.tool.blewUpSecond);
      expect(statusSentence("reached_equilibrium", L, undefined, "second")).toBe(L.tool.reachedEquilibriumSecond);
      expect(statusSentence("reached_equilibrium", L, { snapshotT: 1, maxRelDeviation: 1 }, "second")).toBe(L.tool.stoppedNonAutonomousSecond);
      for (const text of [L.tool.blewUpSecond, L.tool.reachedEquilibriumSecond, L.tool.stoppedNonAutonomousSecond]) {
        expect(text).not.toMatch(/(^|[^A-Za-z'一-鿿])y(?![A-Za-z])/);
        expect(text).not.toMatch(/position|位置|system|系统/);
      }
    }
    // statusPictureOf reads the scene.
    expect(statusPictureOf({ system: { f: "y", g: "-x" } })).toBe("planar");
    expect(statusPictureOf({ system: { f: "y", g: "-x" }, secondOrder: { equation: "x'' = -x", reduced: { f: "v", g: "-x" } } })).toBe("second");
    expect(statusPictureOf({ system: { f: "1", g: "y", variables: "ty" }, fieldStyle: "arrows" })).toBe("explicit");
    expect(statusPictureOf({ system: { f: "y", g: "-(t)", variables: "ty" }, fieldStyle: "segments" })).toBe("differential");
  });

  it("trajectoryLines of a differential-form scene uses the reworded statuses on both sides", () => {
    const scene = firstOrderScene({ kind: "differential", M: "t", N: "y" });
    const tv = (direction: "forward" | "backward", status: TrajectoryView["status"]): TrajectoryView => ({ direction, points: [{ x: 1, y: 1 }, { x: 1.5, y: 0.5 }], status, steps: 2, tEnd: 1 });
    for (const L of [en, zh]) {
      const [line] = trajectoryLines(scene, [tv("forward", "completed"), tv("backward", "reached_equilibrium")], L);
      expect(line).toBe(fill(L.ui.trajectorySides, { first: L.tool.completedDiff, second: L.tool.reachedSingularDiff }));
      expect(line).not.toContain(L.status.completed);
      expect(line).not.toContain(L.status.reached_equilibrium);
    }
  });
});
