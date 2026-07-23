import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Guards the documented operational claims (backup story, token hygiene,
// deprecation policy, incident template) and the hardened CI surface (release
// workflow with provenance, CodeQL job). A doc claim that can be checked
// mechanically should not depend on a reviewer noticing (see tools/validate.ts).

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const FULL_SHA_LENGTH = 40;
/** Every `uses:` in a workflow must be pinned to a full commit SHA. */
function unpinnedUses(workflow: string): string[] {
  const uses = [...workflow.matchAll(/^\s*(?:- )?uses:\s*(\S+)/gm)].map((m) => m[1]);
  return uses.filter((u) => !new RegExp(`@[0-9a-f]{${FULL_SHA_LENGTH}}\\b`).test(u));
}

describe("README backup guidance", () => {
  it("tells the user how to back up the database and what a loss costs", () => {
    const readme = read("README.md");
    expect(readme).toMatch(/[Bb]ack.{0,10}up/);
    expect(readme).toContain("~/.claude/chardon.db");
    // [\s\S] instead of a dot: the claim may wrap across a line break.
    expect(readme).toMatch(/schema[\s\S]{0,40}(recreate|re-create)/i);
  });
});

describe("SECURITY.md token hygiene and patching", () => {
  const security = read("SECURITY.md");

  it("has a token hygiene section covering scope, rotation and env-var storage", () => {
    expect(security).toMatch(/## Token hygiene/);
    expect(security).toContain("read_api");
    expect(security).toMatch(/rotate/i);
    expect(security).toMatch(/environment variable/i);
  });

  it("states the patching SLA", () => {
    expect(security).toMatch(/patch version/i);
  });
});

describe("deprecation policy", () => {
  const policy = read("docs/deprecation-policy.md");

  it("names every public surface", () => {
    expect(policy).toContain(".chardon.json");
    expect(policy).toMatch(/schema/i);
    expect(policy).toMatch(/command/i);
    expect(policy).toMatch(/status.?line/i);
  });

  it("commits to additive-first changes announced in the changelog", () => {
    expect(policy).toMatch(/additive/i);
    expect(policy).toContain("CHANGELOG");
    expect(policy).toMatch(/minor version/i);
  });
});

describe("incident template", () => {
  it("has the post-mortem sections", () => {
    const template = read("docs/incident-template.md");
    for (const section of ["Context", "Impact", "Root cause", "Remediation", "Verified guard"]) {
      expect(template, `section ${section}`).toContain(`## ${section}`);
    }
  });
});

describe("release workflow", () => {
  const release = read(".github/workflows/release.yml");

  it("triggers on v* tags and runs the full check set", () => {
    // Accepts both the inline list and the block list YAML forms.
    expect(release).toMatch(/tags:\s*(\[|\n\s*- )["']?v\*/);
    for (const step of [
      "npm ci",
      "npm audit",
      "npm run build",
      "npm run validate",
      "npm run lint",
      "npm run typecheck",
      "npm test",
    ]) {
      expect(release, `step ${step}`).toContain(step);
    }
    expect(release).toMatch(/git diff --exit-code -- dist/);
  });

  it("creates a release from the CHANGELOG and attests dist/ provenance", () => {
    expect(release).toContain("CHANGELOG.md");
    expect(release).toContain("attest-build-provenance");
    expect(release).toMatch(/id-token:\s*write/);
    expect(release).toMatch(/attestations:\s*write/);
    expect(release).toMatch(/contents:\s*write/);
  });

  it("pins every action by full commit SHA", () => {
    expect(unpinnedUses(release)).toEqual([]);
  });
});

describe("CI CodeQL job", () => {
  const ci = read(".github/workflows/ci.yml");

  it("runs CodeQL init and analyze on javascript-typescript", () => {
    expect(ci).toMatch(/codeql/);
    expect(ci).toContain("github/codeql-action/init");
    expect(ci).toContain("github/codeql-action/analyze");
    expect(ci).toContain("javascript-typescript");
  });

  it("grants security-events write only inside the codeql job", () => {
    expect(ci).toMatch(/security-events:\s*write/);
    const topLevel = ci.slice(0, ci.indexOf("jobs:"));
    expect(topLevel).not.toMatch(/security-events/);
  });

  it("pins every action by full commit SHA", () => {
    expect(unpinnedUses(ci)).toEqual([]);
  });
});
