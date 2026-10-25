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
import { DEFAULT_SERIES_SETTINGS } from "@/lib/series-panel";
import { constantCoefficientOde, constantsFor, hasResonance, particularRealForm, solutionFormula, type SolutionFormula } from "@/lib/series/decompose";
import { linearEquation } from "@/lib/series/equation";
import { coefficientValues, partialSum, polynomialOde, powerSeries, type SeriesSolution } from "@/lib/series/power-series";
import { q } from "@/lib/series/rational";
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

describe("[Z1] a preset that writes a second-order equation as a system explains its own y (the professor's 'it is unclear what is y here')", () => {
  // The rule (Z1.1): whatever the tool writes into the equation box by itself must say what every symbol
  // it introduced stands for. A planar preset whose x' is exactly y is a second-order equation in disguise.
  const disguised = PRESETS.filter((p) => p.mode === "system" && p.expressions.f?.trim() === "y");
  const definesY = (text: string) => /y = x'/.test(text);

  it("harmonic, damped, vdp and resonance are the presets in disguise, and no other planar preset is", () => {
    expect(disguised.map((p) => p.id).sort()).toEqual(["damped", "harmonic", "resonance", "vdp"]);
    for (const id of ["lotka", "saddle", "star"]) expect(byId(id).expressions.f, id).not.toBe("y");
  });

  it("their NAME carries the original second-order equation and y = x', and their note opens with the reduction, in both languages", () => {
    for (const p of disguised) {
      for (const locale of LOCALES) {
        expect(p.name[locale], `${p.id} ${locale} name`).toMatch(/x''/);
        expect(definesY(p.name[locale]), `${p.id} ${locale} name`).toBe(true);
        // The first sentence (up to the first full stop of either language) defines y before anything else is said.
        const first = p.note[locale].split(/[。.](?=\s|$)/)[0];
        expect(definesY(first), `${p.id} ${locale} first sentence: ${first}`).toBe(true);
        expect(first, `${p.id} ${locale}`).toMatch(/x''/);
      }
    }
    // The planar presets whose x and y are two unknown functions say nothing about x' (nothing to explain).
    for (const id of ["lotka", "saddle", "star"]) for (const locale of LOCALES) expect(definesY(byId(id).name[locale] + byId(id).note[locale]), id).toBe(false);
  });

  it("twins point at each other, exist, and carry a label in both languages", () => {
    const withTwin = PRESETS.filter((p) => p.twin);
    expect(withTwin.map((p) => p.id).sort()).toEqual(["beats", "damped", "damped2", "harmonic", "harmonic2", "resonance", "vdp", "vdp2"]);
    for (const p of withTwin) {
      const twin = byId(p.twin!.id);
      expect(twin.twin?.id, `${p.id} -> ${twin.id} -> back`).toBe(p.id);
      expect(twin.mode, p.id).not.toBe(p.mode);
      for (const locale of LOCALES) expect(p.twin!.label[locale].trim().length, `${p.id} ${locale}`).toBeGreaterThan(0);
    }
  });

  it("a twin label says 'the same equation' exactly when the two kernel systems agree at sample points (derived), and 'related' when they do not", () => {
    const kernelOf = (p: Preset) => {
      const s = presetState(p);
      const params = paramsRecord(s.params);
      return p.mode === "second" ? compileSystem(reduceSecondOrder(s.eq, params).spec) : compileSystem({ f: s.f, g: s.g, ...(params ? { params } : {}) });
    };
    const samples = [{ x: 0.3, y: -1.2 }, { x: 2, y: 0.5 }, { x: -1.7, y: 2.2 }];
    const times = [0, 1, 2.5];
    const same = (a: Preset, b: Preset) => {
      const A = kernelOf(a), B = kernelOf(b);
      return samples.every((q) => times.every((t) => Math.abs(A.eval(q, t).x - B.eval(q, t).x) < 1e-12 && Math.abs(A.eval(q, t).y - B.eval(q, t).y) < 1e-12));
    };
    // damped: x'' + 0.5x' + x = 0 is x'' + 2b x' + w² x = 0 with b = 0.25, w = 1 (2b = 0.5, w² = 1).
    for (const [a, b] of [["harmonic", "harmonic2"], ["damped", "damped2"], ["vdp", "vdp2"]] as const) {
      expect(same(byId(a), byId(b)), `${a} ~ ${b}`).toBe(true);
      for (const id of [a, b]) {
        expect(byId(id).twin!.label.en, id).toMatch(/^The same equation/);
        expect(byId(id).twin!.label.zh, id).toMatch(/^同一个方程/);
      }
    }
    // resonance forces with sin t, the beats with 0.5 cos(1.2 t): at t = 1 the accelerations differ by sin 1 - 0.5 cos 1.2 = 0.66.
    expect(same(byId("resonance"), byId("beats"))).toBe(false);
    expect(Math.abs(kernelOf(byId("resonance")).eval({ x: 0, y: 0 }, 1).y - kernelOf(byId("beats")).eval({ x: 0, y: 0 }, 1).y)).toBeCloseTo(Math.sin(1) - 0.5 * Math.cos(1.2), 12);
    for (const id of ["resonance", "beats"]) {
      expect(byId(id).twin!.label.en, id).toMatch(/^Related preset/);
      expect(byId(id).twin!.label.en, id).not.toMatch(/same equation/);
      expect(byId(id).twin!.label.zh, id).toMatch(/^相关预设/);
      expect(byId(id).twin!.label.zh, id).not.toMatch(/同一个方程/);
    }
    // The label that leads to a system names y = x' (it is the system's symbol); the one that leads to a second-order equation has no y to explain.
    for (const p of PRESETS.filter((q) => q.twin)) {
      for (const locale of LOCALES) expect(definesY(p.twin!.label[locale]), `${p.id} ${locale}`).toBe(byId(p.twin!.id).mode === "system");
    }
  });
});

describe("[Z2.1] the four mechanical presets written as systems open with both pictures; the rest leave the view to the default rule", () => {
  it("harmonic, damped, vdp and resonance carry view = both, and it travels in their links", () => {
    for (const id of ["harmonic", "damped", "vdp", "resonance"]) {
      expect(byId(id).view, id).toBe("both");
      expect(presetState(byId(id)).view, id).toBe("both");
      expect(presetUrl(byId(id)), id).toContain("view=both");
    }
    for (const p of PRESETS.filter((q) => !["harmonic", "damped", "vdp", "resonance"].includes(q.id))) {
      expect(p.view, p.id).toBeUndefined();
      expect(presetState(p).view, p.id).toBeNull();
      expect(presetUrl(p), p.id).not.toContain("view=");
    }
  });
});

describe("[12] the series chapter: presets that open the power series or the solution formula", () => {
  const SERIES_IDS = ["airy", "legendre", "hermite", "gauss", "forced2", "cooling", "resonance-formula"];
  const chapter = PRESETS.filter((p) => p.group === "series");
  const textOf = (p: Preset) => (p.mode === "first" ? presetState(p).g : presetState(p).eq);
  const equationOf = (p: Preset, params: Record<string, number> | undefined) => {
    const r = linearEquation(p.mode === "first" ? "first" : "second", textOf(p), params);
    if (!r.ok) throw new Error(`${p.id}: ${JSON.stringify(r.failure)}`);
    return r.equation;
  };
  const seriesOf = (id: string, params?: Record<string, number>): SeriesSolution => {
    const ode = polynomialOde(equationOf(byId(id), params));
    if (!ode.ok) throw new Error(`${id}: not polynomial`);
    const r = powerSeries(ode.ode, q(0));
    if (r.status !== "ok") throw new Error(`${id}: singular at 0`);
    return r;
  };
  const formulaOf = (id: string, params?: Record<string, number>): SolutionFormula => {
    const ode = constantCoefficientOde(equationOf(byId(id), params));
    if (!ode.ok) throw new Error(`${id}: not constant`);
    return solutionFormula(ode.ode);
  };
  const ownParams = (id: string) => paramsRecord(presetState(byId(id)).params);

  it("the chapter is the last group, with these seven presets, each in a mode that has the panel", () => {
    expect(PRESET_GROUPS.at(-1)).toEqual({ id: "series", name: { zh: "幂级数与解的公式", en: "Power series and solution formulas" } });
    expect(chapter.map((p) => p.id)).toEqual(SERIES_IDS);
    for (const p of chapter) expect(["first", "second"], p.id).toContain(p.mode);
  });

  it("every preset of the chapter opens the panel, its link carries the settings, and the link decodes back to them", () => {
    for (const p of chapter) {
      expect(p.series?.kind, p.id).not.toBeNull();
      expect(presetState(p).series, p.id).toEqual(p.series);
      const url = presetUrl(p);
      expect(url, p.id).toContain(p.series!.kind === "series" ? "ser=ps" : "ser=sol");
      const { state, problems } = decodeState(url.slice(PRESET_PATH.length), DEFAULT_STATE);
      expect(problems, p.id).toEqual([]);
      expect(state.series, p.id).toEqual(p.series);
    }
    // Every other preset leaves the panel off and its link says nothing about it.
    for (const p of PRESETS.filter((x) => x.group !== "series")) {
      expect(p.series, p.id).toBeUndefined();
      expect(presetState(p).series, p.id).toEqual(DEFAULT_SERIES_SETTINGS);
      expect(presetUrl(p), p.id).not.toMatch(/[?&](ser|sn|sc|si)=/);
    }
  });

  it("the cooling preset is the link a teacher hands out (derived from the encoding rules)", () => {
    // box 0..8 x -1..3: tmin, tmax, ymin written, ymax = 3 is the default; the start (0, 0); p, sl, then the
    // series: sol, the default 8 powers and t0 = 0 omitted, y(0) = 0 written as si=0.
    expect(presetUrl(byId("cooling"))).toBe("/vector-field?m=first&g=-k*y+%2B+1&tmin=0&tmax=8&ymin=-1&traj=0,0&p=k:1&sl=k:0:3:0.1&ser=sol&si=0");
  });

  it("a power-series preset has polynomial coefficients, a formula preset constant ones; each start is the panel's initial value at t0 = 0", () => {
    for (const p of chapter) {
      const eq = equationOf(p, ownParams(p.id));
      if (p.series!.kind === "series") expect(polynomialOde(eq).ok, p.id).toBe(true);
      else expect(constantCoefficientOde(eq).ok, p.id).toBe(true);
      expect(p.series!.center, p.id).toBe(0);
      expect(presetState(p).snapshotT, p.id).toBe(0);
      // first order: the start is the point (t0, y(t0)); second order: the phase-plane point (x(t0), x'(t0)) at t0
      const start = p.starts![0];
      expect(start, p.id).toEqual(p.mode === "first" ? { x: p.series!.center, y: p.series!.initial[0] } : { x: p.series!.initial[0], y: p.series!.initial[1] });
    }
  });

  it("the notes use the student's vocabulary: no lone y in a second-order note, no x and no dy/dx in a first-order one", () => {
    for (const p of chapter) {
      if (p.mode === "second") {
        expect(p.note.en, p.id).not.toMatch(/(^|[^A-Za-z'])y(?![A-Za-z])/);
        expect(p.note.zh, p.id).not.toMatch(/(^|[^A-Za-z'一-鿿])y(?![A-Za-z])/);
      } else {
        for (const locale of LOCALES) {
          expect(p.note[locale], p.id).not.toMatch(/dy\/dx/);
          expect(p.note[locale], `${p.id} ${locale}`).not.toMatch(/(^|[^A-Za-z'])x(?![A-Za-z])/);
        }
      }
    }
  });

  it("airy: (n + 2)(n + 1) a(n+2) = a(n-1) and 2 a2 = 0, so a2 = 0, a3 = a0/6, a4 = a1/12, a6 = a3/30 = a0/180; no basis series stops, no singular point", () => {
    const s = seriesOf("airy");
    // components over (a0, a1, 1)
    expect(s.coefficients[2]).toEqual([q(0), q(0), q(0)]);
    expect(s.coefficients[3]).toEqual([q(1, 6), q(0), q(0)]);
    expect(s.coefficients[4]).toEqual([q(0), q(1, 12), q(0)]);
    expect(s.coefficients[6]).toEqual([q(1, 180), q(0), q(0)]);
    expect(s.basis.map((b) => b.degree)).toEqual([null, null]);
    expect(s.radius.kind).toBe("infinite");
    for (const locale of LOCALES) expect(byId("airy").note[locale], locale).toContain("t⁶/180");
  });

  it("legendre: a(n+2) = (n - l)(n + l + 1) a(n)/((n + 2)(n + 1)); at l = 2 x1 = 1 - 3t², for every whole l one basis series is the polynomial of degree l; radius 1", () => {
    const at2 = seriesOf("legendre", ownParams("legendre"));
    expect(ownParams("legendre")).toEqual({ l: 2 });
    // n = 0: a2 = (0 - 2)(3)/2 a0 = -3 a0; n = 2: a4 = (0)(5)/12 a2 = 0, so x1 = 1 - 3t²
    expect(at2.basis[0].degree).toBe(2);
    expect(at2.basis[0].coefficients.slice(0, 3)).toEqual([q(1), q(0), q(-3)]);
    expect(at2.basis[1].degree).toBeNull();
    expect(at2.radius.kind === "finite" && at2.radius.distance.value).toBe(1);
    // l = 5/2 (on the slider's grid): l(l + 1) = 35/4, a2 = (-5/2)(7/2)/2 a0 = -35/8 a0 and a3 = (1 - 5/2)(1 + 7/2)/6 a1 = -9/8 a1
    const half = seriesOf("legendre", { l: 2.5 });
    expect(half.coefficients[2]).toEqual([q(-35, 8), q(0), q(0)]);
    expect(half.coefficients[3]).toEqual([q(0), q(-9, 8), q(0)]);
    expect(half.basis.map((b) => b.degree)).toEqual([null, null]);
    // A whole l: the factor (n - l) vanishes at n = l in the series of l's parity and nowhere in the other.
    const slider = byId("legendre").sliders![0];
    for (let l = 0; l <= 5; l++) {
      expect(snapToSlider(l, slider), `l = ${l}`).toBe(l);
      const s = seriesOf("legendre", { l });
      expect(s.basis[l % 2].degree, `l = ${l}`).toBe(l);
      expect(s.basis[1 - (l % 2)].degree, `l = ${l}`).toBeNull();
    }
    for (const locale of LOCALES) expect(byId("legendre").note[locale], locale).toContain("x₁ = 1 − 3t²");
  });

  it("hermite: a(n+2) = 2(n - m) a(n)/((n + 2)(n + 1)); at m = 2 x1 = 1 - 2t², for every whole m one basis series is the polynomial of degree m; no singular point", () => {
    const at2 = seriesOf("hermite", ownParams("hermite"));
    expect(ownParams("hermite")).toEqual({ m: 2 });
    // n = 0: a2 = 2(0 - 2)/2 a0 = -2 a0; n = 2: a4 = 2(0)/12 a2 = 0
    expect(at2.basis[0].degree).toBe(2);
    expect(at2.basis[0].coefficients.slice(0, 3)).toEqual([q(1), q(0), q(-2)]);
    // n = 1: a3 = 2(1 - 2)/6 a1 = -a1/3: the odd series goes on
    expect(at2.coefficients[3]).toEqual([q(0), q(-1, 3), q(0)]);
    expect(at2.basis[1].degree).toBeNull();
    expect(at2.radius.kind).toBe("infinite");
    const slider = byId("hermite").sliders![0];
    for (let m = slider.min; m <= slider.max; m += slider.step) {
      const s = seriesOf("hermite", { m });
      expect(s.basis[m % 2].degree, `m = ${m}`).toBe(m);
      expect(s.basis[1 - (m % 2)].degree, `m = ${m}`).toBeNull();
    }
    for (const locale of LOCALES) expect(byId("hermite").note[locale], locale).toContain("x₁ = 1 − 2t²");
  });

  it("gauss: (n + 1) a(n+1) = 2 a(n-1) and a1 = 0, so a(2k) = a0/k!: from y(0) = 1, a2 = 1, a4 = 1/2, a6 = 1/6, a8 = 1/24, a10 = 1/120", () => {
    const s = seriesOf("gauss");
    const values = coefficientValues(s, [q(1)]);
    expect(values.slice(0, 11)).toEqual([q(1), q(0), q(1), q(0), q(1, 2), q(0), q(1, 6), q(0), q(1, 24), q(0), q(1, 120)]);
    expect(s.radius.kind).toBe("infinite");
    // the partial sum through t^10 at t = 1 is 1 + 1 + 1/2 + 1/6 + 1/24 + 1/120 = 163/60, the start of the series of e
    expect(partialSum(values, 10, q(0), 1)).toBeCloseTo(163 / 60, 14);
    for (const locale of LOCALES) expect(byId("gauss").note[locale], locale).toContain("e^(t²)");
  });

  it("forced2: r² + b r + k = 0 with k = 4 is underdamped at b = 0.5, critical at b = 4, overdamped at b = 5; x_p is the steady state; b = 0, w = 2 resonates", () => {
    const own = ownParams("forced2");
    expect(own).toEqual({ b: 0.5, k: 4, F: 1, w: 1 });
    expect(byId("forced2").params!.map((e) => e.name)).toEqual(discoverParams("second", presetState(byId("forced2"))));
    // b = 0.5: Δ = 0.25 - 16 < 0, r = -1/4 ± i√(63)/4
    const under = formulaOf("forced2", own);
    expect(under.roots.kind).toBe("complex");
    expect(under.roots.kind === "complex" && under.roots.alpha).toEqual(q(-1, 4));
    expect(under.damping).toBe("underdamped");
    // x_p = Re(e^(it)/χ(i)), χ(i) = -1 + 0.5i + 4 = 3 + i/2, |χ|² = 37/4: x_p = (12/37) cos t + (2/37) sin t, no resonance
    expect(hasResonance(under)).toBe(false);
    expect(particularRealForm(under)).toEqual([{ alpha: q(0), beta: q(1), cos: [q(12, 37)], sin: [q(2, 37)] }]);
    // b = 4: Δ = 16 - 16 = 0, the repeated root -b/2 = -2
    const critical = formulaOf("forced2", { ...own, b: 4 });
    expect(critical.roots).toEqual({ kind: "repeated", root: q(-2) });
    expect(critical.damping).toBe("critical");
    // b = 5: Δ = 25 - 16 = 9, r = (-5 ± 3)/2 = -1, -4
    const over = formulaOf("forced2", { ...own, b: 5 });
    expect(over.roots).toEqual({ kind: "distinct", r1: q(-1), r2: q(-4) });
    expect(over.damping).toBe("overdamped");
    // b = 0, w = 2: χ(2i) = -4 + 4 = 0, χ'(2i) = 4i, x_p = Re(t e^(2it)/(4i)) = (t/4) sin 2t
    const resonant = formulaOf("forced2", { ...own, b: 0, w: 2 });
    expect(hasResonance(resonant)).toBe(true);
    expect(resonant.parts.every((p) => p.multiplicity === 1)).toBe(true);
    expect(particularRealForm(resonant)).toEqual([{ alpha: q(0), beta: q(2), cos: [], sin: [q(0), q(1, 4)] }]);
    // the sliders reach both lessons: b past 2√k = 4, w past √k = 2, both on the grid
    const [b, w] = byId("forced2").sliders!;
    expect(b.name).toBe("b");
    expect(b.min).toBeLessThan(4);
    expect(b.max).toBeGreaterThan(4);
    expect(snapToSlider(4, b)).toBe(4);
    expect(snapToSlider(0, b)).toBe(0);
    expect(w.name).toBe("w");
    expect(snapToSlider(2, w)).toBe(2);
    for (const locale of LOCALES) expect(byId("forced2").note[locale], locale).toContain("(t/4)·sin(2t)");
  });

  it("cooling: dy/dt + k y = 1, the root -k and y_p = 1/k; from y(0) = 0, C = -1 at k = 1; at k = 0 the trial gets the factor t", () => {
    const one = formulaOf("cooling", ownParams("cooling"));
    expect(ownParams("cooling")).toEqual({ k: 1 });
    expect(one.roots).toEqual({ kind: "single", root: q(-1) });
    expect(particularRealForm(one)).toEqual([{ alpha: q(0), beta: q(0), cos: [q(1)], sin: [] }]);
    // y = C e^(-t) + 1 with y(0) = 0: C = -1, y = 1 - e^(-t)
    expect(constantsFor(one, q(0), [q(0)]).exact).toEqual([q(-1)]);
    // k = 1/2: y_p = 1/k = 2
    expect(particularRealForm(formulaOf("cooling", { k: 0.5 }))).toEqual([{ alpha: q(0), beta: q(0), cos: [q(2)], sin: [] }]);
    // k = 0: dy/dt = 1, the root 0 is the exponent of the right-hand side 1 = e^(0 t): y_p = t
    const zero = formulaOf("cooling", { k: 0 });
    expect(zero.roots).toEqual({ kind: "single", root: q(0) });
    expect(hasResonance(zero)).toBe(true);
    expect(particularRealForm(zero)).toEqual([{ alpha: q(0), beta: q(0), cos: [q(0), q(1)], sin: [] }]);
    expect(snapToSlider(0, byId("cooling").sliders![0])).toBe(0);
    for (const locale of LOCALES) expect(byId("cooling").note[locale], locale).toContain("1 − e^(−t)");
  });

  it("resonance-formula: x_p = cos t/(w² - 1) = (4/5) cos t at w = 1.5, from rest C1 = -4/5, C2 = 0; at w = 1 x_p = (t/2) sin t with multiplicity 1", () => {
    const own = ownParams("resonance-formula");
    expect(own).toEqual({ w: 1.5 });
    const f = formulaOf("resonance-formula", own);
    // r² + 9/4 = 0: r = ±(3/2) i
    expect(f.roots).toEqual({ kind: "complex", alpha: q(0), beta: { exact: q(3, 2) } });
    expect(hasResonance(f)).toBe(false);
    expect(particularRealForm(f)).toEqual([{ alpha: q(0), beta: q(1), cos: [q(4, 5)], sin: [] }]);
    // x(0) = C1 + 4/5 = 0, x'(0) = (3/2) C2 = 0
    expect(constantsFor(f, q(0), [q(0), q(0)]).exact).toEqual([q(-4, 5), q(0)]);
    // w = 1: χ(i) = 0, χ'(i) = 2i, x_p = Re(t e^(it)/(2i)) = (t/2) sin t
    const resonant = formulaOf("resonance-formula", { w: 1 });
    expect(hasResonance(resonant)).toBe(true);
    expect(resonant.parts.every((p) => p.multiplicity === 1)).toBe(true);
    expect(particularRealForm(resonant)).toEqual([{ alpha: q(0), beta: q(1), cos: [], sin: [q(0), q(1, 2)] }]);
    expect(snapToSlider(1, byId("resonance-formula").sliders![0])).toBe(1);
    for (const locale of LOCALES) {
      expect(byId("resonance-formula").note[locale], locale).toContain("(cos t − cos(1.5t))/1.25");
      expect(byId("resonance-formula").note[locale], locale).toContain("(t/2)·sin t");
    }
  });
});
