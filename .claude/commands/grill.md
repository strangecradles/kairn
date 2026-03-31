# Adversarial Code Review

!git diff --staged 2>/dev/null || git diff HEAD~1 2>/dev/null

Act as a senior engineer skeptical of every change. For each file:

1. "Why this approach over X?"
2. "What happens with malformed JSON input?"
3. "What if ~/.kairn/ doesn't exist?"
4. "What if the LLM returns invalid EnvironmentSpec?"
5. "Is this handling API key errors gracefully?"

Rate each concern:
- BLOCKER — will cause failures in prod
- SHOULD-FIX — fragile or confusing
- NITPICK — style/preference

Do NOT approve until all BLOCKERs resolved.