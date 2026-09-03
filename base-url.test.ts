import { describe, expect, it } from "vitest";
import { resolveConfiguredBaseUrl } from "./base-url";

describe("resolveConfiguredBaseUrl priority", () => {
  const vercelProd = { VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "tool.vercel.app", VERCEL_URL: "tool-abc.vercel.app" };

  it("explicit BASE_URL beats every Vercel variable, with no warning", () => {
    const r = resolveConfiguredBaseUrl({ BASE_URL: "https://tools.example.edu", ...vercelProd, VERCEL_BRANCH_URL: "branch.vercel.app" });
    expect(r).toEqual({ url: "https://tools.example.edu", source: "BASE_URL" });
  });

  it("strips trailing slashes and whitespace from BASE_URL", () => {
    expect(resolveConfiguredBaseUrl({ BASE_URL: " https://tools.example.edu// " }).url).toBe("https://tools.example.edu");
  });

  it("adds https:// to a BASE_URL without scheme and says so", () => {
    const r = resolveConfiguredBaseUrl({ BASE_URL: "tools.example.edu" });
    expect(r.url).toBe("https://tools.example.edu");
    expect(r.warning).toMatch(/no scheme/);
  });

  it("Vercel production without BASE_URL falls back to the production URL and warns about custom domains", () => {
    const r = resolveConfiguredBaseUrl(vercelProd);
    expect(r.url).toBe("https://tool.vercel.app");
    expect(r.source).toBe("vercel_production");
    expect(r.warning).toMatch(/custom domain/);
    expect(r.warning).toMatch(/BASE_URL=https:\/\/<custom domain>/);
  });

  it("preview deployments use the branch URL, then the deployment URL, without a warning", () => {
    expect(resolveConfiguredBaseUrl({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "branch.vercel.app", VERCEL_URL: "dep.vercel.app" })).toEqual({
      url: "https://branch.vercel.app",
      source: "vercel_preview",
    });
    expect(resolveConfiguredBaseUrl({ VERCEL_ENV: "preview", VERCEL_URL: "dep.vercel.app" }).url).toBe("https://dep.vercel.app");
  });

  it("production env without the production URL variable still uses the deployment URL", () => {
    expect(resolveConfiguredBaseUrl({ VERCEL_ENV: "production", VERCEL_URL: "dep.vercel.app" }).source).toBe("vercel_preview");
  });

  it("plain localhost: nothing configured", () => {
    expect(resolveConfiguredBaseUrl({})).toEqual({ source: "none" });
    expect(resolveConfiguredBaseUrl({ BASE_URL: "   " })).toEqual({ source: "none" });
  });
});
