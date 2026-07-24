import { describe, it, expect } from "vitest";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProcedureCandidate } from "./procedures.ts";
import { buildDraftPrompt, draftSkill, resolveClaudeBin } from "./skill-writer.ts";

const CANDIDATE: ProcedureCandidate = {
  signature: "edit@core > test > git",
  steps: ["edit@core", "test", "git"],
  supportSessions: 3,
  repos: ["alpha"],
  scope: "local",
  score: 9,
  examples: [["src/core/billing.ts", "npm test", "git commit -m x"]],
};

const VALID_DRAFT = [
  "---",
  "name: billing-edit-loop",
  "description: Edit billing code, run the tests, commit.",
  "---",
  "",
  "# billing-edit-loop",
  "",
  "1. Edit the file.",
].join("\n");

describe("resolveClaudeBin", () => {
  it("prefers CHARDON_CLAUDE_BIN, falls back to PATH, null when absent", () => {
    const dir = mkdtempSync(join(tmpdir(), "chardon-bin-"));
    const bin = join(dir, "claude");
    writeFileSync(bin, "#!/bin/sh\necho ok\n");
    chmodSync(bin, 0o755);

    expect(resolveClaudeBin({ CHARDON_CLAUDE_BIN: bin, PATH: "/nonexistent" })).toBe(bin);
    expect(resolveClaudeBin({ PATH: `/nonexistent:${dir}` })).toBe(bin);
    expect(resolveClaudeBin({ PATH: "/nonexistent" })).toBeNull();
    expect(resolveClaudeBin({})).toBeNull();
  });
});

describe("buildDraftPrompt", () => {
  it("embeds signature, support, scope and examples", () => {
    const prompt = buildDraftPrompt(CANDIDATE, ".claude/skills/");
    expect(prompt).toContain("edit@core > test > git");
    expect(prompt).toContain("3 session(s)");
    expect(prompt).toContain("local");
    expect(prompt).toContain("npm test");
    expect(prompt).toContain(".claude/skills/");
  });
});

describe("draftSkill", () => {
  it("returns the drafted markdown and extracted name", () => {
    const result = draftSkill(CANDIDATE, ".claude/skills/", {
      env: { CHARDON_CLAUDE_BIN: "/fake/claude" },
      runner: () => VALID_DRAFT,
    });
    expect(result).toEqual({ markdown: VALID_DRAFT, name: "billing-edit-loop" });
  });

  it("returns null on malformed output", () => {
    const noFrontmatter = draftSkill(CANDIDATE, ".claude/skills/", {
      env: { CHARDON_CLAUDE_BIN: "/fake/claude" },
      runner: () => "I cannot help with that.",
    });
    expect(noFrontmatter).toBeNull();
    const noName = draftSkill(CANDIDATE, ".claude/skills/", {
      env: { CHARDON_CLAUDE_BIN: "/fake/claude" },
      runner: () => "---\ndescription: x\n---\nbody",
    });
    expect(noName).toBeNull();
  });

  it("returns null when the runner throws (timeout, missing binary)", () => {
    const result = draftSkill(CANDIDATE, ".claude/skills/", {
      env: { CHARDON_CLAUDE_BIN: "/fake/claude" },
      runner: () => {
        throw new Error("spawnSync ETIMEDOUT");
      },
    });
    expect(result).toBeNull();
  });

  it("returns null without any resolvable binary, without invoking the runner", () => {
    let called = false;
    const result = draftSkill(CANDIDATE, ".claude/skills/", {
      env: { PATH: "/nonexistent" },
      runner: () => {
        called = true;
        return VALID_DRAFT;
      },
    });
    expect(result).toBeNull();
    expect(called).toBe(false);
  });

  it("drafts through a real subprocess when the binary is a script", () => {
    const dir = mkdtempSync(join(tmpdir(), "chardon-fakeclaude-"));
    const bin = join(dir, "claude");
    // The script must consume stdin: the prompt now arrives there, and a child
    // exiting without reading it can EPIPE the caller depending on timing.
    writeFileSync(bin, `#!/bin/sh\ncat > /dev/null\nprintf '%s\\n' '---' 'name: from-script' '---' 'body'\n`);
    chmodSync(bin, 0o755);
    const result = draftSkill(CANDIDATE, ".claude/skills/", {
      env: { CHARDON_CLAUDE_BIN: bin },
    });
    expect(result?.name).toBe("from-script");
  });
});

describe("draftSkill hardening", () => {
  it("rejects a drafted name outside the slug allowlist", () => {
    const evil = "---\nname: ../../escape\n---\nbody";
    const result = draftSkill(CANDIDATE, ".claude/skills/", {
      env: { CHARDON_CLAUDE_BIN: "/fake/claude" },
      runner: () => evil,
    });
    expect(result).toBeNull();
  });

  it("passes the prompt via stdin, never argv", () => {
    const dir = mkdtempSync(join(tmpdir(), "chardon-stdin-"));
    const bin = join(dir, "claude");
    // The fake binary proves the prompt arrives on stdin and argv stays clean.
    writeFileSync(
      bin,
      `#!/bin/sh\ncase "$*" in *edit@core*) echo "ARGV-LEAK"; exit 1;; esac\ngrep -q "edit@core" && printf '%s\\n' '---' 'name: from-stdin' '---' 'body'\n`,
    );
    chmodSync(bin, 0o755);
    const result = draftSkill(CANDIDATE, ".claude/skills/", { env: { CHARDON_CLAUDE_BIN: bin } });
    expect(result?.name).toBe("from-stdin");
  });
});
