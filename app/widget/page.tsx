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
import { useInteractiveScene } from "@/components/useInteractiveScene";
import { VectorFieldCanvas } from "@/components/VectorFieldCanvas";
import { reportedForms } from "@/lib/core/detect-form";
import { compileSystem, type CompiledSystem } from "@/lib/core/parse";
import { fill, formatEigenvalue, formatNumber, formatPoint, labels, localeFromLanguageTag, uniquenessSentence, type Locale } from "@/lib/labels";
import { groupTrajectories, trajectoryLines } from "@/lib/labels-trajectory";
import type { Scene, SceneKind } from "@/lib/scene";

const KINDS: ReadonlySet<string> = new Set<SceneKind>(["ping", "sample_field", "analyze_system", "trace_trajectory", "analyze_first_order"]);

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
  const [browserLocale, setBrowserLocale] = useState<Locale>("en");
  // Counts tool results so a new result with the same equation still resets trajectories and previews.
  const [resultSeq, setResultSeq] = useState(0);
  const { ref, width } = useContainerWidth<HTMLDivElement>(640);

  useEffect(() => {
    setBrowserLocale(localeFromLanguageTag(typeof navigator !== "undefined" ? navigator.language : undefined));
  }, []);

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

  const locale = scene?.locale ?? browserLocale;
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
    // The tool's snapshot time (its t parameter) is the instant the widget keeps showing.
    snapshotT: scene?.timeDependent?.snapshotT ?? 0,
  });

  const live = interactive.scene && interactive.viewport ? interactive : null;

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
            {...live.handlers}
          />
          <p style={{ margin: "4px 0 0", color: "#52606d", fontSize: 11 }} data-shown-range>
            {fill(L.ui.shownRange, {
              hv: horizontalName(live.scene),
              xMin: formatNumber(live.viewport.box.x.min, 3),
              xMax: formatNumber(live.viewport.box.x.max, 3),
              yMin: formatNumber(live.viewport.box.y.min, 3),
              yMax: formatNumber(live.viewport.box.y.max, 3),
            })}{" "}
            · {L.ui.interactionHint}
          </p>
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
  const items: string[] = [];
  // Non-autonomous: the snapshot note replaces the features-box line (nothing was computed for a range).
  if (scene.timeDependent) items.push(fill(L.ui.timeDependentNote, { t: formatNumber(scene.timeDependent.snapshotT, 4) }));
  if (scene.box && !scene.timeDependent && (scene.kind === "analyze_system" || scene.kind === "analyze_first_order")) {
    const fb = scene.featuresBox ?? scene.box;
    items.push(
      fill(L.ui.featuresBox, {
        hv: horizontalName(scene),
        xMin: formatNumber(fb.x.min, 3),
        xMax: formatNumber(fb.x.max, 3),
        yMin: formatNumber(fb.y.min, 3),
        yMax: formatNumber(fb.y.max, 3),
      }),
    );
  }
  // A second-order scene shows the reduction step (the equation the student gave, then x' = y, y' = g).
  if (scene.secondOrder) items.push(fill(L.tool.secondOrderReduced, { equation: scene.secondOrder.equation, g: scene.secondOrder.reduced.g }));
  if (scene.system) {
    items.push(scene.kind === "analyze_first_order" && scene.firstOrder ? scene.firstOrder.expr : `x' = ${scene.system.f}, y' = ${scene.system.g}`);
  }
  if (scene.field?.singularCount) items.push(fill(L.ui.singularNote, { count: scene.field.singularCount }));
  if (scene.warning) items.push(L.warning[scene.warning]);
  if (scene.truncated) items.push(fill(L.ui.equilibriaTruncated, { max: scene.equilibria?.length ?? 0 }));
  for (const s of scene.singularPoints ?? []) items.push(fill(L.tool.singularPoint, { point: formatPoint(s) }));
  // Mode-aware (planar / explicit first order / differential form): see lib/labels-trajectory.
  for (const group of groupTrajectories(scene.trajectories ?? [])) items.push(...trajectoryLines(scene, group, L));
  const fo = scene.firstOrder;
  if (fo) {
    if (fo.solutions.length === 0) items.push(fo.autonomous ? L.tool.noConstantAutonomous : L.tool.noConstantGeneral);
    for (const s of fo.solutions) {
      items.push(fill(L.tool.constantSolution, { y: formatNumber(s.y, 6), stability: L.stability[s.stability] }));
      // Uniqueness right under its line; silent for a bounded result.
      const uniqueness = uniquenessSentence(L, s.uniqueness, { y: s.y });
      if (uniqueness) items.push(uniqueness);
    }
    if (fo.singularities?.length) {
      items.push(fill(L.tool.directionSingular, { points: fo.singularities.map((p) => formatPoint(p)).join(L.tool.listSeparator), truncated: fo.singularitiesTruncated ? L.tool.truncated : "" }));
      if (fo.singularitiesTruncated) items.push(fill(L.ui.singularitiesTruncated, { max: fo.singularities.length }));
    }
    const all = fo.forms ?? [];
    const reported = reportedForms(all);
    if (reported.length) {
      items.push(L.tool.formsHeader);
      for (const f of reported) items.push(fill(f.verdict === "consistent" ? L.tool.formLine : L.tool.formBorderlineLine, { form: L.form[f.form], evidence: f.evidence }));
      const consistent = reported.find((f) => f.verdict === "consistent");
      const borderline = reported.find((f) => f.verdict === "borderline");
      if (consistent) items.push(fill(L.tool.formsCaveat, { caveat: consistent.caveat }));
      if (borderline) items.push(fill(L.tool.formsCaveat, { caveat: borderline.caveat }));
    } else if (fo.formsNote) {
      items.push(fo.formsNote);
    }
    const rejected = all.filter((f) => f.verdict === "inconsistent");
    if (rejected.length) {
      items.push(fill(L.tool.formsInconsistentLine, { list: rejected.map((f) => `${L.form[f.form]}${L.tool.parenOpen}${f.maxRelDeviation === null || !Number.isFinite(f.maxRelDeviation) ? "—" : f.maxRelDeviation.toExponential(1)}${L.tool.parenClose}`).join(L.tool.listSeparator) }));
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
      {items.map((line, i) => (
        <p key={i} style={{ margin: "2px 0", color: "#52606d" }}>
          {line}
        </p>
      ))}
      {scene.equilibria && scene.equilibria.length > 0 ? (
        <ol style={{ margin: "4px 0 0", paddingLeft: 18 }}>
          {scene.equilibria.map((p, i) => (
            <li key={i} style={{ margin: "2px 0" }}>
              <strong>{formatPoint(p.at)}</strong> {L.classification[p.classification]}; λ = {p.eigenvalues.map((e) => formatEigenvalue(e)).join(", ") || L.tool.eigenvaluesUnavailable}
              {p.caveat ? <span style={{ color: "#92400e" }}> {L.caveat[p.caveat]}</span> : null}
              {uniquenessSentence(L, p.uniqueness, { point: p.at }) ? <span style={{ color: "#92400e" }}> {uniquenessSentence(L, p.uniqueness, { point: p.at })}</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

const preStyle = {
  margin: 0,
  padding: 10,
  background: "#f5f7fa",
  border: "1px solid #e4e7eb",
  borderRadius: 6,
  overflowX: "auto",
  whiteSpace: "pre-wrap",
} as const;
