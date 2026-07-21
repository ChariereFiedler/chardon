import { describe, it, expect, afterEach } from "vitest";
import { isMainModule } from "./is-main.ts";

describe("isMainModule", () => {
  const original = process.argv[1];
  afterEach(() => {
    process.argv[1] = original;
  });

  it("matches the invoked .ts entry by basename", () => {
    process.argv[1] = "/home/x/lab/chardon/hooks/stop.ts";
    expect(isMainModule("stop")).toBe(true);
  });

  it("matches the invoked .mjs bundle by basename", () => {
    process.argv[1] = "/home/x/lab/chardon/dist/stop.mjs";
    expect(isMainModule("stop")).toBe(true);
  });

  it("matches the invoked .js bundle by basename", () => {
    process.argv[1] = "/home/x/lab/chardon/dist/stop.js";
    expect(isMainModule("stop")).toBe(true);
  });

  // Regression for the crash: `node dist/stop.mjs` bundles analyze-daily.ts, whose
  // CLI guard must NOT fire — otherwise generateDailyReport runs outside fail-open.
  it("does NOT fire for an entry bundled into a different host", () => {
    process.argv[1] = "/home/x/lab/chardon/dist/stop.mjs";
    expect(isMainModule("analyze-daily")).toBe(false);
  });

  it("returns false when argv[1] is missing", () => {
    process.argv[1] = "";
    expect(isMainModule("stop")).toBe(false);
  });
});
