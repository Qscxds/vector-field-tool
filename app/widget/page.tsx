"use client";

/**
 * Widget shell: the page an MCP host (Claude) renders inside a sandboxed iframe after a tool call.
 * It receives the tool result over the MCP Apps protocol, reads the Scene out of
 * structuredContent and hands it to the shared VectorFieldCanvas.
 *
 * The Scene carries the equation (scene.system / scene.firstOrder.spec), so the widget compiles it
 * locally with the same kernel the server used and offers zoom, pan, hover preview and
 * click-to-keep through the shared useInteractiveScene hook. If compiling is impossible in this
 * environment, it falls back to the server's static picture and says so. Text comes from
 * lib/labels in the locale the tool was called with. No knowledge of who the host is.
 */
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FoldedLine, Info } from "@/components/Info";
import { useInteractiveScene } from "@/components/useInteractiveScene";
import { VectorFieldCanvas } from "@/components/VectorFieldCanvas";
import { useCoarsePointer } from "@/components/useCoarsePointer";
import { reportedForms } from "@/lib/core/detect-form";
import { compileSystem, type CompiledSystem } from "@/lib/core/parse";
import { constantSolutionFolded, constantSolutionNotices, equilibriaNotices, equilibriumDetail, fill, formatEigenvalues, formFolded, formatNumber, formatPoint, labels, noConstantSentence, timeDependentFolded, type Folded, type Locale } from "@/lib/labels";
import { queryLines } from "@/lib/labels-query";
import { groupTrajectories, trajectoryLines } from "@/lib/labels-trajectory";
import type { Scene, SceneKind } from "@/lib/scene";
import { isUndoKey } from "@/lib/undo-key";

const KINDS: ReadonlySet<string> = new Set<SceneKind>(["ping", "sample_field", "analyze_system", "trace_trajectory", "analyze_first_order", "query_solution"]);

function asScene(value: unknown): Scene | null {
  if (!value || typeof value !== "object") return null;
  const kind = (value as { kind?: unknown }).kind;
  return typeof kind === "string" && KINDS.has(kind) ? (value as Scene) : null;
}

type Phase = "idle" | "input" | "result";

/**
 * Width of the widget's content area, so the canvas fills whatever the host gives us.
 * Measured on a padding-free wrapper (so the canvas never overflows horizontally) and only
 * re-applied for changes of 4px or more: the host resizes the iframe from our size-changed
 * notifications, and reacting to every sub-pixel wobble would feed that loop.
 */
function useContainerWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const measured = Math.floor(el.getBoundingClientRect().width);
      if (measured <= 0) return;
      const next = Math.max(320, Math.min(760, measured));
      setWidth((prev) => (Math.abs(prev - next) < 4 ? prev : next));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** Compiles the scene's equation locally; `blocked` means the environment refused (CSP, missing API). */
function useLocalSystem(scene: Scene | null): { sys: CompiledSystem | null; blocked: boolean } {
  return useMemo(() => {
    if (!scene?.system || !scene.box) return { sys: null, blocked: false };
    try {
      return { sys: compileSystem(scene.system), blocked: false };
    } catch {
      return { sys: null, blocked: true };
    }
  }, [scene]);
}

export default function WidgetPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [scene, setScene] = useState<Scene | null>(null);
  const [fallbackText, setFallbackText] = useState<string>("");
  const [isError, setIsError] = useState(false);
  const coarsePointer = useCoarsePointer();
  // Counts tool results so a new result with the same equation still resets trajectories and previews.
  const [resultSeq, setResultSeq] = useState(0);
  // Same pixels per unit on both axes (the web shell's toggle); off fills the canvas with the tool's box.
  const [equalScale, setEqualScale] = useState(true);
  const { ref, width } = useContainerWidth<HTMLDivElement>(640);

  const { isConnected, error } = useApp({
    appInfo: { name: "vector-field-tool-widget", version: "0.3.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.ontoolinput = () => setPhase("input");
      app.ontoolresult = (result) => {
        const next = asScene(result.structuredContent);
        setScene(next);
        setIsError(result.isError === true);
        const texts = (result.content ?? [])
          .filter((c): c is { type: "text"; text: string } => c.type === "text")
          .map((c) => c.text);
        setFallbackText(texts.join("\n") || JSON.stringify(result.structuredContent ?? result, null, 2));
        setResultSeq((n) => n + 1);
        setPhase("result");
      };
    },
  });

  // The tool's locale wins; before the first result (and for a Scene without one) English.
  const locale: Locale = scene?.locale ?? "en";
  const L = labels(locale);
  const canvasHeight = Math.round(width * 0.68);
  const local = useLocalSystem(scene);
  const kind: SceneKind = scene && scene.kind !== "ping" ? scene.kind : "sample_field";
  const interactive = useInteractiveScene({
    sys: local.sys,
    spec: scene?.system ?? null,
    firstOrder: scene?.firstOrder?.spec ?? null,
    homeBox: scene?.box ?? null,
    width,
    height: canvasHeight,
    density: scene?.field?.nx ?? 20,
    locale,
    kind,
    fieldStyle: scene?.fieldStyle ?? "arrows",
    systemKey: scene ? `${resultSeq}|${scene.kind}|${scene.system?.variables ?? "xy"}|${scene.system?.f ?? ""}|${scene.system?.g ?? ""}|${JSON.stringify(scene.start ?? null)}|${JSON.stringify(scene.system?.params ?? null)}|${scene.timeDependent?.snapshotT ?? 0}` : "",
    initialTrajectories: scene?.trajectories,
    start: scene?.start,
    withFeatures: kind === "analyze_system" || kind === "analyze_first_order",
    equalScale,
    // The tool's snapshot time (its t parameter) is the instant the widget keeps showing.
    snapshotT: scene?.timeDependent?.snapshotT ?? 0,
    // query_solution: the hits stay marked on the live picture (and listed by SceneSummary).
    query: scene?.query,
  });

  const live = interactive.scene && interactive.viewport ? interactive : null;

  // Ctrl+Z / Cmd+Z undoes the last trajectory action (the web shell's rule, lib/undo-key), unless
  // the focus is in a field. The iframe only sees the keys while it has focus.
  const undoRef = useRef(interactive.undo);
  undoRef.current = interactive.undo;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isUndoKey(event)) return;
      event.preventDefault();
      undoRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main style={{ padding: "8px 10px 10px", fontSize: 13, lineHeight: 1.45, color: "#1f2933", background: "#fff" }}>
      {/* The host sizes the iframe from our size-changed notifications; scrollbars inside the widget
          would change the available width and start a resize oscillation. */}
      <style>{"html, body { overflow: hidden; }"}</style>
      <div ref={ref} style={{ width: "100%" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span
          aria-hidden
          style={{ width: 9, height: 9, borderRadius: "50%", background: isConnected ? "#22a06b" : "#c9ced6", display: "inline-block" }}
        />
        <strong>vector-field-tool</strong>
        <span style={{ color: "#52606d" }}>
          {isConnected ? (phase === "idle" ? L.ui.connectedWaiting : phase === "input" ? L.ui.computing : L.ui.connected) : L.ui.notConnected}
        </span>
      </div>

      {error ? <p style={{ color: "#b42318", margin: "0 0 6px" }}>Error: {error.message}</p> : null}

      {!isConnected ? (
        <p style={{ color: "#52606d", margin: 0 }}>{L.ui.notRenderedByHost}</p>
      ) : phase !== "result" ? null : isError ? (
        <pre style={preStyle}>{fallbackText}</pre>
      ) : scene?.kind === "ping" ? (
        <pre style={preStyle}>{JSON.stringify({ message: scene.message }, null, 2)}</pre>
      ) : live && live.scene && live.viewport ? (
        <>
          <VectorFieldCanvas
            scene={live.scene}
            viewport={live.viewport}
            width={width}
            height={canvasHeight}
            overlay={live.overlay}
            overlayHint={live.hint}
            // Hover feedback on a kept curve (Phase N): the highlighted pair and the pointer cursor.
            highlight={live.highlight}
            cursor={live.cursor}
            {...live.handlers}
          />
          {/* Persistent while the toggle is off (never a timed toast): the picture's angles are not slopes. */}
          {!equalScale ? (
            <p role="status" data-scale-warning style={{ margin: "4px 0 0", color: "#92400e", fontSize: 12 }}>
              {L.ui.equalScaleWarning}
            </p>
          ) : null}
          <p style={{ margin: "4px 0 0", color: "#52606d", fontSize: 11 }} data-shown-range>
            {fill(equalScale ? L.ui.shownRangeEqual : L.ui.shownRangeFilled, {
              hv: horizontalName(live.scene),
              xMin: formatNumber(live.viewport.box.x.min, 3),
              xMax: formatNumber(live.viewport.box.x.max, 3),
              yMin: formatNumber(live.viewport.box.y.min, 3),
              yMax: formatNumber(live.viewport.box.y.max, 3),
            })}{" "}
            · {coarsePointer ? L.ui.interactionHintTouch : L.ui.interactionHint}
          </p>
          <div style={{ margin: "4px 0 0", color: "#52606d", fontSize: 11 }}>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={equalScale} onChange={(e) => setEqualScale(e.target.checked)} name="equalScale" />
              <span>{L.ui.equalScale}</span>
            </label>{" "}
            <Info label={L.ui.details} data-info="equal-scale">
              {fill(L.ui.equalScaleDetail, { hv: horizontalName(live.scene) })}
            </Info>
          </div>
          {/* Undo the last trajectory action (a click that kept or removed a curve), as in the web shell. */}
          <div style={{ margin: "4px 0 0" }}>
            <button type="button" onClick={live.undo} disabled={!live.canUndo} data-undo title="Ctrl+Z" style={buttonStyle}>
              {L.ui.undo}
            </button>
          </div>
          {live.overlay.some((t) => t.nonUnique) ? (
            <p role="status" data-non-unique-preview style={{ margin: "4px 0 0", color: "#92400e", fontSize: 12 }}>
              {L.ui.nonUniqueTrajectory}
            </p>
          ) : null}
          <SceneSummary scene={live.scene} />
        </>
      ) : scene?.box ? (
        <>
          <VectorFieldCanvas scene={scene} width={width} height={canvasHeight} />
          {local.blocked ? <p style={{ margin: "4px 0 0", color: "#92400e", fontSize: 12 }}>{L.ui.localComputeUnavailable}</p> : null}
          <SceneSummary scene={scene} />
        </>
      ) : (
        <pre style={preStyle}>{fallbackText}</pre>
      )}
    </main>
  );
}

/** Student-facing name of the horizontal coordinate: t for first-order scenes (system.variables "ty"), else x. */
function horizontalName(scene: Scene): "x" | "t" {
  return scene.system?.variables === "ty" ? "t" : "x";
}

function SceneSummary({ scene }: { scene: Scene }) {
  const L = labels(scene.locale ?? "en");
  // Every line is a short text with optional detail behind the info toggle (display only: the
  // Scene and the tool summary keep the full sentences).
  const items: (string | Folded)[] = [];
  // Non-autonomous: the snapshot note replaces the features-box line (nothing was computed for a range).
  if (scene.timeDependent) items.push(timeDependentFolded(L, scene.timeDependent.snapshotT));
  const fb = scene.box && !scene.timeDependent && (scene.kind === "analyze_system" || scene.kind === "analyze_first_order") ? scene.featuresBox ?? scene.box : null;
  const featuresBoxLine = fb
    ? fill(L.ui.featuresBox, { hv: horizontalName(scene), xMin: formatNumber(fb.x.min, 3), xMax: formatNumber(fb.x.max, 3), yMin: formatNumber(fb.y.min, 3), yMax: formatNumber(fb.y.max, 3) })
    : null;
  // A second-order scene shows the reduction step (the equation the student gave, then x' = y, y' = g).
  if (scene.secondOrder) items.push(fill(L.tool.secondOrderReduced, { equation: scene.secondOrder.equation, g: scene.secondOrder.reduced.g }));
  if (scene.system) {
    items.push(scene.kind === "analyze_first_order" && scene.firstOrder ? scene.firstOrder.expr : `x' = ${scene.system.f}, y' = ${scene.system.g}`);
  }
  if (scene.field?.singularCount) items.push(fill(L.ui.singularNote, { count: scene.field.singularCount }));
  items.push(...equilibriaNotices(L, scene));
  // Mode-aware (planar / explicit first order / differential form): see lib/labels-trajectory.
  for (const group of groupTrajectories(scene.trajectories ?? [])) items.push(...trajectoryLines(scene, group, L));
  // query_solution: the hits and the note (lib/labels-query), after the curve's status lines.
  items.push(...queryLines(scene, L));
  const fo = scene.firstOrder;
  if (fo) {
    if (fo.solutions.length === 0) items.push(noConstantSentence(L, fo.autonomous, fo.untestableReason, fo.identicallyZero));
    // Per line: the sentence, then the plateau / probe-count notes and the uniqueness sentence when
    // they apply; then the zero-plateau notice and the scan resolution.
    for (const s of fo.solutions) items.push(constantSolutionFolded(L, s, fo.spec));
    items.push(...constantSolutionNotices(L, fo));
    if (fo.singularities?.length) {
      // The truncation is stated once, by the singularitiesTruncated sentence below (as in tools.ts).
      items.push(fill(L.tool.directionSingular, { points: fo.singularities.map((p) => formatPoint(p)).join(L.tool.listSeparator), truncated: "" }));
      if (fo.singularitiesWarning === "possible_continuum") items.push(L.ui.singularitiesContinuum);
      if (fo.singularitiesTruncated) items.push(fill(L.ui.singularitiesTruncated, { max: fo.singularities.length }));
    }
    const all = fo.forms ?? [];
    const reported = reportedForms(all);
    if (reported.length) {
      items.push(L.tool.formsHeader);
      for (const f of reported) items.push(formFolded(L, f as { form: typeof f.form; verdict: "consistent" | "borderline"; evidence: string; caveat: string }));
    } else if (fo.formsNote) {
      items.push(fo.formsNote);
    }
    // A form ruled out by definition (Bernoulli with n = 0 or 1) is listed with its rule, not a deviation.
    const rejected = all.filter((f) => f.verdict === "inconsistent" && !f.excluded);
    if (rejected.length) {
      items.push(fill(L.tool.formsInconsistentLine, { list: rejected.map((f) => `${L.form[f.form]}${L.tool.parenOpen}${f.maxRelDeviation === null || !Number.isFinite(f.maxRelDeviation) ? "—" : f.maxRelDeviation.toExponential(1)}${L.tool.parenClose}`).join(L.tool.listSeparator) }));
    }
    const excluded = all.filter((f) => f.excluded);
    if (excluded.length) {
      items.push(fill(L.tool.formsExcludedLine, { list: excluded.map((f) => `${L.form[f.form]}${L.tool.parenOpen}${f.reason ?? ""}${L.tool.parenClose}`).join(L.tool.listSeparator) }));
    }
    const untestable = all.filter((f) => f.verdict === "untestable");
    if (untestable.length) items.push(fill(L.tool.formsUntestableLine, { list: untestable.map((f) => L.form[f.form]).join(L.tool.listSeparator) }));
    if (fo.implicit) items.push(fill(L.tool.exactImplicit, { levels: fo.implicit.levels.length, deviation: fo.implicit.pathDeviation.toExponential(1) }));
    else if (fo.implicitCheck && !fo.implicitCheck.passed) {
      items.push(fill(L.tool.exactPathCheckFailed, { deviation: Number.isFinite(fo.implicitCheck.pathDeviation) ? fo.implicitCheck.pathDeviation.toExponential(1) : "∞", tol: fo.implicitCheck.tol.toExponential(0) }));
    }
  }

  return (
    <div style={{ marginTop: 6 }}>
      {featuresBoxLine ? (
        <p style={{ margin: "2px 0", color: "#52606d" }} data-features-box>
          {featuresBoxLine}{" "}
          <Info label={L.ui.details} data-info="features-box">
            {L.ui.featuresBoxDetail}
          </Info>
        </p>
      ) : null}
      {items.map((line, i) => (
        <p key={i} style={{ margin: "2px 0", color: "#52606d" }}>
          {typeof line === "string" ? line : <FoldedLine {...line} label={L.ui.details} data-info="summary" />}
        </p>
      ))}
      {scene.equilibria && scene.equilibria.length > 0 ? (
        <ol style={{ margin: "4px 0 0", paddingLeft: 18 }}>
          {scene.equilibria.map((p, i) => (
            <li key={i} style={{ margin: "2px 0" }} data-caveat={p.caveat ?? undefined} data-uniqueness={p.uniqueness?.verdict}>
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
      ) : null}
    </div>
  );
}

const buttonStyle = {
  font: "inherit",
  fontSize: 12,
  padding: "3px 10px",
  border: "1px solid #c9ced6",
  borderRadius: 4,
  background: "#f5f7fa",
  color: "#1f2933",
  cursor: "pointer",
} as const;

const preStyle = {
  margin: 0,
  padding: 10,
  background: "#f5f7fa",
  border: "1px solid #e4e7eb",
  borderRadius: 6,
  overflowX: "auto",
  whiteSpace: "pre-wrap",
} as const;
