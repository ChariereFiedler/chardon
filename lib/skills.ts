import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, type Dirent } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Frontmatter block at the top of a SKILL.md. */
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---/;

/** `name:` line inside the frontmatter block. */
const NAME_PATTERN = /^name:\s*(.+?)\s*$/m;

/** Extracts the frontmatter `name` of a SKILL.md, or null when absent. */
function frontmatterName(markdown: string): string | null {
  const block = markdown.match(FRONTMATTER_PATTERN)?.[1];
  if (!block) return null;
  return block.match(NAME_PATTERN)?.[1] ?? null;
}

/** Skill names found in each `<skillsDir>/<skill>/SKILL.md` (missing dir yields []). */
function skillNamesIn(skillsDir: string): string[] {
  const names: string[] = [];
  let entries: Dirent[];
  try {
    entries = readdirSync(skillsDir, { withFileTypes: true });
  } catch {
    return names; // No such directory: a normal, empty location.
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const markdown = readFileSync(join(skillsDir, entry.name, "SKILL.md"), "utf-8");
      const name = frontmatterName(markdown);
      if (name) names.push(name);
    } catch {
      // No readable SKILL.md: not an installed skill, skip it.
    }
  }
  return names;
}

/** Subdirectories of `dir` as absolute paths (missing/unreadable dir yields []). */
function subdirectories(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(dir, entry.name));
  } catch {
    return []; // No such directory: a normal, empty location.
  }
}

/**
 * Best-effort inventory of installed Claude Code skills, by frontmatter `name`:
 * `<projectDir>/.claude/skills/`, `<homeDir>/.claude/skills/`, and every cached
 * plugin version, `<homeDir>/.claude/plugins/cache/<marketplace>/<plugin>/<version>/skills/`.
 * Any unreadable location simply contributes nothing; the worst case is an
 * empty list, never a throw.
 */
export function listInstalledSkills(projectDir: string, homeDir: string = homedir()): string[] {
  const found = new Set<string>();
  const skillDirs = [join(projectDir, ".claude", "skills"), join(homeDir, ".claude", "skills")];

  const pluginCacheRoot = join(homeDir, ".claude", "plugins", "cache");
  for (const marketplace of subdirectories(pluginCacheRoot)) {
    for (const plugin of subdirectories(marketplace)) {
      for (const version of subdirectories(plugin)) {
        skillDirs.push(join(version, "skills"));
      }
    }
  }

  for (const dir of skillDirs) {
    for (const name of skillNamesIn(dir)) found.add(name);
  }
  return [...found];
}

/** Max length of a skeleton file slug. */
const SLUG_MAX_LENGTH = 40;

/** Fallback slug when sanitization leaves nothing. */
const SLUG_FALLBACK = "friction";

/** Sanitizes a friction target (command or path) into a filename-safe slug. */
export function skillSlug(target: string): string {
  const slug = target
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/^-+|-+$/g, "");
  return slug === "" ? SLUG_FALLBACK : slug;
}

/** Human wording per friction pattern, used in the skeleton description. */
const FRICTION_LABELS: Record<string, string> = {
  toil_loop: "a command run over and over",
  failure_cluster: "a repeatedly failing command",
  slow_command: "a repeatedly slow command",
  retry_storm: "a file edited again and again",
  cold_read: "a file re-read without changes",
};

export interface SkillSkeletonInput {
  /** Name of the skill to create (frontmatter `name`). */
  skill: string;
  /** Friction pattern the skill would address (e.g. `failure_cluster`). */
  patternType: string;
  /** Friction target: the actual command or file involved. */
  target: string;
}

/**
 * Renders a deterministic SKILL.md skeleton from observed friction data.
 * Pure function (data to string): the file write lives in `ensureSkillSkeleton`.
 */
export function renderSkillSkeleton(input: SkillSkeletonInput): string {
  const label = FRICTION_LABELS[input.patternType] ?? "a recurring friction";
  return [
    "---",
    `name: ${input.skill}`,
    `description: Use when facing ${label}. Trigger phrases: "${input.target}", "${input.patternType}".`,
    "---",
    "",
    `# ${input.skill}`,
    "",
    `Skeleton drafted from observed friction (${input.patternType} on \`${input.target}\`).`,
    "Flesh out each step with what actually works, then install it as a skill.",
    "",
    "## Procedure",
    "",
    `1. Reproduce the friction: \`${input.target}\`.`,
    "2. Identify the root cause instead of retrying.",
    "3. Apply the smallest fix or guard that removes the repetition.",
    "4. Verify the friction is gone and note what changed.",
    "",
  ].join("\n");
}

/**
 * Writes the skeleton for a `create-skill` proposal at
 * `<outDir>/proposed/skill-<slug>.md` (slug from the friction target) and
 * returns the path. An existing file is NEVER overwritten (the user may have
 * edited it); its path is still returned. Returns null on any I/O error.
 */
export function ensureSkillSkeleton(opts: SkillSkeletonInput & { outDir: string }): string | null {
  try {
    const dir = join(opts.outDir, "proposed");
    const path = join(dir, `skill-${skillSlug(opts.target)}.md`);
    if (!existsSync(path)) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path, renderSkillSkeleton(opts));
    }
    return path;
  } catch {
    return null; // Best-effort: a skeleton that cannot be written is just skipped.
  }
}
