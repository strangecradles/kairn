# RALPH-TASK: Debug & Validate Evolve-v2 Full Loop

## Context
`run.py` is a single-file 849-line population-based harness optimization system. It:
1. Spawns Claude Code (`claude -p`) on coding tasks with a `.claude/CLAUDE.md` harness
2. Verifies results via shell checkpoint commands
3. Uses a "principal agent" (LLM call) to propose harness variants
4. Uses a "meta-agent" (LLM call) to analyze results
5. Runs variants in parallel via ThreadPoolExecutor

**The baseline init (gen 0) works.** Running `--generations 0` completes successfully.
**The evolution loop (gen 1+) has NOT been validated.** The last attempt was interrupted.

## Known Issues to Fix

### 1. `extract_json()` fragility (line 556-562)
The regex `\{[\s\S]*\}` is greedy — if the LLM response contains multiple JSON blocks or
nested braces in the claude_md content, it will grab too much or fail to parse.
**Fix:** Use a proper brace-depth counter or try parsing from the first `{` with incremental
json.loads attempts. Or strip markdown fences more carefully.

### 2. `_claude_md` stored as ad-hoc attribute (line 613)
`proposals[-1]._claude_md = md` uses a dynamic attribute on a dataclass, which is fragile.
**Fix:** Add `claude_md: str = ""` field to the `VariantProposal` dataclass.

### 3. `--generations 0` edge case (line 737)
When `--generations 0`, `range(1, 1)` is empty so the loop doesn't run. This works but
means the "DONE" message says "1 generations" (counting init). Minor but confusing.

### 4. Stale workspace cleanup
`run_task_full` does `shutil.rmtree(ws)` in finally block, but there's a leftover workspace
at `workspaces/ev_regex-engine_swpt2gp_/` from a previous interrupted run.
**Fix:** Clean workspaces dir on startup.

### 5. Old orphan files
These exist from a previous multi-file architecture and are NOT used by run.py:
- `orchestrator/` directory (sampling.py, agents.py, population.py, runner.py, __init__.py)
- `tasks/` directory (definitions.py, __init__.py)
- `__init__.py` in evolve-v2 root
**Fix:** Delete them all.

### 6. `call_llm` system prompt may be too long for `--system-prompt` CLI arg
The PRINCIPAL_SYSTEM prompt is 578 chars. Claude CLI `--system-prompt` takes a string arg.
This should work, but verify it doesn't get truncated by the shell.
**Fix:** If issues, write system prompt to a temp file and pass differently.

## Task: Get Full Loop Running

### Step 1: Clean up
- Delete orphan files (orchestrator/, tasks/, __init__.py)
- Clean workspaces/ dir
- Add `claude_md` field to `VariantProposal` dataclass

### Step 2: Fix `extract_json()`
Replace the greedy regex with a robust JSON extractor that handles:
- Nested braces in claude_md content
- Multiple JSON blocks in response
- Markdown code fences

### Step 3: Add `--skip-init` flag
Allow reusing baseline results from a previous run to skip the expensive init phase.
Load from `--init-results path/to/results.json`.

### Step 4: Add a `--dry-run` mode
Instead of actually calling Claude Code, use mock results for testing the pipeline.
Should exercise: principal → variant creation → (mock) execution → meta-agent → scoring → next gen.

### Step 5: Validate with dry-run
Run `python run.py --dry-run --generations 3 --population 3` and verify:
- 3 generations complete
- Each generation: principal proposes variants, they get scored, meta-agent analyzes
- Best variant updates correctly
- Results JSON has all 4 generations (init + 3)
- No crashes

### Step 6: Validate with real Claude Code (1 gen, 2 variants, 2 tasks)
Run: `python run.py --generations 1 --population 2 --batch-size 2 --model sonnet --budget-per-task 0.75 --parallel 2 --results-dir results/validation_run`
Verify the full loop completes end-to-end.

## Constraints
- Keep everything in `run.py` (single file)
- Use python3 (system python is 3.9 on this machine)
- Claude Code CLI is available as `claude` in PATH
- Don't change task definitions or checkpoint commands
- The baseline results from `results/baseline_sonnet_init/results.json` can be reused

## Success Criteria
- `python run.py --dry-run --generations 3` completes without errors
- `python run.py --generations 1 --population 2 --batch-size 2 --model sonnet` completes a full loop
- Results JSON contains generation 0 (init) + generation 1 with variant scores
- Principal agent produces non-padding proposals
- Meta-agent returns analysis
