Implement the next unreleased version from ROADMAP.md using subagents, isolated worktrees, and PR workflow.

## Phase 1: PLAN
Read ROADMAP.md. Find the first version with unchecked items (- [ ]). That is the target version.
Read the design doc at docs/design/v1.X-*.md for that version.
List every item to implement. This is the sprint backlog.
Print the backlog as a numbered list.

## Phase 2: BRANCH
Create a release branch in an isolated worktree:
```
git worktree add ../kairn-release-vX.Y -b release/vX.Y
cd ../kairn-release-vX.Y
```
All remaining work happens in the worktree directory.

## Phase 3: IMPLEMENT
For each backlog item, delegate to the implementer subagent:

"@implementer Implement item N from the v1.X design doc (docs/design/v1.X-*.md):
[paste the specific section from the design doc here].
Working directory: ../kairn-release-vX.Y"

Wait for the implementer to finish and commit before moving to the next item.
If the implementer hits a blocker, try to resolve it, then re-delegate.

## Phase 4: VERIFY
After all items are implemented, delegate to the verifier subagent:

"@verifier Run the testing checklist from docs/design/v1.X-*.md section 'Testing This Release'.
Working directory: ../kairn-release-vX.Y"

Review the verifier's report:
- If all PASS: proceed to Phase 5
- If any FAIL: delegate the fix to @implementer with the failure details, then re-verify

## Phase 5: FINALIZE
After all tests pass, in the worktree directory:

1. Update CHANGELOG.md — add new version section with all changes
2. Update ROADMAP.md — check off completed items (- [ ] → - [x]), mark version ✅
3. Run: `npm version minor --no-git-tag-version`
4. Run: `npm run build`
5. Commit: "vX.Y.0 — short description of this release"

## Phase 6: PR
Create a pull request from the release branch:
```
gh pr create --title "release: vX.Y.0 — short description" --body "## Changes

$(git log main..HEAD --oneline)" --base main
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
  1. Review the PR at the link above
  2. Merge to main
  3. git checkout main && git pull
  4. git tag vX.Y.0 && git push --tags
  5. npm publish --access public
  6. git worktree remove ../kairn-release-vX.Y
```
