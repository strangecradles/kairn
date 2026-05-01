---
name: land
description:
  Land a PR by monitoring conflicts, resolving them, waiting for checks, and
  squash-merging when green; use when asked to land, merge, or shepherd a PR to
  completion.
---

# Land

## Goals

- Ensure the PR is conflict-free with main.
- Keep CI green and fix failures when they occur.
- Squash-merge the PR once checks pass.
- Do not yield to the user until the PR is merged; keep the watcher loop running
  unless blocked.

## Preconditions

- `gh` CLI is authenticated.
- You are on the PR branch with a clean working tree.

## Steps

1. Locate the PR for the current branch.
2. Confirm the full validation gate is green locally:
   `npm run build && npx tsc --noEmit && npm test`.
3. If the working tree has uncommitted changes, commit (use `commit` skill) and
   push (use `push` skill) before proceeding.
4. Check mergeability and conflicts against main.
5. If conflicts exist, use the `pull` skill to fetch/merge `origin/main` and
   resolve conflicts, then use the `push` skill to publish.
6. Ensure review comments (Codex review or human) are acknowledged and any
   required fixes are handled before merging.
7. Watch checks until complete.
8. If checks fail, pull logs, fix the issue, commit, push, re-watch.
9. When all checks are green and review feedback is addressed, squash-merge with
   PR title/body for the merge subject/body.
10. **Context guard:** Before implementing review feedback, confirm it does not
    conflict with the user's stated intent or task context. If it conflicts,
    respond inline with a justification and ask before changing code.
11. **Pushback template:** When disagreeing, reply inline: acknowledge +
    rationale + offer alternative.
12. **Per-comment mode:** For each review comment, choose: accept, clarify, or
    push back. Reply inline (or in the issue thread for Codex reviews) stating
    the mode before changing code.
13. **Reply before change:** Always respond with intended action before pushing
    code changes.

## Commands

```sh
branch=$(git branch --show-current)
pr_number=$(gh pr view --json number -q .number)
pr_title=$(gh pr view --json title -q .title)
pr_body=$(gh pr view --json body -q .body)

# Check mergeability
mergeable=$(gh pr view --json mergeable -q .mergeable)
if [ "$mergeable" = "CONFLICTING" ]; then
  # Run `pull` skill, then `push` skill.
  :
fi

# Preferred: Async Watch Helper
python3 .codex/skills/land/land_watch.py

# Manual fallback (only if Python is unavailable):
# while true; do
#   gh api repos/{owner}/{repo}/issues/"$pr_number"/comments \
#     --jq '.[] | select(.body | startswith("## Codex Review")) | .id' | rg -q '.' && break
#   sleep 10
# done
# gh pr checks --watch || { gh pr checks; exit 1; }

# Squash-merge
gh pr merge --squash --subject "$pr_title" --body "$pr_body"
```

## Async Watch Helper

```
python3 .codex/skills/land/land_watch.py
```

Exit codes:

- 2: Review comments detected (address feedback)
- 3: CI checks failed
- 4: PR head updated (autofix commit detected)
- 5: PR has merge conflicts

## Failure Handling

- If checks fail, pull details (`gh pr checks`, `gh run view --log`), fix
  locally, commit (commit skill), push (push skill), and re-run the watch.
- Use judgment for flaky failures (e.g., one-platform timeout).
- If CI pushes an auto-fix commit (GitHub Actions author), it does not retrigger
  CI. Pull locally, merge `origin/main` if needed, add a real-author commit, and
  force-push to retrigger.
- If mergeability is `UNKNOWN`, wait and re-check.
- Do not merge while review comments (human or Codex review) are outstanding.
- Codex review jobs retry on failure and are non-blocking; use `## Codex Review
  — <persona>` issue comments (not job status) as the signal.
- Do not enable auto-merge.

## Review Handling

- Codex reviews arrive as issue comments starting with `## Codex Review —
  <persona>`. Treat as feedback that must be acknowledged before merge.
- Human review comments are blocking and must be addressed before merging.
- Fetch review comments via `gh api` and reply with a `[codex]`-prefixed
  comment.
- Use review comment endpoints (not issue comments) to find inline feedback:
  - List PR review comments:
    `gh api repos/{owner}/{repo}/pulls/<pr_number>/comments`
  - PR issue comments (top-level):
    `gh api repos/{owner}/{repo}/issues/<pr_number>/comments`
  - Reply to a specific review comment:
    ```
    gh api -X POST /repos/{owner}/{repo}/pulls/<pr_number>/comments \
      -f body='[codex] <response>' -F in_reply_to=<comment_id>
    ```
- `in_reply_to` must be the numeric review comment id (e.g., `2710521800`), not
  the GraphQL node id.
- All Codex-authored GitHub comments must be prefixed with `[codex]`.
- For inline review feedback, reply inline (using the review comment endpoint)
  with intended fixes. Implement, commit, push, then reply again with fix
  details + commit sha.
- Only request a new Codex review when there are new commits since the previous
  request.

## Scope + PR Metadata

- PR title and description should reflect the full scope of the change.
- If review feedback expands scope, decide whether to include now or defer; if
  deferring, call it out in the root-level `[codex]` update.
- Classify each review comment: correctness, design, style, clarification,
  scope.
- For correctness feedback, provide concrete validation (test, log, reasoning)
  before closing.
- Prefer a single consolidated "review addressed" root-level comment after a
  batch of fixes.
