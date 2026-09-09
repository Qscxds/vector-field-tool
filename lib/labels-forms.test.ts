import { describe, expect, it } from "vitest";
import { labels, type LabelTable } from "@/lib/labels";
import { identicallyZeroLine } from "@/lib/labels-forms";

describe("identicallyZeroLine", () => {
  const L = labels("en");
  it("renders nothing without the flag, and nothing for a non-boolean flag", () => {
    expect(identicallyZeroLine({}, L)).toBeNull();
    expect(identicallyZeroLine({ identicallyZero: false }, L)).toBeNull();
    expect(identicallyZeroLine({ identicallyZero: "yes" }, L)).toBeNull();
  });
  it("renders the tool.identicallyZero label verbatim when the flag is set and the label exists", () => {
    const withLabel = { ...L, tool: { ...L.tool, identicallyZero: "RHS is identically zero." } } as unknown as LabelTable;
    expect(identicallyZeroLine({ identicallyZero: true }, withLabel)).toBe("RHS is identically zero.");
  });
  it("never invents text: flag set but no label yields nothing", () => {
    const { identicallyZero: _drop, ...rest } = L.tool as Record<string, string>;
    void _drop;
    const withoutLabel = { ...L, tool: rest } as unknown as LabelTable;
    expect(identicallyZeroLine({ identicallyZero: true }, withoutLabel)).toBeNull();
  });
});
