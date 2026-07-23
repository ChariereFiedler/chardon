# Security Policy

## Scope

Chardon runs locally as a Claude Code plugin. It observes coding-session
events and stores them in a local SQLite database (`~/.claude/chardon.db` by
default). It makes no network calls of its own; the only optional outbound path
is the weekly LLM synthesis, which runs solely when you opt in and provide an
Anthropic API key.

Command strings are redacted before storage (see `lib/redact.ts`) to avoid
persisting secrets that appear on a command line. If you find a redaction gap
that lets a secret reach the database, please treat it as a security issue.

## Threat model

**What chardon can touch.** It runs inside your Claude Code session with your user
privileges: it reads hook payloads on stdin, reads/writes its SQLite DB, reads Claude Code
transcript files to count tokens, runs `git`/`curl` for the status line, and reads
`.chardon.json` from the project. It has **no runtime npm dependencies** (only an *optional*
`@anthropic-ai/sdk`), so the third-party supply-chain surface at runtime is effectively zero.

**Trust boundaries.**
- *Untrusted:* a project's committed `.chardon.json`. Its values are validated before use:
  e.g. `gitlab.projectId` must match `^\d+$` and external calls use `execFileSync` (no shell),
  so a hostile config cannot inject a command.
- *Sensitive:* command lines. They are redacted (`lib/redact.ts`) and truncated before
  storage. Redaction is pattern-based (best-effort); a novel secret format could slip
  through: report it. `/chardon-inspect` lets you see exactly what is stored.
- *Outbound:* only the opt-in weekly LLM synthesis (`ANTHROPIC_API_KEY`), which sends an
  **aggregated** summary, never raw events.

**Data at rest.** Local only; the DB is created `0600` (owner-only); history is bounded by
`/chardon-purge`. No sync, no telemetry, no team aggregation.

**Non-goals.** chardon is not a sandbox and does not defend against a malicious Claude Code
host or a compromised machine; it defends against hostile *project inputs* and accidental
secret capture.

## Token hygiene

The optional GitLab status-line section authenticates with a token you provide
through an environment variable (`gitlab.tokenEnv`, default `GITLAB_TOKEN`).

- Grant it the **minimal scope**: `read_api` is enough; never `api` or `write_*`.
- **Rotate it periodically**, and immediately if you suspect exposure.
- Keep it **in an environment variable or secret manager only**: never in
  `.chardon.json` (which is meant to be committed) or any other tracked file.

The same rules apply to the optional `ANTHROPIC_API_KEY` used by the weekly
synthesis.

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Instead, report it
privately via GitHub Security Advisories ("Report a vulnerability" on the
repository's *Security* tab), or by contacting the maintainer.

Include: what you observed, how to reproduce it, and the impact. We aim to
acknowledge reports within a few days.

## Supported versions

Security fixes target the latest released version on the default branch.
Confirmed security fixes are released promptly as patch versions rather than
waiting for the next feature release.
