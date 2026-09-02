import { describe, expect, it } from "vitest";
import { CORE_NAME, echo, hello } from "./hello";

describe("hello", () => {
  it("greets the world by default", () => {
    expect(hello()).toBe("hello, world");
  });

  it("greets by name", () => {
    expect(hello("Euler")).toBe("hello, Euler");
  });

  it("exposes a core name", () => {
    expect(CORE_NAME).toBe("vector-field-tool/core");
  });
});

describe("echo", () => {
  it("returns the input unchanged", () => {
    expect(echo("ping")).toBe("ping");
  });

  it("does not touch empty strings or unicode", () => {
    expect(echo("")).toBe("");
    expect(echo("dx/dt = y, dy/dt = -x ✓")).toBe("dx/dt = y, dy/dt = -x ✓");
  });
});
