/**
 * Preset library: every preset must compile in its mode through the kernel, carry both languages,
 * and be a link that decodes back to itself. The key-feature checks are derived by hand:
 * - logistic dy/dt = y(1 - y): below y = 0 the slope is negative, above it positive (solutions leave
 *   the line: unstable); around y = 1 the slopes point toward the line (stable).
 * - dy/dt = sqrt(y): defined for y >= 0 only, so y = 0 is a domain edge with the equation defined
 *   above; the derivative 1/(2 sqrt y) is unbounded there, so the uniqueness verdict is "unbounded".
 * - x' = y, y' = -x + sin(t): g changes with t, so the system is time dependent.
 * - x'' + 0.5x' + x = 0 with y = x': x' = y, y' = -(0.5 y + x), checked numerically at sample points.
 */
import { describe, expect, it } from "vitest";
import { compileScalar, compileSystem } from "@/lib/core/parse";
import { reduceSecondOrder } from "@/lib/core/second-order";
import { integrateAdaptive } from "@/lib/core/integrate";
import { toSystem, type FirstOrderSpec } from "@/lib/core/slope-field";
import { detectTimeDependence } from "@/lib/core/time-dependence";
import type { Box } from "@/lib/core/types";
import { computeFeatures } from "@/lib/interactive";
import { LOCALES } from "@/lib/labels";
import { decodeState, DEFAULT_STATE, expressionKeysOf } from "@/lib/url-state";
import { PRESET_GROUPS, PRESET_PATH, PRESETS, presetsByGroup, presetState, presetUrl, type Preset } from "./presets";

const boxOf = (p: Preset): Box => ({ x: { min: p.box.xMin, max: p.box.xMax }, y: { min: p.box.yMin, max: p.box.yMax } });
const byId = (id: string): Preset => {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

describe("preset library", () => {
  it("ids are unique and every preset belongs to a declared group; every group has presets", () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const groupIds = new Set(PRESET_GROUPS.map((g) => g.id));
    expect(groupIds.size).toBe(PRESET_GROUPS.length);
    for (const p of PRESETS) expect(groupIds.has(p.group), p.id).toBe(true);
    for (const { group, presets } of presetsByGroup()) expect(presets.length, group.id).toBeGreaterThan(0);
    expect(presetsByGroup().flatMap((g) => g.presets)).toHaveLength(PRESETS.length);
  });

  it("every preset and group has a non-empty name and note in both languages", () => {
    for (const locale of LOCALES) {
      for (const g of PRESET_GROUPS) expect(g.name[locale].trim().length, `${g.id} ${locale}`).toBeGreaterThan(0);
      for (const p of PRESETS) {
        expect(p.name[locale].trim().length, `${p.id} ${locale}`).toBeGreaterThan(0);
        expect(p.note[locale].trim().length, `${p.id} ${locale}`).toBeGreaterThan(0);
      }
    }
  });

  it("every preset compiles in its mode through the kernel, with a proper box and starts inside it", () => {
    for (const p of PRESETS) {
      const s = presetState(p);
      for (const key of expressionKeysOf(p.mode)) expect(p.expressions[key], `${p.id}.${key}`).toBeTruthy();
      switch (p.mode) {
        case "first":
          expect(() => compileScalar(s.g, undefined, { variables: "ty" }), p.id).not.toThrow();
          break;
        case "diff":
          expect(() => compileScalar(s.M, undefined, { variables: "ty" }), p.id).not.toThrow();
          expect(() => compileScalar(s.N, undefined, { variables: "ty" }), p.id).not.toThrow();
          break;
        case "system":
          expect(() => compileSystem({ f: s.f, g: s.g }), p.id).not.toThrow();
          break;
        case "second":
          expect(() => reduceSecondOrder(s.eq), p.id).not.toThrow();
          break;
      }
      expect(s.box.xMin, p.id).toBeLessThan(s.box.xMax);
      expect(s.box.yMin, p.id).toBeLessThan(s.box.yMax);
      for (const q of p.starts ?? []) {
        expect(q.x >= s.box.xMin && q.x <= s.box.xMax && q.y >= s.box.yMin && q.y <= s.box.yMax, `${p.id} start ${q.x},${q.y}`).toBe(true);
      }
    }
  });

  it("every preset is a shareable link that decodes back to its own state without problems", () => {
    for (const p of PRESETS) {
      const url = presetUrl(p);
      expect(url.startsWith(PRESET_PATH), p.id).toBe(true);
      const { state, problems } = decodeState(url.slice(PRESET_PATH.length), DEFAULT_STATE);
      expect(problems, p.id).toEqual([]);
      expect(state, p.id).toEqual(presetState(p));
    }
  });
});

describe("derived key features", () => {
  const firstOrderFeatures = (p: Preset) => {
    const s = presetState(p);
    const spec: FirstOrderSpec = { kind: "explicit", g: s.g };
    return computeFeatures(compileSystem(toSystem(spec)), spec, boxOf(p), "en").firstOrder;
  };

  it("logistic: y = 0 unstable, y = 1 stable", () => {
    const fo = firstOrderFeatures(byId("logistic"));
    expect(fo).toBeDefined();
    const at = (y: number) => fo!.solutions.find((s) => Math.abs(s.y - y) < 1e-9);
    expect(fo!.solutions).toHaveLength(2);
    expect(at(0)?.stability).toBe("unstable");
    expect(at(1)?.stability).toBe("stable");
  });

  it("sqrt(y): y = 0 is a domain edge (defined above) whose uniqueness verdict is unbounded", () => {
    const fo = firstOrderFeatures(byId("sqrt"));
    expect(fo).toBeDefined();
    expect(fo!.solutions).toHaveLength(1);
    const s = fo!.solutions[0];
    expect(s.y).toBe(0);
    expect(s.domainEdge).toBe("above");
    expect(s.uniqueness?.verdict).toBe("unbounded");
  });

  it("the non-autonomous preset is time dependent", () => {
    const p = byId("resonance");
    const s = presetState(p);
    expect(detectTimeDependence(compileSystem({ f: s.f, g: s.g }), boxOf(p)).dependsOnT).toBe(true);
    // And an autonomous one is not.
    const h = presetState(byId("harmonic"));
    expect(detectTimeDependence(compileSystem({ f: h.f, g: h.g }), boxOf(byId("harmonic"))).dependsOnT).toBe(false);
  });

  it("the second-order damped preset reduces to x' = y, y' = -(0.5 y + x)", () => {
    const s = presetState(byId("damped2"));
    const sys = compileSystem(reduceSecondOrder(s.eq).spec);
    for (const q of [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1.5, y: 2.25 }, { x: 0.3, y: -0.7 }]) {
      const v = sys.eval(q);
      expect(v.x).toBeCloseTo(q.y, 12);
      expect(v.y).toBeCloseTo(-(0.5 * q.y + q.x), 12);
    }
  });
});

describe("[P2.8] the second-order chapter has its own presets, entered as x'' = F(t, x, x')", () => {
  it("harmonic, damped, pendulum and Van der Pol exist in second-order mode; the same models stay available as planar systems", () => {
    for (const id of ["harmonic2", "damped2", "pendulum", "vdp2"]) {
      const p = byId(id);
      expect(p.mode, id).toBe("second");
      expect(p.group, id).toBe("secondOrder");
      expect(p.expressions.eq, id).toMatch(/x''/);
      expect(p.note.en, id).not.toMatch(/(^|[^A-Za-z'])y(?![A-Za-z])/);
      expect(p.note.zh, id).not.toMatch(/(^|[^A-Za-z'一-鿿])y(?![A-Za-z])/);
    }
    for (const id of ["harmonic", "damped", "vdp"]) expect(byId(id).mode, id).toBe("system");
    expect(PRESET_GROUPS.map((g) => g.id)).toContain("secondOrder");
  });

  it("harmonic2 and vdp2 reduce to the same kernel systems as the planar harmonic and vdp presets (derived: f = y, g as written)", () => {
    for (const [second, planar] of [["harmonic2", "harmonic"], ["vdp2", "vdp"]] as const) {
      const sys = compileSystem(reduceSecondOrder(presetState(byId(second)).eq).spec);
      const ref = compileSystem({ f: presetState(byId(planar)).f, g: presetState(byId(planar)).g });
      for (const q of [{ x: 0.3, y: -1.2 }, { x: 2, y: 0.5 }, { x: -1.7, y: 2.2 }]) {
        expect(sys.eval(q).x, second).toBeCloseTo(ref.eval(q).x, 12);
        expect(sys.eval(q).y, second).toBeCloseTo(ref.eval(q).y, 12);
      }
    }
  });

  it("beats x'' = -x + 0.5*cos(1.2*t) from rest: x(t) = (0.5/0.44)(cos t - cos 1.2t), checked at t = 5 by integration", () => {
    // Particular solution -1.1364 cos(1.2t) (0.5 / (1 - 1.44)); with x(0) = x'(0) = 0 the homogeneous part is
    // +1.1364 cos t, so x = 1.1364 (cos t - cos 1.2 t) = 2.2727 sin(0.1 t) sin(1.1 t).
    const p = byId("beats");
    expect(p.mode).toBe("second");
    expect(p.group).toBe("nonAutonomous");
    const sys = compileSystem(reduceSecondOrder(presetState(p).eq).spec);
    const tr = integrateAdaptive(sys, { x: 0, y: 0 }, 5, { rtol: 1e-9, atol: 1e-12 });
    expect(tr.status).toBe("completed");
    const expected = (0.5 / 0.44) * (Math.cos(5) - Math.cos(6));
    expect(tr.points.at(-1)!.x).toBeCloseTo(expected, 6);
    expect(expected).toBeCloseTo(2 * (0.5 / 0.44) * Math.sin(0.5) * Math.sin(5.5), 12);
  });
});
