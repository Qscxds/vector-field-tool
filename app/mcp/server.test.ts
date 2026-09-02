import { describe, expect, it } from "vitest";
import { rewriteForSandbox } from "./server";

const BASE = "https://example.trycloudflare.com";

describe("rewriteForSandbox", () => {
  it("injects <base href> right after <head>", () => {
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>';
    expect(rewriteForSandbox(html, BASE)).toContain(
      `<head><base href="${BASE}/"><meta charset="utf-8">`,
    );
  });

  it("keeps an existing <base>", () => {
    const html = '<html><head><base href="https://other/"></head></html>';
    expect(rewriteForSandbox(html, BASE)).toBe(html);
  });

  it("makes /_next asset URLs absolute in src and href attributes", () => {
    const html =
      '<head></head><script src="/_next/static/chunks/a.js" async></script>' +
      '<link rel="stylesheet" href="/_next/static/css/b.css"/>';
    const out = rewriteForSandbox(html, BASE);
    expect(out).toContain(`src="${BASE}/_next/static/chunks/a.js"`);
    expect(out).toContain(`href="${BASE}/_next/static/css/b.css"`);
  });

  it("does not touch /_next paths inside inline script strings or other attributes", () => {
    const html = '<head></head><script>self.__next_f.push(["/_next/static/chunks/x.js"])</script><a data-x="/_next/y">z</a>';
    expect(rewriteForSandbox(html, BASE)).toContain('["/_next/static/chunks/x.js"]');
    expect(rewriteForSandbox(html, BASE)).toContain('data-x="/_next/y"');
  });
});
