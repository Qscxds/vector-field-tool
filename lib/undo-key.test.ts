import { describe, expect, it } from "vitest";
import { isUndoKey, type UndoKeyEvent } from "./undo-key";

const key = (over: Partial<UndoKeyEvent>): UndoKeyEvent => ({ key: "z", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target: { tagName: "CANVAS" }, ...over });

describe("isUndoKey", () => {
  it("accepts Ctrl+Z and Cmd+Z (either case) with the focus on the canvas or the body", () => {
    expect(isUndoKey(key({ ctrlKey: true }))).toBe(true);
    expect(isUndoKey(key({ metaKey: true }))).toBe(true);
    expect(isUndoKey(key({ ctrlKey: true, key: "Z" }))).toBe(true);
    expect(isUndoKey(key({ ctrlKey: true, target: { tagName: "BODY" } }))).toBe(true);
    expect(isUndoKey(key({ ctrlKey: true, target: null }))).toBe(true);
  });

  it("rejects a bare z, other keys, Shift / Alt variants and both modifiers together", () => {
    expect(isUndoKey(key({}))).toBe(false);
    expect(isUndoKey(key({ ctrlKey: true, key: "y" }))).toBe(false);
    expect(isUndoKey(key({ ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isUndoKey(key({ metaKey: true, altKey: true }))).toBe(false);
    expect(isUndoKey(key({ ctrlKey: true, metaKey: true }))).toBe(false);
  });

  it("leaves the shortcut to the browser while an input, select, textarea or editable element has the focus", () => {
    for (const tagName of ["INPUT", "input", "SELECT", "TEXTAREA"]) expect(isUndoKey(key({ ctrlKey: true, target: { tagName } }))).toBe(false);
    expect(isUndoKey(key({ ctrlKey: true, target: { tagName: "DIV", isContentEditable: true } }))).toBe(false);
    expect(isUndoKey(key({ ctrlKey: true, target: { tagName: "BUTTON" } }))).toBe(true);
  });
});
