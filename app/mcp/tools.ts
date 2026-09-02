/**
 * MCP tool layer: translates tool calls into lib/core calls and core results into tool results.
 * No mathematics here. Descriptions are the prompt Claude sees; they decide when a tool is called.
 */
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { findEquilibria } from "@/lib/core/equilibria";
import { sampleField } from "@/lib/core/field";
import { integrateAdaptive, integrateRK4, type IntegrateOptions } from "@/lib/core/integrate";
import { compileSystem, ParseError } from "@/lib/core/parse";
import { contourSegments } from "@/lib/render/contours";
import { detectForms, NO_FORM_NOTE, type OdeForm } from "@/lib/core/detect-form";
import { exactPotential, potentialLevels } from "@/lib/core/exact";
import {
  firstOrderEquilibria,
  firstOrderSingularities,
  toSystem,
  type FirstOrderSpec,
} from "@/lib/core/slope-field";
import type { Box, SystemSpec, Vec2 } from "@/lib/core/types";
import { CLASS_ZH, STABILITY_ZH, STATUS_ZH, WARNING_ZH, formatEigenvalue, formatNumber } from "@/lib/labels";
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

function compileOrExplainFirstOrder(spec: FirstOrderSpec, systemSpec: SystemSpec) {
  try {
    return compileSystem(systemSpec);
  } catch (error) {
    if (error instanceof ParseError) {
      const which =
        spec.kind === "explicit" ? "g (the right-hand side of dy/dx)" : error.expr.includes(spec.N) && !error.expr.includes(spec.M) ? "N" : "M";
      throw new ToolInputError(`Cannot parse ${which}: ${error.message}`);
    }
    throw error;
  }
}

const FORM_ZH: Record<OdeForm, string> = {
  separable: "可分离变量方程",
  autonomous: "自治方程",
  linear_in_y: "关于 y 的线性方程",
  homogeneous: "零次齐次方程",
  bernoulli: "Bernoulli 方程",
  exact: "恰当方程",
  integrating_factor_x: "有只依赖 x 的积分因子的方程",
  integrating_factor_y: "有只依赖 y 的积分因子的方程",
};

/** Uniformly thins a polyline to at most `max` points, always keeping the last one. */
export function thin<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const stride = (points.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * stride)]);
  return out;
}

const fmt = formatNumber;
const fmtPoint = (p: Vec2) => `(${fmt(p.x)}, ${fmt(p.y)})`;
const fmtEigen = formatEigenvalue;

function describeEquilibria(scene: Scene): string {
  const lines: string[] = [];
  const eq = scene.equilibria ?? [];
  if (scene.warning) lines.push(WARNING_ZH[scene.warning]);
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

/**
 * Registers the four analysis tools. Every tool is linked to the widget resource (`widgetUri`)
 * so MCP Apps hosts render its Scene; text-only hosts just read the summary.
 */
export function registerTools(server: McpServer, widgetUri: string): void {
  const ui = { ui: { resourceUri: widgetUri } };

  registerAppTool(
    server,
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
      _meta: ui,
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

  registerAppTool(
    server,
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
      _meta: ui,
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

  registerAppTool(
    server,
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
      _meta: ui,
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

  registerAppTool(
    server,
    "analyze_first_order",
    {
      title: "Analyze a first-order equation (dy/dx = g, or M dx + N dy = 0)",
      description:
        "For a single first-order ODE, given either explicitly as dy/dx = g(x, y) (parameter `expr`) or in " +
        "differential form M(x, y) dx + N(x, y) dy = 0 (parameters `M` and `N`, the natural form of exact " +
        "equations). Returns: the slope/direction field inside the viewing box (undirected segments for the " +
        "differential form, which has no natural direction); constant solutions y = c with their stability " +
        "(stable / unstable / semi-stable / varies with x); points where the direction is undefined (M = N = 0); " +
        "a list of standard forms the equation is NUMERICALLY CONSISTENT WITH (separable, autonomous, linear in y, " +
        "homogeneous, Bernoulli, exact, integrating factor in x or y), each with its evidence and a caveat; and, " +
        "for exact equations, the implicit solution F(x, y) = C drawn as level curves. " +
        "USE THIS whenever a student has ONE equation with a single unknown function: logistic growth, Newton " +
        "cooling, separable or linear equations, exact equations, slope fields, isoclines, equilibrium " +
        "solutions, 'what method solves this'. For a system of two equations use analyze_system. " +
        "IMPORTANT about the detected forms: they are numerical probes at a handful of sample points, not proofs. " +
        "When you relay them, keep the uncertainty: say the equation 'behaves numerically like a separable " +
        "equation', never 'is a separable equation', and pass the caveat on. An empty list is not a failure: it " +
        "means no standard elementary method was detected, while the slope field and numerical solutions remain " +
        "fully valid (many important equations, e.g. Riccati dy/dx = x^2 + y^2, have no closed form). " +
        "Variables: y is the unknown function, x the independent variable. Provide exactly one of `expr` or the " +
        "pair `M`, `N`. " +
        EXPRESSION_RULES + " " + BOX_RULES + " " + NEVER_COMPUTE,
      inputSchema: {
        expr: expression.optional().describe("Right-hand side g(x, y) of dy/dx = g(x, y). Omit when giving M and N."),
        M: expression.optional().describe("M(x, y) in M dx + N dy = 0. Requires N."),
        N: expression.optional().describe("N(x, y) in M dx + N dy = 0. Requires M."),
        params: paramsSchema,
        ...boxShape,
        density,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: ui,
    },
    (input) =>
      guarded(() => {
        const box = resolveBox(input);
        const hasExpr = typeof input.expr === "string";
        const hasMN = typeof input.M === "string" || typeof input.N === "string";
        if (hasExpr === hasMN) {
          throw new ToolInputError("Provide exactly one form: either `expr` (dy/dx = g) or both `M` and `N` (M dx + N dy = 0).");
        }
        if (hasMN && !(typeof input.M === "string" && typeof input.N === "string")) {
          throw new ToolInputError("The differential form needs both `M` and `N`.");
        }
        const spec: FirstOrderSpec = hasExpr
          ? input.params
            ? { kind: "explicit", g: input.expr as string, params: input.params }
            : { kind: "explicit", g: input.expr as string }
          : input.params
            ? { kind: "differential", M: input.M as string, N: input.N as string, params: input.params }
            : { kind: "differential", M: input.M as string, N: input.N as string };
        const equationText = spec.kind === "explicit" ? `dy/dx = ${spec.g}` : `(${spec.M}) dx + (${spec.N}) dy = 0`;

        const systemSpec = toSystem(spec);
        const sys = compileOrExplainFirstOrder(spec, systemSpec);
        const field = sampleField(sys, box, input.density, input.density);
        const eq = firstOrderEquilibria(spec, box.y, { xRange: box.x });
        const singular = firstOrderSingularities(spec, box);
        const forms = detectForms(spec, box, "zh");

        let implicit: NonNullable<Scene["firstOrder"]>["implicit"];
        if (forms.some((f) => f.form === "exact")) {
          const pot = exactPotential(spec, box);
          if (pot.consistent) {
            const levels = potentialLevels(pot.F, box, 8).map((level) => ({ level, segments: contourSegments(pot.F, box, level, 60, 60) }));
            implicit = { levels, pathDeviation: pot.pathDeviation };
          }
        }

        const scene: Scene = {
          kind: "analyze_first_order",
          system: systemSpec,
          box,
          field,
          fieldStyle: spec.kind === "differential" ? "segments" : "arrows",
          firstOrder: {
            expr: equationText,
            spec,
            autonomous: eq.autonomous,
            solutions: eq.solutions,
            singularities: singular.points,
            forms,
            formsNote: forms.length === 0 ? NO_FORM_NOTE.zh : undefined,
            implicit,
          },
        };

        const lines: string[] = [];
        lines.push(`方程 ${equationText}，观察范围 x∈[${fmt(box.x.min)}, ${fmt(box.x.max)}]，y∈[${fmt(box.y.min)}, ${fmt(box.y.max)}]。`);
        if (spec.kind === "differential") lines.push("微分形式没有天然的正方向，方向场画成无向线段。");
        if (field.singularCount) lines.push(`方向场在 ${field.singularCount} 个采样点上无定义或无穷大。`);
        if (singular.points.length) {
          lines.push(`方向场奇点（M = N = 0，此处方向无定义）：${singular.points.map(fmtPoint).join("、")}${singular.warning ? "（数量已截断）" : ""}。`);
        }
        if (eq.solutions.length) {
          for (const s of eq.solutions) lines.push(`常数解 y = ${fmt(s.y, 6)}：${STABILITY_ZH[s.stability]}。`);
        } else {
          lines.push(eq.autonomous ? "方程是自治的，但在观察范围内没有常数解。" : "在观察范围内没有常数解（右端依赖 x；斜率场仍然有效）。");
        }
        if (forms.length) {
          lines.push("方程类型（数值探测，只表示「与该形式一致」，不是证明）：");
          for (const f of forms) lines.push(`- 在数值上表现得像${FORM_ZH[f.form]}。${f.evidence}`);
          lines.push(`注意：${forms[0].caveat}`);
        } else {
          lines.push(NO_FORM_NOTE.zh);
        }
        if (implicit) {
          lines.push(`方程恰当：已数值求出势函数 F(x, y)，图中紫色曲线是隐式解 F(x, y) = C（画了 ${implicit.levels.length} 条等值线）。两条积分路径的相对偏差 ${implicit.pathDeviation.toExponential(1)}，这本身就是恰当性的独立验证。`);
        }
        return ok(lines.join("\n"), scene);
      }),
  );
}
