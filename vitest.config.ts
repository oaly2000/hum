import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "preact",
  },
  test: {
    include: ["packages/*/tests/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
