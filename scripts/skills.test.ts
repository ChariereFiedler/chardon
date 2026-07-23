import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { openDb, closeDb, writeSession, writeEvent } from "../lib/db.ts";
import { MIN_SUPPORT_SESSIONS } from "../lib/procedures.ts";
import { runSkillInference } from "./skills.ts";

const NOW = new Date("2026-07-24T12:00:00Z");

const VALID_DRAFT = [
  "---",
  "name: billing-edit-loop",
  "description: Edit, test, commit.",
  "---",
  "",
  "1. Edit the file.",
].join("\n");

let db: ReturnType<typeof openDb>;
let projectDir: string;
let homeDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), "proj-skills-"));
  homeDir = mkdtempSync(join(tmpdir(), "home-skills-"));
  process.env.CHARDON_DB = join(projectDir, "t.db");
  db = openDb();
  // The mined pattern must belong to this project's repo slug.
  const repo = basename(projectDir);
  for (let i = 0; i < MIN_SUPPORT_SESSIONS; i++) {
    const id = `s${i}`;
    writeSession(db, { id, repo, sessionType: "main" });
    writeEvent(db, { sessionId: id, tool: "Edit", success: true, meta: { file: "/p/src/core/a.ts" } });
    writeEvent(db, { sessionId: id, tool: "Bash", success: true, meta: { cmd: "npm test", cmd_class: "test" } });
    writeEvent(db, { sessionId: id, tool: "Bash", success: true, meta: { cmd: "git commit", cmd_class: "git" } });
  }
});
afterEach(() => closeDb(db));

describe("runSkillInference", () => {
  it("proposes a mined procedure and writes the proposal file", () => {
    const { summary, proposals } = runSkillInference({
      projectDir,
      now: NOW,
      homeDir,
      env: { CHARDON_CLAUDE_BIN: "/fake/claude" },
      runner: () => VALID_DRAFT,
    });

    expect(proposals).toBe(1);
    expect(summary).toContain("billing-edit-loop");
    expect(summary).toContain("edit@core > test > git");
    expect(summary).toContain(".claude/skills/");

    const proposed = join(projectDir, "docs/chardon", "proposed");
    const files = readdirSync(proposed);
    expect(files).toHaveLength(1);
    expect(readFileSync(join(proposed, files[0]), "utf-8")).toBe(VALID_DRAFT);

    const action = db
      .prepare(`SELECT status FROM actions WHERE kind = 'infer-skill' AND target = 'edit@core > test > git'`)
      .get();
    expect(action).toBeTruthy();
    const pattern = db
      .prepare(`SELECT proposal_path FROM patterns WHERE proposal_path LIKE '%proposed%'`)
      .get() as { proposal_path: string };
    expect(existsSync(pattern.proposal_path)).toBe(true);
  });

  it("is idempotent: a second run proposes nothing new", () => {
    const opts = {
      projectDir,
      now: NOW,
      homeDir,
      env: { CHARDON_CLAUDE_BIN: "/fake/claude" },
      runner: () => VALID_DRAFT,
    };
    runSkillInference(opts);
    const second = runSkillInference(opts);
    expect(second.proposals).toBe(0);
    expect(second.summary).toContain("No new recurring procedure");
  });

  it("skips a candidate whose drafted name is already installed", () => {
    const dir = join(projectDir, ".claude", "skills", "billing-edit-loop");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), "---\nname: billing-edit-loop\n---\n");

    const { proposals, summary } = runSkillInference({
      projectDir,
      now: NOW,
      homeDir,
      env: { CHARDON_CLAUDE_BIN: "/fake/claude" },
      runner: () => VALID_DRAFT,
    });
    expect(proposals).toBe(0);
    expect(summary).toContain("already installed");
  });

  it("falls back to the deterministic skeleton without a claude binary", () => {
    const { proposals, summary } = runSkillInference({
      projectDir,
      now: NOW,
      homeDir,
      env: { PATH: "/nonexistent" },
    });
    expect(proposals).toBe(1);
    expect(summary).toContain("skeleton");
    const proposed = join(projectDir, "docs/chardon", "proposed");
    const content = readFileSync(join(proposed, readdirSync(proposed)[0]), "utf-8");
    expect(content).toContain("name: procedure-");
    expect(content).toContain("edit@core > test > git");
  });

  it("states the home install target for global candidates", () => {
    // Same pattern in a second repo makes it global.
    writeSession(db, { id: "other", repo: "beta", sessionType: "main" });
    writeEvent(db, { sessionId: "other", tool: "Edit", success: true, meta: { file: "/q/src/core/b.ts" } });
    writeEvent(db, { sessionId: "other", tool: "Bash", success: true, meta: { cmd: "npm test", cmd_class: "test" } });
    writeEvent(db, { sessionId: "other", tool: "Bash", success: true, meta: { cmd: "git commit", cmd_class: "git" } });

    const { summary } = runSkillInference({
      projectDir,
      now: NOW,
      homeDir,
      env: { CHARDON_CLAUDE_BIN: "/fake/claude" },
      runner: () => VALID_DRAFT,
    });
    expect(summary).toContain("~/.claude/skills/");
  });
});
