"use client";

/**
 * The interaction model shared by the web shell and the MCP widget: a viewport over a "home" box
 * (equal-scale by default; `equalScale: false` fills the canvas with the box as entered),
 * cursor-anchored wheel zoom, drag pan, double-click reset, the field re-sampled for
 * every view, equilibria / first-order features recomputed after a pause, a hover preview of the
 * solution through the cursor (rAF-throttled, step-budgeted, skipped near singular points) and
 * click-to-keep trajectories. All mathematics goes through lib/interactive.
 *
 * Features box rule: at the HOME view (view === null, not zoomed or panned) the features are
 * computed for the home box, the entered range, in BOTH equal-scale modes, so flipping the toggle
 * or opening the same link on a canvas of another aspect ratio never changes which equilibria /
 * constant solutions / forms are listed; the equal-scale margin only carries field arrows. After a
 * zoom or pan the features box is the visible box (after FEATURE_DEBOUNCE_MS). Scene.featuresBox
 * carries the box used, so the shells' "computed for the range ..." line stays exact.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CompiledSystem } from "@/lib/core/parse";
import type { FirstOrderSpec } from "@/lib/core/slope-field";
import type { Box, Locale, SystemSpec, Vec2 } from "@/lib/core/types";
import { computeFeatures, FEATURE_DEBOUNCE_MS, featuresBoxFor, HOVER_PIXEL_THRESHOLD, SINGULAR_PIXEL_RADIUS, traceFixed, tracePreview, type Features } from "@/lib/interactive";
import { labels } from "@/lib/labels";
import { sampleField } from "@/lib/core/field";
import { fitViewport, panBy, worldToScreen, zoomAt, type Viewport } from "@/lib/render/viewport";
import type { FieldStyle, Scene, SceneKind, TrajectoryView } from "@/lib/scene";

export type InteractiveInput = {
  /** Compiled system, or null when nothing can be drawn (parse error, no scene yet, compile blocked). */
  sys: CompiledSystem | null;
  spec: SystemSpec | null;
  /** The first-order equation behind `sys`, when there is one. */
  firstOrder: FirstOrderSpec | null;
  /** The entered / requested box: the view double-click returns to. */
  homeBox: Box | null;
  width: number;
  height: number;
  density: number;
  locale: Locale;
  kind: SceneKind;
  fieldStyle: FieldStyle;
  /** Changing this string discards trajectories and the hover preview (a different equation). */
  systemKey: string;
  /** Trajectories that came with the scene (trace_trajectory); kept until the system changes. */
  initialTrajectories?: TrajectoryView[];
  start?: Vec2;
  /** Whether equilibria & co. are recomputed for the visible box (false for sample_field / trace_trajectory). */
  withFeatures: boolean;
  /**
   * Same pixels per unit on both axes (default true). false fills the canvas with the home box
   * exactly (pixel scales differ); changing it resets the view like a home-box change.
   */
  equalScale?: boolean;
};

export type InteractiveHandlers = {
  onClickWorld: (p: Vec2) => void;
  onHoverWorld: (world: Vec2 | null, screen: Vec2 | null) => void;
  onWheelZoom: (screen: Vec2, factor: number) => void;
  onPan: (dx: number, dy: number) => void;
  onDoubleClick: () => void;
};

export type InteractiveScene = {
  scene: Scene | null;
  viewport: Viewport | null;
  overlay: TrajectoryView[];
  hint: { at: Vec2; text: string } | null;
  trajectories: TrajectoryView[];
  clearTrajectories: () => void;
  handlers: InteractiveHandlers;
};

export function useInteractiveScene(input: InteractiveInput): InteractiveScene {
  const { sys, spec, firstOrder, homeBox, width, height, density, locale, kind, fieldStyle, systemKey, initialTrajectories, start, withFeatures, equalScale = true } = input;

  const [view, setView] = useState<Viewport | null>(null);
  const [trajectories, setTrajectories] = useState<TrajectoryView[]>(initialTrajectories ?? []);
  const [overlay, setOverlay] = useState<TrajectoryView[]>([]);
  const [hint, setHint] = useState<{ at: Vec2; text: string } | null>(null);

  // Screen position of the last hover preview; declared here because the reset effect clears it.
  const lastHoverScreen = useRef<Vec2 | null>(null);

  const homeKey = homeBox ? JSON.stringify(homeBox) : "";
  useEffect(() => {
    // A new home box or a scale-mode change re-fits the view. The hover preview was computed with
    // the old metric (its on-screen length and stop box depend on the viewport), so drop it too.
    setView(null);
    lastHoverScreen.current = null;
    setOverlay([]);
    setHint(null);
  }, [homeKey, equalScale]);
  useEffect(() => {
    setTrajectories(initialTrajectories ?? []);
    setOverlay([]);
    setHint(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemKey]);

  const viewport = useMemo(
    () => (view && view.width === width && view.height === height ? view : homeBox ? fitViewport(homeBox, width, height, { equalScale }) : null),
    [view, homeBox, width, height, equalScale],
  );

  const field = useMemo(() => (sys && viewport ? sampleField(sys, viewport.box, density, density) : null), [sys, viewport, density]);

  const [featureBox, setFeatureBox] = useState<Box | null>(null);
  const viewBoxKey = viewport ? JSON.stringify(viewport.box) : "";
  // Home view (view === null): the entered range, at once. Zoomed or panned: the visible box, after
  // a pause. (homeBox can be null for one render while a compile error resets the view.)
  const targetFeatureBox = viewport ? (view === null && homeBox ? featuresBoxFor(homeBox, viewport.box, true) : viewport.box) : null;
  const targetFeatureBoxKey = targetFeatureBox ? JSON.stringify(targetFeatureBox) : "";
  useEffect(() => {
    if (!targetFeatureBox) return;
    const id = setTimeout(
      // Same box as before (the equal-scale toggle at the home view): keep the reference, so the
      // memoized features are not recomputed for an identical range.
      () => setFeatureBox((prev) => (prev && JSON.stringify(prev) === targetFeatureBoxKey ? prev : targetFeatureBox)),
      view ? FEATURE_DEBOUNCE_MS : 0,
    );
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewBoxKey, targetFeatureBoxKey]);
  const effectiveFeatureBox = featureBox ?? targetFeatureBox;
  const features = useMemo<Features>(
    () => (withFeatures && sys && effectiveFeatureBox ? computeFeatures(sys, firstOrder, effectiveFeatureBox, locale) : {}),
    [withFeatures, sys, firstOrder, effectiveFeatureBox, locale],
  );

  const scene = useMemo<Scene | null>(() => {
    if (!sys || !spec || !viewport || !field) return null;
    return {
      kind,
      locale,
      system: spec,
      box: viewport.box,
      featuresBox: effectiveFeatureBox ?? undefined,
      field,
      fieldStyle,
      equilibria: features.equilibria,
      warning: features.warning,
      truncated: features.truncated,
      firstOrder: features.firstOrder,
      trajectories,
      start,
    };
  }, [sys, spec, viewport, field, kind, locale, fieldStyle, features, trajectories, start, effectiveFeatureBox]);

  // Refs so the handlers stay referentially stable (the canvas binds its wheel listener once).
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const homeBoxRef = useRef(homeBox);
  homeBoxRef.current = homeBox;
  const sysRef = useRef(sys);
  sysRef.current = sys;
  const singularRef = useRef<Vec2[]>([]);
  singularRef.current = features.firstOrder?.singularities ?? [];
  const localeRef = useRef(locale);
  localeRef.current = locale;

  const hoverRef = useRef<{ world: Vec2; screen: Vec2 } | null>(null);
  const rafRef = useRef<number | null>(null);

  const onWheelZoom = useCallback((screen: Vec2, factor: number) => {
    const cur = viewportRef.current;
    const home = homeBoxRef.current;
    if (!cur || !home) return;
    setView(zoomAt(cur, screen, factor, { original: home }));
    // The preview under the cursor belongs to the old view; drop it and let the next move recompute.
    lastHoverScreen.current = null;
    setOverlay([]);
    setHint(null);
  }, []);

  const onPan = useCallback((dx: number, dy: number) => {
    const cur = viewportRef.current;
    if (!cur) return;
    setView(panBy(cur, dx, dy));
  }, []);

  const onDoubleClick = useCallback(() => setView(null), []);

  const onClickWorld = useCallback((p: Vec2) => {
    const s = sysRef.current;
    const home = homeBoxRef.current;
    if (!s || !home) return;
    // The curve's extent is the solution's business (20x the home box); the view only clips it.
    setTrajectories((prev) => [...prev, ...traceFixed(s, p, home)]);
  }, []);

  const onHoverWorld = useCallback((world: Vec2 | null, screen: Vec2 | null) => {
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
      const s = sysRef.current;
      const vp = viewportRef.current;
      if (!h || !s || !vp) return;
      const last = lastHoverScreen.current;
      if (last && Math.hypot(h.screen.x - last.x, h.screen.y - last.y) < HOVER_PIXEL_THRESHOLD) return;
      lastHoverScreen.current = h.screen;
      const nearSingular = singularRef.current.some((p) => {
        const q = worldToScreen(vp, p);
        return Math.hypot(q.x - h.screen.x, q.y - h.screen.y) < SINGULAR_PIXEL_RADIUS;
      });
      if (nearSingular) {
        setOverlay([]);
        setHint({ at: h.world, text: labels(localeRef.current).ui.hoverUndefined });
        return;
      }
      setHint(null);
      setOverlay(tracePreview(s, h.world, vp));
    });
  }, []);
  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const clearTrajectories = useCallback(() => setTrajectories([]), []);

  return {
    scene,
    viewport,
    overlay,
    hint,
    trajectories,
    clearTrajectories,
    handlers: { onClickWorld, onHoverWorld, onWheelZoom, onPan, onDoubleClick },
  };
}
