Implement the next unreleased version from ROADMAP.md using subagents, isolated worktrees, and PR workflow.

## Phase 1: PLAN
Read ROADMAP.md. Find the first version with unchecked items (- [ ]). That is the target version.
Read the design doc at docs/design/v1.X-*.md for that version.
List every item to implement. This is the sprint backlog.

## Phase 2: BRANCH
Create a release branch in an isolated worktree:
```
git worktree add ../kairn-release-vX.Y release/vX.Y -b release/vX.Y
```
All implementation work happens in the worktree, not the main branch.

## Phase 3: IMPLEMENT
For each item in the backlog, use the @implementer agent:
- Pass it the specific section from the design doc
- Let it implement, build, and commit
- Move to the next item after it finishes

If there is no design doc, implement directly from the ROADMAP checklist items.

## Phase 4: VERIFY
Use the @verifier agent:
- Pass it the "Testing This Release" section from the design doc
- It will run each test and report PASS/FAIL
- If any FAIL: use @implementer to fix, then re-verify

## Phase 5: FINALIZE
After all tests pass:

1. Update CHANGELOG.md — add new version section with all changes
2. Update ROADMAP.md — check off completed items, mark version ✅
3. Run: `npm version minor --no-git-tag-version`
4. Run: `npm run build`
5. Commit: "vX.Y.0 — short description of this release"

## Phase 6: PR
Create a pull request from the release branch:
```
gh pr create --title "release: vX.Y.0 — short description" --body "## Changes\n\n$(git log main..HEAD --oneline)" --base main
```

Print a status summary:

```
RELEASE vX.Y.0 READY
=====================
Branch:   release/vX.Y
PR:       #N (link)
Changes:  X commits
Tests:    all passing

Next steps:
  1. Review the PR
  2. Merge to main
  3. git tag vX.Y.0 && git push --tags
  4. npm publish --access public
  5. git worktree remove ../kairn-release-vX.Y
```
