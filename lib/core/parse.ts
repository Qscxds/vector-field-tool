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
 * - "second_order_*": the failures of lib/core/second-order.ts (the web shell shows a bilingual
 *   sentence per code; "second_order_unknown_symbol" carries the symbol in `symbol`).
 * Every other ParseError has no code.
 */
export type ParseErrorCode =
  | "x_in_first_order"
  | "lhs_in_expression"
  | "second_order_not_affine"
  | "second_order_zero_coefficient"
  | "second_order_no_equation"
  | "second_order_double_equals"
  | "second_order_too_many_equals"
  | "second_order_other_prime"
  | "second_order_higher_derivative"
  | "second_order_placeholder_typed"
  | "second_order_undefined_at_samples"
  | "second_order_unknown_symbol";

export class ParseError extends Error {
  readonly expr: string;
  readonly code?: ParseErrorCode;
  /** The offending symbol name, for the unknown-symbol codes. */
  readonly symbol?: string;
  constructor(expr: string, message: string, code?: ParseErrorCode, detail?: { symbol?: string }) {
    super(message);
    this.name = "ParseError";
    this.expr = expr;
    if (code) this.code = code;
    if (detail?.symbol !== undefined) this.symbol = detail.symbol;
  }
}

export type CompileOptions = {
  /** Symbol set of the expression; default "xy". See VariableMode in types.ts. */
  variables?: VariableMode;
};

/**
 * Options of the lower-level validator `parseValidated`. `symbols` REPLACES the mode's variable
 * set for one specific caller (lib/core/second-order.ts validates in {x, t, xd, xdd}: the
 * placeholders xd and xdd for x' and x'', and no y); the placeholders are rejected everywhere else
 * because only that caller passes them. `unknownSymbolMessage` lets such a caller word the
 * unknown-symbol error in its own notation (return undefined to keep the standard message), and
 * `unknownSymbolCode` gives that error a code (the symbol name travels in ParseError.symbol).
 */
export type ValidateOptions = CompileOptions & {
  symbols?: readonly string[];
  unknownSymbolMessage?: (name: string) => string | undefined;
  unknownSymbolCode?: ParseErrorCode;
};

export interface CompiledSystem {
  /** Evaluates (f, g) at a point; `t` defaults to 0 for autonomous use. Never throws. */
  eval(p: Vec2, t?: number): Vec2;
  /**
   * Rounding-error bounds of f and g at a point, from the expression's own terms (see
   * RoundingBound below). Optional: a system assembled by hand may lack it, and callers then fall
   * back to a stencil estimate.
   */
  roundingBound?(p: Vec2, t?: number): [RoundingBound, RoundingBound];
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

function parseChecked(expr: string, paramNames: string[], mode: VariableMode, opts: ValidateOptions = {}): MathNode {
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
  const allowedSymbols = new Set([...(opts.symbols ?? MODE_VARIABLES[mode]), ...ALLOWED_CONSTANTS, ...paramNames]);

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
          throw new ParseError(expr, opts.unknownSymbolMessage?.(n.name) ?? unknownSymbolMessage(n.name, paramNames, mode), opts.unknownSymbolCode, { symbol: n.name });
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
 * The mathjs instance behind the parser, for callers that work on the AST itself (lib/core/second-order.ts
 * substitutes symbols and simplifies). Never hand user text to its `evaluate`; go through
 * `parseValidated` / `compileScalar`.
 */
export const mathjs = math;

/**
 * Validates parameters and the expression against the whitelist and returns the AST (the first
 * half of compileScalar). Throws ParseError. Exported for lib/core/second-order.ts, which needs the
 * validated AST of an equation in its placeholder symbols before it can build the reduced system.
 */
export function parseValidated(expr: string, params?: Record<string, number>, opts: ValidateOptions = {}): MathNode {
  const mode: VariableMode = opts.variables ?? "xy";
  const paramNames = validateParams(expr, params);
  return parseChecked(expr, paramNames, mode, opts);
}

/**
 * Compiles an already validated AST into an evaluator (the second half of compileScalar). `expr`
 * is only used to label a compile failure. The AST must use the mode's symbols only.
 */
export function compileNode(
  expr: string,
  node: MathNode,
  params?: Record<string, number>,
  opts: CompileOptions = {},
): (p: Vec2, t?: number) => number {
  const mode: VariableMode = opts.variables ?? "xy";
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
  return compileNode(expr, parseValidated(expr, params, opts), params, opts);
}

/** Compiles a planar system; both expressions share the parameter set and the variable mode. */
export function compileSystem(spec: SystemSpec): CompiledSystem {
  const opts: CompileOptions = { variables: spec.variables };
  const fNode = parseValidated(spec.f, spec.params, opts);
  const gNode = parseValidated(spec.g, spec.params, opts);
  const f = compileNode(spec.f, fNode, spec.params, opts);
  const g = compileNode(spec.g, gNode, spec.params, opts);
  const fBound = compileBound(fNode, spec.params, opts);
  const gBound = compileBound(gNode, spec.params, opts);
  return {
    spec,
    eval(p: Vec2, t = 0): Vec2 {
      return { x: f(p, t), y: g(p, t) };
    },
    roundingBound(p: Vec2, t = 0): [RoundingBound, RoundingBound] {
      return [fBound(p, t), gBound(p, t)];
    },
  };
}

/**
 * Running rounding-error bound of an expression (review J-fix2 items 2, 3, 5).
 *
 * `value` is the same number `eval` returns; `error` is an upper bound on |computed - exact| built
 * from the magnitudes of the expression's OWN terms at the point, where "exact" means the value
 * of the expression at the double-precision point actually evaluated: coordinates and literals
 * are exact inputs (error 0; whether the point stands for the true root is the location
 * tolerance's business, never the residual's), every operation adds eps of its result, so a sum
 * carries the errors of its terms plus eps of the result (cos(x) - 1 near 0 is formed from terms
 * of size 1, so its error is ~2 eps whatever the tiny result), a product propagates
 * |a| e_b + |b| e_a, and a function propagates |f'(a)| e_a. Comparisons, sign, floor, ceil and round are treated as exact. `underflow` is
 * true when some multiplicative step (a product, quotient, power or exp) produced 0 or a subnormal
 * number from non-zero operands: the exact value is not zero, only unrepresentable, and a
 * computed 0 there is NOT evidence that the expression vanishes (exp(x) at x = -999). The flag
 * is sticky through the rest of the expression. Non-finite values give an Infinity error.
 */
export type RoundingBound = { value: number; error: number; underflow: boolean };

const EPS = 2.220446049250313e-16;
const MIN_NORMAL = 2.2250738585072014e-308;
type Bound = (scope: Scope) => RoundingBound;
const boundOf = (value: number, error: number, underflow: boolean): RoundingBound =>
  Number.isFinite(value) ? { value, error: error + EPS * Math.abs(value), underflow } : { value, error: Infinity, underflow };
/** An exact input (a coordinate or a literal): no rounding of its own. */
const exactInput = (value: number): RoundingBound => (Number.isFinite(value) ? { value, error: 0, underflow: false } : { value, error: Infinity, underflow: false });
const tiny = (v: number) => v === 0 || Math.abs(v) < MIN_NORMAL;
const NO_BOUND: RoundingBound = { value: NaN, error: Infinity, underflow: false };

function buildBound(node: MathNode): Bound {
  if (math.isParenthesisNode(node)) return buildBound(node.content);
  if (math.isConstantNode(node)) {
    const v = Number(node.value);
    return () => exactInput(v);
  }
  if (math.isSymbolNode(node)) {
    const name = node.name;
    if (name === "pi") return () => exactInput(Math.PI);
    if (name === "e") return () => exactInput(Math.E);
    return (scope) => exactInput(scope[name]);
  }
  if (math.isConditionalNode(node)) {
    const c = buildBound(node.condition), t = buildBound(node.trueExpr), f = buildBound(node.falseExpr);
    return (scope) => (c(scope).value ? t(scope) : f(scope));
  }
  const args = (math.isOperatorNode(node) || math.isFunctionNode(node) ? node.args : []).map(buildBound);
  const fn = math.isOperatorNode(node) ? node.fn : math.isFunctionNode(node) ? (node.fn as { name: string }).name : "";
  const unary = (op: (a: number) => number, deriv: (a: number, v: number) => number, underflows = false): Bound => {
    const [A] = args;
    return (scope) => {
      const a = A(scope);
      const v = op(a.value);
      return boundOf(v, Math.abs(deriv(a.value, v)) * a.error, a.underflow || (underflows && Number.isFinite(a.value) && tiny(v)));
    };
  };
  const binary = (
    op: (a: number, b: number) => number,
    err: (a: number, b: number, v: number, ea: number, eb: number) => number,
    underflows: (a: number, b: number, v: number) => boolean,
  ): Bound => {
    const [A, B] = args;
    return (scope) => {
      const a = A(scope), b = B(scope);
      const v = op(a.value, b.value);
      return boundOf(v, err(a.value, b.value, v, a.error, b.error), a.underflow || b.underflow || underflows(a.value, b.value, v));
    };
  };
  const exact = (op: (...a: number[]) => number): Bound => (scope) => {
    const vals = args.map((A) => A(scope));
    return boundOf(op(...vals.map((u) => u.value)), 0, vals.some((u) => u.underflow));
  };
  const never = () => false;
  switch (fn) {
    case "add": return binary((a, b) => a + b, (_a, _b, _v, ea, eb) => ea + eb, never);
    case "subtract": return binary((a, b) => a - b, (_a, _b, _v, ea, eb) => ea + eb, never);
    case "multiply": return binary((a, b) => a * b, (a, b, _v, ea, eb) => Math.abs(a) * eb + Math.abs(b) * ea, (a, b, v) => a !== 0 && b !== 0 && tiny(v));
    case "divide": return binary((a, b) => a / b, (_a, b, v, ea, eb) => (ea + Math.abs(v) * eb) / Math.abs(b), (a, b, v) => a !== 0 && Number.isFinite(b) && tiny(v));
    case "pow": return binary(
      (a, b) => a ** b,
      (a, b, v, ea, eb) => (a !== 0 ? Math.abs((b * v) / a) * ea : 0) + (a > 0 ? Math.abs(v * Math.log(a)) * eb : 0),
      (a, _b, v) => a !== 0 && tiny(v),
    );
    case "unaryMinus": return unary((a) => -a, () => 1);
    case "unaryPlus": return unary((a) => a, () => 1);
    case "smaller": return exact((a, b) => (a < b ? 1 : 0));
    case "larger": return exact((a, b) => (a > b ? 1 : 0));
    case "smallerEq": return exact((a, b) => (a <= b ? 1 : 0));
    case "largerEq": return exact((a, b) => (a >= b ? 1 : 0));
    case "equal": return exact((a, b) => (a === b ? 1 : 0));
    case "unequal": return exact((a, b) => (a !== b ? 1 : 0));
    case "sin": return unary(Math.sin, (a) => Math.cos(a));
    case "cos": return unary(Math.cos, (a) => Math.sin(a));
    case "tan": return unary(Math.tan, (_a, v) => 1 + v * v);
    case "asin": return unary(Math.asin, (a) => 1 / Math.sqrt(1 - a * a));
    case "acos": return unary(Math.acos, (a) => 1 / Math.sqrt(1 - a * a));
    case "atan": return unary(Math.atan, (a) => 1 / (1 + a * a));
    case "atan2": return binary(Math.atan2, (a, b, _v, ea, eb) => (Math.abs(b) * ea + Math.abs(a) * eb) / (a * a + b * b), never);
    case "sinh": return unary(Math.sinh, (a) => Math.cosh(a));
    case "cosh": return unary(Math.cosh, (a) => Math.sinh(a));
    case "tanh": return unary(Math.tanh, () => 1);
    case "exp": return unary(Math.exp, (_a, v) => v, true);
    case "log": return args.length === 2
      ? binary((a, b) => Math.log(a) / Math.log(b), (a, b, v, ea, eb) => (ea / Math.abs(a) + (Math.abs(v) * eb) / Math.abs(b)) / Math.abs(Math.log(b)), never)
      : unary(Math.log, (a) => 1 / a);
    case "log10": return unary(Math.log10, (a) => 1 / (a * Math.LN10));
    case "sqrt": return unary(Math.sqrt, (_a, v) => (v > 0 ? 1 / (2 * v) : 0));
    case "abs": return unary(Math.abs, () => 1);
    case "sign": return exact(Math.sign);
    case "floor": return exact(Math.floor);
    case "ceil": return exact(Math.ceil);
    case "round": return exact((a, d) => (d === undefined ? Math.round(a) : Math.round(a * 10 ** d) / 10 ** d));
    case "min": case "max": return (scope) => {
      const vals = args.map((A) => A(scope));
      const v = fn === "min" ? Math.min(...vals.map((u) => u.value)) : Math.max(...vals.map((u) => u.value));
      // The error of the selected argument, or of every argument within that error of the selection (a near tie).
      const chosen = vals.find((u) => u.value === v);
      const err = chosen ? Math.max(...vals.filter((u) => Math.abs(u.value - v) <= u.error + chosen.error).map((u) => u.error)) : Infinity;
      return boundOf(v, err, vals.some((u) => u.underflow));
    };
    default:
      // A node the whitelist admits but this analysis does not know: no bound.
      return () => NO_BOUND;
  }
}

/**
 * Compiles a validated AST into a rounding-bound evaluator (see RoundingBound); the same scope
 * rules as compileNode. Never throws at evaluation time (a failure gives {NaN, Infinity, false}).
 */
export function compileBound(node: MathNode, params?: Record<string, number>, opts: CompileOptions = {}): (p: Vec2, t?: number) => RoundingBound {
  const mode: VariableMode = opts.variables ?? "xy";
  const bound = buildBound(node);
  const scope: Scope = { ...(params ?? {}), x: 0, y: 0, t: 0 };
  return (p: Vec2, t = 0) => {
    if (mode === "ty") { scope.t = p.x; scope.y = p.y; } else { scope.x = p.x; scope.y = p.y; scope.t = t; }
    try {
      return bound(scope);
    } catch {
      return NO_BOUND;
    }
  };
}
