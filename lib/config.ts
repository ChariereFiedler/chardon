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

  // Validate ticketRegex; fall back to the default if the value is not a valid RegExp.
  try {
    new RegExp(merged.ticketRegex);
  } catch {
    merged.ticketRegex = defaults.ticketRegex;
  }

  // Normalize outDir to an absolute path confined to the project.
  merged.outDir = resolveOutDir(projectDir, merged.outDir, defaults.outDir);

  return merged;
}

/**
 * Path to the Chardon SQLite database.
 * Priority: `CHARDON_DB` environment variable > `~/.claude/chardon.db`.
 */
export function dbPath(): string {
  return process.env.CHARDON_DB ?? join(homedir(), ".claude", "chardon.db");
}

/**
 * Short repo slug: basename of the project directory without worktree suffix.
 * E.g. `/home/x/my-project-wt-3` → `my-project`.
 */
export function repoSlug(projectDir: string): string {
  return basename(projectDir).replace(WORKTREE_SUFFIX_PATTERN, "");
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
