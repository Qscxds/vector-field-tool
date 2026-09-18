/**
 * Round U.3: what a student sees in the classification line while dragging a parameter slider,
 * computed exactly as the web shell computes it for every slider value (reduceSecondOrder with the
 * parameter values -> compileSystem -> computeFeatures on the entered box).
 *
 * Derivation. x'' + 2b x' + w² x = 0 with v = x' is x' = v, v' = -w² x - 2b v: the origin is the only
 * equilibrium, J = [[0, 1], [-w², -2b]], trace -2b, determinant w² > 0, discriminant
 * tr² - 4 det = 4 (b² - w²). Hence, for w > 0:
 *   b = 0        purely imaginary pair ±i w: "center or weak spiral" (never "center");
 *   0 < b < w    complex pair with negative real part: stable spiral (underdamped);
 *   b = w        the repeated root -w, and J is not a multiple of I: degenerate node, which a
 *                numerical Jacobian can only decide within its error, so the repeatedRoot caveat
 *                must be there (critical damping);
 *   b > w        two distinct negative real roots: stable node (overdamped);
 *   -w < b < 0   unstable spiral; b < -w unstable node (negative damping).
 * So along a slider the classification switches exactly at b = w. Nothing here comes from a run.
 */
import { describe, expect, it } from "vitest";
import { compileSystem } from "./core/parse";
import { reduceSecondOrder } from "./core/second-order";
import type { Box } from "./core/types";
import { computeFeatures } from "./interactive";
import { snapToSlider } from "./params";

const BOX: Box = { x: { min: -3, max: 3 }, y: { min: -3, max: 3 } };
const EQUATION = "x'' + 2*b*x' + w^2*x = 0";

function originAt(b: number, w: number) {
  const reduced = reduceSecondOrder(EQUATION, { b, w }, { box: BOX });
  const eq = computeFeatures(compileSystem(reduced.spec), null, BOX, "en").equilibria ?? [];
  expect(eq, `b = ${b}, w = ${w}`).toHaveLength(1);
  expect(Math.hypot(eq[0].at.x, eq[0].at.y)).toBeLessThan(1e-9);
  return eq[0];
}

/** The values a slider over [min, max] with this step passes through between `from` and `to`. */
function sliderValues(range: { min: number; max: number; step: number }, from: number, to: number): number[] {
  const out: number[] = [];
  for (let v = from; v <= to + range.step / 2; v += range.step) out.push(snapToSlider(v, range));
  return out;
}

describe("the damped oscillator along a slider on b: the spiral becomes a node exactly at b = w", () => {
  it("w = 1, b from 0.2 to 1.5 in steps of 0.05: stable spiral below 1, degenerate node with the repeated-root caveat at 1, stable node above", () => {
    const values = sliderValues({ min: 0, max: 2, step: 0.05 }, 0.2, 1.5);
    expect(values).toContain(1);
    expect(values[0]).toBe(0.2);
    expect(values.at(-1)).toBe(1.5);
    for (const b of values) {
      const e = originAt(b, 1);
      if (b < 1) {
        expect(e.classification, `b = ${b}`).toBe("stable_spiral");
        expect(e.caveat ?? null, `b = ${b}`).toBeNull();
      } else if (b === 1) {
        expect(e.classification).toBe("degenerate_node");
        expect(e.caveat).toBe("repeatedRoot");
      } else {
        expect(e.classification, `b = ${b}`).toBe("stable_node");
        expect(e.caveat ?? null, `b = ${b}`).toBeNull();
      }
    }
  });

  it("one slider step on either side of critical damping is already decided: 0.99 spiral, 1.01 node (step 0.01)", () => {
    expect(originAt(0.99, 1).classification).toBe("stable_spiral");
    expect(originAt(1.01, 1).classification).toBe("stable_node");
    // the eigenvalues at the two ends of the classroom drag: -b ± i sqrt(w² - b²) and -b ± sqrt(b² - w²)
    const under = originAt(0.2, 1).eigenvalues;
    expect(under[0].re).toBeCloseTo(-0.2, 6);
    expect(Math.abs(under[0].im)).toBeCloseTo(Math.sqrt(1 - 0.04), 6);
    const over = originAt(1.5, 1).eigenvalues.map((l) => l.re).sort((p, q) => p - q);
    expect(over[0]).toBeCloseTo(-1.5 - Math.sqrt(1.25), 6);
    expect(over[1]).toBeCloseTo(-1.5 + Math.sqrt(1.25), 6);
  });

  it("the switch follows w: with w = 2 it is at b = 2", () => {
    expect(originAt(1.5, 2).classification).toBe("stable_spiral");
    expect(originAt(2, 2)).toMatchObject({ classification: "degenerate_node", caveat: "repeatedRoot" });
    expect(originAt(2.5, 2).classification).toBe("stable_node");
  });

  it("no damping is 'center or weak spiral', never a center; negative damping is unstable", () => {
    expect(originAt(0, 1)).toMatchObject({ classification: "center_or_weak_spiral", caveat: "center" });
    expect(originAt(-0.5, 1).classification).toBe("unstable_spiral");
    expect(originAt(-1.5, 1).classification).toBe("unstable_node");
  });
});
