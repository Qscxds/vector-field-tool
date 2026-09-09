"use client";
import { useEffect, useState } from "react";

/**
 * Whether the primary pointer is a finger (`(pointer: coarse)`): the interaction hint then names
 * taps and pinches, not clicks and wheels. False until mounted, so the server render and the
 * first client render agree on the mouse hint.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return coarse;
}
