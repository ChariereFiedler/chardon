import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { redactCmd, redactSecrets } from "./redact.ts";

describe("redact", () => {
  // ---------------------------------------------------------------------------
  // Basic smoke tests (exact replacement markers)
  // ---------------------------------------------------------------------------

  it("replaces a GitLab PAT with [REDACTED]", () => {
    const result = redactSecrets("glpat-abcdef1234567890abcd");
    expect(result).toBe("[REDACTED]");
    expect(result).not.toContain("glpat-");
  });

  it("replaces a GitLab runner token with [REDACTED]", () => {
    const result = redactSecrets("glrt-abcdefghij0123456789");
    expect(result).toBe("[REDACTED]");
    expect(result).not.toContain("glrt-");
  });

  it("replaces a GitHub token with [REDACTED]", () => {
    const input =
      "curl -H 'Authorization: Bearer ghp_0123456789abcdef0123456789abcdef0123'";
    const result = redactSecrets(input);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("ghp_");
  });

  it("replaces a Jira/Atlassian token with [REDACTED]", () => {
    const input =
      "ATATT3xFfGF0zQhIGp8lKmNpQ1r2s3t4u5v6w7x8y9z0AABBCC==";
    const result = redactSecrets(input);
    expect(result).toBe("[REDACTED]");
    expect(result).not.toContain("ATATT");
  });

  it("replaces env-var assignment value with [REDACTED]", () => {
    const result = redactSecrets("API_KEY=supersecret");
    expect(result).toBe("API_KEY=[REDACTED]");
    expect(result).not.toContain("supersecret");
  });

  it("replaces env-var with quoted value", () => {
    const result = redactSecrets('MY_TOKEN="some secret value"');
    expect(result).toBe('MY_TOKEN=[REDACTED]');
    expect(result).not.toContain("some secret value");
  });

  it("replaces env-var with single-quoted value", () => {
    const result = redactSecrets("DB_PASSWORD='pa$$w0rd'");
    expect(result).toBe("DB_PASSWORD=[REDACTED]");
    expect(result).not.toContain("pa$$w0rd");
  });

  it("replaces env-var with single-quoted multi-word value (space inside quotes)", () => {
    // Value contains a space — only the '[^']*' branch can match; \S+ cannot
    const result = redactSecrets("MY_SECRET='my long secret value'");
    expect(result).toBe("MY_SECRET=[REDACTED]");
    expect(result).not.toContain("my long secret value");
  });

  it("replaces credentialed URL with [REDACTED]@", () => {
    const result = redactSecrets("psql postgres://admin:supersecret@host/db");
    expect(result).toContain("[REDACTED]@");
    expect(result).not.toContain("supersecret");
    expect(result).toContain("postgres://");
  });

  it("replaces JWT with [JWT_REDACTED]", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const result = redactSecrets(jwt);
    expect(result).toBe("[JWT_REDACTED]");
    expect(result).not.toContain("eyJhbGciOiJIUzI1NiJ9");
  });

  it("replaces a 32-char hex string with [HEX_REDACTED]", () => {
    const hex = "deadbeefcafe0123456789abcdef0123"; // exactly 32
    const result = redactSecrets(hex);
    expect(result).toBe("[HEX_REDACTED]");
    expect(result).not.toContain(hex);
  });

  it("replaces a 40-char hex string (git SHA) with [HEX_REDACTED]", () => {
    const hex = "deadbeefcafe0123456789abcdef0123456789ab";
    const result = redactSecrets(hex);
    expect(result).toBe("[HEX_REDACTED]");
    expect(result).not.toContain(hex);
  });

  it("leaves a harmless command unchanged", () => {
    expect(redactSecrets("ls -la src/")).toBe("ls -la src/");
  });

  // ---------------------------------------------------------------------------
  // Below-minimum-length inputs are NOT redacted (kills quantifier mutants)
  // ---------------------------------------------------------------------------

  it("does NOT redact a glpat- token shorter than 10 suffix chars", () => {
    // 9 chars suffix — below the {10,} minimum
    const short = "glpat-abc123456"; // 9 chars after prefix
    expect(redactSecrets(short)).toBe(short);
  });

  it("does NOT redact a glrt- token shorter than 10 suffix chars", () => {
    const short = "glrt-abc12345"; // 9 chars after prefix
    expect(redactSecrets(short)).toBe(short);
  });

  it("does NOT redact a ghp_ token shorter than 36 suffix chars", () => {
    const short = `ghp_${"a".repeat(35)}`; // 35 chars — below {36,}
    expect(redactSecrets(short)).toBe(short);
  });

  it("does NOT redact an ATATT token shorter than 40 suffix chars", () => {
    const short = `ATATT${"A".repeat(39)}`; // 39 chars — below {40,}
    expect(redactSecrets(short)).toBe(short);
  });

  it("does NOT redact a hex string shorter than 32 chars", () => {
    // 31 hex chars surrounded by spaces (word boundaries) — below the {32,} minimum
    const hex31 = "f".repeat(31);
    const result = redactSecrets(` ${hex31} `);
    expect(result).toContain(hex31);
  });

  it("does NOT redact a JWT that has only two segments", () => {
    const twoSegments = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0";
    expect(redactSecrets(twoSegments)).toBe(twoSegments);
  });

  // ---------------------------------------------------------------------------
  // redactCmd: exact truncation boundary (kills the slice mutant)
  // ---------------------------------------------------------------------------

  it("redactCmd truncates to exactly 60 characters", () => {
    // Use 'z' — not a hex digit, not a secret prefix, so redactSecrets returns it unchanged
    const long = "z".repeat(200);
    const result = redactCmd(long);
    // Must be EXACTLY 60, not just "at most 60" — kills the remove-slice mutant
    expect(result.length).toBe(60);
    expect(result).toBe("z".repeat(60));
  });

  it("redactCmd does not truncate when input is already shorter than 60", () => {
    const short = "echo hello";
    expect(redactCmd(short)).toBe("echo hello");
  });

  it("redactCmd redacts first, then truncates", () => {
    // glpat- secret becomes "[REDACTED]" (10 chars); suffix uses 'z' (not hex) to stay intact
    const secret = `glpat-${"z".repeat(20)}`; // becomes "[REDACTED]" (10 chars)
    const suffix = ` && ls ${"z".repeat(100)}`;
    const result = redactCmd(secret + suffix);
    expect(result).toContain("[REDACTED]");
    expect(result.length).toBe(60);
  });

  // ---------------------------------------------------------------------------
  // Returns empty string for non-string input
  // ---------------------------------------------------------------------------

  it("returns empty string for non-string input", () => {
    expect(redactSecrets(null as unknown as string)).toBe("");
    expect(redactSecrets(42 as unknown as string)).toBe("");
    expect(redactSecrets(undefined as unknown as string)).toBe("");
  });

  // ---------------------------------------------------------------------------
  // Property-based tests (fast-check) — secret must never leak
  // ---------------------------------------------------------------------------

  it("never leaks a GitLab PAT regardless of surrounding text", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.stringMatching(/^[A-Za-z0-9_-]{10,20}$/),
        (pre, post, suffix) => {
          const secret = `glpat-${suffix}`;
          const out = redactSecrets(`${pre} ${secret} ${post}`);
          return !out.includes(secret);
        }
      )
    );
  });

  it("never leaks a GitLab runner token regardless of surrounding text", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.stringMatching(/^[A-Za-z0-9_-]{10,20}$/),
        (pre, post, suffix) => {
          const secret = `glrt-${suffix}`;
          const out = redactSecrets(`${pre} ${secret} ${post}`);
          return !out.includes(secret);
        }
      )
    );
  });

  it("never leaks a GitHub token regardless of surrounding text", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.stringMatching(/^[A-Za-z0-9]{36,50}$/),
        (pre, post, suffix) => {
          const secret = `ghp_${suffix}`;
          const out = redactSecrets(`${pre} ${secret} ${post}`);
          return !out.includes(secret);
        }
      )
    );
  });

  it("never leaks a Jira/Atlassian token regardless of surrounding text", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.stringMatching(/^[A-Za-z0-9+/=]{40,60}$/),
        (pre, post, suffix) => {
          const secret = `ATATT${suffix}`;
          const out = redactSecrets(`${pre} ${secret} ${post}`);
          return !out.includes(secret);
        }
      )
    );
  });

  it("never leaks an env-var secret value regardless of surrounding text", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.stringMatching(/^\S{5,20}$/),
        (pre, post, value) => {
          const input = `${pre} MY_TOKEN=${value} ${post}`;
          const out = redactSecrets(input);
          // The value should not appear after the = sign
          return !out.includes(`MY_TOKEN=${value}`);
        }
      )
    );
  });

  it("never leaks a JWT regardless of surrounding text", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.stringMatching(/^[A-Za-z0-9_-]{10,30}$/),
        fc.stringMatching(/^[A-Za-z0-9_-]{10,30}$/),
        fc.stringMatching(/^[A-Za-z0-9_-]{10,30}$/),
        (pre, post, h, p, s) => {
          const jwt = `eyJ${h}.${p}.${s}`;
          const out = redactSecrets(`${pre} ${jwt} ${post}`);
          return !out.includes(jwt);
        }
      )
    );
  });

  it("never leaks a 32+ char hex string regardless of surrounding text", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.stringMatching(/^[0-9a-f]{32,48}$/),
        (_pre, _post, hex) => {
          // Surround with spaces to give word boundaries
          const out = redactSecrets(` ${hex} `);
          return !out.includes(hex);
        }
      )
    );
  });
});
