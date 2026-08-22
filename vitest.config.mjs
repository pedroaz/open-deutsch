import { defineConfig } from "vitest/config";
import path from "node:path";

import { assertVitestProjectReady } from "./scripts/lib/vitest-projects.mjs";

function nodeProject(
  name,
  root,
  {
    include = ["test/**/*.test.ts"],
    allowEmptySkeleton = false,
    validateSourceTests = true,
    environment = "node",
  } = {},
) {
  if (validateSourceTests) {
    assertVitestProjectReady(path.resolve(import.meta.dirname, root), { allowEmptySkeleton });
  }
  return {
    root,
    test: {
      name,
      include,
      setupFiles: [path.resolve(import.meta.dirname, "tests/support/vitest-disposable-data.ts")],
      environment,
      clearMocks: true,
      mockReset: true,
      restoreMocks: true,
      unstubEnvs: true,
      unstubGlobals: true,
      sequence: { concurrent: false, hooks: "stack" },
    },
  };
}

export default defineConfig({
  test: {
    passWithNoTests: true,
    reporters: ["default"],
    projects: [
      nodeProject("test-support", ".", {
        include: ["tests/vitest/**/*.test.ts"],
        validateSourceTests: false,
      }),
      nodeProject("contracts", "packages/contracts", { allowEmptySkeleton: true }),
      nodeProject("domain", "packages/domain"),
      nodeProject("persistence", "packages/persistence", { allowEmptySkeleton: true }),
      nodeProject("codex-client", "packages/codex-client", { allowEmptySkeleton: true }),
      nodeProject("desktop", "apps/desktop", {
        include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
        environment: "jsdom",
      }),
      nodeProject("mcp-server", "apps/mcp-server", { allowEmptySkeleton: true }),
    ],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage/vitest",
      reporter: ["text", "json-summary", "html"],
      include: ["packages/domain/src/**/*.ts"],
      exclude: ["**/*.d.ts", "**/index.ts"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
