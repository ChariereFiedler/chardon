import { describe, it, expect, vi, afterEach } from "vitest";
import { debug } from "./debug.ts";

afterEach(() => {
  delete process.env.CHARDON_DEBUG;
  vi.restoreAllMocks();
});

describe("debug", () => {
  it("stays silent unless CHARDON_DEBUG=1", () => {
    const spy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    delete process.env.CHARDON_DEBUG;
    debug("collection", new Error("boom"));
    expect(spy).not.toHaveBeenCalled();
  });

  it("writes one timestamped line to stderr with the op and error when enabled", () => {
    const spy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    process.env.CHARDON_DEBUG = "1";
    const clock = () => new Date("2026-07-07T10:00:00.000Z");
    debug("post-tool-use write", new Error("db locked"), clock);
    expect(spy).toHaveBeenCalledOnce();
    expect(String(spy.mock.calls[0][0])).toBe(
      "[chardon] 2026-07-07T10:00:00.000Z post-tool-use write: db locked\n",
    );
  });

  it("prefixes an ISO timestamp with the default clock", () => {
    const spy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    process.env.CHARDON_DEBUG = "1";
    debug("collection");
    expect(String(spy.mock.calls[0][0])).toMatch(
      /^\[chardon\] \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z collection\n$/,
    );
  });

  it("never throws, even when the injected clock does", () => {
    process.env.CHARDON_DEBUG = "1";
    const brokenClock = () => {
      throw new Error("clock down");
    };
    expect(() => debug("collection", undefined, brokenClock)).not.toThrow();
  });
});
