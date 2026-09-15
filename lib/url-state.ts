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
 *   tmin, tmax   horizontal range of a first-order picture (first, diff): the t range
 *   xmin, xmax   horizontal range of a planar picture (system, second)
 *   ymin, ymax   vertical range of a first-order or planar picture (first, diff, system): the y range
 *   xpmin, xpmax vertical range of a second-order picture (second): the x' range (round P; links
 *                written before it used ymin/ymax there, which are still read, silently, and
 *                never written again)
 *   loc    zh | en (omitted: English)
 *   eqs    0 = equal scale off (omitted when on)
 *   d      grid density 5..40 (omitted at 20)
 *   arrows scaled (omitted for unit arrows)
 *   t0     snapshot time of a non-autonomous system (omitted at 0)
 *   traj   fixed trajectory starts "x,y;x,y" (at most 20 pairs; omitted when empty)
 * Unknown parameters are ignored (so /embed's own `controls` never counts as a problem).
 */
import { compileScalar } from "./core/parse";
import { reduceSecondOrder } from "./core/second-order";
import type { Locale, Vec2 } from "./core/types";
import type { ArrowMode } from "./render/arrows";

export type AppMode = "first" | "diff" | "system" | "second";

/** The entered range; for first / diff the horizontal range is the t range. */
export type AppBox = { xMin: number; xMax: number; yMin: number; yMax: number };

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
  | "unusedInMode";

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
export const MAX_TRAJECTORY_STARTS = 20;
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
export function validateExpression(mode: AppMode, key: "g" | "f" | "M" | "N" | "eq", expr: string): void {
  if (key === "eq") {
    reduceSecondOrder(expr);
    return;
  }
  compileScalar(expr, undefined, { variables: mode === "system" ? "xy" : "ty" });
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
  if (state.locale !== null) q.set("loc", state.locale);
  if (!state.equalScale) q.set("eqs", "0");
  if (state.density !== d.density) q.set("d", String(state.density));
  if (state.arrowMode !== d.arrowMode) q.set("arrows", state.arrowMode);
  if (state.snapshotT !== d.snapshotT) q.set("t0", formatExact(state.snapshotT));
  if (state.trajectoryStarts.length) q.set("traj", state.trajectoryStarts.map((p) => `${formatStart(p.x)},${formatStart(p.y)}`).join(";"));
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
  return { ...s, box: { ...s.box }, trajectoryStarts: s.trajectoryStarts.map((p) => ({ x: p.x, y: p.y })) };
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
      validateExpression(mode, key, expr);
      state[key] = expr;
    } catch {
      problem(key, "invalidExpression");
    }
  }

  const horizontalT = horizontalIsT(mode);
  const [hMin, hMax, otherMin, otherMax] = horizontalT ? ["tmin", "tmax", "xmin", "xmax"] : ["xmin", "xmax", "tmin", "tmax"];
  for (const key of [otherMin, otherMax]) if (q.get(key) !== null) problem(key, "unusedInMode");
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
    const p = parseBounded(t0);
    if (p.reason) problem("t0", p.reason);
    else state.snapshotT = p.value;
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

  return { state, problems };
}
