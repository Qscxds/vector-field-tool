/**
 * The data contract between the MCP tools (producers) and the widget / web shell (consumers).
 * Every visual tool returns a Scene as `structuredContent`; components only ever receive a Scene.
 * Pure types, no runtime code.
 */
import type { Equilibrium, EquilibriaResult } from "./core/equilibria";
import type { FieldGrid } from "./core/field";
import type { IntegrationStatus } from "./core/integrate";
import type { EquilibriumSolution } from "./core/slope-field";
import type { Box, SystemSpec, Vec2 } from "./core/types";

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
  expr: string;
  autonomous: boolean;
  solutions: EquilibriumSolution[];
};

export type Scene = {
  kind: SceneKind;
  /** Normalised system that produced the scene (x' = f, y' = g). */
  system?: SystemSpec;
  box?: Box;
  field?: FieldGrid;
  trajectories?: TrajectoryView[];
  start?: Vec2;
  equilibria?: Equilibrium[];
  warning?: EquilibriaResult["warning"];
  firstOrder?: FirstOrderView;
  /** ping only */
  message?: string;
};
