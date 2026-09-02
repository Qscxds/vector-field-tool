/**
 * Guards the architecture rules from the project brief:
 * lib/core and lib/render are pure. They must not import React, Next.js or anything MCP-related,
 * and they must be deterministic (no Math.random).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const LIB_DIR = fileURLToPath(new URL(".", import.meta.url));
const PURE_DIRS = ["core", "render"].map((d) => join(LIB_DIR, d)).filter((d) => existsSync(d));

const FORBIDDEN_IMPORTS = [
  /^react(\/|$)/,
  /^react-dom(\/|$)/,
  /^next(\/|$)/,
  /^@modelcontextprotocol\//,
  /^mcp-handler(\/|$)/,
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

function importSpecifiers(source: string): string[] {
  const re = /(?:from\s+|import\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g;
  return [...source.matchAll(re)].map((m) => m[1]);
}

describe("lib purity", () => {
  it("has at least one pure source file", () => {
    expect(PURE_DIRS.flatMap(walk).length).toBeGreaterThan(0);
  });

  it("never imports React, Next.js or MCP packages", () => {
    for (const file of PURE_DIRS.flatMap(walk)) {
      for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
        for (const rule of FORBIDDEN_IMPORTS) {
          expect(spec, `${file} imports "${spec}"`).not.toMatch(rule);
        }
      }
    }
  });

  it("never uses Math.random (tests must be repeatable)", () => {
    for (const file of PURE_DIRS.flatMap(walk)) {
      expect(readFileSync(file, "utf8"), `${file} uses Math.random`).not.toMatch(/Math\.random/);
    }
  });
});
