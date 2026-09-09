import { describe, expect, it } from "vitest";
import { compileSystem } from "./core/parse";
import { toSystem } from "./core/slope-field";
import type { Vec2 } from "./core/types";
import {
  computeFeatures,
  expandBox,
  featuresBoxFor,
  fixedStopBox,
  HOVER_DIAGONALS,
  HOVER_STEP_CAP,
  hoverStopBox,
  markNonUnique,
  NON_UNIQUE_REL_TOL,
  screenMetric,
  traceBoth,
  traceFixed,
  tracePreview,
  withUniqueness,
} from "./interactive";
import { fitViewport, panBy, zoomAt } from "./render/viewport";
import type { TrajectoryView } from "./scene";

const box = { x: { min: -2, max: 2 }, y: { min: -2, max: 2 } };
const screenLength = (t: TrajectoryView, metric: (a: Vec2, b: Vec2) => number) =>
  t.points.slice(1).reduce((s, p, i) => s + metric(t.points[i], p), 0);

describe("computeFeatures", () => {
  it("returns equilibria for a system", () => {
    const f = computeFeatures(compileSystem({ f: "x", g: "-y" }), null, box, "en");
    expect(f.equilibria).toHaveLength(1);
    expect(f.equilibria![0].classification).toBe("saddle");
    expect(f.firstOrder).toBeUndefined();
  });

  it("returns first-order features including the implicit curves of an exact equation", () => {
    const spec = { kind: "differential" as const, M: "2*t*y", N: "t^2 + y^2" };
    const f = computeFeatures(compileSystem(toSystem(spec)), spec, box, "zh");
    expect(f.firstOrder?.forms?.map((x) => x.form)).toContain("exact");
    expect(f.firstOrder?.implicit?.levels.length).toBeGreaterThan(3);
    expect(f.firstOrder?.singularities).toHaveLength(1);
    expect(f.firstOrder?.expr).toBe("(2*t*y) dt + (t^2 + y^2) dy = 0");
  });

  it("a non-autonomous system gets timeDependent instead of equilibria, with the snapshot time it was asked for", () => {
    // x' = y, y' = -x + sin(t): the field changes by up to sin(1.4142) ≈ 0.98777 over the probe
    // times, |F| <= hypot(2, 3) < 3.61 on this box -> relative deviation above 0.27.
    const sys = compileSystem({ f: "y", g: "-x + sin(t)" });
    const f = computeFeatures(sys, null, box, "en");
    expect(f.equilibria).toBeUndefined();
    expect(f.warning).toBeUndefined();
    expect(f.firstOrder).toBeUndefined();
    expect(f.timeDependent?.snapshotT).toBe(0);
    expect(f.timeDependent!.maxRelDeviation).toBeGreaterThan(0.27);
    expect(computeFeatures(sys, null, box, "en", { snapshotT: 1.5 }).timeDependent?.snapshotT).toBe(1.5);
    // The autonomous oscillator keeps its equilibrium and gets no timeDependent.
    const auto = computeFeatures(compileSystem({ f: "y", g: "-x" }), null, box, "en", { snapshotT: 1.5 });
    expect(auto.timeDependent).toBeUndefined();
    expect(auto.equilibria).toHaveLength(1);
  });

  it("carries the singular points' continuum verdict into the first-order view (J review C.7)", () => {
    const spec = { kind: "differential" as const, M: "y", N: "y*t" };
    const f = computeFeatures(compileSystem(toSystem(spec)), spec, box, "en");
    expect(f.firstOrder?.singularitiesWarning).toBe("possible_continuum");
    const isolated = { kind: "differential" as const, M: "2*t*y", N: "t^2 + y^2" };
    expect(computeFeatures(compileSystem(toSystem(isolated)), isolated, box, "en").firstOrder?.singularitiesWarning).toBeUndefined();
  });

  it("the verdict is static: 0*t + y, a 1e-6 forcing on a huge box and a forcing localized away from every sample all get timeDependent, never equilibria (J review C.5)", () => {
    // t appears in each of them; the probe measures 0, ~1e-10 and 0 respectively, and the origin
    // would otherwise be listed as a center for a system that has no equilibrium for all t.
    const huge = { x: { min: -1e4, max: 1e4 }, y: { min: -1e4, max: 1e4 } };
    for (const [f, g, b] of [["0*t + y", "-x", box], ["y", "-x + 1e-6*sin(t)", huge], ["y", "-x + exp(-2000*x^2)*sin(t)", box]] as const) {
      const r = computeFeatures(compileSystem({ f, g }), null, b, "en", { snapshotT: 1.5 });
      expect(r.equilibria, `${f} | ${g}`).toBeUndefined();
      expect(r.timeDependent?.snapshotT, `${f} | ${g}`).toBe(1.5);
    }
    // sqrt(t - 5) is undefined at every fixed probe time: still time-dependent, and the snapshot
    // time 10 joins the probe, where the field is finite (the domain moves: Infinity).
    const moving = computeFeatures(compileSystem({ f: "y", g: "-x*sqrt(t - 5)" }), null, box, "en", { snapshotT: 10 });
    expect(moving).toEqual({ timeDependent: { snapshotT: 10, maxRelDeviation: Infinity } });
  });

  it("honours a verdict measured elsewhere (the shells measure it once on the entered box)", () => {
    const sys = compileSystem({ f: "y", g: "-x" });
    const f = computeFeatures(sys, null, box, "en", { timeDependence: { dependsOnT: true, maxRelDeviation: 0.5, samples: 13 } });
    expect(f).toEqual({ timeDependent: { snapshotT: 0, maxRelDeviation: 0.5 } });
  });

  it("a first-order equation whose right-hand side mentions t is never time-dependent: t is its horizontal coordinate", () => {
    const spec = { kind: "explicit" as const, g: "sin(t)" };
    const f = computeFeatures(compileSystem(toSystem(spec)), spec, box, "en");
    expect(f.timeDependent).toBeUndefined();
    expect(f.firstOrder?.autonomous).toBe(false);
  });

  it("uses the locale for the no-form note", () => {
    const spec = { kind: "explicit" as const, g: "t^2 + y^2" };
    const sys = compileSystem(toSystem(spec));
    const b = { x: { min: 0.3, max: 3 }, y: { min: 0.3, max: 3 } };
    expect(computeFeatures(sys, spec, b, "en").firstOrder?.formsNote).toMatch(/Riccati/);
    expect(computeFeatures(sys, spec, b, "zh").firstOrder?.formsNote).toMatch(/Riccati/);
    expect(computeFeatures(sys, spec, b, "zh").firstOrder?.formsNote).not.toBe(computeFeatures(sys, spec, b, "en").firstOrder?.formsNote);
  });
});

describe("the features box at the home view is the entered range, whatever the canvas shows", () => {
  const home = { x: { min: -2, max: 2 }, y: { min: -2, max: 2 } };

  it("equilibria sitting in the equal-scale margin are not listed at the home view", () => {
    // A 720 x 520 canvas over the 4 x 4 box gives 130 px/unit, so the visible box is 720/130 = 5.538
    // wide: x in [-2.769, 2.769]. x' = x² - 6.25, y' = -y has its equilibria at (±2.5, 0), inside
    // that margin but outside the entered range. At the home view they must not appear, in either
    // equal-scale mode and on a phone-shaped canvas (whose margin is in y) alike.
    const desktop = fitViewport(home, 720, 520);
    expect(desktop.box.x.max).toBeCloseTo(720 / 130 / 2, 9);
    expect(desktop.box.y.max).toBeCloseTo(2, 12);
    const phone = fitViewport(home, 375, 812);
    expect(phone.box.y.max).toBeCloseTo(812 / 93.75 / 2, 9);
    const filled = fitViewport(home, 720, 520, { equalScale: false });
    for (const vp of [desktop, phone, filled]) expect(featuresBoxFor(home, vp.box, true)).toEqual(home);

    const sys = compileSystem({ f: "x^2 - 6.25", g: "-y" });
    expect(computeFeatures(sys, null, featuresBoxFor(home, desktop.box, true), "en").equilibria).toHaveLength(0);
    // the same margin box, used directly, would have listed both: that is the difference the rule makes
    const inMargin = computeFeatures(sys, null, desktop.box, "en").equilibria!;
    expect(inMargin.map((e) => Math.round(e.at.x * 1e6) / 1e6).sort((a, b) => a - b)).toEqual([-2.5, 2.5]);
  });

  it("after a zoom or a pan the features box is the visible box", () => {
    const vp = fitViewport(home, 720, 520);
    const zoomed = zoomAt(vp, { x: 360, y: 260 }, 2, { original: home });
    expect(featuresBoxFor(home, zoomed.box, false)).toEqual(zoomed.box);
    expect(featuresBoxFor(home, zoomed.box, false)).not.toEqual(home);
    const panned = panBy(vp, 100, 0);
    expect(featuresBoxFor(home, panned.box, false)).toEqual(panned.box);
  });
});

describe("expandBox and stop boxes", () => {
  it("expandBox grows symmetrically", () => {
    expect(expandBox(box, 1)).toEqual({ x: { min: -6, max: 6 }, y: { min: -6, max: 6 } });
    expect(expandBox({ x: { min: 0, max: 1 }, y: { min: 0, max: 2 } }, 0.5)).toEqual({ x: { min: -0.5, max: 1.5 }, y: { min: -1, max: 3 } });
  });

  it("the fixed stop box is 20 times the home box in each dimension", () => {
    const s = fixedStopBox({ x: { min: -3, max: 3 }, y: { min: -1, max: 1 } });
    expect(s.x.max - s.x.min).toBeCloseTo(120, 12);
    expect(s.y.max - s.y.min).toBeCloseTo(40, 12);
    expect((s.x.min + s.x.max) / 2).toBeCloseTo(0, 12);
  });
});

describe("hover preview length is measured on screen (H2.2)", () => {
  const viewport = fitViewport(box, 400, 400); // 100 px per world unit
  const metric = screenMetric(viewport);
  const limit = HOVER_DIAGONALS * Math.hypot(400, 400);

  it("a fast field and a slow field give previews of the same on-screen length", () => {
    // Both systems have circular orbits through (1, 0); the fast one goes round 100 times faster.
    const slow = tracePreview(compileSystem({ f: "y", g: "-x" }), { x: 1, y: 0 }, viewport);
    const fast = tracePreview(compileSystem({ f: "100*y", g: "-100*x" }), { x: 1, y: 0 }, viewport);
    for (const t of [...slow, ...fast]) {
      expect(t.status).toBe("arc_length");
      expect(screenLength(t, metric)).toBeCloseTo(limit, 6);
      expect(t.steps).toBeLessThanOrEqual(HOVER_STEP_CAP);
    }
    // The fast preview took far fewer time units for the same picture.
    expect(Math.abs(fast[0].tEnd)).toBeLessThan(Math.abs(slow[0].tEnd) / 50);
    // A field ten times slower than the unit oscillator has the same orbits and must get the same
    // preview: the old 50-time-unit cap cut it short (review C12).
    const slower = tracePreview(compileSystem({ f: "0.1*y", g: "-0.1*x" }), { x: 1, y: 0 }, viewport);
    for (const t of slower) {
      expect(t.status).toBe("arc_length");
      expect(screenLength(t, metric)).toBeCloseTo(limit, 6);
    }
  });

  it("the stop box is far enough that a straight preview from the canvas edge is cut by length, not by the box (non-square canvas)", () => {
    const wide = fitViewport(box, 640, 435);
    const lim = HOVER_DIAGONALS * Math.hypot(640, 435);
    const m = screenMetric(wide);
    // vertical field, start at the top edge of the visible box: the box would cut it 4 short sides away
    const start = { x: 0, y: wide.box.y.max };
    const up = tracePreview(compileSystem({ f: "0", g: "1" }), start, wide);
    expect(up[0].status).toBe("arc_length");
    expect(screenLength(up[0], m)).toBeCloseTo(lim, 6);
    const stop = hoverStopBox(wide.box);
    expect(stop.y.max - wide.box.y.max).toBeGreaterThan(lim / (435 / (wide.box.y.max - wide.box.y.min)));
  });

  it("zooming in keeps the on-screen length: fewer world units, same pixels", () => {
    const zoomed = zoomAt(viewport, { x: 200, y: 200 }, 4, { original: box });
    const sys = compileSystem({ f: "1", g: "0" });
    const wide = tracePreview(sys, { x: 0, y: 0 }, viewport)[0];
    const close = tracePreview(sys, { x: 0, y: 0 }, zoomed)[0];
    expect(screenLength(wide, metric)).toBeCloseTo(limit, 6);
    expect(screenLength(close, screenMetric(zoomed))).toBeCloseTo(limit, 6);
    // In world units the zoomed preview is four times shorter: 1131 px / 400 px-per-unit.
    const worldLen = (t: TrajectoryView) => Math.abs(t.points[t.points.length - 1].x);
    expect(worldLen(wide)).toBeCloseTo(limit / 100, 6);
    expect(worldLen(close)).toBeCloseTo(limit / 400, 6);
  });

  it("the screen metric is anisotropic: under unequal pixel scales a unit step measures sx px horizontally and sy px vertically", () => {
    // sx = 600/300 = 2 px/unit, sy = 300/300 = 1 px/unit
    const m = screenMetric({ box: { x: { min: 0, max: 300 }, y: { min: 0, max: 300 } }, width: 600, height: 300 });
    expect(m({ x: 10, y: 10 }, { x: 11, y: 10 })).toBeCloseTo(2, 12);
    expect(m({ x: 10, y: 10 }, { x: 10, y: 11 })).toBeCloseTo(1, 12);
    expect(m({ x: 10, y: 10 }, { x: 11, y: 11 })).toBeCloseTo(Math.sqrt(5), 12);
  });

  it("under unequal scales the preview keeps its on-screen length and the stop box still does not cut it", () => {
    // Filled 720 x 520 canvas over the 4 x 4 box: sx = 180, sy = 130 px/unit; limit = 2 diagonals.
    const filled = fitViewport(box, 720, 520, { equalScale: false });
    const lim = HOVER_DIAGONALS * Math.hypot(720, 520);
    const m = screenMetric(filled);
    // vertical field from the top edge: the stop box is 4 box heights = 16 units away; the preview
    // needs lim / 130 = 13.67 units, so it is cut by length
    const up = tracePreview(compileSystem({ f: "0", g: "1" }), { x: 0, y: 2 }, filled)[0];
    expect(up.direction).toBe("forward");
    expect(up.status).toBe("arc_length");
    expect(screenLength(up, m)).toBeCloseTo(lim, 6);
    expect(up.points[up.points.length - 1].y - 2).toBeCloseTo(lim / 130, 6);
    // horizontal field: the same pixels are fewer world units along x (180 px/unit)
    const right = tracePreview(compileSystem({ f: "1", g: "0" }), { x: 0, y: 0 }, filled)[0];
    expect(right.status).toBe("arc_length");
    expect(screenLength(right, m)).toBeCloseTo(lim, 6);
    expect(right.points[right.points.length - 1].x).toBeCloseTo(lim / 180, 6);
  });

  it("a preview that reaches an equilibrium or leaves the stop box is shorter, and says why", () => {
    const t = tracePreview(compileSystem({ f: "-x", g: "-y" }), { x: 1, y: 1 }, viewport);
    expect(t[0].status).toBe("reached_equilibrium");
    expect(screenLength(t[0], metric)).toBeLessThan(limit);
  });
});

describe("fixed trajectories extend by the solution, not the view (H2.3)", () => {
  it("clicked in a 10x zoomed view, the curve runs far beyond the visible range", () => {
    const home = { x: { min: -3, max: 3 }, y: { min: -3, max: 3 } };
    const v = zoomAt(fitViewport(home, 600, 600), { x: 300, y: 300 }, 10, { original: home });
    expect(v.box.x.max - v.box.x.min).toBeCloseTo(0.6, 9); // the visible range is now ±0.3
    const [fwd, back] = traceFixed(compileSystem({ f: "1", g: "0" }), { x: 0, y: 0 }, home);
    // x' = 1 for 50 time units: x = 50, inside the 20x stop box (±60) -> completed, not truncated.
    expect(fwd.status).toBe("completed");
    expect(fwd.points[fwd.points.length - 1].x).toBeCloseTo(50, 6);
    expect(back.points[back.points.length - 1].x).toBeCloseTo(-50, 6);
    expect(fwd.points[fwd.points.length - 1].x).toBeGreaterThan(v.box.x.max * 100);
  });

  it("stops at 20x the home box, wherever the view is", () => {
    const home = { x: { min: -1, max: 1 }, y: { min: -1, max: 1 } };
    const [fwd] = traceFixed(compileSystem({ f: "5", g: "0" }), { x: 0, y: 0 }, home);
    // Stop box is ±20; x = 5t reaches 20 at t = 4 (< 50) -> left_box, cut exactly on the border.
    expect(fwd.status).toBe("left_box");
    expect(fwd.stop).toBe("far");
    const end = fwd.points[fwd.points.length - 1];
    expect(end.x).toBeCloseTo(20, 9);
    expect(fwd.tEnd).toBeCloseTo(4, 9);
  });

  it("a curve traced at a snapshot time starts there: for x' = 0, y' = cos(t) the same point at another time gives another curve", () => {
    // y(t) = y0 + sin(t) - sin(t0) from (0, 0), over one time unit (the speed |cos t| stays above
    // cos 1 = 0.54 on every interval used, so no speed-based stop can fire):
    //   t0 = 0  forward  -> y(1)     = sin 1,   tEnd = 1
    //   t0 = π  forward  -> y(π + 1) = -sin 1,  tEnd = π + 1   (the mirror image of the t0 = 0 curve)
    //   t0 = π  backward -> y(π - 1) = sin 1,   tEnd = π - 1
    const sys = compileSystem({ f: "0", g: "cos(t)" });
    const wide = { x: { min: -5, max: 5 }, y: { min: -5, max: 5 } };
    const [f0] = traceBoth(sys, { x: 0, y: 0 }, { stopBox: wide, tSpan: 1 });
    expect(f0.status).toBe("completed");
    expect(f0.points[f0.points.length - 1].y).toBeCloseTo(Math.sin(1), 5);
    expect(f0.tEnd).toBeCloseTo(1, 9);
    const [fwd, back] = traceBoth(sys, { x: 0, y: 0 }, { stopBox: wide, tSpan: 1, t0: Math.PI });
    expect(fwd.status).toBe("completed");
    expect(fwd.points[fwd.points.length - 1].y).toBeCloseTo(-Math.sin(1), 5);
    expect(fwd.tEnd).toBeCloseTo(Math.PI + 1, 9);
    expect(back.status).toBe("completed");
    expect(back.points[back.points.length - 1].y).toBeCloseTo(Math.sin(1), 5);
    expect(back.tEnd).toBeCloseTo(Math.PI - 1, 9);
  });

  it("traceFixed and tracePreview pass the snapshot time through: times are absolute", () => {
    const sys = compileSystem({ f: "1", g: "0" });
    const home = { x: { min: -1, max: 1 }, y: { min: -1, max: 1 } };
    // x = t - t0 reaches the far box edge 20 at t = t0 + 20 = 23.
    const [fixed] = traceFixed(sys, { x: 0, y: 0 }, home, 3);
    expect(fixed.status).toBe("left_box");
    expect(fixed.tEnd).toBeCloseTo(23, 9);
    // Preview over 100 px/unit: limit/100 world units in limit/100 time units, from t0 = 5.
    const viewport = fitViewport(box, 400, 400);
    const limit = HOVER_DIAGONALS * Math.hypot(400, 400);
    const [preview] = tracePreview(sys, { x: 0, y: 0 }, viewport, 5);
    expect(preview.status).toBe("arc_length");
    expect(preview.tEnd).toBeCloseTo(5 + limit / 100, 6);
  });

  it("traceBoth honours an explicit step cap", () => {
    const [fwd] = traceBoth(compileSystem({ f: "y", g: "-x" }), { x: 1, y: 0 }, { stopBox: box, maxSteps: 7 });
    expect(fwd.status).toBe("max_steps");
    expect(fwd.steps).toBe(7);
  });
});

describe("trajectories through a point where uniqueness fails (J.2)", () => {
  const spec = { kind: "explicit" as const, g: "sqrt(y)" };
  const sys = compileSystem(toSystem(spec));
  // 0 is not a sample point of the y scan (-0.31 + i·1.51/400 = 0 needs i = 82.12).
  const home = { x: { min: -3, max: 3 }, y: { min: -0.31, max: 1.2 } };
  const features = computeFeatures(sys, spec, home, "en");

  it("computeFeatures carries the domain-edge line with its uniqueness verdict", () => {
    expect(features.firstOrder?.solutions).toHaveLength(1);
    expect(features.firstOrder?.solutions[0]).toMatchObject({ y: 0, domainEdge: "above", stability: "edge_leave", uniqueness: { verdict: "unbounded" } });
  });

  it("dy/dt = sqrt(y) from (0, 0.25) backward reaches y = 0 and is flagged; forward it is not", () => {
    // Backward, y = (1/2 + t/2)² reaches 0 at t = -1 in finite time (this is the non-uniqueness):
    // the integrator stops at the domain edge, far closer to the line than 1e-9 · 6. Forward, y
    // grows and leaves the far box without touching the line.
    const pair = markNonUnique(traceFixed(sys, { x: 0, y: 0.25 }, home), features, home);
    const back = pair.find((t) => t.direction === "backward")!;
    const fwd = pair.find((t) => t.direction === "forward")!;
    expect(back.status).toBe("domain_edge");
    expect(Math.abs(back.points[back.points.length - 1].y)).toBeLessThan(NON_UNIQUE_REL_TOL * 6);
    expect(back.nonUnique).toBe(true);
    expect(fwd.nonUnique).toBeUndefined();
  });

  it("from (0, 1) forward is not flagged", () => {
    const [fwd] = markNonUnique(traceFixed(sys, { x: 0, y: 1 }, home), features, home);
    expect(fwd.direction).toBe("forward");
    expect(fwd.status).toBe("left_box");
    expect(fwd.nonUnique).toBeUndefined();
  });

  it("a curve starting ON the line is flagged by its start point", () => {
    const pair = markNonUnique(traceFixed(sys, { x: 0, y: 0 }, home), features, home);
    expect(pair.every((t) => t.nonUnique)).toBe(true);
  });

  it("returns the very same array when no feature is non-unique (the logistic equation)", () => {
    const lspec = { kind: "explicit" as const, g: "y*(1-y)" };
    const lsys = compileSystem(toSystem(lspec));
    const lhome = { x: { min: 0, max: 6 }, y: { min: -0.5, max: 2 } };
    const lf = computeFeatures(lsys, lspec, lhome, "en");
    expect(lf.firstOrder?.solutions.map((s) => s.uniqueness?.verdict)).toEqual(["bounded_at_tested_scales", "bounded_at_tested_scales"]);
    const pair = traceFixed(lsys, { x: 3, y: 0.5 }, lhome);
    expect(markNonUnique(pair, lf, lhome)).toBe(pair);
  });

  it("a planar equilibrium with unbounded quotients flags the curve through it, even when no step lands on it", () => {
    // x' = sqrt|x|, y' = -y from (0.25, 0): backward, x = ((1 + t)/2)² reaches the origin at t = -1
    // and continues into x < 0 (the field is defined there), so the curve CROSSES the origin; the
    // segment test catches it whether or not an integration step lands within 4e-9 of it.
    const psys = compileSystem({ f: "sqrt(abs(x))", g: "-y" });
    const pbox = { x: { min: -2, max: 2 }, y: { min: -2, max: 2 } };
    const pf = computeFeatures(psys, null, pbox, "en");
    expect(pf.equilibria).toHaveLength(1);
    expect(pf.equilibria![0].uniqueness).toMatchObject({ verdict: "unbounded", along: "x" });
    expect(pf.equilibria![0].uniqueness!.exponent).toBeCloseTo(0.5, 6);
    const pair = markNonUnique(traceFixed(psys, { x: 0.25, y: 0 }, pbox), pf, pbox);
    expect(pair.find((t) => t.direction === "backward")!.nonUnique).toBe(true);
    // forward, x only grows: never near the origin
    expect(pair.find((t) => t.direction === "forward")!.nonUnique).toBeUndefined();
  });

  it("computeFeatures and withUniqueness attach a bounded verdict to the equilibria of a smooth system", () => {
    const lin = compileSystem({ f: "x", g: "-y" });
    const f = computeFeatures(lin, null, box, "en");
    expect(f.equilibria![0].uniqueness?.verdict).toBe("bounded_at_tested_scales");
    const raw = computeFeatures(lin, null, box, "en").equilibria!.map(({ uniqueness: _u, ...rest }) => rest);
    expect(withUniqueness(lin, raw, box)[0].uniqueness?.verdict).toBe("bounded_at_tested_scales");
    // a bounded verdict never flags anything
    const pair = traceFixed(lin, { x: 0, y: 1 }, box);
    expect(markNonUnique(pair, f, box)).toBe(pair);
  });
});

describe("the non-unique flag follows the curve, not the entered box (review J)", () => {
  const spec = { kind: "explicit" as const, g: "sqrt(y)" };
  const sys = compileSystem(toSystem(spec));
  const probe = { sys, firstOrder: spec };
  const flags = (pair: TrajectoryView[]) => pair.map((t) => [t.direction, t.status, t.nonUnique ?? false]);

  it("dy/dt = sqrt(y) clicked at (0, 2): the backward curve reaches y = 0 in finite time on every box, including y in [1, 4] where the line is not listed", () => {
    // y = ((t + 2 sqrt 2) / 2)² backward reaches 0 at t = -2 sqrt 2 and stops at the domain edge
    // (below 0 the equation is undefined). With the home box y in [1, 4] the constant solution
    // y = 0 lies outside the features box and the listed features alone cannot flag the curve; the
    // probe over the curve's own extent finds the line and its unbounded quotients. The answer is
    // the same on the three boxes.
    for (const yr of [{ min: 1, max: 4 }, { min: 0, max: 4 }, { min: -1, max: 4 }]) {
      const home = { x: { min: -3, max: 3 }, y: yr };
      const features = computeFeatures(sys, spec, home, "en");
      const pair = markNonUnique(traceFixed(sys, { x: 0, y: 2 }, home), features, home, probe);
      expect(flags(pair), `y in [${yr.min}, ${yr.max}]`).toEqual([["forward", "left_box", false], ["backward", "domain_edge", true]]);
    }
    // the fast path alone (no probe) depends on the box: this is the defect being fixed
    const narrow = { x: { min: -3, max: 3 }, y: { min: 1, max: 4 } };
    expect(computeFeatures(sys, spec, narrow, "en").firstOrder?.solutions).toEqual([]);
    expect(markNonUnique(traceFixed(sys, { x: 0, y: 2 }, narrow), computeFeatures(sys, spec, narrow, "en"), narrow).every((t) => !t.nonUnique)).toBe(true);
  });

  it("a curve that CROSSES a non-unique line outside the box is flagged: dy/dt = sqrt|y| from (0, 1) with y in [0.5, 2]", () => {
    // Backward from y = 1, y decreases through 0 (sqrt|y| > 0 on both sides, the field never
    // stops) and leaves the far box below; the segment test against the line found in the curve's
    // own extent catches the crossing. The same curve on y in [-2, 2] is flagged by the listed line.
    const aspec = { kind: "explicit" as const, g: "sqrt(abs(y))" };
    const asys = compileSystem(toSystem(aspec));
    for (const yr of [{ min: 0.5, max: 2 }, { min: -2, max: 2 }]) {
      const home = { x: { min: -3, max: 3 }, y: yr };
      const pair = markNonUnique(traceFixed(asys, { x: 0, y: 1 }, home), computeFeatures(asys, aspec, home, "en"), home, { sys: asys, firstOrder: aspec });
      const back = pair.find((t) => t.direction === "backward")!;
      expect(Math.min(...back.points.map((p) => p.y)), `y in [${yr.min}, ${yr.max}]`).toBeLessThan(0);
      expect(back.nonUnique, `y in [${yr.min}, ${yr.max}]`).toBe(true);
      expect(pair.find((t) => t.direction === "forward")!.nonUnique).toBeUndefined();
    }
  });

  it("a curve starting on the line is flagged even when the line is outside the box", () => {
    const home = { x: { min: -3, max: 3 }, y: { min: 1, max: 4 } };
    const pair = markNonUnique(traceFixed(sys, { x: 0, y: 0 }, home), computeFeatures(sys, spec, home, "en"), home, probe);
    expect(pair.every((t) => t.nonUnique)).toBe(true);
  });

  // Along y = 0, x = ((t + 2 sqrt 2) / 2)² reaches 0 at t = -2 sqrt 2 and continues into x < 0: the
  // curve of x' = sqrt|x|, y' = -y from (2, 0) crosses the equilibrium, whose quotients along x
  // grow like δ^-1/2. From (2, 0.5) it crosses x = 0 at y = 0.5 e^{2 sqrt 2} ≈ 8.5, far from the
  // equilibrium, and is not flagged: the flag is about the equilibrium point, as for the features.
  const psys = compileSystem({ f: "sqrt(abs(x))", g: "-y" });
  const pprobe = { sys: psys, firstOrder: null };

  it("planar: the curve through the origin is flagged when the box lists the equilibrium (x in [-2, 2]); the one beside it is not", () => {
    const home = { x: { min: -2, max: 2 }, y: { min: -2, max: 2 } };
    const features = computeFeatures(psys, null, home, "en");
    const through = markNonUnique(traceFixed(psys, { x: 2, y: 0 }, home), features, home, pprobe);
    expect(through.find((t) => t.direction === "backward")!.nonUnique).toBe(true);
    expect(through.find((t) => t.direction === "forward")!.nonUnique).toBeUndefined();
    const beside = markNonUnique(traceFixed(psys, { x: 2, y: 0.5 }, home), features, home, pprobe);
    expect(beside.every((t) => !t.nonUnique)).toBe(true);
    // the same curve traced from a box that does not contain the origin is not flagged by the
    // listed features alone (no equilibrium is listed there)
    const narrow = { x: { min: 1, max: 3 }, y: { min: -2, max: 2 } };
    expect(computeFeatures(psys, null, narrow, "en").equilibria).toEqual([]);
  });

  // The probe searches a square box around each speed minimum of the curve with findEquilibria;
  // the backward curve's speed minimum is at x = 2.4e-8, and the box around it (half-side 1.2e-7,
  // the neighbouring steps) contains the origin. findEquilibria, however, converges to this cusp
  // equilibrium only on the box [-0.5, 0.5]² (a seed happens to land on x = 0); on every other box
  // tried (half-widths 0.1 down to 1e-7, centred at 0 or offset) Newton / LM oscillate at the
  // cusp (the Newton step of sqrt|x| is the mirror image) and report none_found. Until the
  // planar finder locates cusp equilibria (lib/core/equilibria.ts, outside this module), the
  // curve-based flag cannot fire here. Derived expectation kept; marked as a known failure.
  it.fails("planar: the same curve is flagged from the box x in [1, 3] (depends on findEquilibria locating a cusp equilibrium)", () => {
    const narrow = { x: { min: 1, max: 3 }, y: { min: -2, max: 2 } };
    const through = markNonUnique(traceFixed(psys, { x: 2, y: 0 }, narrow), computeFeatures(psys, null, narrow, "en"), narrow, pprobe);
    expect(through.find((t) => t.direction === "backward")!.nonUnique).toBe(true);
  });

  it("planar: a curve that ends at a smooth sink outside the box is probed and not flagged: x' = -(x - 5), y' = -y from (2, 0) with x in [1, 3]", () => {
    // Forward, the curve reaches (5, 0) (reached_equilibrium) outside the box; the equilibrium is
    // found in the box around the speed minimum and its quotients are bounded (D = 1): no flag.
    const lin = compileSystem({ f: "-(x - 5)", g: "-y" });
    const narrow = { x: { min: 1, max: 3 }, y: { min: -2, max: 2 } };
    const pair = traceFixed(lin, { x: 2, y: 0 }, narrow);
    expect(pair.find((t) => t.direction === "forward")!.status).toBe("reached_equilibrium");
    expect(markNonUnique(pair, computeFeatures(lin, null, narrow, "en"), narrow, { sys: lin, firstOrder: null })).toBe(pair);
  });

  it("returns the same array when the probe finds nothing, and does not probe a non-autonomous system", () => {
    const lspec = { kind: "explicit" as const, g: "y*(1-y)" };
    const lsys = compileSystem(toSystem(lspec));
    const lhome = { x: { min: 0, max: 6 }, y: { min: -0.5, max: 2 } };
    const pair = traceFixed(lsys, { x: 3, y: 0.5 }, lhome);
    expect(markNonUnique(pair, computeFeatures(lsys, lspec, lhome, "en"), lhome, { sys: lsys, firstOrder: lspec })).toBe(pair);
    // x' = cos(t), y' = -y: equilibria are not defined, so nothing is probed (and nothing thrown)
    const tsys = compileSystem({ f: "cos(t)", g: "-y" });
    const tpair = traceFixed(tsys, { x: 0, y: 1 }, box);
    expect(markNonUnique(tpair, computeFeatures(tsys, null, box, "en"), box, { sys: tsys, firstOrder: null, timeDependent: true })).toBe(tpair);
  });
});
