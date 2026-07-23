import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/** Hard cap so a hung git (network FS, corrupted repo) cannot stall a caller. */
const GIT_TIMEOUT_MS = 2000;

function git(dir: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: dir,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: GIT_TIMEOUT_MS,
  });
}

/**
 * True when `dir` is a linked `git worktree` checkout (not the main one).
 * A linked worktree has its own git dir under the main repo's
 * `.git/worktrees/<name>`, so `--git-dir` and `--git-common-dir` diverge.
 * Returns false outside any git repository (best-effort).
 */
export function isGitWorktree(dir: string): boolean {
  try {
    const out = git(dir, ["rev-parse", "--git-dir", "--git-common-dir"]);
    const [gitDir, commonDir] = out.trim().split("\n");
    if (!gitDir || !commonDir) return false;
    return resolve(dir, gitDir) !== resolve(dir, commonDir);
  } catch {
    return false;
  }
}

/**
 * Number of linked worktrees attached to `dir`'s repository, from any checkout.
 * `git worktree list` includes the main checkout, hence the minus one.
 * Returns 0 outside any git repository (best-effort).
 */
export function countLinkedWorktrees(dir: string): number {
  try {
    const out = git(dir, ["worktree", "list", "--porcelain"]);
    const checkouts = out.split("\n").filter((l) => l.startsWith("worktree ")).length;
    return Math.max(0, checkouts - 1);
  } catch {
    return 0;
  }
}
