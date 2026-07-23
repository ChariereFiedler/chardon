import { describe, it, expect } from "vitest";
import { classifyCommand } from "./cmd-class.ts";

describe("classifyCommand", () => {
  it("classifies test runners as test", () => {
    expect(classifyCommand("vitest run")).toBe("test");
    expect(classifyCommand("npx vitest run --no-file-parallelism")).toBe("test");
    expect(classifyCommand("jest --ci")).toBe("test");
    expect(classifyCommand("playwright test")).toBe("test");
    expect(classifyCommand("pytest tests/")).toBe("test");
    expect(classifyCommand("cargo test")).toBe("test");
    expect(classifyCommand("go test ./...")).toBe("test");
  });

  it("classifies npm/pnpm/yarn test scripts as test, including suffixed ones", () => {
    expect(classifyCommand("npm test")).toBe("test");
    expect(classifyCommand("npm run test")).toBe("test");
    expect(classifyCommand("npm run test:e2e")).toBe("test");
    expect(classifyCommand("pnpm run test:unit")).toBe("test");
    expect(classifyCommand("yarn test")).toBe("test");
  });

  it("classifies typecheck commands", () => {
    expect(classifyCommand("tsc --noEmit")).toBe("typecheck");
    expect(classifyCommand("npx tsc -p tsconfig.json")).toBe("typecheck");
    expect(classifyCommand("npm run typecheck")).toBe("typecheck");
  });

  it("classifies lint commands", () => {
    expect(classifyCommand("eslint .")).toBe("lint");
    expect(classifyCommand("npx biome check .")).toBe("lint");
    expect(classifyCommand("npm run lint")).toBe("lint");
  });

  it("classifies build commands", () => {
    expect(classifyCommand("npm run build")).toBe("build");
    expect(classifyCommand("cargo build --release")).toBe("build");
  });

  it("classifies git commands as git, even when the message mentions tests", () => {
    expect(classifyCommand("git commit -m 'fix tests'")).toBe("git");
    expect(classifyCommand("git status")).toBe("git");
    expect(classifyCommand("git push origin main")).toBe("git");
  });

  it("classifies package-manager installs as pkg", () => {
    expect(classifyCommand("npm install")).toBe("pkg");
    expect(classifyCommand("npm ci")).toBe("pkg");
    expect(classifyCommand("pnpm add -D vitest")).toBe("pkg");
    expect(classifyCommand("yarn add lodash")).toBe("pkg");
  });

  it("falls back to other for everything else", () => {
    expect(classifyCommand("ls")).toBe("other");
    expect(classifyCommand("echo hello")).toBe("other");
    expect(classifyCommand("")).toBe("other");
    expect(classifyCommand("   ")).toBe("other");
  });

  it("ambiguous cases resolve by intent, not substring", () => {
    // A git command touching a branch named after a build stays git.
    expect(classifyCommand("git checkout build-fix")).toBe("git");
    // Leading whitespace does not defeat the prefix match.
    expect(classifyCommand("  npm test")).toBe("test");
    // "latest" must not read as a test command.
    expect(classifyCommand("docker pull node:latest")).toBe("other");
  });
});
