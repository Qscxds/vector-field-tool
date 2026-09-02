/**
 * MCP tool layer: translates tool calls into lib/core calls and core results into tool results.
 * No mathematics here. Descriptions are the prompt Claude sees; they decide when a tool is called.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Equilibrium } from "@/lib/core/equilibria";
import { findEquilibria } from "@/lib/core/equilibria";
import { sampleField } from "@/lib/core/field";
import { integrateAdaptive, integrateRK4, type IntegrateOptions, type Trajectory } from "@/lib/core/integrate";
import { compileSystem, ParseError } from "@/lib/core/parse";
import { firstOrderEquilibria, firstOrderToSystem } from "@/lib/core/slope-field";
import type { Box, SystemSpec, Vec2 } from "@/lib/core/types";
import type { Scene, TrajectoryView } from "@/lib/scene";

// ---------- prompt fragments shared by every description ----------

const EXPRESSION_RULES =
  'Expression syntax: the state variables are x and y (t is the time, rarely needed). ' +
  'Write multiplication explicitly: x*y, not xy (2*x and 2x are both fine). Powers use ^, e.g. x^2. ' +
  'Allowed functions: sin cos tan asin acos atan atan2 sinh cosh tanh exp log log10 sqrt abs sign pow min max floor ceil round; ' +
  'constants pi and e. Any other constant goes into "params" as a number (e.g. {"a": 0.5}) and is referenced by name. ' +
  'A piecewise right-hand side may use comparisons and a conditional, e.g. "x > 0 ? 1 : -1".';

const NEVER_COMPUTE =
  'Do NOT compute any of this yourself: no mental arithmetic, no estimating eigenvalues, equilibria, ' +
  'stability or trajectories from memory. Always call this tool and report exactly what it returns. ' +
  'If the result contains a "caveat", read it to the student word for word; it marks a case where the ' +
  'mathematics genuinely cannot be decided by linearisation.';

const BOX_RULES =
  'The viewing box (xMin, xMax, yMin, yMax) must have xMin < xMax and yMin < yMax; defaults are -3..3.';

// ---------- schemas ----------

const expression = z.string().trim().min(1).max(200).describe("A mathjs expression in x and y.");
const paramsSchema = z
  .record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.number().finite())
  .optional()
  .describe('Named constants used in the expressions, e.g. {"a": 1.5, "b": 0.2}.');
const coordinate = z.number().finite();
const boxShape = {
  xMin: coordinate.default(-3).describe("Left edge of the viewing box."),
  xMax: coordinate.default(3).describe("Right edge of the viewing box."),
  yMin: coordinate.default(-3).describe("Bottom edge of the viewing box."),
  yMax: coordinate.default(3).describe("Top edge of the viewing box."),
};
const density = z
  .number()
  .int()
  .min(5)
  .max(60)
  .default(20)
  .describe("Grid points per axis for the sampled field (5..60). 20 is a good default for a widget.");

type BoxInput = { xMin: number; xMax: number; yMin: number; yMax: number };

// ---------- helpers ----------

class ToolInputError extends Error {}

function resolveBox(b: BoxInput): Box {
  if (!(b.xMin < b.xMax)) throw new ToolInputError(`xMin (${b.xMin}) must be smaller than xMax (${b.xMax}).`);
  if (!(b.yMin < b.yMax)) throw new ToolInputError(`yMin (${b.yMin}) must be smaller than yMax (${b.yMax}).`);
  const w = b.xMax - b.xMin;
  const h = b.yMax - b.yMin;
  if (w > 1e6 || h > 1e6) throw new ToolInputError("The viewing box is too large (each side must be at most 1e6).");
  if (w < 1e-9 || h < 1e-9) throw new ToolInputError("The viewing box is too small (each side must be at least 1e-9).");
  return { x: { min: b.xMin, max: b.xMax }, y: { min: b.yMin, max: b.yMax } };
}

function compileOrExplain(spec: SystemSpec) {
  try {
    return compileSystem(spec);
  } catch (error) {
    if (error instanceof ParseError) {
      const which = error.expr === spec.f ? "f (the x' expression)" : error.expr === spec.g ? "g (the y' expression)" : "the expression";
      throw new ToolInputError(`Cannot parse ${which}: ${error.message}`);
    }
    throw error;
  }
}

/** Uniformly thins a polyline to at most `max` points, always keeping the last one. */
export function thin<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const stride = (points.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * stride)]);
  return out;
}

const fmt = (v: number, digits = 4) => {
  if (!Number.isFinite(v)) return String(v);
  const s = v.toFixed(digits);
  return s.replace(/\.?0+$/, "") || "0";
};
const fmtPoint = (p: Vec2) => `(${fmt(p.x)}, ${fmt(p.y)})`;
const fmtEigen = (e: { re: number; im: number }) =>
  Math.abs(e.im) < 1e-15 ? fmt(e.re, 5) : `${fmt(e.re, 5)} ${e.im >= 0 ? "+" : "-"} ${fmt(Math.abs(e.im), 5)}i`;

const CLASS_ZH: Record<Equilibrium["classification"], string> = {
  stable_node: "稳定结点",
  unstable_node: "不稳定结点",
  saddle: "鞍点",
  stable_spiral: "稳定螺旋点（稳定焦点）",
  unstable_spiral: "不稳定螺旋点（不稳定焦点）",
  star_node: "星形结点",
  degenerate_node: "退化结点",
  center_or_weak_spiral: "中心或弱螺旋（线性化无法区分）",
  non_hyperbolic: "非双曲平衡点（线性化无法判定）",
};

const STATUS_ZH: Record<Trajectory["status"], string> = {
  completed: "积分到指定时间结束",
  left_box: "轨线离开了观察范围后停止",
  reached_equilibrium: "轨线趋近一个平衡点后停止（速度小于 1e-8）",
  blew_up: "解在有限时间内发散（数值爆破），在最后一个有限点停止",
  max_steps: "达到步数上限后停止",
};

function describeEquilibria(scene: Scene): string {
  const lines: string[] = [];
  const eq = scene.equilibria ?? [];
  if (scene.warning === "none_found") lines.push("在观察范围内没有找到平衡点。");
  else if (scene.warning === "possible_continuum")
    lines.push("警告：找到的平衡点几乎都是非双曲的，而且排成一条线，这很可能是一个连续的平衡点集合（例如整条坐标轴），下面只列出其中一部分代表点。");
  else if (scene.warning === "hit_limit") lines.push("警告：平衡点数量超过了上限，下面只列出前几个。");
  eq.forEach((p, i) => {
    lines.push(
      `${i + 1}. 平衡点 ${fmtPoint(p.at)}：${CLASS_ZH[p.classification]}。` +
        ` 特征值 ${p.eigenvalues.map(fmtEigen).join(", ") || "无法求出"}；迹 ${fmt(p.trace, 5)}，行列式 ${fmt(p.determinant, 5)}。` +
        (p.caveat ? ` 注意：${p.caveat}` : ""),
    );
  });
  return lines.join("\n");
}

function ok(text: string, scene: Scene): CallToolResult {
  return { content: [{ type: "text", text }], structuredContent: scene as Record<string, unknown> };
}

function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

/** Runs a handler and converts expected failures into MCP error results (never HTTP 500). */
function guarded(run: () => CallToolResult): CallToolResult {
  try {
    return run();
  } catch (error) {
    if (error instanceof ToolInputError || error instanceof RangeError || error instanceof ParseError) {
      return fail(`Invalid input: ${error.message}`);
    }
    throw error;
  }
}

// ---------- tools ----------

export function registerTools(server: McpServer): void {
  server.registerTool(
    "analyze_system",
    {
      title: "Analyze a planar system",
      description:
        "Finds all equilibrium points of the planar system x' = f(x, y), y' = g(x, y) inside a viewing box and " +
        "classifies each one from its Jacobian (eigenvalues, trace, determinant): stable/unstable node, saddle, " +
        "stable/unstable spiral, star or degenerate node, centre-or-weak-spiral, non-hyperbolic. Also returns a " +
        "sampled vector field for drawing the phase portrait. " +
        "USE THIS whenever a student asks about equilibria, fixed points, stability, the phase portrait, the type " +
        "of a critical point, eigenvalues of the linearisation, or long-term behaviour of a 2D autonomous system. " +
        "For a single first-order equation dy/dx = g(x, y) use analyze_first_order instead. " +
        EXPRESSION_RULES + " " + BOX_RULES + " " + NEVER_COMPUTE,
      inputSchema: {
        f: expression.describe("Right-hand side of x' (dx/dt)."),
        g: expression.describe("Right-hand side of y' (dy/dt)."),
        params: paramsSchema,
        ...boxShape,
        density: density.describe("Grid points per axis for the returned vector field (5..60)."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (input) =>
      guarded(() => {
        const box = resolveBox(input);
        const spec: SystemSpec = input.params ? { f: input.f, g: input.g, params: input.params } : { f: input.f, g: input.g };
        const sys = compileOrExplain(spec);
        const eq = findEquilibria(sys, box);
        const field = sampleField(sys, box, input.density, input.density);
        const scene: Scene = { kind: "analyze_system", system: spec, box, field, equilibria: eq.points, warning: eq.warning };
        const header = `系统 x' = ${spec.f}，y' = ${spec.g}，观察范围 x∈[${fmt(box.x.min)}, ${fmt(box.x.max)}]，y∈[${fmt(box.y.min)}, ${fmt(box.y.max)}]。`;
        const singular = field.singularCount ? ` 向量场在 ${field.singularCount} 个采样点上无定义或无穷大。` : "";
        return ok(`${header}${singular}\n${describeEquilibria(scene)}`, scene);
      }),
  );

  server.registerTool(
    "trace_trajectory",
    {
      title: "Trace a trajectory",
      description:
        "Numerically integrates the planar system x' = f(x, y), y' = g(x, y) from an initial point (x0, y0), " +
        "forward and/or backward in time, and returns the trajectory points plus why the integration stopped " +
        "(completed, left the viewing box, reached an equilibrium, blew up in finite time, hit the step limit). " +
        "USE THIS whenever a student asks what happens to a solution starting at a given point, where a trajectory " +
        "goes, whether it approaches an equilibrium or a limit cycle, or wants a solution curve drawn. " +
        "Default is both directions with an adaptive Dormand-Prince integrator; use method 'rk4' only when a " +
        "fixed-step classic RK4 is explicitly wanted. " +
        EXPRESSION_RULES + " " + BOX_RULES + " Integration stops when the trajectory leaves the box. " + NEVER_COMPUTE,
      inputSchema: {
        f: expression.describe("Right-hand side of x' (dx/dt)."),
        g: expression.describe("Right-hand side of y' (dy/dt)."),
        params: paramsSchema,
        x0: coordinate.describe("Initial x."),
        y0: coordinate.describe("Initial y."),
        tSpan: z.number().positive().max(1000).default(20).describe("Time span to integrate in each direction (0 < tSpan <= 1000)."),
        direction: z.enum(["both", "forward", "backward"]).default("both"),
        method: z.enum(["adaptive", "rk4"]).default("adaptive"),
        ...boxShape,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (input) =>
      guarded(() => {
        const box = resolveBox(input);
        const spec: SystemSpec = input.params ? { f: input.f, g: input.g, params: input.params } : { f: input.f, g: input.g };
        const sys = compileOrExplain(spec);
        const start = { x: input.x0, y: input.y0 };
        const integrate = input.method === "rk4" ? integrateRK4 : integrateAdaptive;
        const directions: Array<1 | -1> = input.direction === "both" ? [1, -1] : input.direction === "forward" ? [1] : [-1];
        const trajectories: TrajectoryView[] = directions.map((dir) => {
          const opts: IntegrateOptions = { direction: dir, box, h: input.method === "rk4" ? 0.01 : 0.05 };
          const tr = integrate(sys, start, input.tSpan, opts);
          return {
            direction: dir === 1 ? "forward" : "backward",
            points: thin(tr.points, 1000),
            status: tr.status,
            steps: tr.steps,
            tEnd: tr.times[tr.times.length - 1],
          };
        });
        const scene: Scene = { kind: "trace_trajectory", system: spec, box, start, trajectories };
        const lines = trajectories.map((t) => {
          const end = t.points[t.points.length - 1];
          return `${t.direction === "forward" ? "正向（t 增大）" : "逆向（t 减小）"}：积到 t = ${fmt(t.tEnd, 3)}，终点 ${fmtPoint(end)}，${STATUS_ZH[t.status]}。共 ${t.steps} 步。`;
        });
        return ok(`从 ${fmtPoint(start)} 出发，系统 x' = ${spec.f}，y' = ${spec.g}。\n${lines.join("\n")}`, scene);
      }),
  );

  server.registerTool(
    "sample_field",
    {
      title: "Sample the vector field",
      description:
        "Samples the vector field (f, g) of the planar system x' = f(x, y), y' = g(x, y) on a regular grid inside " +
        "the viewing box and returns the arrows (position, vector, magnitude) for drawing, plus the maximum " +
        "magnitude and how many grid points are singular. " +
        "USE THIS when a student just wants to see the direction field / vector field / phase plane arrows of a " +
        "system without an equilibrium analysis, or to render a picture in the widget. For equilibria and stability " +
        "use analyze_system, which also returns a field. " +
        EXPRESSION_RULES + " " + BOX_RULES + " " + NEVER_COMPUTE,
      inputSchema: {
        f: expression.describe("Right-hand side of x' (dx/dt)."),
        g: expression.describe("Right-hand side of y' (dy/dt)."),
        params: paramsSchema,
        ...boxShape,
        density,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (input) =>
      guarded(() => {
        const box = resolveBox(input);
        const spec: SystemSpec = input.params ? { f: input.f, g: input.g, params: input.params } : { f: input.f, g: input.g };
        const sys = compileOrExplain(spec);
        const field = sampleField(sys, box, input.density, input.density);
        const scene: Scene = { kind: "sample_field", system: spec, box, field };
        return ok(
          `在 ${field.nx}×${field.ny} 网格上采样了向量场 (${spec.f}, ${spec.g})。最大模长 ${fmt(field.maxMag)}，` +
            `${field.singularCount} 个采样点无定义或无穷大。图像已交给 widget 绘制。`,
          scene,
        );
      }),
  );

  server.registerTool(
    "analyze_first_order",
    {
      title: "Analyze a first-order equation dy/dx = g(x, y)",
      description:
        "For a single first-order ODE dy/dx = g(x, y): samples the slope field inside the viewing box and, when the " +
        "equation is autonomous (g does not depend on x), finds its equilibrium (constant) solutions y = y* with " +
        "their stability (stable / unstable / semi-stable) read off the sign of g on either side. " +
        "USE THIS whenever a student has ONE equation written as dy/dx = ... or y' = ... with a single unknown " +
        "function (logistic growth, Newton cooling, separable equations, slope fields, isoclines, equilibrium " +
        "solutions of an autonomous equation). For a system of two equations use analyze_system. " +
        "The expression uses y for the unknown function and x for the independent variable. " +
        EXPRESSION_RULES + " " + BOX_RULES + " " + NEVER_COMPUTE,
      inputSchema: {
        expr: expression.describe("Right-hand side g(x, y) of dy/dx = g(x, y)."),
        params: paramsSchema,
        ...boxShape,
        density,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (input) =>
      guarded(() => {
        const box = resolveBox(input);
        const spec = firstOrderToSystem(input.expr, input.params);
        const sys = compileOrExplain(spec);
        const field = sampleField(sys, box, input.density, input.density);
        const eq = firstOrderEquilibria(input.expr, box.y, { params: input.params });
        const scene: Scene = {
          kind: "analyze_first_order",
          system: spec,
          box,
          field,
          firstOrder: { expr: input.expr, autonomous: eq.autonomous, solutions: eq.solutions },
        };
        const stab = { stable: "稳定（两侧的解都趋向它）", unstable: "不稳定（两侧的解都离开它）", semi_stable: "半稳定（一侧趋向、一侧离开）" };
        const lines = eq.autonomous
          ? eq.solutions.length
            ? eq.solutions.map((s) => `平衡解 y = ${fmt(s.y, 6)}：${stab[s.stability]}。`)
            : ["方程是自治的，但在观察范围内 g(y) 没有零点，因此没有平衡解。"]
          : ["右端依赖 x，方程不是自治的，不存在常数形式的平衡解；请看斜率场。"];
        return ok(`方程 dy/dx = ${input.expr}，观察范围 x∈[${fmt(box.x.min)}, ${fmt(box.x.max)}]，y∈[${fmt(box.y.min)}, ${fmt(box.y.max)}]。\n${lines.join("\n")}`, scene);
      }),
  );
}
