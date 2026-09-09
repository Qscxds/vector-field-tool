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
    for (const section of ["tool", "ui", "uniqueness", "stability"] as const) {
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

  it("uniqueness and domain-edge texts are full sentences that name the Lipschitz condition, with no sentence for a bounded result (J.2)", () => {
    for (const locale of LOCALES) {
      const L = labels(locale);
      for (const key of ["unbounded", "borderline", "unboundedPoint", "borderlinePoint"] as const) {
        expect(L.uniqueness[key], `${locale}.${key}`).toMatch(/[。.]$/);
        expect(L.uniqueness[key], `${locale}.${key}`).toMatch(/Lipschitz/);
        expect(L.uniqueness[key], `${locale}.${key}`).toContain("{alpha}");
      }
      expect(L.uniqueness.unbounded).toContain("{y}");
      expect(L.uniqueness.unboundedPoint).toContain("{point}");
      expect(Object.keys(L.uniqueness)).not.toContain("bounded");
      expect(L.tool.nonUniqueTrajectory).toBe(L.ui.nonUniqueTrajectory);
      expect(L.tool.nonUniqueTrajectory).toMatch(/[。.]$/);
      for (const key of ["edge_approach", "edge_leave"] as const) expect(L.stability[key], `${locale}.${key}`).not.toMatch(/dx|\(x, y\)/);
    }
    expect(labels("zh").stability.edge_leave).toContain("定义域边界");
    expect(labels("en").stability.edge_approach).toContain("edge of the domain");
    expect(labels("en").uniqueness.unbounded).toMatch(/unbounded/);
  });

  it("domain-edge sentences name the defined side, a one-sided 'varies' has its own sentence, and the canvas tags are words (review J)", async () => {
    const { stabilitySentence } = await import("./labels");
    for (const locale of LOCALES) {
      const L = labels(locale);
      for (const key of ["edge_approach", "edge_leave", "edge_varies"] as const) {
        expect(L.stability[key], `${locale}.${key}`).toContain("{side}");
        // the hint about fractional powers of a negative base (review J: 3*y^(2/3) reads as one-sided here)
        if (key !== "edge_varies") expect(L.stability[key], `${locale}.${key}`).toMatch(/abs\(y\)\^\(2\/3\)/);
      }
      for (const key of ["stable", "unstable", "semi_stable", "varies"] as const) expect(L.stability[key], `${locale}.${key}`).not.toContain("{side}");
      // filled sentences: the side word appears, no placeholder is left
      const above = stabilitySentence(L, { stability: "edge_leave", domainEdge: "above" });
      const below = stabilitySentence(L, { stability: "edge_approach", domainEdge: "below" });
      expect(above).toContain(L.side.above);
      expect(below).toContain(L.side.below);
      expect(above).not.toContain("{side}");
      expect(above).not.toBe(below);
      // a one-sided line whose sign pattern changes with t gets edge_varies, not the two-sided 'varies'
      const oneSided = stabilitySentence(L, { stability: "varies", domainEdge: "above" });
      expect(oneSided).toBe(fill(L.stability.edge_varies, { side: L.side.above }));
      expect(oneSided).not.toBe(L.stability.varies);
      expect(stabilitySentence(L, { stability: "varies" })).toBe(L.stability.varies);
      expect(stabilitySentence(L, { stability: "stable" })).toBe(L.stability.stable);
      // short canvas tags exist for every stability value and are not the internal keys
      for (const key of ["stable", "unstable", "semi_stable", "varies", "edge_approach", "edge_leave"] as const) {
        expect(L.stabilityShort[key], `${locale}.${key}`).not.toMatch(/_/);
        expect(L.stabilityShort[key].length, `${locale}.${key}`).toBeLessThan(L.stability[key].length);
      }
    }
    expect(labels("en").stabilityShort.edge_leave).toBe("domain edge, left");
    expect(labels("zh").side.above).toBe("上方");
    expect(labels("en").stability.edge_leave).toContain("defined only {side} this line");
  });

  it("uniquenessSentence speaks only for unbounded and borderline verdicts", async () => {
    const { uniquenessSentence } = await import("./labels");
    const L = labels("en");
    expect(uniquenessSentence(L, { verdict: "bounded_at_tested_scales", exponent: 0 }, { y: 0 })).toBeNull();
    expect(uniquenessSentence(L, { verdict: "untestable", exponent: NaN }, { y: 0 })).toBeNull();
    expect(uniquenessSentence(L, undefined, { y: 0 })).toBeNull();
    expect(uniquenessSentence(L, { verdict: "unbounded", exponent: 0.5 }, { y: 0 })).toBe(fill(L.uniqueness.unbounded, { y: "0", alpha: "0.5" }));
    expect(uniquenessSentence(L, { verdict: "borderline", exponent: 0.1234 }, { point: { x: 1, y: 2 } })).toBe(fill(L.uniqueness.borderlinePoint, { point: "(1, 2)", alpha: "0.12" }));
  });

  it("the non-autonomous sentences never claim equilibria are undefined for such systems, and say what the tool does instead (J review C.6)", () => {
    for (const locale of LOCALES) {
      const L = labels(locale);
      for (const text of [L.tool.timeDependent, L.tool.timeDependentTrajectory, L.ui.timeDependentNote]) {
        expect(text, `${locale}: ${text}`).not.toMatch(/only defined for autonomous|只对自治系统有定义|undefined for a non-autonomous/);
        expect(text, `${locale}: ${text}`).toMatch(/[。.]$/);
      }
      expect(L.tool.timeDependent).toContain("{t}");
      expect(L.tool.timeDependent).toContain("{evidence}");
      expect(L.tool.timeDependentTrajectory).toContain("{evidence}");
      expect(L.ui.timeDependentNote).toContain("{t}");
      // The evidence sentences are full sentences; the measured one carries the number.
      for (const key of ["timeDependenceMeasured", "timeDependenceNoChange", "timeDependenceDomainMoves", "timeDependenceUntested"] as const) {
        expect(L.tool[key], `${locale}.${key}`).toMatch(/[。.]$/);
      }
      expect(L.tool.timeDependenceMeasured).toContain("{deviation}");
    }
    expect(labels("en").tool.timeDependent).toMatch(/tools for autonomous systems/);
    expect(labels("en").tool.timeDependent).toMatch(/snapshot at t = \{t\}/);
    expect(labels("zh").tool.timeDependent).toMatch(/针对自治系统的工具/);
    expect(labels("zh").tool.timeDependent).toMatch(/t = \{t\} 时刻的快照/);
  });

  it("timeDependenceEvidence picks the sentence from the probe: measured, no change, moving domain, untested", async () => {
    const { timeDependenceEvidence } = await import("./labels");
    const L = labels("en");
    expect(timeDependenceEvidence(L, { maxRelDeviation: 0.25, samples: 13 })).toBe(fill(L.tool.timeDependenceMeasured, { deviation: "2.5e-1" }));
    expect(timeDependenceEvidence(L, { maxRelDeviation: 0, samples: 13 })).toBe(L.tool.timeDependenceNoChange);
    expect(timeDependenceEvidence(L, { maxRelDeviation: Infinity, samples: 13 })).toBe(L.tool.timeDependenceDomainMoves);
    expect(timeDependenceEvidence(L, { maxRelDeviation: 0, samples: 0 })).toBe(L.tool.timeDependenceUntested);
  });

  it("the truncation sentences are self-contained (no reference to a verdict 'above'), and the continuum sentence for singular points exists (J review C.7)", () => {
    for (const locale of LOCALES) {
      const L = labels(locale);
      for (const text of [L.ui.equilibriaTruncated, L.ui.singularitiesTruncated]) {
        expect(text, `${locale}: ${text}`).not.toMatch(/above|上面/);
        expect(text, `${locale}: ${text}`).toContain("{max}");
      }
      expect(L.ui.singularitiesContinuum.length).toBeGreaterThan(30);
      expect(L.ui.singularitiesContinuum).toMatch(/[。.]$/);
    }
  });

  it("equilibriaNotices prints the cap once: the truncation sentence replaces the hit_limit warning; other warnings stay (J review C.7)", async () => {
    const { equilibriaNotices } = await import("./labels");
    const L = labels("en");
    const thirty = new Array(30).fill(0);
    expect(equilibriaNotices(L, { warning: "hit_limit", truncated: true, equilibria: thirty })).toEqual([fill(L.ui.equilibriaTruncated, { max: 30 })]);
    expect(equilibriaNotices(L, { warning: "possible_continuum", truncated: true, equilibria: thirty })).toEqual([L.warning.possible_continuum, fill(L.ui.equilibriaTruncated, { max: 30 })]);
    expect(equilibriaNotices(L, { warning: "none_found", equilibria: [] })).toEqual([L.warning.none_found]);
    expect(equilibriaNotices(L, { equilibria: [1] })).toEqual([]);
  });

  it("equilibriaNotices lists the field's singular points after the warning and the truncation sentence, one line each, in both locales", async () => {
    const { equilibriaNotices, formatPoint } = await import("./labels");
    const singularPoints = [
      { x: 0, y: 0 },
      { x: 1.5, y: -2 },
    ];
    for (const locale of LOCALES) {
      const L = labels(locale);
      const lines = equilibriaNotices(L, { warning: "none_found", equilibria: [], singularPoints });
      expect(lines).toEqual([
        L.warning.none_found,
        fill(L.tool.singularPoint, { point: formatPoint(singularPoints[0]) }),
        fill(L.tool.singularPoint, { point: formatPoint(singularPoints[1]) }),
      ]);
      expect(equilibriaNotices(L, { equilibria: [1], singularPoints: [] })).toEqual([]);
    }
  });

  it("every second-order refusal has a bilingual sentence, as a full sentence (J review C.8)", () => {
    const keys = [
      "secondOrderNotAffine", "secondOrderZeroCoefficient", "secondOrderNoEquation", "secondOrderDoubleEquals", "secondOrderTooManyEquals",
      "secondOrderOtherPrime", "secondOrderHigherDerivative", "secondOrderPlaceholderTyped", "secondOrderUndefinedAtSamples", "secondOrderUnknownSymbol",
    ] as const;
    for (const locale of LOCALES) {
      const L = labels(locale);
      for (const key of keys) expect(L.ui[key], `${locale}.${key}`).toMatch(/[。.]$/);
      expect(L.ui.secondOrderUnknownSymbol).toContain("{name}");
    }
    expect(labels("zh").ui.secondOrderNotAffine).toMatch(/线性/);
    expect(labels("en").ui.secondOrderNotAffine).toMatch(/linearly/);
  });

  it("the second-order syntax hint says the reduction is checked numerically at sample points, in both languages (J review C.2)", () => {
    expect(labels("en").ui.syntaxHintSecondOrder).toMatch(/checked numerically at sample points/);
    expect(labels("en").ui.syntaxHintSecondOrder).toMatch(/cannot be detected/);
    expect(labels("zh").ui.syntaxHintSecondOrder).toMatch(/采样点/);
    expect(labels("zh").ui.syntaxHintSecondOrder).toMatch(/数值检验/);
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

describe("J-fix2 notices: the underflow plateau and a region of equilibria, in both locales", () => {
  it("equilibriaNotices appends the underflow-plateau sentence once, after the points, and prints the region warning", async () => {
    const { equilibriaNotices } = await import("./labels");
    for (const locale of LOCALES) {
      const L = labels(locale);
      expect(equilibriaNotices(L, { warning: "none_found", equilibria: [], underflowPlateau: true })).toEqual([L.warning.none_found, L.tool.underflowPlateau]);
      expect(equilibriaNotices(L, { warning: "none_found", equilibria: [] })).toEqual([L.warning.none_found]);
      expect(equilibriaNotices(L, { warning: "region_of_equilibria", equilibria: [0, 0] })).toEqual([L.warning.region_of_equilibria]);
      // Full sentences, distinct from the continuum and isolated-points wording.
      expect(L.tool.underflowPlateau.length).toBeGreaterThan(20);
      expect(L.warning.region_of_equilibria).not.toBe(L.warning.possible_continuum);
      expect(L.warning.region_of_equilibria).not.toBe(L.warning.multiple_non_hyperbolic);
    }
  });
});
