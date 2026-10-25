"use client";

/**
 * The web shell's series / solution-formula panel (round 12): the controls in the form column
 * (what to show, the expansion point t0, the highest power, the initial values, each number with a
 * slider so a student can drag it and watch the derivation change) and the result below the
 * pictures (the derivation step by step and its chart). Pure presentation: everything shown comes
 * from lib/series-panel's computeSeriesPanel, which the MCP tools call too.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fill, type LabelTable } from "@/lib/labels";
import { parseDecimal } from "@/lib/initial-value";
import { formatParamValue } from "@/lib/params";
import type { SeriesMode } from "@/lib/series/equation";
import { MAX_SERIES_TERMS, MIN_SERIES_TERMS, type SeriesKind, type SeriesPanelResult, type SeriesSettings, initialCount } from "@/lib/series-panel";
import { MathText, MATH_STYLE } from "./MathText";
import { SeriesChart } from "./SeriesChart";

const PANEL_STYLE = `
${MATH_STYLE}
.vf-series-steps { margin: 8px 0 0; padding-left: 22px; display: grid; gap: 8px; }
.vf-series-steps > li > p { margin: 2px 0 0; overflow-wrap: anywhere; }
.vf-series-steps > li > strong { font-weight: 600; }
.vf-series-note { margin: 6px 0 0; color: #52606d; font-size: 12px; }
.vf-series-number { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 8px; align-items: center; }
`;

/** Text that may still become a number: nothing, a sign, a point. */
const PARTIAL_NUMBER = /^[+-]?\.?$/;

/** Slider range of a value the student drags (the typed field may go beyond it; the thumb then sits at the end). */
const VALUE_SLIDER = { min: -5, max: 5, step: 0.1 } as const;

/** `fieldName`: how the alert names the field when the label itself is not a name ("Expand about t =" is followed by its input). */
function NumberField({ label, fieldName = label, value, onValue, name, problem }: { label: string; fieldName?: string; value: number; onValue: (v: number) => void; name: string; problem: (field: string) => string }) {
  const [text, setText] = useState(() => formatParamValue(value));
  const [bad, setBad] = useState(false);
  // A value set from outside (the slider, a preset, a link) rewrites the field; a typed one does not.
  useEffect(() => {
    const parsed = parseDecimal(text);
    if (!("value" in parsed) || parsed.value !== value) {
      setText(formatParamValue(value));
      setBad(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <label className="vf-series-number">
        <span>{label}</span>
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const parsed = parseDecimal(e.target.value);
            if ("value" in parsed) {
              setBad(false);
              onValue(parsed.value);
            } else {
              // A number being typed ("", "-", ".", "-.") is not an error yet.
              setBad(!PARTIAL_NUMBER.test(e.target.value.trim()));
            }
          }}
          style={inputStyle}
          inputMode="decimal"
          name={name}
        />
      </label>
      <input
        type="range"
        min={VALUE_SLIDER.min}
        max={VALUE_SLIDER.max}
        step={VALUE_SLIDER.step}
        value={Math.min(VALUE_SLIDER.max, Math.max(VALUE_SLIDER.min, value))}
        onChange={(e) => onValue(Number(Number(e.target.value).toFixed(1)))}
        aria-label={label}
        name={`${name}Range`}
      />
      {bad ? (
        <p role="alert" style={{ margin: 0, color: "#991b1b", fontSize: 13 }}>
          {problem(fieldName)}
        </p>
      ) : null}
    </div>
  );
}

/**
 * `revision` changes when the settings are replaced from outside (a preset): the number fields are
 * then remounted, so a half-typed or invalid text never survives a preset that has the same value.
 */
export function SeriesControls({ L, mode, settings, onChange, revision = 0 }: { L: LabelTable; mode: SeriesMode; settings: SeriesSettings; onChange: (next: SeriesSettings) => void; revision?: number }) {
  const kinds: (SeriesKind | null)[] = [null, "series", "formula"];
  const names = mode === "first" ? ["y"] : ["x", "x'"];
  const problem = (field: string) => fill(L.series.numberProblem, { field });
  return (
    <fieldset style={{ display: "grid", gap: 8, margin: 0, padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 6, color: "#1f2933" }} data-series-panel>
      <legend style={{ padding: "0 4px" }}>{L.series.legend}</legend>
      <div className="vf-segments" role="group" aria-label={L.series.kindAria} data-series-kind>
        {kinds.map((k) => (
          <button
            key={k ?? "off"}
            type="button"
            aria-pressed={settings.kind === k}
            onClick={() => onChange({ ...settings, kind: k })}
            style={{ width: "auto" }}
          >
            {k === null ? L.series.kindOff : k === "series" ? L.series.kindSeries : L.series.kindFormula}
          </button>
        ))}
      </div>
      <p style={{ margin: 0, color: "#52606d", fontSize: 12 }}>{L.series.kindHint}</p>
      {settings.kind !== null ? (
        <>
          <NumberField
            key={`center-${revision}`}
            label={settings.kind === "series" ? L.series.center : L.series.centerFormula}
            fieldName={settings.kind === "series" ? L.series.centerName : L.series.centerFormulaName}
            value={settings.center}
            onValue={(center) => onChange({ ...settings, center })}
            name="seriesCenter"
            problem={problem}
          />
          {settings.kind === "series" ? (
            <label style={{ display: "grid", gap: 4 }}>
              <span>{fill(L.series.terms, { power: settings.terms })}</span>
              <input
                type="range"
                min={MIN_SERIES_TERMS}
                max={MAX_SERIES_TERMS}
                step={1}
                value={settings.terms}
                onChange={(e) => onChange({ ...settings, terms: Number(e.target.value) })}
                aria-label={L.series.termsAria}
                name="seriesTerms"
                data-series-terms
              />
            </label>
          ) : null}
          <span style={{ color: "#52606d" }}>{L.series.initialValues}</span>
          {names.slice(0, initialCount(mode)).map((name, i) => (
            <NumberField
              key={`${name}-${revision}`}
              label={fill(L.series.initialAt, { name, t0: formatParamValue(settings.center) })}
              value={settings.initial[i]}
              onValue={(v) => onChange({ ...settings, initial: i === 0 ? [v, settings.initial[1]] : [settings.initial[0], v] })}
              name={`seriesInitial${i}`}
              problem={problem}
            />
          ))}
        </>
      ) : null}
    </fieldset>
  );
}

/** Width of the result section, for the chart (null until measured). */
function useWidth(): [(el: HTMLElement | null) => void, number | null] {
  const [width, setWidth] = useState<number | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const o = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    o.observe(el);
    observer.current = o;
  }, []);
  return [ref, width];
}

export function SeriesResult({ result, lecture = false }: { result: SeriesPanelResult; lecture?: boolean }) {
  const [ref, measured] = useWidth();
  if (result.status === "off") return null;
  const width = Math.round(Math.min(900, Math.max(280, measured ?? 640)));
  return (
    <section ref={ref} style={{ marginTop: 16 }} data-series-result={result.status === "ok" ? result.kind : "unavailable"}>
      <style>{PANEL_STYLE}</style>
      {result.status === "unavailable" ? (
        <p role="status" style={{ margin: 0, color: "#92400e" }} data-series-unavailable>
          <MathText formula={result.message} />
        </p>
      ) : (
        <>
          <h2>
            <MathText formula={result.derivation.title} />
          </h2>
          {result.chart ? (
            <figure style={{ margin: "6px 0 0" }}>
              <SeriesChart chart={result.chart} width={width} lecture={lecture} />
              {result.chart.caption.length ? (
                <figcaption className="vf-series-note">
                  <MathText formula={result.chart.caption} />
                </figcaption>
              ) : null}
            </figure>
          ) : null}
          <ol className="vf-series-steps" data-series-steps>
            {result.derivation.steps.map((step, i) => (
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
          {result.derivation.notes.map((note, i) => (
            <p key={i} className="vf-series-note">
              <MathText formula={note} />
            </p>
          ))}
        </>
      )}
    </section>
  );
}

const inputStyle = { padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6, font: "inherit" } as const;
