/** Shared value types for the computation kernel. Plain data only. */

export type Vec2 = { x: number; y: number };
export type Range = { min: number; max: number };
export type Box = { x: Range; y: Range };

/**
 * Which symbols the expressions of a SystemSpec may use.
 * - "xy" (default): x, y and the time t (x' = f(x, y, t), y' = g(x, y, t)).
 * - "ty": a first-order equation reduced to a planar system. The horizontal kernel coordinate
 *   (Vec2.x) is the student's independent variable and is written t; the only variables are t and
 *   y, the symbol x is rejected, and there is no separate time symbol (the time argument is
 *   ignored).
 */
export type VariableMode = "xy" | "ty";

/**
 * A planar system  x' = f(x, y, t),  y' = g(x, y, t)  written as mathjs expressions.
 * `params` are extra named constants the expressions may use. Most systems are autonomous and
 * simply never mention t. `variables` selects the symbol set (see VariableMode); undefined means
 * "xy". First-order scenes carry "ty" so consumers can compile the system unchanged.
 */
export type SystemSpec = { f: string; g: string; params?: Record<string, number>; variables?: VariableMode };

/** Row-major 2x2 matrix: [[a, b], [c, d]]. */
export type Matrix2 = [[number, number], [number, number]];

export type Complex = { re: number; im: number };

/** Language of student-facing text produced by the kernel (evidence, caveats). */
export type Locale = "zh" | "en";
