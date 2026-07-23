import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listInstalledSkills, skillSlug, renderSkillSkeleton, ensureSkillSkeleton } from "./skills.ts";

const tempDir = (): string => mkdtempSync(join(tmpdir(), "chardon-skills-"));

/** Creates `<root>/<...dirs>/SKILL.md` with a frontmatter `name`. */
function addSkill(root: string, dirs: string[], name: string): void {
  const dir = join(root, ...dirs);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: x\n---\n\n# ${name}\n`);
}

describe("listInstalledSkills", () => {
  it("returns [] when no skills directory exists anywhere", () => {
    expect(listInstalledSkills(tempDir(), tempDir())).toEqual([]);
  });

  it("reads the frontmatter name, not the directory name, from a project skill", () => {
    const project = tempDir();
    addSkill(project, [".claude", "skills", "some-dir"], "real-skill-name");
    expect(listInstalledSkills(project, tempDir())).toEqual(["real-skill-name"]);
  });

  it("scans home skills and cached plugin skills too", () => {
    const project = tempDir();
    const home = tempDir();
    addSkill(home, [".claude", "skills", "home-one"], "home-one");
    // Real plugin layout: plugins/cache/<marketplace>/<plugin>/<version>/skills/<skill>/
    addSkill(
      home,
      [".claude", "plugins", "cache", "official", "superpowers", "6.1.1", "skills", "plug-one"],
      "plug-one",
    );
    expect(listInstalledSkills(project, home).sort()).toEqual(["home-one", "plug-one"]);
  });

  it("collects every cached version and marketplace of a plugin", () => {
    const home = tempDir();
    const cache = [".claude", "plugins", "cache"];
    addSkill(home, [...cache, "official", "superpowers", "5.1.0", "skills", "old-skill"], "old-skill");
    addSkill(home, [...cache, "official", "superpowers", "6.1.1", "skills", "new-skill"], "new-skill");
    addSkill(home, [...cache, "local", "chardon", "0.1.0", "skills", "local-skill"], "local-skill");
    expect(listInstalledSkills(tempDir(), home).sort()).toEqual([
      "local-skill",
      "new-skill",
      "old-skill",
    ]);
  });

  it("ignores stray files at intermediate plugin-cache levels", () => {
    const home = tempDir();
    const cacheDir = join(home, ".claude", "plugins", "cache");
    mkdirSync(join(cacheDir, "official"), { recursive: true });
    writeFileSync(join(cacheDir, "catalog.json"), "{}");
    writeFileSync(join(cacheDir, "official", "index.json"), "{}");
    expect(listInstalledSkills(tempDir(), home)).toEqual([]);
  });

  it("dedupes a skill installed in several locations", () => {
    const project = tempDir();
    const home = tempDir();
    addSkill(project, [".claude", "skills", "dup"], "dup");
    addSkill(home, [".claude", "skills", "dup"], "dup");
    expect(listInstalledSkills(project, home)).toEqual(["dup"]);
  });

  it("ignores a skill directory without SKILL.md or without a frontmatter name", () => {
    const project = tempDir();
    mkdirSync(join(project, ".claude", "skills", "empty"), { recursive: true });
    const noName = join(project, ".claude", "skills", "no-name");
    mkdirSync(noName, { recursive: true });
    writeFileSync(join(noName, "SKILL.md"), "just a body, no frontmatter");
    expect(listInstalledSkills(project, tempDir())).toEqual([]);
  });

  it("returns [] instead of throwing when a scan root is not a directory", () => {
    const file = join(tempDir(), "not-a-dir");
    writeFileSync(file, "x");
    expect(listInstalledSkills(file, file)).toEqual([]);
  });
});

describe("skillSlug", () => {
  it("sanitizes a command into a lowercase dashed slug", () => {
    expect(skillSlug("npm run build")).toBe("npm-run-build");
    expect(skillSlug("src/Big.ts")).toBe("src-big-ts");
  });

  it("collapses runs of forbidden characters and trims edge dashes", () => {
    expect(skillSlug("  git   push --force ")).toBe("git-push-force");
  });

  it("falls back to a fixed name when nothing survives sanitization", () => {
    expect(skillSlug("///")).toBe("friction");
  });

  it("caps the slug length", () => {
    expect(skillSlug("a".repeat(200)).length).toBeLessThanOrEqual(40);
  });
});

describe("renderSkillSkeleton", () => {
  const input = { skill: "fix-build-loop", patternType: "failure_cluster", target: "npm run build" };

  it("renders frontmatter name, friction-derived description and a numbered procedure", () => {
    const md = renderSkillSkeleton(input);
    expect(md).toContain("name: fix-build-loop");
    expect(md).toContain("npm run build");
    expect(md).toContain("failure_cluster");
    expect(md).toContain("## Procedure");
    expect(md).toMatch(/^1\. /m);
  });

  it("is deterministic (same input, same output)", () => {
    expect(renderSkillSkeleton(input)).toBe(renderSkillSkeleton(input));
  });
});

describe("ensureSkillSkeleton", () => {
  const input = { skill: "fix-build-loop", patternType: "failure_cluster", target: "npm run build" };

  it("writes the skeleton under <outDir>/proposed/skill-<slug>.md and returns its path", () => {
    const outDir = tempDir();
    const path = ensureSkillSkeleton({ outDir, ...input });
    expect(path).toBe(join(outDir, "proposed", "skill-npm-run-build.md"));
    expect(existsSync(path as string)).toBe(true);
    expect(readFileSync(path as string, "utf-8")).toContain("name: fix-build-loop");
  });

  it("never overwrites an existing skeleton file", () => {
    const outDir = tempDir();
    const first = ensureSkillSkeleton({ outDir, ...input }) as string;
    writeFileSync(first, "user edits");
    const second = ensureSkillSkeleton({ outDir, ...input });
    expect(second).toBe(first);
    expect(readFileSync(first, "utf-8")).toBe("user edits");
  });

  it("returns null instead of throwing when the output directory cannot be created", () => {
    const blocked = join(tempDir(), "flat-file");
    writeFileSync(blocked, "x");
    expect(ensureSkillSkeleton({ outDir: blocked, ...input })).toBeNull();
  });
});
