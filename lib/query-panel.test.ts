import { describe, expect, it } from "vitest";
import type { QueryHit, QueryNote } from "./core/query";
import { labels } from "./labels";
import { queryNoteText } from "./labels-query";
import { errorDigits, kernelQueryKind, parseQueryValue, queryHitText, queryKindsFor, roundToError, selectedTrajectoryIndex, trajectoryOptionText } from "./query-panel";

describe("student kind -> kernel kind", () => {
  it("first-order picture: t is the horizontal coordinate (kernel x), y is y, x does not exist", () => {
    expect(queryKindsFor("ty")).toEqual(["t", "y"]);
    expect(kernelQueryKind("ty", "t")).toBe("x");
    expect(kernelQueryKind("ty", "y")).toBe("y");
    expect(() => kernelQueryKind("ty", "x")).toThrow(RangeError);
  });

  it("planar picture: t is the absolute time, x and y the coordinates", () => {
    expect(queryKindsFor("xy")).toEqual(["t", "x", "y"]);
    expect(kernelQueryKind("xy", "t")).toBe("time");
    expect(kernelQueryKind("xy", "x")).toBe("x");
    expect(kernelQueryKind("xy", "y")).toBe("y");
  });
});

describe("parseQueryValue (the initial-value rule)", () => {
  it("accepts finite decimals within the link's bound and names the failure otherwise", () => {
    expect(parseQueryValue(" 2.5 ")).toEqual({ ok: true, value: 2.5 });
    expect(parseQueryValue("-1e-3")).toEqual({ ok: true, value: -0.001 });
    expect(parseQueryValue("")).toEqual({ ok: false, reason: "empty" });
    expect(parseQueryValue("pi")).toEqual({ ok: false, reason: "notANumber" });
    // MAX_ABS_VALUE is 1e6 (lib/url-state).
    expect(parseQueryValue("1e9")).toEqual({ ok: false, reason: "outOfRange" });
  });
});

describe("errorDigits / roundToError (2 significant digits of the error; the value to its last decimal)", () => {
  it("0.00123 -> 0.0012 at 4 decimals; 12.3 -> 12 at 0; 0.5 -> 0.50 at 2; 123 -> 120 at 0", () => {
    expect(errorDigits(0.00123)).toEqual({ text: "0.0012", decimals: 4 });
    expect(errorDigits(12.3)).toEqual({ text: "12", decimals: 0 });
    expect(errorDigits(0.5)).toEqual({ text: "0.50", decimals: 2 });
    expect(errorDigits(123)).toEqual({ text: "120", decimals: 0 });
    // Exact powers of ten keep their own exponent: 0.001 -> "0.0010" (2 significant digits).
    expect(errorDigits(0.001)).toEqual({ text: "0.0010", decimals: 4 });
  });

  it("below 1e-3 the error is printed in exponent form; the decimals still follow its last digit", () => {
    // 2.3e-7: last significant digit at 1e-8 -> 8 decimals.
    expect(errorDigits(2.3e-7)).toEqual({ text: "2.3e-7", decimals: 8 });
    expect(errorDigits(0.00074)).toEqual({ text: "7.4e-4", decimals: 5 });
  });

  it("a zero or non-finite error says nothing about the digits: '0' and 6 decimals", () => {
    expect(errorDigits(0)).toEqual({ text: "0", decimals: 6 });
    expect(errorDigits(NaN)).toEqual({ text: "0", decimals: 6 });
  });

  it("rounds the value to the error's last decimal, never showing digits the estimate does not support", () => {
    expect(roundToError(1.23456789, 0.00123)).toBe("1.2346");
    expect(roundToError(3.14159, 0.5)).toBe("3.14");
    expect(roundToError(100.7, 12.3)).toBe("101");
    // ln 2 = 0.6931471805599453 to 8 decimals.
    expect(roundToError(0.6931471805599453, 2.3e-7)).toBe("0.69314718");
    expect(roundToError(-1.23456, 0.0012)).toBe("-1.2346");
    // A negative zero at this precision is 0.
    expect(roundToError(-0.0001, 0.5)).toBe("0.00");
  });
});

describe("queryHitText", () => {
  const hit = (t: number, x: number, y: number, tError: number, position: number): QueryHit => ({ t, x, y, error: { t: tError, position } });

  it("planar, coordinate crossing: the time with its own bracket, the point rounded to the position error", () => {
    // Position error 3.4e-5: 6 decimals; time error 1.2e-9: 10 decimals. -4e-7 rounds to 0.000000 (no minus sign).
    const text = queryHitText(hit(1.5707963, -0.0000004, -1.0000003, 1.2e-9, 3.4e-5), "xy", labels("en"));
    expect(text).toBe("t = 1.5707963000 (±1.2e-9), x = 0.000000, y = -1.000000 (±3.4e-5)");
  });

  it("planar, time target (time error 0): the time is exact and gets no bracket, rounded like the coordinates", () => {
    const text = queryHitText(hit(3.141593, -1, 0.0000002, 0, 1.1e-5), "xy", labels("en"));
    expect(text).toBe("t = 3.141593, x = -1.000000, y = 0.000000 (±1.1e-5)");
  });

  it("first-order picture: t is the hit's horizontal coordinate, no separate time; Chinese punctuation in zh", () => {
    // e^2 = 7.389056...; position error 0.00074 -> 5 decimals, printed as 7.4e-4.
    const h = hit(2, 2, 7.389056, 0, 0.00074);
    expect(queryHitText(h, "ty", labels("en"))).toBe("t = 2.00000, y = 7.38906 (±7.4e-4)");
    expect(queryHitText(h, "ty", labels("zh"))).toBe("t = 2.00000，y = 7.38906（±7.4e-4）");
  });
});

describe("queryNoteText", () => {
  it("every kernel note has a sentence in both languages except ok", () => {
    const notes: QueryNote[] = ["ok", "not_reached_in_span", "stopped_before_target", "possibly_more_beyond_span", "target_is_start"];
    for (const locale of ["zh", "en"] as const) {
      const L = labels(locale);
      expect(queryNoteText("ok", L)).toBeNull();
      for (const note of notes.slice(1)) expect(queryNoteText(note, L), `${locale} ${note}`).toBeTruthy();
      expect(queryNoteText("not_reached_in_span", L)).toBe(L.tool.queryNotReached);
      expect(queryNoteText("stopped_before_target", L)).toBe(L.tool.queryStoppedBefore);
      expect(queryNoteText("possibly_more_beyond_span", L)).toBe(L.tool.queryMoreBeyond);
      expect(queryNoteText("target_is_start", L)).toBe(L.tool.queryTargetIsStart);
    }
  });
});

describe("selectedTrajectoryIndex", () => {
  const a = { x: 0, y: 1 };
  const b = { x: 1, y: 2 };
  const c = { x: 2, y: 3 };
  const d = { x: 3, y: 4 };

  it("no trajectories: null; no pick: the most recently added", () => {
    expect(selectedTrajectoryIndex([], null)).toBeNull();
    expect(selectedTrajectoryIndex([a, b, c], null)).toBe(2);
  });

  it("a pick holds while its start exists and nothing was added; an add selects the new curve", () => {
    expect(selectedTrajectoryIndex([a, b, c], { start: a, count: 3 })).toBe(0);
    expect(selectedTrajectoryIndex([a, b, c, d], { start: a, count: 3 })).toBe(3);
  });

  it("deleting another curve keeps the pick (by value); deleting the picked one falls back to the newest", () => {
    expect(selectedTrajectoryIndex([a, c], { start: { x: 0, y: 1 }, count: 3 })).toBe(0);
    expect(selectedTrajectoryIndex([a, c], { start: b, count: 3 })).toBe(1);
  });

  it("option text is the start point at 4 digits", () => {
    expect(trajectoryOptionText({ x: 0.5, y: -1.23456 })).toBe("(0.5, -1.2346)");
  });
});
