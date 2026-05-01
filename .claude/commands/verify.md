# Verification & Adversarial Review

Run comprehensive verification + skeptical code review.

## Phase 1: Execution Verification

1. **Run tests:**

!npm test 2>&1

2. **Typecheck:**

!npm run typecheck 2>&1

3. **Build:**

!npm run build 2>&1

4. **Show changes:**

!git diff main --stat 2>/dev/null || git diff HEAD~1 --stat

## Phase 2: Adversarial Review

Act as a senior engineer asking tough questions. Review the diff:

!git diff --staged 2>/dev/null || git diff HEAD~1 2>/dev/null

For each change, ask:
- "Why this approach over alternatives?"
- "What happens with malformed input?"
- "Are error cases handled gracefully?"
- "Does this violate any invariants?"
- "What's the worst-case scenario?"

## Phase 3: Confidence Rating

After both phases, rate confidence:

- **HIGH:** Tests pass, edge cases covered, no regressions, skepticism resolved
- **MEDIUM:** Core works, some edges untested, minor concerns remain
- **LOW:** Major gaps or unresolved BLOCKERs — needs more work

## Issue Triage

```
BLOCKERS (stop work):
  - [file:line] description

SHOULD-FIX (before merge):
  - [file:line] description

NITPICKS (follow-up):
  - [file:line] description
```

**Do NOT approve until all BLOCKERs are resolved.**
