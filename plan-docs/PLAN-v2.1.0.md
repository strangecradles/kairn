# PLAN-v2.1.0 — The Evolution Loop

> evaluate → diagnose → mutate → re-evaluate

## Overview

v2.1.0 adds three new modules (`proposer.ts`, `mutator.ts`, `loop.ts`) and updates `evolve run` CLI to support `--iterations N`. Existing types (Mutation, Proposal, Iteration, EvolveConfig) already cover most data structures needed.

## Steps

### Step 1 — Add IterationLog, EvolveResult, LoopProgressEvent types `[parallel-safe]`

**What:** Add types for iteration log entries, loop results, and progress events.
**Files:** `src/evolve/types.ts`
**Verification:** `npx tsc --noEmit`
**Commit:** `feat(evolve): add IterationLog, EvolveResult, and LoopProgressEvent types`

### Step 2 — Add evaluateAll batch runner `[parallel-safe]`

**What:** Batch function that runs all tasks against a harness, scores each, and returns aggregate.
**Files:** Modify `src/evolve/runner.ts`
**Verification:** `npx tsc --noEmit`
**Commit:** `feat(evolve): add evaluateAll batch runner for full iteration evaluation`

### Step 3 — Proposer agent `[parallel-safe]`

**What:** LLM agent that reads traces + harness, diagnoses failures, proposes Mutation[].
**Files:** Create `src/evolve/proposer.ts`
**Verification:** `npx tsc --noEmit`
**Commit:** `feat(evolve): add proposer agent for trace-based mutation diagnosis`

### Step 4 — Harness diff engine (mutator) `[parallel-safe]`

**What:** Apply Mutation[] to a harness copy, generate unified diff patch.
**Files:** Create `src/evolve/mutator.ts`
**Verification:** `npx tsc --noEmit`
**Commit:** `feat(evolve): add mutator for applying harness mutations with diff`

### Step 5 — Iteration log writer

**What:** Write/read iteration log files (scores.json, proposer_reasoning.md, mutation_diff.patch).
**Files:** Modify `src/evolve/trace.ts`
**Deps:** Step 1
**Verification:** `npx tsc --noEmit`
**Commit:** `feat(evolve): add iteration log write/read`

### Step 6 — Main evolution loop

**What:** evolve() orchestrating evaluate → rollback check → propose → mutate → log → advance.
**Files:** Create `src/evolve/loop.ts`
**Deps:** Steps 1-5
**Verification:** `npx tsc --noEmit`
**Commit:** `feat(evolve): add main evolution loop with rollback on regression`

### Step 7 — Wire CLI with --iterations flag and summary output

**What:** Add --iterations to evolve run, wire loop, display summary table.
**Files:** Modify `src/commands/evolve.ts`
**Deps:** Steps 2, 6
**Verification:** `npm run build`
**Commit:** `feat(evolve): wire evolution loop to CLI with --iterations flag`

### Step 8 — Tests for proposer, mutator, loop

**What:** Unit tests for all new modules.
**Files:** Create test files
**Deps:** Steps 3, 4, 6
**Verification:** `npm test`
**Commit:** `test(evolve): add tests for proposer, mutator, and loop modules`

### Step 9 — Integration verification

**What:** Full build + typecheck + test suite pass.
**Deps:** All
**Verification:** `npm run build && npx tsc --noEmit && npm test`
**Commit:** `feat(evolve): v2.1.0 evolution loop complete`

## Execution Phases

| Phase | Steps | Parallel? |
|-------|-------|-----------|
| A | 1, 2, 3, 4 | Yes |
| B | 5 | No (deps on 1) |
| C | 6 | No (deps on 1-5) |
| D | 7 | No (deps on 2, 6) |
| E | 8, 9 | Sequential |
