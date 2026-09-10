"use client";
import { useEffect } from "react";
import type { Locale } from "@/lib/labels";

/**
 * Keeps `<html lang>` in step with the active locale ("zh-CN" / "en"), so screen readers and
 * translation prompts follow the language the page actually shows. The root layout is static and
 * cannot know the locale (it comes from the link's `?loc=` or the visitor's choice; English when
 * neither says anything, never navigator.language), hence a client effect; the server render keeps
 * the layout's default (en) until hydration.
 */
export function useDocumentLang(locale: Locale): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);
}
