/** Shared value types for the computation kernel. Plain data only. */

export type Vec2 = { x: number; y: number };
export type Range = { min: number; max: number };
export type Box = { x: Range; y: Range };

/**
 * A planar system  x' = f(x, y, t),  y' = g(x, y, t)  written as mathjs expressions.
 * `params` are extra named constants the expressions may use. Most systems are autonomous and
 * simply never mention t.
 */
export type SystemSpec = { f: string; g: string; params?: Record<string, number> };

/** Row-major 2x2 matrix: [[a, b], [c, d]]. */
export type Matrix2 = [[number, number], [number, number]];

export type Complex = { re: number; im: number };

/** Language of student-facing text produced by the kernel (evidence, caveats). */
export type Locale = "zh" | "en";
