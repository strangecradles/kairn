# PLAN v2.4.0 — Intelligent Evolution (RL-inspired)

> **Thesis:** The evolution loop optimizes naively — each iteration's proposer only sees local context. These features make it behave like a proper optimizer: a principal meta-learner synthesizes the entire run's learnings, exploration decays into exploitation, eval sampling adds regularization, and experience replay enables cross-run learning.

---

## Context

**Current state (v2.3.0):** Loop works with parallel eval, variance controls, adaptive pruning, optimization controls (mutation cap, loss-weighted focus, pruning threshold, per-task guard), rollback-with-reproposal, harness-sensitive evals, blind proposer with anti-gaming, failure taxonomy, confidence intervals in reports, cost estimation, and OAuth auth.

**What's missing:**
- The proposer is myopic — it sees one iteration's traces, not the full trajectory
- No learning across runs — each `evolve run` starts from scratch
- All evals run every iteration (on non-pruned iterations) — no sampling
- Mutation aggressiveness is static — same cap throughout the run

**Key files:**
- `src/evolve/loop.ts` — main evolution loop (principal proposer, exploration schedule)
- `src/evolve/proposer.ts` — `propose()`, `buildProposerUserMessage()` (experience replay context)
- `src/evolve/types.ts` — `EvolveConfig` (new fields), `IterationLog`
- `src/commands/evolve.ts` — CLI flags
- `.kairn-evolve/proposer-memory.json` — new file for experience replay

---

## Steps

### Step 1: Principal Proposer (meta-learner)
> After the normal iterations complete, a separate "Principal" LLM call reads the entire run's history and synthesizes the optimal harness.

**New function in `src/evolve/loop.ts`:**

```typescript
async function proposePrincipal(
  workspacePath: string,
  history: IterationLog[],
  tasks: Task[],
  kairnConfig: KairnConfig,
  evolveConfig: EvolveConfig,
): Promise<Proposal>
```

**Behavior:**
1. After the normal loop completes, check if `evolveConfig.usePrincipal` is true
2. Build a special prompt with ALL iteration logs: proposals, diffs, score deltas, rollback reasons
3. System prompt: "You are the Principal — you've observed the entire evolution run. Synthesize the best harness by cherry-picking winning mutations and avoiding regressions."
4. Apply the Principal's mutations to the BASELINE harness (not the best iteration — start fresh)
5. Evaluate as a final iteration with all tasks and all runs
6. If it beats the best iteration, it becomes the new best

**CLI:** `--principal` flag (default: off for now, opt-in)

**Tests:**
- Principal is called after normal loop completes
- Principal sees all iteration history
- Principal's harness is evaluated as final iteration
- Principal disabled by default (backward compatible)

**Acceptance:** `npm run build` passes, `npm test` passes, `--principal` flag works.

---

### Step 2: Exploration/exploitation schedule
> Early iterations should be bold (more mutations, exploring). Late iterations should be conservative (fewer mutations, refining).

**Modify:** `src/evolve/loop.ts`

Instead of static `maxMutationsPerIteration`, compute a dynamic cap based on iteration progress:
- First 40% of iterations: cap = maxMutationsPerIteration (exploration phase)
- Last 60%: cap linearly decays to 1 (exploitation phase)
- Formula: `cap = max(1, round(maxMutations * (1 - progress * 0.7)))` where progress = iter / maxIterations

**Modify:** `src/evolve/types.ts` — No new config fields needed (uses existing maxMutationsPerIteration as the ceiling)

**Tests:**
- Early iterations get full mutation cap
- Late iterations get reduced cap (minimum 1)
- Schedule is deterministic based on iteration number

**Acceptance:** `npm run build` passes, `npm test` passes.

---

### Step 3: Experience replay (cross-run learning)
> Persist what worked/failed across runs. The proposer reads history before proposing.

**New file:** `src/evolve/memory.ts`

```typescript
export interface RunSummary {
  timestamp: string;
  baselineScore: number;
  bestScore: number;
  improvement: number;
  effectiveMutations: string[];   // mutations that helped
  regressiveMutations: string[];  // mutations that caused rollback
  insights: string;               // proposer's meta-observation
}

export async function loadProposerMemory(workspacePath: string): Promise<RunSummary[]>
export async function saveRunSummary(workspacePath: string, summary: RunSummary): Promise<void>
```

**Behavior:**
1. At the end of each `evolve run`, summarize what worked and what didn't
2. Save to `.kairn-evolve/proposer-memory.json` (append, keep last 10 runs)
3. On next run, proposer reads the memory and includes it in its context
4. Memory entries are concise summaries, not full logs

**Modify:** `src/evolve/proposer.ts` — `buildProposerUserMessage()` includes memory section

**Modify:** `src/evolve/loop.ts` — After loop completes, save run summary

**Tests:**
- Memory file created after run
- Memory loaded and included in proposer context
- Memory limited to last 10 entries
- First run works with no existing memory

**Acceptance:** `npm run build` passes, `npm test` passes.

---

### Step 4: Mini-batch eval sampling
> Sample K tasks from the pool each iteration instead of running all. Different subsets cycle through.

**Modify:** `src/evolve/loop.ts`

When `evolveConfig.evalSampleSize` is set (default: 0 = all tasks):
1. First iteration: run all tasks (need baseline for everything)
2. Middle iterations: randomly sample K tasks, carry forward previous scores for unsampled tasks
3. Last iteration: run all tasks (final regression check)
4. Sampling is seeded by iteration number for reproducibility

**Modify:** `src/evolve/types.ts` — Add `evalSampleSize: number` to EvolveConfig (default: 0)

**CLI:** `--eval-sample <n>` flag

**Tests:**
- Sample size 3 with 5 tasks: only 3 tasks run on middle iterations
- First and last iterations run all tasks
- Sampling is reproducible (same seed = same subset)
- Sample size 0 or >= task count: all tasks run (backward compatible)

**Acceptance:** `npm run build` passes, `npm test` passes.

---

## Execution Order

```
Step 1 (Principal)  → Step 2 (Schedule) → Step 3 (Memory) → Step 4 (Sampling)
   [meta-learner]      [decay]              [persistence]     [regularization]
```

Steps 1 and 2 are independent. Step 3 is independent. Step 4 is independent.
All can be built in parallel from main.

---

## Completion Criteria

- [ ] `--principal` flag: Principal proposer synthesizes best harness at end of run
- [ ] Exploration/exploitation: mutation cap decays from max to 1 over the run
- [ ] Experience replay: proposer memory persists across runs, last 10 entries
- [ ] Mini-batch sampling: `--eval-sample N` samples K tasks per iteration
- [ ] `npm run build` clean, `npm test` all green
- [ ] Version bumped to 2.4.0
- [ ] ROADMAP.md updated

---

## Ralph Loop Prompt

```
/ralph Read PLAN-v2.4.0.md. Execute steps 1-4 in order. For each step: write failing tests first (RED), implement until tests pass (GREEN), then clean up (REFACTOR). Run npm run build and npm test after each step. Commit after each step passes. Create a feature branch and PR per step for user approval. --max-iterations 20 --no-deslop --completion-promise 'Steps 1-4 complete: principal proposer works, exploration schedule works, experience replay works, mini-batch sampling works'
```
