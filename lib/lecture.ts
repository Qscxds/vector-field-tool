/**
 * Lecture mode (round W, the professor's request): projected in class, the page showed too many
 * specific numbers. One switch hides the EVIDENCE and keeps the POSITIONS and the QUALITATIVE
 * CONCLUSIONS, which are what the lecture is about (round Y: "positions stay, evidence is
 * hidden"; round W had hidden the coordinates too, and a lecture on the logistic equation wants
 * to say "y = L" and one on Lotka-Volterra "(c/d, a/b) = (3, 2)"):
 *
 *   hidden                                          kept
 *   eigenvalues, trace, determinant                 the classification name
 *                                                   an equilibrium's coordinates, 3 significant digits
 *                                                   a constant solution's value, 3 significant digits
 *   measured deviations, thresholds, sample counts  "numerically behaves like a separable equation"
 *   a query's numbers and error estimates           the hit markers, whether the target was reached
 *   the shown-range / computed-for / scan lines     the axes and their ticks
 *   long explanations and full caveat sentences     the caveats in SHORT form
 *
 * The red line: folding numbers never folds honesty. "center or weak spiral (linearization cannot
 * tell)" stays exactly that, never "center"; a repeated-root / domain-edge / not-finite caveat
 * stays as a short phrase; a point or line where uniqueness fails keeps its "!" and a short
 * sentence, in every mode. Every line that hides something keeps its ⓘ, which opens the FULL
 * normal-mode text of that one line (a student asks, the teacher clicks).
 *
 * Pure presentation: these functions read a Scene's entries and return what to print. They never
 * change a Scene, nothing here is known to the MCP tools (a tool's summary and structuredContent
 * are word for word what they were), and switching the mode recomputes nothing.
 */
import type { Equilibrium } from "./core/equilibria";
import type { QueryNote } from "./core/query";
import type { EquilibriumSolution, FirstOrderSpec } from "./core/slope-field";
import { constantSolutionFolded, equilibriumDetail, fill, formatEigenvalues, formatNumber, formatShort, pointText, type Folded, type LabelTable } from "./labels";

/** Significant digits of a position in lecture mode: (3, 2), y = 2, (3.14, 0). */
export const LECTURE_POSITION_DIGITS = 3;

/** One equilibrium's line: the bold point, the text, the trailing numbers (absent in lecture mode), the ⓘ detail. */
export type EquilibriumLine = { point: string; text: string; numbers: string | null; detail: string[] };

/** A point as lecture mode prints it: LECTURE_POSITION_DIGITS significant digits per coordinate; (x, x') = (…) on a second-order picture. */
export function lecturePoint(L: LabelTable, p: { x: number; y: number }, secondOrder = false): string {
  const point = `(${formatShort(p.x, LECTURE_POSITION_DIGITS)}, ${formatShort(p.y, LECTURE_POSITION_DIGITS)})`;
  return secondOrder ? fill(L.tool.pointSecond, { point }) : point;
}

/** "λ = -0.25 ± 0.9682i · tr = -0.5, det = 1": the numbers of one equilibrium, as the normal mode prints them. */
export function equilibriumNumbers(L: LabelTable, p: Pick<Equilibrium, "eigenvalues" | "trace" | "determinant">): string {
  return `λ = ${formatEigenvalues(p.eigenvalues) || L.tool.eigenvaluesUnavailable} · tr = ${formatNumber(p.trace, 5)}, det = ${formatNumber(p.determinant, 5)}`;
}

/**
 * The short phrases an equilibrium keeps in lecture mode. The center and non-hyperbolic caveats
 * need none: their classification names already say "linearization cannot tell" / "is inconclusive". The
 * other caveats and the two speaking uniqueness verdicts get a short phrase each.
 */
export function equilibriumShortCaveats(L: LabelTable, p: Pick<Equilibrium, "caveat" | "uniqueness">): string[] {
  const out: string[] = [];
  if (p.caveat === "repeatedRoot" || p.caveat === "notFinite" || p.caveat === "domainEdge") out.push(L.caveatShort[p.caveat]);
  if (p.uniqueness?.verdict === "unbounded") out.push(L.uniquenessShort.unbounded);
  else if (p.uniqueness?.verdict === "borderline") out.push(L.uniquenessShort.borderline);
  return out;
}

/**
 * One equilibrium as a shell prints it. Normal mode: the point, its classification, the numbers,
 * the caveat / uniqueness sentences (and `extra`: the eigen-direction lines) behind the ⓘ.
 * Lecture mode: the point to 3 significant digits and the classification with its short caveats,
 * no eigenvalues, no trace, no determinant; the ⓘ opens the whole normal line first, then
 * everything the normal ⓘ holds.
 */
export function equilibriumLine(L: LabelTable, p: Equilibrium, opts: { secondOrder?: boolean; lecture?: boolean; extra?: string[] } = {}): EquilibriumLine {
  const { secondOrder = false, lecture = false, extra = [] } = opts;
  const point = pointText(L, p.at, secondOrder);
  const classification = L.classification[p.classification];
  const numbers = equilibriumNumbers(L, p);
  const detail = [...equilibriumDetail(L, p, secondOrder), ...extra];
  if (!lecture) return { point, text: classification, numbers, detail };
  const short = [classification, ...equilibriumShortCaveats(L, p)].join(L.ui.lectureJoin);
  return { point: lecturePoint(L, p.at, secondOrder), text: short, numbers: null, detail: [`${point} ${classification} · ${numbers}`, ...detail] };
}

/**
 * One constant solution. Normal mode: constantSolutionFolded ("Constant solution y = 2: stable.").
 * Lecture mode: its value to 3 significant digits and its stability, the uniqueness phrase when
 * it speaks; the ⓘ opens the normal line and all its detail (the plateau, probe and scan notes).
 */
export function constantSolutionLine(L: LabelTable, s: EquilibriumSolution, spec: FirstOrderSpec | undefined, lecture: boolean): Folded {
  const normal = constantSolutionFolded(L, s, spec);
  if (!lecture) return normal;
  const phrases = [fill(L.ui.lectureConstantSolution, { y: formatShort(s.y, LECTURE_POSITION_DIGITS), stability: L.stabilityShort[s.stability] })];
  if (s.uniqueness?.verdict === "unbounded") phrases.push(L.uniquenessShort.unbounded);
  else if (s.uniqueness?.verdict === "borderline") phrases.push(L.uniquenessShort.borderline);
  return { short: phrases.join(L.ui.lectureJoin), detail: [normal.short, ...normal.detail] };
}

/**
 * The tag of a constant solution's line on the canvas: "y = 2 (stable)" in both modes, the value
 * to 4 decimals normally and to 3 significant digits in lecture mode. The " !" of a line where
 * uniqueness fails is part of the tag in BOTH modes.
 */
export function constantSolutionTag(L: LabelTable, s: Pick<EquilibriumSolution, "y" | "stability" | "uniqueness">, lecture: boolean): string {
  const mark = s.uniqueness?.verdict === "unbounded" ? " !" : "";
  const value = lecture ? formatShort(s.y, LECTURE_POSITION_DIGITS) : String(Number(s.y.toFixed(4)));
  return `y = ${value} (${L.stabilityShort[s.stability]})${mark}`;
}

/**
 * The search's notices (warning, truncation, singular points, plateau …) in lecture mode: the
 * warning in its short form stays on the page (it changes what the list means); the other lines
 * fold into one "notes" line. Normal mode prints every line as it is (the caller does).
 */
export function lectureNotices(L: LabelTable, warning: keyof LabelTable["warning"] | undefined, lines: readonly string[]): Folded[] {
  const out: Folded[] = [];
  const warningText = warning ? L.warning[warning] : undefined;
  if (warning && warningText && lines.includes(warningText)) out.push({ short: L.warningShort[warning], detail: [warningText] });
  const rest = lines.filter((line) => line !== warningText);
  if (rest.length) out.push({ short: fill(L.ui.lectureNotes, { count: rest.length }), detail: [...rest] });
  return out;
}

/**
 * Lecture mode hides the "last trajectory" line (it is numbers: where each direction got to). The
 * one sentence of that line that must never be hidden is that a kept curve passes through a point
 * where uniqueness fails: it stays, in short form with its "!", the full sentence behind the ⓘ.
 * null when no kept curve carries the flag.
 */
export function lectureCurveNote(L: LabelTable, trajectories: readonly { nonUnique?: boolean }[]): Folded | null {
  return trajectories.some((t) => t.nonUnique) ? { short: L.ui.lectureNonUniqueCurve, detail: [L.tool.nonUniqueTrajectory] } : null;
}

/** A query's answer in lecture mode: whether the target was found, in a few words (the markers are on the picture; the ⓘ opens every number). */
export function lectureQueryShort(L: LabelTable, note: QueryNote, hits: number): string {
  if (note === "ok") return fill(L.ui.lectureQueryFound, { count: hits });
  return L.queryNoteShort[note];
}
