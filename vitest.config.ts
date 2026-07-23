import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "lib/**/*.test.ts",
      "hooks/**/*.test.ts",
      "scripts/**/*.test.ts",
      "test/**/*.test.ts",
    ],
    // Tests use a throwaway SQLite DB (never ~/.claude/chardon.db): each test points
    // CHARDON_DB at a temp file. No network in the unit suite (eval/ is excluded).
    globals: false,
    // node:sqlite is a recent Node builtin: externalize it so Vite does not try to
    // bundle it (otherwise "Failed to load url sqlite").
    server: { deps: { external: ["node:sqlite"] } },
    // `npm run coverage` (needs @vitest/coverage-v8). Report under coverage/ (git-ignored).
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**", "scripts/**", "hooks/**"],
      exclude: ["**/*.test.ts", "eval/**"],
      // Quality gate scoped to lib/ (the pure logic layer, currently ~92% lines):
      // a blunt global threshold would also gate hooks/ and scripts/ whose
      // fail-open and I/O branches are exercised as subprocesses, outside v8.
      thresholds: {
        "lib/**": { lines: 90 },
      },
    },
  },
});
