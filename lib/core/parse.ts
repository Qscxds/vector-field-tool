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
import type { SystemSpec, VariableMode, Vec2 } from "./types";

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
/** Reserved variable names in every mode: a parameter may never be called x, y or t. */
export const VARIABLES: ReadonlySet<string> = new Set(["x", "y", "t"]);
/** Variable symbols an expression may use, per mode (see VariableMode in types.ts). */
export const MODE_VARIABLES: Readonly<Record<VariableMode, readonly string[]>> = {
  xy: ["x", "y", "t"],
  ty: ["t", "y"],
};

/** Readable messages behind the ParseError codes; the web shell shows its own bilingual text. */
export const X_IN_FIRST_ORDER_MESSAGE =
  "In a first-order equation the independent variable is t (dy/dt = g(t, y)); write t instead of x.";
/** A left-hand side pasted into a first-order expression ("ty" mode). */
export const LHS_IN_EXPRESSION_MESSAGE = 'Enter only the right-hand side of the equation; the "dy/dt =" part is implied.';
/** A left-hand side pasted into a planar-system expression ("xy" mode), where x is a state variable. */
export const LHS_IN_SYSTEM_MESSAGE = 'Enter only the right-hand side of the equation; the "x\' =" / "y\' =" part is implied.';
/** Appended when a lone "=" (not ==, <=, >=, !=) made the text an assignment or a syntax error. */
export const COMPARISON_HINT = "If you meant a comparison, write ==.";

/**
 * A left-hand side at the start of the text: dy/dx =, dy/dt =, y' =, x' =, y′ = (unicode prime),
 * y = or x =. A comparison "y == 0" is not a left-hand side. Group 1 is the differential's
 * variable (x or t) when the text starts with dy/d?; group 2 is set for the bare "y =" / "x ="
 * alternative, which only counts as a left-hand side when no "?" follows (see assertNoLeftHandSide).
 */
const LHS_PATTERN = /^(?:d\s*y\s*\/\s*d\s*([xt])|[xy]\s*['′]|([xy]))\s*=(?!=)/;

/** True when the text contains an "=" that is not part of ==, <=, >=, != (a likely typo for ==). */
function hasLoneEquals(expr: string): boolean {
  return /(^|[^=<>!])=(?!=)/.test(expr);
}

function withComparisonHint(expr: string, message: string): string {
  return hasLoneEquals(expr) ? `${message} ${COMPARISON_HINT}` : message;
}

/**
 * Throws ParseError code "lhs_in_expression" (with `expr` as given) when the text starts with a
 * left-hand side. The message is mode-aware: "ty" mode names "dy/dt =" and adds the
 * t-instead-of-x sentence only when the pasted side was dy/dx; "xy" mode names "x' =" / "y' ="
 * and never mentions t (x is a state variable there). A bare "y =" / "x =" followed by a "?"
 * later in the text is a comparison typo ("y = 0 ? 1 : -1"), not a left-hand side: it is left to
 * the parser, whose error then hints at "==". The dy/dx =, dy/dt =, y' =, x' = forms always count.
 * Kernel entry points that wrap an expression before compiling it (-(g), -(M)) call this on the
 * raw text first, so the error always carries what the student typed.
 */
export function assertNoLeftHandSide(expr: string, mode: VariableMode): void {
  if (typeof expr !== "string") return;
  const trimmed = expr.trim();
  const lhs = LHS_PATTERN.exec(trimmed);
  if (!lhs) return;
  if (lhs[2] !== undefined && trimmed.slice(lhs[0].length).includes("?")) return;
  if (mode === "xy") throw new ParseError(expr, LHS_IN_SYSTEM_MESSAGE, "lhs_in_expression");
  const message = lhs[1] === "x" ? `${LHS_IN_EXPRESSION_MESSAGE} ${X_IN_FIRST_ORDER_MESSAGE}` : LHS_IN_EXPRESSION_MESSAGE;
  throw new ParseError(expr, message, "lhs_in_expression");
}

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

/**
 * Machine-readable reason for the ParseErrors a shell may want to explain in its own words:
 * - "x_in_first_order": the symbol x in "ty" mode (the student meant t).
 * - "lhs_in_expression": the text starts with a left-hand side such as "dy/dt =" or "y' =".
 * Every other ParseError has no code.
 */
export type ParseErrorCode = "x_in_first_order" | "lhs_in_expression";

export class ParseError extends Error {
  readonly expr: string;
  readonly code?: ParseErrorCode;
  constructor(expr: string, message: string, code?: ParseErrorCode) {
    super(message);
    this.name = "ParseError";
    this.expr = expr;
    if (code) this.code = code;
  }
}

export type CompileOptions = {
  /** Symbol set of the expression; default "xy". See VariableMode in types.ts. */
  variables?: VariableMode;
};

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

/** In "ty" mode a symbol made of x, y, t letters that contains x (x, xy, xt ...) was meant with x. */
function isXSymbol(name: string, mode: VariableMode): boolean {
  return mode === "ty" && /^[xyt]*x[xyt]*$/.test(name);
}

function parseChecked(expr: string, paramNames: string[], mode: VariableMode): MathNode {
  if (typeof expr !== "string" || expr.trim() === "") {
    throw new ParseError(expr, "Expression is empty.");
  }
  if (expr.length > MAX_EXPRESSION_LENGTH) {
    throw new ParseError(expr, `Expression is too long (${expr.length} characters, maximum ${MAX_EXPRESSION_LENGTH}).`);
  }
  // Before mathjs: "y' = t" and "dy/dx = x" are mathjs syntax errors and "y = t" is an assignment;
  // all three must be reported as a left-hand side, not as a generic parse failure.
  assertNoLeftHandSide(expr, mode);
  let node: MathNode;
  try {
    node = math.parse(expr);
  } catch (cause) {
    const error = toParseError(expr, cause, "Could not parse expression");
    throw new ParseError(expr, withComparisonHint(expr, error.message));
  }
  const allowedSymbols = new Set([...MODE_VARIABLES[mode], ...ALLOWED_CONSTANTS, ...paramNames]);

  try {
    node.traverse((n: MathNode, path: string | null, parent: MathNode | null) => {
      if (!ALLOWED_NODE_TYPES.has(n.type)) {
        const message = describeForbiddenNode(n, mode);
        // "y = 0 ? 1 : -1" parses as an assignment: the student most likely meant ==.
        throw new ParseError(expr, n.type === "AssignmentNode" ? withComparisonHint(expr, message) : message);
      }
      if (math.isConstantNode(n)) {
        if (typeof n.value !== "number" || !Number.isFinite(n.value)) {
          throw new ParseError(expr, "Only finite numeric literals are allowed.");
        }
      } else if (math.isSymbolNode(n)) {
        // The callee symbol of a function call is validated at the FunctionNode.
        if (path === "fn" && parent !== null && math.isFunctionNode(parent)) return;
        if (!allowedSymbols.has(n.name)) {
          if (isXSymbol(n.name, mode)) throw new ParseError(expr, X_IN_FIRST_ORDER_MESSAGE, "x_in_first_order");
          throw new ParseError(expr, unknownSymbolMessage(n.name, paramNames, mode));
        }
      } else if (math.isFunctionNode(n)) {
        const fn = n.fn;
        if (!math.isSymbolNode(fn)) {
          throw new ParseError(expr, "Only plain function calls are allowed.");
        }
        const arity = ALLOWED_FUNCTIONS.get(fn.name);
        if (!arity) {
          // "x(t+1)" in first-order mode: the student used x as a variable, not as a function.
          if (isXSymbol(fn.name, mode)) throw new ParseError(expr, X_IN_FIRST_ORDER_MESSAGE, "x_in_first_order");
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

function describeForbiddenNode(n: MathNode, mode: VariableMode): string {
  const vars = mode === "ty" ? "t and y" : "x and y";
  switch (n.type) {
    case "AssignmentNode":
    case "FunctionAssignmentNode":
      return `Assignments are not allowed; write an expression in ${vars} only.`;
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
      return `Chained comparisons like 0 < ${mode === "ty" ? "t" : "x"} < 1 are not allowed; combine two comparisons with a conditional instead.`;
    default:
      return `Syntax "${n.type}" is not allowed.`;
  }
}

function unknownSymbolMessage(name: string, paramNames: string[], mode: VariableMode): string {
  const letters = mode === "ty" ? /^[ty]+$/ : /^[xyt]+$/;
  const hint =
    name.length > 1 && letters.test(name)
      ? ` Did you mean "${name.split("").join("*")}"? Multiplication must be written explicitly.`
      : "";
  const known = [...MODE_VARIABLES[mode], "pi", "e", ...paramNames].join(", ");
  return `Unknown symbol "${name}".${hint} Allowed symbols: ${known}.`;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return NaN;
}

/**
 * Compiles a scalar expression into a fast evaluator of a kernel point {x, y}.
 * - "xy" (default): symbols x, y and the time t; the evaluator's second argument is t.
 * - "ty": symbols t and y only; t is bound to p.x (the horizontal coordinate), y to p.y, and the
 *   time argument is ignored. x is not in the scope at all, so a stray x can never evaluate.
 * In both modes the returned function never throws.
 */
export function compileScalar(
  expr: string,
  params?: Record<string, number>,
  opts: CompileOptions = {},
): (p: Vec2, t?: number) => number {
  const mode: VariableMode = opts.variables ?? "xy";
  const paramNames = validateParams(expr, params);
  const node = parseChecked(expr, paramNames, mode);
  let code: { evaluate: (scope: Scope) => unknown };
  try {
    code = node.compile();
  } catch (cause) {
    throw toParseError(expr, cause, "Could not compile expression");
  }
  if (mode === "ty") {
    const scope: Scope = { ...(params ?? {}), t: 0, y: 0 };
    return (p: Vec2) => {
      scope.t = p.x;
      scope.y = p.y;
      try {
        return toNumber(code.evaluate(scope));
      } catch {
        return NaN;
      }
    };
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

/** Compiles a planar system; both expressions share the parameter set and the variable mode. */
export function compileSystem(spec: SystemSpec): CompiledSystem {
  const opts: CompileOptions = { variables: spec.variables };
  const f = compileScalar(spec.f, spec.params, opts);
  const g = compileScalar(spec.g, spec.params, opts);
  return {
    spec,
    eval(p: Vec2, t = 0): Vec2 {
      return { x: f(p, t), y: g(p, t) };
    },
  };
}
