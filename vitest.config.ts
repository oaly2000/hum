import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "preact",
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "fast",
          include: ["packages/*/tests/**/*.test.{ts,tsx}"],
          exclude: ["packages/*/tests/integration/**"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["packages/*/tests/integration/**/*.test.{ts,tsx}"],
          environment: "node",
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
