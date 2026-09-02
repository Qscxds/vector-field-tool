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

  it("leaves /_next asset URLs untouched (assetPrefix owns absolute URLs)", () => {
    const html =
      '<head></head><script src="/_next/static/chunks/a.js" async></script>' +
      '<link rel="stylesheet" href="/_next/static/css/b.css"/>';
    const out = rewriteForSandbox(html, BASE);
    expect(out).toContain('src="/_next/static/chunks/a.js"');
    expect(out).toContain('href="/_next/static/css/b.css"');
  });
});
