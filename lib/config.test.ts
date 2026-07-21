import { describe, it, expect, beforeEach } from "vitest";
import { loadConfig, dbPath, repoSlug, transcriptSlug } from "./config.ts";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("config", () => {
  beforeEach(() => { delete process.env.CHARDON_DB; });

  it("loads plugin defaults when no .chardon.json is present", () => {
    const d = mkdtempSync(join(tmpdir(), "chardon-"));
    const c = loadConfig(d);
    expect(c.outDir).toBe(join(d, "docs/chardon"));
    expect(c.gitlab.enabled).toBe(false);
  });

  it("merges project .chardon.json override", () => {
    const d = mkdtempSync(join(tmpdir(), "chardon-"));
    writeFileSync(join(d, ".chardon.json"), JSON.stringify({ outDir: "rapports", tokenBudgetPerDay: 500000 }));
    const c = loadConfig(d);
    expect(c.outDir).toBe(join(d, "rapports"));
    expect(c.tokenBudgetPerDay).toBe(500000);
    expect(c.ticketRegex).toBe("(?:feat|fix)/(\\d+)"); // default preserved
  });

  it("confines a traversing outDir to the project, falling back to the default", () => {
    const d = mkdtempSync(join(tmpdir(), "chardon-"));
    writeFileSync(join(d, ".chardon.json"), JSON.stringify({ outDir: "../../../../tmp/pwned" }));
    expect(loadConfig(d).outDir).toBe(join(d, "docs/chardon"));
  });

  it("confines an absolute outDir to the project, falling back to the default", () => {
    const d = mkdtempSync(join(tmpdir(), "chardon-"));
    writeFileSync(join(d, ".chardon.json"), JSON.stringify({ outDir: "/tmp/pwned" }));
    expect(loadConfig(d).outDir).toBe(join(d, "docs/chardon"));
  });

  it("deep-merges a partial thresholds override, keeping other defaults", () => {
    const d = mkdtempSync(join(tmpdir(), "chardon-"));
    writeFileSync(join(d, ".chardon.json"), JSON.stringify({ thresholds: { toilMin: 10 } }));
    const c = loadConfig(d);
    expect(c.thresholds.toilMin).toBe(10); // overridden
    expect(c.thresholds.coldMin).toBe(3); // default preserved
    expect(c.thresholds.slowMs).toBe(30000); // default preserved
  });

  it("dbPath honours CHARDON_DB", () => {
    process.env.CHARDON_DB = "/tmp/x.db";
    expect(dbPath()).toBe("/tmp/x.db");
  });

  it("dbPath falls back to ~/.claude/chardon.db when CHARDON_DB is unset", () => {
    delete process.env.CHARDON_DB;
    const { homedir } = require("node:os");
    const { join: joinPath } = require("node:path");
    expect(dbPath()).toBe(joinPath(homedir(), ".claude", "chardon.db"));
  });

  it("repoSlug strips the worktree suffix", () => {
    expect(repoSlug("/home/x/my-project")).toBe("my-project");
    expect(repoSlug("/home/x/my-project-wt-3")).toBe("my-project");
  });

  it("transcriptSlug replaces / with - (generic path, no hardcoded project path)", () => {
    expect(transcriptSlug("/home/x/p")).toBe("-home-x-p");
  });

  it("deep-merges a partial gitlab override", () => {
    const d = mkdtempSync(join(tmpdir(), "chardon-"));
    writeFileSync(join(d, ".chardon.json"), JSON.stringify({ gitlab: { enabled: true } }));
    const c = loadConfig(d);
    expect(c.gitlab.enabled).toBe(true);
    expect(c.gitlab.tokenEnv).toBe("GITLAB_TOKEN"); // default kept
  });

  it("falls back to the default ticketRegex when the override is invalid", () => {
    const d = mkdtempSync(join(tmpdir(), "chardon-"));
    writeFileSync(join(d, ".chardon.json"), JSON.stringify({ ticketRegex: "([unclosed" }));
    const c = loadConfig(d);
    expect(c.ticketRegex).toBe("(?:feat|fix)/(\\d+)");
  });
});
