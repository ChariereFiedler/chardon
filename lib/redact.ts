// Maximum length of a command after redaction
const CMD_MAX_LENGTH = 60;

const PATTERNS: [RegExp, string][] = [
  // GitLab tokens (Personal Access Token, Runner Token)
  [/glpat-[A-Za-z0-9_-]{10,}/g, "[REDACTED]"],
  [/glrt-[A-Za-z0-9_-]{10,}/g, "[REDACTED]"],
  // GitHub tokens
  [/ghp_[A-Za-z0-9]{36,}/g, "[REDACTED]"],
  // GitHub fine-grained personal access tokens
  [/github_pat_[A-Za-z0-9_]{20,}/g, "[REDACTED]"],
  // Jira / Atlassian tokens
  [/ATATT[A-Za-z0-9+/=]{40,}/g, "[REDACTED]"],
  // AWS access key ids (the matching secret is caught by the generic rules below)
  [/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED]"],
  // Anthropic API keys
  [/sk-ant-[A-Za-z0-9_-]{20,}/g, "[REDACTED]"],
  // Stripe / OpenAI-style secret keys
  [/\bsk_(?:live|test)_[A-Za-z0-9]{20,}/g, "[REDACTED]"],
  // npm automation tokens
  [/\bnpm_[A-Za-z0-9]{36}\b/g, "[REDACTED]"],
  // Slack tokens
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/g, "[REDACTED]"],
  // Google API keys
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, "[REDACTED]"],
  // Basic-auth flags with a user:pass value: `-u user:pass`, `--user=user:pass`.
  // The value must contain a colon, so `docker run -u root` stays untouched.
  [/((?:^|\s)(?:-u|--user)[ =])[^\s:@]+:\S+/g, "$1[REDACTED]"],
  // sshpass inline password
  [/(\bsshpass\s+-p\s*)\S+/g, "$1[REDACTED]"],
  // Lowercase assignments whose name is a sensitive word, or an `_`/`-`-separated
  // compound ending in one: `token=…`, `api_key=…` — but not `monkey=…`.
  [
    /\b((?:[a-z0-9]+[_-])*(?:token|key|secret|password|passwd|pass|pwd|auth|credential)s?)=("[^"]*"|'[^']*'|\S+)/g,
    "$1=[REDACTED]",
  ],
  // Secrets passed as a bare CLI argument or bearer header, whatever their shape:
  // `--token abc`, `--api-key abc`, `Authorization: Bearer abc`.
  [
    /(--?(?:token|key|secret|password|passwd|pwd|api[-_]?key|auth)(?:\s+|=)|[Bb]earer\s+)\S+/g,
    "$1[REDACTED]",
  ],
  // Inline environment variable values: VAR_TOKEN=abc or VAR_KEY=xyz
  [
    /\b([A-Z][A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD|PASS|PWD|AUTH|CREDENTIAL)[A-Z0-9_]*)=(?:"[^"]*"|'[^']*'|\S+)/g,
    "$1=[REDACTED]",
  ],
  // URLs with embedded credentials: proto://user:pass@host
  [
    /((?:postgres|mysql|mongodb|http|https|sftp|ftp):\/\/)[^:@\s]+:[^@\s]+@/g,
    "$1[REDACTED]@",
  ],
  // JWTs: three base64url segments separated by dots
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[JWT_REDACTED]"],
  // Long hex strings (>= 32 chars) — likely a hash or token
  [/\b[0-9a-fA-F]{32,}\b/g, "[HEX_REDACTED]"],
];

/** Redacts secrets present in `input` without truncating. */
export function redactSecrets(input: string): string {
  if (typeof input !== "string") return "";
  let result = input;
  for (const [pattern, replacement] of PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/** Redacts secrets then truncates to {@link CMD_MAX_LENGTH} characters. */
export function redactCmd(input: string): string {
  return redactSecrets(input).slice(0, CMD_MAX_LENGTH);
}
