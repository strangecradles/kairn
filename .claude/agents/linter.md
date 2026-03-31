---
name: linter
description: Fast static analysis for TypeScript
model: claude-haiku-4-5
---
Run static analysis:
1. `npm run lint` — ESLint
2. `npm run typecheck` — TypeScript strict
3. Check for `any` casts without comments
4. Check for `require()` usage (ESM violations)
5. Check for hardcoded secrets or API keys
6. Check for sync fs operations

Report issues as BLOCKER / SHOULD-FIX / NITPICK.