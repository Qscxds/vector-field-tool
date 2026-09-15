/**
 * The text of a query_solution scene (lib/core/query through app/mcp/tools), shared by the tool
 * summary and the widget: one line per hit, the note sentence (a key worded here), the accuracy
 * sentence. Pure and React-free. On a first-order picture (system.variables "ty") a hit's
 * horizontal coordinate x IS the student's t, so the line shows t = x and y; on a planar picture
 * it shows the time t and the point (x, y); on a second-order picture (scene.secondOrder) the
 * point is (x, x'), the kernel's y being the velocity (round P).
 */
import { timeUncertainty, type QueryNote } from "./core/query";
import { fill, formatNumber, type LabelTable } from "./labels";
import type { QueryView, Scene } from "./scene";

/** The target as the student reads it: "t = 2", "x = 0", "y = 0.5", and "x' = 0.5" on a second-order picture. */
export function queryTargetText(query: QueryView, L: LabelTable, secondOrder = false): string {
  const key = query.target.kind === "t" ? "queryTargetT" : query.target.kind === "x" ? "queryTargetX" : secondOrder ? "queryTargetXp" : "queryTargetY";
  return fill(L.tool[key], { value: formatNumber(query.target.value) });
}

/**
 * One line per hit, then the note (when there is one) and the accuracy sentence. A first-order
 * hit is a POINT (t, y) of the picture, both coordinates known to the position error; the
 * kernel's time uncertainty is never printed for it, because on a differential form the kernel's
 * time is the curve's own parameter, not the student's t (round P2.1).
 */
export function queryLines(scene: Pick<Scene, "system" | "query" | "secondOrder" | "fieldStyle">, L: LabelTable): string[] {
  const query = scene.query;
  if (!query) return [];
  const firstOrder = scene.system?.variables === "ty";
  const hitTemplate = scene.secondOrder ? L.tool.queryHitSecond : L.tool.queryHitSystem;
  const lines: string[] = query.hits.map((hit) => {
    const error = formatNumber(hit.error.position, 2);
    // The displayed time uncertainty: at least the position error over the speed (never the bare
    // Brent bracket); 0 for a prescribed time.
    const tError = formatNumber(timeUncertainty(hit), 2);
    return firstOrder
      ? fill(L.tool.queryHitFirst, { t: formatNumber(hit.x, 6), y: formatNumber(hit.y, 6), error })
      : fill(hitTemplate, { t: formatNumber(hit.t, 6), tError, x: formatNumber(hit.x, 6), y: formatNumber(hit.y, 6), error });
  });
  const note = queryNoteText(query.note, L, firstOrder && scene.fieldStyle === "segments");
  if (note) lines.push(note);
  lines.push(L.tool.queryAccuracy);
  return lines;
}

/**
 * The note sentence for a kernel note key; null for "ok" (nothing to add). Shared with the web
 * shell's query panel. A differential form (`differential`) has no direction, so its "periodic"
 * note speaks of a side of the start, not of a direction.
 */
export function queryNoteText(note: QueryNote, L: LabelTable, differential = false): string | null {
  const notes: Record<QueryNote, string | null> = {
    ok: null,
    not_reached_in_span: L.tool.queryNotReached,
    stopped_before_target: L.tool.queryStoppedBefore,
    possibly_more_beyond_span: differential ? L.tool.queryMoreBeyondDiff : L.tool.queryMoreBeyond,
    target_is_start: L.tool.queryTargetIsStart,
  };
  return notes[note];
}
