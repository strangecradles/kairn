# Fix Issue #$ARGUMENTS

1. Fetch the issue:

!gh issue view $ARGUMENTS 2>/dev/null || echo 'Run: gh issue view $ARGUMENTS'

2. Understand the problem fully before touching code
3. Check related files:

!git log --oneline --all | head -10

4. Plan the fix (minimal change, no scope creep)
5. Implement
6. Verify:

!npm run typecheck 2>&1 | tail -10
!npm test 2>&1 | tail -20

7. Commit: `fix: resolve #$ARGUMENTS <description>`