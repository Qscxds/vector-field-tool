import { describe, expect, it } from "vitest";
import { initialValueNames, parseInitialValue } from "./initial-value";
import { decodeState, DEFAULT_STATE, encodeState, MAX_ABS_VALUE } from "./url-state";

describe("parseInitialValue", () => {
  it("accepts the decimal forms a student types, with whitespace, and returns (horizontal, y)", () => {
    expect(parseInitialValue("1", "-2")).toEqual({ ok: true, point: { x: 1, y: -2 } });
    expect(parseInitialValue(" 0.5 ", ".25")).toEqual({ ok: true, point: { x: 0.5, y: 0.25 } });
    expect(parseInitialValue("1e-3", "-0")).toEqual({ ok: true, point: { x: 0.001, y: -0 } });
  });

  it("allows a point outside the entered box (the stop box is 20x the box), up to the link's bound", () => {
    expect(parseInitialValue("50", "-50")).toEqual({ ok: true, point: { x: 50, y: -50 } });
    expect(parseInitialValue(String(MAX_ABS_VALUE), "0")).toEqual({ ok: true, point: { x: MAX_ABS_VALUE, y: 0 } });
    expect(parseInitialValue(String(MAX_ABS_VALUE * 10), "0")).toEqual({ ok: false, reason: "outOfRange", field: "first" });
  });

  it("names the first failing field: empty, not a number, not finite", () => {
    expect(parseInitialValue("", "1")).toEqual({ ok: false, reason: "empty", field: "first" });
    expect(parseInitialValue("1", "   ")).toEqual({ ok: false, reason: "empty", field: "second" });
    expect(parseInitialValue("pi", "1")).toEqual({ ok: false, reason: "notANumber", field: "first" });
    expect(parseInitialValue("1", "1,5")).toEqual({ ok: false, reason: "notANumber", field: "second" });
    expect(parseInitialValue("1/2", "1")).toEqual({ ok: false, reason: "notANumber", field: "first" });
    expect(parseInitialValue("Infinity", "1")).toEqual({ ok: false, reason: "notANumber", field: "first" });
    expect(parseInitialValue("NaN", "1")).toEqual({ ok: false, reason: "notANumber", field: "first" });
  });

  it("an accepted point encodes into the link's traj like a clicked one and decodes back", () => {
    const r = parseInitialValue("1.5", "-0.25");
    if (!r.ok) throw new Error("expected ok");
    const query = encodeState({ ...DEFAULT_STATE, trajectoryStarts: [r.point] });
    expect(query).toContain("traj=1.5,-0.25");
    expect(decodeState(query, DEFAULT_STATE).state.trajectoryStarts).toEqual([r.point]);
  });
});

describe("initialValueNames", () => {
  it("reads (t₀, y₀) on a first-order picture and (x₀, y₀) on a planar one", () => {
    expect(initialValueNames("ty")).toEqual({ first: "t₀", second: "y₀" });
    expect(initialValueNames("xy")).toEqual({ first: "x₀", second: "y₀" });
  });
});
