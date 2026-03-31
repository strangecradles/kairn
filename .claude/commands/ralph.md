# /project:ralph — Feature-Agnostic Build Loop

Automated build loop that implements any Kairn feature from the ROADMAP using specialized subagents. Point it at a version and it does the rest.

## Input

You need a `$version` (e.g., "v2.0.0"). Read it from the user's prompt.

## Phase 0: Orient

1. Read `ROADMAP.md` — find the `$version` section, extract all checklist items
2. Find the design doc: `docs/design/` — match on version number
3. Read the design doc fully — understand scope, files to create, architecture
4. Check git status — must be clean (no uncommitted changes)
5. Create feature branch if not already on one: `git checkout -b feature/$version`

## Phase 1: Plan (spawn @architect)

Invoke `@architect` with the target version:

> "Read ROADMAP.md and the design doc for $version. Produce a PLAN-$version.md with numbered implementation steps. Each step: what to build, files to create, dependencies, verification, commit message. Mark parallel-safe steps."

Save the output as `PLAN-$version.md` in the repo root.
Commit: `git add PLAN-$version.md && git commit -m "plan: $version implementation plan"`

## Phase 2: Build (spawn @implementer per step)

Read `PLAN-$version.md`. Execute steps in order, respecting dependencies.

**For parallel-safe steps:** spawn multiple `@implementer` subagents simultaneously.
**For sequential steps:** spawn one `@implementer` at a time, wait for completion.

For each step (or group of parallel steps):

1. Invoke `@implementer` with:
   > "Execute step N from PLAN-$version.md. Read the plan, read the design doc at docs/design/v*.md for implementation details. Follow all coding standards. Build, verify, commit."

2. After each step completes, verify:
   - `npm run build` passes
   - The step's verification command passes
   - The commit exists in git log

3. If a step fails to build: invoke `@debugger` with the error output.

Continue until all steps in the plan are complete.

## Phase 3: Quality Gate (spawn @reviewer)

After all steps complete:

Invoke `@reviewer`:

> "Review the implementation of $version. Check spec compliance against ROADMAP.md and the design doc. Check code quality of all new/modified files. Output a structured report."

Read the review output.

## Phase 4: Fix Loop (if needed)

If the reviewer reports BLOCKERS or SHOULD-FIX issues:

1. Invoke `@debugger` with the review findings:
   > "Fix these review issues: [paste findings]. Then run npm run build to verify."

2. After fixes, invoke `@reviewer` again to re-check.

3. Repeat until the reviewer returns VERDICT: PASS.

Maximum 3 fix rounds. If still failing after 3, stop and report to user.

## Phase 5: Finalize

1. Run full verification:
   ```bash
   npm run build
   node dist/cli.js --help  # verify new commands appear
   ```

2. Report completion:
   ```
   ━━━ RALPH LOOP COMPLETE ━━━━━━━━━━━━━━━━━━━━━━
   Version:    $version
   Steps:      N completed
   Commits:    N
   Review:     PASS
   
   Ready for: ROADMAP update, CHANGELOG, version bump, PR
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ```

## Subagent Reference

| Agent | Role | When to spawn | Tools |
|-------|------|---------------|-------|
| `@architect` | Creates implementation plan from design doc | Phase 1 (once) | Read, Glob, Grep |
| `@implementer` | Builds one step from the plan | Phase 2 (per step, parallel when safe) | Read, Write, Edit, Bash, Glob, Grep |
| `@reviewer` | Checks spec compliance + code quality | Phase 3, Phase 4 (after fixes) | Read, Glob, Grep, Bash |
| `@debugger` | Fixes build errors + review issues | Phase 2 (on failure), Phase 4 | Read, Write, Edit, Bash, Grep, Glob |
| `@linter` | Fast static analysis | Phase 3 (via @reviewer) | Read, Bash |

## Rules

- Never skip the quality gate (Phase 3)
- Parallel @implementer spawns only for steps marked `[parallel-safe]`
- If `npm run build` fails at any point, stop and invoke @debugger before continuing
- All commits use conventional format: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`
- Don't bump version or update ROADMAP/CHANGELOG — that's done by the overseer (Hermes)
