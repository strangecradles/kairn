# Kairn Evolve v2 — Status Report

## ✅ Completed

### 1. Full Single-File Implementation (849 lines)
- **File**: `~/Projects/kairn-v2/evolve-v2/run.py`
- **No external dependencies** beyond stdlib + Claude CLI
- Consolidated from previous multi-file architecture into single executable script

### 2. Task Suite (12 tasks, 58 checkpoints)
**Easy (2):** hello-api, csv-to-json  
**Medium (6):** fix-json-parser, sqlite-todo, log-analyzer, data-pipeline, config-validator, test-suite-repair  
**Hard (4):** concurrent-kv, regex-engine, diff-algorithm, expr-compiler

Each task has:
- Multi-checkpoint verification (4-5 checkpoints per task)
- Checkpoint weighting
- Baseline data files included

### 3. Baseline Evaluation
**Sonnet on 12 tasks:**
- Average score: 88.6/100
- Checkpoint pass rate: 92.5%
- Average turns: 6.1
- Results: `results/baseline_sonnet_init/results.json`

**Key findings:**
- hello-api improved to 97% (server startup now works)
- config-validator still at 78% (edge case in validation logic)
- regex-engine & diff-algorithm are bottleneck tasks (low turns, high variance)

### 4. Evolution Loop Architecture
**Phases:**
1. **Init**: Run baseline on all 12 tasks (establishes ground truth)
2. **Gen 1...N**: For each generation:
   - Select mini-batch (smart sampling by difficulty + canary tasks)
   - **Principal Agent**: LLM proposes 5 variants (exploit, explore, ablate, wild)
   - **Execute**: Run all variants in parallel
   - **Meta-Agent**: LLM analyzes results, selects best strategy
   - **Canary Check**: Revert if easy task pass rate drops below 50%

**Concurrency:** ThreadPoolExecutor runs variants in parallel (configurable workers)

### 5. Core Features
- ✅ Harness variant generation (principal agent via LLM)
- ✅ Parallel execution (ThreadPoolExecutor)
- ✅ Efficient JSON extraction (brace-depth counter, handles nested structures)
- ✅ VariantProposal dataclass with `claude_md` field
- ✅ Full checkpoint-based scoring
- ✅ Efficiency metrics (turns, tokens, cost)
- ✅ Self-reports from agents (what was confusing?)
- ✅ Detailed logging (evolve.log + results.json)
- ✅ Best harness tracking & save-on-improvement

### 6. Advanced Features
- `--dry-run`: Mock execution for testing pipeline (1 sec per gen)
- `--skip-init`: Reuse baseline results from previous run
- `--init-results`: Load specific baseline JSON
- `--generations`: Control evolution phases
- `--population`: Variants per generation
- `--batch-size`, `--num-hard-in-batch`, `--num-canary`: Task sampling
- `--parallel`: Concurrent worker count
- `--model`, `--meta-model`: Choose models (sonnet/opus)
- `--budget-per-task`: USD cap per Claude Code execution

## 🔄 In Progress
- **Real validation run** (Opus): Currently executing baseline on all 12 tasks
  - Completed: 10/12 tasks (hello-api through concurrent-kv)
  - In progress: regex-engine (12+ min), diff-algorithm
  - Estimated total time: 45-60 minutes for full baseline

## 📊 Pipeline Validation

### Dry-Run Test ✅ PASSED
```
python3 run.py --dry-run --generations 3 --population 3
→ 4 generations (init + 3) completed in <1 sec
→ Variants created, scored, meta-analyzed
→ Canary checks triggered revert (working correctly)
```

### Key Pipeline Tests ✅ WORKING
- ✅ Task setup with workspace + .claude/CLAUDE.md
- ✅ Claude Code invocation via CLI
- ✅ Checkpoint verification (bash commands)
- ✅ Principal agent LLM calls + JSON extraction
- ✅ Meta-agent analysis
- ✅ Parallel variant execution
- ✅ Results logging to JSON

## 🎯 Next Steps

### Immediate
1. **Wait for Sonnet baseline to finish** (regex-engine & diff-algorithm are slow)
2. **Run Opus baseline** to establish high-water mark
3. **Validate generation 1** with real Claude Code (principal proposes, variants tested)

### Longer-term
1. **Harness improvements**: Analyze principal agent proposals
   - What patterns emerge? (e.g., "add error handling", "simplify instructions")
   - Are variants actually different, or padding fallbacks?
2. **Efficiency optimization**: Target high-turn tasks
   - regex-engine: 11 turns (Sonnet) → target 5-6 with better harness
   - diff-algorithm: complex algorithm description → needs structural clarity
3. **Scaling**: Run 5-10 generations to see if harness converges
4. **Isara alignment**: Test with 2-5 agents doing the same task in parallel (coordination signal)

## 💾 File Structure
```
~/Projects/kairn-v2/evolve-v2/
├── run.py                          # Main (849 lines, self-contained)
├── RALPH-TASK.md                   # Debugging plan (completed)
├── STATUS.md                        # This file
├── results/
│   ├── baseline_sonnet_init/       # Sonnet init baseline (completed)
│   ├── real_validation/            # Opus baseline in progress
│   └── dry_run_test/               # Mock pipeline test (passed)
└── workspaces/                     # Temporary Claude Code workspaces
```

## 🚀 Commands

**Run 1 generation (minimal):**
```bash
python3 run.py --generations 1 --population 2 --batch-size 3 --model sonnet --budget-per-task 0.75
```

**Run 5 generations (real optimization):**
```bash
python3 run.py --generations 5 --population 5 --model opus --budget-per-task 2.0
```

**Test pipeline without Claude Code cost:**
```bash
python3 run.py --dry-run --generations 3 --population 3
```

**Reuse baseline, run gen 1 only:**
```bash
python3 run.py --generations 1 --skip-init --init-results results/baseline_sonnet_init/results.json
```

## 📈 Metrics to Track

| Metric | Current (Sonnet) | Target |
|--------|------------------|--------|
| Baseline avg | 88.6/100 | 90+/100 |
| Checkpoint pass % | 92.5% | 95%+ |
| Avg turns | 6.1 | 4-5 |
| Best variant improvement | TBD | +5-10% |
| Harness convergence | Untested | Gen 3-5 |

## 🔧 Known Limitations

1. **Regex-engine timeout**: Complex NFA generation task takes 12+ minutes on Sonnet
   - Likely because: Algorithm description too abstract
   - Solution: Add pseudocode or state machine hint
2. **Config-validator edge case**: Still 20% checkpoint fail (validation error detection)
3. **Principal agent sometimes returns padding**: When LLM JSON is malformed, fallback to baseline copies
   - Mitigation: Monitor proposal quality in results.json
