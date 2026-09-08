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

  it("first-order-only labels use the student notation dy/dt = g(t, y), never x or dx (Phase I)", () => {
    const firstOrderOnly = (L: (typeof LABELS)["zh"]) => [
      L.ui.typeExplicit, L.ui.typeDifferential, L.ui.gExplicitLabel, L.ui.mLabel, L.ui.nLabel, L.ui.implicitHeading,
      L.ui.lhsInExpression, L.ui.tMin, L.ui.tMax,
      L.tool.firstOrderHeader, L.tool.noConstantGeneral, L.tool.exactImplicit,
      L.stability.varies, L.form.integrating_factor_x, L.form.integrating_factor_y,
    ];
    for (const locale of LOCALES) {
      for (const text of firstOrderOnly(LABELS[locale])) {
        // "dx", "(x, y)" and a bare x are the old notation; placeholders such as {xMin} are internal names.
        const bare = text.replace(/\{\w+\}/g, "");
        expect(bare, `${locale}: ${text}`).not.toMatch(/dx|\(x, y\)/);
        expect(bare, `${locale}: ${text}`).not.toMatch(/(^|[^A-Za-z0-9_\u4e00-\u9fff])x(?![A-Za-z0-9_])/);
      }
    }
    // The two hints that explain the mistake name x on purpose; they must still use dt, not dx.
    for (const locale of LOCALES) {
      for (const text of [LABELS[locale].ui.xInFirstOrder, LABELS[locale].ui.syntaxHintFirstOrder]) {
        expect(text, `${locale}: ${text}`).not.toMatch(/dx|\(x, y\)/);
        expect(text, `${locale}: ${text}`).toMatch(/dy\/dt/);
      }
    }
    expect(LABELS.en.ui.xInFirstOrder).toContain("write t instead of x");
    expect(LABELS.zh.ui.xInFirstOrder).toContain("把 x 写成 t");
  });

  it("the planar left-hand-side hint names x' = / y' = and never dy/dt or t-instead-of-x", () => {
    for (const locale of LOCALES) {
      const text = LABELS[locale].ui.lhsInExpressionSystem;
      expect(text, locale).toMatch(/x' =/);
      expect(text, locale).toMatch(/y' =/);
      expect(text, locale).not.toMatch(/dy\/dt|dx/);
      expect(text, locale).not.toBe(LABELS[locale].ui.lhsInExpression);
    }
    expect(LABELS.en.ui.lhsInExpressionSystem).not.toMatch(/instead of x/);
    expect(LABELS.zh.ui.lhsInExpressionSystem).not.toMatch(/写成 t/);
    // the first-order hint stays in dy/dt
    for (const locale of LOCALES) expect(LABELS[locale].ui.lhsInExpression, locale).toMatch(/dy\/dt/);
  });

  it("the features-box sentence names both the entered range (home view) and the visible range (after zoom/pan)", () => {
    expect(LABELS.zh.ui.featuresBox).toMatch(/输入范围/);
    expect(LABELS.zh.ui.featuresBox).toMatch(/可见范围/);
    expect(LABELS.zh.ui.featuresBox).not.toMatch(/当前可见范围/);
    expect(LABELS.en.ui.featuresBox).toMatch(/entered range at the home view/);
    expect(LABELS.en.ui.featuresBox).toMatch(/visible range after zooming or panning/);
    expect(LABELS.en.ui.featuresBox).not.toMatch(/computed for the visible range/);
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

describe("formatNumber", () => {
  it("keeps the exponent of very large numbers instead of stripping its zeros", async () => {
    const { formatNumber } = await import("./labels");
    expect(formatNumber(1e30)).toBe("1e+30");
    expect(formatNumber(2.5)).toBe("2.5");
    expect(formatNumber(-0.00001)).toBe("0");
    expect(formatNumber(1e21 * 3)).toBe("3e+21");
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
