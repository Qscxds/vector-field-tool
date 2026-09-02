import { describe, expect, it } from "vitest";
import { fill, LABELS, labels, localeFromLanguageTag, LOCALES } from "./labels";

function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .flatMap((k) => keyPaths((value as Record<string, unknown>)[k], prefix ? `${prefix}.${k}` : k));
}

describe("label tables", () => {
  it("zh and en have exactly the same key set", () => {
    expect(keyPaths(LABELS.zh)).toEqual(keyPaths(LABELS.en));
  });

  it("every leaf is a non-empty string in both languages", () => {
    for (const locale of LOCALES) {
      const walk = (v: unknown, path: string) => {
        if (v !== null && typeof v === "object") {
          for (const [k, child] of Object.entries(v as Record<string, unknown>)) walk(child, `${path}.${k}`);
        } else {
          expect(typeof v, path).toBe("string");
          expect((v as string).trim().length, path).toBeGreaterThan(0);
        }
      };
      walk(LABELS[locale], locale);
    }
  });

  it("placeholders match between languages", () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    const zh = LABELS.zh, en = LABELS.en;
    for (const section of ["tool", "ui"] as const) {
      for (const key of Object.keys(zh[section]) as Array<keyof typeof zh[typeof section]>) {
        expect(placeholders(zh[section][key]), `${section}.${String(key)}`).toEqual(placeholders(en[section][key]));
      }
    }
  });

  it("caveats read as full sentences in both languages", () => {
    for (const locale of LOCALES) {
      for (const text of Object.values(labels(locale).caveat)) {
        expect(text.length, `${locale}: ${text}`).toBeGreaterThan(30);
        expect(text, `${locale}: ${text}`).toMatch(/[。.]$/);
      }
    }
    expect(labels("en").caveat.nonHyperbolic).toMatch(/Hartman/);
    expect(labels("zh").caveat.nonHyperbolic).toMatch(/Hartman/);
  });
});

describe("fill and locale detection", () => {
  it("fills placeholders and leaves unknown ones visible", () => {
    expect(fill("a {x} b {y}", { x: 1, y: "two" })).toBe("a 1 b two");
    expect(fill("{missing}", {})).toBe("{missing}");
  });

  it("maps language tags", () => {
    expect(localeFromLanguageTag("zh-CN")).toBe("zh");
    expect(localeFromLanguageTag("zh")).toBe("zh");
    expect(localeFromLanguageTag("en-US")).toBe("en");
    expect(localeFromLanguageTag("de")).toBe("en");
    expect(localeFromLanguageTag(undefined)).toBe("en");
  });

  it("falls back to English for an unknown locale", () => {
    expect(labels("fr" as never)).toBe(LABELS.en);
  });
});
