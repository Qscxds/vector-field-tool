/**
 * The text of a query_solution scene (lib/core/query through app/mcp/tools), shared by the tool
 * summary and the widget: one line per hit, the note sentence (a key worded here), the accuracy
 * sentence. Pure and React-free. On a first-order picture (system.variables "ty") a hit's
 * horizontal coordinate x IS the student's t, so the line shows t = x and y; on a planar picture
 * it shows the time t and the point (x, y).
 */
import { timeUncertainty, type QueryNote } from "./core/query";
import { fill, formatNumber, type LabelTable } from "./labels";
import type { QueryView, Scene } from "./scene";

/** The target as the student reads it: "t = 2", "x = 0", "y = 0.5". */
export function queryTargetText(query: QueryView, L: LabelTable): string {
  const key = query.target.kind === "t" ? "queryTargetT" : query.target.kind === "x" ? "queryTargetX" : "queryTargetY";
  return fill(L.tool[key], { value: formatNumber(query.target.value) });
}

/** One line per hit, then the note (when there is one) and the accuracy sentence. */
export function queryLines(scene: Pick<Scene, "system" | "query">, L: LabelTable): string[] {
  const query = scene.query;
  if (!query) return [];
  const firstOrder = scene.system?.variables === "ty";
  const lines: string[] = query.hits.map((hit) => {
    const error = formatNumber(hit.error.position, 2);
    // The displayed time uncertainty: at least the position error over the speed (never the bare
    // Brent bracket); 0 for a prescribed time.
    const tError = formatNumber(timeUncertainty(hit), 2);
    return firstOrder
      ? fill(L.tool.queryHitFirst, { t: formatNumber(hit.x, 6), tError, y: formatNumber(hit.y, 6), error })
      : fill(L.tool.queryHitSystem, { t: formatNumber(hit.t, 6), tError, x: formatNumber(hit.x, 6), y: formatNumber(hit.y, 6), error });
  });
  const note = queryNoteText(query.note, L);
  if (note) lines.push(note);
  lines.push(L.tool.queryAccuracy);
  return lines;
}

/** The note sentence for a kernel note key; null for "ok" (nothing to add). Shared with the web shell's query panel. */
export function queryNoteText(note: QueryNote, L: LabelTable): string | null {
  const notes: Record<QueryNote, string | null> = {
    ok: null,
    not_reached_in_span: L.tool.queryNotReached,
    stopped_before_target: L.tool.queryStoppedBefore,
    possibly_more_beyond_span: L.tool.queryMoreBeyond,
    target_is_start: L.tool.queryTargetIsStart,
  };
  return notes[note];
}
