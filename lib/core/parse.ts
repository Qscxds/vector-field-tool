/**
 * Expression parsing and compilation on top of mathjs.
 *
 * Security model: this endpoint will be public, so user text is never handed to `math.evaluate`.
 * We parse to an AST, walk it against a strict whitelist (node kinds, symbols, functions,
 * operators, numeric literals only) and only then compile. Anything outside the whitelist is a
 * ParseError that names the offending token.
 *
 * Evaluation is hot (tens of thousands of calls per request), so a system is compiled once and
 * evaluated with a reused scope object. Non-finite results (1/x at 0, sqrt(-1) -> NaN) are legal
 * and returned as-is; callers decide what to do with them. Evaluation never throws.
 */
import { all, create, type MathNode } from "mathjs";
import type { SystemSpec, Vec2 } from "./types";

// predictable: true makes sqrt(-1), log(-1), ... return NaN instead of a Complex number.
const math = create(all, { predictable: true, number: "number", matrix: "Array" });

export const ALLOWED_FUNCTIONS: ReadonlySet<string> = new Set([
  "sin", "cos", "tan", "asin", "acos", "atan", "atan2",
  "sinh", "cosh", "tanh",
  "exp", "log", "log10", "sqrt", "abs", "sign", "pow",
  "min", "max", "floor", "ceil", "round",
]);

export const ALLOWED_CONSTANTS: ReadonlySet<string> = new Set(["pi", "e"]);
export const VARIABLES: ReadonlySet<string> = new Set(["x", "y", "t"]);

/** mathjs internal function names behind operators (OperatorNode.fn). */
const ALLOWED_OPERATORS: ReadonlySet<string> = new Set([
  "add", "subtract", "multiply", "divide", "pow",
  "unaryMinus", "unaryPlus",
  "smaller", "larger", "smallerEq", "largerEq", "equal", "unequal",
]);

const ALLOWED_NODE_TYPES: ReadonlySet<string> = new Set([
  "ConstantNode", "SymbolNode", "OperatorNode", "FunctionNode", "ParenthesisNode", "ConditionalNode",
]);

export class ParseError extends Error {
  readonly expr: string;
  constructor(expr: string, message: string) {
    super(message);
    this.name = "ParseError";
    this.expr = expr;
  }
}

export interface CompiledSystem {
  /** Evaluates (f, g) at a point; `t` defaults to 0 for autonomous use. Never throws. */
  eval(p: Vec2, t?: number): Vec2;
  readonly spec: SystemSpec;
}

type Scope = Record<string, number>;

function validateParams(expr: string, params: Record<string, number> | undefined): string[] {
  const names = Object.keys(params ?? {});
  for (const name of names) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new ParseError(expr, `Invalid parameter name "${name}".`);
    }
    if (VARIABLES.has(name) || ALLOWED_CONSTANTS.has(name) || ALLOWED_FUNCTIONS.has(name)) {
      throw new ParseError(expr, `Parameter name "${name}" is reserved.`);
    }
    const value = (params as Record<string, number>)[name];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new ParseError(expr, `Parameter "${name}" must be a finite number.`);
    }
  }
  return names;
}

function parseChecked(expr: string, paramNames: string[]): MathNode {
  if (typeof expr !== "string" || expr.trim() === "") {
    throw new ParseError(expr, "Expression is empty.");
  }
  let node: MathNode;
  try {
    node = math.parse(expr);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new ParseError(expr, `Could not parse expression: ${reason}`);
  }
  const allowedSymbols = new Set([...VARIABLES, ...ALLOWED_CONSTANTS, ...paramNames]);

  node.traverse((n: MathNode, path: string | null, parent: MathNode | null) => {
    if (!ALLOWED_NODE_TYPES.has(n.type)) {
      throw new ParseError(expr, describeForbiddenNode(n));
    }
    if (math.isConstantNode(n)) {
      if (typeof n.value !== "number") {
        throw new ParseError(expr, "Only numeric literals are allowed.");
      }
    } else if (math.isSymbolNode(n)) {
      // The callee symbol of a function call is validated at the FunctionNode.
      if (path === "fn" && parent !== null && math.isFunctionNode(parent)) return;
      if (!allowedSymbols.has(n.name)) {
        throw new ParseError(expr, unknownSymbolMessage(n.name, paramNames));
      }
    } else if (math.isFunctionNode(n)) {
      const fn = n.fn;
      if (!math.isSymbolNode(fn)) {
        throw new ParseError(expr, "Only plain function calls are allowed.");
      }
      if (!ALLOWED_FUNCTIONS.has(fn.name)) {
        throw new ParseError(
          expr,
          `Function "${fn.name}" is not allowed. Allowed functions: ${[...ALLOWED_FUNCTIONS].join(", ")}.`,
        );
      }
    } else if (math.isOperatorNode(n)) {
      if (!ALLOWED_OPERATORS.has(n.fn)) {
        throw new ParseError(expr, `Operator "${n.op}" is not allowed.`);
      }
    }
  });
  return node;
}

function describeForbiddenNode(n: MathNode): string {
  switch (n.type) {
    case "AssignmentNode":
    case "FunctionAssignmentNode":
      return "Assignments are not allowed; write an expression in x and y only.";
    case "BlockNode":
      return "Multiple statements are not allowed; write a single expression.";
    case "AccessorNode":
    case "IndexNode":
      return "Property access and indexing are not allowed.";
    case "ArrayNode":
    case "ObjectNode":
    case "RangeNode":
      return "Arrays, objects and ranges are not allowed; the expression must be a scalar.";
    default:
      return `Syntax "${n.type}" is not allowed.`;
  }
}

function unknownSymbolMessage(name: string, paramNames: string[]): string {
  const hint =
    name.length > 1 && /^[xyt]+$/.test(name)
      ? ` Did you mean "${name.split("").join("*")}"? Multiplication must be written explicitly.`
      : "";
  const known = ["x", "y", "t", "pi", "e", ...paramNames].join(", ");
  return `Unknown symbol "${name}".${hint} Allowed symbols: ${known}.`;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return NaN;
}

/** Compiles a scalar expression of x, y (and optionally t) into a fast evaluator. */
export function compileScalar(
  expr: string,
  params?: Record<string, number>,
): (p: Vec2, t?: number) => number {
  const paramNames = validateParams(expr, params);
  const code = parseChecked(expr, paramNames).compile();
  const scope: Scope = { ...(params ?? {}), x: 0, y: 0, t: 0 };
  return (p: Vec2, t = 0) => {
    scope.x = p.x;
    scope.y = p.y;
    scope.t = t;
    try {
      return toNumber(code.evaluate(scope));
    } catch {
      return NaN;
    }
  };
}

/** Compiles a planar system; both expressions share the parameter set. */
export function compileSystem(spec: SystemSpec): CompiledSystem {
  const f = compileScalar(spec.f, spec.params);
  const g = compileScalar(spec.g, spec.params);
  return {
    spec,
    eval(p: Vec2, t = 0): Vec2 {
      return { x: f(p, t), y: g(p, t) };
    },
  };
}
