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
  /** Time reached (signed from the start time 0). */
  tEnd: number;
};

export type FirstOrderView = {
  /** Human-readable equation: "g" for dy/dx = g, or "M dx + N dy = 0". */
  expr: string;
  /** The equation itself, so a client can recompute locally (zoom, pan, hover). */
  spec?: FirstOrderSpec;
  autonomous: boolean;
  solutions: EquilibriumSolution[];
  /** Points where M = N = 0: the direction is undefined there. */
  singularities?: Vec2[];
  /** Numerically detected standard forms (never proofs; each carries a caveat). */
  forms?: FormDetection[];
  /** Positive statement shown when no standard form was detected. */
  formsNote?: string;
  /**
   * For exact equations: level curves F(x, y) = C of the potential (the textbook implicit
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
 * natural direction (M dx + N dy = 0 and -M dx - N dy = 0 are the same equation), so it is drawn
 * as undirected segments; explicit dy/dx = g and autonomous systems get arrows.
 */
export type FieldStyle = "arrows" | "segments";

export type Scene = {
  kind: SceneKind;
  /** Language the producing tool was asked for; consumers use it for their own labels. */
  locale?: Locale;
  /** Normalised system that produced the scene (x' = f, y' = g). */
  system?: SystemSpec;
  box?: Box;
  field?: FieldGrid;
  fieldStyle?: FieldStyle;
  trajectories?: TrajectoryView[];
  start?: Vec2;
  equilibria?: Equilibrium[];
  warning?: EquilibriaResult["warning"];
  firstOrder?: FirstOrderView;
  /** ping only */
  message?: string;
};
