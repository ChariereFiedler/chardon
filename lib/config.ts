import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Detection thresholds — tune to reduce noise / false positives. */
export interface Thresholds {
  toilMin: number;
  retryMin: number;
  coldMin: number;
  failMin: number;
  slowMin: number;
  slowMs: number;
}

export interface ChardonConfig {
  outDir: string;
  /** Optional explicit repo slug, overriding the directory basename (empty = unset). */
  repoName: string;
  ticketRegex: string;
  tokenBudgetPerDay: number;
  /** Days of history to keep; rows older than this are removed by the purge command. */
  retentionDays: number;
  /** Detection thresholds; missing keys fall back to built-in defaults. */
  thresholds: Thresholds;
  toilExclusions: string[];
  gitlab: {
    enabled: boolean;
    projectId: string;
    tokenEnv: string;
  };
}

/** Worktree suffix pattern to strip from the repo slug. */
const WORKTREE_SUFFIX_PATTERN = /-wt-\d+$/;

/** Local config filename expected at the root of a project. */
const PROJECT_CONFIG_FILENAME = ".chardon.json";

/** Path to the plugin's bundled default config (relative to this module). */
const pluginRoot = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_CONFIG_PATH = join(pluginRoot, "config", "chardon.default.json");

/**
 * Loads config: plugin defaults shallow-merged with the project-level override.
 * Each top-level key in `.chardon.json` overwrites the corresponding default.
 */
export function loadConfig(projectDir: string): ChardonConfig {
  const defaults: ChardonConfig = JSON.parse(readFileSync(DEFAULT_CONFIG_PATH, "utf-8"));

  const overridePath = join(projectDir, PROJECT_CONFIG_FILENAME);
  let merged: ChardonConfig = { ...defaults };

  if (existsSync(overridePath)) {
    try {
      const override: Partial<ChardonConfig> = JSON.parse(readFileSync(overridePath, "utf-8"));
      merged = { ...defaults, ...override };
      // Deep-merge nested objects so a partial override keeps unspecified default fields.
      merged.gitlab = { ...defaults.gitlab, ...(override.gitlab ?? {}) };
      merged.thresholds = { ...defaults.thresholds, ...(override.thresholds ?? {}) };
    } catch {
      // Malformed file — silently ignore the override.
    }
  }

  // Validate ticketRegex; fall back to the default if the value is not a safe RegExp.
  if (safeRegex(merged.ticketRegex) === null) {
    merged.ticketRegex = defaults.ticketRegex;
  }

  // Normalize outDir to an absolute path confined to the project.
  merged.outDir = resolveOutDir(projectDir, merged.outDir, defaults.outDir);

  return merged;
}

/** Upper bounds keeping an untrusted pattern away from backtracking blowups. */
const REGEX_MAX_LENGTH = 100;
const REGEX_MAX_QUANTIFIERS = 5;

/**
 * Compiles a pattern only if it stays in a conservative, backtracking-safe
 * subset: bounded length, few quantifiers, no quantified group, no backreference.
 *
 * `ticketRegex` comes from a committed `.chardon.json`, which is untrusted: a
 * hostile pattern must not be able to hang a hook — fail-open catches throws,
 * not hangs. Returns null when the pattern is rejected or does not compile.
 */
export function safeRegex(pattern: string): RegExp | null {
  if (typeof pattern !== "string" || pattern.length > REGEX_MAX_LENGTH) return null;
  // Backreferences and quantified groups are the classic catastrophic shapes
  // ((a+)+, (a|aa)+); ticket regexes never need them.
  if (/\\[1-9]/.test(pattern)) return null;
  if (/\)[+*{]/.test(pattern)) return null;
  const quantifiers = pattern.match(/[+*{]/g)?.length ?? 0;
  if (quantifiers > REGEX_MAX_QUANTIFIERS) return null;
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

/**
 * Path to the Chardon SQLite database.
 * Priority: `CHARDON_DB` environment variable > `~/.claude/chardon.db`.
 */
export function dbPath(): string {
  return process.env.CHARDON_DB ?? join(homedir(), ".claude", "chardon.db");
}

/**
 * Shape a `repoName` override must match. It comes from a committed
 * `.chardon.json` (untrusted): anything else is silently ignored.
 */
const REPO_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/**
 * Short repo slug: the `repoName` override from `.chardon.json` when present
 * and valid, otherwise the basename of the project directory without the
 * worktree suffix. E.g. `/home/x/my-project-wt-3` → `my-project`.
 *
 * The override exists to separate two projects whose directories share a
 * basename (`~/work/app` vs `~/personal/app`), which would otherwise merge
 * their metrics under one slug.
 */
export function repoSlug(projectDir: string): string {
  try {
    const raw = readFileSync(join(projectDir, PROJECT_CONFIG_FILENAME), "utf-8");
    const override = (JSON.parse(raw) as { repoName?: unknown }).repoName;
    if (typeof override === "string" && REPO_NAME_PATTERN.test(override)) {
      return override;
    }
  } catch {
    // Missing or malformed file: fall through to the basename.
  }
  return basename(projectDir).replace(WORKTREE_SUFFIX_PATTERN, "");
}

/**
 * Token-usage origin of a project directory: `worktree` when the directory
 * carries the worktree suffix, `main` otherwise.
 */
export function repoOrigin(projectDir: string): "main" | "worktree" {
  return WORKTREE_SUFFIX_PATTERN.test(basename(projectDir)) ? "worktree" : "main";
}

/**
 * Resolves the report output directory, confined to the project.
 *
 * `outDir` comes from the project's committed `.chardon.json`, which is untrusted:
 * cloning a hostile repo must not let it write outside the project (`../../..`, or an
 * absolute path into `~/.config/autostart`). Anything escaping falls back to the default.
 */
export function resolveOutDir(projectDir: string, outDir: string, fallback: string): string {
  const root = resolve(projectDir);
  const candidate = resolve(root, outDir);
  const confined = candidate === root || candidate.startsWith(root + sep);
  return confined ? candidate : resolve(root, fallback);
}

/**
 * Transcript slug: absolute path with `/` replaced by `-`.
 * Used to locate `~/.claude/projects/<slug>/`.
 * E.g. `/home/x/p` → `-home-x-p`.
 */
export function transcriptSlug(projectDir: string): string {
  return projectDir.replace(/\//g, "-");
}
