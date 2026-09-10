/**
 * The data contract between the MCP tools (producers) and the widget / web shell (consumers).
 * Every visual tool returns a Scene as `structuredContent`; components only ever receive a Scene.
 * Pure types, no runtime code.
 */
import type { FormDetection } from "./core/detect-form";
import type { Equilibrium, EquilibriaResult } from "./core/equilibria";
import type { FieldGrid } from "./core/field";
import type { IntegrationStatus } from "./core/integrate";
import type { QueryHit, QueryNote } from "./core/query";
import type { EquilibriumSolution, FirstOrderSpec } from "./core/slope-field";
import type { Box, Locale, SystemSpec, Vec2, Range } from "./core/types";

export type SceneKind = "ping" | "sample_field" | "analyze_system" | "trace_trajectory" | "analyze_first_order" | "query_solution";

/**
 * query_solution only: what was asked and what the numerical solution gave (lib/core/query). The
 * target kind is the STUDENT's: "t" is the horizontal coordinate of a first-order scene and the
 * time of a planar one. `hits` are drawn as markers by the shells; `note` is a key worded by them.
 */
export type QueryView = {
  target: { kind: "t" | "x" | "y"; value: number };
  hits: QueryHit[];
  note: QueryNote;
  reached: boolean;
};

export type TrajectoryView = {
  direction: "forward" | "backward";
  points: Vec2[];
  status: IntegrationStatus;
  /** Accepted integration steps before downsampling. */
  steps: number;
  /**
   * Time reached (absolute). The start time is 0, except in the interactive shells over a
   * non-autonomous system, where a traced curve starts at the displayed snapshot time.
   */
  tEnd: number;
  /**
   * What 'left_box' refers to: the viewing box of a tool call ("view", default) or the far stop box
   * of a clicked trajectory in the shells ("far", 20x the entered range). Labels differ.
   */
  stop?: "view" | "far";
  /**
   * The curve passes through a point where uniqueness fails (a constant solution or an equilibrium
   * whose uniqueness verdict is "unbounded"): it is one of infinitely many solutions through that
   * point, and the picture shows only the one the integrator followed. Set by markNonUnique.
   */
  nonUnique?: boolean;
};

export type FirstOrderView = {
  /** Human-readable equation: "dy/dt = g" for the explicit form, or "(M) dt + (N) dy = 0". */
  expr: string;
  /** The equation itself, so a client can recompute locally (zoom, pan, hover). */
  spec?: FirstOrderSpec;
  /** Whether the right-hand side is independent of t (the static rule: t occurs in it or not); "untestable" only in older scenes. */
  autonomous: boolean | "untestable";
  /** Older scenes only (autonomy is static now). */
  untestableReason?: "undefined" | "all_zero";
  /** The right-hand side is identically zero on the range (lib/core/slope-field): every line y = c is a constant solution; `solutions` is empty. */
  identicallyZero?: boolean;
  solutions: EquilibriumSolution[];
  /** The scan resolution Δy of the constant-solution search; roots closer than this may have been merged or missed (always shown). */
  resolution?: number;
  /** Intervals on which the right-hand side evaluates to exactly 0 with no constant solution claimed inside (an underflow plateau or a flat region). */
  zeroPlateaus?: Range[];
  /** Points where M = N = 0: the direction is undefined there. */
  singularities?: Vec2[];
  /** True when more singular points were found than are listed (the list holds the first maxPoints, sorted by t). */
  singularitiesTruncated?: boolean;
  /**
   * The search's verdict on the singular points: "possible_continuum" when they line up along a
   * curve (the direction is probably undefined on a whole curve; the list shows representatives),
   * "hit_limit" when only the cap stopped the list. Shown by both shells and the tool summary.
   */
  singularitiesWarning?: "possible_continuum" | "hit_limit";
  /** Numerically detected standard forms (never proofs; each carries a caveat). */
  forms?: FormDetection[];
  /** Positive statement shown when no standard form was detected. */
  formsNote?: string;
  /**
   * For exact equations: level curves F(t, y) = C of the potential (the textbook implicit
   * solution), as world-space segments per level, plus the path-independence check result.
   */
  implicit?: { levels: { level: number; segments: [Vec2, Vec2][] }[]; pathDeviation: number };
  /**
   * Present whenever exactness was detected (consistent or borderline): the result of the
   * path-independence self-check of the numerical potential. `passed` false means no level curves
   * are shown, and the student must be told why (labels tool.exactPathCheckFailed).
   */
  implicitCheck?: { pathDeviation: number; tol: number; passed: boolean };
};

/**
 * How the sampled field should be drawn. A first-order equation in differential form has no
 * natural direction (M dt + N dy = 0 and -M dt - N dy = 0 are the same equation), so it is drawn
 * as undirected segments; explicit dy/dt = g and autonomous systems get arrows.
 */
export type FieldStyle = "arrows" | "segments";

export type Scene = {
  kind: SceneKind;
  /** Language the producing tool was asked for; consumers use it for their own labels. */
  locale?: Locale;
  /**
   * Normalised system that produced the scene (x' = f, y' = g). Carries variables: "ty" for
   * first-order scenes (t is the horizontal coordinate there); consumers compile it with
   * compileSystem unchanged.
   */
  system?: SystemSpec;
  box?: Box;
  /** The box the equilibria / first-order features were computed for, when it differs from `box` (interactive shells recompute after a pause). */
  featuresBox?: Box;
  field?: FieldGrid;
  fieldStyle?: FieldStyle;
  trajectories?: TrajectoryView[];
  start?: Vec2;
  equilibria?: Equilibrium[];
  warning?: EquilibriaResult["warning"];
  /** True when more equilibria were found than are listed in `equilibria` (the first maxPoints, sorted by x). Independent of `warning`. */
  truncated?: EquilibriaResult["truncated"];
  /** Points where the field is undefined or discontinuous (a direction-dependent limit) that a Newton run ended at; not equilibria (lib/core/equilibria vanishing test). */
  singularPoints?: EquilibriaResult["singularPoints"];
  /** True when part of the box evaluates to exactly 0 by underflow (not equilibria, not listed; lib/core/equilibria). Both shells and the tool summary print the notice. */
  underflowPlateau?: EquilibriaResult["underflowPlateau"];
  /**
   * Set when the system is non-autonomous (the symbol t appears in f or g: the static rule of
   * lib/core/time-dependence; `maxRelDeviation` is the probe's evidence of how much the field
   * changed at the sampled times, 0 when no change was measured, Infinity when the domain moves
   * with t). The field is then a snapshot at `snapshotT`, traced curves start there, and the
   * scene carries NO equilibria and NO warning: equilibrium points and linearized stability are
   * tools for autonomous systems that are not attempted for a time-dependent field. First-order
   * scenes never set it.
   */
  timeDependent?: { snapshotT: number; maxRelDeviation: number };
  firstOrder?: FirstOrderView;
  /**
   * analyze_second_order only: the second-order equation the student gave (primes normalized) and
   * the reduction x' = y, y' = g shown to students; `system` carries the same reduced planar system.
   */
  secondOrder?: { equation: string; reduced: { f: string; g: string } };
  /** query_solution only (see QueryView). */
  query?: QueryView;
  /** ping only */
  message?: string;
};
