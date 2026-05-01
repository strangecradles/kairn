# PLAN v2.6.0 — Population-Based Harness Evolution

> **Thesis:** A single sequential evolution trajectory wastes wall-clock time exploring dead ends and overfits to its task sample. Population-Based Training (PBT) runs N independent trajectories with different task subsets, then a Meta-Principal synthesizes the best harness from all branches. Thompson Sampling replaces uniform task selection with uncertainty-driven exploration. KL regularization prevents harness bloat by penalizing complexity drift from baseline.

---

## Context

**Current state:** The evolve loop (`src/evolve/loop.ts`) runs a single sequential trajectory: evaluate → propose → mutate → re-evaluate. Mini-batch sampling (v2.5.2) randomly selects 5 of 12 tasks per middle iteration using a seeded shuffle. The exploration/exploitation schedule (`computeMutationCap()`) already decays mutation caps over iterations. There is no mechanism for parallel trajectories, no uncertainty-aware task selection, and no regularization to prevent harness bloat.

**Problems this solves:**

1. **Single-trajectory bottleneck:** If iteration 2 explores a dead end (e.g., adding verbose rules that help one task but hurt three others), the entire run wastes iterations 3-4 recovering. With 3 parallel branches, at least one branch avoids the dead end.

2. **Uniform sampling is wasteful:** Tasks with stable scores (95% ± 2%) provide no new information, but uniform random treats them equally to volatile tasks (45% ± 30%). Thompson Sampling allocates evaluation budget proportional to uncertainty — volatile tasks get sampled more often.

3. **Harness bloat:** The proposer adds rules, commands, and sections across iterations. Without regularization, the evolved harness grows monotonically. A CLAUDE.md that started at 80 lines can balloon to 300+ with redundant/contradictory instructions. KL regularization penalizes complexity, forcing the proposer to earn every addition.

**Key files:**
- `src/evolve/loop.ts` — the evolution loop (evaluate → propose → mutate cycle)
- `src/evolve/types.ts` — all type definitions
- `src/evolve/runner.ts` — task execution (spawnClaude, evaluateAll)
- `src/evolve/proposer.ts` — LLM-based mutation proposer
- `src/evolve/baseline.ts` — harness snapshot/copy utilities
- `src/commands/evolve.ts` — CLI commands and config parsing
- `.kairn-evolve/config.yaml` — evolution config

**RL concepts mapped:**

| Concept | RL Analogue | Implementation |
|---------|-------------|----------------|
| Thompson Sampling | Multi-armed bandit (Bayesian) | Beta distributions per task, sample proportional to uncertainty |
| KL Regularization | KL divergence penalty (PPO) | `effective_score = raw_score - λ * complexity_cost` |
| PBT branches | Population-Based Training (DeepMind) | N parallel evolve() calls with different seeds/configs |
| Meta-Principal | Ensemble distillation | Cross-branch synthesis of best mutations into final harness |

---

## Steps

### Step 1: Thompson Sampling for Task Selection
> Replace uniform random mini-batch sampling with uncertainty-driven selection. Tasks with volatile scores get sampled more often; stable tasks get sampled less.

**Create: `src/evolve/sampling.ts`**

```typescript
export interface TaskBelief {
  taskId: string;
  alpha: number;  // successes + 1 (Beta distribution parameter)
  beta: number;   // failures + 1 (Beta distribution parameter)
}

export function initBeliefs(tasks: Task[]): TaskBelief[];
export function sampleThompson(beliefs: TaskBelief[], sampleSize: number, rng: () => number): string[];
export function updateBeliefs(beliefs: TaskBelief[], results: Record<string, Score>): TaskBelief[];
export function loadBeliefs(workspacePath: string): Promise<TaskBelief[] | null>;
export function saveBeliefs(workspacePath: string, beliefs: TaskBelief[]): Promise<void>;
```

**Algorithm:**
1. Each task starts with `alpha=1, beta=1` (uniform prior — no information)
2. On each iteration, sample from each task's Beta(alpha, beta) distribution
3. Select top-K tasks by sampled value (high uncertainty → higher samples → more likely selected)
4. After evaluation: if score ≥ 70%, increment alpha (success). If < 70%, increment beta (failure)
5. Persist beliefs to `.kairn-evolve/task-beliefs.json` across iterations

**Modify: `src/evolve/loop.ts`**
- Replace the seeded shuffle block (lines 112-137) with Thompson Sampling call
- Load beliefs at loop start, save after each iteration
- Fall back to uniform random when `samplingStrategy: 'uniform'`

**Modify: `src/evolve/types.ts`**
- Add `TaskBelief` interface
- Add `samplingStrategy: 'thompson' | 'uniform'` to `EvolveConfig` (default: `'thompson'`)

**Modify: `src/commands/evolve.ts`**
- Add `--sampling <strategy>` CLI flag
- Parse `sampling_strategy` from config.yaml
- Wire into EvolveConfig

**Tests: `src/evolve/__tests__/sampling.test.ts`**
- `initBeliefs` creates uniform priors for all tasks
- `sampleThompson` with uniform priors approximates uniform random
- `sampleThompson` with skewed priors favors uncertain tasks
- `updateBeliefs` increments alpha on high scores, beta on low scores
- `sampleThompson` returns exactly sampleSize task IDs
- `sampleThompson` never returns duplicates
- Beliefs persist to disk and reload correctly
- With `samplingStrategy: 'uniform'`, Thompson is not used (backward compat)

**Acceptance:**
- `npm run build` passes
- `npm test` passes (all existing + new sampling tests)
- Thompson Sampling is the default when `evalSampleSize > 0`
- `--sampling uniform` restores v2.5.2 behavior exactly

**Commit:** `feat(evolve): add Thompson Sampling for uncertainty-driven task selection`

---

### Step 2: KL Regularization (Complexity Penalty)
> Penalize harness complexity drift from baseline, forcing the proposer to earn every addition. Prevents the CLAUDE.md bloat problem where evolved harnesses accumulate contradictory instructions.

**Create: `src/evolve/regularization.ts`**

```typescript
export interface ComplexityMetrics {
  totalLines: number;        // total lines across all harness files
  totalFiles: number;        // number of files in harness
  totalSections: number;     // number of ## sections in CLAUDE.md
  totalRules: number;        // number of files in rules/
  totalCommands: number;     // number of files in commands/
  diffFromBaseline: number;  // Levenshtein-like edit distance (normalized 0-1)
}

export function measureComplexity(harnessPath: string): Promise<ComplexityMetrics>;
export function computeComplexityCost(current: ComplexityMetrics, baseline: ComplexityMetrics): number;
export function applyKLPenalty(rawScore: number, complexityCost: number, lambda: number): number;
```

**Algorithm:**
1. At loop start, measure baseline complexity: `measureComplexity(baseline/harness)`
2. After each iteration's eval, measure current complexity: `measureComplexity(iterations/N/harness)`
3. Compute cost: `complexityCost = weightedDiff(current, baseline)` where:
   - Lines added beyond baseline: +0.3 per line (normalized)
   - Files added beyond baseline: +5.0 per file
   - Net diff: character-level diff ratio (0 = identical, 1 = completely rewritten)
4. Penalty: `effective_score = raw_score - λ * complexityCost * 100`
5. λ (klLambda) defaults to 0.1 — a 10% complexity increase costs 1 point

**Modify: `src/evolve/loop.ts`**
- Measure baseline complexity once at loop start
- After `evaluateAll`, compute complexity cost and apply penalty to aggregate
- Log both raw and penalized scores in `IterationLog`
- Use penalized score for best-iteration comparison and rollback decisions

**Modify: `src/evolve/types.ts`**
- Add `ComplexityMetrics` interface
- Add `klLambda: number` to `EvolveConfig` (default: `0.1`)
- Add `rawScore?: number` and `complexityCost?: number` to `IterationLog`

**Modify: `src/commands/evolve.ts`**
- Add `--kl-lambda <n>` CLI flag (default: 0.1, 0 = disabled)
- Parse `kl_lambda` from config.yaml
- Display penalized vs raw score in output

**Tests: `src/evolve/__tests__/regularization.test.ts`**
- `measureComplexity` counts lines, files, sections, rules, commands correctly
- `computeComplexityCost` returns 0 when current == baseline
- `computeComplexityCost` increases with added lines/files
- `applyKLPenalty` reduces score proportional to lambda × cost
- `applyKLPenalty` with lambda=0 returns raw score (disabled)
- Integration: loop uses penalized score for rollback decisions
- Harness that removes unnecessary rules gets a complexity bonus (negative cost)

**Acceptance:**
- `npm run build` passes
- `npm test` passes
- `--kl-lambda 0` disables regularization (backward compat)
- Default lambda=0.1 produces visible but not dominating penalty

**Commit:** `feat(evolve): add KL regularization to penalize harness complexity drift`

---

### Step 3: PBT Infrastructure (Population Manager)
> Run N independent evolution trajectories in parallel, each with its own workspace, Thompson Sampling seed, and iteration history. This is the infrastructure layer — Step 4 adds the synthesis.

**Create: `src/evolve/population.ts`**

```typescript
export interface BranchConfig {
  branchId: number;
  seed: number;              // RNG seed for Thompson Sampling
  workspacePath: string;     // .kairn-evolve/branches/{N}/
}

export interface BranchResult {
  branchId: number;
  result: EvolveResult;
  finalHarnessPath: string;
  beliefs: TaskBelief[];     // final Thompson beliefs from this branch
}

export interface PBTResult {
  branches: BranchResult[];
  synthesizedResult?: EvolveResult;  // after Meta-Principal (Step 4)
  bestBranch: number;
  bestScore: number;
}

export function initBranches(
  workspacePath: string,
  baselinePath: string,
  numBranches: number,
): Promise<BranchConfig[]>;

export async function runPopulation(
  workspacePath: string,
  tasks: Task[],
  kairnConfig: KairnConfig,
  evolveConfig: EvolveConfig,
  numBranches: number,
  onProgress?: (event: LoopProgressEvent & { branchId?: number }) => void,
): Promise<PBTResult>;
```

**Algorithm:**
1. `initBranches`: Create N workspace directories (`.kairn-evolve/branches/0/`, `.../1/`, `.../2/`)
2. Each branch gets: copy of baseline harness, tasks.yaml, config, unique RNG seed
3. `runPopulation`: Spawn N `evolve()` calls concurrently using `Promise.all`
4. Each branch runs the full loop independently (Thompson Sampling with its own beliefs, KL regularization, exploration schedule)
5. Collect results from all branches into `PBTResult`

**Modify: `src/commands/evolve.ts`**
- Add `kairn evolve pbt` subcommand:
  ```
  kairn evolve pbt [options]
    --branches <n>     Number of parallel branches (default: 3)
    --iterations <n>   Iterations per branch (default: 5)
    --parallel <n>     Tasks per branch (default: 2)
  ```
- Wire into `runPopulation()` call

**Modify: `src/evolve/types.ts`**
- Add `BranchConfig`, `BranchResult`, `PBTResult` interfaces
- Add `pbtBranches: number` to `EvolveConfig` (default: 3)

**Directory structure after PBT run:**
```
.kairn-evolve/
  branches/
    0/
      iterations/0/harness/  ...  iterations/4/harness/
      traces/0/ ... traces/4/
      task-beliefs.json
    1/
      iterations/0/harness/  ...  iterations/4/harness/
      traces/0/ ... traces/4/
      task-beliefs.json
    2/
      ...
  synthesis/           ← Step 4 writes here
```

**Tests: `src/evolve/__tests__/population.test.ts`**
- `initBranches` creates N directories with baseline copies
- `initBranches` assigns unique seeds to each branch
- `runPopulation` with mocked `evolve()` returns results from all branches
- `runPopulation` runs branches concurrently (timing test: N branches should take ~1x time, not Nx)
- `PBTResult.bestBranch` identifies the branch with highest score
- Branch workspaces are independent (mutations in branch 0 don't affect branch 1)

**Acceptance:**
- `npm run build` passes
- `npm test` passes
- `kairn evolve pbt --help` shows correct options
- Branches run concurrently (verified by timing or progress events)

**Commit:** `feat(evolve): add PBT infrastructure for parallel evolution branches`

---

### Step 4: Meta-Principal (Cross-Branch Synthesis)
> After all branches complete, a Meta-Principal LLM agent reads all branch results and synthesizes the optimal harness by cherry-picking the best mutations from each trajectory.

**Create: `src/evolve/synthesis.ts`**

```typescript
export interface SynthesisContext {
  branches: BranchResult[];
  tasks: Task[];
  baselineHarnessPath: string;
}

export function buildSynthesisPrompt(context: SynthesisContext): string;
export async function synthesizeBranches(
  context: SynthesisContext,
  kairnConfig: KairnConfig,
  evolveConfig: EvolveConfig,
): Promise<{ mutations: Mutation[]; reasoning: string }>;
export async function evaluateSynthesis(
  synthesisHarnessPath: string,
  tasks: Task[],
  workspacePath: string,
  kairnConfig: KairnConfig,
): Promise<{ results: Record<string, Score>; aggregate: number }>;
```

**Meta-Principal Prompt Design:**

The Meta-Principal gets a system prompt fundamentally different from the per-iteration proposer:

```
You are reviewing the COMPLETE results of {N} independent evolution runs.
Each branch explored different mutations and saw different task subsets.

Your job is SYNTHESIS, not iteration:
1. Identify mutations that helped across multiple branches (high-confidence wins)
2. Identify mutations that helped in one branch but weren't tested in others (potential wins)
3. Identify mutations that consistently hurt scores (high-confidence losses)
4. Resolve conflicts: if Branch 0 says "add verbose error rules" but Branch 2 says "remove verbose rules", use the per-task evidence to decide

Apply your selected mutations to the BASELINE harness (not any branch's final harness).
This ensures a clean synthesis — no accumulated branch-specific artifacts.
```

**Context fed to Meta-Principal:**
- All N branch iteration logs (proposals, score deltas, rollbacks)
- Per-task score matrices from each branch (task × iteration × score)
- Thompson Sampling beliefs from each branch (which tasks each branch found uncertain)
- Complexity metrics from each branch (KL costs)
- The baseline harness (what they all started from)

**Algorithm:**
1. Build synthesis prompt from all branch results
2. Call LLM with proposer model (Opus-tier for cross-branch reasoning)
3. Parse mutations from response
4. Apply mutations to a fresh copy of baseline harness → `synthesis/harness/`
5. Evaluate synthesized harness against ALL tasks (full suite, no sampling)
6. Compare synthesis score vs best individual branch score
7. If synthesis wins → it becomes the new best. If not → best branch wins.

**Modify: `src/evolve/population.ts`**
- After `runPopulation`, call `synthesizeBranches` and `evaluateSynthesis`
- Store synthesis results in `PBTResult.synthesizedResult`
- Update `bestBranch` / `bestScore` if synthesis beats all branches

**Modify: `src/commands/evolve.ts`**
- After PBT run completes, display synthesis results:
  ```
  ━━━ PBT RESULTS ━━━━━━━━━━━━━━━━━━━━━━━━━━
  Branch 0:  72.3%  (5 iterations)
  Branch 1:  68.9%  (5 iterations)
  Branch 2:  74.1%  (5 iterations)
  ──────────────────────────────────────────
  Meta-Principal: 81.2%  ← BEST
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ```
- `kairn evolve apply --pbt` copies synthesis harness (or best branch) to `.claude/`

**Tests: `src/evolve/__tests__/synthesis.test.ts`**
- `buildSynthesisPrompt` includes all branch iteration logs
- `buildSynthesisPrompt` includes per-task score matrices
- `buildSynthesisPrompt` includes Thompson beliefs from each branch
- `synthesizeBranches` with mocked LLM returns mutations + reasoning
- Synthesis mutations applied to baseline (not branch harness)
- If synthesis scores lower than best branch, best branch is selected
- If synthesis scores higher, it becomes the new best

**Acceptance:**
- `npm run build` passes
- `npm test` passes
- End-to-end PBT flow: branches → synthesis → evaluation → best selection
- Meta-Principal prompt includes cross-branch evidence

**Commit:** `feat(evolve): add Meta-Principal for cross-branch harness synthesis`

---

### Step 5: Integration, Config & CLI Polish
> Wire everything together, add config fields, update help text, add the `pbt` subcommand display.

**Modify: `.kairn-evolve/config.yaml`**
```yaml
model: claude-sonnet-4-6
proposer_model: claude-opus-4-6
scorer: pass-fail
max_iterations: 5
parallel_tasks: 2
eval_sample_size: 5
prune_threshold: 90
runs_per_task: 1
sampling_strategy: thompson    # NEW: 'thompson' or 'uniform'
kl_lambda: 0.1                 # NEW: 0 to disable
pbt_branches: 3                # NEW: number of parallel branches
```

**Modify: `src/commands/evolve.ts`**
- Default config updated with new fields
- `evolve run` uses Thompson Sampling + KL by default
- `evolve pbt` runs population-based training
- `evolve report` extended to show PBT results (branch comparison table)
- `evolve apply --pbt` applies best PBT result

**Tests: integration test**
- Full PBT flow with mocked `spawnClaude`: 3 branches × 3 iterations, synthesis, apply
- Verify branch isolation (mutations don't leak)
- Verify Meta-Principal is called with all branch data
- Verify best result is correctly selected

**Acceptance:**
- `npm run build` passes
- `npm test` passes
- `kairn evolve pbt --help` shows all options
- `kairn evolve run --help` shows `--sampling` and `--kl-lambda` flags
- Config parsing handles all new fields with backward-compatible defaults

**Commit:** `feat(evolve): wire PBT, Thompson Sampling, and KL into CLI`

---

## Execution Order

```
Step 1 (Thompson Sampling)
    │
    ├── Step 2 (KL Regularization)     ← independent of Step 1
    │
    ▼
Step 3 (PBT Infrastructure)           ← after Steps 1+2 (branches use both)
    │
    ▼
Step 4 (Meta-Principal)               ← after Step 3 (needs branch results)
    │
    ▼
Step 5 (Integration & CLI)            ← after all
```

Steps 1 and 2 are independent and can be done in parallel.
Steps 3-5 are sequential.

---

## Cost & Performance Estimates

**Single evolve run (current, v2.5.2):**
- ~35 task executions per run (12 + 5×3 + 12)
- 5 proposer LLM calls
- Wall time: ~15-30 min depending on task timeouts

**PBT with 3 branches (v2.6.0):**
- ~105 task executions (35 × 3 branches, running concurrently)
- 15 proposer calls + 1 Meta-Principal call
- 12 task executions for synthesis evaluation
- Wall time: ~15-30 min (branches run in parallel!) + ~5 min synthesis
- **Net: similar wall time, 3x the exploration**

**Cost reduction from Thompson Sampling:**
- Uncertain tasks sampled more → proposer gets higher-signal traces
- Stable tasks sampled less → fewer wasted evaluations
- Estimated 15-25% improvement in proposer mutation quality per iteration

**Cost reduction from KL Regularization:**
- Prevents harness bloat → fewer wasted tokens reading bloated CLAUDE.md
- Forces concise, high-signal mutations → faster convergence
- Estimated 10-20% fewer iterations to convergence

---

## Completion Criteria

- [ ] `src/evolve/sampling.ts` — Thompson Sampling with beta distributions
- [ ] `src/evolve/regularization.ts` — complexity measurement and KL penalty
- [ ] `src/evolve/population.ts` — PBT branch manager
- [ ] `src/evolve/synthesis.ts` — Meta-Principal cross-branch synthesis
- [ ] `EvolveConfig` extended with `samplingStrategy`, `klLambda`, `pbtBranches`
- [ ] `kairn evolve pbt` command with `--branches`, `--iterations`, `--parallel`
- [ ] `kairn evolve run` supports `--sampling` and `--kl-lambda`
- [ ] Thompson Sampling is default when `evalSampleSize > 0`
- [ ] KL regularization is default with `klLambda: 0.1`
- [ ] All new features backward-compatible (disable with flags/config)
- [ ] `npm run build` clean
- [ ] `npm test` all green (existing + new tests)
- [ ] Full integration test: PBT with 3 branches → synthesis → apply

---

## Ralph Loop Prompt

```
Read PLAN-v2.6.0.md. Execute steps 1-5 in order (Steps 1 and 2 can be parallel). For each step: implement the change, run npm run build && npx tsc --noEmit && npm test to verify. Commit after each step passes with conventional commit format. Step 5 integrates everything — verify the full PBT flow works with mocked spawnClaude before committing.
```
