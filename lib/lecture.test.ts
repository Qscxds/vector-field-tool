/**
 * Round W: lecture mode is a choice of what to PRINT. Expectations follow from the mode's rule
 * (round Y: POSITIONS stay, to 3 significant digits; the EVIDENCE, eigenvalues, trace,
 * determinant, deviations, is hidden; qualitative conclusions and caveats stay in short form; the
 * full line is behind the ⓘ) and from mathematics derived by hand:
 * - x' = y, y' = -x: purely imaginary pair, "center or weak spiral", never "center".
 * - x'' + 2b x' + w² x = 0 at b = w = 1: a repeated root, which must keep its caveat.
 * - x' = sqrt|x|, y' = -y and dy/dt = sqrt(y): the derivative is unbounded at 0, uniqueness fails
 *   there (infinitely many solutions leave the point / the line): the "!" must survive every mode.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileSystem } from "./core/parse";
import { reduceSecondOrder } from "./core/second-order";
import { toSystem, type FirstOrderSpec } from "./core/slope-field";
import type { Box } from "./core/types";
import { computeFeatures } from "./interactive";
import { constantSolutionFolded, equilibriumDetail, labels, LOCALES } from "./labels";
import { constantSolutionLine, constantSolutionTag, equilibriumLine, equilibriumNumbers, lectureCurveNote, lectureNotices, lecturePoint, lectureQueryShort } from "./lecture";

const BOX: Box = { x: { min: -3, max: 3 }, y: { min: -3, max: 3 } };
const planar = (f: string, g: string, params?: Record<string, number>) => computeFeatures(compileSystem({ f, g, ...(params ? { params } : {}) }), null, BOX, "en").equilibria!;
const firstOrder = (g: string, box: Box = BOX) => {
  const spec: FirstOrderSpec = { kind: "explicit", g };
  return { spec, fo: computeFeatures(compileSystem(toSystem(spec)), spec, box, "en").firstOrder! };
};

describe("lecture mode never touches the Scene: the same entries, two ways of printing them", () => {
  it("printing in either mode leaves the equilibrium object exactly as it was, and normal mode is what the shells always printed", () => {
    const [e] = planar("y", "-x - 0.5*y");
    const before = JSON.stringify(e);
    const L = labels("en");
    const normal = equilibriumLine(L, e);
    const lecture = equilibriumLine(L, e, { lecture: true });
    expect(JSON.stringify(e)).toBe(before);
    expect(normal).toEqual({ point: "(0, 0)", text: L.classification.stable_spiral, numbers: equilibriumNumbers(L, e), detail: equilibriumDetail(L, e) });
    expect(normal.numbers).toBe("λ = -0.25 ± 0.9682i · tr = -0.5, det = 1");
    // lecture (round Y): the position stays, the evidence goes: no eigenvalue, trace or determinant on the line
    expect(lecture.point).toBe("(0, 0)");
    expect(lecture.numbers).toBeNull();
    expect(lecture.text).toBe(L.classification.stable_spiral);
    expect(`${lecture.point} ${lecture.text}`).not.toMatch(/λ|tr =|det =|0\.9682/);
    // ... and everything is still one click away: the ⓘ opens the whole normal line first
    expect(lecture.detail[0]).toBe(`(0, 0) ${L.classification.stable_spiral} · λ = -0.25 ± 0.9682i · tr = -0.5, det = 1`);
  });

  it("a second-order picture names its point (x, x') behind the ⓘ; the eigen-direction lines travel as extra detail", () => {
    const red = reduceSecondOrder("x'' + 2*b*x' + w^2*x = 0", { b: 0.25, w: 1 }, { box: BOX });
    const [e] = computeFeatures(compileSystem(red.spec), null, BOX, "en").equilibria!;
    const line = equilibriumLine(labels("en"), e, { secondOrder: true, lecture: true, extra: ["extra line"] });
    expect(line.detail[0].startsWith("(x, x') = (0, 0) ")).toBe(true);
    expect(line.detail.at(-1)).toBe("extra line");
    expect(line.point).toBe("(x, x') = (0, 0)");
  });
});

describe("[Y] positions stay, to at most 3 significant digits", () => {
  it("lecturePoint: (3, 2), (3.14, 0), (-6.28, 0); trailing zeros go; a second-order point names its coordinates", () => {
    const L = labels("en");
    expect(lecturePoint(L, { x: 3, y: 2 })).toBe("(3, 2)");
    expect(lecturePoint(L, { x: Math.PI, y: 0 })).toBe("(3.14, 0)");
    expect(lecturePoint(L, { x: -2 * Math.PI, y: 0 })).toBe("(-6.28, 0)");
    // a root located to 1e-7 of 3 reads 3, not 3.00
    expect(lecturePoint(L, { x: 2.9999999, y: 2.0000001 })).toBe("(3, 2)");
    expect(lecturePoint(L, { x: 0.70710678, y: 1234.5 })).toBe("(0.707, 1230)");
    expect(lecturePoint(L, { x: Math.PI, y: 0 }, true)).toBe("(x, x') = (3.14, 0)");
  });

  it("Lotka-Volterra with a = 1, b = 0.5, c = 0.75, d = 0.25 in lecture mode: (0, 0) saddle and (3, 2) center or weak spiral, no eigenvalues", () => {
    const lvBox: Box = { x: { min: -0.5, max: 8 }, y: { min: -0.5, max: 6 } };
    const eq = computeFeatures(compileSystem({ f: "a*x - b*x*y", g: "d*x*y - c*y", params: { a: 1, b: 0.5, c: 0.75, d: 0.25 } }), null, lvBox, "en").equilibria!;
    const L = labels("en");
    const lines = eq.map((e) => equilibriumLine(L, e, { lecture: true }));
    expect(lines.map((l) => `${l.point} ${l.text}`)).toEqual(["(0, 0) saddle", "(3, 2) center or weak spiral (linearization cannot tell)"]);
    for (const l of lines) expect(l.numbers).toBeNull();
    // the evidence is one click away: ±i sqrt(a c) = ±0.866i
    expect(lines[1].detail[0]).toContain("±0.866i");
  });

  it("the pendulum's saddle reads (x, x') = (3.14, 0) in lecture mode and (3.1416, 0) behind its ⓘ", () => {
    const box: Box = { x: { min: 0.5, max: 5.5 }, y: { min: -3, max: 3 } };
    const saddle = computeFeatures(compileSystem(reduceSecondOrder("x'' = -sin(x)").spec), null, box, "en").equilibria!.find((e) => e.classification === "saddle")!;
    const line = equilibriumLine(labels("en"), saddle, { lecture: true, secondOrder: true });
    expect(line.point).toBe("(x, x') = (3.14, 0)");
    expect(line.detail[0].startsWith("(x, x') = (3.1416, 0) saddle")).toBe(true);
  });
});

describe("the red line: folding numbers never folds honesty", () => {
  it("'center or weak spiral' is still 'center or weak spiral' in lecture mode, in both languages, never 'center'", () => {
    const [e] = planar("y", "-x");
    expect(e.classification).toBe("center_or_weak_spiral");
    for (const locale of LOCALES) {
      const L = labels(locale);
      const line = equilibriumLine(L, e, { lecture: true });
      expect(line.text).toBe(L.classification.center_or_weak_spiral);
      expect(line.text).toMatch(locale === "en" ? /weak spiral/ : /弱螺旋/);
      expect(line.text).toMatch(locale === "en" ? /cannot tell/ : /无法区分/);
      // the full caveat sentence is behind the ⓘ
      expect(line.detail).toContain(L.caveat.center);
    }
  });

  it("a non-hyperbolic point keeps 'linearization is inconclusive' in its name", () => {
    const e = planar("x^2", "-y").find((p) => p.classification === "non_hyperbolic")!;
    const L = labels("en");
    expect(equilibriumLine(L, e, { lecture: true }).text).toBe(L.classification.non_hyperbolic);
    expect(L.classification.non_hyperbolic).toMatch(/linearization is inconclusive/);
    expect(labels("zh").classification.non_hyperbolic).toMatch(/线性化无法判定/);
  });

  it("critical damping b = w keeps the repeated-root caveat as a short phrase (it is not suppressed to look tidy)", () => {
    const red = reduceSecondOrder("x'' + 2*b*x' + w^2*x = 0", { b: 1, w: 1 }, { box: BOX });
    const [e] = computeFeatures(compileSystem(red.spec), null, BOX, "en").equilibria!;
    expect(e.caveat).toBe("repeatedRoot");
    for (const locale of LOCALES) {
      const L = labels(locale);
      const line = equilibriumLine(L, e, { lecture: true, secondOrder: true });
      expect(line.text).toBe(`${L.classification.degenerate_node}${L.ui.lectureJoin}${L.caveatShort.repeatedRoot}`);
      expect(line.detail).toContain(L.caveat.repeatedRoot);
    }
  });

  it("an equilibrium where uniqueness fails keeps its '!' sentence on the line in lecture mode", () => {
    const e = planar("sqrt(abs(x))", "-y").find((p) => Math.hypot(p.at.x, p.at.y) < 1e-6)!;
    expect(e.uniqueness?.verdict).toBe("unbounded");
    for (const locale of LOCALES) {
      const L = labels(locale);
      const line = equilibriumLine(L, e, { lecture: true });
      expect(line.text).toContain(L.uniquenessShort.unbounded);
      expect(L.uniquenessShort.unbounded).toMatch(/^[!！]/);
    }
  });

  it("a constant solution where uniqueness fails keeps the '!' on its line AND on its canvas tag, in both modes", () => {
    const { spec, fo } = firstOrder("sqrt(y)", { x: { min: -2, max: 4 }, y: { min: -0.3, max: 1.5 } });
    const s = fo.solutions[0];
    expect(s.uniqueness?.verdict).toBe("unbounded");
    const L = labels("en");
    const lecture = constantSolutionLine(L, s, spec, true);
    expect(lecture.short).toBe(`Constant solution y = 0: domain edge, solutions leave${L.ui.lectureJoin}${L.uniquenessShort.unbounded}`);
    // the ⓘ opens the normal line and all its detail
    const normal = constantSolutionFolded(L, s, spec);
    expect(lecture.detail).toEqual([normal.short, ...normal.detail]);
    expect(constantSolutionLine(L, s, spec, false)).toEqual(normal);
    expect(constantSolutionTag(L, s, true)).toBe("y = 0 (domain edge, solutions leave) !");
    expect(constantSolutionTag(L, s, false)).toBe("y = 0 (domain edge, solutions leave) !");
  });

  it("an ordinary constant solution keeps its value in lecture mode (3 significant digits); the full sentences stay behind the ⓘ", () => {
    const { spec, fo } = firstOrder("y*(1 - y)", { x: { min: 0, max: 6 }, y: { min: -0.5, max: 2 } });
    const L = labels("en");
    const stable = fo.solutions.find((s) => Math.abs(s.y - 1) < 1e-9)!;
    expect(constantSolutionLine(L, stable, spec, true).short).toBe("Constant solution y = 1: stable");
    expect(constantSolutionLine(L, stable, spec, true).detail[0]).toBe("Constant solution y = 1: stable.");
    expect(constantSolutionTag(L, stable, true)).toBe("y = 1 (stable)");
    expect(constantSolutionTag(L, stable, false)).toBe("y = 1 (stable)");
    // 1.23456: 3 significant digits in lecture mode, 4 decimals otherwise
    expect(constantSolutionTag(L, { y: 1.23456, stability: "stable" }, true)).toBe("y = 1.23 (stable)");
    expect(constantSolutionTag(L, { y: 1.23456, stability: "stable" }, false)).toBe("y = 1.2346 (stable)");
    expect(labels("zh").ui.lectureConstantSolution).toContain("{y}");
  });

  it("a kept curve through a point where uniqueness fails is still said when lecture mode hides the last-trajectory line", () => {
    for (const locale of LOCALES) {
      const L = labels(locale);
      expect(lectureCurveNote(L, [{}, { nonUnique: true }])).toEqual({ short: L.ui.lectureNonUniqueCurve, detail: [L.tool.nonUniqueTrajectory] });
      expect(L.ui.lectureNonUniqueCurve).toMatch(/^[!！]/);
    }
    expect(lectureCurveNote(labels("en"), [{}, {}])).toBeNull();
    expect(lectureCurveNote(labels("en"), [])).toBeNull();
  });

  it("a search warning stays on the page in short form; the other notices fold into one line; nothing is dropped", () => {
    const L = labels("en");
    const lines = [L.warning.possible_continuum, "first note", "second note"];
    expect(lectureNotices(L, "possible_continuum", lines)).toEqual([
      { short: L.warningShort.possible_continuum, detail: [L.warning.possible_continuum] },
      { short: "Notes about this search (2)", detail: ["first note", "second note"] },
    ]);
    expect(lectureNotices(L, undefined, [])).toEqual([]);
    // "hit_limit" is not printed when the truncation sentence says it (equilibriaNotices): then it is not invented here either
    expect(lectureNotices(L, "hit_limit", ["only the first 8 are listed"])).toEqual([{ short: "Notes about this search (1)", detail: ["only the first 8 are listed"] }]);
  });

  it("a query says in a few words whether the target was found; a target that was not reached is never reported as found", () => {
    const L = labels("en");
    expect(lectureQueryShort(L, "ok", 2)).toBe("Found: marked on the picture (2).");
    expect(lectureQueryShort(L, "not_reached_in_span", 0)).toBe(L.queryNoteShort.not_reached_in_span);
    expect(lectureQueryShort(L, "stopped_before_target", 0)).toBe(L.queryNoteShort.stopped_before_target);
    expect(lectureQueryShort(L, "possibly_more_beyond_span", 3)).toMatch(/more crossings/);
  });
});

describe("lecture mode is a front-end state: the tool layer does not know the word", () => {
  const root = join(__dirname, "..");
  const read = (path: string) => readFileSync(join(root, path), "utf8");

  it("no file of the MCP layer, the Scene contract or the kernel mentions lecture mode", () => {
    const files = [
      ...readdirSync(join(root, "app/mcp")).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => `app/mcp/${f}`),
      "lib/scene.ts",
      "app/widget/page.tsx",
      ...readdirSync(join(root, "lib/core")).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => `lib/core/${f}`),
    ];
    expect(files.length).toBeGreaterThan(15);
    for (const file of files) expect(read(file).toLowerCase(), file).not.toContain("lecture");
  });
});
