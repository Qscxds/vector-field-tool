/**
 * URL state: expectations are derived from the encoding rules in url-state.ts (defaults omitted,
 * mode-specific range names, URLSearchParams form with the readable post-pass), never from output.
 */
import { describe, expect, it } from "vitest";
import {
  buildShareUrl, decodeState, DEFAULT_STATE, encodeState, MAX_QUERY_LENGTH, MAX_TRAJECTORY_STARTS, MAX_URL_EXPRESSION_LENGTH,
  MODE_DEFAULT_EXPRESSIONS, queryFromSearchParams, type AppState, type UrlProblem,
} from "./url-state";

const D = DEFAULT_STATE;
const withDefaults = (patch: Partial<AppState>): AppState => ({ ...D, box: { ...D.box }, trajectoryStarts: [], ...patch });

describe("encodeState", () => {
  it("encodes the default state as an empty query", () => {
    expect(encodeState(D)).toBe("");
    expect(buildShareUrl("https://tools.studycase.net", "/vector-field", D)).toBe("https://tools.studycase.net/vector-field");
  });

  it("first order: m, g, the t range and loc, in that order, with readable parentheses", () => {
    const s = withDefaults({ mode: "first", g: "y*(1-y)", box: { xMin: 0, xMax: 10, yMin: -0.5, yMax: 1.5 }, locale: "en" });
    expect(encodeState(s)).toBe("m=first&g=y*(1-y)&tmin=0&tmax=10&ymin=-0.5&ymax=1.5&loc=en");
    expect(buildShareUrl("http://localhost:3000", "/vector-field", s)).toBe("http://localhost:3000/vector-field?m=first&g=y*(1-y)&tmin=0&tmax=10&ymin=-0.5&ymax=1.5&loc=en");
  });

  it("differential form: M and N, '+' stays %2B (structural in a query), '^' is readable", () => {
    const s = withDefaults({ mode: "diff", M: "2*t*y", N: "t^2+y^2", box: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 } });
    expect(encodeState(s)).toBe("m=diff&M=2*t*y&N=t^2%2By^2&tmin=-2&tmax=2&ymin=-2&ymax=2");
  });

  it("system: m omitted (the default mode), f before g, x range names, traj pairs joined by ';'", () => {
    const s = withDefaults({ f: "y", g: "-x-0.5*y", trajectoryStarts: [{ x: 1, y: 0 }, { x: 2, y: 1 }] });
    // f equals the default "y" and the box is the default: both omitted.
    expect(encodeState(s)).toBe("g=-x-0.5*y&traj=1,0;2,1");
  });

  it("second order: eq with '=' kept as %3D and spaces as '+', apostrophes readable", () => {
    const s = withDefaults({ mode: "second", eq: "x'' + 0.5*x' + x = 0" });
    expect(encodeState(s)).toBe("m=second&eq=x''+%2B+0.5*x'+%2B+x+%3D+0");
  });

  it("view options only when they differ from the defaults", () => {
    expect(encodeState(withDefaults({ equalScale: false }))).toBe("eqs=0");
    expect(encodeState(withDefaults({ density: 30 }))).toBe("d=30");
    expect(encodeState(withDefaults({ arrowMode: "scaled" }))).toBe("arrows=scaled");
    expect(encodeState(withDefaults({ snapshotT: 1.5 }))).toBe("t0=1.5");
    expect(encodeState(withDefaults({ locale: "zh" }))).toBe("loc=zh");
  });

  it("the language comes only from the link: no loc means locale null (the page shows English), and only an explicit loc changes it", () => {
    // Derived from the rules: DEFAULT_STATE.locale is null and defaults are omitted, so a link
    // without loc decodes to null and a null locale encodes to no loc; the shells render null as en.
    expect(D.locale).toBeNull();
    expect(encodeState(withDefaults({ locale: null }))).toBe("");
    expect(decodeState("", D).state.locale).toBeNull();
    expect(decodeState("m=first&g=y*(1-y)", D).state.locale).toBeNull();
    expect(decodeState("loc=zh", D).state.locale).toBe("zh");
    expect(decodeState("loc=en", D).state.locale).toBe("en");
    expect(encodeState(decodeState("loc=zh", D).state)).toBe("loc=zh");
  });

  it("trajectory starts are rounded to 6 significant digits; -0 becomes 0", () => {
    expect(encodeState(withDefaults({ trajectoryStarts: [{ x: 1.23456789, y: -0 }] }))).toBe("traj=1.23457,0");
  });
});

describe("round trip", () => {
  const cases: Record<string, AppState> = {
    first: withDefaults({ mode: "first", g: "y*(1-y)", box: { xMin: 0, xMax: 10, yMin: -0.5, yMax: 1.5 }, locale: "en", trajectoryStarts: [{ x: 0, y: 0.1 }] }),
    diff: withDefaults({ mode: "diff", M: "2*t*y", N: "t^2+y^2", box: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 }, equalScale: false, density: 12 }),
    system: withDefaults({ f: "y", g: "-x + sin(t)", snapshotT: -1.25, arrowMode: "scaled", locale: "zh", trajectoryStarts: [{ x: 1, y: 0 }, { x: -2.5, y: 0.125 }] }),
    second: withDefaults({ mode: "second", eq: "x'' = -sin(x)", box: { xMin: -7, xMax: 7, yMin: -3, yMax: 3 }, trajectoryStarts: [{ x: 0, y: 2.5 }] }),
  };
  for (const [name, state] of Object.entries(cases)) {
    it(`${name}: decode(encode(state)) is the state, with no problems`, () => {
      const { state: back, problems } = decodeState(encodeState(state), D);
      expect(problems).toEqual([]);
      expect(back).toEqual(state);
    });
  }

  it("accepts a leading '?' and a URLSearchParams instance", () => {
    const s = cases.first;
    expect(decodeState(`?${encodeState(s)}`, D).state).toEqual(s);
    expect(decodeState(new URLSearchParams(encodeState(s)), D).state).toEqual(s);
  });
});

describe("decodeState examples", () => {
  it("logistic link", () => {
    const { state, problems } = decodeState("m=first&g=y*(1-y)&tmin=0&tmax=10&ymin=-0.5&ymax=1.5&loc=en", D);
    expect(problems).toEqual([]);
    expect(state).toEqual(withDefaults({ mode: "first", g: "y*(1-y)", box: { xMin: 0, xMax: 10, yMin: -0.5, yMax: 1.5 }, locale: "en" }));
  });

  it("damped oscillator with two fixed trajectories", () => {
    const { state, problems } = decodeState("m=system&f=y&g=-x-0.5*y&xmin=-3&xmax=3&ymin=-3&ymax=3&traj=1,0;2,1", D);
    expect(problems).toEqual([]);
    expect(state).toEqual(withDefaults({ f: "y", g: "-x-0.5*y", trajectoryStarts: [{ x: 1, y: 0 }, { x: 2, y: 1 }] }));
  });

  it("exact equation in differential form (percent-encoded '+')", () => {
    const { state, problems } = decodeState("m=diff&M=2*t*y&N=t^2%2By^2&tmin=-2&tmax=2&ymin=-2&ymax=2", D);
    expect(problems).toEqual([]);
    expect(state).toEqual(withDefaults({ mode: "diff", M: "2*t*y", N: "t^2+y^2", box: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 } }));
  });

  it("missing parameters keep the fallback's values (a preset as fallback)", () => {
    const fallback = withDefaults({ mode: "first", g: "sqrt(y)", box: { xMin: -2, xMax: 4, yMin: -0.3, yMax: 1.5 } });
    const { state, problems } = decodeState("ymax=2", fallback);
    expect(problems).toEqual([]);
    expect(state).toEqual({ ...fallback, box: { ...fallback.box, yMax: 2 } });
    expect(decodeState("", fallback).state).toEqual(fallback);
  });

  it("unknown parameters (such as /embed's controls) are ignored without a problem", () => {
    expect(decodeState("controls=0&foo=bar", D)).toEqual({ state: D, problems: [] });
  });

  it("queryFromSearchParams takes the first value of a repeated parameter", () => {
    const q = queryFromSearchParams({ m: ["first", "diff"], g: "y", x: undefined });
    expect(q.toString()).toBe("m=first&g=y");
  });
});

const reasons = (problems: UrlProblem[]) => problems.map((p) => `${p.param}:${p.reason}`);

describe("decodeState validation (a public link is an attack surface)", () => {
  it("expressions go through the parser whitelist: injection attempts give problems and fallbacks, never throw", () => {
    const bad = ["<script>alert(1)</script>", "constructor", "__proto__", "y;drop", "y = 1", "import('x')", "", "   "];
    for (const g of bad) {
      const { state, problems } = decodeState(new URLSearchParams({ m: "first", g }), D);
      expect(reasons(problems), g).toEqual(["g:invalidExpression"]);
      // The fallback is the first-order default, not the planar D.g = -x (x is not a first-order symbol).
      expect(state.g, g).toBe(MODE_DEFAULT_EXPRESSIONS.first.g);
    }
  });

  it("x in a first-order g is rejected (variables 'ty'), while the same text is fine for a system", () => {
    expect(reasons(decodeState("m=first&g=x*y", D).problems)).toEqual(["g:invalidExpression"]);
    expect(decodeState("m=system&g=x*y", D)).toEqual({ state: withDefaults({ g: "x*y" }), problems: [] });
  });

  it("a second-order eq must reduce; x'' must appear linearly", () => {
    expect(reasons(decodeState("m=second&eq=x''^2+%3D+x", D).problems)).toEqual(["eq:invalidExpression"]);
    expect(decodeState("m=second&eq=-sin(x)", D).state.eq).toBe("-sin(x)");
  });

  it("an expression over 200 chars is too long; a query over 4096 chars is ignored as a whole", () => {
    const long = "y" + "+y".repeat(MAX_URL_EXPRESSION_LENGTH); // 401 chars: valid syntax, over the cap
    expect(long.length).toBeGreaterThan(MAX_URL_EXPRESSION_LENGTH);
    const a = decodeState(new URLSearchParams({ m: "first", g: long }), D);
    expect(reasons(a.problems)).toEqual(["g:tooLong"]);
    expect(a.state.g).toBe(MODE_DEFAULT_EXPRESSIONS.first.g);
    const huge = "m=first&g=" + "y".repeat(5000);
    expect(huge.length).toBeGreaterThan(MAX_QUERY_LENGTH);
    const b = decodeState(huge, D);
    expect(b).toEqual({ state: D, problems: [{ param: "query", reason: "queryTooLong" }] });
  });

  it("numbers: non-numeric, 1e999, hex and > 1e6 fall back with a reason", () => {
    expect(reasons(decodeState("m=first&tmin=abc", D).problems)).toEqual(["tmin:notANumber"]);
    expect(reasons(decodeState("m=first&tmax=1e999", D).problems)).toEqual(["tmax:outOfRange"]);
    expect(reasons(decodeState("ymin=0x10", D).problems)).toEqual(["ymin:notANumber"]);
    expect(reasons(decodeState("ymax=1000001", D).problems)).toEqual(["ymax:outOfRange"]);
    expect(reasons(decodeState("t0=Infinity", D).problems)).toEqual(["t0:notANumber"]);
    expect(reasons(decodeState("t0=-1e7", D).problems)).toEqual(["t0:outOfRange"]);
    expect(decodeState("t0=1e-3", D).state.snapshotT).toBe(0.001);
    // Exactly at the bound is allowed.
    expect(decodeState("xmin=-1e6&xmax=1e6", D).state.box).toEqual({ xMin: -1e6, xMax: 1e6, yMin: -3, yMax: 3 });
  });

  it("inverted or degenerate ranges reset the pair to the fallback and name the given params", () => {
    const inv = decodeState("xmin=3&xmax=-3", D);
    expect(reasons(inv.problems)).toEqual(["xmin:invertedRange", "xmax:invertedRange"]);
    expect(inv.state.box).toEqual(D.box);
    // Only one side given, inverted against the fallback's other side (-3): only that param is named.
    const one = decodeState("xmax=-5", D);
    expect(reasons(one.problems)).toEqual(["xmax:invertedRange"]);
    expect(one.state.box).toEqual(D.box);
    const narrow = decodeState("ymin=1&ymax=1.0000000001", D);
    expect(reasons(narrow.problems)).toEqual(["ymin:tooNarrow", "ymax:tooNarrow"]);
    expect(narrow.state.box).toEqual(D.box);
    // One bad side: that side falls back, the pair is then checked with the fallback value.
    const half = decodeState("ymin=abc&ymax=5", D);
    expect(reasons(half.problems)).toEqual(["ymin:notANumber"]);
    expect(half.state.box).toEqual({ ...D.box, yMax: 5 });
  });

  it("enumerations and the density", () => {
    expect(reasons(decodeState("m=explicit", D).problems)).toEqual(["m:badChoice"]);
    expect(reasons(decodeState("loc=fr", D).problems)).toEqual(["loc:badChoice"]);
    expect(reasons(decodeState("eqs=2", D).problems)).toEqual(["eqs:badChoice"]);
    expect(reasons(decodeState("arrows=long", D).problems)).toEqual(["arrows:badChoice"]);
    expect(reasons(decodeState("d=4", D).problems)).toEqual(["d:outOfRange"]);
    expect(reasons(decodeState("d=41", D).problems)).toEqual(["d:outOfRange"]);
    expect(reasons(decodeState("d=7.5", D).problems)).toEqual(["d:notInteger"]);
    expect(decodeState("d=5&eqs=1&arrows=scaled&loc=zh", D).state).toEqual(withDefaults({ density: 5, equalScale: true, arrowMode: "scaled", locale: "zh" }));
  });

  it("mode / expression mismatch: the unused expression and the wrong range names are reported and ignored", () => {
    const r = decodeState("m=first&g=y&f=y&xmin=-1&xmax=1", D);
    expect(reasons(r.problems)).toEqual(["f:unusedInMode", "xmin:unusedInMode", "xmax:unusedInMode"]);
    expect(r.state).toEqual(withDefaults({ mode: "first", g: "y" }));
    // A bad m keeps the fallback mode; the expressions are then judged in that mode.
    expect(decodeState("m=nope&f=y&g=-x", D).state).toEqual(withDefaults({}));
  });

  it("traj: malformed pairs are dropped with one problem, 25 pairs keep the first 20 and report the rest", () => {
    const r = decodeState("traj=1,0;abc;2,1;3;4,1e999;,;5,5", D);
    expect(reasons(r.problems)).toEqual(["traj:malformedPair"]);
    expect(r.state.trajectoryStarts).toEqual([{ x: 1, y: 0 }, { x: 2, y: 1 }, { x: 5, y: 5 }]);
    const many = Array.from({ length: 25 }, (_, i) => `${i},${-i}`).join(";");
    const m = decodeState(`traj=${many}`, D);
    expect(reasons(m.problems)).toEqual(["traj:tooMany"]);
    expect(m.state.trajectoryStarts).toHaveLength(MAX_TRAJECTORY_STARTS);
    expect(m.state.trajectoryStarts[19]).toEqual({ x: 19, y: -19 });
    expect(decodeState("traj=", D).state.trajectoryStarts).toEqual([]);
  });

  it("never throws on garbage", () => {
    for (const q of ["%", "%E0%A4%A", "m=&g=&tmin=&traj=;;;", "=&&&", "a".repeat(4096)]) {
      expect(() => decodeState(q, D)).not.toThrow();
    }
  });
});

describe("mode-specific fallback expressions", () => {
  // DEFAULT_STATE is a planar system (g = -x); a first-order link must not fall back to it, because
  // x is not a first-order symbol and the page would show a notice plus a parse error and no picture.
  it("a first-order link with a broken g falls back to the first-order default, not to -x", () => {
    const { state, problems } = decodeState("m=first&g=x*y", D);
    expect(problems).toEqual([{ param: "g", reason: "invalidExpression" }]);
    expect(state.mode).toBe("first");
    expect(state.g).toBe("y*(1 - y)");
  });

  it("a link that only switches the mode gets that mode's expressions", () => {
    expect(decodeState("m=first", D).state.g).toBe("y*(1 - y)");
    const diff = decodeState("m=diff", D).state;
    expect([diff.M, diff.N]).toEqual(["t", "y"]);
    expect(decodeState("m=second", D).state.eq).toBe("x'' + 0.5*x' + x = 0");
    const sys = decodeState("", D).state;
    expect([sys.f, sys.g]).toEqual(["y", "-x"]);
  });

  it("a valid expression in the link still wins over the mode default", () => {
    expect(decodeState("m=first&g=sqrt(y)", D).state.g).toBe("sqrt(y)");
  });
});

describe("non-finite literals (round N.3 d)", () => {
  it("1e999 parses to a ConstantNode holding Infinity and is rejected as invalidExpression in every mode", () => {
    // mathjs parses the literal 1e999 as a ConstantNode whose value is Infinity (not a SymbolNode);
    // the parser whitelist (lib/core/parse) refuses any non-finite numeric literal, and decodeState
    // runs every expression through that whitelist, so the link falls back with the reason key.
    expect(reasons(decodeState("m=first&g=y-1e999", D).problems)).toEqual(["g:invalidExpression"]);
    expect(reasons(decodeState("m=system&f=1e999*x&g=y", D).problems)).toEqual(["f:invalidExpression"]);
    expect(reasons(decodeState("m=diff&M=1e999&N=y", D).problems)).toEqual(["M:invalidExpression"]);
    expect(reasons(decodeState("m=second&eq=x''+%3D+1e999*x", D).problems)).toEqual(["eq:invalidExpression"]);
    // The finite neighbour is fine.
    expect(reasons(decodeState("m=first&g=y-1e300", D).problems)).toEqual([]);
  });
});
