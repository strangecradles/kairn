# Ralph Loop Task — Execute Feature Implementation

## Objective

Implement the next feature milestone using the Ralph Loop with specialized subagents.

When you receive a version (e.g., "v2.0.0" or "v2.1.0"), execute this sequence:

### Phase 0: Orient

1. Read `ROADMAP.md` — find the target version, extract checklist items
2. Read the matching design doc at `docs/design/v*.md`
3. Verify git is clean: `git status`
4. Create/checkout feature branch: `git checkout -b feature/$version` (or verify you're on the branch)

### Phase 1: Plan

Invoke `@architect`:

> "Read ROADMAP.md for v$version and the design doc. Produce a `PLAN-v$version.md` with numbered steps. Each step: what to build, files to create, dependencies, verification command, commit message. Mark `[parallel-safe]` steps. Identify parallel groups: which steps can run simultaneously? Create a dependency graph."

After @architect completes, commit:
```bash
git add PLAN-v$version.md
git commit -m "plan: v$version implementation plan"
```

### Phase 2: Build

Read the generated `PLAN-v$version.md`. Execute steps in order, respecting dependencies.

**For parallel-safe steps (no dependencies):** Spawn multiple `@implementer` instances simultaneously using the @-mention syntax. Example:

> "Use @implementer to execute steps 1, 3, and 5 from PLAN-v2.1.0.md in parallel. Each implementer should: read the assigned step, read the design doc, follow TDD (RED→GREEN→REFACTOR), build, verify, and commit when done."

**For sequential steps:** Spawn one `@implementer` at a time.

For each step (or parallel group):

Invoke `@implementer`:

> "Execute step N from `PLAN-v$version.md`. Read the plan, read the design doc at `docs/design/v*.md`. Follow TDD: write tests first (RED), implement minimum code (GREEN), refactor cleanly (REFACTOR). Run npm run build. Verify step's verification command. Commit when done."

After each step:
- Verify: `npm run build` passes
- Verify: step's verification command passes  
- Verify: commit exists in git log

If a step fails: invoke `@debugger` with the error output.

Continue until all steps complete.

### Phase 3: Quality Gate

Invoke `@reviewer`:

> "Review the implementation of v$version. Check spec compliance: does every item in ROADMAP.md checklist have matching implementation? Check code quality: TS strict mode, error handling, patterns match src/commands/describe.ts and existing code. Output structured PASS/FAIL report with evidence. Be specific about what's missing or wrong."

Read the review output.

### Phase 4: Fix Loop (if needed)

If reviewer reports BLOCKERS or SHOULD-FIX:

Invoke `@debugger`:

> "Fix these review findings: [paste findings]. Read the relevant code, understand the issue, implement the fix, then run npm run build and npm test. When everything passes, commit with a descriptive message."

Then re-invoke `@reviewer` to re-check.

Repeat max 3 times. If still failing, stop and report.

### Phase 5: Finalize

1. Verify:
   ```bash
   npm run build
   node dist/cli.js --help
   ```

2. Final git log:
   ```bash
   git log --oneline -N
   ```
   (Show the last N commits from your feature branch)

3. Report:
   ```
   ━━━ RALPH LOOP COMPLETE ━━━━━━━━━━━━━━━━━━━━
   Version:    v$version
   Commits:    [count] (show git log)
   Review:     PASS
   
   Ready for: merge, ROADMAP/CHANGELOG update, version bump, PR/ship
   ```

---

## Subagent Reference

| Agent | Tools | Role |
|-------|-------|------|
| `@architect` | Read, Glob, Grep | Reads design doc → produces PLAN with deps (Phase 1) |
| `@implementer` | Read, Write, Edit, Bash, Glob, Grep | Executes ONE step using TDD (Phase 2, can parallelize) |
| `@reviewer` | Read, Glob, Grep, Bash | Spec compliance + code quality check (Phase 3) |
| `@debugger` | Read, Write, Edit, Bash, Grep, Glob | Fixes errors/review issues (Phase 2/4) |

---

## Key Rules

1. **Never skip Phase 3** (quality gate) — this is your safety check
2. **Parallel @implementer only for steps marked `[parallel-safe]`** — honor dependencies
3. **All commits use conventional format:** `feat:`, `fix:`, `test:`, `refactor:`, `docs:`
4. **Do NOT bump version or update ROADMAP/CHANGELOG yet** — that's post-merge
5. **Stop after Phase 5** — report completion to overseer (Hermes)
6. **Rollback on stuck build:** If `npm run build` fails for >5 minutes, stop and call `@debugger`

---

## For v2.2.1 Specifically

The design doc is in `docs/design/v2.0-kairn-evolve.md` (section v2.2.1 — Proposer JSON Fix + Mutation Scope Expansion).

Bug report: `.omc/evolve-bugs.md` (Bugs 3, 4, 5) + latest test run output showing proposer JSON failure.

**THE #1 BLOCKER:** The proposer returns English prose instead of JSON. No mutations have EVER been applied across any test run. The loop "runs" but never "evolves." This must be fixed first.

Key fixes (priority order):
1. **CRITICAL — Proposer JSON:** Add `jsonMode` to `callLLM()` with Anthropic assistant prefill (`{ role: "assistant", content: "{" }`) and OpenAI `response_format`. Also make `parseProposerResponse()` extract JSON from prose as fallback.
2. Bug 3: Add `delete_section` and `delete_file` mutation actions (types.ts, mutator.ts, proposer parser)
3. Bug 4: Include `.mcp.json` in harness scope (baseline.ts, runner.ts, proposer reads it automatically)
4. Bug 5: Rebalance proposer prompt — remove "Prefer ADDITIVE" bias, list all 5 actions, strengthen JSON instruction

This is a patch release — no new CLI commands. Internal fixes to make the loop actually evolve.

Builds on v2.2.0: modifies `callLLM()` in `src/llm.ts`, `Mutation` type, `applyMutations()`, `createBaseline()`, `createIsolatedWorkspace()`, `parseProposerResponse()`, `PROPOSER_SYSTEM_PROMPT`.

PLAN-v2.2.1.md has 9 steps grouped into 2 parallel groups (A: 5 parallel, B: 4 after A).
