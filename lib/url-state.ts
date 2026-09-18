/**
 * URL state of the web shell: the whole page state as a short, readable query string, so that a
 * teacher can link to one specific example from a lesson plan and /embed can show it.
 *
 * Pure module (no React / Next imports). Encoding omits every value equal to DEFAULT_STATE so
 * hand-written links stay short. Decoding treats the query as an ATTACK SURFACE: the total length
 * and every expression are capped, every expression goes through the same parser whitelist the
 * page compiles with (no relaxation for links), every number is finite and bounded, and a bad
 * value falls back to the fallback state's value for that field with a readable problem key
 * instead of an exception. decodeState never throws.
 *
 * Parameter table (all optional):
 *   m      first | diff | system | second           (mode; default system)
 *   g      dy/dt = g(t, y) (first) or y' = g(x, y) (system)
 *   f      x' = f(x, y) (system)
 *   M, N   M(t, y) dt + N(t, y) dy = 0 (diff)
 *   eq     second-order equation text (second)
 *   tmin, tmax   horizontal range of a first-order picture (first, diff): the t range; on a planar
 *                picture (system, second) the t range of the time-series view (round Q; omitted at 0..20)
 *   view   phase | time   which picture a planar system / second-order equation shows (round Q;
 *          omitted = the default: the time series when the equation is non-autonomous, else the phase plane)
 *   xmin, xmax   horizontal range of a planar picture (system, second)
 *   ymin, ymax   vertical range of a first-order or planar picture (first, diff, system): the y range
 *   xpmin, xpmax vertical range of a second-order picture (second): the x' range (round P; links
 *                written before it used ymin/ymax there, which are still read, silently, and
 *                never written again)
 *   loc    zh | en (omitted: English)
 *   eqs    0 = equal scale off (omitted when on)
 *   d      grid density 5..40 (omitted at 20)
 *   arrows scaled (omitted for unit arrows)
 *   t0     snapshot time of a non-autonomous planar system or second-order equation (omitted at 0;
 *          unused on a first-order picture, whose t is the horizontal axis: reported as such)
 *   traj   fixed trajectory starts "x,y;x,y" (at most 20 pairs; omitted when empty)
 *   p      symbolic parameters "k:0.8,L:2" (round T; at most 12; one set for every expression of
 *          the mode). A name must pass the compiler's own rule for a parameter name and a value is
 *          a bounded decimal; an entry that fails either is dropped AS A WHOLE and reported (never
 *          half-read, never silently). A name the equation uses but the link does not give is not
 *          an error: the page lists it at the default value and marks it as needing a value.
 *   sl     the parameter sliders that are SHOWN, "b:0:2:0.01" = name:min:max:step (round U), so a
 *          teacher can hand out "the damped oscillator with a slider on b". A slider needs a
 *          parameter of its name (in p, or free in the equation), min < max, 0 < step <= max - min
 *          and at most 10000 steps; an entry that fails is dropped as a whole and reported.
 * Unknown parameters are ignored (so /embed's own `controls` never counts as a problem).
 */
import { compileScalar } from "./core/parse";
import { reduceSecondOrder } from "./core/second-order";
import type { Locale, Range, Vec2 } from "./core/types";
import { DEFAULT_PARAM_VALUE, discoverParams, formatParamValue, MAX_PARAMS, paramNameProblem, paramsRecord, sliderRangeProblem, type ParamEntry, type ParamMode, type SliderEntry } from "./params";
import type { ArrowMode } from "./render/arrows";
import { MAX_TRAJECTORIES } from "./trajectory-store";

export type AppMode = ParamMode;

/** The entered range; for first / diff the horizontal range is the t range. */
export type AppBox = { xMin: number; xMax: number; yMin: number; yMax: number };

/** The two pictures of a planar system or a second-order equation (round Q); null = the default rule (non-autonomous -> time series). */
export type ViewChoice = "phase" | "time" | null;

export type AppState = {
  mode: AppMode;
  /** dy/dt = g(t, y) in mode first; y' = g(x, y) in mode system. */
  g: string;
  /** x' = f(x, y) in mode system. */
  f: string;
  /** M dt + N dy = 0 in mode diff. */
  M: string;
  N: string;
  /** Second-order equation text in mode second. */
  eq: string;
  box: AppBox;
  /** null = not chosen: the page is English and the link carries no loc (never the browser language). */
  locale: Locale | null;
  equalScale: boolean;
  density: number;
  arrowMode: ArrowMode;
  snapshotT: number;
  trajectoryStarts: Vec2[];
  /** Round Q: which picture a planar system / second-order equation shows; null = the default rule. */
  view: ViewChoice;
  /** Round Q: the t range of the time-series view (system / second modes; tmin / tmax in the link). */
  timeRange: Range;
  /** Round T: the symbolic parameters, one set shared by every expression and every mode (`p` in the link). */
  params: ParamEntry[];
  /** Round U: the sliders that are shown, by parameter name (`sl` in the link). */
  sliders: SliderEntry[];
};

export type UrlProblemReason =
  | "queryTooLong"
  | "tooLong"
  | "invalidExpression"
  | "notANumber"
  | "notInteger"
  | "outOfRange"
  | "invertedRange"
  | "tooNarrow"
  | "badChoice"
  | "tooMany"
  | "malformedPair"
  | "unusedInMode"
  | "badParamName"
  | "reservedParamName"
  | "duplicateParam"
  | "sliderWithoutParam"
  | "badStep"
  | "tooManySteps";

export type UrlProblem = { param: string; reason: UrlProblemReason };

export const APP_MODES: readonly AppMode[] = ["first", "diff", "system", "second"];
/** Longer queries are ignored as a whole (one problem on "query"). */
export const MAX_QUERY_LENGTH = 4096;
/** Per-expression cap in a link (the MCP tools use the same 200). */
export const MAX_URL_EXPRESSION_LENGTH = 200;
/** |number| bound for ranges, t0 and trajectory starts (the MCP tools' box cap). */
export const MAX_ABS_VALUE = 1e6;
/** A range side below this is a degenerate box. */
export const MIN_BOX_SIDE = 1e-9;
/** A link carries at most as many starts as a store keeps (lib/trajectory-store, round R): 20. */
export const MAX_TRAJECTORY_STARTS = MAX_TRAJECTORIES;
export const DENSITY_MIN = 5;
export const DENSITY_MAX = 40;

export const DEFAULT_STATE: AppState = {
  mode: "system",
  g: "-x",
  f: "y",
  M: "",
  N: "",
  eq: "",
  box: { xMin: -3, xMax: 3, yMin: -3, yMax: 3 },
  locale: null,
  equalScale: true,
  density: 20,
  arrowMode: "unit",
  snapshotT: 0,
  trajectoryStarts: [],
  view: null,
  timeRange: { min: 0, max: 20 },
  params: [],
  sliders: [],
};

/**
 * Expressions a mode falls back to when a link omits or breaks them. DEFAULT_STATE is a planar
 * system whose g = -x is rejected in first-order mode (x is not a first-order symbol), so a link
 * such as ?m=first&g=<invalid> would otherwise show a notice AND a parse error and no picture.
 */
export const MODE_DEFAULT_EXPRESSIONS: Record<AppMode, Partial<Pick<AppState, "g" | "f" | "M" | "N" | "eq">>> = {
  system: { f: "y", g: "-x" },
  first: { g: "y*(1 - y)" },
  diff: { M: "t", N: "y" },
  second: { eq: "x'' + 0.5*x' + x = 0" },
};

/** Whether the horizontal coordinate is the student's t (first-order pictures) or x. */
export function horizontalIsT(mode: AppMode): boolean {
  return mode === "first" || mode === "diff";
}

/** Whether the vertical coordinate is the velocity x' (a second-order picture) or y. */
export function verticalIsXp(mode: AppMode): boolean {
  return mode === "second";
}

/** Which expression fields a mode uses; the others are never encoded and are ignored when decoding. */
export function expressionKeysOf(mode: AppMode): ReadonlyArray<"g" | "f" | "M" | "N" | "eq"> {
  switch (mode) {
    case "first":
      return ["g"];
    case "diff":
      return ["M", "N"];
    case "system":
      return ["f", "g"];
    case "second":
      return ["eq"];
  }
}

/**
 * The parser check a link's expression must pass: exactly what the page compiles with. Throws
 * (ParseError) on anything the whitelist rejects; the caller turns that into a problem.
 */
export function validateExpression(mode: AppMode, key: "g" | "f" | "M" | "N" | "eq", expr: string, params: readonly ParamEntry[] = []): void {
  // Round T: a name the expression leaves free is a parameter the page will list (at the default
  // value, marked as needing one), so it does not make the link invalid; the link's own values win.
  const free = discoverParams(mode, { g: expr, f: expr, M: expr, N: expr, eq: expr }) ?? [];
  const all = paramsRecord([...free.filter((name) => !params.some((e) => e.name === name)).map((name) => ({ name, value: DEFAULT_PARAM_VALUE })), ...params]);
  if (key === "eq") {
    reduceSecondOrder(expr, all);
    return;
  }
  compileScalar(expr, all, { variables: mode === "system" ? "xy" : "ty" });
}

/** Numbers of the entered box / t0: the shortest exact decimal form. */
function formatExact(n: number): string {
  return String(n === 0 ? 0 : n);
}

/** Trajectory starts come from clicks: 6 significant digits keep the link readable (the curve is unchanged visibly). */
function formatStart(n: number): string {
  return String(n === 0 ? 0 : Number(n.toPrecision(6)));
}

/**
 * URLSearchParams percent-encodes characters that are legal in a query and common in equations;
 * put them back so a teacher can read "y*(1-y)" and "t^2" in the link. "+" stays %2B and "="
 * stays %3D (both structural). Decoding accepts either form.
 */
const READABLE: ReadonlyArray<[string, string]> = [
  ["%28", "("],
  ["%29", ")"],
  ["%2C", ","],
  ["%3B", ";"],
  ["%5E", "^"],
  ["%2F", "/"],
  ["%27", "'"],
  ["%3A", ":"],
];

function readable(query: string): string {
  let out = query;
  for (const [code, ch] of READABLE) out = out.split(code).join(ch);
  return out;
}

/** The state as a query string without the leading "?"; "" for the default state. */
export function encodeState(state: AppState): string {
  const q = new URLSearchParams();
  const d = DEFAULT_STATE;
  if (state.mode !== d.mode) q.set("m", state.mode);
  for (const key of expressionKeysOf(state.mode)) {
    if (state[key] !== d[key]) q.set(key, state[key]);
  }
  const [hMin, hMax] = horizontalIsT(state.mode) ? ["tmin", "tmax"] : ["xmin", "xmax"];
  const [vMin, vMax] = verticalIsXp(state.mode) ? ["xpmin", "xpmax"] : ["ymin", "ymax"];
  if (state.box.xMin !== d.box.xMin) q.set(hMin, formatExact(state.box.xMin));
  if (state.box.xMax !== d.box.xMax) q.set(hMax, formatExact(state.box.xMax));
  if (state.box.yMin !== d.box.yMin) q.set(vMin, formatExact(state.box.yMin));
  if (state.box.yMax !== d.box.yMax) q.set(vMax, formatExact(state.box.yMax));
  // Planar pictures: the time-series view's t range and the chosen picture (round Q).
  if (!horizontalIsT(state.mode)) {
    if (state.timeRange.min !== d.timeRange.min) q.set("tmin", formatExact(state.timeRange.min));
    if (state.timeRange.max !== d.timeRange.max) q.set("tmax", formatExact(state.timeRange.max));
    if (state.view !== null) q.set("view", state.view);
  }
  if (state.locale !== null) q.set("loc", state.locale);
  if (!state.equalScale) q.set("eqs", "0");
  if (state.density !== d.density) q.set("d", String(state.density));
  if (state.arrowMode !== d.arrowMode) q.set("arrows", state.arrowMode);
  if (state.snapshotT !== d.snapshotT && !horizontalIsT(state.mode)) q.set("t0", formatExact(state.snapshotT));
  if (state.trajectoryStarts.length) q.set("traj", state.trajectoryStarts.map((p) => `${formatStart(p.x)},${formatStart(p.y)}`).join(";"));
  // Round T: exact values (the shortest decimal that reads back as the same number), so the
  // picture a teacher links to is the picture the reader gets.
  if (state.params.length) q.set("p", state.params.map((e) => `${e.name}:${formatParamValue(e.value)}`).join(","));
  if (state.sliders.length) q.set("sl", state.sliders.map((e) => `${e.name}:${formatParamValue(e.min)}:${formatParamValue(e.max)}:${formatParamValue(e.step)}`).join(","));
  return readable(q.toString());
}

/** Absolute share link: origin + path + "?" + query (no "?" for the default state). */
export function buildShareUrl(origin: string, path: string, state: AppState): string {
  const q = encodeState(state);
  return `${origin}${path}${q ? `?${q}` : ""}`;
}

/** Next's `searchParams` object as URLSearchParams (the first value of a repeated parameter wins). */
export function queryFromSearchParams(params: Record<string, string | string[] | undefined>): URLSearchParams {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string") q.set(key, first);
  }
  return q;
}

const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const INTEGER_RE = /^[+-]?\d+$/;

type Parsed = { value: number; reason: null } | { value: null; reason: UrlProblemReason };

/** Strict decimal number: no hex, no Infinity/NaN words, finite, |v| <= MAX_ABS_VALUE. */
function parseBounded(text: string): Parsed {
  const s = text.trim();
  if (!NUMBER_RE.test(s)) return { value: null, reason: "notANumber" };
  const v = Number(s);
  if (!Number.isFinite(v) || Math.abs(v) > MAX_ABS_VALUE) return { value: null, reason: "outOfRange" };
  return { value: v === 0 ? 0 : v, reason: null };
}

function cloneState(s: AppState): AppState {
  return { ...s, box: { ...s.box }, timeRange: { ...s.timeRange }, trajectoryStarts: s.trajectoryStarts.map((p) => ({ x: p.x, y: p.y })), params: s.params.map((e) => ({ ...e })), sliders: s.sliders.map((e) => ({ ...e })) };
}

/**
 * Decodes a query (with or without the leading "?") over `fallback`: every field the query does
 * not set, or sets to something invalid, keeps the fallback's value. Never throws. Problems are
 * deduplicated per (param, reason) so a malformed traj list yields one line, not twenty.
 */
export function decodeState(query: string | URLSearchParams, fallback: AppState): { state: AppState; problems: UrlProblem[] } {
  const state = cloneState(fallback);
  const problems: UrlProblem[] = [];
  const problem = (param: string, reason: UrlProblemReason) => {
    if (!problems.some((p) => p.param === param && p.reason === reason)) problems.push({ param, reason });
  };

  const raw = typeof query === "string" ? query.replace(/^\?/, "") : query.toString();
  if (raw.length > MAX_QUERY_LENGTH) {
    problem("query", "queryTooLong");
    return { state, problems };
  }
  const q = typeof query === "string" ? new URLSearchParams(raw) : query;

  const m = q.get("m");
  if (m !== null) {
    if ((APP_MODES as readonly string[]).includes(m)) state.mode = m as AppMode;
    else problem("m", "badChoice");
  }
  const mode = state.mode;
  // A link that switches the mode but omits or breaks its expressions must still draw something:
  // the planar fallback (g = -x) is not a first-order expression (x is rejected there), so each
  // mode falls back to an expression of its own.
  if (mode !== fallback.mode) Object.assign(state, MODE_DEFAULT_EXPRESSIONS[mode]);

  // Round T: the parameters come first, because the expressions are validated WITH them. An entry
  // is "name:value"; one that is not, whose name the compiler would refuse (reserved, not an
  // identifier), whose value is not a bounded decimal, or that repeats a name is dropped as a
  // whole and reported as "p:name" (never half-read, never silently).
  const p = q.get("p");
  if (p !== null) {
    const params: ParamEntry[] = [];
    for (const entry of p.split(",").filter((e) => e.trim() !== "")) {
      const parts = entry.split(":");
      if (parts.length !== 2) {
        problem("p", "malformedPair");
        continue;
      }
      const name = parts[0].trim();
      const nameProblem = paramNameProblem(name, mode);
      if (nameProblem) {
        problem(name === "" ? "p" : `p:${name.slice(0, 24)}`, nameProblem === "reserved" || nameProblem === "reservedV" ? "reservedParamName" : nameProblem === "tooLong" ? "tooLong" : "badParamName");
        continue;
      }
      const value = parseBounded(parts[1]);
      if (value.reason) {
        problem(`p:${name}`, value.reason);
        continue;
      }
      if (params.some((e) => e.name === name)) {
        problem(`p:${name}`, "duplicateParam");
        continue;
      }
      if (params.length >= MAX_PARAMS) {
        problem("p", "tooMany");
        break;
      }
      params.push({ name, value: value.value });
    }
    state.params = params;
  }

  const used = expressionKeysOf(mode);
  for (const key of ["g", "f", "M", "N", "eq"] as const) {
    const value = q.get(key);
    if (value === null) continue;
    if (!used.includes(key)) {
      problem(key, "unusedInMode");
      continue;
    }
    const expr = value.trim();
    if (expr.length > MAX_URL_EXPRESSION_LENGTH) {
      problem(key, "tooLong");
      continue;
    }
    try {
      validateExpression(mode, key, expr, state.params);
      state[key] = expr;
    } catch {
      problem(key, "invalidExpression");
    }
  }

  const horizontalT = horizontalIsT(mode);
  const [hMin, hMax] = horizontalT ? ["tmin", "tmax"] : ["xmin", "xmax"];
  // A first-order picture has no separate x range; a planar one reads tmin / tmax as the
  // time-series view's t range (round Q) below.
  if (horizontalT) for (const key of ["xmin", "xmax"]) if (q.get(key) !== null) problem(key, "unusedInMode");
  // The vertical range: xpmin/xpmax on a second-order picture (ymin/ymax still read there, for
  // links written before round P, without a notice); ymin/ymax elsewhere, where xpmin/xpmax are unused.
  const verticalXp = verticalIsXp(mode);
  if (!verticalXp) for (const key of ["xpmin", "xpmax"]) if (q.get(key) !== null) problem(key, "unusedInMode");
  const vMin = verticalXp && q.get("xpmin") === null && q.get("ymin") !== null ? "ymin" : verticalXp ? "xpmin" : "ymin";
  const vMax = verticalXp && q.get("xpmax") === null && q.get("ymax") !== null ? "ymax" : verticalXp ? "xpmax" : "ymax";

  const readSide = (param: string, current: number): number => {
    const value = q.get(param);
    if (value === null) return current;
    const p = parseBounded(value);
    if (p.reason) {
      problem(param, p.reason);
      return current;
    }
    return p.value;
  };
  const checkPair = (minKey: string, maxKey: string, min: number, max: number, fallbackMin: number, fallbackMax: number): [number, number] => {
    const reason: UrlProblemReason | null = !(min < max) ? "invertedRange" : max - min < MIN_BOX_SIDE ? "tooNarrow" : null;
    if (reason === null) return [min, max];
    for (const key of [minKey, maxKey]) if (q.get(key) !== null) problem(key, reason);
    return [fallbackMin, fallbackMax];
  };
  [state.box.xMin, state.box.xMax] = checkPair(hMin, hMax, readSide(hMin, state.box.xMin), readSide(hMax, state.box.xMax), fallback.box.xMin, fallback.box.xMax);
  [state.box.yMin, state.box.yMax] = checkPair(vMin, vMax, readSide(vMin, state.box.yMin), readSide(vMax, state.box.yMax), fallback.box.yMin, fallback.box.yMax);
  if (!horizontalT) {
    // The time-series view (round Q): its t range and the chosen picture.
    [state.timeRange.min, state.timeRange.max] = checkPair("tmin", "tmax", readSide("tmin", state.timeRange.min), readSide("tmax", state.timeRange.max), fallback.timeRange.min, fallback.timeRange.max);
    const view = q.get("view");
    if (view !== null) {
      if (view === "phase" || view === "time") state.view = view;
      else problem("view", "badChoice");
    }
  } else if (q.get("view") !== null) {
    problem("view", "unusedInMode");
  }

  const loc = q.get("loc");
  if (loc !== null) {
    if (loc === "zh" || loc === "en") state.locale = loc;
    else problem("loc", "badChoice");
  }

  const eqs = q.get("eqs");
  if (eqs !== null) {
    if (eqs === "0" || eqs === "1") state.equalScale = eqs === "1";
    else problem("eqs", "badChoice");
  }

  const d = q.get("d");
  if (d !== null) {
    const s = d.trim();
    if (!INTEGER_RE.test(s)) problem("d", "notInteger");
    else {
      const v = Number(s);
      if (v < DENSITY_MIN || v > DENSITY_MAX) problem("d", "outOfRange");
      else state.density = v;
    }
  }

  const arrows = q.get("arrows");
  if (arrows !== null) {
    if (arrows === "unit" || arrows === "scaled") state.arrowMode = arrows;
    else problem("arrows", "badChoice");
  }

  const t0 = q.get("t0");
  if (t0 !== null) {
    // A first-order picture has no snapshot time (its t is the horizontal axis): a hand-written
    // t0 there is reported as unused rather than silently swallowed (round P2).
    if (horizontalT) problem("t0", "unusedInMode");
    else {
      const p = parseBounded(t0);
      if (p.reason) problem("t0", p.reason);
      else state.snapshotT = p.value;
    }
  }

  const traj = q.get("traj");
  if (traj !== null) {
    const starts: Vec2[] = [];
    const entries = traj.split(";").filter((e) => e.trim() !== "");
    for (const entry of entries) {
      const parts = entry.split(",");
      const x = parts.length === 2 ? parseBounded(parts[0]) : null;
      const y = parts.length === 2 ? parseBounded(parts[1]) : null;
      if (!x || !y || x.reason || y.reason) {
        problem("traj", "malformedPair");
        continue;
      }
      if (starts.length >= MAX_TRAJECTORY_STARTS) {
        problem("traj", "tooMany");
        break;
      }
      starts.push({ x: x.value as number, y: y.value as number });
    }
    state.trajectoryStarts = starts;
  }

  // Round U: the shown sliders, read last: a slider belongs to a parameter the page will have,
  // one the link gives in p or one the (already validated) equation leaves free.
  const sl = q.get("sl");
  if (sl !== null) {
    const known = new Set<string>([...state.params.map((e) => e.name), ...(discoverParams(mode, state) ?? [])]);
    const sliders: SliderEntry[] = [];
    for (const entry of sl.split(",").filter((e) => e.trim() !== "")) {
      const parts = entry.split(":");
      if (parts.length !== 4) {
        problem("sl", "malformedPair");
        continue;
      }
      const name = parts[0].trim();
      const tag = name === "" ? "sl" : `sl:${name.slice(0, 24)}`;
      const numbers = parts.slice(1).map(parseBounded);
      const bad = numbers.find((n) => n.reason);
      if (bad?.reason) {
        problem(tag, bad.reason);
        continue;
      }
      if (!known.has(name)) {
        problem(tag, "sliderWithoutParam");
        continue;
      }
      if (sliders.some((e) => e.name === name)) {
        problem(tag, "duplicateParam");
        continue;
      }
      const [min, max, step] = numbers.map((n) => n.value as number);
      const rangeProblem = sliderRangeProblem({ min, max, step });
      if (rangeProblem) {
        problem(tag, rangeProblem === "inverted" ? "invertedRange" : rangeProblem === "outOfRange" || rangeProblem === "notANumber" ? "outOfRange" : rangeProblem);
        continue;
      }
      sliders.push({ name, min, max, step });
    }
    state.sliders = sliders;
  }

  return { state, problems };
}
