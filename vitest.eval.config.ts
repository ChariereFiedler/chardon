import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["eval/**/*.test.ts"],
    globals: false,
    server: { deps: { external: ["node:sqlite"] } },
  },
});
