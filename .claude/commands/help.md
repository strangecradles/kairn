# Kairn CLI — Environment Help

This is the Kairn agent environment compiler project.

## Available Commands
- `/project:help` — this message
- `/project:tasks` — view and update TODO.md
- `/project:status` — live git status and recent commits
- `/project:plan` — plan a feature before coding
- `/project:build` — build and verify the project
- `/project:test` — run tests and fix failures
- `/project:review` — review staged changes
- `/project:commit` — create a conventional commit
- `/project:fix` — fix a specific issue by number
- `/project:sprint` — define sprint acceptance criteria
- `/project:spec` — interview-based spec creation
- `/project:prove` — confidence-rated verification
- `/project:grill` — adversarial code review
- `/project:reset` — elegant restart using DECISIONS.md

## Key Paths
- `src/compiler/prompt.ts` — the system prompt Claude sees
- `src/adapter/claude-code.ts` — EnvironmentSpec → file writer
- `src/registry/tools.json` — tool catalog
- `~/.kairn/envs/` — saved environments