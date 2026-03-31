# Kairn — Agent Environment Compiler

## Purpose
Local-first CLI that compiles natural language intent into optimized Claude Code environments.

## Tech Stack
- TypeScript (strict, ESM), tsup bundler
- Commander.js (CLI), @inquirer/prompts (interactive)
- @anthropic-ai/sdk (compilation LLM call)
- chalk (colors), ora (spinners)

## Commands
```bash
npm run build          # tsup → dist/
npm run dev            # tsup --watch
npx tsx src/cli.ts     # run directly during dev
npm test               # vitest
npm run lint           # eslint src/
npm run typecheck      # tsc --noEmit
```

## Architecture
```
src/cli.ts              → Commander.js entry
src/commands/           → init, describe, list
src/compiler/           → compile.ts, prompt.ts
src/adapter/            → claude-code.ts (EnvironmentSpec → .claude/)
src/registry/tools.json → bundled tool catalog
src/types.ts            → TypeScript types
src/config.ts           → ~/.kairn/config.json
```

## Conventions
- async/await everywhere, no callbacks
- chalk colors: green=success, yellow=warn, red=error, cyan=info
- Errors: catch at command level, friendly message, exit 1
- All file I/O via fs.promises; create dirs if missing
- IDs: `crypto.randomUUID()` prefixed with `env_`
- Envs saved to ~/.kairn/envs/; MCP servers go in .mcp.json

## Key Commands
- `/project:build` — build and typecheck
- `/project:plan` — plan before coding
- `/project:test` — run and fix tests
- `/project:review` — review staged changes
- `/project:commit` — conventional commit
- `/project:status` — live git + test summary
- `/project:fix` — issue-driven fix workflow
- `/project:sprint` — define acceptance criteria
- `/project:spec` — interview-based spec creation
- `/project:prove` — confidence-rated verification
- `/project:grill` — adversarial code review

## Output
- `dist/` — compiled CLI (tsup)
- `~/.kairn/envs/` — saved environments
- `~/.kairn/config.json` — API key + settings

## Verification
After implementing any change, verify it works:
- `npm run build` — must pass with no errors
- `npm run typecheck` — no type errors
- `npm run lint` — no warnings or errors
- `npm test` — all tests must pass

If any verification step fails, fix the issue before moving on.
Do NOT skip verification steps.

## Known Gotchas
<!-- After any correction, add it here. Prune when > 10 items. -->
- Use `@inquirer/prompts` not old `inquirer` package
- MCP servers go in `.mcp.json` (project-scoped), NOT settings.json
- `env_` prefix required on all environment IDs
- ESM-only: no `require()`, use `import` everywhere

## Debugging
When debugging, paste raw error output. Don't summarize — Claude works better with raw data.
Use subagents for deep investigation to keep main context clean.

## Git Workflow
- Prefer small, focused commits (one feature or fix per commit)
- Use conventional commits: feat:, fix:, docs:, refactor:, test:
- Target < 200 lines per PR when possible