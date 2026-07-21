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

  it("writes one line to stderr with the op and error when enabled", () => {
    const spy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    process.env.CHARDON_DEBUG = "1";
    debug("post-tool-use write", new Error("db locked"));
    expect(spy).toHaveBeenCalledOnce();
    expect(String(spy.mock.calls[0][0])).toBe("[chardon] post-tool-use write: db locked\n");
  });
});
