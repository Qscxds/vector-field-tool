"use client";

/**
 * Web shell body (shared app component): the same computation core and the same canvas component as the MCP widget, driven by
 * a form instead of by Claude. Independent route; /mcp and /widget are untouched.
 * The interaction model (zoom / pan / hover / click-to-keep) lives in useInteractiveScene.
 */
import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FoldedLine, Info } from "@/components/Info";
import { useInteractiveScene } from "@/components/useInteractiveScene";
import { VectorFieldCanvas } from "@/components/VectorFieldCanvas";
import { TimeSeriesCanvas } from "@/components/TimeSeriesCanvas";
import type { TimeSeriesDrawing } from "@/components/drawTimeSeries";
import { useDocumentLang } from "@/components/useDocumentLang";
import { exportScenePng, exportTimeSeriesPng } from "@/components/exportScenePng";
import { exportFileName, exportFooterText, exportTimeSeriesFooterText } from "@/lib/export-footer";
import { coordinateNamesForMode, type CoordinateNames } from "@/lib/coordinate-names";
import { reportedForms } from "@/lib/core/detect-form";
import { compileSystem, ParseError, X_IN_FIRST_ORDER_MESSAGE, type CompiledSystem } from "@/lib/core/parse";
import { querySolution, type QueryResult } from "@/lib/core/query";
import { reduceSecondOrder, type ReducedSecondOrder } from "@/lib/core/second-order";
import { compileDifferential, toSystem, type FirstOrderSpec } from "@/lib/core/slope-field";
import type { Box, Range, SystemSpec, Vec2 } from "@/lib/core/types";
import { constantSolutionFolded, constantSolutionNotices, curveWords, equalScaleTexts, equilibriaNotices, equilibriumDetail, featuresBoxDetail, fill, formatEigenvalues, formFolded, formatNumber, formatPoint, labels, noConstantSentence, pointText, timeDependentFolded, type LabelTable, type Locale, type PictureMode } from "@/lib/labels";
import { queryNoteText, queryTargetText } from "@/lib/labels-query";
import { groupTrajectories, trajectoryLines } from "@/lib/labels-trajectory";
import { CLICK_TSPAN, fixedStopBox } from "@/lib/interactive";
import { kernelQueryKind, parseQueryValue, queryHitText, queryKindName, queryKindsFor, selectedTrajectoryIndex, trajectoryOptionText, type PanelVariables, type UiQueryKind } from "@/lib/query-panel";
import type { ArrowMode } from "@/lib/render/arrows";
import { fitViewport } from "@/lib/render/viewport";
import type { QueryView, Scene, TrajectoryView } from "@/lib/scene";
import { siteText } from "@/lib/site-text";
import { defaultView, hasTimeSeries, parseTimeRange, seriesCurves, seriesHits, seriesName, seriesOf, timeSeriesBox, type ViewKind } from "@/lib/time-series";
import { initialValueNames, parseInitialValue, type InitialValueReason } from "@/lib/initial-value";
import { isUndoKey } from "@/lib/undo-key";
import { buildShareUrl, encodeState, MAX_ABS_VALUE, type AppBox, type AppMode, type AppState, type UrlProblem, type UrlProblemReason, type ViewChoice } from "@/lib/url-state";
import { PRESETS, presetsByGroup, presetState, type Preset, type PresetMode } from "@/app/vector-field/presets";

export type VectorFieldAppProps = {
  /** Decoded page state (lib/url-state); the first render already shows it, no flash of a default. */
  initial: AppState;
  /** /embed: no title or site links, compact top bar, canvas sized to the container. */
  embed?: boolean;
  /** Whether the form is shown (default true; /embed?controls=0 hides it and keeps the equation text + results). */
  controls?: boolean;
  /** Link parameters that were ignored while decoding; rendered as a bilingual notice above the form. */
  urlProblems?: UrlProblem[];
};

/** Debounce of history.replaceState after a state change (never on hover or pointer moves). */
const URL_SYNC_MS = 500;
/** How long the "Copied" confirmation stays. */
const COPIED_MS = 2000;
/** Wall-clock budget of one solution query (the kernel is checkpointed, never given a clock of its own). */
const QUERY_BUDGET_MS = 2000;

class QueryBudgetError extends Error {}

/** A finished solution query of the panel: what was asked, about which kept trajectory, under which picture. */
type QueryRun = {
  /** The equation, box and snapshot time the query ran under; another picture drops the result. */
  key: string;
  start: Vec2;
  target: { kind: UiQueryKind; value: number };
  result: QueryResult;
  /** The queried trajectory passes through a point where uniqueness fails (its pair carried the flag). */
  nonUnique: boolean;
};

const APP_TO_FORM_MODE: Record<AppMode, PresetMode> = { first: "explicit", diff: "differential", system: "system", second: "second" };
const FORM_TO_APP_MODE: Record<PresetMode, AppMode> = { explicit: "first", differential: "diff", system: "system", second: "second" };

const REASON_LABEL: Record<UrlProblemReason, keyof LabelTable["ui"]> = {
  queryTooLong: "urlReasonQueryTooLong",
  tooLong: "urlReasonTooLong",
  invalidExpression: "urlReasonInvalidExpression",
  notANumber: "urlReasonNotANumber",
  notInteger: "urlReasonNotInteger",
  outOfRange: "urlReasonOutOfRange",
  invertedRange: "urlReasonInvertedRange",
  tooNarrow: "urlReasonTooNarrow",
  badChoice: "urlReasonBadChoice",
  tooMany: "urlReasonTooMany",
  malformedPair: "urlReasonMalformedPair",
  unusedInMode: "urlReasonUnusedInMode",
};

function fromAppState(s: AppState): Form {
  return {
    mode: APP_TO_FORM_MODE[s.mode],
    f: s.f,
    g: s.g,
    M: s.M,
    N: s.N,
    second: s.eq,
    xMin: String(s.box.xMin),
    xMax: String(s.box.xMax),
    yMin: String(s.box.yMin),
    yMax: String(s.box.yMax),
    density: s.density,
    arrowMode: s.arrowMode,
  };
}

/** The entered range as numbers, or null while a field is not a valid range (mid-typing). */
function boxNumbers(form: Form): AppBox | null {
  const nums = [form.xMin, form.xMax, form.yMin, form.yMax].map((s) => Number(s.trim()));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const [xMin, xMax, yMin, yMax] = nums;
  return xMin < xMax && yMin < yMax ? { xMin, xMax, yMin, yMax } : null;
}

/** Whether a patch of the form changes the equation itself (the fixed trajectories then belong to another picture). */
function changesEquation(patch: Partial<Form>): boolean {
  return ["mode", "f", "g", "M", "N", "second"].some((k) => k in patch);
}

type Form = {
  mode: PresetMode;
  f: string;
  g: string;
  M: string;
  N: string;
  /** Second-order equation (mode "second"). */
  second: string;
  xMin: string;
  xMax: string;
  yMin: string;
  yMax: string;
  density: number;
  arrowMode: ArrowMode;
};

type Compiled =
  | { sys: CompiledSystem; spec: SystemSpec; firstOrder: FirstOrderSpec | null; secondOrder: ReducedSecondOrder | null; box: Box; error: null }
  | { sys: null; spec: null; firstOrder: null; secondOrder: null; box: null; error: string };

/** Canvas width before the container is measured (server render) and its clamp; height follows the width. */
const CANVAS_DEFAULT_W = 720;
const CANVAS_MIN_W = 300;
const CANVAS_MAX_W = 900;
const CANVAS_ASPECT = 0.72;

/**
 * Layout, prefixed vf- so a later pass can extend it: two columns (form | picture) when wide,
 * one column below 800 px (form above, picture below). Embed mode drops the page chrome padding.
 */
const VF_STYLE = `
.vf-app { max-width: 1180px; margin: 0 auto; padding: 20px 24px 48px; font-size: 14px; line-height: 1.5; }
.vf-app.vf-embed { max-width: none; padding: 6px 10px 12px; }
.vf-topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; color: #52606d; }
.vf-columns { display: flex; gap: 24px; align-items: flex-start; }
.vf-form { flex: 0 1 320px; min-width: 280px; max-width: 100%; display: grid; gap: 10px; align-content: start; }
/* The column fits its content in both languages: text wraps, controls fill the column, nothing is clipped. */
.vf-form > * { min-width: 0; }
.vf-form label, .vf-form span, .vf-form p { overflow-wrap: anywhere; white-space: normal; }
.vf-form button:not([data-info-toggle]), .vf-form select, .vf-form input:not([type="checkbox"]):not([type="radio"]) { width: 100%; box-sizing: border-box; min-width: 0; text-align: left; }
.vf-form input[type="range"] { margin: 0; }
.vf-canvas { flex: 1 1 0; min-width: 0; }
@media (max-width: 800px) {
  .vf-columns { flex-direction: column; gap: 14px; }
  .vf-form { flex: none; min-width: 0; width: 100%; }
  .vf-canvas { width: 100%; }
  .vf-app [data-preset-select], .vf-app [data-copy-link], .vf-app [data-download-png] { width: 100%; }
}
/* Touch screens: 44 px targets, and 16 px text so iOS does not zoom into a focused field. */
@media (pointer: coarse) {
  .vf-app button, .vf-app select, .vf-app input:not([type="checkbox"]):not([type="radio"]) { min-height: 44px; font-size: 16px; }
  .vf-app input[type="checkbox"], .vf-app input[type="radio"] { width: 22px; height: 22px; }
}
`;


/** Width of the picture column, measured with a ResizeObserver; null until mounted (server render). */
function useMeasuredWidth(): [React.RefObject<HTMLDivElement | null>, number | null] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function canvasSize(containerWidth: number | null): { width: number; height: number } {
  const width = containerWidth === null ? CANVAS_DEFAULT_W : Math.round(Math.min(CANVAS_MAX_W, Math.max(CANVAS_MIN_W, containerWidth)));
  return { width, height: Math.round(width * CANVAS_ASPECT) };
}

/** The equation as one line of text (shown in place of the form when the controls are hidden). */
function equationText(form: Form, L: LabelTable, secondOrder: ReducedSecondOrder | null): string {
  switch (form.mode) {
    case "system":
      return fill(L.ui.equationSystem, { f: form.f, g: form.g });
    case "explicit":
      return fill(L.ui.equationExplicit, { g: form.g });
    case "differential":
      return fill(L.ui.equationDifferential, { M: form.M, N: form.N });
    case "second":
      return fill(L.ui.equationSecond, { equation: secondOrder?.equation ?? form.second });
  }
}

/** A preset as form text; the view options (density, arrows) are kept from the current form. */
function fromPreset(p: Preset, density: number, arrowMode: ArrowMode): Form {
  return { ...fromAppState(presetState(p)), density, arrowMode };
}

/**
 * Student-facing names of the two coordinates for a form mode (lib/coordinate-names): (x, y) for a
 * planar system, (t, y) for a first-order equation, (x, x') for a second-order equation, whose
 * vertical coordinate is the velocity and never a y of its own (round P).
 */
function namesFor(mode: PresetMode): CoordinateNames {
  return coordinateNamesForMode(FORM_TO_APP_MODE[mode]);
}

function parseBox(form: Form, L: LabelTable): Box {
  const nums = [form.xMin, form.xMax, form.yMin, form.yMax].map((s) => Number(s.trim()));
  if (nums.some((n) => !Number.isFinite(n))) throw new RangeError(L.ui.rangeError);
  const [xMin, xMax, yMin, yMax] = nums;
  const { hv, vv } = namesFor(form.mode);
  if (!(xMin < xMax)) throw new RangeError(fill(L.ui.xRangeError, { hv, min: xMin, max: xMax }));
  if (!(yMin < yMax)) throw new RangeError(fill(L.ui.yRangeError, { vv, min: yMin, max: yMax }));
  return { x: { min: xMin, max: xMax }, y: { min: yMin, max: yMax } };
}

/**
 * Readable text for a compile failure. The ParseError codes get the bilingual sentence of the mode
 * the student is in instead of the generic "problem in the expression" wrapper around the kernel's
 * English text: in a planar system a pasted left-hand side is "x' =" / "y' =" and x is a state
 * variable, so the t-instead-of-x sentence is never shown there; the two first-order modes name
 * "dy/dt =" and add the t sentence when the kernel's message carries it (a pasted dy/dx).
 * Second-order mode: every refusal of lib/core/second-order carries a second_order_* code, mapped
 * to its bilingual sentence here (the unknown-symbol one names the symbol); only a generic syntax
 * failure still shows the kernel's English text inside the wrapper, as in the other modes.
 */
function explain(error: unknown, L: LabelTable, mode: PresetMode): string {
  if (error instanceof ParseError) {
    if (mode === "system") {
      if (error.code === "lhs_in_expression") return L.ui.lhsInExpressionSystem;
    } else if (mode === "second") {
      const sentence = error.code ? SECOND_ORDER_SENTENCES[error.code] : undefined;
      if (sentence) return fill(L.ui[sentence], { name: error.symbol ?? "" });
    } else {
      if (error.code === "x_in_first_order") return L.ui.xInFirstOrder;
      if (error.code === "lhs_in_expression") {
        const wroteDx = error.message.includes(X_IN_FIRST_ORDER_MESSAGE);
        return wroteDx ? `${L.ui.lhsInExpression} ${L.ui.xInFirstOrder}` : L.ui.lhsInExpression;
      }
    }
    return fill(L.ui.exprError, { expr: error.expr, message: error.message });
  }
  if (error instanceof RangeError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

/** The bilingual sentence for each second-order refusal code. */
const SECOND_ORDER_SENTENCES: Partial<Record<NonNullable<ParseError["code"]>, keyof LabelTable["ui"]>> = {
  second_order_not_affine: "secondOrderNotAffine",
  second_order_zero_coefficient: "secondOrderZeroCoefficient",
  second_order_no_equation: "secondOrderNoEquation",
  second_order_double_equals: "secondOrderDoubleEquals",
  second_order_too_many_equals: "secondOrderTooManyEquals",
  second_order_other_prime: "secondOrderOtherPrime",
  second_order_higher_derivative: "secondOrderHigherDerivative",
  second_order_placeholder_typed: "secondOrderPlaceholderTyped",
  second_order_undefined_at_samples: "secondOrderUndefinedAtSamples",
  second_order_unknown_symbol: "secondOrderUnknownSymbol",
  second_order_implicit_product: "secondOrderImplicitProduct",
  // The professor's case (round P): y has no meaning in x'' = F(t, x, x').
  second_order_y_symbol: "secondOrderYSymbol",
  // The reduction's own cross-check failed: worded without the reduction's private names (P2.6).
  second_order_internal: "secondOrderInternal",
};

function compile(form: Form, L: LabelTable): Compiled {
  try {
    const box = parseBox(form, L);
    let spec: SystemSpec;
    let firstOrder: FirstOrderSpec | null = null;
    let secondOrder: ReducedSecondOrder | null = null;
    if (form.mode === "system") {
      spec = { f: form.f, g: form.g };
    } else if (form.mode === "second") {
      // The entered box joins the sample points of the reduction's numerical checks.
      secondOrder = reduceSecondOrder(form.second, undefined, { box });
      spec = secondOrder.spec;
    } else {
      firstOrder = form.mode === "explicit" ? { kind: "explicit", g: form.g } : { kind: "differential", M: form.M, N: form.N };
      spec = toSystem(firstOrder);
      // Differential form: compile M and N separately first (as the MCP tool does), so a ParseError's
      // expr and code refer to exactly the field text the student typed rather than to the reduced
      // system's "-(M)".
      if (firstOrder.kind === "differential") compileDifferential(firstOrder);
    }
    const sys = compileSystem(spec);
    return { sys, spec, firstOrder, secondOrder, box, error: null };
  } catch (error) {
    return { sys: null, spec: null, firstOrder: null, secondOrder: null, box: null, error: explain(error, L, form.mode) };
  }
}

/** The preset whose equation and range equal the given state (so a link to a preset shows it selected). */
function matchPresetId(form: Form): string | null {
  const same = PRESETS.find((p) => {
    const f = fromPreset(p, form.density, form.arrowMode);
    if (f.mode !== form.mode || f.xMin !== form.xMin || f.xMax !== form.xMax || f.yMin !== form.yMin || f.yMax !== form.yMax) return false;
    if (form.mode === "system") return f.f === form.f && f.g === form.g;
    if (form.mode === "explicit") return f.g === form.g;
    if (form.mode === "differential") return f.M === form.M && f.N === form.N;
    return f.second === form.second;
  });
  return same ? same.id : null;
}

export function VectorFieldApp({ initial, embed = false, controls = true, urlProblems }: VectorFieldAppProps) {
  // The language actually shown, and the one the link carries: English unless the link says
  // `loc=zh` or the visitor picks Chinese (never navigator.language); null = not chosen, so the
  // link carries no loc and a reader gets English.
  const [locale, setLocale] = useState<Locale>(initial.locale ?? "en");
  const [chosenLocale, setChosenLocale] = useState<Locale | null>(initial.locale);
  const chooseLocale = (next: Locale) => {
    setLocale(next);
    setChosenLocale(next);
  };
  useDocumentLang(locale);
  const L = labels(locale);

  const [form, setForm] = useState<Form>(() => fromAppState(initial));
  const [presetId, setPresetId] = useState<string | null>(() => matchPresetId(fromAppState(initial)));
  // View option, not part of the equation: toggling it keeps the selected preset.
  const [equalScale, setEqualScale] = useState(initial.equalScale);
  // Fixed trajectory starts that came with the link or the preset; traced by the hook on every
  // system change and dropped as soon as the equation is edited (they belong to that equation).
  const [trajectorySeeds, setTrajectorySeeds] = useState<Vec2[]>(initial.trajectoryStarts);
  // Snapshot time of a non-autonomous system (the input is only shown for one); text so the
  // student can type "-" or "1." without the field snapping back. Unparsable -> 0.
  const [snapshotTText, setSnapshotTText] = useState(String(initial.snapshotT));
  const snapshotT = useMemo(() => {
    const v = Number(snapshotTText.trim());
    return snapshotTText.trim() !== "" && Number.isFinite(v) ? v : 0;
  }, [snapshotTText]);
  // Round Q: which picture a planar system / second-order equation shows (null = the default rule,
  // applied below once the scene says whether the equation is autonomous), the t range of the
  // time-series view (text like the range fields; the last valid range stays in force while a
  // field is mid-edit) and whether a second-order equation also draws x'(t).
  const [viewChoice, setViewChoice] = useState<ViewChoice>(initial.view);
  const [timeRangeText, setTimeRangeText] = useState({ min: String(initial.timeRange.min), max: String(initial.timeRange.max) });
  const timeRangeParsed = useMemo(() => parseTimeRange(timeRangeText.min, timeRangeText.max), [timeRangeText]);
  const lastTimeRangeRef = useRef<Range>(initial.timeRange);
  if (timeRangeParsed) lastTimeRangeRef.current = timeRangeParsed;
  const timeRange = lastTimeRangeRef.current;
  const [showVelocity, setShowVelocity] = useState(false);
  const compiled = useMemo(() => compile(form, L), [form, L]);
  // The reduction of a second-order equation travels into the Scene (Scene.secondOrder), so the
  // canvas names its vertical axis x', the PNG footer prints the student's equation and the
  // x' range, and every summary line speaks of (x, x'); memoized so the scene is not rebuilt per render.
  const secondOrderView = useMemo<Scene["secondOrder"]>(
    () => (compiled.secondOrder ? { equation: compiled.secondOrder.equation, reduced: compiled.secondOrder.reduced } : undefined),
    [compiled],
  );

  // Solution query (lib/core/query on the kept trajectory the student picked): the result is kept
  // with the key of the picture it was computed under, so an equation, range or snapshot-time
  // change drops it; the hook drops it when the queried curve is deleted (queryStart).
  const [queryRun, setQueryRun] = useState<QueryRun | null>(null);
  const [queryPick, setQueryPick] = useState<{ start: Vec2; count: number } | null>(null);
  const [queryKind, setQueryKind] = useState<UiQueryKind>("t");
  const [queryValueText, setQueryValueText] = useState("");
  const [queryError, setQueryError] = useState<string | null>(null);
  const queryKey = `${form.mode}|${form.f}|${form.g}|${form.M}|${form.N}|${form.second}|${compiled.box ? JSON.stringify(compiled.box) : ""}|${snapshotT}`;
  const queryView = useMemo<QueryView | undefined>(
    () => (queryRun && queryRun.key === queryKey ? { target: queryRun.target, hits: queryRun.result.hits, note: queryRun.result.note, reached: queryRun.result.reached } : undefined),
    [queryRun, queryKey],
  );

  // The picture fills its column: measured after mount, clamped, height from the width.
  const [canvasWrapRef, wrapWidth] = useMeasuredWidth();
  const { width: canvasW, height: canvasH } = canvasSize(wrapWidth);

  const interactive = useInteractiveScene({
    sys: compiled.sys,
    spec: compiled.spec,
    firstOrder: compiled.firstOrder,
    homeBox: compiled.box,
    width: canvasW,
    height: canvasH,
    density: form.density,
    locale,
    kind: form.mode === "system" || form.mode === "second" ? "analyze_system" : "analyze_first_order",
    fieldStyle: form.mode === "differential" ? "segments" : "arrows",
    systemKey: `${form.mode}|${form.f}|${form.g}|${form.M}|${form.N}|${form.second}`,
    withFeatures: true,
    equalScale,
    snapshotT,
    initialTrajectoryStarts: trajectorySeeds,
    // Another snapshot time re-traces the SAME initial points at that instant (the link keeps its
    // traj); it never resets to the seeds, so a cleared curve does not come back.
    retraceKey: String(snapshotT),
    query: queryView,
    queryStart: queryRun?.start,
    secondOrder: secondOrderView,
  });
  const { scene, viewport, overlay, hint, trajectories, trajectoryStarts, highlight, cursor, addTrajectory, clearTrajectories, undo, canUndo, handlers } = interactive;

  // "Initial value" row: two typed numbers kept exactly like a click (same addTrajectory, same
  // undo entry, same traj encoding). Text state so "-" or "1." can be typed; validated on Add.
  const [initialValue, setInitialValue] = useState({ first: "", second: "" });
  const [initialValueError, setInitialValueError] = useState<{ reason: InitialValueReason; field: "first" | "second" } | null>(null);
  const addInitialValue = () => {
    const r = parseInitialValue(initialValue.first, initialValue.second);
    if (!r.ok) {
      setInitialValueError({ reason: r.reason, field: r.field });
      return;
    }
    setInitialValueError(null);
    addTrajectory(r.point);
  };

  const variables: PanelVariables = form.mode === "system" ? "xy" : form.mode === "second" ? "second" : "ty";
  const queryKinds = queryKindsFor(variables);
  const queryKindShown = queryKinds.includes(queryKind) ? queryKind : queryKinds[0];
  const selectedIndex = selectedTrajectoryIndex(trajectoryStarts, queryPick);
  const selectedStart = selectedIndex === null ? null : trajectoryStarts[selectedIndex];
  const runQuery = () => {
    if (!selectedStart || !compiled.sys || !compiled.box) return;
    const parsed = parseQueryValue(queryValueText);
    if (!parsed.ok) {
      setQueryError(fill(L.ui[INITIAL_VALUE_ERROR[parsed.reason]], { name: queryKindName(variables, queryKindShown), max: String(MAX_ABS_VALUE) }));
      return;
    }
    // The SAME rule as the curve on screen: 20x the entered range, CLICK_TSPAN per direction,
    // from the displayed snapshot time; the student's kind mapped to the kernel's.
    const deadline = Date.now() + QUERY_BUDGET_MS;
    const checkpoint = () => {
      if (Date.now() > deadline) throw new QueryBudgetError();
    };
    const i = selectedIndex ?? 0;
    const nonUnique = trajectories.slice(2 * i, 2 * i + 2).some((t) => t.nonUnique);
    try {
      const target = { kind: kernelQueryKind(variables, queryKindShown), value: parsed.value };
      const result = querySolution(compiled.sys, selectedStart, target, { tSpan: CLICK_TSPAN, stopBox: fixedStopBox(compiled.box), t0: snapshotT, checkpoint });
      setQueryError(null);
      setQueryRun({ key: queryKey, start: selectedStart, target: { kind: queryKindShown, value: parsed.value }, result, nonUnique });
    } catch (error) {
      setQueryError(error instanceof QueryBudgetError ? L.ui.queryTooLong : error instanceof Error ? error.message : String(error));
    }
  };
  const queryOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    runQuery();
  };
  // The result shown: computed under this picture and about a curve that is still kept.
  const queryShown = queryView && queryRun && trajectoryStarts.some((p) => p.x === queryRun.start.x && p.y === queryRun.start.y) ? queryRun : null;

  const { hv, vv } = namesFor(form.mode);
  const second = form.mode === "second";
  // Words that depend on what the picture is (P2.4 / P2.5): solution curves and slopes dy/dt on a
  // first-order picture, trajectories and directions on a phase plane.
  const picture: PictureMode = second ? "second" : form.mode === "system" ? "system" : "first";
  const groups = useMemo(() => groupTrajectories(trajectories), [trajectories]);
  const lastGroup = groups.length ? groups[groups.length - 1] : null;

  // Round Q: the time-series view (lib/time-series). Offered on planar pictures only; opens on the
  // phase plane for an autonomous equation and on the time series for a non-autonomous one unless
  // the link or the student chose. Its box: the chosen t range across, the entered range of the
  // drawn components up; never equal-scale. The curves are the kept ones (same store, same
  // Clear / Undo / link), drawn against the kernel's clock; a query's hits are marked at (t, value).
  const timeSeriesAvailable = hasTimeSeries(picture);
  const view: ViewKind = timeSeriesAvailable ? (viewChoice ?? defaultView(picture, Boolean(scene?.timeDependent))) : "phase";
  const series = useMemo(() => seriesOf(picture, showVelocity), [picture, showVelocity]);
  const timeSeriesViewport = useMemo(
    () => (compiled.box ? fitViewport(timeSeriesBox(compiled.box, series, timeRange), canvasW, canvasH, { equalScale: false }) : null),
    [compiled.box, series, timeRange, canvasW, canvasH],
  );
  const timeSeriesDrawing = useMemo<TimeSeriesDrawing>(
    () => ({
      curves: groups.map((g) => seriesCurves(g, series)),
      legend: series.map((key) => ({ key, name: seriesName(picture, key) })),
      ...(queryShown ? { hits: seriesHits(queryShown.result.hits, series) } : {}),
      t0: snapshotT,
    }),
    [groups, series, picture, queryShown, snapshotT],
  );
  // "x, x'" / "x" / "x, y": the drawn components, for the shown-range line and the PNG footer.
  const seriesNames = series.map((key) => (key === "x" ? "x" : vv)).join(", ");

  // Ctrl+Z / Cmd+Z undoes the last trajectory action, unless the student is typing in a field.
  const undoRef = useRef(undo);
  undoRef.current = undo;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isUndoKey(event)) return;
      event.preventDefault();
      undoRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const update = (patch: Partial<Form>) => {
    setPresetId(null);
    if (changesEquation(patch)) setTrajectorySeeds([]);
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const loadPreset = (p: Preset) => {
    setForm(fromPreset(p, form.density, form.arrowMode));
    setTrajectorySeeds((p.starts ?? []).map((q) => ({ x: q.x, y: q.y })));
    setPresetId(p.id);
  };

  // The page state as the link encodes it: the ENTERED range (never the zoomed viewport), the
  // last valid range while a range field is mid-edit, and the kept trajectories' starts.
  const lastBoxRef = useRef<AppBox>(initial.box);
  const boxNow = boxNumbers(form);
  if (boxNow) lastBoxRef.current = boxNow;
  const appState = useMemo<AppState>(
    () => ({
      mode: FORM_TO_APP_MODE[form.mode],
      g: form.g,
      f: form.f,
      M: form.M,
      N: form.N,
      eq: form.second,
      box: boxNow ?? lastBoxRef.current,
      locale: chosenLocale,
      equalScale,
      density: form.density,
      arrowMode: form.arrowMode,
      snapshotT,
      trajectoryStarts,
      view: viewChoice,
      timeRange,
    }),
    [form, boxNow, chosenLocale, equalScale, snapshotT, trajectoryStarts, viewChoice, timeRange],
  );

  // Keep the address bar in sync (full page only; an embed's URL belongs to the embedding page):
  // debounced, only for a state that compiles (the link must always open to a valid picture), and
  // not on mount, so a hand-written link is not rewritten under the visitor before they change anything.
  const query = compiled.error ? null : encodeState(appState);
  const mountedQueryRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (mountedQueryRef.current === undefined) {
      mountedQueryRef.current = query;
      return;
    }
    if (embed || query === null) return;
    const id = setTimeout(() => {
      if (window.location.search.replace(/^\?/, "") === query) return;
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }, URL_SYNC_MS);
    return () => clearTimeout(id);
  }, [query, embed]);

  const [copied, setCopied] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  // PNG export: the picture on screen (same drawScene) at 2x with a one-line footer, saved through
  // a temporary link whose object URL is revoked once the click has been dispatched.
  const [downloadFailed, setDownloadFailed] = useState(false);
  const downloadPng = useCallback(async () => {
    if (!scene || !viewport) return;
    setDownloadFailed(false);
    try {
      // The entered box as the 5th argument: after a zoom or pan the footer prints both the
      // entered range and the shown one (lib/export-footer). The time-series view exports its own
      // picture (the same drawTimeSeries as the screen) with the t range and the drawn components.
      const blob =
        view === "time" && timeSeriesViewport
          ? await exportTimeSeriesPng({
              viewport: timeSeriesViewport,
              drawing: timeSeriesDrawing,
              footer: exportTimeSeriesFooterText(scene, timeSeriesViewport.box, seriesNames, locale, window.location.origin),
              scale: 2,
            })
          : await exportScenePng({ scene, viewport, arrowMode: form.arrowMode, footer: exportFooterText(scene, viewport, locale, window.location.origin, compiled.box ?? undefined), scale: 2 });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exportFileName(presetId ?? form.mode, new Date());
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setDownloadFailed(true);
    }
  }, [scene, viewport, locale, form.arrowMode, form.mode, presetId, compiled.box, view, timeSeriesViewport, timeSeriesDrawing, seriesNames]);
  const fallbackInputRef = useRef<HTMLInputElement | null>(null);
  const copyLink = useCallback(async () => {
    const url = buildShareUrl(window.location.origin, "/vector-field", appState);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setFallbackUrl(null);
      setCopied(true);
    } catch {
      setFallbackUrl(url);
    }
  }, [appState]);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(id);
  }, [copied]);
  useEffect(() => {
    if (fallbackUrl) fallbackInputRef.current?.select();
  }, [fallbackUrl]);
  // Embed top bar: the full page with the same state (the last state that compiled).
  const lastQueryRef = useRef(query ?? "");
  if (query !== null) lastQueryRef.current = query;
  const fullPageHref = `/vector-field${lastQueryRef.current ? `?${lastQueryRef.current}` : ""}`;

  const preset = presetId ? PRESETS.find((p) => p.id === presetId) : undefined;
  const ivNames = initialValueNames(second ? "second" : hv === "t" ? "ty" : "xy");
  const words = curveWords(L, picture);
  const scale = equalScaleTexts(L, picture);
  const addOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    addInitialValue();
  };

  const languageSelect = (
    <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#52606d" }}>
      <span>{L.ui.language}</span>
      <select value={locale} onChange={(e) => chooseLocale(e.target.value as Locale)} style={inputStyle} name="locale">
        <option value="zh">{siteText(locale).site.langZh}</option>
        <option value="en">{siteText(locale).site.langEn}</option>
      </select>
    </label>
  );

  return (
    <main className={embed ? "vf-app vf-embed" : "vf-app"} data-embed={embed ? "true" : undefined}>
      <style>{VF_STYLE}</style>
      {embed ? (
        <div className="vf-topbar">
          {languageSelect}
          <a href={fullPageHref} target="_blank" rel="noopener noreferrer" data-open-full-page>
            {L.ui.openFullPage}
          </a>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>{L.ui.title}</h1>
            {languageSelect}
          </div>
          <p style={{ margin: "0 0 16px", color: "#52606d" }} data-tagline>
            {L.ui.tagline}{" "}
            <Link href={`/help?loc=${locale}`} data-help-link>
              {L.ui.help}
            </Link>
          </p>
        </>
      )}

      {controls ? (
        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 4, marginBottom: 14 }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", color: "#52606d" }}>
            <span>{L.ui.presets}</span>
            <select
              value={presetId ?? ""}
              onChange={(e) => {
                const p = PRESETS.find((x) => x.id === e.target.value);
                if (p) loadPreset(p);
              }}
              style={{ ...inputStyle, maxWidth: "100%" }}
              name="preset"
              data-preset-select
            >
              <option value="">{L.ui.presetCustom}</option>
              {presetsByGroup().map(({ group, presets }) => (
                <optgroup key={group.id} label={group.name[locale]}>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name[locale]}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          {preset ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#52606d", flexWrap: "wrap", minWidth: 0 }} data-preset-note>
              <span style={{ flex: "1 1 0", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={preset.note[locale]}>
                {preset.note[locale]}
              </span>
              <Info label={L.ui.details} data-info="preset-note">
                {preset.note[locale]}
              </Info>
            </div>
          ) : null}
        </section>
      ) : null}

      {urlProblems && urlProblems.length > 0 ? (
        <p role="alert" data-url-problems style={{ padding: "8px 12px", margin: "0 0 14px", background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a", borderRadius: 6 }}>
          {/* A link too long as a whole has no parameter to name: its own sentence, not "query (...)". */}
          {urlProblems.some((p) => p.reason === "queryTooLong")
            ? L.ui.urlQueryTooLong
            : fill(L.ui.urlProblems, {
                list: urlProblems.map((p) => `${p.param}${L.tool.parenOpen}${L.ui[REASON_LABEL[p.reason]]}${L.tool.parenClose}`).join(L.tool.listSeparator),
              })}
        </p>
      ) : null}

      <div className="vf-columns">
        {!controls ? (
          <div className="vf-form" data-equation-text>
            <p style={{ margin: 0, color: "#1f2933", fontWeight: 600 }}>{equationText(form, L, compiled.secondOrder)}</p>
            {compiled.secondOrder ? (
              <p style={{ margin: 0, color: "#1f2933" }} data-second-order-reduced>
                {fill(L.ui.secondOrderReduced, { g: compiled.secondOrder.reduced.g })}
              </p>
            ) : null}
            {preset ? <p style={{ margin: 0, color: "#52606d" }}>{preset.note[locale]}</p> : null}
          </div>
        ) : (
        <form className="vf-form" onSubmit={(e) => e.preventDefault()}>
          <label style={labelStyle}>
            <span>{L.ui.type}</span>
            <select value={form.mode} onChange={(e) => update({ mode: e.target.value as PresetMode })} style={inputStyle} name="mode">
              <option value="system">{L.ui.typeSystem}</option>
              <option value="explicit">{L.ui.typeExplicit}</option>
              <option value="differential">{L.ui.typeDifferential}</option>
              <option value="second">{L.ui.typeSecond}</option>
            </select>
          </label>
          {form.mode === "system" ? (
            <label style={labelStyle}>
              <span>{L.ui.fLabel}</span>
              <input value={form.f} onChange={(e) => update({ f: e.target.value })} style={inputStyle} spellCheck={false} name="f" />
            </label>
          ) : null}
          {form.mode === "second" ? (
            <label style={labelStyle}>
              <span>{L.ui.secondOrderLabel}</span>
              <input value={form.second} onChange={(e) => update({ second: e.target.value })} style={inputStyle} spellCheck={false} name="second" />
            </label>
          ) : form.mode !== "differential" ? (
            <label style={labelStyle}>
              <span>{form.mode === "system" ? L.ui.gLabel : L.ui.gExplicitLabel}</span>
              <input value={form.g} onChange={(e) => update({ g: e.target.value })} style={inputStyle} spellCheck={false} name="g" />
            </label>
          ) : (
            <>
              <label style={labelStyle}>
                <span>{L.ui.mLabel}</span>
                <input value={form.M} onChange={(e) => update({ M: e.target.value })} style={inputStyle} spellCheck={false} name="M" />
              </label>
              <label style={labelStyle}>
                <span>{L.ui.nLabel}</span>
                <input value={form.N} onChange={(e) => update({ N: e.target.value })} style={inputStyle} spellCheck={false} name="N" />
              </label>
            </>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={labelStyle}>
              <span>{hv === "x" ? L.ui.xMin : L.ui.tMin}</span>
              <input value={form.xMin} onChange={(e) => update({ xMin: e.target.value })} style={inputStyle} name="xMin" />
            </label>
            <label style={labelStyle}>
              <span>{hv === "x" ? L.ui.xMax : L.ui.tMax}</span>
              <input value={form.xMax} onChange={(e) => update({ xMax: e.target.value })} style={inputStyle} name="xMax" />
            </label>
            <label style={labelStyle}>
              <span>{second ? L.ui.xpMin : L.ui.yMin}</span>
              <input value={form.yMin} onChange={(e) => update({ yMin: e.target.value })} style={inputStyle} name="yMin" />
            </label>
            <label style={labelStyle}>
              <span>{second ? L.ui.xpMax : L.ui.yMax}</span>
              <input value={form.yMax} onChange={(e) => update({ yMax: e.target.value })} style={inputStyle} name="yMax" />
            </label>
          </div>
          {/* Round Q: which picture (planar modes only). The time-series view has its own t range and,
              on a second-order equation, the x'(t) overlay; curves are added under Initial value. */}
          {timeSeriesAvailable ? (
            <div style={{ display: "grid", gap: 6, color: "#1f2933" }} data-view-toggle>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }} role="radiogroup" aria-label={L.ui.view}>
                <span style={{ color: "#52606d" }}>{L.ui.view}</span>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input type="radio" name="view" value="phase" checked={view === "phase"} onChange={() => setViewChoice("phase")} />
                  <span>{L.ui.viewPhase}</span>
                </label>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input type="radio" name="view" value="time" checked={view === "time"} onChange={() => setViewChoice("time")} />
                  <span>{L.ui.viewTime}</span>
                </label>
              </div>
              {view === "time" ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <label style={labelStyle}>
                      <span>{L.ui.timeFrom}</span>
                      <input value={timeRangeText.min} onChange={(e) => setTimeRangeText((prev) => ({ ...prev, min: e.target.value }))} style={inputStyle} name="tMin" inputMode="decimal" />
                    </label>
                    <label style={labelStyle}>
                      <span>{L.ui.timeTo}</span>
                      <input value={timeRangeText.max} onChange={(e) => setTimeRangeText((prev) => ({ ...prev, max: e.target.value }))} style={inputStyle} name="tMax" inputMode="decimal" />
                    </label>
                  </div>
                  {!timeRangeParsed ? (
                    <p role="alert" style={{ margin: 0, color: "#991b1b", fontSize: 13 }} data-time-range-error>
                      {L.ui.timeRangeError}
                    </p>
                  ) : null}
                  {second ? (
                    <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <input type="checkbox" checked={showVelocity} onChange={(e) => setShowVelocity(e.target.checked)} name="showVelocity" />
                      <span>{L.ui.showVelocity}</span>
                    </label>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
          {scene?.timeDependent ? (
            <label style={labelStyle}>
              {/* A second-order equation calls it t₀: the initial values x(t₀), x'(t₀) are given at this instant. */}
              <span>{second ? L.ui.snapshotTSecond : L.ui.snapshotT}</span>
              <input value={snapshotTText} onChange={(e) => setSnapshotTText(e.target.value)} style={inputStyle} name="snapshotT" inputMode="decimal" />
            </label>
          ) : null}
          <label style={labelStyle}>
            <span>
              {L.ui.density}: {form.density} × {form.density}
            </span>
            <input type="range" min={5} max={40} value={form.density} onChange={(e) => setForm((prev) => ({ ...prev, density: Number(e.target.value) }))} name="density" />
          </label>
          <label style={labelStyle}>
            <span>{L.ui.arrowLength}</span>
            <select value={form.arrowMode} onChange={(e) => setForm((prev) => ({ ...prev, arrowMode: e.target.value as ArrowMode }))} style={inputStyle} name="arrowMode">
              <option value="unit">{L.ui.arrowUnit}</option>
              <option value="scaled">{L.ui.arrowScaled}</option>
            </select>
          </label>
          <div style={{ color: "#1f2933" }}>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              {/* Off and disabled in the time-series view (t and a value have different units); the phase plane keeps its setting. */}
              <input type="checkbox" checked={view === "time" ? false : equalScale} disabled={view === "time"} onChange={(e) => setEqualScale(e.target.checked)} name="equalScale" />
              <span>{L.ui.equalScale}</span>
            </label>{" "}
            <Info label={L.ui.details} data-info="equal-scale">
              {scale.detail}
            </Info>
          </div>
          {/* Initial value: (t0, y0) on a first-order picture, (x0, y0) on a planar one; Enter in either field adds too. */}
          <fieldset style={{ display: "grid", gap: 6, margin: 0, padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 6, color: "#1f2933" }} data-initial-value>
            {/* A second-order equation names its initial values x(t₀), x'(t₀); when no t₀ field is shown (autonomous) the legend says t₀ = 0. */}
            <legend style={{ padding: "0 4px" }}>{second && !scene?.timeDependent ? L.ui.initialValueSecondAutonomous : L.ui.initialValue}</legend>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end" }}>
              <label style={labelStyle}>
                <span>{ivNames.first}</span>
                <input value={initialValue.first} onChange={(e) => setInitialValue((prev) => ({ ...prev, first: e.target.value }))} onKeyDown={addOnEnter} style={inputStyle} inputMode="decimal" name="initialFirst" />
              </label>
              <label style={labelStyle}>
                <span>{ivNames.second}</span>
                <input value={initialValue.second} onChange={(e) => setInitialValue((prev) => ({ ...prev, second: e.target.value }))} onKeyDown={addOnEnter} style={inputStyle} inputMode="decimal" name="initialSecond" />
              </label>
              <button type="button" onClick={addInitialValue} style={buttonStyle} disabled={compiled.error !== null} data-add-solution>
                {words.add}
              </button>
            </div>
            {initialValueError ? (
              <p role="alert" style={{ margin: 0, color: "#991b1b", fontSize: 13 }} data-initial-value-error>
                {fill(L.ui[INITIAL_VALUE_ERROR[initialValueError.reason]], { name: ivNames[initialValueError.field], max: String(MAX_ABS_VALUE) })}
              </p>
            ) : null}
          </fieldset>
          {/* Solution query: a kept trajectory, a constraint (t / x / y = value), the kernel's answer with markers. */}
          <fieldset style={{ display: "grid", gap: 6, margin: 0, padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 6, color: "#1f2933" }} data-query-panel>
            <legend style={{ padding: "0 4px" }}>{L.ui.querySolution}</legend>
            <label style={labelStyle}>
              <span>{fill(words.query, { names: `${ivNames.first}, ${ivNames.second}` })}</span>
              <select
                value={selectedIndex ?? ""}
                onChange={(e) => {
                  const p = trajectoryStarts[Number(e.target.value)];
                  if (p) setQueryPick({ start: p, count: trajectoryStarts.length });
                }}
                style={inputStyle}
                name="queryTrajectory"
                disabled={trajectoryStarts.length === 0}
                data-query-trajectory
              >
                {trajectoryStarts.length === 0 ? <option value="">{words.none}</option> : null}
                {trajectoryStarts.map((p, i) => (
                  <option key={i} value={i}>
                    {trajectoryOptionText(p)}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8, alignItems: "end" }}>
              <label style={labelStyle}>
                <span>{L.ui.queryCondition}</span>
                <select value={queryKindShown} onChange={(e) => setQueryKind(e.target.value as UiQueryKind)} style={inputStyle} name="queryKind" data-query-kind>
                  {queryKinds.map((k) => (
                    <option key={k} value={k}>
                      {queryKindName(variables, k)} =
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                <span>{queryKindName(variables, queryKindShown)}</span>
                <input value={queryValueText} onChange={(e) => setQueryValueText(e.target.value)} onKeyDown={queryOnEnter} style={inputStyle} inputMode="decimal" name="queryValue" data-query-value />
              </label>
              <button type="button" onClick={runQuery} style={buttonStyle} disabled={compiled.error !== null || selectedStart === null} data-query-run>
                {L.ui.queryRun}
              </button>
            </div>
            {queryError ? (
              <p role="alert" style={{ margin: 0, color: "#991b1b", fontSize: 13 }} data-query-error>
                {queryError}
              </p>
            ) : null}
          </fieldset>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={clearTrajectories} style={{ ...buttonStyle, flex: "1 1 auto" }} disabled={trajectories.length === 0}>
              {fill(words.clear, { count: trajectories.length / 2 })}
            </button>
            <button type="button" onClick={undo} style={buttonStyle} disabled={!canUndo} data-undo title="Ctrl+Z">
              {L.ui.undo}
            </button>
          </div>
          <button type="button" onClick={copyLink} style={buttonStyle} disabled={compiled.error !== null} data-copy-link aria-live="polite">
            {copied ? L.ui.copied : L.ui.copyLink}
          </button>
          <button type="button" onClick={downloadPng} style={buttonStyle} disabled={!scene || !viewport} data-download-png>
            {L.ui.downloadPng}
          </button>
          {downloadFailed ? (
            <p role="alert" style={{ margin: 0, color: "#991b1b" }} data-download-failed>
              {L.ui.downloadFailed}
            </p>
          ) : null}
          {fallbackUrl ? (
            <label style={labelStyle}>
              <span>{L.ui.copyLinkFallback}</span>
              <input ref={fallbackInputRef} readOnly value={fallbackUrl} onFocus={(e) => e.currentTarget.select()} style={inputStyle} name="shareUrl" />
            </label>
          ) : null}
          {compiled.secondOrder ? (
            <p style={{ margin: 0, color: "#1f2933" }} data-second-order-reduced>
              {fill(L.ui.secondOrderReduced, { g: compiled.secondOrder.reduced.g })}
            </p>
          ) : null}
        </form>
        )}

        <div className="vf-canvas" ref={canvasWrapRef}>
          {compiled.error ? (
            <div role="alert" style={{ padding: "10px 12px", marginBottom: 10, background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: 6 }}>
              {compiled.error}
              {/* The syntax rules of the current mode are shown only here, when an expression failed to parse. */}
              <p style={{ margin: "8px 0 0", color: "#7f1d1d", fontSize: 12 }} data-syntax-hint>
                {form.mode === "system" ? L.ui.syntaxHint : form.mode === "second" ? L.ui.syntaxHintSecondOrder : L.ui.syntaxHintFirstOrder}
              </p>
            </div>
          ) : null}
          {scene && viewport ? (
            <>
              {view === "time" && timeSeriesViewport ? (
                <TimeSeriesCanvas viewport={timeSeriesViewport} drawing={timeSeriesDrawing} />
              ) : (
                <VectorFieldCanvas
                  scene={scene}
                  viewport={viewport}
                  width={canvasW}
                  height={canvasH}
                  arrowMode={form.arrowMode}
                  overlay={overlay}
                  overlayHint={hint}
                  highlight={highlight}
                  cursor={cursor}
                  {...handlers}
                />
              )}
              {/* Persistent notes (never timed toasts): in the time-series view equal scale has no meaning
                  and is off; on a phase plane drawn without it the picture's angles are not slopes. */}
              {view === "time" ? (
                <p role="status" data-time-series-note style={{ margin: "6px 0 0", color: "#52606d" }}>
                  {L.ui.timeSeriesScaleNote}
                </p>
              ) : !equalScale ? (
                <p role="status" data-scale-warning style={{ margin: "6px 0 0", color: "#92400e" }}>
                  {scale.warning}
                </p>
              ) : null}
              {view === "time" && trajectories.length === 0 ? (
                <p role="status" data-time-series-empty style={{ margin: "6px 0 0", color: "#92400e" }}>
                  {L.ui.timeSeriesEmpty}
                </p>
              ) : null}
              {/* The curves end at t₀ ± CLICK_TSPAN (the phase plane's rule, unchanged): a wider t range shows blank, said so. */}
              {view === "time" && (timeRange.min < snapshotT - CLICK_TSPAN || timeRange.max > snapshotT + CLICK_TSPAN) ? (
                <p role="status" data-time-series-span style={{ margin: "6px 0 0", color: "#92400e" }}>
                  {fill(L.ui.timeSeriesSpanNote, { from: formatNumber(snapshotT - CLICK_TSPAN, 4), to: formatNumber(snapshotT + CLICK_TSPAN, 4), span: CLICK_TSPAN })}
                </p>
              ) : null}
              {/* The hover preview passes through a point where uniqueness fails (kept curves say it in the last-trajectory line). */}
              {view === "phase" && overlay.some((t) => t.nonUnique) ? (
                <p role="status" data-non-unique-preview style={{ margin: "6px 0 0", color: "#92400e" }}>
                  {L.ui.nonUniqueTrajectory}
                </p>
              ) : null}
              <p style={{ margin: "6px 0 0", color: "#52606d", fontSize: 12 }} data-shown-range>
                {view === "time" && timeSeriesViewport
                  ? fill(L.ui.shownTimeRange, {
                      tMin: formatNumber(timeSeriesViewport.box.x.min, 3),
                      tMax: formatNumber(timeSeriesViewport.box.x.max, 3),
                      names: seriesNames,
                      vMin: formatNumber(timeSeriesViewport.box.y.min, 3),
                      vMax: formatNumber(timeSeriesViewport.box.y.max, 3),
                    })
                  : fill(equalScale ? L.ui.shownRangeEqual : L.ui.shownRangeFilled, {
                      hv,
                      vv,
                      xMin: formatNumber(viewport.box.x.min, 3),
                      xMax: formatNumber(viewport.box.x.max, 3),
                      yMin: formatNumber(viewport.box.y.min, 3),
                      yMax: formatNumber(viewport.box.y.max, 3),
                    })}
              </p>
            </>
          ) : (
            <div style={{ width: canvasW, height: canvasH, border: "1px dashed #d1d5db", borderRadius: 6, display: "grid", placeItems: "center", color: "#6b7280" }}>
              {L.ui.fixErrorHint}
            </div>
          )}
          {scene?.field && scene.field.singularCount > 0 ? (
            <p style={{ margin: "8px 0 0", color: "#92400e" }}>{fill(L.ui.singularNote, { count: scene.field.singularCount })}</p>
          ) : null}

          {/* Non-autonomous: no features are computed for any range, so the features-box line and the
              equilibria list give way to the snapshot note. */}
          {scene?.timeDependent ? (
            <p role="status" data-time-dependent style={{ margin: "12px 0 0", color: "#92400e" }}>
              <FoldedLine {...timeDependentFolded(L, scene.timeDependent.snapshotT, second)} label={L.ui.details} data-info="time-dependent" />
            </p>
          ) : null}
          {scene?.box && !scene.timeDependent ? (
            <p style={{ margin: "12px 0 0", color: "#52606d", fontSize: 12 }} data-features-box>
              {fill(L.ui.featuresBox, {
                hv,
                vv,
                xMin: formatNumber((scene.featuresBox ?? scene.box).x.min, 3),
                xMax: formatNumber((scene.featuresBox ?? scene.box).x.max, 3),
                yMin: formatNumber((scene.featuresBox ?? scene.box).y.min, 3),
                yMax: formatNumber((scene.featuresBox ?? scene.box).y.max, 3),
              })}{" "}
              <Info label={L.ui.details} data-info="features-box">
                {featuresBoxDetail(L, picture)}
              </Info>
            </p>
          ) : null}
          {scene?.kind === "analyze_system" && !scene.timeDependent ? <EquilibriaList scene={scene} L={L} second={second} /> : null}
          {scene?.kind === "analyze_first_order" ? <FirstOrderList scene={scene} L={L} /> : null}
          {scene && lastGroup ? (
            <p style={{ margin: "8px 0 0", color: "#52606d" }} data-last-trajectory>
              {words.last} {trajectoryLines(scene, lastGroup, L).join("; ")}
            </p>
          ) : null}
          {scene && queryShown && queryView ? <QueryResultView scene={scene} run={queryShown} view={queryView} variables={variables} L={L} /> : null}
        </div>
      </div>
    </main>
  );
}

/**
 * The query panel's answer: the header (start and target), one line per hit rounded to its error
 * estimate, the kernel's note (not reached / stopped before the target / possibly more crossings /
 * the start itself), where each direction of the numerical solution got to and why it stopped
 * (the shared mode-aware wording, far-box and non-autonomous aware, with the non-unique sentence
 * when the curve carries it), and the accuracy sentence: crossings of the NUMERICAL solution.
 */
function QueryResultView({ scene, run, view, variables, L }: { scene: Scene; run: QueryRun; view: QueryView; variables: PanelVariables; L: LabelTable }) {
  const legs: TrajectoryView[] = [run.result.forward, run.result.backward].map((leg, i) => ({
    direction: i === 0 ? "forward" : "backward",
    points: leg.points,
    status: leg.status,
    steps: leg.steps,
    tEnd: leg.tEnd,
    stop: "far",
    ...(run.nonUnique ? { nonUnique: true } : {}),
  }));
  // A differential form has no direction: its "periodic" note speaks of a side of the start.
  const note = queryNoteText(view.note, L, scene.fieldStyle === "segments");
  // A second-order picture names its coordinates: the start is (x, x') = (…) and a target on the
  // vertical coordinate reads x' = … (the kernel's y is the velocity).
  const second = variables === "second";
  return (
    <section style={{ marginTop: 14 }} data-query-result data-query-note={view.note}>
      <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>{L.ui.querySolution}</h2>
      {/* On a non-autonomous picture the curve starts at the snapshot time: said, so the absolute t of every hit has its origin. */}
      <p style={{ margin: "0 0 6px" }}>
        {scene.timeDependent
          ? fill(L.ui.queryHeaderAt, { start: pointText(L, run.start, second), t0: formatNumber(scene.timeDependent.snapshotT, 4), target: queryTargetText(view, L, second) })
          : fill(L.ui.queryHeader, { start: pointText(L, run.start, second), target: queryTargetText(view, L, second) })}
      </p>
      {view.hits.length ? (
        <ul style={{ margin: "0 0 6px", paddingLeft: 20 }}>
          {view.hits.map((hit, i) => (
            <li key={i} data-query-hit>
              {queryHitText(hit, variables, L)}
            </li>
          ))}
        </ul>
      ) : null}
      {note ? (
        <p style={{ margin: "0 0 6px", color: "#92400e" }} data-query-note-text>
          {note}
        </p>
      ) : null}
      <p style={{ margin: "0 0 6px", color: "#52606d" }} data-query-legs>
        {trajectoryLines(scene, legs, L).join("; ")}
      </p>
      <p style={{ margin: 0, color: "#52606d", fontSize: 12 }} data-query-accuracy>
        {L.tool.queryAccuracy}
      </p>
    </section>
  );
}

/** The equilibria of a planar picture; on a second-order one (`second`) every point reads (x, x') = (…). */
function EquilibriaList({ scene, L, second }: { scene: Scene; L: LabelTable; second: boolean }) {
  const eq = scene.equilibria ?? [];
  return (
    <section style={{ marginTop: 14 }}>
      <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>{L.ui.equilibriaHeading}</h2>
      {/* P2.3: on a second-order equation the point (c, 0) of the phase plane is the constant solution x ≡ c. */}
      {second && eq.length > 0 ? (
        <p style={{ margin: "0 0 6px", color: "#52606d" }} data-equilibria-second-note>
          {L.tool.equilibriaSecondNote}
        </p>
      ) : null}
      {equilibriaNotices(L, scene).map((line) => (
        <p key={line} style={{ margin: "0 0 6px", color: "#92400e" }}>
          {line}
        </p>
      ))}
      <ol style={{ margin: 0, paddingLeft: 20 }}>
        {eq.map((p, i) => (
          <li key={i} style={{ marginBottom: 6 }} data-caveat={p.caveat ?? undefined} data-uniqueness={p.uniqueness?.verdict}>
            {/* The caveat and the uniqueness sentence are folded (display only; the Scene keeps them). */}
            <FoldedLine
              short={
                <>
                  <strong>{pointText(L, p.at, second)}</strong> {L.classification[p.classification]}
                </>
              }
              detail={equilibriumDetail(L, p, second)}
              label={L.ui.details}
              data-info="equilibrium"
            >
              <span style={{ color: "#52606d" }}>
                {" "}
                λ = {formatEigenvalues(p.eigenvalues) || L.tool.eigenvaluesUnavailable} · tr = {formatNumber(p.trace, 5)}, det = {formatNumber(p.determinant, 5)}
              </span>
            </FoldedLine>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FirstOrderList({ scene, L }: { scene: Scene; L: LabelTable }) {
  const fo = scene.firstOrder;
  if (!fo) return null;
  return (
    <section style={{ marginTop: 14, display: "grid", gap: 10 }}>
      <div>
        <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>{L.ui.constantSolutionsHeading}</h2>
        {fo.solutions.length === 0 ? (
          <p style={{ margin: 0 }}>{noConstantSentence(L, fo.autonomous, fo.untestableReason, fo.identicallyZero)}</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {fo.solutions.map((s) => (
              // The canvas tag on the line; the full stability sentence, the plateau / probe notes and
              // the uniqueness sentence behind the toggle (display only; the Scene keeps them).
              <li key={s.y} data-domain-edge={s.domainEdge} data-uniqueness={s.uniqueness?.verdict}>
                <FoldedLine {...constantSolutionFolded(L, s, fo.spec)} label={L.ui.details} data-info="constant-solution" />
              </li>
            ))}
          </ul>
        )}
        {/* A differential form has no direction: say once how "approach" / "leave" were read (P2.3). */}
        {fo.spec?.kind === "differential" && fo.solutions.length > 0 ? (
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#555" }} data-stability-reading-diff>{L.tool.stabilityReadingDiff}</p>
        ) : null}
        {constantSolutionNotices(L, fo).map((note) => (
          <p key={note} style={{ margin: "6px 0 0", fontSize: 13, color: "#555" }} data-constant-notice>{note}</p>
        ))}
      </div>
      {fo.singularities?.length ? (
        <div>
          <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>{L.ui.singularHeading}</h2>
          <p style={{ margin: 0 }}>{fo.singularities.map((p) => formatPoint(p)).join(L.tool.listSeparator)}</p>
          {fo.singularitiesWarning === "possible_continuum" ? <p style={{ margin: "6px 0 0", color: "#92400e" }} data-singularities-continuum>{L.ui.singularitiesContinuum}</p> : null}
          {fo.singularitiesTruncated ? <p style={{ margin: "6px 0 0", color: "#92400e" }}>{fill(L.ui.singularitiesTruncated, { max: fo.singularities.length })}</p> : null}
        </div>
      ) : null}
      <FormsList fo={fo} L={L} />
      {fo.implicit ? (
        <div>
          <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>{L.ui.implicitHeading}</h2>
          <p style={{ margin: 0 }}>{fill(L.tool.exactImplicit, { levels: fo.implicit.levels.length, deviation: fo.implicit.pathDeviation.toExponential(1) })}</p>
        </div>
      ) : fo.implicitCheck && !fo.implicitCheck.passed ? (
        <div>
          <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>{L.ui.implicitHeading}</h2>
          <p style={{ margin: 0, color: "#92400e" }}>
            {fill(L.tool.exactPathCheckFailed, { deviation: Number.isFinite(fo.implicitCheck.pathDeviation) ? fo.implicitCheck.pathDeviation.toExponential(1) : "∞", tol: fo.implicitCheck.tol.toExponential(0) })}
          </p>
        </div>
      ) : null}
    </section>
  );
}

/** Detected forms by verdict: consistent, borderline (flagged), then the rejected and untestable ones. */
export function FormsList({ fo, L }: { fo: NonNullable<Scene["firstOrder"]>; L: LabelTable }) {
  const all = fo.forms ?? [];
  const reported = reportedForms(all);
  // A form ruled out by a textbook rule (Bernoulli with n = 0 or 1) is not a failed test: its
  // deviation may be far below the threshold, so the rule is printed instead of the deviation
  // (the same split as the tool summary in app/mcp/tools.ts).
  const rejected = all.filter((f) => f.verdict === "inconsistent" && !f.excluded);
  const excluded = all.filter((f) => f.excluded);
  const untestable = all.filter((f) => f.verdict === "untestable");
  const dev = (d: number | null) => (d === null || !Number.isFinite(d) ? "—" : d.toExponential(1));
  return (
    <div>
      <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>{L.ui.formsHeading}</h2>
      {reported.length ? (
        <>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {/* The verdict sentence on the line; the measured evidence and the caveat behind the toggle. */}
            {reported.map((f) => (
              <li key={f.form} style={f.verdict === "borderline" ? { color: "#92400e" } : undefined} data-form-verdict={f.verdict}>
                <FoldedLine {...formFolded(L, f as { form: typeof f.form; verdict: "consistent" | "borderline"; evidence: string; caveat: string })} label={L.ui.details} data-info="form" />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p style={{ margin: 0 }}>{fo.formsNote}</p>
      )}
      {rejected.length ? (
        <p style={{ margin: "6px 0 0", color: "#52606d", fontSize: 12 }}>
          {fill(L.tool.formsInconsistentLine, { list: rejected.map((f) => `${L.form[f.form]}${L.tool.parenOpen}${dev(f.maxRelDeviation)}${L.tool.parenClose}`).join(L.tool.listSeparator) })}
        </p>
      ) : null}
      {excluded.length ? (
        <p style={{ margin: "6px 0 0", color: "#52606d", fontSize: 12 }} data-forms-excluded>
          {fill(L.tool.formsExcludedLine, { list: excluded.map((f) => `${L.form[f.form]}${L.tool.parenOpen}${f.reason ?? ""}${L.tool.parenClose}`).join(L.tool.listSeparator) })}
        </p>
      ) : null}
      {untestable.length ? (
        <p style={{ margin: "6px 0 0", color: "#52606d", fontSize: 12 }}>
          {fill(L.tool.formsUntestableLine, { list: untestable.map((f) => L.form[f.form]).join(L.tool.listSeparator) })}
        </p>
      ) : null}
    </div>
  );
}

const labelStyle = { display: "grid", gap: 4, color: "#1f2933" } as const;
const INITIAL_VALUE_ERROR = { empty: "initialValueEmpty", notANumber: "initialValueNotANumber", outOfRange: "initialValueOutOfRange" } as const satisfies Record<InitialValueReason, string>;
const inputStyle = { padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6, font: "inherit" } as const;
const buttonStyle = { padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, background: "#f9fafb", cursor: "pointer", font: "inherit" } as const;
