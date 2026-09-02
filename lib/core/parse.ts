/**
 * Expression parsing and compilation on top of mathjs.
 *
 * Security model: this endpoint will be public, so user text is never handed to `math.evaluate`.
 * We parse to an AST, walk it against a strict whitelist (node kinds, symbols, functions with their
 * arity, operators, finite numeric literals only) and only then compile. Anything outside the
 * whitelist is a ParseError that names the offending token. Parser and compiler exceptions of any
 * kind (including stack overflow on absurdly nested input) become ParseErrors too.
 *
 * Evaluation is hot (tens of thousands of calls per request), so a system is compiled once and
 * evaluated with a reused scope object. Non-finite results (1/x at 0, sqrt(-1) -> NaN) are legal
 * and returned as-is; callers decide what to do with them. Evaluation never throws.
 *
 * mathjs is configured for plain numbers with comparisons exact to machine precision, and `pow` is
 * replaced by the JS operator: mathjs' own pow probes rational exponents through fraction.js for
 * negative bases, which costs tens of milliseconds per call (a CPU denial-of-service from a
 * seven-character expression).
 */
import { all, create, type MathNode } from "mathjs";
import type { SystemSpec, Vec2 } from "./types";

// predictable: true makes sqrt(-1), log(-1), ... return NaN instead of a Complex number.
// relTol 1e-15 / absTol 0: comparisons are exact up to machine precision (mathjs defaults to a
// 1e-12 "nearly equal" band). relTol cannot go lower: floor/ceil/round derive a decimal count from
// it and reject more than 15 digits.
const math = create(all, { predictable: true, number: "number", matrix: "Array", relTol: 1e-15, absTol: 0 });
math.import({ pow: (base: number, exponent: number): number => base ** exponent }, { override: true });

/** name -> [minArgs, maxArgs] */
export const ALLOWED_FUNCTIONS: ReadonlyMap<string, readonly [number, number]> = new Map([
  ["sin", [1, 1]], ["cos", [1, 1]], ["tan", [1, 1]],
  ["asin", [1, 1]], ["acos", [1, 1]], ["atan", [1, 1]], ["atan2", [2, 2]],
  ["sinh", [1, 1]], ["cosh", [1, 1]], ["tanh", [1, 1]],
  ["exp", [1, 1]], ["log", [1, 2]], ["log10", [1, 1]], ["sqrt", [1, 1]],
  ["abs", [1, 1]], ["sign", [1, 1]], ["pow", [2, 2]],
  ["min", [1, Infinity]], ["max", [1, Infinity]],
  ["floor", [1, 1]], ["ceil", [1, 1]], ["round", [1, 2]],
]);

export const ALLOWED_CONSTANTS: ReadonlySet<string> = new Set(["pi", "e"]);
export const VARIABLES: ReadonlySet<string> = new Set(["x", "y", "t"]);

/** Names that mathjs or JavaScript would interpret before our scope does. */
const RESERVED_NAMES: ReadonlySet<string> = new Set([
  "Infinity", "NaN", "undefined", "null", "true", "false", "i", "E", "PI", "version", "end",
]);

/** mathjs internal function names behind operators (OperatorNode.fn). */
const ALLOWED_OPERATORS: ReadonlySet<string> = new Set([
  "add", "subtract", "multiply", "divide", "pow",
  "unaryMinus", "unaryPlus",
  "smaller", "larger", "smallerEq", "largerEq", "equal", "unequal",
]);

const ALLOWED_NODE_TYPES: ReadonlySet<string> = new Set([
  "ConstantNode", "SymbolNode", "OperatorNode", "FunctionNode", "ParenthesisNode", "ConditionalNode",
]);

export const MAX_EXPRESSION_LENGTH = 500;

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
    if (
      VARIABLES.has(name) || ALLOWED_CONSTANTS.has(name) || ALLOWED_FUNCTIONS.has(name) ||
      RESERVED_NAMES.has(name) || name in Object.prototype || name.startsWith("__")
    ) {
      throw new ParseError(expr, `Parameter name "${name}" is reserved.`);
    }
    const value = (params as Record<string, number>)[name];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new ParseError(expr, `Parameter "${name}" must be a finite number.`);
    }
  }
  return names;
}

function toParseError(expr: string, cause: unknown, fallback: string): ParseError {
  if (cause instanceof ParseError) return cause;
  const reason = cause instanceof RangeError ? "expression is too deeply nested" : cause instanceof Error ? cause.message : String(cause);
  return new ParseError(expr, `${fallback}: ${reason}`);
}

function parseChecked(expr: string, paramNames: string[]): MathNode {
  if (typeof expr !== "string" || expr.trim() === "") {
    throw new ParseError(expr, "Expression is empty.");
  }
  if (expr.length > MAX_EXPRESSION_LENGTH) {
    throw new ParseError(expr, `Expression is too long (${expr.length} characters, maximum ${MAX_EXPRESSION_LENGTH}).`);
  }
  let node: MathNode;
  try {
    node = math.parse(expr);
  } catch (cause) {
    throw toParseError(expr, cause, "Could not parse expression");
  }
  const allowedSymbols = new Set([...VARIABLES, ...ALLOWED_CONSTANTS, ...paramNames]);

  try {
    node.traverse((n: MathNode, path: string | null, parent: MathNode | null) => {
      if (!ALLOWED_NODE_TYPES.has(n.type)) {
        throw new ParseError(expr, describeForbiddenNode(n));
      }
      if (math.isConstantNode(n)) {
        if (typeof n.value !== "number" || !Number.isFinite(n.value)) {
          throw new ParseError(expr, "Only finite numeric literals are allowed.");
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
        const arity = ALLOWED_FUNCTIONS.get(fn.name);
        if (!arity) {
          const hint = allowedSymbols.has(fn.name)
            ? ` "${fn.name}" is a variable or parameter; write "${fn.name}*(...)" for multiplication.`
            : ` Allowed functions: ${[...ALLOWED_FUNCTIONS.keys()].join(", ")}.`;
          throw new ParseError(expr, `Function "${fn.name}" is not allowed.${hint}`);
        }
        const [minArgs, maxArgs] = arity;
        if (n.args.length < minArgs || n.args.length > maxArgs) {
          const expected = minArgs === maxArgs ? `${minArgs}` : maxArgs === Infinity ? `at least ${minArgs}` : `${minArgs} to ${maxArgs}`;
          throw new ParseError(expr, `Function "${fn.name}" expects ${expected} argument(s), got ${n.args.length}.`);
        }
      } else if (math.isOperatorNode(n)) {
        // Note: mathjs parses "50%" as 50/100 (an ordinary divide node); that is acceptable arithmetic.
        if (!ALLOWED_OPERATORS.has(n.fn)) {
          throw new ParseError(expr, `Operator "${n.op}" is not allowed.`);
        }
      }
    });
  } catch (cause) {
    throw toParseError(expr, cause, "Could not validate expression");
  }
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
    case "RelationalNode":
      return "Chained comparisons like 0 < x < 1 are not allowed; combine two comparisons with a conditional instead.";
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
  const node = parseChecked(expr, paramNames);
  let code: { evaluate: (scope: Scope) => unknown };
  try {
    code = node.compile();
  } catch (cause) {
    throw toParseError(expr, cause, "Could not compile expression");
  }
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
