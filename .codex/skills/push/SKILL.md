---
name: push
description:
  Push current branch changes to origin and create or update the corresponding
  pull request; use when asked to push, publish updates, or create pull request.
---

# Push

## Prerequisites

- `gh` CLI is installed and available in `PATH`.
- `gh auth status` succeeds for `strangecradles/kairn`.

## Goals

- Push current branch changes to `origin` safely.
- Create a PR if none exists for the branch, otherwise update the existing PR.
- Keep branch history clean when remote has moved.

## Related Skills

- `pull`: use this when push is rejected or sync is not clean (non-fast-forward,
  merge conflict risk, or stale branch).

## Steps

1. Identify current branch and confirm remote state.
2. Run local validation before pushing:

   ```bash
   npm run build && npx tsc --noEmit && npm test
   ```

3. Push branch to `origin` with upstream tracking if needed.
4. If push is rejected:
   - For non-fast-forward / sync failures: run the `pull` skill to merge
     `origin/main`, resolve conflicts, rerun validation, then retry push.
   - For auth/permissions/workflow failures: stop and surface the exact error.
     Do not switch protocols or rewrite remotes as a workaround.
   - Use `--force-with-lease` only when history was rewritten.
5. Ensure a PR exists for the branch:
   - If no PR exists, create one.
   - If a PR exists and is open, update it.
   - If branch is tied to a closed/merged PR, create a new branch + PR.
   - Write a PR title that clearly describes the change outcome.
   - For branch updates, reconsider whether the current PR title still matches
     the latest scope; update if not.
6. Write/update PR body using `.github/pull_request_template.md`:
   - Fill every section with concrete content for this change.
   - Replace placeholder comments (`<!-- ... -->`).
   - For existing PRs, refresh body to reflect the *total* PR scope, not just
     the newest commits.
7. Ensure the `symphony` label is present on the PR (add it if missing).
8. Reply with the PR URL from `gh pr view`.

## Commands

```sh
# Identify branch
branch=$(git branch --show-current)

# Validation gate (Kairn)
npm run build && npx tsc --noEmit && npm test

# Initial push
git push -u origin HEAD

# If push failed because remote moved, run the pull skill, then retry:
git push -u origin HEAD

# Only if history was rewritten locally:
git push --force-with-lease origin HEAD

# Ensure a PR exists
pr_state=$(gh pr view --json state -q .state 2>/dev/null || true)
if [ "$pr_state" = "MERGED" ] || [ "$pr_state" = "CLOSED" ]; then
  echo "Current branch is tied to a closed/merged PR; create a new branch + PR." >&2
  exit 1
fi

# Title — clear, human-friendly, scoped to the shipped change
pr_title="<clear PR title written for this change>"
if [ -z "$pr_state" ]; then
  gh pr create --title "$pr_title"
else
  gh pr edit --title "$pr_title"
fi

# Body — fill from .github/pull_request_template.md
# Suggested workflow:
#   1) read the template
#   2) draft body content for this PR
#   3) gh pr edit --body-file /tmp/pr_body.md

# Add the symphony label
gh pr edit --add-label symphony

# Show PR URL
gh pr view --json url -q .url
```

## Notes

- Do not use `--force`; only `--force-with-lease` as last resort.
- Distinguish sync issues from auth/permission issues:
  - Use `pull` skill for non-fast-forward / stale-branch issues.
  - Surface auth/permission failures directly; do not change remotes/protocols.
