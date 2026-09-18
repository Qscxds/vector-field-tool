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
};

export type ParamState = {
  rows: ParamRow[];
  /** Values of rows that went away with their name's last use: restored when the name comes back. */
  memory: Record<string, { text: string; value: number }>;
  nextId: number;
};

export const EMPTY_PARAMS: ParamState = { rows: [], memory: {}, nextId: 1 };

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
  for (const r of gone) if (!r.pending) memory[r.name] = { text: r.text, value: r.value };
  let nextId = state.nextId;
  const kept = state.rows.filter((r) => !gone.includes(r));
  const added: ParamRow[] = missing.map((name) => {
    const remembered = memory[name];
    delete memory[name];
    return remembered
      ? { id: nextId++, name, text: remembered.text, value: remembered.value, origin: "auto", pending: false }
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

/** "k = 0.8, L = 2" (`separator` is the language's list separator); "" for none. */
export function paramsText(entries: readonly ParamEntry[], separator = ", "): string {
  return entries.map((e) => `${e.name} = ${formatParamValue(e.value)}`).join(separator);
}
