# .claude/ Environment Cleanup — April 6, 2026

## What Changed

### Deletions (Removed Bloat)

**Commands (17 → 13)**
- ❌ `kairn-ralph.md` — duplicate of `ralph.md`
- ❌ `ship.md` — redundant (covered by `commit` + `status`)
- ❌ `sprint.md` — merged into `spec.md`
- ❌ `prove.md` + `grill.md` — merged into new `verify.md`

**Agents (8 → 5)**
- ❌ `architect.md` — overkill; planning merged into `planner.md`
- ❌ `linter.md` — lint checks folded into `reviewer.md`
- ❌ `qa-orchestrator.md` — testing orchestration merged into `e2e-tester.md`

### New/Updated Files

**Commands Created:**
- ✅ `verify.md` — unified verification + adversarial review (replaces prove + grill)
- ✅ `spec.md` — interview-based spec writing + sprint contracts (absorbs sprint)

**Changes:**
- ✅ `settings.json` — PostToolUse ESLint hook now has loop guard (only runs if file > 10 lines)

## Agent Roster (5 agents → cleaner roles)

| Agent | Role | When Invoked |
|-------|------|--------------|
| `planner` | Spec + roadmap analysis | `/project:spec` interview |
| `implementer` | TDD coding (RED→GREEN→REFACTOR) | `/project:ralph` (build loop) |
| `reviewer` | Spec compliance + code quality gate | After implementation |
| `debugger` | Diagnose & fix build/test failures | After `reviewer` finds issues |
| `e2e-tester` | Browser automation QA | Final verification before ship |

## Command Workflow (13 core commands)

**Planning Phase:**
- `/project:spec` — interview to write spec
- `/project:help` — what can this environment do?

**Coding Phase:**
- `/project:ralph` — automated build loop (spawns implementer)
- `/project:build` — manual build + test
- `/project:test` — run test suite
- `/project:plan` — pre-code analysis

**Verification Phase:**
- `/project:verify` — run tests + adversarial review
- `/project:fix` — issue-driven fix workflow
- `/project:review` — staged changes review

**Shipping Phase:**
- `/project:commit` — conventional commit
- `/project:status` — git branch + task status

**Continuity:**
- `/project:tasks` — manage TODO.md
- `/project:reset` — stash work & re-start

## Benefits

✅ **Lower cognitive load** — 13 commands instead of 17 (users can remember them)
✅ **Clearer agent roles** — 5 specialists, no overlap
✅ **No ESLint loops** — PostToolUse hook only triggers for substantial edits
✅ **Unified verification** — spec + sprint contracts in one interview flow
✅ **Production-ready** — removed experimental/specialized commands

## Next Steps

1. Session continuity: Ensure `rules/continuity.md` tells Claude to update `LEARNINGS.md`
2. Test the new `/project:verify` command (verify + grill merged)
3. Confirm `/project:spec` interview flow works end-to-end
4. Monitor `/project:ralph` with reduced agent count (5 vs 8)

---

**Previous bloat:** 17 commands, 8 agents, 4 rules, 2 skills  
**Optimized:** 13 commands, 5 agents, 4 rules, 2 skills  
**Reduction:** 24% fewer commands, 37% fewer agents
