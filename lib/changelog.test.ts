/** Round S: the change log's shape and order. Expectations derived from the rules in changelog.ts. */
import { describe, expect, it } from "vitest";
import { CHANGELOG, HOME_NEWS_COUNT, ISO_DATE, latestEntries, type ChangelogEntry } from "./changelog";
import { LOCALES } from "./labels";
import { MCP_ENDPOINT } from "./site-text";

describe("[S] changelog entries", () => {
  it("every entry has an ISO calendar date, a title and the same number of non-empty points in both languages, and an action in both or neither", () => {
    expect(CHANGELOG.length).toBeGreaterThanOrEqual(1);
    for (const entry of CHANGELOG) {
      expect(entry.date).toMatch(ISO_DATE);
      const d = new Date(`${entry.date}T00:00:00Z`);
      expect(d.toISOString().slice(0, 10), entry.date).toBe(entry.date);
      for (const locale of LOCALES) {
        expect(entry.title[locale].trim().length).toBeGreaterThan(0);
        expect(entry.points[locale].length).toBeGreaterThan(0);
        for (const p of entry.points[locale]) expect(p.trim().length).toBeGreaterThan(0);
      }
      expect(entry.points.zh.length).toBe(entry.points.en.length);
      if (entry.action) for (const locale of LOCALES) expect(entry.action[locale].trim().length).toBeGreaterThan(0);
    }
  });

  it("the first entry (2026-09-15) names the second-order notation, the time-series view and tells MCP users to remove and re-add the connector at the endpoint", () => {
    const first = CHANGELOG[0];
    expect(first.date).toBe("2026-09-15");
    expect(first.points.en.join("\n")).toMatch(/F\(t, x, x'\)/);
    expect(first.points.zh.join("\n")).toMatch(/F\(t, x, x'\)/);
    expect(first.points.en.join("\n")).toMatch(/time-series/i);
    expect(first.points.zh.join("\n")).toMatch(/时间序列/);
    expect(first.action?.en).toMatch(/remove and re-add/);
    expect(first.action?.zh).toMatch(/删除连接器/);
    for (const locale of LOCALES) expect(first.action?.[locale]).toContain(MCP_ENDPOINT);
  });

  it("does not speak the reduction's language to students: no lone y in the zh or en points of a second-order line other than the sentence that says the y is gone", () => {
    for (const entry of CHANGELOG) {
      for (const locale of LOCALES) {
        for (const p of entry.points[locale]) {
          if (/internal y|内部的 y/.test(p)) continue;
          if (/x''|second-order|二阶/.test(p)) expect(p, p).not.toMatch(/(?<![A-Za-z'])y(?![A-Za-z(])/);
        }
      }
    }
  });
});

describe("[S] latestEntries", () => {
  const e = (date: string, tag: string): ChangelogEntry => ({ date, title: { zh: tag, en: tag }, points: { zh: [tag], en: [tag] } });

  it("returns the newest first, at most HOME_NEWS_COUNT, later array position first on the same date, and leaves the array untouched", () => {
    const entries = [e("2026-01-01", "a"), e("2026-03-01", "b"), e("2026-02-01", "c"), e("2026-03-01", "d"), e("2025-12-31", "e")];
    const copy = entries.map((x) => x.date);
    expect(latestEntries(3, entries).map((x) => x.title.en)).toEqual(["d", "b", "c"]);
    expect(latestEntries(10, entries).map((x) => x.title.en)).toEqual(["d", "b", "c", "a", "e"]);
    expect(entries.map((x) => x.date)).toEqual(copy);
    expect(HOME_NEWS_COUNT).toBe(3);
    expect(latestEntries().length).toBeLessThanOrEqual(HOME_NEWS_COUNT);
    expect(latestEntries()[0]).toBe(latestEntries(1)[0]);
  });
});
