/**
 * A formula of lib/series/notation as HTML (round 12): text runs, <sub>, <sup>, a stacked
 * fraction and a sum sign with its limits above and below. Display only. Assistive technology reads
 * the same formula's Unicode text (notation `plain`, what a tool summary says) from a visually hidden
 * span; the visual layout is hidden from it (an aria-label on a role-less span is not read by NVDA or JAWS).
 */
import type { Formula } from "@/lib/series/notation";
import { plain } from "@/lib/series/notation";

/** The CSS of the formula pieces, prefixed vf-math (injected once by the panel). */
export const MATH_STYLE = `
.vf-math { font-family: "Cambria Math", "STIX Two Math", "Times New Roman", Times, serif; font-size: 1.08em; }
.vf-math sub, .vf-math sup { font-size: 0.72em; line-height: 0; }
.vf-math .vf-frac { display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-size: 0.86em; margin: 0 1px; line-height: 1.15; }
.vf-math .vf-frac > span:last-child { border-top: 1px solid currentColor; }
.vf-math .vf-sum { display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; line-height: 1; margin: 0 2px; }
.vf-math .vf-sum > span:first-child, .vf-math .vf-sum > span:last-child { font-size: 0.62em; }
.vf-math .vf-sum > span:nth-child(2) { font-size: 1.35em; }
.vf-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
`;

export function MathText({ formula, className }: { formula: Formula; className?: string }) {
  return (
    <span className={className ? `vf-math ${className}` : "vf-math"}>
      <span className="vf-sr">{plain(formula)}</span>
      <span aria-hidden="true">
        {formula.map((r, i) => {
          if ("t" in r) return <span key={i}>{r.t}</span>;
          if ("sub" in r) return <sub key={i}>{r.sub}</sub>;
          if ("sup" in r) return <sup key={i}>{r.sup}</sup>;
          if ("frac" in r) {
            return (
              <span key={i} className="vf-frac">
                <span>{r.frac[0]}</span>
                <span>{r.frac[1]}</span>
              </span>
            );
          }
          const [from, to] = r.sum;
          return (
            <span key={i} className="vf-sum">
              <span>{to}</span>
              <span>Σ</span>
              <span>{from}</span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
