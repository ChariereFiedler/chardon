import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { countLinkedWorktrees, isGitWorktree } from "./git.ts";

/** Runs git with a neutral identity, isolated from user/system config. */
function git(cwd: string, ...args: string[]): void {
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], {
    cwd,
    stdio: "ignore",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
  });
}

let mainRepo: string;
let worktreeDir: string;
let plainDir: string;

beforeAll(() => {
  const root = mkdtempSync(join(tmpdir(), "chardon-git-"));
  mainRepo = join(root, "repo");
  worktreeDir = join(root, "repo-feature");
  plainDir = join(root, "not-a-repo");
  execFileSync("mkdir", ["-p", mainRepo, plainDir]);
  git(mainRepo, "init", "-b", "main");
  writeFileSync(join(mainRepo, "f.txt"), "x");
  git(mainRepo, "add", "f.txt");
  git(mainRepo, "commit", "-m", "init");
  git(mainRepo, "worktree", "add", worktreeDir);
});

describe("isGitWorktree", () => {
  it("returns false for a main checkout", () => {
    expect(isGitWorktree(mainRepo)).toBe(false);
  });

  it("returns true for a linked git worktree", () => {
    expect(isGitWorktree(worktreeDir)).toBe(true);
  });

  it("returns false outside any git repository", () => {
    expect(isGitWorktree(plainDir)).toBe(false);
  });
});

describe("countLinkedWorktrees", () => {
  it("counts linked worktrees from the main checkout", () => {
    expect(countLinkedWorktrees(mainRepo)).toBe(1);
  });

  it("counts the same total from inside the worktree", () => {
    expect(countLinkedWorktrees(worktreeDir)).toBe(1);
  });

  it("returns 0 outside any git repository", () => {
    expect(countLinkedWorktrees(plainDir)).toBe(0);
  });
});
