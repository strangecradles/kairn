# Spec Interview & Sprint Contract

Interview to build a complete specification before coding.

## Phase 1: Interview (Ask One at a Time)

1. What exactly should this feature do?
2. Who uses it and how?
3. What are the edge cases or error states?
4. How will we know it works? (acceptance criteria)
5. What should it explicitly NOT do? (scope boundary)
6. Any dependencies, APIs, or constraints?
7. How does it fit with existing code?
8. Priority: speed, quality, or flexibility?

## Phase 2: Write Spec to docs/SPRINT.md

After collecting answers, write a structured contract:

```
# [Feature Name]

## Description
[From your answers, not invented]

## Acceptance Criteria
- [testable, specific]
- [measurable]
- [verifiable with exact commands]

## Files to Modify
- [list with expected changes]

## Out of Scope
- [explicit non-goals]

## Technical Approach
[How you'll implement it, considering existing code]

## Verification Steps
[Exact commands to prove it works]

## Estimate
[S/M/L]
```

## Phase 3: Confirm

Show me the spec. Do NOT start coding until I confirm it matches your intent.

After confirmation, use `/project:ralph` to implement the feature, or manually invoke `/project:build` and iterate.
