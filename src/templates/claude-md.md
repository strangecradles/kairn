# CLAUDE.md Template

Use this 7-section structure. Maximum 100 lines total. Be specific, not generic.

```markdown
# {Project Name}

## Purpose
{One line — what this project does and for whom}

## Tech Stack
- {Language/runtime}
- {Framework}
- {Key libraries — only notable ones}

## Commands
```bash
{dev command}     # Start dev server
{build command}   # Production build
{test command}    # Run tests
{lint command}    # Lint/format
```

## Architecture
```
{3-8 line folder structure showing key directories}
```

## Conventions
- {Specific rule 1 — e.g., "Use Zod for all request validation"}
- {Specific rule 2 — e.g., "Functional components only, no class components"}
- {Specific rule 3 — e.g., "All API routes return { data, error } shape"}
- {Specific rule 4 — e.g., "Use conventional commits (feat:, fix:, docs:)"}

## Key Commands
- `/project:help` — environment guide
- `/project:tasks` — manage TODO list
- {workflow-specific commands}

## Output
- {Where results/artifacts go}
- {Key files to know about}
```

## Anti-patterns to avoid
- "You are a helpful assistant" — NEVER
- Listing every possible coding rule — use rules/ for overflow
- Pasting architecture docs inline — use @docs/ references
- Instructions that apply to all projects — those belong in rules/, not CLAUDE.md
