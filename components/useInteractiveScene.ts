"use client";

/**
 * The interaction model shared by the web shell and the MCP widget: a viewport over a "home" box
 * (equal-scale by default; `equalScale: false` fills the canvas with the box as entered),
 * cursor-anchored wheel zoom, drag pan, double-click reset, the field re-sampled for
 * every view, equilibria / first-order features recomputed after a pause, a hover preview of the
 * solution through the cursor (rAF-throttled, step-budgeted, skipped near singular points) and
 * click-to-keep trajectories. All mathematics goes through lib/interactive.
 *
 * Kept trajectories live in ONE pure store (lib/trajectory-store): the start points are the single
 * source of truth (the link's `traj`), the curves are derived from them, and add / delete / clear
 * are undoable. A click within HIT_THRESHOLD_PX (screen pixels, lib/trajectory-hit) of a kept
 * curve removes that pair instead of adding one; hovering such a curve highlights it. A
 * `systemKey` change (or a new seed array) resets the store to the seeds; a `retraceKey` change
 * (the web shell's snapshot time) re-traces whatever starts the store holds, so a start the
 * student cleared or deleted never comes back.
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
import { detectTimeDependence } from "@/lib/core/time-dependence";
import type { Box, Locale, SystemSpec, Vec2 } from "@/lib/core/types";
import { computeFeatures, FEATURE_DEBOUNCE_MS, featuresBoxFor, HOVER_PIXEL_THRESHOLD, markNonUnique, SINGULAR_PIXEL_RADIUS, traceFixed, tracePreview, type Features, type NonUniqueProbe } from "@/lib/interactive";
import { labels } from "@/lib/labels";
import { sampleField } from "@/lib/core/field";
import { fitViewport, panBy, pinchAt, worldToScreen, zoomAt, type Viewport } from "@/lib/render/viewport";
import type { FieldStyle, QueryView, Scene, SceneKind, TrajectoryView } from "@/lib/scene";
import { clickAction, nearestFixedTrajectory } from "@/lib/trajectory-hit";
import {
  addTrajectory as addToStore,
  canUndo as storeCanUndo,
  clearTrajectories as clearStore,
  deleteTrajectory as deleteFromStore,
  EMPTY_TRAJECTORY_STORE,
  resetTrajectories,
  retraceTrajectories,
  trajectoriesOf,
  trajectoryStartsOf,
  undoTrajectory,
  type TrajectoryStore,
} from "@/lib/trajectory-store";

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
  /**
   * Starts of fixed trajectories (a link's traj, a preset's starts): traced with traceFixed from
   * the displayed snapshot time on mount, whenever `systemKey` changes, and whenever the shell
   * passes a NEW array (identity, not content: keep it in state and hand over a fresh array, e.g.
   * `[]` on an equation edit). Ignored when `initialTrajectories` is given. Clicked points are
   * added to them and clicks on them remove them; see `trajectoryStarts`.
   */
  initialTrajectoryStarts?: Vec2[];
  /**
   * Changing this string keeps the CURRENT starts (seeds plus clicks minus deletions, the undo
   * history too) and re-traces their curves, unlike `systemKey`, which resets to the seeds. The
   * web shell keys it on the snapshot time: the same initial points at another instant.
   */
  retraceKey?: string;
  start?: Vec2;
  /** Whether equilibria & co. are recomputed for the visible box (false for sample_field / trace_trajectory). */
  withFeatures: boolean;
  /**
   * Same pixels per unit on both axes (default true). false fills the canvas with the home box
   * exactly (pixel scales differ); changing it resets the view like a home-box change.
   */
  equalScale?: boolean;
  /**
   * Snapshot time of a non-autonomous system (default 0): the field is sampled at this t, and
   * hover previews and clicked curves start at it, so the curve shown is the solution through the
   * clicked point AT the displayed instant. Ignored by an autonomous system. Put it in `systemKey`
   * (the curves of the previous instant are dropped) or in `retraceKey` (re-traced from the same
   * starts) so that the picture never shows curves of another instant.
   */
  snapshotT?: number;
  /**
   * A solution query's result to draw (Scene.query: markers at the hits, lib/core/query): the
   * widget passes the tool's, the web shell the one its query panel computed. Data only.
   */
  query?: QueryView;
  /**
   * The start of the kept trajectory `query` was asked about (web shell): the query is drawn only
   * while a kept trajectory still starts there, so a deleted or cleared curve takes its markers
   * with it. Omit (widget) to draw `query` unconditionally.
   */
  queryStart?: Vec2;
  /**
   * The reduction of a second-order equation (Scene.secondOrder, analyze_second_order): carried
   * into the live Scene unchanged so the widget's summary keeps the reduction line. Data only.
   */
  secondOrder?: Scene["secondOrder"];
};

export type InteractiveHandlers = {
  /** A click or a touch long press: removes the kept pair within HIT_THRESHOLD_PX of the point, else keeps the solution through it. */
  onClickWorld: (p: Vec2) => void;
  /** `touch` marks a finger's tap (the hint over a removable curve then says "hold", not "click"). */
  onHoverWorld: (world: Vec2 | null, screen: Vec2 | null, touch?: boolean) => void;
  onWheelZoom: (screen: Vec2, factor: number) => void;
  onPan: (dx: number, dy: number) => void;
  /** One touch pinch step as one viewport update (see pinchAt). */
  onPinch: (from: Vec2, to: Vec2, factor: number) => void;
  onDoubleClick: () => void;
};

export type InteractiveScene = {
  scene: Scene | null;
  viewport: Viewport | null;
  overlay: TrajectoryView[];
  hint: { at: Vec2; text: string } | null;
  trajectories: TrajectoryView[];
  /** Where the kept trajectories start (initial starts + clicked points, in order), so a shell can encode them. */
  trajectoryStarts: Vec2[];
  /** The kept pair under the pointer (a click would remove it), drawn emphasized on the overlay; empty otherwise. */
  highlight: TrajectoryView[];
  /** Cursor for the canvas while a removable curve is under the pointer. */
  cursor: "pointer" | undefined;
  /** Keeps the solution through `p` exactly as a click on empty canvas does (same trace, same undo entry). */
  addTrajectory: (p: Vec2) => void;
  /** Removes the kept pair at `index` (the start's index); undoable. */
  deleteTrajectory: (index: number) => void;
  /** Drops every kept pair as ONE undoable action. */
  clearTrajectories: () => void;
  undo: () => void;
  canUndo: boolean;
  handlers: InteractiveHandlers;
};

export function useInteractiveScene(input: InteractiveInput): InteractiveScene {
  const { sys, spec, firstOrder, homeBox, width, height, density, locale, kind, fieldStyle, systemKey, initialTrajectories, initialTrajectoryStarts, retraceKey = "", start, withFeatures, equalScale = true, snapshotT = 0, query, queryStart, secondOrder } = input;

  const [view, setView] = useState<Viewport | null>(null);
  // Curves that came with the scene (the widget's trace_trajectory result): drawn and cleared with
  // the kept ones, but they have no start of their own, so they are neither removable nor undoable.
  const [external, setExternal] = useState<TrajectoryView[]>(initialTrajectories ?? []);
  const [store, setStore] = useState<TrajectoryStore>(EMPTY_TRAJECTORY_STORE);
  const [hoverTarget, setHoverTarget] = useState<number | null>(null);
  const [overlay, setOverlay] = useState<TrajectoryView[]>([]);
  const [hint, setHint] = useState<{ at: Vec2; text: string } | null>(null);
  const trajectories = useMemo(() => (external.length ? [...external, ...trajectoriesOf(store)] : trajectoriesOf(store)), [external, store]);
  const trajectoryStarts = useMemo(() => trajectoryStartsOf(store), [store]);
  const queryShown = useMemo(
    () => (query && (!queryStart || trajectoryStarts.some((s) => s.x === queryStart.x && s.y === queryStart.y)) ? query : undefined),
    [query, queryStart, trajectoryStarts],
  );

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

  const viewport = useMemo(
    () => (view && view.width === width && view.height === height ? view : homeBox ? fitViewport(homeBox, width, height, { equalScale }) : null),
    [view, homeBox, width, height, equalScale],
  );

  // The verdict is static (t appears in the equation), so zooming or panning can never flip it;
  // the probe's evidence is measured once on the ENTERED box, at the displayed snapshot time.
  // First-order specs are never time-dependent (their t is the horizontal coordinate).
  const timeDependence = useMemo(
    () => (sys && !firstOrder && homeBox ? detectTimeDependence(sys, homeBox, { snapshotT }) : null),
    [sys, firstOrder, homeBox, snapshotT],
  );
  const timeDependent = useMemo(
    () => (timeDependence?.dependsOnT ? { snapshotT, maxRelDeviation: timeDependence.maxRelDeviation } : undefined),
    [timeDependence, snapshotT],
  );

  const field = useMemo(() => (sys && viewport ? sampleField(sys, viewport.box, density, density, snapshotT) : null), [sys, viewport, density, snapshotT]);

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
    () =>
      withFeatures && sys && effectiveFeatureBox
        ? computeFeatures(sys, firstOrder, effectiveFeatureBox, locale, { snapshotT, ...(timeDependence ? { timeDependence } : {}) })
        : {},
    [withFeatures, sys, firstOrder, effectiveFeatureBox, locale, snapshotT, timeDependence],
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
      singularPoints: features.singularPoints,
      underflowPlateau: features.underflowPlateau,
      // The sign-change quadtree's cap (lib/interactive computeFeatures): the shells print the
      // same notice as the tool (equilibriaNotices).
      refineCapped: features.refineCapped,
      // Also for scenes without features (sample_field, trace_trajectory): the canvas labels the
      // snapshot time whenever the field changes with t.
      timeDependent,
      firstOrder: features.firstOrder,
      firstOrderSpec: firstOrder ?? undefined,
      trajectories,
      start,
      query: queryShown,
      secondOrder,
    };
  }, [sys, spec, viewport, field, kind, locale, fieldStyle, features, trajectories, start, effectiveFeatureBox, timeDependent, queryShown, secondOrder, firstOrder]);

  // Refs so the handlers stay referentially stable (the canvas binds its wheel listener once).
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const homeBoxRef = useRef(homeBox);
  homeBoxRef.current = homeBox;
  const sysRef = useRef(sys);
  sysRef.current = sys;
  const singularRef = useRef<Vec2[]>([]);
  singularRef.current = features.firstOrder?.singularities ?? [];
  // Constant solutions / equilibria with their uniqueness verdicts: a traced curve through one
  // where uniqueness fails is flagged (markNonUnique) so the shells can say so.
  const featuresRef = useRef<Features>(features);
  featuresRef.current = features;
  const localeRef = useRef(locale);
  localeRef.current = locale;
  // What markNonUnique needs to probe a traced curve's own extent (the flag follows the curve, not the box).
  const probeRef = useRef<NonUniqueProbe | null>(null);
  probeRef.current = sys ? { sys, firstOrder, timeDependent: Boolean(features.timeDependent) } : null;
  const snapshotTRef = useRef(snapshotT);
  snapshotTRef.current = snapshotT;

  const storeRef = useRef(store);
  storeRef.current = store;

  // The one rule for a kept curve: the solution through the start under the CURRENT system and
  // snapshot time, 20x the home box (traceFixed), flagged where uniqueness fails. Reads refs so
  // the handlers below stay referentially stable; nothing to draw without a system or a box.
  const traceNow = useCallback((p: Vec2): TrajectoryView[] => {
    const s = sysRef.current;
    const home = homeBoxRef.current;
    return s && home ? markNonUnique(traceFixed(s, p, home, snapshotTRef.current), featuresRef.current, home, probeRef.current ?? undefined) : [];
  }, []);

  const dropHoverState = () => {
    setHoverTarget(null);
    lastHoverScreen.current = null;
    setOverlay([]);
    setHint(null);
  };

  // A new system, or new seeds (a fresh array from the shell: a link, a preset, `[]` after an
  // equation edit): the kept curves belong to the old picture. Start over from the scene's own
  // trajectories, else from the seeds, traced by the same rule as a click.
  useEffect(() => {
    setExternal(initialTrajectories ?? []);
    setStore(resetTrajectories(initialTrajectories ? [] : (initialTrajectoryStarts ?? []), traceNow));
    dropHoverState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemKey, initialTrajectoryStarts]);

  // The same starts at another snapshot time: re-traced, never reset, so a start the student
  // cleared or deleted stays gone (the seed effect above already traced them on mount).
  const retraceMounted = useRef(false);
  useEffect(() => {
    if (!retraceMounted.current) {
      retraceMounted.current = true;
      return;
    }
    setStore((prev) => retraceTrajectories(prev, traceNow));
    dropHoverState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retraceKey]);

  const hoverRef = useRef<{ world: Vec2; screen: Vec2; touch: boolean } | null>(null);
  const rafRef = useRef<number | null>(null);

  // Viewport updates are FUNCTIONAL: two updates dispatched in the same event (a pinch used to be
  // a pan then a zoom) each build on the other's result, not on the stale viewportRef. The
  // previous state is trusted only when it belongs to the current canvas size; otherwise the
  // fitted viewport (viewportRef) is the base, exactly as the `viewport` memo decides.
  const baseView = (prev: Viewport | null): Viewport | null => {
    const cur = viewportRef.current;
    if (!cur) return null;
    return prev && prev.width === cur.width && prev.height === cur.height ? prev : cur;
  };
  const dropPreview = () => {
    // The preview under the cursor belongs to the old view; drop it and let the next move recompute.
    lastHoverScreen.current = null;
    setOverlay([]);
    setHint(null);
    setHoverTarget(null);
  };

  const onWheelZoom = useCallback((screen: Vec2, factor: number) => {
    const home = homeBoxRef.current;
    if (!viewportRef.current || !home) return;
    setView((prev) => {
      const cur = baseView(prev);
      return cur ? zoomAt(cur, screen, factor, { original: home }) : prev;
    });
    dropPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPan = useCallback((dx: number, dy: number) => {
    if (!viewportRef.current) return;
    setView((prev) => {
      const cur = baseView(prev);
      return cur ? panBy(cur, dx, dy) : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPinch = useCallback((from: Vec2, to: Vec2, factor: number) => {
    const home = homeBoxRef.current;
    if (!viewportRef.current || !home) return;
    setView((prev) => {
      const cur = baseView(prev);
      return cur ? pinchAt(cur, from, to, factor, { original: home }) : prev;
    });
    dropPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDoubleClick = useCallback(() => setView(null), []);

  const addTrajectory = useCallback(
    (p: Vec2) => {
      if (!sysRef.current || !homeBoxRef.current) return;
      // The curve's extent is the solution's business (20x the home box); the view only clips it.
      // It starts at the displayed snapshot time (matters only for a non-autonomous system).
      setStore((prev) => addToStore(prev, p, traceNow));
    },
    [traceNow],
  );

  const deleteTrajectory = useCallback((index: number) => {
    setStore((prev) => deleteFromStore(prev, index));
    // The highlighted pair is gone; the next pointer move decides what is under the cursor now.
    setHoverTarget(null);
    setHint(null);
    lastHoverScreen.current = null;
  }, []);

  const onClickWorld = useCallback(
    (p: Vec2) => {
      const vp = viewportRef.current;
      if (!vp) return;
      // The hit test is in screen pixels (a world threshold would change with the zoom); the
      // click's world point came from this viewport, so mapping it back is exact enough.
      const cur = storeRef.current;
      const action = clickAction(trajectoriesOf(cur), trajectoryStartsOf(cur), worldToScreen(vp, p), vp);
      if (action.type === "delete") deleteTrajectory(action.index);
      else addTrajectory(p);
    },
    [addTrajectory, deleteTrajectory],
  );

  const onHoverWorld = useCallback((world: Vec2 | null, screen: Vec2 | null, touch?: boolean) => {
    if (!world || !screen) {
      hoverRef.current = null;
      lastHoverScreen.current = null;
      setOverlay([]);
      setHint(null);
      setHoverTarget(null);
      return;
    }
    hoverRef.current = { world, screen, touch: Boolean(touch) };
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
      // Over a kept curve: no preview, the curve is emphasized and the hint says a click removes it.
      const cur = storeRef.current;
      const hit = nearestFixedTrajectory(trajectoriesOf(cur), trajectoryStartsOf(cur), h.screen, vp);
      if (hit !== null) {
        setOverlay([]);
        setHoverTarget(hit);
        setHint({ at: h.world, text: h.touch ? labels(localeRef.current).ui.holdToRemove : labels(localeRef.current).ui.clickToRemove });
        return;
      }
      setHoverTarget(null);
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
      setOverlay(markNonUnique(tracePreview(s, h.world, vp, snapshotTRef.current), featuresRef.current, vp.box, probeRef.current ?? undefined));
    });
  }, []);
  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const clearTrajectories = useCallback(() => {
    setExternal([]);
    setStore((prev) => clearStore(prev));
    setHoverTarget(null);
    setHint(null);
    lastHoverScreen.current = null;
  }, []);

  const undo = useCallback(() => {
    setStore((prev) => undoTrajectory(prev, traceNow));
    setHoverTarget(null);
    setHint(null);
    lastHoverScreen.current = null;
  }, [traceNow]);

  const highlight = useMemo(() => (hoverTarget !== null ? (store.entries[hoverTarget]?.curves ?? []) : []), [hoverTarget, store]);

  return {
    scene,
    viewport,
    overlay,
    hint,
    trajectories,
    trajectoryStarts,
    highlight,
    cursor: highlight.length ? "pointer" : undefined,
    addTrajectory,
    deleteTrajectory,
    clearTrajectories,
    undo,
    canUndo: storeCanUndo(store),
    handlers: { onClickWorld, onHoverWorld, onWheelZoom, onPan, onPinch, onDoubleClick },
  };
}
