import { describe, expect, it } from "vitest";
import { findEquilibria } from "./core/equilibria";
import { compileSystem } from "./core/parse";
import { eigenDirectionLines, fill, LABELS, labels, LOCALES } from "./labels";

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

  it("[P1] second-order labels speak of t, x and x' only: no lone y (the kernel's name for x') in either language", () => {
    const secondOrderOnly = (L: (typeof LABELS)["zh"]) => [
      L.ui.typeSecond, L.ui.secondOrderLabel, L.ui.secondOrderReduced, L.ui.secondOrderUnknownSymbol,
      L.ui.secondOrderOtherPrime, L.ui.secondOrderNotAffine, L.ui.secondOrderZeroCoefficient, L.ui.secondOrderNoEquation,
      L.ui.xpMin, L.ui.xpMax, L.ui.snapshotTSecond, L.ui.queryHitSecond, L.ui.timeDependentNoteSecond, L.ui.timeDependentShortSecond,
      L.tool.secondOrderReduced, L.tool.secondOrderHeader, L.tool.timeDependentSecond, L.tool.pointSecond, L.tool.queryHeaderSecond,
      L.tool.queryTargetXp, L.tool.queryHitSecond,
    ];
    for (const locale of LOCALES) {
      for (const text of secondOrderOnly(LABELS[locale])) {
        // Placeholders such as {y} are internal names; "dy/dt" is not a y variable either.
        const bare = text.replace(/\{\w+\}/g, "").replace(/dy\/dt/g, "");
        expect(bare, `${locale}: ${text}`).not.toMatch(/(^|[^A-Za-z0-9_一-鿿])y(?![A-Za-z0-9_])/);
      }
      // The reduction names v = x' and the axes x and x'.
      expect(LABELS[locale].ui.secondOrderReduced).toMatch(/v = x'/);
      expect(LABELS[locale].tool.secondOrderReduced).toMatch(/v = x'/);
      expect(LABELS[locale].ui.typeSecond).toContain("F(t, x, x')");
      // The two labels that name y do so to say it has no meaning here.
      expect(LABELS[locale].ui.secondOrderYSymbol).toMatch(/y/);
      expect(LABELS[locale].ui.syntaxHintSecondOrder).toMatch(/F\(t, x, x'\)|cos\(t\)/);
    }
    expect(LABELS.en.ui.secondOrderYSymbol).toContain("y has no meaning here");
    expect(LABELS.zh.ui.secondOrderYSymbol).toContain("y 在这里没有含义");
    expect(LABELS.en.ui.syntaxHintSecondOrder).toContain("y has no meaning here");
    expect(LABELS.zh.ui.syntaxHintSecondOrder).toContain("y 在这里没有含义");
    // The vertical-name placeholder {vv} exists wherever a range or an axis pair is named.
    for (const locale of LOCALES) {
      const L = LABELS[locale];
      for (const key of ["yRangeError", "featuresBox", "shownRangeEqual", "shownRangeFilled", "exportRange"] as const) {
        expect(L.ui[key], `${locale}.${key}`).toContain("{vv}");
      }
    }
  });

  it("the features-box line is the range only; its detail (behind the info toggle) names both the entered range (home view) and the visible range (after zoom/pan) [M]", () => {
    for (const locale of LOCALES) {
      const L = LABELS[locale];
      // the visible line: the four bounds and the horizontal name, no explanation
      for (const ph of ["{hv}", "{xMin}", "{xMax}", "{yMin}", "{yMax}"]) expect(L.ui.featuresBox, locale).toContain(ph);
      expect(L.ui.featuresBox.length, locale).toBeLessThan(80);
      expect(L.ui.featuresBoxDetail, locale).not.toMatch(/\{\w+\}/);
    }
    expect(LABELS.zh.ui.featuresBoxDetail).toMatch(/输入范围/);
    expect(LABELS.zh.ui.featuresBoxDetail).toMatch(/可见范围/);
    expect(LABELS.zh.ui.featuresBoxDetail).not.toMatch(/当前可见范围/);
    expect(LABELS.en.ui.featuresBoxDetail).toMatch(/entered range at the home view/);
    expect(LABELS.en.ui.featuresBoxDetail).toMatch(/visible range after zooming or panning/);
    expect(LABELS.en.ui.featuresBoxDetail).not.toMatch(/computed for the visible range/);
  });

  it("[M] controls keep labels only: the arrow and equal-scale labels are short, their explanations live in the detail / help texts", () => {
    for (const locale of LOCALES) {
      const L = LABELS[locale];
      for (const key of ["arrowLength", "arrowUnit", "arrowScaled", "equalScale", "help", "details"] as const) {
        expect(L.ui[key].length, `${locale}.${key}`).toBeLessThanOrEqual(12);
        expect(L.ui[key], `${locale}.${key}`).not.toMatch(/[（(]/);
      }
      // P2.4: the equal-scale explanation says what an angle means in each kind of picture.
      expect(L.ui.equalScaleDetailFirst).toContain("dy/dt");
      expect(L.ui.equalScaleDetailSystem).toContain("dy/dx");
      expect(L.ui.equalScaleDetailSecond).toContain("dx'/dx");
      for (const key of ["equalScaleDetailFirst", "equalScaleDetailSystem", "equalScaleDetailSecond"] as const) expect(L.ui[key], key).toMatch(/[。.]$/);
      expect(L.ui.equalScaleWarningFirst).toContain("dy/dt");
      expect(L.ui.equalScaleWarningPlane).not.toContain("dy/dt");
      // the tagline is one short line; the long subtitle is gone
      expect(L.ui.tagline.length).toBeLessThan(50);
      expect(Object.keys(L.ui)).not.toContain("subtitle");
      expect(Object.keys(L.ui)).not.toContain("shownRange");
      // the displayed-range lines are the range plus a short qualifier
      for (const key of ["shownRangeEqual", "shownRangeFilled"] as const) {
        expect(L.ui[key], `${locale}.${key}`).toMatch(/^\{hv\} ∈ \[\{xMin\}, \{xMax\}\]/);
        expect(L.ui[key].length, `${locale}.${key}`).toBeLessThan(70);
      }
      expect(L.ui.timeDependentShort).toContain("{t}");
      expect(L.ui.timeDependentShort.length).toBeLessThan(L.ui.timeDependentNote.length);
    }
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
        // the hint about fractional powers of a negative base (review J: 3*y^(2/3) reads as one-sided
        // here) has its own key since J-fix2 and is appended only when the expression has one
        expect(L.stability[key], `${locale}.${key}`).not.toMatch(/abs\(y\)\^\(2\/3\)/);
        expect(L.tool.fractionalPowerHint, locale).toMatch(/abs\(y\)\^\(2\/3\)/);
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
    // Round Y: "left" / "approached" read as directions; the tags now say who leaves and who approaches.
    expect(labels("en").stabilityShort.edge_leave).toBe("domain edge, solutions leave");
    expect(labels("en").stabilityShort.edge_approach).toBe("domain edge, solutions approach");
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
    // The borderline sentence names the two thresholds it sits between (the kernel's frozen 0.25 and 0.1), P2.6.
    expect(uniquenessSentence(L, { verdict: "borderline", exponent: 0.1234 }, { point: { x: 1, y: 2 } })).toBe(fill(L.uniqueness.borderlinePoint, { point: "(1, 2)", alpha: "0.12", unbounded: "0.25", bounded: "0.1" }));
    expect(uniquenessSentence(L, { verdict: "borderline", exponent: 0.1234 }, { point: { x: 1, y: 2 } })).toContain("0.25");
    expect(uniquenessSentence(L, { verdict: "borderline", exponent: 0.1234 }, { point: { x: 1, y: 2 } })).not.toMatch(/\{\w+\}/);
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
    // [J-fix2] decision: -0.00001 used to collapse to "0" (toFixed(4)); only an exact 0 prints as "0" now.
    expect(formatNumber(-0.00001)).toBe("-1e-5");
    expect(formatNumber(1e21 * 3)).toBe("3e+21");
  });

  it("[J-fix2] small and large magnitudes keep their significant digits (derived strings)", async () => {
    const { formatNumber } = await import("./labels");
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(-0)).toBe("0");
    expect(formatNumber(1e-5)).toBe("1e-5");
    expect(formatNumber(-2.5e-7)).toBe("-2.5e-7");
    expect(formatNumber(1.23456e-5, 3)).toBe("1.23e-5");
    expect(formatNumber(2e-6, 5)).toBe("2e-6");
    expect(formatNumber(0.00447)).toBe("0.0045");
    expect(formatNumber(0.00447, 5)).toBe("0.00447");
    expect(formatNumber(0.004, 2)).toBe("4e-3");
    expect(formatNumber(-0.004, 2)).toBe("-4e-3");
    expect(formatNumber(1e6)).toBe("1e+6");
    expect(formatNumber(123456.789)).toBe("123456.789");
    expect(formatNumber(-1.5)).toBe("-1.5");
    expect(formatNumber(Infinity)).toBe("Infinity");
  });

  it("[J-fix2] the same number is formatted the same at every scale: v and v * 1e-6 differ only in the exponent", async () => {
    const { formatNumber } = await import("./labels");
    expect(formatNumber(2.5e-6)).toBe("2.5e-6");
    expect(formatNumber(2.5e6)).toBe("2.5e+6");
  });

  it("[J-fix2] formatPoint tells two small-scale equilibria apart and formatEigenvalue keeps a small complex pair complex", async () => {
    const { formatEigenvalue, formatPoint } = await import("./labels");
    expect(formatPoint({ x: -1e-5, y: 0 })).toBe("(-1e-5, 0)");
    expect(formatPoint({ x: 1e-5, y: 0 })).toBe("(1e-5, 0)");
    expect(formatPoint({ x: -1e-5, y: 0 })).not.toBe(formatPoint({ x: 1e-5, y: 0 }));
    expect(formatEigenvalue({ re: -5e-7, im: 8.66e-7 })).toBe("-5e-7 + 8.66e-7i");
    expect(formatEigenvalue({ re: -5e-7, im: -8.66e-7 })).toBe("-5e-7 - 8.66e-7i");
    expect(formatEigenvalue({ re: 2e-6, im: 0 })).toBe("2e-6");
    expect(formatEigenvalue({ re: 1, im: 1e-16 })).toBe("1");
    expect(formatEigenvalue({ re: 0, im: 1e-9 })).toBe("0 + 1e-9i");
  });
});

describe("fill and the locale fallback", () => {
  it("fills placeholders and leaves unknown ones visible", () => {
    expect(fill("a {x} b {y}", { x: 1, y: "two" })).toBe("a 1 b two");
    expect(fill("{missing}", {})).toBe("{missing}");
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

describe("constant-solution lines and notices (J-fix2)", () => {
  it("formatShort keeps 2 significant digits: 0.0063, 1300, 1.6e-12, 0.15", async () => {
    const { formatShort } = await import("./labels");
    expect(formatShort(0.00625)).toBe("0.0063");
    expect(formatShort(1250)).toBe("1300");
    expect(formatShort(1.5717e-12)).toBe("1.6e-12");
    expect(formatShort(0.15)).toBe("0.15");
    expect(formatShort(NaN)).toBe("NaN");
  });

  it("constantSolutionLines: the sentence first, then the plateau note, the probe count below 3, then the uniqueness sentence; both languages, no placeholder left", async () => {
    const { constantSolutionLines, stabilitySentence } = await import("./labels");
    for (const locale of LOCALES) {
      const L = labels(locale);
      const plain = constantSolutionLines(L, { y: 1, stability: "stable", probes: { usable: 7, total: 7 } });
      expect(plain).toEqual([fill(L.tool.constantSolution, { y: "1", stability: L.stability.stable })]);
      const noted = constantSolutionLines(L, {
        y: 0,
        stability: "semi_stable",
        plateauHalfWidth: 0.036633,
        probes: { usable: 2, total: 7 },
        uniqueness: { verdict: "unbounded", exponent: 0.5, probesFailing: 2, probesTotal: 2, side: "above" },
      });
      expect(noted).toHaveLength(4);
      expect(noted[1]).toBe(fill(L.tool.constantSolutionPlateau, { y: "0", w: "0.037" }));
      expect(noted[2]).toBe(fill(L.tool.constantSolutionProbes, { n: 2, total: 7 }));
      expect(noted[3]).toBe(fill(L.uniqueness.unbounded, { y: "0", alpha: "0.5" }));
      for (const line of noted) expect(line, `${locale}`).not.toMatch(/\{\w+\}/);
      // the hint is appended to a domain-edge sentence only for an expression with a fractional power
      const edge = { stability: "edge_leave" as const, domainEdge: "above" as const };
      expect(stabilitySentence(L, edge, { kind: "explicit", g: "y*log(y)" })).toBe(stabilitySentence(L, edge));
      expect(stabilitySentence(L, edge, { kind: "explicit", g: "3*y^(2/3)" })).toBe(`${stabilitySentence(L, edge)}${L.tool.parenOpen}${L.tool.fractionalPowerHint}${L.tool.parenClose}`);
      expect(stabilitySentence(L, { stability: "stable" }, { kind: "explicit", g: "y^(2/3)" })).toBe(L.stability.stable);
      expect(L.tool.fractionalPowerHint).toMatch(/[。.]$/);
      expect(L.tool.zeroPlateau).toMatch(/[。.]$/);
      expect(L.tool.scanResolution).toContain("{dy}");
    }
  });

  it("constantSolutionNotices and noConstantSentence: the plateau notice only with plateaus, the resolution always; the all-zero reason has its own sentence", async () => {
    const { constantSolutionNotices, noConstantSentence } = await import("./labels");
    for (const locale of LOCALES) {
      const L = labels(locale);
      expect(constantSolutionNotices(L, { resolution: 0.005, zeroPlateaus: [] })).toEqual([fill(L.tool.scanResolution, { dy: "0.005" })]);
      expect(constantSolutionNotices(L, { resolution: 0.15, zeroPlateaus: [{ min: 27.3, max: 30 }] })).toEqual([L.tool.zeroPlateau, fill(L.tool.scanResolution, { dy: "0.15" })]);
      expect(constantSolutionNotices(L, {})).toEqual([]);
      expect(noConstantSentence(L, "untestable", "all_zero")).toBe(L.tool.noConstantAllZero);
      expect(noConstantSentence(L, "untestable", "undefined")).toBe(L.tool.noConstantUntestable);
      expect(noConstantSentence(L, "untestable")).toBe(L.tool.noConstantUntestable);
      expect(noConstantSentence(L, true)).toBe(L.tool.noConstantAutonomous);
      expect(noConstantSentence(L, false)).toBe(L.tool.noConstantGeneral);
    }
  });
});

describe("[M] folded caveats: compact eigenvalues and the short line / full detail pairs (display only)", () => {
  it("formatEigenvalues prints a conjugate pair compactly and everything else as the plain list (derived strings)", async () => {
    const { formatEigenvalues, formatEigenvalue } = await import("./labels");
    // a center-like pair with real part exactly 0: "±1i" (formatNumber(1) = "1")
    expect(formatEigenvalues([{ re: 0, im: 1 }, { re: 0, im: -1 }])).toBe("±1i");
    // damped oscillator x'' + 0.5x' + x = 0: λ = -0.25 ± i sqrt(1 - 1/16) = -0.25 ± 0.96825i -> 4 digits "0.9682"
    const im = Math.sqrt(1 - 1 / 16);
    expect(formatEigenvalues([{ re: -0.25, im }, { re: -0.25, im: -im }])).toBe("-0.25 ± 0.9682i");
    expect(formatEigenvalues([{ re: -0.25, im: -im }, { re: -0.25, im }])).toBe("-0.25 ± 0.9682i");
    // two real eigenvalues: the list, each as formatEigenvalue prints it
    expect(formatEigenvalues([{ re: -1, im: 0 }, { re: -2, im: 0 }])).toBe("-1, -2");
    expect(formatEigenvalues([{ re: 3, im: 0 }])).toBe("3");
    expect(formatEigenvalues([])).toBe("");
    // not a conjugate pair (different real parts): no ± shorthand
    expect(formatEigenvalues([{ re: 1, im: 2 }, { re: 3, im: -2 }])).toBe(`${formatEigenvalue({ re: 1, im: 2 })}, ${formatEigenvalue({ re: 3, im: -2 })}`);
    // a tiny real part is printed, not hidden (what was measured)
    expect(formatEigenvalues([{ re: 1e-17, im: 1 }, { re: 1e-17, im: -1 }])).toBe("1e-17 ± 1i");
    expect(formatEigenvalues([{ re: 0, im: 1 }, { re: 0, im: -1 }], 5)).toBe("±1i");
  });

  it("equilibriumDetail is the caveat then the uniqueness sentence, each only when it speaks", async () => {
    const { equilibriumDetail } = await import("./labels");
    for (const locale of LOCALES) {
      const L = labels(locale);
      const at = { x: 0, y: 0 };
      expect(equilibriumDetail(L, { at })).toEqual([]);
      expect(equilibriumDetail(L, { at, caveat: "center" })).toEqual([L.caveat.center]);
      expect(equilibriumDetail(L, { at, caveat: null, uniqueness: { verdict: "bounded_at_tested_scales", exponent: 0 } })).toEqual([]);
      expect(equilibriumDetail(L, { at, caveat: "domainEdge", uniqueness: { verdict: "unbounded", exponent: 0.5 } })).toEqual([
        L.caveat.domainEdge,
        fill(L.uniqueness.unboundedPoint, { point: "(0, 0)", alpha: "0.5" }),
      ]);
    }
  });

  it("constantSolutionFolded: the canvas tag on the line, every full line of constantSolutionLines behind it", async () => {
    const { constantSolutionFolded, constantSolutionLines } = await import("./labels");
    for (const locale of LOCALES) {
      const L = labels(locale);
      const plain = { y: 1, stability: "stable" as const, probes: { usable: 7, total: 7 } };
      expect(constantSolutionFolded(L, plain)).toEqual({
        short: fill(L.tool.constantSolution, { y: "1", stability: L.stabilityShort.stable }),
        detail: [fill(L.tool.constantSolution, { y: "1", stability: L.stability.stable })],
      });
      const edge = { y: 0, stability: "edge_leave" as const, domainEdge: "above" as const, probes: { usable: 7, total: 7 }, uniqueness: { verdict: "unbounded" as const, exponent: 0.5, probesFailing: 2, probesTotal: 2, side: "above" as const } };
      const folded = constantSolutionFolded(L, edge, { kind: "explicit", g: "3*y^(2/3)" });
      expect(folded.short).toBe(fill(L.tool.constantSolution, { y: "0", stability: L.stabilityShort.edge_leave }));
      expect(folded.detail).toEqual(constantSolutionLines(L, edge, { kind: "explicit", g: "3*y^(2/3)" }));
      expect(folded.detail).toHaveLength(2);
      expect(folded.detail[0]).toContain(L.side.above);
      expect(folded.detail[0]).toContain(L.tool.fractionalPowerHint);
      expect(folded.detail[1]).toMatch(/Lipschitz/);
      expect(folded.short.length).toBeLessThan(folded.detail[0].length);
    }
  });

  it("timeDependentFolded and formFolded keep the full sentences in the detail", async () => {
    const { timeDependentFolded, formFolded } = await import("./labels");
    for (const locale of LOCALES) {
      const L = labels(locale);
      expect(timeDependentFolded(L, 1.5)).toEqual({ short: fill(L.ui.timeDependentShort, { t: "1.5" }), detail: [fill(L.ui.timeDependentNote, { t: "1.5" })] });
      const f = { form: "separable" as const, verdict: "consistent" as const, evidence: "EVIDENCE.", caveat: "CAVEAT." };
      const folded = formFolded(L, f);
      expect(folded.short).toBe(fill(L.tool.formLine, { form: L.form.separable, evidence: "" }).replace(/^- /, "").trim());
      expect(folded.short).not.toMatch(/^- /);
      expect(folded.short).not.toMatch(/\s$/);
      expect(folded.detail).toEqual(["EVIDENCE.", "CAVEAT."]);
      expect(formFolded(L, { ...f, verdict: "borderline", caveat: "" }).detail).toEqual(["EVIDENCE."]);
      expect(formFolded(L, { ...f, verdict: "borderline" }).short).toBe(fill(L.tool.formBorderlineLine, { form: L.form.separable, evidence: "" }).replace(/^- /, "").trim());
    }
  });
});

describe("refineCapped notice (round N.3 f)", () => {
  it("is printed for an ordinary result and for isolated degenerate points, never for a continuum", async () => {
    const { equilibriaNotices, fill } = await import("./labels");
    for (const locale of LOCALES) {
      const L = labels(locale);
      expect(equilibriaNotices(L, { refineCapped: true })).toEqual([L.tool.refineCapped]);
      expect(equilibriaNotices(L, { refineCapped: true, warning: "multiple_non_hyperbolic" })).toEqual([L.warning.multiple_non_hyperbolic, L.tool.refineCapped]);
      expect(equilibriaNotices(L, { refineCapped: true, warning: "possible_continuum" })).toEqual([L.warning.possible_continuum]);
      expect(equilibriaNotices(L, { refineCapped: true, warning: "region_of_equilibria" })).toEqual([L.warning.region_of_equilibria]);
      expect(equilibriaNotices(L, { refineCapped: false })).toEqual([]);
      expect(equilibriaNotices(L, { refineCapped: true, truncated: true, equilibria: [1, 2] })).toEqual([fill(L.ui.equilibriaTruncated, { max: 2 }), L.tool.refineCapped]);
      expect(L.tool.refineCapped).toMatch(/[。.]$/);
    }
  });
});

describe("[V] eigenDirectionLines: the ⓘ of an equilibrium says which line is which", () => {
  const eq = (f: string, g: string) => findEquilibria(compileSystem({ f, g }), { x: { min: -2.9, max: 3.1 }, y: { min: -3.05, max: 2.95 } }).points[0];

  it("a saddle names its stable and its unstable direction, how each is drawn, and the eigenvalue (both languages)", () => {
    for (const locale of LOCALES) {
      const L = labels(locale);
      const lines = eigenDirectionLines(L, eq("x", "-y"));
      expect(lines).toHaveLength(2);
      const stable = lines.find((l) => l.includes("(0, 1)"))!;
      const unstable = lines.find((l) => l.includes("(1, 0)"))!;
      expect(stable).toBe(fill(L.ui.eigenDirectionStable, { v: "(0, 1)", l: "-1" }));
      expect(unstable).toBe(fill(L.ui.eigenDirectionUnstable, { v: "(1, 0)", l: "1" }));
    }
  });

  it("a degenerate node has one direction and says that this is what makes it degenerate; a star has every direction; a spiral none", () => {
    const L = labels("en");
    const degenerate = eigenDirectionLines(L, eq("-x + y", "-y"));
    expect(degenerate).toEqual([fill(L.ui.eigenDirectionStable, { v: "(1, 0)", l: "-1" }), L.ui.eigenOne]);
    expect(eigenDirectionLines(L, eq("x", "y"))).toEqual([L.ui.eigenEvery]);
    expect(eigenDirectionLines(L, eq("y", "-x - 0.5*y"))).toEqual([L.ui.eigenComplex]);
  });

  it("on a second-order picture a direction is a pair (x, x'), never a y", () => {
    const L = labels("en");
    // x'' = x: x' = v, v' = x, the saddle of x' = y, y' = x: directions (1, 1)/sqrt 2 and (1, -1)/sqrt 2
    const lines = eigenDirectionLines(L, eq("y", "x"), true);
    expect(lines.join(" ")).toContain("(x, x') = (0.707, 0.707)");
    expect(lines.join(" ")).toContain("(x, x') = (0.707, -0.707)");
  });
});
