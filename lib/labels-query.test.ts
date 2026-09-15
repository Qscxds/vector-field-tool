import { describe, expect, it } from "vitest";
import type { QueryHit } from "./core/query";
import { labels } from "./labels";
import { queryLines, queryTargetText } from "./labels-query";
import type { Scene } from "./scene";

/** A hit of a time target (time error 0): x'' + x = 0 from (1, 0) at t = pi has x = -1, x' = 0. */
const hit: QueryHit = { t: Math.PI, x: -1, y: 2e-7, error: { t: 0, position: 1.1e-5 }, speed: 1 };

describe("queryTargetText", () => {
  it("names the target as the student reads it: t, x, y, and x' on a second-order picture (round P)", () => {
    const L = labels("en");
    const q = (kind: "t" | "x" | "y"): Scene["query"] => ({ target: { kind, value: 0.5 }, hits: [], note: "ok", reached: true });
    expect(queryTargetText(q("t")!, L)).toBe("t = 0.5");
    expect(queryTargetText(q("x")!, L)).toBe("x = 0.5");
    expect(queryTargetText(q("y")!, L)).toBe("y = 0.5");
    expect(queryTargetText(q("y")!, L, true)).toBe("x' = 0.5");
    expect(queryTargetText(q("t")!, L, true)).toBe("t = 0.5");
    expect(queryTargetText(q("y")!, labels("zh"), true)).toBe("x' = 0.5");
  });
});

describe("queryLines", () => {
  const query: NonNullable<Scene["query"]> = { target: { kind: "t", value: Math.PI }, hits: [hit], note: "ok", reached: true };

  it("a planar scene prints (x, y); a second-order scene prints (x, x') and never a lone y, in both languages", () => {
    const planar: Pick<Scene, "system" | "query" | "secondOrder"> = { system: { f: "y", g: "-x" }, query };
    const second: Pick<Scene, "system" | "query" | "secondOrder"> = { ...planar, secondOrder: { equation: "x'' + x = 0", reduced: { f: "v", g: "-x" } } };
    for (const locale of ["en", "zh"] as const) {
      const L = labels(locale);
      const [planarLine] = queryLines(planar, L);
      const [secondLine] = queryLines(second, L);
      expect(planarLine).toContain("(x, y) = (-1, 2e-7)");
      expect(secondLine).toContain("(x, x') = (-1, 2e-7)");
      expect(secondLine).toContain("t = 3.141593");
      expect(secondLine).not.toMatch(/(^|[^A-Za-z'])y(?![A-Za-z])/);
      // The accuracy sentence closes both.
      expect(queryLines(second, L).at(-1)).toBe(L.tool.queryAccuracy);
    }
  });
});
