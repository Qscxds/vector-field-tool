"use client";

/**
 * Round 13 (AB): the eigenvalue panel, a lib/labels-series Derivation drawn with MathText. Pure
 * presentation, shared by the web shell and the widget: what it shows is lib/labels-eigen's
 * eigenDerivation, which the tool summaries print as text too. `compact`: the widget's smaller type.
 */
import type { Derivation } from "@/lib/labels-series";
import { MathText, MATH_STYLE } from "./MathText";

const PANEL_STYLE = `
${MATH_STYLE}
.vf-eigen-steps { margin: 8px 0 0; padding-left: 22px; display: grid; gap: 8px; }
.vf-eigen-steps > li > p { margin: 2px 0 0; overflow-wrap: anywhere; }
.vf-eigen-steps > li > strong { font-weight: 600; }
.vf-eigen-note { margin: 6px 0 0; color: #52606d; font-size: 12px; }
.vf-eigen-compact .vf-eigen-steps { gap: 4px; padding-left: 18px; }
.vf-eigen-compact h2 { font-size: 13px; margin: 6px 0 0; }
.vf-eigen-compact .vf-eigen-note { font-size: 11px; }
`;

export function EigenPanel({ derivation, compact = false }: { derivation: Derivation; compact?: boolean }) {
  return (
    <section className={compact ? "vf-eigen-compact" : undefined} style={{ marginTop: compact ? 6 : 16 }} data-eigen-panel>
      <style>{PANEL_STYLE}</style>
      <h2>
        <MathText formula={derivation.title} />
      </h2>
      {derivation.steps.length ? (
        <ol className="vf-eigen-steps" data-eigen-steps>
          {derivation.steps.map((step, i) => (
            <li key={i}>
              <strong>{step.title}</strong>
              {step.lines.map((line, j) => (
                <p key={j}>
                  <MathText formula={line} />
                </p>
              ))}
            </li>
          ))}
        </ol>
      ) : null}
      {derivation.notes.map((note, i) => (
        <p key={i} className="vf-eigen-note" data-eigen-note>
          <MathText formula={note} />
        </p>
      ))}
    </section>
  );
}
