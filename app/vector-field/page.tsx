"use client";

/**
 * Web shell: the same computation core and the same canvas component as the MCP widget, driven by
 * a form instead of by Claude. Independent route; /mcp and /widget are untouched.
 *
 * Interaction model: the entered box is the "home" view (fitViewport, equal scale); wheel zooms
 * about the cursor, drag pans, double-click returns home. The field is re-sampled on every view
 * change; equilibria / first-order features are recomputed for the visible box after a short
 * pause. Hovering previews the solution curve through the cursor (rAF-throttled, fixed step
 * budget); clicking keeps it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VectorFieldCanvas } from "@/components/VectorFieldCanvas";
import { detectForms, NO_FORM_NOTE } from "@/lib/core/detect-form";
import { findEquilibria } from "@/lib/core/equilibria";
import { exactPotential, potentialLevels } from "@/lib/core/exact";
import { sampleField } from "@/lib/core/field";
import { integrateAdaptive } from "@/lib/core/integrate";
import { compileSystem, ParseError, type CompiledSystem } from "@/lib/core/parse";
import { firstOrderEquilibria, firstOrderSingularities, toSystem, type FirstOrderSpec } from "@/lib/core/slope-field";
import type { Box, SystemSpec, Vec2 } from "@/lib/core/types";
import { fill, formatEigenvalue, formatNumber, formatPoint, labels, localeFromLanguageTag, type LabelTable, type Locale } from "@/lib/labels";
import type { ArrowMode } from "@/lib/render/arrows";
import { contourSegments } from "@/lib/render/contours";
import { fitViewport, panBy, worldToScreen, zoomAt, type Viewport } from "@/lib/render/viewport";
import type { FirstOrderView, Scene, TrajectoryView } from "@/lib/scene";
import { PRESETS, type Preset, type PresetMode } from "./presets";

type Form = {
  mode: PresetMode;
  f: string;
  g: string;
  M: string;
  N: string;
  xMin: string;
  xMax: string;
  yMin: string;
  yMax: string;
  density: number;
  arrowMode: ArrowMode;
};

type Compiled =
  | { sys: CompiledSystem; spec: SystemSpec; firstOrder: FirstOrderSpec | null; box: Box; error: null }
  | { sys: null; spec: null; firstOrder: null; box: null; error: string };

type Features = Pick<Scene, "equilibria" | "warning" | "firstOrder">;

const CANVAS_W = 720;
const CANVAS_H = 520;
/** Fixed trajectories: how long to integrate in each direction. */
const CLICK_TSPAN = 50;
/** Hover preview: integration steps per direction (S spike: ~2000 RK4 steps ≈ 13 ms in the sandbox). */
const HOVER_STEP_BUDGET = 400;
/** Hover preview: the pointer has to move this many pixels before a new preview is computed. */
const HOVER_PIXEL_THRESHOLD = 3;
/** Pixels around a singular point (M = N = 0) where no preview is attempted. */
const SINGULAR_PIXEL_RADIUS = 8;
/** Recompute equilibria for the visible box this long after the last zoom/pan (ms). */
const FEATURE_DEBOUNCE_MS = 250;

function fromPreset(p: Preset, density: number, arrowMode: ArrowMode): Form {
  return {
    mode: p.mode,
    f: p.f,
    g: p.g,
    M: p.M,
    N: p.N,
    xMin: String(p.box.xMin),
    xMax: String(p.box.xMax),
    yMin: String(p.box.yMin),
    yMax: String(p.box.yMax),
    density,
    arrowMode,
  };
}

function parseBox(form: Form, L: LabelTable): Box {
  const nums = [form.xMin, form.xMax, form.yMin, form.yMax].map((s) => Number(s.trim()));
  if (nums.some((n) => !Number.isFinite(n))) throw new RangeError(L.ui.rangeError);
  const [xMin, xMax, yMin, yMax] = nums;
  if (!(xMin < xMax)) throw new RangeError(fill(L.ui.xRangeError, { min: xMin, max: xMax }));
  if (!(yMin < yMax)) throw new RangeError(fill(L.ui.yRangeError, { min: yMin, max: yMax }));
  return { x: { min: xMin, max: xMax }, y: { min: yMin, max: yMax } };
}

function explain(error: unknown, L: LabelTable): string {
  if (error instanceof ParseError) return fill(L.ui.exprError, { expr: error.expr, message: error.message });
  if (error instanceof RangeError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

function compile(form: Form, L: LabelTable): Compiled {
  try {
    const box = parseBox(form, L);
    let spec: SystemSpec;
    let firstOrder: FirstOrderSpec | null = null;
    if (form.mode === "system") {
      spec = { f: form.f, g: form.g };
    } else {
      firstOrder = form.mode === "explicit" ? { kind: "explicit", g: form.g } : { kind: "differential", M: form.M, N: form.N };
      spec = toSystem(firstOrder);
    }
    const sys = compileSystem(spec);
    return { sys, spec, firstOrder, box, error: null };
  } catch (error) {
    return { sys: null, spec: null, firstOrder: null, box: null, error: explain(error, L) };
  }
}

/** Equilibria (systems) or constant solutions / singular points / forms / implicit curves (first order) for a box. */
function computeFeatures(c: Compiled, box: Box, locale: Locale): Features {
  if (!c.sys) return {};
  try {
    if (!c.firstOrder) {
      const eq = findEquilibria(c.sys, box);
      return { equilibria: eq.points, warning: eq.warning };
    }
    const spec = c.firstOrder;
    const eq = firstOrderEquilibria(spec, box.y, { xRange: box.x });
    const singular = firstOrderSingularities(spec, box);
    const forms = detectForms(spec, box, locale);
    let implicit: FirstOrderView["implicit"];
    if (forms.some((f) => f.form === "exact")) {
      const pot = exactPotential(spec, box);
      if (pot.consistent) {
        const levels = potentialLevels(pot.F, box, 8).map((level) => ({ level, segments: contourSegments(pot.F, box, level, 60, 60) }));
        implicit = { levels, pathDeviation: pot.pathDeviation };
      }
    }
    return {
      firstOrder: {
        expr: spec.kind === "explicit" ? `dy/dx = ${spec.g}` : `(${spec.M}) dx + (${spec.N}) dy = 0`,
        spec,
        autonomous: eq.autonomous,
        solutions: eq.solutions,
        singularities: singular.points,
        forms,
        formsNote: forms.length === 0 ? NO_FORM_NOTE[locale] : undefined,
        implicit,
      },
    };
  } catch {
    return {};
  }
}

/** Trajectories may run past the visible box before stopping, so zooming out later still shows them. */
function expandBox(box: Box, factor: number): Box {
  const w = box.x.max - box.x.min;
  const h = box.y.max - box.y.min;
  return { x: { min: box.x.min - w * factor, max: box.x.max + w * factor }, y: { min: box.y.min - h * factor, max: box.y.max + h * factor } };
}

function traceBoth(sys: CompiledSystem, start: Vec2, box: Box, maxSteps?: number): TrajectoryView[] {
  return ([1, -1] as const).map((direction): TrajectoryView => {
    const tr = integrateAdaptive(sys, start, CLICK_TSPAN, { direction, box: expandBox(box, 1), h: 0.05, ...(maxSteps ? { maxSteps } : {}) });
    return {
      direction: direction === 1 ? "forward" : "backward",
      points: tr.points,
      status: tr.status,
      steps: tr.steps,
      tEnd: tr.times[tr.times.length - 1],
    };
  });
}

export default function VectorFieldPage() {
  const [locale, setLocale] = useState<Locale>("en");
  useEffect(() => {
    setLocale(localeFromLanguageTag(typeof navigator !== "undefined" ? navigator.language : undefined));
  }, []);
  const L = labels(locale);

  const [form, setForm] = useState<Form>(() => fromPreset(PRESETS[0], 20, "unit"));
  const [presetId, setPresetId] = useState<string | null>(PRESETS[0].id);
  const [trajectories, setTrajectories] = useState<TrajectoryView[]>([]);
  const [overlay, setOverlay] = useState<TrajectoryView[]>([]);
  const [hint, setHint] = useState<{ at: Vec2; text: string } | null>(null);
  const [view, setView] = useState<Viewport | null>(null);

  const compiled = useMemo(() => compile(form, L), [form, L]);
  const homeBox = compiled.box;
  const homeKey = homeBox ? JSON.stringify(homeBox) : "";
  const systemKey = `${form.mode}|${form.f}|${form.g}|${form.M}|${form.N}`;

  // A new entered box is a new home view; a new system invalidates every drawn curve.
  useEffect(() => {
    setView(null);
  }, [homeKey]);
  useEffect(() => {
    setTrajectories([]);
    setOverlay([]);
    setHint(null);
  }, [systemKey]);

  const viewport = useMemo(() => view ?? (homeBox ? fitViewport(homeBox, CANVAS_W, CANVAS_H) : null), [view, homeBox]);

  // Field: resampled for every view change (cheap: density² evaluations).
  const field = useMemo(
    () => (compiled.sys && viewport ? sampleField(compiled.sys, viewport.box, form.density, form.density) : null),
    [compiled.sys, viewport, form.density],
  );

  // Features: recomputed for the visible box, debounced while zooming/panning.
  const [featureBox, setFeatureBox] = useState<Box | null>(null);
  const viewBoxKey = viewport ? JSON.stringify(viewport.box) : "";
  useEffect(() => {
    if (!viewport) return;
    const delay = view ? FEATURE_DEBOUNCE_MS : 0;
    const id = setTimeout(() => setFeatureBox(viewport.box), delay);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewBoxKey]);
  const effectiveFeatureBox = featureBox ?? viewport?.box ?? null;
  const features = useMemo(
    () => (effectiveFeatureBox ? computeFeatures(compiled, effectiveFeatureBox, locale) : {}),
    [compiled, effectiveFeatureBox, locale],
  );

  const scene = useMemo<Scene | null>(() => {
    if (!compiled.sys || !viewport || !field) return null;
    return {
      kind: form.mode === "system" ? "analyze_system" : "analyze_first_order",
      locale,
      system: compiled.spec,
      box: viewport.box,
      field,
      fieldStyle: form.mode === "differential" ? "segments" : "arrows",
      equilibria: features.equilibria,
      warning: features.warning,
      firstOrder: features.firstOrder,
      trajectories,
    };
  }, [compiled, viewport, field, features, trajectories, locale, form.mode]);

  // Refs so the interaction callbacks stay stable (the canvas binds the wheel listener once).
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const homeBoxRef = useRef(homeBox);
  homeBoxRef.current = homeBox;
  const sysRef = useRef(compiled.sys);
  sysRef.current = compiled.sys;
  const singularRef = useRef<Vec2[]>([]);
  singularRef.current = features.firstOrder?.singularities ?? [];
  const localeRef = useRef(locale);
  localeRef.current = locale;

  const handleZoom = useCallback((screen: Vec2, factor: number) => {
    const cur = viewportRef.current;
    const home = homeBoxRef.current;
    if (!cur || !home) return;
    setView(zoomAt(cur, screen, factor, { original: home }));
  }, []);

  const handlePan = useCallback((dx: number, dy: number) => {
    const cur = viewportRef.current;
    if (!cur) return;
    setView(panBy(cur, dx, dy));
  }, []);

  const handleReset = useCallback(() => setView(null), []);

  const handleClick = useCallback((start: Vec2) => {
    const sys = sysRef.current;
    const vp = viewportRef.current;
    if (!sys || !vp) return;
    setTrajectories((prev) => [...prev, ...traceBoth(sys, start, vp.box)]);
  }, []);

  const hoverRef = useRef<{ world: Vec2; screen: Vec2 } | null>(null);
  const lastHoverScreen = useRef<Vec2 | null>(null);
  const rafRef = useRef<number | null>(null);
  const handleHover = useCallback((world: Vec2 | null, screen: Vec2 | null) => {
    if (!world || !screen) {
      hoverRef.current = null;
      lastHoverScreen.current = null;
      setOverlay([]);
      setHint(null);
      return;
    }
    hoverRef.current = { world, screen };
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const h = hoverRef.current;
      const sys = sysRef.current;
      const vp = viewportRef.current;
      if (!h || !sys || !vp) return;
      const last = lastHoverScreen.current;
      if (last && Math.hypot(h.screen.x - last.x, h.screen.y - last.y) < HOVER_PIXEL_THRESHOLD) return;
      lastHoverScreen.current = h.screen;
      const nearSingular = singularRef.current.some((p) => {
        const s = worldToScreen(vp, p);
        return Math.hypot(s.x - h.screen.x, s.y - h.screen.y) < SINGULAR_PIXEL_RADIUS;
      });
      if (nearSingular) {
        setOverlay([]);
        setHint({ at: h.world, text: labels(localeRef.current).ui.hoverUndefined });
        return;
      }
      setHint(null);
      setOverlay(traceBoth(sys, h.world, vp.box, HOVER_STEP_BUDGET));
    });
  }, []);
  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  const update = (patch: Partial<Form>) => {
    setPresetId(null);
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const loadPreset = (p: Preset) => {
    setForm(fromPreset(p, form.density, form.arrowMode));
    setPresetId(p.id);
  };

  const preset = presetId ? PRESETS.find((p) => p.id === presetId) : undefined;
  const lastPair = trajectories.slice(-2);

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
            style={{ ...buttonStyle, ...(p.id === presetId ? { borderColor: "#1d4ed8", background: "#eff6ff" } : {}) }}
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
            </select>
          </label>
          {form.mode === "system" ? (
            <label style={labelStyle}>
              <span>{L.ui.fLabel}</span>
              <input value={form.f} onChange={(e) => update({ f: e.target.value })} style={inputStyle} spellCheck={false} name="f" />
            </label>
          ) : null}
          {form.mode !== "differential" ? (
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
              <span>{L.ui.xMin}</span>
              <input value={form.xMin} onChange={(e) => update({ xMin: e.target.value })} style={inputStyle} name="xMin" />
            </label>
            <label style={labelStyle}>
              <span>{L.ui.xMax}</span>
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
          <button type="button" onClick={() => setTrajectories([])} style={buttonStyle} disabled={trajectories.length === 0}>
            {fill(L.ui.clearTrajectories, { count: trajectories.length / 2 })}
          </button>
          {preset ? <p style={{ margin: 0, color: "#52606d" }}>{preset.note[locale]}</p> : null}
          <p style={{ margin: 0, color: "#52606d", fontSize: 12 }}>{L.ui.syntaxHint}</p>
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
                onClickWorld={handleClick}
                onHoverWorld={handleHover}
                onWheelZoom={handleZoom}
                onPan={handlePan}
                onDoubleClick={handleReset}
              />
              <p style={{ margin: "6px 0 0", color: "#52606d", fontSize: 12 }} data-shown-range>
                {fill(L.ui.shownRange, {
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

          {scene?.kind === "analyze_system" ? <EquilibriaList scene={scene} L={L} /> : null}
          {scene?.kind === "analyze_first_order" ? <FirstOrderList scene={scene} L={L} /> : null}
          {lastPair.length ? (
            <p style={{ margin: "8px 0 0", color: "#52606d" }}>
              {L.ui.lastTrajectory}{" "}
              {lastPair
                .map((t) => `${t.direction === "forward" ? L.tool.forward : L.tool.backward} ${fill(L.ui.toward, { t: formatNumber(t.tEnd, 2), status: L.status[t.status] })}`)
                .join("; ")}
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
      <ol style={{ margin: 0, paddingLeft: 20 }}>
        {eq.map((p, i) => (
          <li key={i} style={{ marginBottom: 6 }}>
            <strong>{formatPoint(p.at)}</strong> {L.classification[p.classification]}; λ = {p.eigenvalues.map((e) => formatEigenvalue(e)).join(", ") || L.tool.eigenvaluesUnavailable}; tr ={" "}
            {formatNumber(p.trace, 5)}, det = {formatNumber(p.determinant, 5)}.
            {p.caveat ? <span style={{ color: "#92400e" }}> {L.caveat[p.caveat]}</span> : null}
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
          <p style={{ margin: 0 }}>{fo.autonomous ? L.tool.noConstantAutonomous : L.tool.noConstantGeneral}</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {fo.solutions.map((s) => (
              <li key={s.y}>{fill(L.tool.constantSolution, { y: formatNumber(s.y, 6), stability: L.stability[s.stability] })}</li>
            ))}
          </ul>
        )}
      </div>
      {fo.singularities?.length ? (
        <div>
          <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>{L.ui.singularHeading}</h2>
          <p style={{ margin: 0 }}>{fo.singularities.map((p) => formatPoint(p)).join(L.tool.listSeparator)}</p>
        </div>
      ) : null}
      <div>
        <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>{L.ui.formsHeading}</h2>
        {fo.forms?.length ? (
          <>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {fo.forms.map((f) => (
                <li key={f.form}>{fill(L.tool.formLine, { form: L.form[f.form], evidence: f.evidence }).replace(/^- /, "")}</li>
              ))}
            </ul>
            <p style={{ margin: "6px 0 0", color: "#92400e" }}>{fill(L.tool.formsCaveat, { caveat: fo.forms[0].caveat })}</p>
          </>
        ) : (
          <p style={{ margin: 0 }}>{fo.formsNote}</p>
        )}
      </div>
      {fo.implicit ? (
        <div>
          <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>{L.ui.implicitHeading}</h2>
          <p style={{ margin: 0 }}>{fill(L.tool.exactImplicit, { levels: fo.implicit.levels.length, deviation: fo.implicit.pathDeviation.toExponential(1) })}</p>
        </div>
      ) : null}
    </section>
  );
}

const labelStyle = { display: "grid", gap: 4, color: "#1f2933" } as const;
const inputStyle = { padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6, font: "inherit" } as const;
const buttonStyle = { padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, background: "#f9fafb", cursor: "pointer", font: "inherit" } as const;
