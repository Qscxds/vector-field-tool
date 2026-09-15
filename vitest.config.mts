import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror tsconfig "paths": "@/*" -> "./*"
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    // Round S: the equilibria tests take 2-4 s here and up to ~8 s on GitHub's 2-vCPU runner, so the
    // 5 s default failed the first CI run; 20 s keeps a speed guard with a margin for CI. A test that
    // needs more says so itself (the 30 s guard on the x' = xy, y' = x² − y case).
    testTimeout: 20_000,
    include: ["*.test.ts", "lib/**/*.test.ts", "app/**/*.test.ts"],
    // Review agents leave scratch tests under lib/**/__probe__/ (gitignored); never part of the gate.
    exclude: ["**/node_modules/**", "**/__probe__/**"],
  },
});
