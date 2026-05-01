# Kairn — Agent Guide (for Codex / Symphony)

This file is the project context for autonomous coding agents. The interactive Claude Code environment lives in `.claude/`; this file is what **Codex** (via Symphony) reads.

Kairn is a TypeScript/Node CLI that compiles natural-language intent into optimized Claude Code environments.

## Stack

- TypeScript (strict, ESM), Node.js 18+
- tsup (bundler), Commander.js (CLI), @inquirer/prompts (interactive)
- @anthropic-ai/sdk (compilation LLM call)
- vitest (tests), eslint (lint)

## Commands

```bash
npm ci                  # install deps cleanly
npm run build           # tsup → dist/
npm run dev             # tsup --watch
npx tsx src/cli.ts      # run directly during dev
npm test                # vitest run
npx tsc --noEmit        # typecheck (no script alias defined)
npm run lint            # eslint src/  (only if script exists)
```

## Validation gate (run before every push)

```bash
npm run build && npx tsc --noEmit && npm test
```

Treat warnings as failures unless the ticket explicitly waives them.

## Architecture

```
src/cli.ts              → Commander.js entry
src/commands/           → init, describe, list, evolve, ...
src/compiler/           → compile.ts, prompt.ts
src/adapter/            → claude-code.ts (EnvironmentSpec → .claude/)
src/registry/tools.json → bundled tool catalog
src/types.ts            → TypeScript types
src/config.ts           → ~/.kairn/config.json
```

## Conventions

- async/await everywhere; no callbacks.
- ESM-only: use `import`, never `require()`.
- chalk colors: green=success, yellow=warn, red=error, cyan=info.
- All file I/O via `fs.promises`; create dirs if missing.
- IDs: `crypto.randomUUID()` prefixed with `env_`.
- Saved envs go to `~/.kairn/envs/`; MCP servers go in `.mcp.json` (project-scoped, not `settings.json`).
- Errors: catch at command level, friendly message, `exit 1`.

## Architecture mandate

When implementing features or fixes, do not settle for minimal/simple solutions that band-aid problems, leave TODO comments, duplicate code, or violate SOLID principles to save lines. Implement the architecturally correct solution. Ask: "What would a senior, perfectionist dev reject in code review?" — fix all of it.

Production code, not prototype. Proper abstraction > minimal code. Correct architecture > shortest solution.

## Security rules

- Never log or echo API keys, tokens, or secrets.
- Never write secrets to files outside `~/.kairn/config.json`.
- Never execute user-provided strings as shell commands.
- Never pass user-controlled input to dynamic code-evaluation primitives in JS (the global runtime evaluator or the dynamic-function constructor).
- Validate all LLM output before writing to filesystem.
- Sanitize file paths; prevent path traversal (`../`).
- Deny: `rm -rf`, `curl|sh`, `wget|sh` at all times.

## Large file reading

This codebase has files over 500 LOC. Read in chunks (`offset`/`limit`) — do not assume a single read captured the whole file. If editing a large file, verify you have full context first.

## Git workflow

- Small, focused commits (one feature or fix per commit).
- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- Target < 200 lines per PR when possible.
- The `symphony` label must be on every PR Codex opens (per WORKFLOW.md).

## Pointers

- `WORKFLOW.md` — Symphony orchestration policy + per-issue prompt.
- `CLAUDE.md` / `.claude/CLAUDE.md` — Claude Code (interactive agent) conventions; mostly applies to Codex too.
- `ROADMAP.md` — public feature roadmap.
- `CHANGELOG.md` — release history.
- `.codex/skills/` — Codex skills used during Symphony runs (commit, push, pull, land, linear).
