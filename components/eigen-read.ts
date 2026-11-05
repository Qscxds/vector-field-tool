"use client";

/**
 * Round 13 (AB, the second review): the exact eigen reading as the web shell and the widget run it.
 *
 * - Never during the server render: `useHydrated` is false on the server and during hydration, so
 *   a link that opens the eigen switch costs the server nothing (a hostile 111-character link once
 *   held the server's event loop for 7 s per request). The panel waits for the first client render.
 * - Never for a field that changes with t: it has no equilibria and no eigenvalues (the panel says
 *   so from the scene), and the costly part of a hostile expression is its t.
 * - Always within a wall-clock budget; a reading the budget stopped says so ("budget"), it is never
 *   silently nothing.
 */
import { useSyncExternalStore } from "react";
import { mentionsTime } from "@/lib/core/time-dependence";
import type { SystemSpec } from "@/lib/core/types";
import { linearAnalysisOf, type EigenSource } from "@/lib/eigen/linear-system";
import type { EigenDerivationInput } from "@/lib/labels-eigen";

/** The panel's `linear` input. */
export type EigenRead = EigenDerivationInput["linear"];

export const EIGEN_BUDGET_MS = 500;

const noSubscription = () => () => {};

/** false on the server and while hydrating, true afterwards (no effect, no extra render on the server). */
export function useHydrated(): boolean {
  return useSyncExternalStore(noSubscription, () => true, () => false);
}

/**
 * The exact reading of `source`, or null when there is nothing to read: `spec` (the compiled planar
 * system the picture draws) missing or mentioning t.
 */
export function readEigen(source: EigenSource, spec: SystemSpec | null, budgetMs = EIGEN_BUDGET_MS): EigenRead {
  if (!spec || mentionsTime(spec)) return null;
  const deadline = performance.now() + budgetMs;
  try {
    return linearAnalysisOf(source, () => {
      if (performance.now() > deadline) throw new RangeError("eigen budget");
    });
  } catch {
    // linearAnalysisOf never throws for bad input: only the budget stops it.
    return { ok: false, failure: { reason: "budget" } };
  }
}
