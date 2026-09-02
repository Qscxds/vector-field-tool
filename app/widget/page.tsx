"use client";

/**
 * Widget shell: the page an MCP host (Claude) renders inside a sandboxed iframe after a tool call.
 * It receives the tool result over the MCP Apps protocol, reads the Scene out of
 * structuredContent and hands it to the shared VectorFieldCanvas. Static rendering only for now
 * (no click-to-trace inside the widget); no math here and no knowledge of who the host is.
 * Text comes from lib/labels in the locale the tool was called with.
 */
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import { useEffect, useRef, useState } from "react";
import { VectorFieldCanvas } from "@/components/VectorFieldCanvas";
import { fill, formatEigenvalue, formatNumber, formatPoint, labels, localeFromLanguageTag, type Locale } from "@/lib/labels";
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

export default function WidgetPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [scene, setScene] = useState<Scene | null>(null);
  const [fallbackText, setFallbackText] = useState<string>("");
  const [isError, setIsError] = useState(false);
  const [browserLocale, setBrowserLocale] = useState<Locale>("en");
  const { ref, width } = useContainerWidth<HTMLDivElement>(640);

  useEffect(() => {
    setBrowserLocale(localeFromLanguageTag(typeof navigator !== "undefined" ? navigator.language : undefined));
  }, []);

  const { isConnected, error } = useApp({
    appInfo: { name: "vector-field-tool-widget", version: "0.2.0" },
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
        setPhase("result");
      };
    },
  });

  const L = labels(scene?.locale ?? browserLocale);
  const canvasHeight = Math.round(width * 0.68);

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
      ) : scene?.box ? (
        <>
          <VectorFieldCanvas scene={scene} width={width} height={canvasHeight} />
          <SceneSummary scene={scene} />
        </>
      ) : (
        <pre style={preStyle}>{fallbackText}</pre>
      )}
    </main>
  );
}

function SceneSummary({ scene }: { scene: Scene }) {
  const L = labels(scene.locale ?? "en");
  const items: string[] = [];
  if (scene.system) {
    items.push(scene.kind === "analyze_first_order" && scene.firstOrder ? scene.firstOrder.expr : `x' = ${scene.system.f}, y' = ${scene.system.g}`);
  }
  if (scene.field?.singularCount) items.push(fill(L.ui.singularNote, { count: scene.field.singularCount }));
  if (scene.warning) items.push(L.warning[scene.warning]);
  for (const t of scene.trajectories ?? []) {
    items.push(`${t.direction === "forward" ? L.tool.forward : L.tool.backward}: ${fill(L.ui.toward, { t: formatNumber(t.tEnd, 2), status: L.status[t.status] })}`);
  }
  const fo = scene.firstOrder;
  if (fo) {
    if (fo.solutions.length === 0) items.push(fo.autonomous ? L.tool.noConstantAutonomous : L.tool.noConstantGeneral);
    for (const s of fo.solutions) items.push(fill(L.tool.constantSolution, { y: formatNumber(s.y, 6), stability: L.stability[s.stability] }));
    if (fo.singularities?.length) {
      items.push(fill(L.tool.directionSingular, { points: fo.singularities.map((p) => formatPoint(p)).join(L.tool.listSeparator), truncated: "" }));
    }
    if (fo.forms?.length) {
      items.push(L.tool.formsHeader);
      for (const f of fo.forms) items.push(fill(L.tool.formLine, { form: L.form[f.form], evidence: f.evidence }));
      items.push(fill(L.tool.formsCaveat, { caveat: fo.forms[0].caveat }));
    } else if (fo.formsNote) {
      items.push(fo.formsNote);
    }
    if (fo.implicit) items.push(fill(L.tool.exactImplicit, { levels: fo.implicit.levels.length, deviation: fo.implicit.pathDeviation.toExponential(1) }));
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
