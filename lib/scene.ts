/**
 * The data contract between the MCP tools (producers) and the widget / web shell (consumers).
 * Every visual tool returns a Scene as `structuredContent`; components only ever receive a Scene.
 * Pure types, no runtime code.
 */
import type { FormDetection } from "./core/detect-form";
import type { Equilibrium, EquilibriaResult } from "./core/equilibria";
import type { FieldGrid } from "./core/field";
import type { IntegrationStatus } from "./core/integrate";
import type { EquilibriumSolution, FirstOrderSpec } from "./core/slope-field";
import type { Box, Locale, SystemSpec, Vec2 } from "./core/types";

export type SceneKind = "ping" | "sample_field" | "analyze_system" | "trace_trajectory" | "analyze_first_order";

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
  autonomous: boolean;
  solutions: EquilibriumSolution[];
  /** Points where M = N = 0: the direction is undefined there. */
  singularities?: Vec2[];
  /** True when more singular points were found than are listed (the list holds the first maxPoints, sorted by t). */
  singularitiesTruncated?: boolean;
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
  /**
   * Set when the system is non-autonomous (f or g changes with t, measured by
   * lib/core/time-dependence). The field is then a snapshot at `snapshotT`, traced curves start
   * there, and the scene carries NO equilibria and NO warning: equilibrium points and linearized
   * stability are not defined for a non-autonomous system. First-order scenes never set it.
   */
  timeDependent?: { snapshotT: number; maxRelDeviation: number };
  firstOrder?: FirstOrderView;
  /**
   * analyze_second_order only: the second-order equation the student gave (primes normalized) and
   * the reduction x' = y, y' = g shown to students; `system` carries the same reduced planar system.
   */
  secondOrder?: { equation: string; reduced: { f: string; g: string } };
  /** ping only */
  message?: string;
};
