import { describe, it, expect } from "vitest";
import { buildWeeklyPrompt, callModel } from "../lib/weekly.js";

const SCENARIOS = [
  { name: "toil-heavy", summary: { repo: "demo", weekStart: "2026-06-20", weekEnd: "2026-06-26", toil: [{ cmd: "npm run build", count: 40 }], coldReads: [], tokens: { input: 1000, output: 800, cacheRead: 5000 } },
    mustMention: "npm run build", mustNotMention: "cold read" },
  { name: "cold-read-heavy", summary: { repo: "demo", weekStart: "2026-06-20", weekEnd: "2026-06-26", toil: [], coldReads: [{ file: "src/huge.ts", count: 15 }], tokens: { input: 1000, output: 800, cacheRead: 5000 } },
    mustMention: "src/huge.ts", mustNotMention: "npm run build" },
  { name: "clean-week", summary: { repo: "demo", weekStart: "2026-06-20", weekEnd: "2026-06-26", toil: [], coldReads: [], tokens: { input: 1000, output: 800, cacheRead: 5000 } },
    mustMention: null, mustNotMention: "src/huge.ts" },
];

describe.skipIf(!process.env.ANTHROPIC_API_KEY)("weekly LLM evaluation", () => {
  it.each(SCENARIOS)("$name: focuses on the real friction, doesn't hallucinate", async ({ summary, mustMention, mustNotMention }) => {
    const out = await callModel(buildWeeklyPrompt(summary));
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThan(8000);
    if (mustMention) expect(out!.toLowerCase()).toContain(mustMention.toLowerCase());
    if (mustNotMention) expect(out!.toLowerCase()).not.toContain(mustNotMention.toLowerCase());
  });
});
