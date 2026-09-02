/**
 * Guards the architecture rule from the project brief:
 * lib/core is pure. It must not import React, Next.js or anything MCP-related.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CORE_DIR = fileURLToPath(new URL(".", import.meta.url));

const FORBIDDEN = [
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
  const re =
    /(?:from\s+|import\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g;
  return [...source.matchAll(re)].map((m) => m[1]);
}

describe("lib/core purity", () => {
  it("contains at least one source file", () => {
    expect(walk(CORE_DIR).length).toBeGreaterThan(0);
  });

  it("never imports React, Next.js or MCP packages", () => {
    for (const file of walk(CORE_DIR)) {
      const specifiers = importSpecifiers(readFileSync(file, "utf8"));
      for (const spec of specifiers) {
        for (const rule of FORBIDDEN) {
          expect(spec, `${file} imports "${spec}"`).not.toMatch(rule);
        }
      }
    }
  });
});
