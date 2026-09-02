/**
 * lib/core — the pure computation kernel.
 *
 * Hard rule: nothing in this directory may import React, Next.js or any MCP package.
 * Data in, data out. Everything here must run offline under vitest.
 * (Enforced by architecture.test.ts.)
 */

export const CORE_NAME = "vector-field-tool/core";

/** Placeholder proving the test pipeline works. Real math arrives in P1. */
export function hello(name = "world"): string {
  return `hello, ${name}`;
}

/** Used by the P0 `ping` tool: returns the input unchanged. */
export function echo(input: string): string {
  return input;
}
