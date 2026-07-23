import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { renderStatusline, renderSegments, MONITORING_SEGMENTS, ALL_SEGMENTS, collectGitlab, projectName, countWorktrees, tokensToday, windowSizeForModel, parseTranscriptUsage, countSubagents, isValidProjectId } from "./statusline.ts";
import type { StatuslineData } from "./statusline.ts";
import type { ChardonConfig } from "../lib/config.ts";
import { openDb, closeDb } from "../lib/db.ts";

describe("renderStatusline", () => {
  it("renders the core sections", () => {
    const s = renderStatusline({ project: "chardon", branch: "main", model: "opus", ctxUsed: 40, ctxMax: 200, subagents: 2, worktrees: 1 });
    expect(s).toContain("chardon");
    expect(s).toContain("main");
    expect(s).toContain("opus");
    expect(s).toContain("40/200");
    expect(s).toContain("🤖 2");
    expect(s).toContain("🌳 1");
  });

  it("omits optional sections when empty/zero", () => {
    const s = renderStatusline({ project: "p", branch: "b", subagents: 0, worktrees: 0 });
    expect(s).not.toContain("🤖");
    expect(s).not.toContain("🌳");
    expect(s).not.toContain("💰");
    expect(s).not.toContain("📥");
    expect(s.startsWith("p · b")).toBe(true);
  });

  it("shows the token budget only when a budget is set", () => {
    expect(renderStatusline({ project: "p", branch: "b", subagents: 0, worktrees: 0, tokensToday: 120000, tokenBudget: 500000 })).toContain("💰 120000/500000");
    expect(renderStatusline({ project: "p", branch: "b", subagents: 0, worktrees: 0, tokensToday: 120000, tokenBudget: 0 })).not.toContain("💰");
  });

  it("flags the token budget with ⚠ only when today's usage exceeds it", () => {
    const over = renderStatusline({ project: "p", branch: "b", subagents: 0, worktrees: 0, tokensToday: 600000, tokenBudget: 500000 });
    expect(over).toContain("💰 600000/500000 ⚠");
    const under = renderStatusline({ project: "p", branch: "b", subagents: 0, worktrees: 0, tokensToday: 500000, tokenBudget: 500000 });
    expect(under).toContain("💰 500000/500000");
    expect(under).not.toContain("⚠");
  });

  it("shows GitLab only when provided", () => {
    expect(renderStatusline({ project: "p", branch: "b", subagents: 0, worktrees: 0, gitlab: { mrs: 3, issues: 7 } })).toContain("📥 3");
  });
});

describe("renderSegments", () => {
  const full: StatuslineData = {
    project: "chardon",
    branch: "main",
    model: "opus",
    ctxUsed: 40,
    ctxMax: 200,
    subagents: 2,
    worktrees: 1,
    tokensToday: 10,
    tokenBudget: 100,
    gitlab: { mrs: 3, issues: 7 },
  };

  it("renders only the monitoring segments by default (no project/branch/context)", () => {
    const s = renderSegments(full, MONITORING_SEGMENTS);
    expect(s).toBe("💰 10/100 · 🤖 2 · 🌳 1 · 📥 3📋 7");
    expect(s).not.toContain("chardon");
    expect(s).not.toContain("main");
    expect(s).not.toContain("🧠");
  });

  it("renders an explicit list in the given order, including generic segments", () => {
    expect(renderSegments(full, ["branch", "project", "context"])).toBe("main · chardon · 🧠 opus 40/200");
  });

  it("ignores unknown segment names silently", () => {
    expect(renderSegments(full, ["nope", "project", "wat"])).toBe("chardon");
  });

  it("omits segments whose data is absent or zero", () => {
    const empty: StatuslineData = { project: "p", branch: "b", subagents: 0, worktrees: 0 };
    expect(renderSegments(empty, MONITORING_SEGMENTS)).toBe("");
    expect(renderSegments(empty, ["project", "tokens", "branch"])).toBe("p · b");
  });

  it("keeps renderStatusline equivalent to rendering every segment", () => {
    expect(renderStatusline(full)).toBe(renderSegments(full, ALL_SEGMENTS));
  });
});

describe("collectGitlab", () => {
  const TOKEN_ENV = "CHARDON_TEST_GITLAB_TOKEN";

  function gitlabConfig(overrides: Partial<ChardonConfig["gitlab"]> = {}): ChardonConfig {
    return {
      outDir: ".",
      ticketRegex: "",
      tokenBudgetPerDay: 0,
      retentionDays: 90,
      thresholds: { toilMin: 3, retryMin: 4, coldMin: 3, failMin: 3, slowMin: 3, slowMs: 30_000 },
      toilExclusions: [],
      gitlab: { enabled: true, projectId: "123", tokenEnv: TOKEN_ENV, ...overrides },
    };
  }

  it("returns undefined when curl fails or times out, without throwing", () => {
    process.env[TOKEN_ENV] = "tok";
    const failing = () => {
      throw new Error("curl: timeout");
    };
    expect(collectGitlab(gitlabConfig(), failing)).toBeUndefined();
  });

  it("returns undefined on a non-array JSON body (API error payload)", () => {
    process.env[TOKEN_ENV] = "tok";
    const errorBody = () => JSON.stringify({ message: "401 Unauthorized" });
    expect(collectGitlab(gitlabConfig(), errorBody)).toBeUndefined();
  });

  it("returns undefined on an unparseable body", () => {
    process.env[TOKEN_ENV] = "tok";
    expect(collectGitlab(gitlabConfig(), () => "<html>gateway timeout</html>")).toBeUndefined();
  });

  it("parses MR and issue counts from the injected runner", () => {
    process.env[TOKEN_ENV] = "tok";
    const runner = (args: string[]) =>
      args.includes("-sI") ? "HTTP/2 200\r\nx-total: 7\r\n" : JSON.stringify([{}, {}, {}]);
    expect(collectGitlab(gitlabConfig(), runner)).toEqual({ mrs: 3, issues: 7 });
  });

  it("returns undefined when disabled, token missing, or project id invalid", () => {
    process.env[TOKEN_ENV] = "tok";
    const runner = () => "[]";
    expect(collectGitlab(gitlabConfig({ enabled: false }), runner)).toBeUndefined();
    expect(collectGitlab(gitlabConfig({ projectId: "12; rm -rf ~" }), runner)).toBeUndefined();
    delete process.env[TOKEN_ENV];
    expect(collectGitlab(gitlabConfig(), runner)).toBeUndefined();
  });

  it("still renders the line when the GitLab collector fails", () => {
    process.env[TOKEN_ENV] = "tok";
    const failing = () => {
      throw new Error("network down");
    };
    const gitlab = collectGitlab(gitlabConfig(), failing);
    const line = renderSegments(
      { project: "p", branch: "b", subagents: 1, worktrees: 0, gitlab },
      MONITORING_SEGMENTS,
    );
    expect(line).toBe("🤖 1");
  });
});

it("isValidProjectId accepts only plain integers (blocks shell injection from .chardon.json)", () => {
  expect(isValidProjectId("12345")).toBe(true);
  expect(isValidProjectId("0")).toBe(true);
  expect(isValidProjectId("12; rm -rf ~")).toBe(false);
  expect(isValidProjectId("$(whoami)")).toBe(false);
  expect(isValidProjectId("12`id`")).toBe(false);
  expect(isValidProjectId("")).toBe(false);
  expect(isValidProjectId("group/project")).toBe(false);
});

it("projectName prefers package.json name", () => {
  const d = mkdtempSync(join(tmpdir(), "p-"));
  writeFileSync(join(d, "package.json"), JSON.stringify({ name: "my-pkg" }));
  expect(projectName(d)).toBe("my-pkg");
});

it("countWorktrees counts sibling <base>-wt-* dirs", () => {
  const parent = mkdtempSync(join(tmpdir(), "ws-"));
  const proj = join(parent, "proj"); mkdirSync(proj);
  mkdirSync(join(parent, "proj-wt-1")); mkdirSync(join(parent, "proj-wt-2"));
  mkdirSync(join(parent, "other"));
  expect(countWorktrees(proj)).toBe(2);
});

it("tokensToday sums today's usage for the repo+origin", () => {
  process.env.CHARDON_DB = join(mkdtempSync(join(tmpdir(), "c-")), "t.db");
  const db = openDb();
  db.prepare("INSERT INTO token_usage (date, origin, repo, input_tokens, output_tokens) VALUES ('2026-06-26','main','myproj',100,50)").run();
  expect(tokensToday(db, "myproj", "main", "2026-06-26")).toBe(150);
  // A different repo must not be included in the sum.
  expect(tokensToday(db, "other", "main", "2026-06-26")).toBe(0);
  closeDb(db);
});

it("windowSizeForModel detects 1M-context models", () => {
  expect(windowSizeForModel("claude-opus-4-8[1m]")).toBe(1_000_000);
  expect(windowSizeForModel("claude-haiku-4-5")).toBe(200_000);
});

it("parseTranscriptUsage extracts model + context from the last usage block", () => {
  const line = JSON.stringify({ type: "assistant", message: { model: "claude-opus-4-8", usage: { input_tokens: 100, cache_read_input_tokens: 4000, output_tokens: 50 } } });
  const r = parseTranscriptUsage(`${line}\n`);
  expect(r?.model).toBe("claude-opus-4-8");
  expect(r?.ctxUsed).toBeGreaterThan(0);
  expect(parseTranscriptUsage("not json")).toBeNull();
});

it("countSubagents counts fresh task output files under the injected root", () => {
  const root = mkdtempSync(join(tmpdir(), "tasks-"));
  const d = join(root, "sess", "tasks"); mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "a.output"), "x"); // fresh
  const old = join(d, "b.output"); writeFileSync(old, "x");
  const longAgo = Date.now() / 1000 - 99999; utimesSync(old, longAgo, longAgo); // stale
  expect(countSubagents(root)).toBe(1);
});
