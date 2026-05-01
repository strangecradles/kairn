# PLAN v2.13.0 — Principal-as-Architect (Creative Evolution)

**Status:** Ready for implementation  
**Design doc:** `docs/design/v2.13-principal-architect.md`  
**ROADMAP:** See `ROADMAP.md` → v2.13.0 section  
**Branch:** `feature/v2.13.0-principal-architect`

---

## Overview

The current evolution proposer is reactive and conservative: max 3 mutations, each tied to a specific trace failure. v2.13.0 adds three capabilities:

1. **Architect proposer** — exploration-mode proposer with different system prompt, higher mutation budget (up to 10), speculative rationale. Runs on configurable schedule interleaved with reactive proposer.
2. **Knowledge base** — persistent pattern storage at `~/.kairn/knowledge/` that accumulates discoveries across evolve runs. Both proposer and architect read it before proposing.
3. **Research protocol** — `kairn evolve research` command that clones N repos, runs evolve on each, identifies convergent mutation patterns.

---

## Step 1: Types and schedule types [parallel-safe]

**Files:** `src/evolve/types.ts` (modify)

Add to `EvolveConfig`: `architectEvery`, `schedule`, `architectModel` fields.
Add `ArchitectProposal` extending `Proposal` with `structural: boolean` and `source: 'architect'`.
Add `KnowledgePattern` type with evidence, mutation, and metadata fields.
Add `ResearchConfig` and `ResearchReport` types.
Extend `LoopProgressEvent.type` with architect events.
Add `source?: 'reactive' | 'architect'` to `IterationLog`.

**Verification:** `npm run typecheck`
**Commit:** `feat(evolve): add architect, knowledge, and research types`

---

## Step 2: Schedule module [parallel-safe]

**Files:** `src/evolve/schedule.ts` (create)

Export `shouldUseArchitect(iteration, maxIterations, schedule, architectEvery, recentScores?)` and `computeArchitectMutationBudget(iteration, maxIterations)`.

Three strategies:
- `constant`: architect every Nth iteration
- `explore-exploit`: architect on iterations 1-2 and every Nth after, skip last
- `adaptive`: architect when scores plateau (no improvement in 2+ iterations)

**Verification:** `npm run typecheck`
**Commit:** `feat(evolve): schedule module for architect/reactive iteration interleaving`

---

## Step 3: Architect proposer [parallel-safe]

**Files:** `src/evolve/architect.ts` (create)

Export `proposeArchitecture()` — same pattern as `propose()` from `proposer.ts`:
1. Read harness files, load iteration traces
2. Build user message with evolution summary, knowledge context, "what's working" section
3. Call LLM with `ARCHITECT_SYSTEM_PROMPT` (exploration-oriented, 10-mutation budget)
4. Parse with `parseProposerResponse()` (reuse), wrap as `ArchitectProposal`

Token budget: `maxTokens: 16384` (double the proposer's 8192).

**Verification:** `npm run typecheck`
**Commit:** `feat(evolve): architect proposer with exploration system prompt`

---

## Step 4: Knowledge base module [parallel-safe]

**Files:** `src/evolve/knowledge.ts` (create)

Persistent storage at `~/.kairn/knowledge/patterns.jsonl` (JSONL format).

Exports:
- `loadKnowledgeBase(filter?)` — read all patterns
- `savePattern(pattern)` — append to JSONL
- `extractAndSavePatterns(history, projectName, language)` — extract accepted mutations as patterns
- `formatKnowledgeForProposer(patterns, language, maxPatterns?)` — top-N relevant patterns
- `formatKnowledgeForArchitect(patterns, language)` — all patterns including failed experiments
- `saveProjectHistory(projectName, summary)` — per-project summary
- `loadConvergence()` / `saveConvergence()` — cross-repo convergence data

**Verification:** `npm run typecheck`
**Commit:** `feat(evolve): persistent knowledge base for cross-run pattern learning`

---

## Step 5: Staging gate in evolve loop

**Files:** `src/evolve/loop.ts` (modify)
**Dependencies:** Steps 1, 2, 3

When `shouldUseArchitect()` returns true:
1. Call `proposeArchitecture()`
2. Apply mutations to staging copy of current best harness
3. Evaluate staging on full task suite (no pruning, no sampling)
4. Accept if staging score >= current best; reject otherwise
5. Log result regardless of acceptance
6. Emit progress events: `architect-start`, `architect-staging`, `architect-accepted`/`architect-rejected`

**Verification:** `npm run typecheck && npm test`
**Commit:** `feat(evolve): architect staging gate with full-suite evaluation`

---

## Step 6: CLI wiring

**Files:** `src/commands/evolve.ts` (modify)
**Dependencies:** Steps 1, 5

Add CLI flags to `evolve run`: `--architect-every <n>`, `--schedule <type>`, `--architect-model <model>`.
Update `DEFAULT_CONFIG` with new fields.
Add progress event handlers for architect events (magenta for start, green for accepted, yellow for rejected).

**Verification:** `npm run build && node dist/cli.js evolve run --help`
**Commit:** `feat(evolve): wire architect CLI flags`

---

## Step 7: Knowledge integration in proposer + architect

**Files:** `src/evolve/proposer.ts`, `src/evolve/architect.ts`, `src/evolve/loop.ts` (modify)
**Dependencies:** Steps 3, 4, 5

- `propose()`: load knowledge base, format for proposer context, inject into user message
- `proposeArchitecture()`: load knowledge base, format for architect context (includes failed experiments)
- `evolve()`: after loop completes, extract and save patterns from history

**Verification:** `npm run typecheck && npm test`
**Commit:** `feat(evolve): knowledge base integration in proposer and architect`

---

## Step 8: Research protocol [parallel-safe after Step 4]

**Files:** `src/evolve/research.ts` (create)
**Dependencies:** Steps 1, 4

Export `runResearch()`, `analyzeConvergence()`, `formatResearchReport()`.

Flow: clone repos → run evolve on each → collect patterns → convergence analysis → save to knowledge base → generate Markdown report.

**Verification:** `npm run typecheck`
**Commit:** `feat(evolve): cross-repo research protocol with convergence analysis`

---

## Step 9: Research CLI

**Files:** `src/commands/evolve.ts` (modify)
**Dependencies:** Steps 6, 8

Add `kairn evolve research` subcommand with `--repos`, `--iterations`, `--threshold`, `--output` options.

**Verification:** `npm run build && node dist/cli.js evolve research --help`
**Commit:** `feat(evolve): wire kairn evolve research CLI subcommand`

---

## Step 10-14: Tests [parallel-safe within wave]

- **Step 10:** `src/evolve/__tests__/architect.test.ts` — architect proposer tests
- **Step 11:** `src/evolve/__tests__/schedule.test.ts` — schedule module tests
- **Step 12:** `src/evolve/__tests__/knowledge.test.ts` — knowledge base tests
- **Step 13:** `src/evolve/__tests__/loop.test.ts` — architect integration tests
- **Step 14:** `src/evolve/__tests__/research.test.ts` — research protocol tests

**Commit:** `test(evolve): architect, schedule, knowledge, and research tests`

---

## Step 15: Report updates + finalize

**Files:** `src/evolve/report.ts` (modify)
**Dependencies:** Steps 5, 6

Add architect/reactive mode column to Markdown report. Show architect iteration details. Update JSON report with mode field.

Final verification: build, typecheck, lint, all tests pass, CLI help correct.

**Commit:** `chore: v2.13.0 finalization`

---

## Parallelism Map

```
Wave 1 (independent):  Steps 1, 2, 3, 4
Wave 2 (depends on 1): Steps 5, 8, 10, 11, 12
Wave 3 (depends on 2): Steps 6, 7, 9, 13, 14, 15
Wave 4 (all):          Step 16 (final wiring)
```
