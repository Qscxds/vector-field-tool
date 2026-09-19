/**
 * Preset library: every preset must compile in its mode through the kernel, carry both languages,
 * and be a link that decodes back to itself. The key-feature checks are derived by hand:
 * - logistic dy/dt = k y (1 - y/L) with k = 0.8 > 0, L = 2: below y = 0 the slope is negative, above it
 *   positive (solutions leave the line: unstable); around y = L = 2 the slopes point toward the line (stable).
 * - Newton cooling dy/dt = -k (y - Ta) with k = 0.3 > 0: the only zero is y = Ta = 20, slopes point toward it.
 * - Lotka-Volterra x' = a x - b x y, y' = d x y - c y: equilibria (0, 0) with J = diag(a, -c) (a saddle) and
 *   (c/d, a/b) = (3, 2) with J = [[0, -b c/d], [d a/b, 0]], trace 0, det a c = 0.75: eigenvalues ±i sqrt(0.75).
 * - dy/dt = sqrt(y): defined for y >= 0 only, so y = 0 is a domain edge with the equation defined
 *   above; the derivative 1/(2 sqrt y) is unbounded there, so the uniqueness verdict is "unbounded".
 * - x' = y, y' = -x + sin(t): g changes with t, so the system is time dependent.
 * - x'' + 2b x' + w² x = 0 with b = 0.25, w = 1 and y = x': x' = y, y' = -(0.5 y + x), checked numerically at sample points.
 */
import { describe, expect, it } from "vitest";
import { compileScalar, compileSystem } from "@/lib/core/parse";
import { reduceSecondOrder } from "@/lib/core/second-order";
import { integrateAdaptive } from "@/lib/core/integrate";
import { toSystem, type FirstOrderSpec } from "@/lib/core/slope-field";
import { detectTimeDependence } from "@/lib/core/time-dependence";
import type { Box } from "@/lib/core/types";
import { CLICK_TSPAN, computeFeatures, traceFixed } from "@/lib/interactive";
import { traceSpans } from "@/lib/time-series";
import { LOCALES } from "@/lib/labels";
import { discoverParams, paramsRecord, sliderRangeProblem, snapToSlider } from "@/lib/params";
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
      const params = paramsRecord(s.params);
      switch (p.mode) {
        case "first":
          expect(() => compileScalar(s.g, params, { variables: "ty" }), p.id).not.toThrow();
          break;
        case "diff":
          expect(() => compileScalar(s.M, params, { variables: "ty" }), p.id).not.toThrow();
          expect(() => compileScalar(s.N, params, { variables: "ty" }), p.id).not.toThrow();
          break;
        case "system":
          expect(() => compileSystem({ f: s.f, g: s.g, ...(params ? { params } : {}) }), p.id).not.toThrow();
          break;
        case "second":
          expect(() => reduceSecondOrder(s.eq, params), p.id).not.toThrow();
          break;
      }
      // Round T: a preset gives a value to exactly the names its equation leaves free (none pending, none
      // spare). As sets: discovery lists by appearance (a, b, d, c for Lotka-Volterra), the preset in its own order.
      expect([...(discoverParams(p.mode, s) ?? ["does not parse"])].sort(), p.id).toEqual(s.params.map((e) => e.name).sort());
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
    const params = paramsRecord(s.params);
    const spec: FirstOrderSpec = { kind: "explicit", g: s.g, ...(params ? { params } : {}) };
    return computeFeatures(compileSystem(toSystem(spec)), spec, boxOf(p), "en").firstOrder;
  };

  it("logistic with k = 0.8, L = 2: y = 0 unstable, y = L = 2 stable", () => {
    const p = byId("logistic");
    expect(p.params).toEqual([{ name: "k", value: 0.8 }, { name: "L", value: 2 }]);
    const fo = firstOrderFeatures(p);
    expect(fo).toBeDefined();
    const at = (y: number) => fo!.solutions.find((s) => Math.abs(s.y - y) < 1e-9);
    expect(fo!.solutions).toHaveLength(2);
    expect(at(0)?.stability).toBe("unstable");
    expect(at(2)?.stability).toBe("stable");
  });

  it("Newton cooling with k = 0.3, Ta = 20: the one constant solution y = Ta = 20 is stable and visible in the box", () => {
    const p = byId("newton");
    const fo = firstOrderFeatures(p);
    expect(fo!.solutions).toHaveLength(1);
    expect(fo!.solutions[0].y).toBeCloseTo(20, 9);
    expect(fo!.solutions[0].stability).toBe("stable");
    expect(p.box.yMin).toBeLessThan(20);
    expect(p.box.yMax).toBeGreaterThan(20);
  });

  it("Lotka-Volterra with a = 1, b = 0.5, c = 0.75, d = 0.25: a saddle at (0, 0) with eigenvalues a, -c and (c/d, a/b) = (3, 2) with ±i sqrt(a c)", () => {
    const p = byId("lotka");
    const s = presetState(p);
    const eq = computeFeatures(compileSystem({ f: s.f, g: s.g, params: paramsRecord(s.params) }), null, boxOf(p), "en").equilibria!;
    expect(eq).toHaveLength(2);
    const origin = eq.find((e) => Math.hypot(e.at.x, e.at.y) < 1e-9)!;
    expect(origin.classification).toBe("saddle");
    expect(origin.eigenvalues.map((l) => l.re).sort((u, v) => u - v).map((v) => Number(v.toFixed(6)))).toEqual([-0.75, 1]);
    const inner = eq.find((e) => Math.hypot(e.at.x - 3, e.at.y - 2) < 1e-6)!;
    expect(inner.classification).toBe("center_or_weak_spiral");
    expect(Math.abs(inner.eigenvalues[0].im)).toBeCloseTo(Math.sqrt(0.75), 5);
    // both kept orbits stay inside the box: derived from H = d x - c ln x + b y - a ln y (see the preset's note)
    for (const q of p.starts!) expect(q.x > 0 && q.y > 0).toBe(true);
  });

  it("the logistic preset is the link a teacher hands out: k = 0.8, L = 2 in the address", () => {
    // By the encoding rules: the default ymax = 3 is omitted, the preset's two starts come as traj, p is last.
    expect(presetUrl(byId("logistic"))).toBe("/vector-field?m=first&g=k*y*(1+-+y/L)&tmin=0&tmax=10&ymin=-0.5&traj=0,0.1;0,2.8&p=k:0.8,L:2");
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

  it("the second-order damped preset (b = 0.25, w = 1) reduces to x' = y, y' = -(2b y + w² x) = -(0.5 y + x)", () => {
    const s = presetState(byId("damped2"));
    expect(s.params).toEqual([{ name: "b", value: 0.25 }, { name: "w", value: 1 }]);
    const sys = compileSystem(reduceSecondOrder(s.eq, paramsRecord(s.params)).spec);
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

  it("beats x'' = -x + F*cos(g*t) with F = 0.5, g = 1.2 from rest: x(t) = (0.5/0.44)(cos t - cos 1.2t), checked at t = 5 by integration", () => {
    // Particular solution F/(1 - g²) cos(g t) = -1.1364 cos(1.2t); with x(0) = x'(0) = 0 the homogeneous part is
    // +1.1364 cos t, so x = 1.1364 (cos t - cos 1.2 t) = 2.2727 sin(0.1 t) sin(1.1 t).
    const p = byId("beats");
    expect(p.mode).toBe("second");
    expect(p.group).toBe("nonAutonomous");
    expect(p.params).toEqual([{ name: "F", value: 0.5 }, { name: "g", value: 1.2 }]);
    const sys = compileSystem(reduceSecondOrder(presetState(p).eq, paramsRecord(presetState(p).params)).spec);
    const tr = integrateAdaptive(sys, { x: 0, y: 0 }, 5, { rtol: 1e-9, atol: 1e-12 });
    expect(tr.status).toBe("completed");
    const expected = (0.5 / 0.44) * (Math.cos(5) - Math.cos(6));
    expect(tr.points.at(-1)!.x).toBeCloseTo(expected, 6);
    expect(expected).toBeCloseTo(2 * (0.5 / 0.44) * Math.sin(0.5) * Math.sin(5.5), 12);
  });
});

describe("[U] presets that open with a slider", () => {
  it("every preset slider belongs to one of the preset's parameters, is a valid range and contains the preset's own value on its grid", () => {
    for (const p of PRESETS) {
      for (const s of p.sliders ?? []) {
        const param = (p.params ?? []).find((e) => e.name === s.name);
        expect(param, `${p.id}.${s.name}`).toBeDefined();
        expect(sliderRangeProblem(s), `${p.id}.${s.name}`).toBeNull();
        expect(snapToSlider(param!.value, s), `${p.id}.${s.name}`).toBe(param!.value);
      }
    }
  });

  it("the damped oscillator's slider on b runs through critical damping b = w = 1; the beats' slider on g runs through the natural frequency 1", () => {
    const b = byId("damped2").sliders!.find((s) => s.name === "b")!;
    expect(b.min).toBeLessThan(1);
    expect(b.max).toBeGreaterThan(1);
    const g = byId("beats").sliders!.find((s) => s.name === "g")!;
    expect(g.min).toBeLessThan(1);
    expect(g.max).toBeGreaterThan(1);
  });

  it("the beats preset's t range shows one whole envelope: 4 pi / |g - 1| = 62.8 at g = 1.2", () => {
    const range = presetState(byId("beats")).timeRange;
    expect(range.max - range.min).toBeGreaterThan((4 * Math.PI) / 0.2);
    // and the link carries it, with the slider
    expect(presetUrl(byId("beats"))).toBe("/vector-field?m=second&eq=x''+%3D+-x+%2B+F*cos(g*t)&xmin=-20&xmax=20&xpmin=-20&xpmax=20&tmax=70&traj=0,0&p=F:0.5,g:1.2&sl=g:0.5:1.5:0.01");
  });

  it("[Y] the beats preset's box holds the curve over the WHOLE slider range: dragging g to 1 never takes it out of the picture", () => {
    // From rest x = F/(g² - 1) (cos t - cos g t), and |cos t - cos g t| = 2 |sin((1+g)t/2) sin((1-g)t/2)| is at most both 2
    // and |1 - g| t, so |x| <= min(2F/|g² - 1|, F t/(1 + g)). The two bounds cross at |g - 1| = 2/t = 0.0286: the
    // supremum over the slider's g and t <= 70 is below 0.5 * 70 / 1.9714 = 17.76. At g = 1 exactly,
    // x = (F/2) t sin t, whose largest value inside t <= 70 is at t = 3 pi/2 + 20 pi = 67.54: 0.25 * 67.54 = 16.89;
    // its velocity (F/2)(sin t + t cos t) is largest near t = 22 pi = 69.1: 17.3. The box is ±20 for both.
    const p = byId("beats");
    const box = boxOf(p);
    expect(box).toEqual({ x: { min: -20, max: 20 }, y: { min: -20, max: 20 } });
    const slider = p.sliders!.find((s) => s.name === "g")!;
    const spans = traceSpans(presetState(p).timeRange, 0, CLICK_TSPAN);
    const peaks = (g: number) => {
      const sys = compileSystem(reduceSecondOrder(presetState(p).eq, { F: 0.5, g }).spec);
      const forward = traceFixed(sys, p.starts![0], box, 0, spans)[0];
      expect(forward.status, `g = ${g}`).toBe("completed");
      return { x: Math.max(...forward.points.map((q) => Math.abs(q.x))), v: Math.max(...forward.points.map((q) => Math.abs(q.y))) };
    };
    for (const g of [slider.min, 0.8, 0.95, 0.97, 0.99, 1, 1.01, 1.03, 1.05, 1.2, slider.max]) {
      const { x, v } = peaks(g);
      expect(x, `g = ${g}`).toBeLessThan(17.76);
      expect(v, `g = ${g}`).toBeLessThan(20);
    }
    const resonance = peaks(1);
    expect(resonance.x).toBeGreaterThan(16.85);
    expect(resonance.x).toBeLessThan(16.92);
  });
});
