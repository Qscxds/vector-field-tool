/**
 * Round 13: snapping and the complex-eigenvalue picture. The viewport is the box [−2, 2]² on a
 * 400 × 400 canvas: 100 px per unit, worldToScreen(x, y) = (100 (x + 2), 100 (2 − y)); the drawn
 * eigen segment's half-length is 0.11 · 400 = 44 px. Every distance below is worked out from that.
 */
import { describe, expect, it } from "vitest";
import type { Equilibrium } from "../core/equilibria";
import type { Separatrix } from "../phase-aids";
import type { Viewport } from "../render/viewport";
import { ARC_MAX_GROWTH, branchExtent, numericEigen, rotationAids, rotationArc, snapPoint, snapTargets, type SnapTarget } from "./geometry";
import { linearAnalysisOf, numericLinear } from "./linear-system";

const V: Viewport = { box: { x: { min: -2, max: 2 }, y: { min: -2, max: 2 } }, width: 400, height: 400 };

function equilibrium(at: { x: number; y: number }, jacobian: Equilibrium["jacobian"], classification: Equilibrium["classification"], eigenvalues: Equilibrium["eigenvalues"]): Equilibrium {
  const [[a, b], [c, d]] = jacobian;
  return { at, jacobian, resolution: 1e-12, classification, trace: a + d, determinant: a * d - b * c, eigenvalues };
}

describe("snapPoint on lines and segments", () => {
  const xAxis: SnapTarget = { kind: "line", through: { x: 0, y: 0 }, direction: { x: 1, y: 0 }, eigenvalue: 1 };
  const yAxis: SnapTarget = { kind: "line", through: { x: 0, y: 0 }, direction: { x: 0, y: 1 }, eigenvalue: -1 };

  it("snaps to the foot of the perpendicular within 12 px", () => {
    // Screen (300, 205) is world (1, −0.05): 5 px from the x-axis, foot (1, 0).
    const s = snapPoint([xAxis], { x: 300, y: 205 }, V);
    expect(s?.point).toEqual({ x: 1, y: 0 });
    expect(s?.distancePx).toBeCloseTo(5, 12);
    // 13 px away: nothing.
    expect(snapPoint([xAxis], { x: 300, y: 213 }, V)).toBeNull();
  });

  it("takes the nearest of several", () => {
    // (205, 260): 60 px from the x-axis, 5 px from the y-axis at world (0, −0.6).
    const s = snapPoint([xAxis, yAxis], { x: 205, y: 260 }, V);
    expect(s?.target).toBe(yAxis);
    expect(s?.point.x).toBe(0);
    expect(s?.point.y).toBeCloseTo(-0.6, 12);
  });

  it("a nonlinear node's segment only snaps within its drawn half-length (44 px)", () => {
    const seg: SnapTarget = { kind: "segment", at: { x: 0, y: 0 }, direction: { x: 1, y: 0 }, eigenvalue: -1 };
    // 100 px along the direction: the clamped tip (244, 200) is 56 px from (300, 205).
    expect(snapPoint([seg], { x: 300, y: 205 }, V)).toBeNull();
    // 40 px along: inside, 5 px off.
    const s = snapPoint([seg], { x: 240, y: 205 }, V);
    expect(s?.point.x).toBeCloseTo(0.4, 12);
    expect(s?.point.y).toBe(0);
  });
});

describe("snapPoint on a separatrix branch", () => {
  // Saddle (0, 0); the integrator's points (0.01, 0), (0.5, 0), (1, 0) at clocks 0, 1, 2.
  const branch: Separatrix = {
    saddle: { x: 0, y: 0 },
    kind: "unstable",
    points: [{ x: 0, y: 0 }, { x: 0.01, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 }],
    status: "completed",
    start: { x: 0.01, y: 0 },
    times: [0, 1, 2],
  };

  it("re-integrates to the clock of the nearest point", () => {
    // (275, 206): the foot on (0.5, 0)–(1, 0) is halfway, clock 1.5, 6 px away.
    const asked: number[] = [];
    const s = snapPoint([{ kind: "branch", branch, nearSaddleOnly: false, extent: 3 }], { x: 275, y: 206 }, V, (_b, t) => {
      asked.push(t);
      return { x: 0.77, y: 0.001 };
    });
    expect(asked).toEqual([1.5]);
    expect(s?.point).toEqual({ x: 0.77, y: 0.001 });
    // Without a locator: the polyline's own point.
    expect(snapPoint([{ kind: "branch", branch, nearSaddleOnly: false, extent: 3 }], { x: 275, y: 206 }, V)?.point).toEqual({ x: 0.75, y: 0 });
  });

  it("near the saddle only while the separatrices are not drawn", () => {
    // The foot (275, 200) is 75 px from the saddle (200, 200), beyond 44 px.
    expect(snapPoint([{ kind: "branch", branch, nearSaddleOnly: true, extent: 3 }], { x: 275, y: 206 }, V)).toBeNull();
    // (230, 206): foot (230, 200) on (0.01, 0)–(0.5, 0) at u = 29/49, 30 px from the saddle.
    const asked: number[] = [];
    snapPoint([{ kind: "branch", branch, nearSaddleOnly: true, extent: 3 }], { x: 230, y: 206 }, V, (_b, t) => {
      asked.push(t);
      return null;
    });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toBeCloseTo(29 / 49, 12);
  });
});

describe("branchExtent", () => {
  it("cuts a branch where it first nearly stops after speeding up", () => {
    // Clock steps of 1; chord speeds 1, 2, 3, 0.2, 4 on the segments points[1→2], …, points[5→6]: the
    // first strict local minimum after the rise is the segment points[4→5], speed 0.2 ≤ 0.1 · 3 (the
    // fastest before it). The branch keeps that slowest segment (its closest approach) and stops at
    // its far end: the last index is 5.
    const xs = [0, 0, 1, 3, 6, 6.2, 10.2];
    const branch: Separatrix = { saddle: { x: 0, y: 0 }, kind: "unstable", points: xs.map((x) => ({ x, y: 0 })), status: "completed", start: { x: 0, y: 0 }, times: [0, 1, 2, 3, 4, 5] };
    expect(branchExtent(branch)).toBe(5);
  });

  it("does not cut at a shallow dip (a curve passing a center, not an equilibrium)", () => {
    // Speeds 1, 2, 3, 1, 4: the local minimum 1 is more than 0.1 · 3 = 0.3, so the branch is kept whole: index 6.
    const xs = [0, 0, 1, 3, 6, 7, 11];
    const branch: Separatrix = { saddle: { x: 0, y: 0 }, kind: "unstable", points: xs.map((x) => ({ x, y: 0 })), status: "completed", start: { x: 0, y: 0 }, times: [0, 1, 2, 3, 4, 5] };
    expect(branchExtent(branch)).toBe(6);
  });

  it("keeps a branch whole that slows down to its end (it runs into a sink)", () => {
    // Speeds 4, 2, 1, 0.5: never rising, so never cut: the last index is 5.
    const xs = [0, 0, 4, 6, 7, 7.5];
    const branch: Separatrix = { saddle: { x: 0, y: 0 }, kind: "unstable", points: xs.map((x) => ({ x, y: 0 })), status: "completed", start: { x: 0, y: 0 }, times: [0, 1, 2, 3, 4] };
    expect(branchExtent(branch)).toBe(5);
  });
});

describe("snapTargets", () => {
  it("a linear system snaps to its exact lines", () => {
    // x' = x, y' = −y: lines along (1, 0) and (0, 1) through the origin.
    const r = linearAnalysisOf({ mode: "system", f: "x", g: "-y" });
    if (!r.ok) throw new Error("linear");
    const t = snapTargets(numericLinear(r.analysis), [], undefined, false);
    expect(t.map((x) => x.kind)).toEqual(["line", "line"]);
  });

  it("a nonlinear saddle snaps to its branches, a node to its segments, a spiral to nothing", () => {
    const saddle = equilibrium({ x: 0, y: 0 }, [[1, 0], [0, -1]], "saddle", [{ re: 1, im: 0 }, { re: -1, im: 0 }]);
    const node = equilibrium({ x: 1, y: 0 }, [[-1, 0], [0, -2]], "stable_node", [{ re: -1, im: 0 }, { re: -2, im: 0 }]);
    const spiral = equilibrium({ x: -1, y: 0 }, [[-1, -1], [1, -1]], "stable_spiral", [{ re: -1, im: 1 }, { re: -1, im: -1 }]);
    const branch: Separatrix = { saddle: { x: 0, y: 0 }, kind: "stable", points: [{ x: 0, y: 0 }], status: "completed", start: { x: 0, y: 0 }, times: [] };
    const t = snapTargets(null, [saddle, node, spiral], [branch], false);
    expect(t.map((x) => x.kind)).toEqual(["branch", "segment", "segment"]);
    expect(t[0].kind === "branch" && t[0].nearSaddleOnly).toBe(true);
  });
});

describe("numericEigen and the rotation picture", () => {
  it("the numerical eigenvector of a complex pair agrees with the exact one", () => {
    // J = [[0, −1], [1, 0]]: disc −4, v = (1, (d − a)/(2b) + i·2/(2b)) = (1, −i): Re (1, 0), Im (0, −1); c = 1: counterclockwise.
    const e = equilibrium({ x: 0, y: 0 }, [[0, -1], [1, 0]], "center_or_weak_spiral", [{ re: 0, im: 1 }, { re: 0, im: -1 }]);
    expect(numericEigen(e)).toEqual({ kind: "complex", alpha: 0, beta: 1, re: { x: 1, y: -0 }, im: { x: 0, y: -1 }, ccw: true });
    // The center-or-weak-spiral of a NUMERICAL linearization is never drawn closed.
    expect(rotationAids(null, [e])[0].closed).toBe(false);
  });

  it("an exact center draws the closed ellipse, sized to the radius", () => {
    // Re (1, 0), Im (0, −1), α = 0, β = 1: the arc is (cos s, sin s), 100 px per unit, so k = 50/100.
    const arc = rotationArc({ at: { x: 0, y: 0 }, re: { x: 1, y: 0 }, im: { x: 0, y: -1 }, alpha: 0, beta: 1, closed: true, exact: true }, V, 50)!;
    // The sampled circle's radius is 100 px up to rounding, so k is 1/2 up to rounding.
    expect(arc.points[0].x).toBeCloseTo(0.5, 12);
    expect(arc.points[0].y).toBe(0);
    expect(arc.points[24].x).toBeCloseTo(0, 12);
    expect(arc.points[24].y).toBeCloseTo(0.5, 12);
    expect(arc.points[96].x).toBeCloseTo(0.5, 12);
    expect(arc.points[96].y).toBeCloseTo(0, 12);
    expect(arc.reTip.x).toBeCloseTo(0.5, 12);
    expect(arc.imTip.y).toBeCloseTo(-0.5, 12);
  });

  it("a strong spiral's arc ends where its radius has shrunk by ARC_MAX_GROWTH", () => {
    // α/β = −1/2: the span is ln 4 / (1/2) < 3π/2, so the last radius is 1/4 of the first.
    const arc = rotationArc({ at: { x: 0, y: 0 }, re: { x: 1, y: 0 }, im: { x: 0, y: -1 }, alpha: -0.5, beta: 1, closed: false, exact: true }, V, 50)!;
    const r0 = Math.hypot(arc.points[0].x, arc.points[0].y);
    const r1 = Math.hypot(arc.points[96].x, arc.points[96].y);
    expect(r0 / r1).toBeCloseTo(ARC_MAX_GROWTH, 10);
  });

  it("a linear system gives its one exact rotation aid", () => {
    const r = linearAnalysisOf({ mode: "system", f: "-y", g: "x" });
    if (!r.ok) throw new Error("linear");
    const aids = rotationAids(numericLinear(r.analysis), undefined);
    expect(aids).toHaveLength(1);
    expect(aids[0]).toMatchObject({ at: { x: 0, y: 0 }, closed: true, exact: true, alpha: 0, beta: 1 });
  });
});

describe("branchExtent on a real separatrix (second review)", () => {
  it("keeps the whole homoclinic loop of x'' = x − x³, not half of it", async () => {
    // x' = y, y' = x − x³: the saddle (0, 0) and the loop y² = x² − x⁴/2, which turns at x = √2 ≈ 1.414
    // (y = 0) and comes back to the saddle. Its speed dips a little as it passes the center (1, 0), at
    // about 0.7 of the speed before; it nearly stops only back at the saddle.
    const { compileSystem } = await import("../core/parse");
    const { computeFeatures, fixedStopBox } = await import("../interactive");
    const { separatrices } = await import("../phase-aids");
    const box = { x: { min: -2, max: 2 }, y: { min: -1.5, max: 1.5 } };
    const sys = compileSystem({ f: "y", g: "x - x^3" });
    const features = computeFeatures(sys, null, box, "en", {});
    const branches = separatrices(sys, features.equilibria ?? [], box, fixedStopBox(box));
    expect(branches.length).toBe(4);
    for (const b of branches) {
      const kept = b.points.slice(0, branchExtent(b) + 1);
      // It reaches the turning point x = ±√2 …
      expect(Math.max(...kept.map((p) => Math.abs(p.x)))).toBeGreaterThan(1.41);
      // … and ends back near the saddle.
      const end = kept[kept.length - 1];
      expect(Math.hypot(end.x, end.y)).toBeLessThan(0.05);
    }
  });
});
