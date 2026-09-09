import { describe, expect, it } from "vitest";
import { rewriteForSandbox, WIDGET_URI, WIDGET_VERSION } from "./server";

const BASE = "https://example.trycloudflare.com";

describe("widget resource URI", () => {
  it("carries the current widget version (Phase L: l-1); a bump means the connector must be reconnected in Claude", () => {
    // Claude caches the tool list with this URI per connection. Change this expectation ONLY
    // together with a real widget change, and say in the round report that the user must
    // disconnect and reconnect the connector.
    expect(WIDGET_VERSION).toBe("l-1");
    expect(WIDGET_URI).toBe("ui://vector-field-tool/widget.html?v=l-1");
  });
});

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
