import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror tsconfig "paths": "@/*" -> "./*"
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["*.test.ts", "lib/**/*.test.ts", "app/**/*.test.ts"],
    // Review agents leave scratch tests under lib/**/__probe__/ (gitignored); never part of the gate.
    exclude: ["**/node_modules/**", "**/__probe__/**"],
  },
});
