import { describe, expect, it } from "vitest";
import { compileSystem } from "./core/parse";
import { reduceSecondOrder } from "./core/second-order";
import { compileDifferential, toSystem } from "./core/slope-field";
import {
  addParamRow,
  DEFAULT_PARAM_VALUE,
  defaultSliderRange,
  discoverParams,
  EMPTY_PARAMS,
  formatParamValue,
  freeParamNames,
  looksLikeFunctionCall,
  looksLikeProduct,
  MAX_PARAMS,
  MAX_SLIDER_STEPS,
  paramNameProblem,
  paramsFromEntries,
  paramsInUse,
  paramsRecord,
  paramsText,
  parseParamValue,
  parseSliderRange,
  removeParamRow,
  resolveParams,
  setParamName,
  setParamText,
  setParamValue,
  setSliderField,
  slideParam,
  sliderEntries,
  sliderRangeProblem,
  snapToSlider,
  syncParams,
  toggleSlider,
  withSliders,
  type ParamState,
} from "./params";

const names = (s: ParamState) => s.rows.map((r) => r.name);
const row = (s: ParamState, name: string) => s.rows.find((r) => r.name === name)!;

describe("discoverParams: the parameter area lists exactly the names the equation leaves free", () => {
  it("three unknown symbols in a first-order right-hand side give exactly those three, in order", () => {
    expect(discoverParams("first", { g: "a*y*(1 - y/K) + c*sin(t)" })).toEqual(["a", "K", "c"]);
  });

  it("every mode: M and N share one set, f and g share one set, a second-order equation reads both sides", () => {
    expect(discoverParams("diff", { M: "k*y", N: "m + t" })).toEqual(["k", "m"]);
    expect(discoverParams("system", { f: "a*x - b*x*y", g: "d*x*y - c*y" })).toEqual(["a", "b", "d", "c"]);
    expect(discoverParams("second", { eq: "x'' + 2*b*x' + w^2*x = 0" })).toEqual(["b", "w"]);
    expect(discoverParams("second", { eq: "x'' = -x + F*cos(g*t)" })).toEqual(["F", "g"]);
    // a name used by both expressions is listed once
    expect(discoverParams("system", { f: "k*y", g: "-k*x" })).toEqual(["k"]);
    // only the mode's own expressions are read: the planar f of another mode is ignored
    expect(discoverParams("first", { g: "y*(1 - y)", f: "q*x" })).toEqual([]);
  });

  it("a symbol that cannot be a parameter is left to the compiler's own sentence: x in a first-order equation, y and v in a second-order one", () => {
    expect(discoverParams("first", { g: "k*x" })).toEqual(["k"]);
    expect(discoverParams("second", { eq: "x'' = -k*y" })).toEqual(["k"]);
    expect(discoverParams("second", { eq: "x'' = -k*v - x" })).toEqual(["k"]);
  });

  it("a product missing its * is not a parameter: ty in sin(ty), xy in a system keep the compiler's 'did you mean t*y' error", () => {
    expect(discoverParams("first", { g: "sin(ty)" })).toEqual([]);
    expect(discoverParams("system", { f: "xy", g: "-x" })).toEqual([]);
    expect(discoverParams("second", { eq: "x'' = -tx" })).toEqual([]);
    // ky could be a name of its own: listed, but flagged so the pending row can say how it was read
    expect(discoverParams("first", { g: "ky" })).toEqual(["ky"]);
    expect(looksLikeProduct("ky", "first")).toBe("k*y");
    expect(looksLikeProduct("at", "first")).toBe("a*t");
    expect(looksLikeProduct("kx", "system")).toBe("k*x");
    expect(looksLikeProduct("kx", "first")).toBeNull();
    expect(looksLikeProduct("Ta", "first")).toBeNull();
    expect(looksLikeProduct("k2", "first")).toBeNull();
    expect(looksLikeProduct("theta", "first")).toBeNull();
  });

  it("null while an expression does not parse (mid-typing), also when only one of two does", () => {
    expect(discoverParams("first", { g: "k*" })).toBeNull();
    expect(discoverParams("system", { f: "a*x", g: "b*(" })).toBeNull();
    expect(discoverParams("diff", { M: "", N: "y" })).toBeNull();
  });
});

describe("the value reaches the compiled picture in every mode (derived: k*y = 6 at k = 2, y = 3)", () => {
  it("differential form: M and N are compiled with the same parameter set", () => {
    // M = k*y = 2*3 = 6; N = m + t = 0.5 + 1 = 1.5 at (t, y) = (1, 3)
    const { M, N } = compileDifferential({ kind: "differential", M: "k*y", N: "m + t", params: { k: 2, m: 0.5 } });
    expect(M({ x: 1, y: 3 })).toBe(6);
    expect(N({ x: 1, y: 3 })).toBe(1.5);
  });

  it("explicit first order through toSystem: the field at (t, y) = (0, 3) is (1, 6)", () => {
    const sys = compileSystem(toSystem({ kind: "explicit", g: "k*y", params: { k: 2 } }));
    expect(sys.eval({ x: 0, y: 3 })).toEqual({ x: 1, y: 6 });
  });

  it("resolveParams hands the compiler exactly the used, valid rows", () => {
    let s = syncParams(EMPTY_PARAMS, ["k"]);
    s = setParamText(s, row(s, "k").id, "2");
    const { values } = resolveParams(s, "second", ["k"]);
    expect(values).toEqual({ k: 2 });
    // x'' = -k*x at x = 3 with k = 2: -6
    expect(compileSystem(reduceSecondOrder("x'' = -k*x", values).spec).eval({ x: 3, y: 0 })).toEqual({ x: 0, y: -6 });
  });
});

describe("syncParams: the rows follow the equation and no value is ever lost", () => {
  it("a discovered name gets a row at the default value, marked pending until the student sets a value", () => {
    const s = syncParams(EMPTY_PARAMS, ["k", "L"]);
    expect(names(s)).toEqual(["k", "L"]);
    expect(s.rows.every((r) => r.pending && r.origin === "auto" && r.value === DEFAULT_PARAM_VALUE && r.text === "1")).toBe(true);
    const typed = setParamText(s, row(s, "k").id, "0.8");
    expect(row(typed, "k")).toMatchObject({ text: "0.8", value: 0.8, pending: false });
    expect(row(typed, "L").pending).toBe(true);
  });

  it("changing k from 2 to 3 and back leaves every other value alone", () => {
    let s = syncParams(EMPTY_PARAMS, ["k", "L", "c"]);
    s = setParamText(s, row(s, "L").id, "2.5");
    s = setParamText(s, row(s, "c").id, "-4");
    for (const text of ["2", "3", "2"]) s = setParamText(s, row(s, "k").id, text);
    expect(s.rows.map((r) => [r.name, r.value])).toEqual([["k", 2], ["L", 2.5], ["c", -4]]);
  });

  it("an equation edit that drops L and brings it back restores L's value (remembered, not reset to 1)", () => {
    let s = syncParams(EMPTY_PARAMS, ["k", "L"]);
    s = setParamText(s, row(s, "k").id, "0.8");
    s = setParamText(s, row(s, "L").id, "2");
    s = syncParams(s, ["k"]);
    expect(names(s)).toEqual(["k"]);
    s = syncParams(s, ["k", "L"]);
    expect(row(s, "L")).toMatchObject({ text: "2", value: 2, pending: false });
    expect(row(s, "k").value).toBe(0.8);
  });

  it("the letters typed on the way to a name (a, al, alp, …) leave nothing behind", () => {
    let s = EMPTY_PARAMS;
    for (const used of [["a"], ["al"], ["alp"], ["alph"], ["alpha"]]) s = syncParams(s, used);
    expect(names(s)).toEqual(["alpha"]);
    expect(Object.keys(s.memory)).toEqual([]);
  });

  it("an equation that does not parse right now (null) changes nothing: the same object comes back", () => {
    const s = syncParams(EMPTY_PARAMS, ["k"]);
    expect(syncParams(s, null)).toBe(s);
    expect(syncParams(s, ["k"])).toBe(s);
  });

  it("a row the student added by hand stays although the equation does not use it (yet)", () => {
    let s = addParamRow(EMPTY_PARAMS);
    s = setParamName(s, s.rows[0].id, "r");
    s = setParamText(s, s.rows[0].id, "0.3");
    s = syncParams(s, []);
    expect(names(s)).toEqual(["r"]);
    // the equation starts using r: the same row serves it, value kept
    s = syncParams(s, ["r"]);
    expect(s.rows).toHaveLength(1);
    expect(row(s, "r").value).toBe(0.3);
    // and stops using it: a manual row is the student's to remove
    expect(names(syncParams(s, []))).toEqual(["r"]);
  });

  it("an auto row's name belongs to the equation: setParamName leaves it alone", () => {
    const s = syncParams(EMPTY_PARAMS, ["k"]);
    expect(setParamName(s, row(s, "k").id, "q").rows[0].name).toBe("k");
  });

  it("at most MAX_PARAMS rows", () => {
    const many = Array.from({ length: MAX_PARAMS + 5 }, (_, i) => `p${i}`);
    expect(syncParams(EMPTY_PARAMS, many).rows).toHaveLength(MAX_PARAMS);
    let s = EMPTY_PARAMS;
    for (let i = 0; i < MAX_PARAMS + 3; i++) s = addParamRow(s);
    expect(s.rows).toHaveLength(MAX_PARAMS);
  });
});

describe("removeParamRow: a parameter the equation still uses is never silently reset", () => {
  it("refuses, keeps the row and its value, and names the parameter", () => {
    let s = syncParams(EMPTY_PARAMS, ["k"]);
    s = setParamText(s, row(s, "k").id, "0.8");
    const r = removeParamRow(s, row(s, "k").id, ["k"]);
    expect(r.refused).toBe("k");
    expect(r.state).toBe(s);
    expect(row(r.state, "k").value).toBe(0.8);
  });

  it("removes a row the equation does not use, and a duplicate of a used name", () => {
    let s = addParamRow(syncParams(EMPTY_PARAMS, ["k"]));
    const spare = s.rows[1].id;
    s = setParamName(s, spare, "zz");
    expect(removeParamRow(s, spare, ["k"])).toMatchObject({ refused: null });
    expect(names(removeParamRow(s, spare, ["k"]).state)).toEqual(["k"]);
    const dup = setParamName(s, spare, "k");
    expect(removeParamRow(dup, spare, ["k"]).refused).toBeNull();
    expect(removeParamRow(dup, row(dup, "k").id, ["k"]).refused).toBe("k");
  });
});

describe("values and names: readable problems, never a blank page", () => {
  it("parseParamValue: finite decimals, negative and fractional; the rest with a reason", () => {
    expect(parseParamValue("0.8")).toEqual({ value: 0.8 });
    expect(parseParamValue(" -2.5 ")).toEqual({ value: -2.5 });
    expect(parseParamValue("1e-3")).toEqual({ value: 0.001 });
    expect(parseParamValue("-0")).toEqual({ value: 0 });
    expect(parseParamValue("")).toEqual({ reason: "empty" });
    expect(parseParamValue("1,5")).toEqual({ reason: "notANumber" });
    expect(parseParamValue("pi")).toEqual({ reason: "notANumber" });
    expect(parseParamValue("Infinity")).toEqual({ reason: "notANumber" });
    expect(parseParamValue("2e6")).toEqual({ reason: "outOfRange" });
  });

  it("a value that is mid-edit keeps the last valid number in force and is reported on its row", () => {
    let s = syncParams(EMPTY_PARAMS, ["k"]);
    s = setParamText(s, row(s, "k").id, "0.8");
    s = setParamText(s, row(s, "k").id, "0.");
    expect(row(s, "k")).toMatchObject({ text: "0.", value: 0 });
    s = setParamText(s, row(s, "k").id, "-");
    const resolved = resolveParams(s, "first", ["k"]);
    expect(resolved.values).toEqual({ k: 0 });
    expect(resolved.problems).toEqual([{ id: row(s, "k").id, problem: "notANumber", field: "value" }]);
  });

  it("a name that collides with a reserved symbol is a readable problem, per mode", () => {
    expect(paramNameProblem("k", "first")).toBeNull();
    for (const name of ["t", "x", "y", "pi", "e", "sin"]) expect(paramNameProblem(name, "system")).toBe("reserved");
    expect(paramNameProblem("2k", "first")).toBe("invalid");
    expect(paramNameProblem("", "first")).toBe("empty");
    expect(paramNameProblem("a".repeat(25), "first")).toBe("tooLong");
    // v is the alias of x' in a second-order equation only
    expect(paramNameProblem("v", "second")).toBe("reservedV");
    expect(paramNameProblem("v", "system")).toBeNull();
    expect(paramNameProblem("xd", "second")).toBe("reserved");
  });

  it("resolveParams: an invalid or duplicate row is reported and left out; a parameter-free page compiles as before (values undefined)", () => {
    let s = addParamRow(addParamRow(syncParams(EMPTY_PARAMS, ["k"])));
    s = setParamName(s, s.rows[1].id, "t");
    s = setParamName(s, s.rows[2].id, "k");
    const r = resolveParams(s, "first", ["k"]);
    expect(r.values).toEqual({ k: 1 });
    expect(r.entries).toEqual([{ name: "k", value: 1 }]);
    expect(r.problems).toEqual([
      { id: s.rows[1].id, problem: "reserved", field: "name" },
      { id: s.rows[2].id, problem: "duplicate", field: "name" },
    ]);
    expect(resolveParams(EMPTY_PARAMS, "first", []).values).toBeUndefined();
    // a spare row is kept for the link but not handed to the compiler
    let spare = addParamRow(EMPTY_PARAMS);
    spare = setParamName(spare, spare.rows[0].id, "zz");
    expect(resolveParams(spare, "first", [])).toMatchObject({ values: undefined, entries: [{ name: "zz", value: 1 }] });
  });
});

describe("paramsFromEntries (a link, a preset) and the text of the result lines", () => {
  it("values given, nothing pending; a name the equation also needs but the link lacks is added as pending", () => {
    const s = paramsFromEntries([{ name: "k", value: 0.8 }, { name: "L", value: 2 }], ["k", "L", "c"]);
    expect(s.rows.map((r) => [r.name, r.value, r.pending])).toEqual([["k", 0.8, false], ["L", 2, false], ["c", 1, true]]);
    // a spare entry of the link is a manual row
    expect(paramsFromEntries([{ name: "zz", value: 3 }], ["k"]).rows.map((r) => [r.name, r.origin])).toEqual([["zz", "manual"], ["k", "auto"]]);
  });

  it("setParamValue writes the shortest text that reads back exactly", () => {
    const s = syncParams(EMPTY_PARAMS, ["b"]);
    expect(row(setParamValue(s, s.rows[0].id, 0.1 + 0.2), "b").text).toBe("0.30000000000000004");
    expect(formatParamValue(-0)).toBe("0");
    expect(Number(formatParamValue(1 / 3))).toBe(1 / 3);
  });

  it("paramsInUse: only the names f or g mention, in the spec's order; paramsText joins them", () => {
    const spec = { f: "1", g: "k*y*(1 - y/L)", params: { k: 0.8, spare: 7, L: 2 }, variables: "ty" as const };
    expect(paramsInUse(spec)).toEqual([{ name: "k", value: 0.8 }, { name: "L", value: 2 }]);
    expect(paramsText(paramsInUse(spec))).toBe("k = 0.8, L = 2");
    expect(paramsText(paramsInUse(spec), "，")).toBe("k = 0.8，L = 2");
    expect(paramsInUse({ f: "y", g: "-x" })).toEqual([]);
    expect(paramsText([])).toBe("");
    expect(paramsRecord([])).toBeUndefined();
    expect(paramsRecord([{ name: "a", value: 1 }])).toEqual({ a: 1 });
  });
});

describe("[U] sliders: the range a slider opens with, snapping, the typed range, what travels in a link", () => {
  it("defaultSliderRange: 0 to twice the value, mirrored for a negative one, -1 to 1 around 0; about a hundred round steps", () => {
    // 2 * 0.8 = 1.6, a hundredth of it is 0.016: the largest of 1, 2, 5 x 10^k not above it is 0.01
    expect(defaultSliderRange(0.8)).toEqual({ min: 0, max: 1.6, step: 0.01 });
    // 40 / 100 = 0.4 -> 0.2;  0.5 / 100 = 0.005 -> 0.005;  6 / 100 = 0.06 -> 0.05;  2 / 100 = 0.02 -> 0.02
    expect(defaultSliderRange(20)).toEqual({ min: 0, max: 40, step: 0.2 });
    expect(defaultSliderRange(0.25)).toEqual({ min: 0, max: 0.5, step: 0.005 });
    expect(defaultSliderRange(-3)).toEqual({ min: -6, max: 0, step: 0.05 });
    expect(defaultSliderRange(0)).toEqual({ min: -1, max: 1, step: 0.02 });
    expect(defaultSliderRange(1)).toEqual({ min: 0, max: 2, step: 0.02 });
  });

  it("snapToSlider: onto the step grid counted from min, clamped, without binary noise", () => {
    const r = { min: 0, max: 2, step: 0.1 };
    expect(snapToSlider(0.3, r)).toBe(0.3);
    expect(snapToSlider(0.1 * 3, r)).toBe(0.3);
    expect(snapToSlider(0.34, r)).toBe(0.3);
    expect(snapToSlider(0.36, r)).toBe(0.4);
    expect(snapToSlider(-5, r)).toBe(0);
    expect(snapToSlider(7, r)).toBe(2);
    // a grid that does not start at 0: 0.2, 0.45, 0.7, ...
    expect(snapToSlider(0.5, { min: 0.2, max: 1.5, step: 0.25 })).toBe(0.45);
    // the last grid point may fall short of max: 1.45 is the last one, max itself is not on the grid
    expect(snapToSlider(1.5, { min: 0.2, max: 1.5, step: 0.25 })).toBe(1.45);
  });

  it("parseSliderRange: a readable reason for every bad range", () => {
    expect(parseSliderRange("0", "2", "0.01")).toEqual({ range: { min: 0, max: 2, step: 0.01 } });
    expect(parseSliderRange("", "2", "0.01")).toEqual({ reason: "notANumber" });
    expect(parseSliderRange("0", "abc", "0.01")).toEqual({ reason: "notANumber" });
    expect(parseSliderRange("0", "2e7", "1")).toEqual({ reason: "outOfRange" });
    expect(parseSliderRange("2", "0", "0.1")).toEqual({ reason: "inverted" });
    expect(parseSliderRange("1", "1", "0.1")).toEqual({ reason: "inverted" });
    expect(parseSliderRange("0", "2", "0")).toEqual({ reason: "badStep" });
    expect(parseSliderRange("0", "2", "-0.1")).toEqual({ reason: "badStep" });
    expect(parseSliderRange("0", "2", "3")).toEqual({ reason: "badStep" });
    // 1 / 1e-5 = 100000 steps > MAX_SLIDER_STEPS
    expect(MAX_SLIDER_STEPS).toBe(10000);
    expect(parseSliderRange("0", "1", "0.00001")).toEqual({ reason: "tooManySteps" });
    expect(sliderRangeProblem({ min: 0, max: 2, step: 0.01 })).toBeNull();
    expect(sliderRangeProblem({ min: 2, max: 0, step: 0.01 })).toBe("inverted");
    expect(sliderRangeProblem({ min: 0, max: Infinity, step: 1 })).toBe("outOfRange");
  });

  it("toggleSlider opens at the default range of the value in force and later keeps the student's range; slideParam sets the snapped value", () => {
    let s = syncParams(EMPTY_PARAMS, ["b"]);
    const id = s.rows[0].id;
    s = setParamText(s, id, "0.25");
    s = toggleSlider(s, id, true);
    expect(row(s, "b").slider).toEqual({ on: true, min: "0", max: "0.5", step: "0.005", range: { min: 0, max: 0.5, step: 0.005 } });
    s = setSliderField(s, id, "max", "2");
    s = setSliderField(s, id, "step", "0.01");
    expect(row(s, "b").slider!.range).toEqual({ min: 0, max: 2, step: 0.01 });
    s = slideParam(s, id, 1.004);
    expect(row(s, "b")).toMatchObject({ text: "1", value: 1, pending: false });
    // hidden and shown again: the range the student typed is still there
    s = toggleSlider(toggleSlider(s, id, false), id, true);
    expect(row(s, "b").slider!.range).toEqual({ min: 0, max: 2, step: 0.01 });
  });

  it("a range field that is mid-edit keeps the last valid range in force", () => {
    let s = toggleSlider(syncParams(EMPTY_PARAMS, ["b"]), 1, true);
    s = setSliderField(s, 1, "max", "");
    expect(row(s, "b").slider).toMatchObject({ max: "", range: { min: 0, max: 2, step: 0.02 } });
    s = setSliderField(s, 1, "max", "5");
    expect(row(s, "b").slider!.range).toEqual({ min: 0, max: 5, step: 0.02 });
  });

  it("only SHOWN sliders travel; withSliders puts a link's sliders back on the rows, shown", () => {
    let s = paramsFromEntries([{ name: "b", value: 0.25 }, { name: "w", value: 1 }], ["b", "w"]);
    s = withSliders(s, [{ name: "b", min: 0, max: 2, step: 0.01 }]);
    expect(row(s, "b").slider).toMatchObject({ on: true, range: { min: 0, max: 2, step: 0.01 } });
    expect(row(s, "w").slider).toBeUndefined();
    const entries = resolveParams(s, "second", ["b", "w"]).entries;
    expect(sliderEntries(s, entries)).toEqual([{ name: "b", min: 0, max: 2, step: 0.01 }]);
    expect(sliderEntries(toggleSlider(s, row(s, "b").id, false), entries)).toEqual([]);
  });

  it("a row that goes away with its name's last use takes its slider into the memory and brings it back", () => {
    let s = syncParams(EMPTY_PARAMS, ["b"]);
    s = setParamText(s, 1, "0.25");
    s = setSliderField(toggleSlider(s, 1, true), 1, "max", "2");
    s = syncParams(syncParams(s, []), ["b"]);
    expect(row(s, "b")).toMatchObject({ value: 0.25, slider: { on: true, range: { min: 0, max: 2, step: 0.005 } } });
  });
});

describe("[Y] the third guardrail: a function glued to its argument is a call missing its parentheses, never a parameter", () => {
  it("siny, cost, sqrty, sinhx are not offered as parameters, in any of the four modes", () => {
    expect(discoverParams("first", { g: "siny" })).toEqual([]);
    expect(discoverParams("first", { g: "y*cost" })).toEqual([]);
    expect(discoverParams("first", { g: "sqrty - sinx" })).toEqual([]);
    expect(discoverParams("diff", { M: "sqrty", N: "cost" })).toEqual([]);
    expect(discoverParams("system", { f: "sinhx", g: "-siny" })).toEqual([]);
    expect(discoverParams("second", { eq: "x'' = -sinx + cost" })).toEqual([]);
    expect(discoverParams("second", { eq: "x'' = -sinv" })).toEqual([]);
    // a real parameter beside the typo is still listed (the compiler then complains about the typo)
    expect(discoverParams("first", { g: "k*siny" })).toEqual(["k"]);
  });

  it("the hint is the compiler's: what discovery refuses, the compiler explains with the same call", () => {
    expect(looksLikeFunctionCall("siny", "first")).toBe("sin(y)");
    expect(looksLikeFunctionCall("sinhx", "system")).toBe("sinh(x)");
    expect(looksLikeFunctionCall("lny", "first")).toBe("ln(y)");
    expect(looksLikeFunctionCall("sinv", "second")).toBe("sin(v)");
    expect(looksLikeFunctionCall("sinv", "system")).toBeNull();
    expect(() => compileSystem({ f: "1", g: "siny", variables: "ty" })).toThrow(/Did you mean "sin\(y\)"\?/);
  });

  it("min, max, pow and atan2 do not take part, and ordinary names are listed as before", () => {
    expect(discoverParams("first", { g: "miny + maxt + powy" })).toEqual(["miny", "maxt", "powy"]);
    expect(discoverParams("first", { g: "k*y + Ta + ky + sigma" })).toEqual(["k", "Ta", "ky", "sigma"]);
    for (const name of ["k", "Ta", "ky", "sigma"]) expect(looksLikeFunctionCall(name, "first")).toBeNull();
    expect(looksLikeProduct("ky", "first")).toBe("k*y");
  });
});

describe("[Y] the guardrails decide what is LISTED, never what a row the student defined may serve", () => {
  it("freeParamNames has no guardrails: cost and ty are names a hand-made row (or a link's p) can serve", () => {
    expect(freeParamNames("first", { g: "cost*y + sin(ty)" })).toEqual(["cost", "ty"]);
    expect(discoverParams("first", { g: "cost*y + sin(ty)" })).toEqual([]);
    // names that can never be parameters are in neither list
    expect(freeParamNames("first", { g: "k*x" })).toEqual(["k"]);
    expect(freeParamNames("first", { g: "k*" })).toBeNull();
  });

  it("a row called cost, added by hand, reaches the compiler: cost*y at cost = 2, y = 3 is 6", () => {
    let s = addParamRow(syncParams(EMPTY_PARAMS, discoverParams("first", { g: "cost*y" })));
    expect(s.rows).toHaveLength(1);
    s = setParamText(setParamName(s, s.rows[0].id, "cost"), s.rows[0].id, "2");
    const { values } = resolveParams(s, "first", freeParamNames("first", { g: "cost*y" }));
    expect(values).toEqual({ cost: 2 });
    expect(compileSystem(toSystem({ kind: "explicit", g: "cost*y", params: values })).eval({ x: 0, y: 3 })).toEqual({ x: 1, y: 6 });
  });
});
