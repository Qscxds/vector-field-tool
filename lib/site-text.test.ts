import { describe, expect, it } from "vitest";
import { PRESETS } from "../app/vector-field/presets";
import { ALLOWED_FUNCTIONS } from "./core/parse";
import { LOCALES } from "./labels";
import {
  bilingual,
  HOME_EXAMPLE_PRESET_IDS,
  EMBED_HEIGHT_WITH_CONTROLS,
  EMBED_HEIGHT_WITHOUT_CONTROLS,
  EMBED_PATH,
  embedSnippet,
  helpFunctionNames,
  MCP_ENDPOINT,
  SITE_ORIGIN,
  SITE_TEXT,
  siteText,
  withLocale,
} from "./site-text";

/** Every leaf path, arrays included (so both languages must list the same number of items). */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .flatMap((k) => keyPaths((value as Record<string, unknown>)[k], prefix ? `${prefix}.${k}` : k));
}

function leaves(value: unknown, path: string, out: [string, unknown][]): void {
  if (value !== null && typeof value === "object") {
    for (const [k, child] of Object.entries(value as Record<string, unknown>)) leaves(child, `${path}.${k}`, out);
  } else out.push([path, value]);
}

describe("site text", () => {
  it("zh and en have exactly the same key structure (lists included)", () => {
    expect(keyPaths(SITE_TEXT.zh)).toEqual(keyPaths(SITE_TEXT.en));
  });

  it("every leaf is a non-empty string in both languages", () => {
    for (const locale of LOCALES) {
      const out: [string, unknown][] = [];
      leaves(SITE_TEXT[locale], locale, out);
      expect(out.length).toBeGreaterThan(50);
      for (const [path, v] of out) {
        expect(typeof v, path).toBe("string");
        expect((v as string).trim().length, path).toBeGreaterThan(0);
      }
    }
  });

  it("placeholders match between languages (there are none by design)", () => {
    for (const locale of LOCALES) {
      const out: [string, unknown][] = [];
      leaves(SITE_TEXT[locale], locale, out);
      for (const [path, v] of out) expect((v as string).match(/\{\w+\}/g), path).toBeNull();
    }
  });

  it("no English leaf uses British spelling of the words the copy contains", () => {
    const out: [string, unknown][] = [];
    leaves(SITE_TEXT.en, "en", out);
    for (const [path, v] of out) expect(v as string, path).not.toMatch(/\b(behaviour|colour|centre|analyse|visualis)/i);
  });

  it("siteText falls back to English for an unknown locale", () => {
    expect(siteText("fr" as never)).toBe(SITE_TEXT.en);
    expect(siteText("zh")).toBe(SITE_TEXT.zh);
  });
});

describe("embed snippet", () => {
  it("contains the site origin, /embed, the example and the language", () => {
    const s = embedSnippet("zh");
    expect(s.startsWith("<iframe ")).toBe(true);
    expect(s.endsWith("</iframe>")).toBe(true);
    expect(s).toContain(`src="${SITE_ORIGIN}${EMBED_PATH}?`);
    expect(s).toContain("g=y*(1-y)");
    expect(s).toContain("loc=zh");
    expect(s).toContain(`height="${EMBED_HEIGHT_WITH_CONTROLS}"`);
    expect(s).not.toContain("controls=0");
    expect(s).toContain('loading="lazy"');
    expect(s).toContain('allow="fullscreen"');
  });

  it("the read-only variant adds controls=0 and the smaller height", () => {
    const s = embedSnippet("en", false);
    expect(s).toContain("controls=0");
    expect(s).toContain("loc=en");
    expect(s).toContain(`height="${EMBED_HEIGHT_WITHOUT_CONTROLS}"`);
    expect(EMBED_HEIGHT_WITHOUT_CONTROLS).toBeLessThan(EMBED_HEIGHT_WITH_CONTROLS);
  });

  it("the MCP endpoint is /mcp on the site origin", () => {
    expect(MCP_ENDPOINT).toBe(`${SITE_ORIGIN}/mcp`);
    expect(SITE_ORIGIN).toMatch(/^https:\/\/[^/]+$/);
  });
});

describe("help function list", () => {
  it("equals the parser whitelist keys, in order", () => {
    expect(helpFunctionNames()).toEqual([...ALLOWED_FUNCTIONS.keys()]);
    expect(helpFunctionNames()).toContain("sqrt");
  });
});

describe("home examples", () => {
  it("every example card points at an existing preset", () => {
    const ids = new Set(PRESETS.map((p) => p.id));
    for (const [card, id] of Object.entries(HOME_EXAMPLE_PRESET_IDS)) {
      expect(ids.has(id), card).toBe(true);
      expect(card in SITE_TEXT.zh.home.examples, card).toBe(true);
    }
  });
});

describe("link helpers", () => {
  it("withLocale appends loc with ? or & as needed", () => {
    expect(withLocale("/vector-field", "zh")).toBe("/vector-field?loc=zh");
    expect(withLocale("/vector-field?m=first", "en")).toBe("/vector-field?m=first&loc=en");
  });

  it("bilingual joins the zh and en metadata strings", () => {
    expect(bilingual("homeTitle")).toBe(`${SITE_TEXT.zh.meta.homeTitle} / ${SITE_TEXT.en.meta.homeTitle}`);
  });
});
