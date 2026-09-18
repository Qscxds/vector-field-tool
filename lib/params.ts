/**
 * Symbolic parameters of the web shell (round T): the student writes k*y*(1 - y/L) and gives k and
 * L a value in the parameter area, instead of typing the numbers into the equation. The kernel has
 * always taken `params` (the MCP tools pass them); this module is the pure state behind the form:
 *
 * - DISCOVERY: the names an equation leaves free (lib/core/parse freeSymbols), filtered by the
 *   compiler's own rule for a parameter name. One parameter set is shared by every expression of a
 *   mode and by all four modes.
 * - ROWS: one "name = value" row per parameter. A discovered name gets a row by itself (value 1,
 *   marked `pending` until the student gives it a value); a row the equation stops using goes away
 *   and its value is REMEMBERED, so typing the name again brings the value back; a row the student
 *   added by hand stays until the student removes it. A row the equation still uses cannot be
 *   removed: nothing is ever silently reset to a default.
 * - VALUES: text, so "-" and "0." can be typed; the last valid number stays in force meanwhile and
 *   the row says so. Finite decimals within MAX_PARAM_ABS_VALUE (the link's bound).
 * - TEXT: "k = 0.8, L = 2" for the result lines, the tool summaries, the PNG footer and the widget.
 *
 * Pure: no React, no DOM. The shell keeps a ParamState in its form state.
 */
import { freeSymbols, parameterNameProblem } from "./core/parse";
import { freeSymbolsSecondOrder, V, XD, XDD } from "./core/second-order";
import type { SystemSpec } from "./core/types";

/** The four input modes (the same union as lib/url-state's AppMode, which imports this module). */
export type ParamMode = "first" | "diff" | "system" | "second";

/** A parameter as the link and the presets carry it. */
export type ParamEntry = { name: string; value: number };

/** At most this many parameters in a page or a link. */
export const MAX_PARAMS = 12;
export const MAX_PARAM_NAME_LENGTH = 24;
/** |value| bound, the same as every other number of a link (lib/url-state MAX_ABS_VALUE). */
export const MAX_PARAM_ABS_VALUE = 1e6;
/** The value a discovered parameter starts with (the row is marked pending until the student sets one). */
export const DEFAULT_PARAM_VALUE = 1;

export type ParamExpressions = Partial<Record<"f" | "g" | "M" | "N" | "eq", string>>;

/** The expressions a mode reads, in the order their parameters are listed. */
function expressionTexts(mode: ParamMode, e: ParamExpressions): string[] {
  switch (mode) {
    case "first":
      return [e.g ?? ""];
    case "diff":
      return [e.M ?? "", e.N ?? ""];
    case "system":
      return [e.f ?? "", e.g ?? ""];
    case "second":
      return [e.eq ?? ""];
  }
}

/** The variable letters of a mode: a name made only of them (ty, xy, tx) is a forgotten "*", not a parameter. */
function variableLetters(mode: ParamMode): string {
  return mode === "system" ? "xyt" : mode === "second" ? "xtv" : "ty";
}

export type ParamNameProblem = "empty" | "invalid" | "reserved" | "reservedV" | "tooLong";

/**
 * Why a name cannot be a parameter in this mode, or null. The compiler's rule
 * (parameterNameProblem) plus the second-order mode's own reserved names: v is the alias of x',
 * and xd / xdd are refused as typed placeholders.
 */
export function paramNameProblem(name: string, mode: ParamMode): ParamNameProblem | null {
  if (name === "") return "empty";
  if (name.length > MAX_PARAM_NAME_LENGTH) return "tooLong";
  const kernel = parameterNameProblem(name);
  if (kernel) return kernel;
  if (mode === "second") {
    if (name === V) return "reservedV";
    if (name === XD || name === XDD) return "reserved";
  }
  return null;
}

/**
 * The parameters an equation needs: its free symbols that may be parameter names, in order of
 * appearance over the mode's expressions. A free symbol that cannot be a parameter (a stray x in a
 * first-order equation, y in a second-order one) is left to the compiler, which explains it in the
 * student's notation; so is a multi-letter name made only of the mode's variable letters ("ty" in
 * sin(ty)): that is a product missing its "*", and the compiler's error says so. null while an
 * expression does not parse (mid-typing): the caller keeps its rows.
 */
export function discoverParams(mode: ParamMode, expressions: ParamExpressions): string[] | null {
  const found: string[] = [];
  const letters = new RegExp(`^[${variableLetters(mode)}]+$`);
  for (const text of expressionTexts(mode, expressions)) {
    const names = mode === "second" ? freeSymbolsSecondOrder(text) : freeSymbols(text, { variables: mode === "system" ? "xy" : "ty" });
    if (names === null) return null;
    for (const name of names) {
      if (found.includes(name) || paramNameProblem(name, mode) !== null) continue;
      if (name.length > 1 && letters.test(name)) continue;
      found.push(name);
    }
  }
  return found;
}

/**
 * A discovered two-letter name with a variable letter in it (ky, at, kx): most likely a product
 * missing its "*". It IS listed (k2, Ta and the like are legitimate names, and the rule cannot
 * tell), but the pending row says how it was read and how to write the product.
 */
export function looksLikeProduct(name: string, mode: ParamMode): string | null {
  if (!/^[A-Za-z]{2}$/.test(name)) return null;
  const letters = variableLetters(mode);
  const [a, b] = name.split("");
  return letters.includes(a) || letters.includes(b) ? `${a}*${b}` : null;
}

export type ParamValueProblem = "empty" | "notANumber" | "outOfRange";

/** One typed value: a finite decimal within the bound, or why not ("1e-3", "-0.5", ".5" are numbers; "1,5" and "pi" are not). */
export function parseParamValue(text: string): { value: number } | { reason: ParamValueProblem } {
  const trimmed = text.trim();
  if (trimmed === "") return { reason: "empty" };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { reason: "notANumber" };
  if (Math.abs(value) > MAX_PARAM_ABS_VALUE) return { reason: "outOfRange" };
  return { value: value === 0 ? 0 : value };
}

/** The shortest decimal text that reads back as exactly this number (a link and a row show the same digits). */
export function formatParamValue(value: number): string {
  return String(value === 0 ? 0 : value);
}

export type ParamRow = {
  /** Stable key of the row (React key; names can repeat while the student types). */
  id: number;
  name: string;
  /** The value as typed. */
  text: string;
  /** The last valid number typed into `text`: what the picture uses while `text` is mid-edit. */
  value: number;
  /** "auto": listed because the equation uses the name, removed when it stops; "manual": added by the student, stays. */
  origin: "auto" | "manual";
  /** Discovered and not yet given a value by the student: highlighted, "needs a value". */
  pending: boolean;
  /** Round U: the row's slider; absent until the student (or a link / preset) first shows it. */
  slider?: SliderState;
};

/** A row's slider as the form holds it: shown or not, and its range as typed text (the last valid range stays in force mid-edit). */
export type SliderState = { on: boolean; min: string; max: string; step: string; range: SliderRange };

export type SliderRange = { min: number; max: number; step: number };
/** A slider as the link and the presets carry it: only sliders that are SHOWN travel. */
export type SliderEntry = { name: string } & SliderRange;

/** At most this many steps across a slider (a step of 1e-9 over [0, 1] is a slider nobody can use, and a drag would flood the kernel). */
export const MAX_SLIDER_STEPS = 10000;

export type ParamState = {
  rows: ParamRow[];
  /** Values of rows that went away with their name's last use: restored when the name comes back. */
  memory: Record<string, { text: string; value: number; slider?: SliderState }>;
  nextId: number;
};

export const EMPTY_PARAMS: ParamState = { rows: [], memory: {}, nextId: 1 };

/** 1, 2 or 5 times a power of ten, the largest not above v (v > 0): a step a person would choose. */
function niceStep(v: number): number {
  const power = 10 ** Math.floor(Math.log10(v));
  // A hair of slack: 0.005 / 0.001 must count as 5 whichever way the division rounds.
  const mantissa = (v / power) * (1 + 1e-12);
  return (mantissa >= 5 ? 5 : mantissa >= 2 ? 2 : 1) * power;
}

/** Binary noise removed: 2 * 0.8 reads 1.6, 0.1 * 3 reads 0.3, in the field and in the link. */
function clean(v: number): number {
  return Number(v.toPrecision(12));
}

/**
 * The range a slider opens with, from the value in force: 0 to twice the value (from twice a
 * negative value up to 0), or -1 to 1 around 0; about a hundred steps across, at a round step
 * (0.8 -> 0 .. 1.6 by 0.01; 20 -> 0 .. 40 by 0.2; -3 -> -6 .. 0 by 0.05). The student can change all three.
 */
export function defaultSliderRange(value: number): SliderRange {
  const [min, max] = value > 0 ? [0, 2 * value] : value < 0 ? [2 * value, 0] : [-1, 1];
  return { min: clean(min), max: clean(max), step: clean(niceStep((max - min) / 100)) };
}

export type SliderRangeProblem = "notANumber" | "outOfRange" | "inverted" | "badStep" | "tooManySteps";

/** The three typed fields as a range, or why not: finite bounded numbers, min < max, 0 < step <= max - min, at most MAX_SLIDER_STEPS steps. */
export function parseSliderRange(min: string, max: string, step: string): { range: SliderRange } | { reason: SliderRangeProblem } {
  const values: number[] = [];
  for (const text of [min, max, step]) {
    const v = parseParamValue(text);
    if ("reason" in v) return { reason: v.reason === "outOfRange" ? "outOfRange" : "notANumber" };
    values.push(v.value);
  }
  const [lo, hi, st] = values;
  if (!(lo < hi)) return { reason: "inverted" };
  if (!(st > 0) || st > hi - lo) return { reason: "badStep" };
  if ((hi - lo) / st > MAX_SLIDER_STEPS) return { reason: "tooManySteps" };
  return { range: { min: lo, max: hi, step: st } };
}

/** The same check on numbers (a link's entry). */
export function sliderRangeProblem(r: SliderRange): SliderRangeProblem | null {
  if (![r.min, r.max, r.step].every((v) => Number.isFinite(v) && Math.abs(v) <= MAX_PARAM_ABS_VALUE)) return "outOfRange";
  if (!(r.min < r.max)) return "inverted";
  if (!(r.step > 0) || r.step > r.max - r.min) return "badStep";
  return (r.max - r.min) / r.step > MAX_SLIDER_STEPS ? "tooManySteps" : null;
}

/**
 * A slider position as a parameter value: clamped to the range, snapped to the step grid counted
 * from `min`, and cleaned of binary noise (0.1 * 3 is 0.3 in the field and in the link).
 */
export function snapToSlider(value: number, r: SliderRange): number {
  const steps = Math.round((Math.min(r.max, Math.max(r.min, value)) - r.min) / r.step);
  return clean(Math.min(r.max, r.min + steps * r.step));
}

function sliderStateOf(range: SliderRange, on: boolean): SliderState {
  return { on, min: formatParamValue(range.min), max: formatParamValue(range.max), step: formatParamValue(range.step), range };
}

/** Shows or hides a row's slider; the first showing opens it at defaultSliderRange of the value in force, later ones keep the student's range. */
export function toggleSlider(state: ParamState, id: number, on: boolean): ParamState {
  return { ...state, rows: state.rows.map((r) => (r.id === id ? { ...r, slider: r.slider ? { ...r.slider, on } : sliderStateOf(defaultSliderRange(r.value), on) } : r)) };
}

/** The student typed into one of the slider's range fields: the text always changes, the range in force only when all three make a valid range. */
export function setSliderField(state: ParamState, id: number, field: "min" | "max" | "step", text: string): ParamState {
  return {
    ...state,
    rows: state.rows.map((r) => {
      if (r.id !== id || !r.slider) return r;
      const next = { ...r.slider, [field]: text };
      const parsed = parseSliderRange(next.min, next.max, next.step);
      return { ...r, slider: "range" in parsed ? { ...next, range: parsed.range } : next };
    }),
  };
}

/** The slider moved: the parameter takes the snapped value (its text follows; it is no longer pending). */
export function slideParam(state: ParamState, id: number, position: number): ParamState {
  const row = state.rows.find((r) => r.id === id);
  return row?.slider ? setParamValue(state, id, snapToSlider(position, row.slider.range)) : state;
}

/** The sliders a link or a preset carries, put onto the rows of the same name, shown. */
export function withSliders(state: ParamState, sliders: readonly SliderEntry[]): ParamState {
  if (sliders.length === 0) return state;
  return {
    ...state,
    rows: state.rows.map((r) => {
      const entry = sliders.find((e) => e.name === r.name);
      return entry ? { ...r, slider: sliderStateOf({ min: entry.min, max: entry.max, step: entry.step }, true) } : r;
    }),
  };
}

/** The SHOWN sliders of the link's parameters (`entries`: the valid rows), in their order. */
export function sliderEntries(state: ParamState, entries: readonly ParamEntry[]): SliderEntry[] {
  const out: SliderEntry[] = [];
  for (const e of entries) {
    const row = state.rows.find((r) => r.name === e.name);
    if (row?.slider?.on) out.push({ name: e.name, ...row.slider.range });
  }
  return out;
}

/** The rows of a link or a preset (values given, so nothing is pending); names the equation uses are "auto" rows. */
export function paramsFromEntries(entries: readonly ParamEntry[], used: readonly string[] | null): ParamState {
  let state: ParamState = EMPTY_PARAMS;
  for (const e of entries) {
    if (state.rows.some((r) => r.name === e.name)) continue;
    const origin = used === null || used.includes(e.name) ? "auto" : "manual";
    state = { ...state, rows: [...state.rows, { id: state.nextId, name: e.name, text: formatParamValue(e.value), value: e.value, origin, pending: false }], nextId: state.nextId + 1 };
  }
  return syncParams(state, used);
}

/**
 * Follows the equation: every used name without a row gets one (its remembered value, else the
 * default, pending), every "auto" row whose name is no longer used goes away and is remembered.
 * `used === null` (the equation does not parse right now) changes nothing. Returns the same object
 * when nothing changed, so a shell can call it on every keystroke.
 */
export function syncParams(state: ParamState, used: readonly string[] | null): ParamState {
  if (used === null) return state;
  const gone = state.rows.filter((r) => r.origin === "auto" && !used.includes(r.name));
  const missing = used.filter((name) => !state.rows.some((r) => r.name === name)).slice(0, Math.max(0, MAX_PARAMS - (state.rows.length - gone.length)));
  if (gone.length === 0 && missing.length === 0) return state;
  const memory = { ...state.memory };
  // A pending row never had a value of the student's: nothing to remember.
  for (const r of gone) if (!r.pending) memory[r.name] = { text: r.text, value: r.value, ...(r.slider ? { slider: r.slider } : {}) };
  let nextId = state.nextId;
  const kept = state.rows.filter((r) => !gone.includes(r));
  const added: ParamRow[] = missing.map((name) => {
    const remembered = memory[name];
    delete memory[name];
    return remembered
      ? { id: nextId++, name, text: remembered.text, value: remembered.value, origin: "auto", pending: false, ...(remembered.slider ? { slider: remembered.slider } : {}) }
      : { id: nextId++, name, text: formatParamValue(DEFAULT_PARAM_VALUE), value: DEFAULT_PARAM_VALUE, origin: "auto", pending: true };
  });
  return { rows: [...kept, ...added], memory, nextId };
}

/** The student typed into a value field: the text always changes; the number in force only when the text is a valid value. */
export function setParamText(state: ParamState, id: number, text: string): ParamState {
  const parsed = parseParamValue(text);
  return { ...state, rows: state.rows.map((r) => (r.id === id ? { ...r, text, pending: false, ...("value" in parsed ? { value: parsed.value } : {}) } : r)) };
}

/** A value set as a number (a slider, a preset): the text follows it. */
export function setParamValue(state: ParamState, id: number, value: number): ParamState {
  return setParamText(state, id, formatParamValue(value));
}

/** The name field of a row the student added by hand ("auto" rows take their name from the equation). */
export function setParamName(state: ParamState, id: number, name: string): ParamState {
  return { ...state, rows: state.rows.map((r) => (r.id === id && r.origin === "manual" ? { ...r, name: name.trim() } : r)) };
}

/** An empty row for the student to fill in; refused (same state) at MAX_PARAMS. */
export function addParamRow(state: ParamState): ParamState {
  if (state.rows.length >= MAX_PARAMS) return state;
  return { ...state, rows: [...state.rows, { id: state.nextId, name: "", text: formatParamValue(DEFAULT_PARAM_VALUE), value: DEFAULT_PARAM_VALUE, origin: "manual", pending: false }], nextId: state.nextId + 1 };
}

/**
 * Removes a row, unless the equation still uses its name: then the row STAYS and `refused` names
 * it, so the shell can say "the expression still uses k". Deleting it would only make discovery
 * add it back at the default value, which is the silent reset this rule forbids. With two rows of
 * one name the duplicate can go (the first one carries the value).
 */
export function removeParamRow(state: ParamState, id: number, used: readonly string[] | null): { state: ParamState; refused: string | null } {
  const row = state.rows.find((r) => r.id === id);
  if (!row) return { state, refused: null };
  const first = state.rows.find((r) => r.name === row.name);
  if (used?.includes(row.name) && first === row) return { state, refused: row.name };
  return { state: { ...state, rows: state.rows.filter((r) => r.id !== id) }, refused: null };
}

export type ParamRowProblem = { id: number; problem: ParamNameProblem | "duplicate" | ParamValueProblem; field: "name" | "value" };

/**
 * What the rows mean right now: the values handed to the compiler (`values`: valid names the
 * equation uses, each at its number in force; undefined when there are none, so a parameter-free
 * equation compiles exactly as before round T), every valid row for the link (`entries`), and the
 * problems to show beside the rows. A value problem does not drop the row: its last valid number
 * stays in force and the row says so.
 */
export function resolveParams(state: ParamState, mode: ParamMode, used: readonly string[] | null): { values: Record<string, number> | undefined; entries: ParamEntry[]; problems: ParamRowProblem[] } {
  const problems: ParamRowProblem[] = [];
  const entries: ParamEntry[] = [];
  const seen = new Set<string>();
  for (const r of state.rows) {
    const nameProblem = paramNameProblem(r.name, mode);
    if (nameProblem) {
      problems.push({ id: r.id, problem: nameProblem, field: "name" });
      continue;
    }
    if (seen.has(r.name)) {
      problems.push({ id: r.id, problem: "duplicate", field: "name" });
      continue;
    }
    seen.add(r.name);
    const parsed = parseParamValue(r.text);
    if ("reason" in parsed) problems.push({ id: r.id, problem: parsed.reason, field: "value" });
    entries.push({ name: r.name, value: r.value });
  }
  const inUse = entries.filter((e) => used === null || used.includes(e.name));
  return { values: inUse.length ? Object.fromEntries(inUse.map((e) => [e.name, e.value])) : undefined, entries, problems };
}

/** The entries as the `params` record of a spec; undefined for none (a spec without params is unchanged). */
export function paramsRecord(entries: readonly ParamEntry[]): Record<string, number> | undefined {
  return entries.length ? Object.fromEntries(entries.map((e) => [e.name, e.value])) : undefined;
}

/**
 * The parameters a compiled picture actually uses, in the order the spec lists them: the ones its
 * f or g mention. A tool call may carry spare names; "with a = 1" about a name that is not in the
 * equation would only confuse the student.
 */
export function paramsInUse(spec: Pick<SystemSpec, "f" | "g" | "params" | "variables"> | undefined | null): ParamEntry[] {
  if (!spec?.params) return [];
  const opts = { variables: spec.variables };
  const mentioned = new Set([...(freeSymbols(spec.f, opts) ?? []), ...(freeSymbols(spec.g, opts) ?? [])]);
  return Object.entries(spec.params)
    .filter(([name]) => mentioned.has(name))
    .map(([name, value]) => ({ name, value }));
}

/**
 * The parameters the equation of a Scene uses. A second-order scene is read from the equation the
 * student gave (its reduced g may have simplified a name away: 0*b*x' still mentions b), every
 * other scene from its system. The widget, the PNG footer and the tool summaries all go through
 * here, so they name the same parameters.
 */
export function sceneParams(scene: { system?: SystemSpec; secondOrder?: { equation: string } }): ParamEntry[] {
  const params = scene.system?.params;
  if (!params) return [];
  if (!scene.secondOrder) return paramsInUse(scene.system);
  const mentioned = freeSymbolsSecondOrder(scene.secondOrder.equation);
  return Object.entries(params)
    .filter(([name]) => mentioned === null || mentioned.includes(name))
    .map(([name, value]) => ({ name, value }));
}

/** "k = 0.8, L = 2" (`separator` is the language's list separator); "" for none. */
export function paramsText(entries: readonly ParamEntry[], separator = ", "): string {
  return entries.map((e) => `${e.name} = ${formatParamValue(e.value)}`).join(separator);
}
