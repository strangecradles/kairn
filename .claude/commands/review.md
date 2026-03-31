# Review Staged Changes

!git diff --staged

!git diff --staged --stat

Check for:
- TypeScript type errors or `any` casts
- Missing error handling
- Hardcoded secrets or API keys
- `inquirer` usage instead of `@inquirer/prompts`
- `require()` instead of `import`
- Side effects on ~/.kairn/ without user confirmation

Rate each concern: BLOCKER / SHOULD-FIX / NITPICK