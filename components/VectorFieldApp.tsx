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
import { useDocumentLang } from "@/components/useDocumentLang";
import { exportScenePng } from "@/components/exportScenePng";
import { exportFileName, exportFooterText } from "@/lib/export-footer";
import { reportedForms } from "@/lib/core/detect-form";
import { compileSystem, ParseError, X_IN_FIRST_ORDER_MESSAGE, type CompiledSystem } from "@/lib/core/parse";
import { reduceSecondOrder, type ReducedSecondOrder } from "@/lib/core/second-order";
import { compileDifferential, toSystem, type FirstOrderSpec } from "@/lib/core/slope-field";
import type { Box, SystemSpec, Vec2 } from "@/lib/core/types";
import { constantSolutionFolded, constantSolutionNotices, equilibriaNotices, equilibriumDetail, fill, formatEigenvalues, formFolded, formatNumber, formatPoint, labels, noConstantSentence, timeDependentFolded, type LabelTable, type Locale } from "@/lib/labels";
import { groupTrajectories, trajectoryLines } from "@/lib/labels-trajectory";
import type { ArrowMode } from "@/lib/render/arrows";
import type { Scene } from "@/lib/scene";
import { siteText } from "@/lib/site-text";
import { isUndoKey } from "@/lib/undo-key";
import { buildShareUrl, encodeState, type AppBox, type AppMode, type AppState, type UrlProblem, type UrlProblemReason } from "@/lib/url-state";
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
.vf-form button:not([data-info-toggle]), .vf-form select, .vf-form input:not([type="checkbox"]) { width: 100%; box-sizing: border-box; min-width: 0; text-align: left; }
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
  .vf-app button, .vf-app select, .vf-app input:not([type="checkbox"]) { min-height: 44px; font-size: 16px; }
  .vf-app input[type="checkbox"] { width: 22px; height: 22px; }
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

/** Student-facing name of the horizontal coordinate: x for a planar system or a second-order equation, t for a first-order equation. */
function horizontalName(mode: PresetMode): "x" | "t" {
  return mode === "system" || mode === "second" ? "x" : "t";
}

function parseBox(form: Form, L: LabelTable): Box {
  const nums = [form.xMin, form.xMax, form.yMin, form.yMax].map((s) => Number(s.trim()));
  if (nums.some((n) => !Number.isFinite(n))) throw new RangeError(L.ui.rangeError);
  const [xMin, xMax, yMin, yMax] = nums;
  if (!(xMin < xMax)) throw new RangeError(fill(L.ui.xRangeError, { hv: horizontalName(form.mode), min: xMin, max: xMax }));
  if (!(yMin < yMax)) throw new RangeError(fill(L.ui.yRangeError, { min: yMin, max: yMax }));
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
  const compiled = useMemo(() => compile(form, L), [form, L]);

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
  });
  const { scene, viewport, overlay, hint, trajectories, trajectoryStarts, highlight, cursor, clearTrajectories, undo, canUndo, handlers } = interactive;

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
    }),
    [form, boxNow, chosenLocale, equalScale, snapshotT, trajectoryStarts],
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
      const footer = exportFooterText(scene, viewport, locale, window.location.origin);
      const blob = await exportScenePng({ scene, viewport, arrowMode: form.arrowMode, footer, scale: 2 });
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
  }, [scene, viewport, locale, form.arrowMode, form.mode, presetId]);
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
  const groups = groupTrajectories(trajectories);
  const lastGroup = groups.length ? groups[groups.length - 1] : null;
  const hv = horizontalName(form.mode);

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
          {fill(L.ui.urlProblems, {
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
              <span>{L.ui.yMin}</span>
              <input value={form.yMin} onChange={(e) => update({ yMin: e.target.value })} style={inputStyle} name="yMin" />
            </label>
            <label style={labelStyle}>
              <span>{L.ui.yMax}</span>
              <input value={form.yMax} onChange={(e) => update({ yMax: e.target.value })} style={inputStyle} name="yMax" />
            </label>
          </div>
          {scene?.timeDependent ? (
            <label style={labelStyle}>
              <span>{L.ui.snapshotT}</span>
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
              <input type="checkbox" checked={equalScale} onChange={(e) => setEqualScale(e.target.checked)} name="equalScale" />
              <span>{L.ui.equalScale}</span>
            </label>{" "}
            <Info label={L.ui.details} data-info="equal-scale">
              {fill(L.ui.equalScaleDetail, { hv })}
            </Info>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={clearTrajectories} style={{ ...buttonStyle, flex: "1 1 auto" }} disabled={trajectories.length === 0}>
              {fill(L.ui.clearTrajectories, { count: trajectories.length / 2 })}
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
              {/* Persistent while the toggle is off (never a timed toast): the picture's angles are not slopes. */}
              {!equalScale ? (
                <p role="status" data-scale-warning style={{ margin: "6px 0 0", color: "#92400e" }}>
                  {L.ui.equalScaleWarning}
                </p>
              ) : null}
              {/* The hover preview passes through a point where uniqueness fails (kept curves say it in the last-trajectory line). */}
              {overlay.some((t) => t.nonUnique) ? (
                <p role="status" data-non-unique-preview style={{ margin: "6px 0 0", color: "#92400e" }}>
                  {L.ui.nonUniqueTrajectory}
                </p>
              ) : null}
              <p style={{ margin: "6px 0 0", color: "#52606d", fontSize: 12 }} data-shown-range>
                {fill(equalScale ? L.ui.shownRangeEqual : L.ui.shownRangeFilled, {
                  hv,
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
              <FoldedLine {...timeDependentFolded(L, scene.timeDependent.snapshotT)} label={L.ui.details} data-info="time-dependent" />
            </p>
          ) : null}
          {scene?.box && !scene.timeDependent ? (
            <p style={{ margin: "12px 0 0", color: "#52606d", fontSize: 12 }} data-features-box>
              {fill(L.ui.featuresBox, {
                hv,
                xMin: formatNumber((scene.featuresBox ?? scene.box).x.min, 3),
                xMax: formatNumber((scene.featuresBox ?? scene.box).x.max, 3),
                yMin: formatNumber((scene.featuresBox ?? scene.box).y.min, 3),
                yMax: formatNumber((scene.featuresBox ?? scene.box).y.max, 3),
              })}{" "}
              <Info label={L.ui.details} data-info="features-box">
                {L.ui.featuresBoxDetail}
              </Info>
            </p>
          ) : null}
          {scene?.kind === "analyze_system" && !scene.timeDependent ? <EquilibriaList scene={scene} L={L} /> : null}
          {scene?.kind === "analyze_first_order" ? <FirstOrderList scene={scene} L={L} /> : null}
          {scene && lastGroup ? (
            <p style={{ margin: "8px 0 0", color: "#52606d" }} data-last-trajectory>
              {L.ui.lastTrajectory} {trajectoryLines(scene, lastGroup, L).join("; ")}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function EquilibriaList({ scene, L }: { scene: Scene; L: LabelTable }) {
  const eq = scene.equilibria ?? [];
  return (
    <section style={{ marginTop: 14 }}>
      <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>{L.ui.equilibriaHeading}</h2>
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
                  <strong>{formatPoint(p.at)}</strong> {L.classification[p.classification]}
                </>
              }
              detail={equilibriumDetail(L, p)}
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
const inputStyle = { padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6, font: "inherit" } as const;
const buttonStyle = { padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, background: "#f9fafb", cursor: "pointer", font: "inherit" } as const;
