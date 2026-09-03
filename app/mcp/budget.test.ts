import { describe, expect, it } from "vitest";
import { BudgetExceeded, makeCheckpoint } from "./budget";

describe("makeCheckpoint", () => {
  it("is silent before the deadline and throws once it has passed", () => {
    let t = 1000;
    const checkpoint = makeCheckpoint(50, () => t);
    t = 1049;
    expect(() => checkpoint()).not.toThrow();
    t = 1050;
    expect(() => checkpoint()).not.toThrow(); // deadline itself is still inside the budget
    t = 1051;
    expect(() => checkpoint()).toThrow(BudgetExceeded);
    try {
      checkpoint();
    } catch (e) {
      expect((e as BudgetExceeded).budgetMs).toBe(50);
      expect((e as BudgetExceeded).elapsedMs).toBe(51);
    }
  });
});
