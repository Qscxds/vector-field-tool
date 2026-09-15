/** Round R: the "Report a problem" link. Expectations derived from the rule (title, body with page / browser / three prompts, nothing else). */
import { describe, expect, it } from "vitest";
import { labels } from "./labels";
import { ISSUES_NEW_URL, reportIssueUrl } from "./report-issue";

describe("[R] reportIssueUrl", () => {
  it("opens a new issue in the public repository with the page link, the browser name and the three prompt lines, in the student's language, and nothing else", () => {
    for (const locale of ["zh", "en"] as const) {
      const L = labels(locale);
      const url = new URL(reportIssueUrl({ pageUrl: "https://tools.studycase.net/vector-field?m=second&eq=x''+%3D+-x", userAgent: "TestBrowser/1.0", locale }));
      expect(`${url.origin}${url.pathname}`).toBe(ISSUES_NEW_URL);
      expect([...url.searchParams.keys()].sort()).toEqual(["body", "title"]);
      expect(url.searchParams.get("title")).toBe(L.ui.reportTitle);
      const body = url.searchParams.get("body") ?? "";
      const lines = body.split("\n");
      expect(lines[0]).toBe(`${L.ui.reportPage.split("{url}")[0]}https://tools.studycase.net/vector-field?m=second&eq=x''+%3D+-x`);
      expect(lines[1]).toBe(`${L.ui.reportBrowser.split("{ua}")[0]}TestBrowser/1.0`);
      expect(lines).toContain(L.ui.reportDid);
      expect(lines).toContain(L.ui.reportExpected);
      expect(lines).toContain(L.ui.reportSaw);
      expect(body).not.toMatch(/\{(url|ua)\}/);
    }
  });

  it("keeps the two languages' prompts distinct", () => {
    expect(reportIssueUrl({ pageUrl: "u", userAgent: "a", locale: "zh" })).not.toBe(reportIssueUrl({ pageUrl: "u", userAgent: "a", locale: "en" }));
  });
});
