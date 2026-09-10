/**
 * Whether a keydown is the undo shortcut for the kept trajectories: Ctrl+Z (Windows / Linux) or
 * Cmd+Z (macOS), unmodified otherwise (Shift+Z is redo in most apps, Alt+Z something else), and
 * NOT while the focus is in a field, where the browser's own text undo must keep working. Pure:
 * the event is read through a minimal shape so it can be tested without a DOM.
 */
export type UndoKeyEvent = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /** The focused element (`event.target`): a DOM element has a tagName and maybe isContentEditable; anything else counts as no field. */
  target?: object | null;
};

function fieldOf(target: object | null | undefined): { tagName?: unknown; isContentEditable?: unknown } | null {
  return target && typeof target === "object" ? (target as { tagName?: unknown; isContentEditable?: unknown }) : null;
}

const EDITABLE_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA"]);

export function isUndoKey(event: UndoKeyEvent): boolean {
  if (event.key !== "z" && event.key !== "Z") return false;
  if (event.shiftKey || event.altKey) return false;
  // Exactly one of the two platform modifiers (Ctrl+Cmd+Z is nothing).
  if (event.ctrlKey === event.metaKey) return false;
  const target = fieldOf(event.target);
  if (target) {
    if (target.isContentEditable === true) return false;
    if (typeof target.tagName === "string" && EDITABLE_TAGS.has(target.tagName.toUpperCase())) return false;
  }
  return true;
}
