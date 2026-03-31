# Skill Templates

Skills are `SKILL.md` files that Claude loads automatically when the task matches.
Cost: ~30-50 tokens until activated. Select max 3 per environment.

## TDD Workflow (Code Projects)

```markdown
---
name: tdd-workflow
description: Test-Driven Development with strict Red-Green-Refactor discipline
---

# TDD Workflow

## The Cycle (MANDATORY order)

### 1. RED — Write Failing Test
- Write a test for the desired behavior
- The test MUST fail — if it passes, the test is wrong
- Do NOT write any implementation code yet
- Verify failure: run the test suite

### 2. GREEN — Minimal Implementation
- Write the MINIMUM code to make the failing test pass
- Do not add features beyond what the test requires
- Do not refactor yet
- Verify: run the test suite — all tests pass

### 3. REFACTOR — Clean Up
- Improve code quality while keeping tests green
- Extract functions, reduce duplication, clarify names
- Run tests after each change to ensure nothing breaks

## Rules
- NEVER write tests and implementation in the same step
- Test names describe behavior, not implementation
- One assertion per test when practical
- Run the full test suite after each phase
```

## Systematic Debugging (Code Projects)

```markdown
---
name: systematic-debugging
description: 4-phase root cause analysis for any bug
---

# Systematic Debugging

## Phase 1: REPRODUCE
- Confirm the bug exists with a minimal reproduction
- Write down the exact steps, input, and observed output
- Write down the expected output

## Phase 2: ISOLATE
- Narrow down where the bug occurs
- Use binary search: comment out half the code, does bug persist?
- Check recent changes: `git log --oneline -10`, `git diff`
- Add logging at key boundaries

## Phase 3: IDENTIFY
- Form a hypothesis about the root cause
- Verify the hypothesis with a targeted test
- If wrong, return to Phase 2 with new information

## Phase 4: FIX & VERIFY
- Write a failing test that reproduces the bug
- Fix the root cause (not the symptom)
- Verify the test passes
- Check that no other tests broke
- Document the fix in docs/LEARNINGS.md
```

## Research Synthesis (Research Projects)

```markdown
---
name: research-synthesis
description: Multi-source research gathering and structured synthesis
---

# Research Synthesis

## Process
1. **Search** — Use available tools to find 5-10 relevant sources
2. **Extract** — Pull key content from each source
3. **Analyze** — Use Sequential Thinking to:
   - Identify common findings across sources
   - Note contradictions or disagreements
   - Assess source quality and recency
4. **Synthesize** — Write structured output:
   - Key findings (with source citations)
   - Areas of consensus
   - Open questions / gaps in research
   - Confidence levels (HIGH/MEDIUM/LOW)
5. **Log** — Save sources to docs/SOURCES.md, findings to docs/LEARNINGS.md

## Output Format
Use this structure for summaries:
### [Topic]
**Finding:** [one sentence]
**Evidence:** [source1], [source2]
**Confidence:** HIGH/MEDIUM/LOW
**Notes:** [caveats, limitations]
```

## Code Review (Code Projects)

```markdown
---
name: code-review
description: Structured code review checklist
---

# Code Review

When reviewing code, check each category:

## 1. Security
- [ ] No hardcoded secrets or credentials
- [ ] Input validation on all user-facing endpoints
- [ ] No SQL injection vectors
- [ ] No XSS vectors in rendered content

## 2. Correctness
- [ ] Logic handles edge cases (null, empty, boundary)
- [ ] Error paths are handled (try/catch, error returns)
- [ ] Async operations have proper error handling
- [ ] No race conditions in concurrent code

## 3. Quality
- [ ] Functions are focused (single responsibility)
- [ ] Names are descriptive and consistent
- [ ] No dead code or commented-out blocks
- [ ] DRY — no copy-pasted logic

## 4. Testing
- [ ] New behavior has corresponding tests
- [ ] Tests cover happy path AND error cases
- [ ] Tests are deterministic (no flaky assertions)

Rate overall: APPROVE / REQUEST CHANGES / NEEDS DISCUSSION
```
