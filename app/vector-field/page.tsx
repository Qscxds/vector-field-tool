"use client";

/**
 * Web shell: the same computation core and the same canvas component as the MCP widget, driven by
 * a form instead of by Claude. Independent route; /mcp and /widget are untouched.
 * The interaction model (zoom / pan / hover / click-to-keep) lives in useInteractiveScene.
 */
import { useEffect, useMemo, useState } from "react";
import { useInteractiveScene } from "@/components/useInteractiveScene";
import { VectorFieldCanvas } from "@/components/VectorFieldCanvas";
import { reportedForms } from "@/lib/core/detect-form";
import { compileSystem, ParseError, X_IN_FIRST_ORDER_MESSAGE, type CompiledSystem } from "@/lib/core/parse";
import { reduceSecondOrder, type ReducedSecondOrder } from "@/lib/core/second-order";
import { compileDifferential, toSystem, type FirstOrderSpec } from "@/lib/core/slope-field";
import type { Box, SystemSpec } from "@/lib/core/types";
import { fill, formatEigenvalue, formatNumber, formatPoint, labels, localeFromLanguageTag, noConstantSentence, stabilitySentence, uniquenessSentence, type LabelTable, type Locale } from "@/lib/labels";
import { groupTrajectories, trajectoryLines } from "@/lib/labels-trajectory";
import type { ArrowMode } from "@/lib/render/arrows";
import type { Scene } from "@/lib/scene";
import { PRESETS, type Preset, type PresetMode } from "./presets";

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

const CANVAS_W = 720;
const CANVAS_H = 520;

function fromPreset(p: Preset, density: number, arrowMode: ArrowMode): Form {
  return {
    mode: p.mode,
    f: p.f,
    g: p.g,
    M: p.M,
    N: p.N,
    second: p.second ?? "",
    xMin: String(p.box.xMin),
    xMax: String(p.box.xMax),
    yMin: String(p.box.yMin),
    yMax: String(p.box.yMax),
    density,
    arrowMode,
  };
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
 * Second-order mode: the kernel's specific hints (linearity in x'', the unknown is x, write =) are
 * English sentences from lib/core/second-order, shown inside the bilingual wrapper (a recorded limitation).
 */
function explain(error: unknown, L: LabelTable, mode: PresetMode): string {
  if (error instanceof ParseError) {
    if (mode === "system") {
      if (error.code === "lhs_in_expression") return L.ui.lhsInExpressionSystem;
    } else if (mode !== "second") {
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

function compile(form: Form, L: LabelTable): Compiled {
  try {
    const box = parseBox(form, L);
    let spec: SystemSpec;
    let firstOrder: FirstOrderSpec | null = null;
    let secondOrder: ReducedSecondOrder | null = null;
    if (form.mode === "system") {
      spec = { f: form.f, g: form.g };
    } else if (form.mode === "second") {
      secondOrder = reduceSecondOrder(form.second);
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

export default function VectorFieldPage() {
  const [locale, setLocale] = useState<Locale>("en");
  useEffect(() => {
    setLocale(localeFromLanguageTag(typeof navigator !== "undefined" ? navigator.language : undefined));
  }, []);
  const L = labels(locale);

  const [form, setForm] = useState<Form>(() => fromPreset(PRESETS[0], 20, "unit"));
  const [presetId, setPresetId] = useState<string | null>(PRESETS[0].id);
  // View option, not part of the equation: toggling it keeps the selected preset.
  const [equalScale, setEqualScale] = useState(true);
  // Snapshot time of a non-autonomous system (the input is only shown for one); text so the
  // student can type "-" or "1." without the field snapping back. Unparsable -> 0.
  const [snapshotTText, setSnapshotTText] = useState("0");
  const snapshotT = useMemo(() => {
    const v = Number(snapshotTText.trim());
    return snapshotTText.trim() !== "" && Number.isFinite(v) ? v : 0;
  }, [snapshotTText]);
  const compiled = useMemo(() => compile(form, L), [form, L]);

  const interactive = useInteractiveScene({
    sys: compiled.sys,
    spec: compiled.spec,
    firstOrder: compiled.firstOrder,
    homeBox: compiled.box,
    width: CANVAS_W,
    height: CANVAS_H,
    density: form.density,
    locale,
    kind: form.mode === "system" || form.mode === "second" ? "analyze_system" : "analyze_first_order",
    fieldStyle: form.mode === "differential" ? "segments" : "arrows",
    // The snapshot time is part of the key: curves traced at another instant belong to another picture.
    systemKey: `${form.mode}|${form.f}|${form.g}|${form.M}|${form.N}|${form.second}|${snapshotT}`,
    withFeatures: true,
    equalScale,
    snapshotT,
  });
  const { scene, viewport, overlay, hint, trajectories, clearTrajectories, handlers } = interactive;

  const update = (patch: Partial<Form>) => {
    setPresetId(null);
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const loadPreset = (p: Preset) => {
    setForm(fromPreset(p, form.density, form.arrowMode));
    setPresetId(p.id);
  };

  const preset = presetId ? PRESETS.find((p) => p.id === presetId) : undefined;
  const groups = groupTrajectories(trajectories);
  const lastGroup = groups.length ? groups[groups.length - 1] : null;
  const hv = horizontalName(form.mode);

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 24px 48px", fontSize: 14, lineHeight: 1.5 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>{L.ui.title}</h1>
        <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#52606d" }}>
          <span>{L.ui.language}</span>
          <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)} style={inputStyle} name="locale">
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>
      <p style={{ margin: "0 0 16px", color: "#52606d" }}>{L.ui.subtitle}</p>

      <section style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <span style={{ alignSelf: "center", color: "#52606d" }}>{L.ui.presets}</span>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => loadPreset(p)}
            style={{ ...buttonStyle, ...(p.id === presetId ? { border: "1px solid #1d4ed8", background: "#eff6ff" } : {}) }}
            data-preset={p.id}
          >
            {p.name[locale]}
          </button>
        ))}
      </section>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <form style={{ width: 300, display: "grid", gap: 10 }} onSubmit={(e) => e.preventDefault()}>
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
          <label style={{ display: "flex", gap: 6, alignItems: "flex-start", color: "#1f2933" }}>
            <input type="checkbox" checked={equalScale} onChange={(e) => setEqualScale(e.target.checked)} name="equalScale" style={{ marginTop: 3 }} />
            <span>{fill(L.ui.equalScale, { hv })}</span>
          </label>
          <button type="button" onClick={clearTrajectories} style={buttonStyle} disabled={trajectories.length === 0}>
            {fill(L.ui.clearTrajectories, { count: trajectories.length / 2 })}
          </button>
          {compiled.secondOrder ? (
            <p style={{ margin: 0, color: "#1f2933" }} data-second-order-reduced>
              {fill(L.ui.secondOrderReduced, { g: compiled.secondOrder.reduced.g })}
            </p>
          ) : null}
          {preset ? <p style={{ margin: 0, color: "#52606d" }}>{preset.note[locale]}</p> : null}
          <p style={{ margin: 0, color: "#52606d", fontSize: 12 }}>
            {form.mode === "system" ? L.ui.syntaxHint : form.mode === "second" ? L.ui.syntaxHintSecondOrder : L.ui.syntaxHintFirstOrder}
          </p>
        </form>

        <div style={{ flex: "1 1 720px", minWidth: 0 }}>
          {compiled.error ? (
            <div role="alert" style={{ padding: "10px 12px", marginBottom: 10, background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: 6 }}>
              {compiled.error}
            </div>
          ) : null}
          {scene && viewport ? (
            <>
              <VectorFieldCanvas
                scene={scene}
                viewport={viewport}
                width={CANVAS_W}
                height={CANVAS_H}
                arrowMode={form.arrowMode}
                overlay={overlay}
                overlayHint={hint}
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
                })}{" "}
                · {L.ui.interactionHint}
              </p>
            </>
          ) : (
            <div style={{ width: CANVAS_W, height: CANVAS_H, border: "1px dashed #d1d5db", borderRadius: 6, display: "grid", placeItems: "center", color: "#6b7280" }}>
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
              {fill(L.ui.timeDependentNote, { t: formatNumber(scene.timeDependent.snapshotT, 4) })}
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
              })}
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
      {scene.warning ? <p style={{ margin: "0 0 6px", color: "#92400e" }}>{L.warning[scene.warning]}</p> : null}
      {scene.truncated ? <p style={{ margin: "0 0 6px", color: "#92400e" }}>{fill(L.ui.equilibriaTruncated, { max: eq.length })}</p> : null}
      {(scene.singularPoints ?? []).map((s, i) => (
        <p key={`singular-${i}`} style={{ margin: "0 0 6px", color: "#92400e" }}>{fill(L.tool.singularPoint, { point: formatPoint(s) })}</p>
      ))}
      <ol style={{ margin: 0, paddingLeft: 20 }}>
        {eq.map((p, i) => (
          <li key={i} style={{ marginBottom: 6 }}>
            <strong>{formatPoint(p.at)}</strong> {L.classification[p.classification]}; λ = {p.eigenvalues.map((e) => formatEigenvalue(e)).join(", ") || L.tool.eigenvaluesUnavailable}; tr ={" "}
            {formatNumber(p.trace, 5)}, det = {formatNumber(p.determinant, 5)}.
            {p.caveat ? <span style={{ color: "#92400e" }}> {L.caveat[p.caveat]}</span> : null}
            <UniquenessNote text={uniquenessSentence(L, p.uniqueness, { point: p.at })} />
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
          <p style={{ margin: 0 }}>{noConstantSentence(L, fo.autonomous)}</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {fo.solutions.map((s) => (
              <li key={s.y} data-domain-edge={s.domainEdge} data-uniqueness={s.uniqueness?.verdict}>
                {fill(L.tool.constantSolution, { y: formatNumber(s.y, 6), stability: stabilitySentence(L, s) })}
                <UniquenessNote text={uniquenessSentence(L, s.uniqueness, { y: s.y })} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {fo.singularities?.length ? (
        <div>
          <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>{L.ui.singularHeading}</h2>
          <p style={{ margin: 0 }}>{fo.singularities.map((p) => formatPoint(p)).join(L.tool.listSeparator)}</p>
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

/** The uniqueness sentence under a constant solution or an equilibrium; nothing when the quotients stayed bounded. */
function UniquenessNote({ text }: { text: string | null }) {
  return text ? (
    <div data-uniqueness-note style={{ color: "#92400e", marginTop: 2 }}>
      {text}
    </div>
  ) : null;
}

/** Detected forms by verdict: consistent, borderline (flagged), then the rejected and untestable ones. */
export function FormsList({ fo, L }: { fo: NonNullable<Scene["firstOrder"]>; L: LabelTable }) {
  const all = fo.forms ?? [];
  const reported = reportedForms(all);
  const consistent = reported.find((f) => f.verdict === "consistent");
  const borderline = reported.find((f) => f.verdict === "borderline");
  const rejected = all.filter((f) => f.verdict === "inconsistent");
  const untestable = all.filter((f) => f.verdict === "untestable");
  const dev = (d: number | null) => (d === null || !Number.isFinite(d) ? "—" : d.toExponential(1));
  return (
    <div>
      <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>{L.ui.formsHeading}</h2>
      {reported.length ? (
        <>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {reported.map((f) => (
              <li key={f.form} style={f.verdict === "borderline" ? { color: "#92400e" } : undefined}>
                {fill(f.verdict === "consistent" ? L.tool.formLine : L.tool.formBorderlineLine, { form: L.form[f.form], evidence: f.evidence }).replace(/^- /, "")}
              </li>
            ))}
          </ul>
          {consistent ? <p style={{ margin: "6px 0 0", color: "#92400e" }}>{fill(L.tool.formsCaveat, { caveat: consistent.caveat })}</p> : null}
          {borderline ? <p style={{ margin: "6px 0 0", color: "#92400e" }}>{fill(L.tool.formsCaveat, { caveat: borderline.caveat })}</p> : null}
        </>
      ) : (
        <p style={{ margin: 0 }}>{fo.formsNote}</p>
      )}
      {rejected.length ? (
        <p style={{ margin: "6px 0 0", color: "#52606d", fontSize: 12 }}>
          {fill(L.tool.formsInconsistentLine, { list: rejected.map((f) => `${L.form[f.form]}${L.tool.parenOpen}${dev(f.maxRelDeviation)}${L.tool.parenClose}`).join(L.tool.listSeparator) })}
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
