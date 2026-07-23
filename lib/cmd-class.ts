/**
 * Command classification, computed at collection time (post-tool-use hook)
 * and stored in `events.meta.cmd_class`. Method detectors (lib/patterns.ts)
 * rely on the stored class, never on re-parsing redacted commands.
 *
 * Classification is generic on purpose: prefix/word regexes over common
 * toolchains, no project-specific command list.
 */

export type CmdClass = "test" | "typecheck" | "lint" | "build" | "git" | "pkg" | "other";

/** Optional runner prefix (`npx `) tolerated before a tool name. */
const NPX = "(?:npx\\s+)?";

const GIT_PATTERNS = [/^git\b/];

const PKG_PATTERNS = [/^(?:npm|pnpm|yarn)\s+(?:install|ci|add)\b/];

const TEST_PATTERNS = [
  new RegExp(`^${NPX}(?:vitest|jest|playwright|pytest)\\b`),
  /^cargo\s+test\b/,
  /^go\s+test\b/,
  /^(?:npm|pnpm|yarn)\s+test\b/,
  /^(?:npm|pnpm|yarn)\s+run\s+test/, // matches test, test:e2e, test-backend, ...
];

const TYPECHECK_PATTERNS = [new RegExp(`^${NPX}tsc\\b`), /\btypecheck\b/];

const LINT_PATTERNS = [new RegExp(`^${NPX}(?:eslint|biome)\\b`), /\blint\b/];

const BUILD_PATTERNS = [/\bbuild\b/];

/**
 * Ordered: anchored-prefix classes (git, pkg, test runners) win over the
 * loose word matches (typecheck/lint/build), so `git commit -m 'lint fixes'`
 * stays `git`.
 */
const CLASSIFIERS: [CmdClass, RegExp[]][] = [
  ["git", GIT_PATTERNS],
  ["pkg", PKG_PATTERNS],
  ["test", TEST_PATTERNS],
  ["typecheck", TYPECHECK_PATTERNS],
  ["lint", LINT_PATTERNS],
  ["build", BUILD_PATTERNS],
];

/** Classifies a raw (pre-redaction) Bash command into a broad intent class. */
export function classifyCommand(cmd: string): CmdClass {
  const trimmed = cmd.trim();
  for (const [cls, patterns] of CLASSIFIERS) {
    if (patterns.some((p) => p.test(trimmed))) return cls;
  }
  return "other";
}
