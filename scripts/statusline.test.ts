import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { renderStatusline, projectName, countWorktrees, tokensToday, windowSizeForModel, parseTranscriptUsage, countSubagents, isValidProjectId } from "./statusline.ts";
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
