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

  it("[P1] second order: the vertical range is the x' range and is written xpmin/xpmax, never ymin/ymax", () => {
    const s = withDefaults({ mode: "second", eq: "x'' = -sin(x)", box: { xMin: -7, xMax: 7, yMin: -3.5, yMax: 3.5 } });
    expect(encodeState(s)).toBe("m=second&eq=x''+%3D+-sin(x)&xmin=-7&xmax=7&xpmin=-3.5&xpmax=3.5");
    // The other modes keep ymin/ymax.
    expect(encodeState(withDefaults({ box: { xMin: -3, xMax: 3, yMin: -1, yMax: 1 } }))).toBe("ymin=-1&ymax=1");
    expect(encodeState(withDefaults({ mode: "first", g: "y", box: { xMin: -3, xMax: 3, yMin: -1, yMax: 1 } }))).toBe("m=first&g=y&ymin=-1&ymax=1");
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

  it("[P1] second order reads xpmin/xpmax, still reads a pre-P link's ymin/ymax silently, and prefers the new names; other modes report xpmin/xpmax as unused", () => {
    const fresh = decodeState("m=second&eq=-sin(x)&xpmin=-3.5&xpmax=3.5", D);
    expect(fresh.problems).toEqual([]);
    expect(fresh.state.box).toEqual({ xMin: -3, xMax: 3, yMin: -3.5, yMax: 3.5 });
    const old = decodeState("m=second&eq=-sin(x)&ymin=-2&ymax=2", D);
    expect(old.problems).toEqual([]);
    expect(old.state.box).toEqual({ xMin: -3, xMax: 3, yMin: -2, yMax: 2 });
    // Both given: the new names win, no notice (the old ones are simply ignored).
    const both = decodeState("m=second&eq=-sin(x)&xpmin=-1&xpmax=1&ymin=-2&ymax=2", D);
    expect(both.problems).toEqual([]);
    expect(both.state.box).toEqual({ xMin: -3, xMax: 3, yMin: -1, yMax: 1 });
    // A bad value under the new name is reported under that name; an inverted range too.
    expect(reasons(decodeState("m=second&eq=-sin(x)&xpmin=abc", D).problems)).toEqual(["xpmin:notANumber"]);
    expect(reasons(decodeState("m=second&eq=-sin(x)&xpmin=2&xpmax=1", D).problems)).toEqual(["xpmin:invertedRange", "xpmax:invertedRange"]);
    // Re-encoding a pre-P link writes the new names.
    expect(encodeState(old.state)).toBe("m=second&eq=-sin(x)&xpmin=-2&xpmax=2");
    // Elsewhere the x' range does not exist.
    expect(reasons(decodeState("xpmin=-1&xpmax=1", D).problems)).toEqual(["xpmin:unusedInMode", "xpmax:unusedInMode"]);
    expect(reasons(decodeState("m=first&g=y&xpmin=-1", D).problems)).toEqual(["xpmin:unusedInMode"]);
    expect(decodeState("xpmin=-1&xpmax=1", D).state.box).toEqual(D.box);
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

describe("[P2] t0 on a first-order link", () => {
  it("is reported as unused (a first-order picture has no snapshot time) and never written for such a link", () => {
    for (const q of ["m=first&g=y&t0=1", "m=diff&M=t&N=y&t0=2"]) {
      const { state, problems } = decodeState(q, D);
      expect(problems).toEqual([{ param: "t0", reason: "unusedInMode" }]);
      expect(state.snapshotT).toBe(0);
    }
    // A planar or second-order link keeps it.
    expect(decodeState("t0=1.5", D).state.snapshotT).toBe(1.5);
    expect(decodeState("m=second&eq=-x&t0=1.5", D).state.snapshotT).toBe(1.5);
    // Encoding a first-order state never emits t0, whatever the snapshot value in memory.
    expect(encodeState(withDefaults({ mode: "first", g: "y", snapshotT: 2 }))).toBe("m=first&g=y");
    expect(encodeState(withDefaults({ snapshotT: 2 }))).toBe("t0=2");
  });
});

describe("[Q] the time-series view in a link: view and the t range of a planar picture", () => {
  it("encodes view and tmin / tmax for a planar picture only; a first-order link keeps tmin / tmax for its own t range", () => {
    expect(encodeState(withDefaults({ view: "time" }))).toBe("view=time");
    expect(encodeState(withDefaults({ view: "phase", timeRange: { min: -5, max: 5 } }))).toBe("tmin=-5&tmax=5&view=phase");
    // Default t range and no choice: nothing written.
    expect(encodeState(withDefaults({ view: null, timeRange: { min: 0, max: 20 } }))).toBe("");
    expect(encodeState(withDefaults({ mode: "second", eq: "x'' = -x", view: "time", timeRange: { min: 0, max: 40 } }))).toBe("m=second&eq=x''+%3D+-x&tmax=40&view=time");
    // A first-order picture has no time-series view: view and the planar t range are never written.
    const first = encodeState(withDefaults({ mode: "first", g: "y", view: "time", timeRange: { min: 1, max: 2 } }));
    expect(first).toBe("m=first&g=y");
  });

  it("decodes them, reports a bad view or an inverted range, and rejects view on a first-order link", () => {
    const ok = decodeState("tmin=-5&tmax=5&view=time", D);
    expect(ok.problems).toEqual([]);
    expect(ok.state.timeRange).toEqual({ min: -5, max: 5 });
    expect(ok.state.view).toBe("time");
    expect(ok.state.box).toEqual(D.box);
    const bad = decodeState("view=nope", D);
    expect(bad.problems).toEqual([{ param: "view", reason: "badChoice" }]);
    expect(bad.state.view).toBeNull();
    const inverted = decodeState("tmin=5&tmax=1", D);
    expect(reasons(inverted.problems)).toEqual(["tmin:invertedRange", "tmax:invertedRange"]);
    expect(inverted.state.timeRange).toEqual(D.timeRange);
    const first = decodeState("m=first&g=y&view=time", D);
    expect(first.problems).toEqual([{ param: "view", reason: "unusedInMode" }]);
    expect(first.state.view).toBeNull();
    // On a first-order link tmin / tmax are the picture's own range, as before.
    const firstRange = decodeState("m=first&g=y&tmin=0&tmax=10", D);
    expect(firstRange.problems).toEqual([]);
    expect(firstRange.state.box.xMin).toBe(0);
    expect(firstRange.state.box.xMax).toBe(10);
    expect(firstRange.state.timeRange).toEqual(D.timeRange);
  });

  it("round-trips through encodeState / decodeState", () => {
    for (const s of [
      withDefaults({ view: "time", timeRange: { min: 2, max: 30 } }),
      withDefaults({ mode: "second", eq: "x'' = -x + cos(t)", view: "phase", snapshotT: 1, timeRange: { min: -10, max: 10 } }),
      withDefaults({ view: null, timeRange: { min: 0, max: 20 } }),
    ]) {
      expect(decodeState(encodeState(s), D).state).toEqual(s);
    }
  });
});

describe("[T] symbolic parameters in the link (p=name:value,…)", () => {
  const logistic = withDefaults({ mode: "first", g: "k*y*(1 - y/L)", params: [{ name: "k", value: 0.8 }, { name: "L", value: 2 }] });

  it("encodes after every other field, readable: the teacher's 'k = 0.8, L = 2 logistic' link", () => {
    // spaces are '+', '/' ':' ',' '(' ')' are put back; the default box and everything else is omitted
    expect(encodeState(logistic)).toBe("m=first&g=k*y*(1+-+y/L)&p=k:0.8,L:2");
    expect(buildShareUrl("https://tools.studycase.net", "/vector-field", logistic)).toBe("https://tools.studycase.net/vector-field?m=first&g=k*y*(1+-+y/L)&p=k:0.8,L:2");
    expect(encodeState(withDefaults({ params: [] }))).toBe("");
  });

  it("round trip: the decoded parameters are exactly the encoded ones, in every mode", () => {
    const states: AppState[] = [
      logistic,
      withDefaults({ mode: "diff", M: "a*t", N: "b*y", params: [{ name: "a", value: 1 }, { name: "b", value: -4 }] }),
      withDefaults({ f: "a*x - b*x*y", g: "d*x*y - c*y", params: [{ name: "a", value: 1 }, { name: "b", value: 0.5 }, { name: "c", value: 0.75 }, { name: "d", value: 0.25 }] }),
      withDefaults({ mode: "second", eq: "x'' + 2*b*x' + w^2*x = 0", params: [{ name: "b", value: 0.25 }, { name: "w", value: 1 }] }),
      // values that need every digit: 0.1 + 0.2, 1/3, a tiny one, a negative one, zero
      withDefaults({ mode: "first", g: "a*y + b + c*t + d + z", params: [{ name: "a", value: 0.1 + 0.2 }, { name: "b", value: 1 / 3 }, { name: "c", value: 1e-7 }, { name: "d", value: -123456.789 }, { name: "z", value: 0 }] }),
    ];
    for (const s of states) {
      const { state, problems } = decodeState(encodeState(s), D);
      expect(problems).toEqual([]);
      expect(state.params).toEqual(s.params);
      expect(state).toEqual(s);
    }
  });

  it("an equation whose parameter the link does not give is still valid: the page lists it and asks for a value", () => {
    const { state, problems } = decodeState("m=first&g=k*y", D);
    expect(problems).toEqual([]);
    expect(state.g).toBe("k*y");
    expect(state.params).toEqual([]);
    // a product missing its * is still the parser's error, not a parameter called ty
    expect(decodeState("m=first&g=sin(ty)", D).problems).toEqual([{ param: "g", reason: "invalidExpression" }]);
  });

  it("an illegal entry is dropped as a whole and reported; the legal ones and the equation survive", () => {
    const bad = (query: string): { params: AppState["params"]; problems: UrlProblem[]; g: string } => {
      const { state, problems } = decodeState(query, D);
      return { params: state.params, problems, g: state.g };
    };
    expect(bad("m=first&g=k*y&p=k:abc")).toEqual({ params: [], problems: [{ param: "p:k", reason: "notANumber" }], g: "k*y" });
    expect(bad("m=first&g=k*y&p=k:1e9")).toEqual({ params: [], problems: [{ param: "p:k", reason: "outOfRange" }], g: "k*y" });
    expect(bad("m=first&g=k*y&p=k:Infinity").problems).toEqual([{ param: "p:k", reason: "notANumber" }]);
    expect(bad("m=first&g=k*y&p=t:2,k:3")).toEqual({ params: [{ name: "k", value: 3 }], problems: [{ param: "p:t", reason: "reservedParamName" }], g: "k*y" });
    expect(bad("m=first&g=k*y&p=2k:1,k:3")).toEqual({ params: [{ name: "k", value: 3 }], problems: [{ param: "p:2k", reason: "badParamName" }], g: "k*y" });
    expect(bad("m=first&g=k*y&p=k").problems).toEqual([{ param: "p", reason: "malformedPair" }]);
    expect(bad("m=first&g=k*y&p=k:1:2").problems).toEqual([{ param: "p", reason: "malformedPair" }]);
    expect(bad("m=first&g=k*y&p=:1").problems).toEqual([{ param: "p", reason: "badParamName" }]);
    expect(bad("m=first&g=k*y&p=k:2,k:5")).toEqual({ params: [{ name: "k", value: 2 }], problems: [{ param: "p:k", reason: "duplicateParam" }], g: "k*y" });
    for (const name of ["x", "y", "pi", "e", "sin", "constructor"]) expect(bad(`m=first&g=y&p=${name}:1`).problems).toEqual([{ param: `p:${name}`, reason: "reservedParamName" }]);
  });

  it("v is the alias of x' in a second-order equation only", () => {
    expect(decodeState("m=second&p=v:1", D).problems).toEqual([{ param: "p:v", reason: "reservedParamName" }]);
    expect(decodeState("p=v:1", D)).toMatchObject({ problems: [], state: { params: [{ name: "v", value: 1 }] } });
  });

  it("at most 12 parameters; an empty p is no parameters and no problem", () => {
    const many = Array.from({ length: 14 }, (_, i) => `q${i}:${i}`).join(",");
    const { state, problems } = decodeState(`p=${many}`, D);
    expect(state.params).toHaveLength(12);
    expect(problems).toEqual([{ param: "p", reason: "tooMany" }]);
    expect(decodeState("p=", D)).toMatchObject({ problems: [], state: { params: [] } });
  });

  it("the expressions are validated WITH the link's parameters: a value cannot smuggle an expression in", () => {
    expect(decodeState("m=first&g=k*y&p=k:exp(9)", D).problems).toEqual([{ param: "p:k", reason: "notANumber" }]);
    expect(decodeState("m=first&g=k*y&p=k:0x10", D).problems).toEqual([{ param: "p:k", reason: "notANumber" }]);
  });
});

describe("[U] the shown sliders in the link (sl=name:min:max:step,…)", () => {
  const damped = withDefaults({
    mode: "second",
    eq: "x'' + 2*b*x' + w^2*x = 0",
    params: [{ name: "b", value: 0.25 }, { name: "w", value: 1 }],
    sliders: [{ name: "b", min: 0, max: 2, step: 0.01 }],
  });

  it("encodes after p: 'the damped oscillator that opens with a slider on b'", () => {
    expect(encodeState(damped)).toBe("m=second&eq=x''+%2B+2*b*x'+%2B+w^2*x+%3D+0&p=b:0.25,w:1&sl=b:0:2:0.01");
    expect(encodeState(withDefaults({ sliders: [] }))).toBe("");
  });

  it("round trip, also with two sliders, a negative range and a slider on a parameter the link leaves at its default", () => {
    const states: AppState[] = [
      damped,
      withDefaults({ mode: "first", g: "k*y*(1 - y/L)", params: [{ name: "k", value: -0.8 }, { name: "L", value: 2 }], sliders: [{ name: "k", min: -1.6, max: 0, step: 0.02 }, { name: "L", min: 0.5, max: 4, step: 0.25 }] }),
      // no p at all: k is free in the equation, the page lists it; its slider still travels
      withDefaults({ mode: "first", g: "k*y", sliders: [{ name: "k", min: 0, max: 2, step: 0.02 }] }),
    ];
    for (const s of states) {
      const { state, problems } = decodeState(encodeState(s), D);
      expect(problems).toEqual([]);
      expect(state).toEqual(s);
    }
  });

  it("a bad slider is dropped as a whole and reported; the parameters and the equation survive", () => {
    const base = "m=first&g=k*y&p=k:0.8";
    const sl = (value: string) => {
      const { state, problems } = decodeState(`${base}&sl=${value}`, D);
      expect(state.params).toEqual([{ name: "k", value: 0.8 }]);
      return { sliders: state.sliders, problems };
    };
    expect(sl("k:0:2")).toEqual({ sliders: [], problems: [{ param: "sl", reason: "malformedPair" }] });
    expect(sl("k:0:abc:0.1")).toEqual({ sliders: [], problems: [{ param: "sl:k", reason: "notANumber" }] });
    expect(sl("k:2:0:0.1")).toEqual({ sliders: [], problems: [{ param: "sl:k", reason: "invertedRange" }] });
    expect(sl("k:0:2:0")).toEqual({ sliders: [], problems: [{ param: "sl:k", reason: "badStep" }] });
    expect(sl("k:0:2:5")).toEqual({ sliders: [], problems: [{ param: "sl:k", reason: "badStep" }] });
    expect(sl("k:0:1:0.00001")).toEqual({ sliders: [], problems: [{ param: "sl:k", reason: "tooManySteps" }] });
    expect(sl("q:0:2:0.1")).toEqual({ sliders: [], problems: [{ param: "sl:q", reason: "sliderWithoutParam" }] });
    expect(sl("k:0:2:0.1,k:0:4:0.1")).toEqual({ sliders: [{ name: "k", min: 0, max: 2, step: 0.1 }], problems: [{ param: "sl:k", reason: "duplicateParam" }] });
  });
});

describe("[V] the overlays in the link (aids=n,e,s)", () => {
  it("omitted when none; letters in a fixed order; e and s are never written for a first-order picture", () => {
    expect(encodeState(withDefaults({ aids: { nullclines: false, eigenDirections: false, separatrices: false } }))).toBe("");
    expect(encodeState(withDefaults({ aids: { nullclines: true, eigenDirections: false, separatrices: true } }))).toBe("aids=n,s");
    expect(encodeState(withDefaults({ aids: { nullclines: true, eigenDirections: true, separatrices: true } }))).toBe("aids=n,e,s");
    expect(encodeState(withDefaults({ mode: "first", g: "y - t", aids: { nullclines: true, eigenDirections: true, separatrices: true } }))).toBe("m=first&g=y+-+t&aids=n");
  });

  it("round trip on a phase plane and on a first-order picture", () => {
    for (const s of [
      withDefaults({ f: "x", g: "-y", aids: { nullclines: true, eigenDirections: true, separatrices: true } }),
      withDefaults({ mode: "second", eq: "x'' = -sin(x)", aids: { nullclines: false, eigenDirections: false, separatrices: true } }),
      withDefaults({ mode: "first", g: "y - t", aids: { nullclines: true, eigenDirections: false, separatrices: false } }),
    ]) {
      const { state, problems } = decodeState(encodeState(s), D);
      expect(problems).toEqual([]);
      expect(state).toEqual(s);
    }
  });

  it("an unknown letter is reported; e and s on a first-order picture are reported as unused, n still applies", () => {
    expect(decodeState("aids=n,q", D)).toMatchObject({ problems: [{ param: "aids", reason: "badChoice" }], state: { aids: { nullclines: true, eigenDirections: false, separatrices: false } } });
    expect(decodeState("m=first&g=y&aids=n,e,s", D)).toMatchObject({
      problems: [{ param: "aids:e", reason: "unusedInMode" }, { param: "aids:s", reason: "unusedInMode" }],
      state: { aids: { nullclines: true, eigenDirections: false, separatrices: false } },
    });
  });
});

describe("[W] lecture mode in the link (lecture=1)", () => {
  it("omitted when off; lecture=1 when on; nothing else in the link changes", () => {
    const off = withDefaults({ mode: "second", eq: "x'' + 2*b*x' + w^2*x = 0", params: [{ name: "b", value: 0.25 }, { name: "w", value: 1 }], sliders: [{ name: "b", min: 0, max: 2, step: 0.01 }] });
    const on = { ...off, lecture: true };
    expect(encodeState(off)).not.toContain("lecture");
    expect(encodeState(on)).toBe(encodeState(off).replace("&sl=", "&lecture=1&sl="));
    // the professor's handout link: the damped oscillator, a slider on b, lecture mode
    expect(encodeState(on)).toBe("m=second&eq=x''+%2B+2*b*x'+%2B+w^2*x+%3D+0&p=b:0.25,w:1&lecture=1&sl=b:0:2:0.01");
  });

  it("round trip; the same query decodes the same way for /embed (one decoder for both routes)", () => {
    const s = withDefaults({ mode: "first", g: "y*(1 - y)", lecture: true });
    const { state, problems } = decodeState(encodeState(s), D);
    expect(problems).toEqual([]);
    expect(state).toEqual(s);
    // /embed adds its own controls=0, an unknown parameter to the decoder: ignored, no problem
    expect(decodeState(`${encodeState(s)}&controls=0`, D)).toEqual({ state: s, problems: [] });
    expect(decodeState("lecture=0", D)).toMatchObject({ problems: [], state: { lecture: false } });
  });

  it("anything but 0 or 1 is reported and the page stays in the normal mode", () => {
    expect(decodeState("lecture=yes", D)).toMatchObject({ problems: [{ param: "lecture", reason: "badChoice" }], state: { lecture: false } });
  });
});
