# Prove It Works

1. Run the full test suite:

!npm test 2>&1

2. Typecheck:

!npm run typecheck 2>&1

3. Compare against main:

!git diff main --stat 2>/dev/null || git diff HEAD~1 --stat

4. Rate confidence:
   - HIGH: All tests pass, edge cases covered, no regressions
   - MEDIUM: Core works, some edges untested
   - LOW: Needs more verification

If MEDIUM or LOW, state what's missing and fix it before proceeding.