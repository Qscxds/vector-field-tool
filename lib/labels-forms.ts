/**
 * First-order form lines shared by the web shell and the widget (pure; the tool summary in
 * app/mcp/tools.ts prints the same facts in its own line order).
 */
import type { LabelTable } from "@/lib/labels";

/**
 * The sentence for a first-order equation whose right-hand side is identically zero. The
 * `identicallyZero` flag on FirstOrderView and the `tool.identicallyZero` label arrive with the
 * form-detection branch; until both are present this renders nothing, and it never invents text.
 */
export function identicallyZeroLine(fo: object, L: LabelTable): string | null {
  const flagged = "identicallyZero" in fo && (fo as { identicallyZero?: unknown }).identicallyZero === true;
  if (!flagged) return null;
  const text = (L.tool as Record<string, string | undefined>).identicallyZero;
  return typeof text === "string" && text.length > 0 ? text : null;
}
