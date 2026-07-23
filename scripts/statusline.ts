/**
 * Pure status-line renderer — no I/O, no side effects.
 * Takes a StatuslineData snapshot and returns a single ANSI-friendly line.
 *
 * Also exports collectors (projectName, countWorktrees, tokensToday,
 * countSubagents) and a main() entry that assembles + prints the line.
 */

import { execSync, execFileSync } from "node:child_process";
import { closeSync, type Dirent, existsSync, fstatSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { loadConfig, repoSlug, transcriptSlug } from "../lib/config.ts";
import { openDb, closeDb } from "../lib/db.ts";
import type { ChardonDb } from "../lib/db.ts";
import { countLinkedWorktrees, isGitWorktree } from "../lib/git.ts";
import { isMainModule } from "../lib/is-main.ts";
import { projectsDir } from "../lib/token-parser.ts";

export interface StatuslineData {
  project: string;
  branch: string;
  model?: string;
  ctxUsed?: number;
  ctxMax?: number;
  subagents: number;
  worktrees: number;
  tokensToday?: number;
  tokenBudget?: number;
  gitlab?: { mrs: number; issues: number };
}

const SEPARATOR = " · ";

/** Matches a project dir name ending in `-wt-<digits>` (worktree clone). */
const WORKTREE_SUFFIX = /-wt-\d+$/;

/**
 * Renders a compact status line from the given data.
 * Sections are omitted when their data is absent or zero; separators are
 * never left dangling.
 */
export function renderStatusline(d: StatuslineData): string {
  const sections: string[] = [];

  sections.push(d.project);
  sections.push(d.branch);

  if (d.model !== undefined && d.ctxUsed !== undefined && d.ctxMax !== undefined) {
    sections.push(`🧠 ${d.model} ${d.ctxUsed}/${d.ctxMax}`);
  }

  if (d.subagents > 0) {
    sections.push(`🤖 ${d.subagents}`);
  }

  if (d.worktrees > 0) {
    sections.push(`🌳 ${d.worktrees}`);
  }

  if (d.tokenBudget !== undefined && d.tokenBudget > 0) {
    const over = (d.tokensToday ?? 0) > d.tokenBudget ? " ⚠" : "";
    sections.push(`💰 ${d.tokensToday ?? 0}/${d.tokenBudget}${over}`);
  }

  if (d.gitlab !== undefined) {
    sections.push(`📥 ${d.gitlab.mrs}📋 ${d.gitlab.issues}`);
  }

  return sections.join(SEPARATOR);
}

// ---------------------------------------------------------------------------
// Collectors
// ---------------------------------------------------------------------------

/**
 * Returns the project name from `package.json#name` if present,
 * otherwise falls back to the directory basename.
 */
export function projectName(projectDir: string): string {
  try {
    const pkgPath = join(projectDir, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { name?: string };
      if (pkg.name) return pkg.name;
    }
  } catch {
    // Fall through to basename.
  }
  return basename(projectDir);
}

/**
 * Counts sibling directories matching `^<basename(projectDir)>-wt-`.
 * Worktrees are expected to live next to the main project dir.
 */
export function countWorktrees(projectDir: string): number {
  const parent = join(projectDir, "..");
  const base = basename(projectDir);
  const prefix = `${base}-wt-`;
  try {
    return readdirSync(parent, { withFileTypes: true }).filter(
      (e) => e.isDirectory() && e.name.startsWith(prefix),
    ).length;
  } catch {
    return 0;
  }
}

/**
 * Sums `input_tokens + output_tokens` from `token_usage` for the given
 * repo, origin, and calendar date. Uses parameterized SQL (no injection risk).
 */
export function tokensToday(db: ChardonDb, repo: string, origin: string, today: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage
       WHERE repo = ? AND origin = ? AND date = ?`,
    )
    .get(repo, origin, today) as { total: number } | undefined;
  return row?.total ?? 0;
}

/** How recent a subagent output file must be to count as active (milliseconds). */
const SUBAGENT_FRESHNESS_MS = 90_000;

/** Maximum directory traversal depth when scanning for subagent outputs. */
const SUBAGENT_SCAN_DEPTH = 4;

/**
 * Counts recent tasks/*.output files under /tmp/claude-* subdirectories.
 * Accepts an optional root for testability; defaults to CHARDON_TASKS_DIR env
 * or `/tmp/claude-<uid>`. Returns 0 on any error (best-effort).
 */
export function countSubagents(tasksRoot?: string): number {
  try {
    const uid = process.getuid?.() ?? 1000;
    const root = tasksRoot ?? process.env.CHARDON_TASKS_DIR ?? `/tmp/claude-${uid}`;
    if (!existsSync(root)) return 0;
    const cutoff = Date.now() - SUBAGENT_FRESHNESS_MS;
    let count = 0;

    function walk(dir: string, depth: number): void {
      if (depth > SUBAGENT_SCAN_DEPTH) return;
      let entries: Dirent[];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isDirectory()) {
          walk(full, depth + 1);
        } else if (e.name.endsWith(".output")) {
          try {
            const st = statSync(full);
            if (st.mtimeMs >= cutoff && st.size > 0) count++;
          } catch {
            // Ignore unreadable entries.
          }
        }
      }
    }

    walk(root, 0);
    return count;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Transcript context parser (model + ctx tokens)
// ---------------------------------------------------------------------------

interface TranscriptContext {
  model: string;
  ctxUsed: number;
  ctxMax: number;
}

/** Default context window size for models without a known 1M-context marker. */
export const DEFAULT_CONTEXT = 200_000;

/**
 * Reads only the last `maxBytes` of a file and returns its non-empty lines.
 * Seeks to the tail instead of loading the whole transcript into memory — a
 * session transcript can be tens of MB and this runs on every status-line refresh.
 */
function readTailLines(filePath: string, maxBytes = 256 * 1024): string[] {
  let fd: number | undefined;
  try {
    fd = openSync(filePath, "r");
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - maxBytes);
    const len = size - start;
    if (len === 0) return [];
    const buf = Buffer.allocUnsafe(len);
    readSync(fd, buf, 0, len, start);
    return buf.toString("utf-8").split("\n").filter((l) => l.trim().length > 0);
  } catch {
    return [];
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // Ignore close errors.
      }
    }
  }
}

/**
 * Returns the context window size for a given model ID.
 * Models with a `1m` or `[1m]` marker (case-insensitive) get 1_000_000 tokens;
 * all others get DEFAULT_CONTEXT.
 */
export function windowSizeForModel(modelId: string): number {
  const lower = modelId.toLowerCase();
  if (lower.includes("1m") || lower.includes("opus")) return 1_000_000;
  return DEFAULT_CONTEXT;
}

/**
 * Parses a transcript JSONL string (one or more lines) and extracts the model
 * and total context tokens used from the last assistant `usage` block.
 * Returns null when the input is unparseable or contains no usage block.
 */
export function parseTranscriptUsage(
  text: string,
): { model?: string; ctxUsed?: number } | null {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.includes('"type":"assistant"') && !line.includes('"type": "assistant"')) continue;
    let parsed: {
      type?: string;
      message?: {
        model?: string;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_creation_input_tokens?: number;
          cache_read_input_tokens?: number;
        };
      };
    };
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (parsed.type !== "assistant") continue;
    const usage = parsed.message?.usage;
    if (!usage) continue;
    const total =
      (usage.input_tokens ?? 0) +
      (usage.output_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0);
    if (total <= 0) continue;
    return { model: parsed.message?.model, ctxUsed: total };
  }
  return null;
}

/**
 * Parses the most recent `usage` block from the project's latest transcript
 * to extract model id and total context tokens used.
 */
function readTranscriptContext(projectDir: string): TranscriptContext | null {
  try {
    const slug = transcriptSlug(projectDir);
    const transcriptDir = join(projectsDir(), slug);
    if (!existsSync(transcriptDir)) return null;

    // Pick the most recently modified JSONL session file.
    const jsonlFiles = readdirSync(transcriptDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".jsonl"))
      .map((e) => {
        const full = join(transcriptDir, e.name);
        try {
          return { path: full, mtime: statSync(full).mtimeMs };
        } catch {
          return null;
        }
      })
      .filter((x): x is { path: string; mtime: number } => x !== null)
      .sort((a, b) => b.mtime - a.mtime);

    if (jsonlFiles.length === 0) return null;

    const lines = readTailLines(jsonlFiles[0].path);
    const result = parseTranscriptUsage(lines.join("\n"));
    if (!result || result.ctxUsed === undefined) return null;
    const modelId = result.model ?? "";
    return { model: modelId, ctxUsed: result.ctxUsed, ctxMax: windowSizeForModel(modelId) };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Git branch helper
// ---------------------------------------------------------------------------

function currentBranch(projectDir: string): string {
  try {
    return (
      execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: projectDir,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 2000,
      }).trim() || "?"
    );
  } catch {
    return "?";
  }
}

// ---------------------------------------------------------------------------
// GitLab collector (best-effort, only when config.gitlab.enabled)
// ---------------------------------------------------------------------------

/**
 * A GitLab project id must be a plain integer. `projectId` comes from the
 * project's committed `.chardon.json` (untrusted), so anything non-numeric is
 * rejected — it must NEVER reach a shell or a URL unchecked.
 */
export function isValidProjectId(id: string): boolean {
  return /^\d+$/.test(id);
}

function collectGitlab(
  config: ReturnType<typeof loadConfig>,
): { mrs: number; issues: number } | undefined {
  if (!config.gitlab.enabled) return undefined;
  try {
    const token = process.env[config.gitlab.tokenEnv];
    if (!token) return undefined;
    const projectId = config.gitlab.projectId;
    if (!isValidProjectId(projectId)) return undefined;

    // execFileSync passes args straight to curl — no shell, no interpolation,
    // so a hostile `.chardon.json` cannot inject a command. JSON parsed in-process
    // (no `jq` dependency). The token goes through a curl config file on stdin
    // rather than argv, which any local process could read via /proc or `ps`.
    const base = `https://gitlab.com/api/v4/projects/${projectId}`;
    const curl = (args: string[]): string =>
      execFileSync("curl", [...args, "--config", "-"], {
        input: `header = "PRIVATE-TOKEN: ${token}"\n`,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
        timeout: 5000,
      });

    const mrBody = curl(["-s", "--max-time", "3", `${base}/merge_requests?state=opened&per_page=100`]);
    const parsed = JSON.parse(mrBody) as unknown;
    const mrs = Array.isArray(parsed) ? parsed.length : 0;

    const issueHeaders = curl(["-sI", "--max-time", "3", `${base}/issues?state=opened&per_page=1`]);
    const match = issueHeaders.match(/^x-total:\s*(\d+)/im);
    const issues = match ? Number.parseInt(match[1], 10) : 0;

    return { mrs, issues: Number.isNaN(issues) ? 0 : issues };
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Fallback config shape (used when loadConfig itself throws)
// ---------------------------------------------------------------------------

function fallbackConfig(): ReturnType<typeof loadConfig> {
  return {
    outDir: ".",
    ticketRegex: "",
    tokenBudgetPerDay: 0,
    retentionDays: 90,
    thresholds: { toilMin: 3, retryMin: 4, coldMin: 3, failMin: 3, slowMin: 3, slowMs: 30_000 },
    toilExclusions: [],
    gitlab: { enabled: false, projectId: "", tokenEnv: "" },
  };
}

// ---------------------------------------------------------------------------
// main()
// ---------------------------------------------------------------------------

/**
 * Assembles StatuslineData from all collectors and prints the rendered line.
 * Every collector is best-effort — a failure returns a sensible default.
 * This function must never throw (a crashed status line breaks the UI).
 */
export function main(): void {
  try {
    const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

    // Project name
    const project = (() => {
      try {
        return projectName(projectDir);
      } catch {
        return basename(projectDir);
      }
    })();

    // Git branch
    const branch = (() => {
      try {
        return currentBranch(projectDir);
      } catch {
        return "?";
      }
    })();

    // Config
    const config = (() => {
      try {
        return loadConfig(projectDir);
      } catch {
        return fallbackConfig();
      }
    })();

    // Transcript context (model + ctx tokens)
    const ctx = (() => {
      try {
        return readTranscriptContext(projectDir);
      } catch {
        return null;
      }
    })();

    // Subagents
    const subagents = (() => {
      try {
        return countSubagents();
      } catch {
        return 0;
      }
    })();

    // Worktrees: real linked git worktrees, or `-wt-N` sibling clones. A -wt-N
    // sibling may itself be a linked worktree, hence max() and not a sum.
    const worktrees = (() => {
      try {
        return Math.max(countWorktrees(projectDir), countLinkedWorktrees(projectDir));
      } catch {
        return 0;
      }
    })();

    // Derive origin from git (authoritative), falling back to the -wt-N naming.
    const origin: "main" | "worktree" =
      isGitWorktree(projectDir) || WORKTREE_SUFFIX.test(basename(projectDir))
        ? "worktree"
        : "main";

    // Token budget from DB
    let todayTokens: number | undefined;
    let tokenBudget: number | undefined;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const repo = repoSlug(projectDir);
      const db = openDb();
      try {
        todayTokens = tokensToday(db, repo, origin, today);
        tokenBudget = config.tokenBudgetPerDay > 0 ? config.tokenBudgetPerDay : undefined;
      } finally {
        closeDb(db);
      }
    } catch {
      // Best-effort — omit token section on failure.
    }

    // GitLab (optional, only when enabled)
    const gitlab = (() => {
      try {
        return collectGitlab(config);
      } catch {
        return undefined;
      }
    })();

    const data: StatuslineData = {
      project,
      branch,
      subagents,
      worktrees,
    };
    if (ctx) {
      data.model = ctx.model;
      data.ctxUsed = ctx.ctxUsed;
      data.ctxMax = ctx.ctxMax;
    }
    if (todayTokens !== undefined) {
      data.tokensToday = todayTokens;
    }
    if (tokenBudget !== undefined) {
      data.tokenBudget = tokenBudget;
    }
    if (gitlab) {
      data.gitlab = gitlab;
    }

    console.log(renderStatusline(data));
  } catch {
    // Last-resort: print a minimal line rather than crashing.
    console.log("? · ?");
  }
}

// Run when executed directly. isMainModule matches the invoked filename across
// .ts source and the .mjs bundle (the old .ts/.js check missed dist/statusline.mjs).
if (isMainModule("statusline")) {
  main();
}
