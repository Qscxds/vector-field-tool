"use client";
/**
 * The one disclosure control of both shells: a small "ⓘ" button that toggles a panel with the
 * full text behind a short line. Display only: whatever it hides is still in the Scene, the tool
 * summary and the exported data word for word. Accessible (a real button with aria-expanded and
 * aria-controls, so Enter / Space and screen readers work) and touch-friendly (a 44 px hit area
 * drawn around a small glyph with negative margins, so the line's rhythm does not change).
 */
import React, { useId, useState } from "react";

export type InfoProps = {
  /** Accessible name of the button ("Details" / "详情"), from the label table. */
  label: string;
  /** The full text; rendered only while open. */
  children: React.ReactNode;
  /** Start open (a caveat the reader must not miss can still be shown unfolded). */
  defaultOpen?: boolean;
  /** Optional hook for tests and data attributes on the toggle. */
  "data-info"?: string;
};

const TOGGLE_STYLE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 44,
  minHeight: 44,
  margin: "-14px -10px -14px -6px",
  padding: 0,
  border: 0,
  background: "transparent",
  color: "#1d4ed8",
  cursor: "pointer",
  font: "inherit",
  fontSize: "1.05em",
  lineHeight: 1,
  verticalAlign: "middle",
};

/* A span displayed as a block: the toggle may sit inside a <p> or an <li>, where a <div> is invalid HTML. */
const PANEL_STYLE: React.CSSProperties = {
  display: "block",
  /* Inside a wrapping flex row (the preset note) the panel takes the next line by itself. */
  flexBasis: "100%",
  margin: "4px 0 6px",
  padding: "6px 10px",
  borderLeft: "3px solid #cbd2d9",
  color: "#3e4c59",
  fontSize: "0.95em",
};

export function Info({ label, children, defaultOpen = false, "data-info": dataInfo }: InfoProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        title={label}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) setOpen(false);
        }}
        style={TOGGLE_STYLE}
        data-info-toggle={dataInfo ?? ""}
      >
        <span aria-hidden>ⓘ</span>
      </button>
      {open ? (
        <span id={id} role="region" aria-label={label} style={PANEL_STYLE} data-info-panel={dataInfo ?? ""}>
          {children}
        </span>
      ) : (
        <span id={id} hidden />
      )}
    </>
  );
}
