import { describe, expect, it } from "vitest";
import { coordinateNames, coordinateNamesForMode } from "./coordinate-names";

describe("coordinateNames (round P: every symbol a student sees exists in their own problem)", () => {
  it("a first-order scene is (t, y), a planar one (x, y), a second-order one (x, x')", () => {
    expect(coordinateNames({ system: { f: "1", g: "y", variables: "ty" } })).toEqual({ hv: "t", vv: "y" });
    expect(coordinateNames({ system: { f: "y", g: "-x" } })).toEqual({ hv: "x", vv: "y" });
    expect(coordinateNames({ system: { f: "y", g: "-x" }, secondOrder: { equation: "x'' + x = 0", reduced: { f: "v", g: "-x" } } })).toEqual({ hv: "x", vv: "x'" });
    // A scene without a system (ping) still has names, so a shell never prints "undefined".
    expect(coordinateNames({})).toEqual({ hv: "x", vv: "y" });
  });

  it("the web shell's modes map the same way", () => {
    expect(coordinateNamesForMode("first")).toEqual({ hv: "t", vv: "y" });
    expect(coordinateNamesForMode("diff")).toEqual({ hv: "t", vv: "y" });
    expect(coordinateNamesForMode("system")).toEqual({ hv: "x", vv: "y" });
    expect(coordinateNamesForMode("second")).toEqual({ hv: "x", vv: "x'" });
  });
});
