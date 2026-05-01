# PLAN v2.15.0 — Context Enrichment & IR Persistence

## Problem Statement

The analyzer (v2.14.0) extracts 60K tokens of intelligently-sampled source code via Repomix, feeds it to an LLM, and gets back a ~1K-token ProjectAnalysis. That 1K summary is **all** the downstream compilation agents see. The 60K tokens of actual code are discarded.

Meanwhile, the evolve loop's proposer and architect operate completely blind to the project — they see harness files, traces, and history, but have never seen the source code, the ProjectAnalysis, or the structured IR. They're optimizing a harness for a project they've never seen.

The IR itself is ephemeral — created during mutation application, used for ~100ms, then garbage collected. It's never persisted or passed to any agent.

## Root Cause Analysis

```
COMPILATION PIPELINE:
  ✅ Repomix sampling       — intelligent, priority-tiered, framework-aware (60K tokens)
  ✅ Analyzer                — produces good ProjectAnalysis from sampled code
  ❌ Intent builder          — discards 60K tokens, passes only ~1K summary
  ❌ Compilation agents      — starved: ~2K tokens of context each

EVOLVE LOOP:
  ✅ Proposer system prompt  — well-designed, anti-gaming, causal analysis
  ✅ Architect scheduling    — interleaved reactive + structural, exploration/exploitation
  ❌ Proposer context        — no source code, no ProjectAnalysis, no IR
  ❌ Architect context       — same blind spot
  ❌ IR persistence          — ephemeral, rebuilt from files every iteration
  ❌ Eval quality            — 100% harness-sensitivity probes, 0% substantive tasks
```

## Architecture

### Data Flow (After)

```
                    ┌──────────────────┐
                    │   Repomix Pack   │
                    │   (60K tokens)   │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │    Analyzer LLM  │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
    ┌─────────▼────┐  ┌─────▼──────┐  ┌───▼────────────┐
    │ ProjectAnaly │  │  Packed     │  │ .kairn/        │
    │ sis (1K)     │  │  Source     │  │ analysis.json  │
    │ (structured) │  │  (60K raw)  │  │ packed-src.txt │
    └──────┬───────┘  └──────┬──────┘  └───┬────────────┘
           │                 │             │ (both cached)
           └────────┬────────┘             │
                    │                      │
    ┌───────────────▼──────────────────┐   │
    │        COMPILATION PIPELINE      │   │
    │                                  │   │
    │  buildOptimizeIntent() now gets: │   │
    │  • Profile summary     (~500)    │   │
    │  • ProjectAnalysis     (~1K)     │   │
    │  • Packed source code  (~60K)    │   │
    │  • Task instructions   (~500)    │   │
    │                                  │   │
    │  Total: ~62K tokens              │   │
    └──────────────┬───────────────────┘   │
                   │                       │
    ┌──────────────▼──────────────────┐    │
    │         HarnessIR               │    │
    │  → persisted to harness-ir.json │    │
    └──────────────┬──────────────────┘    │
                   │                       │
    ┌──────────────▼──────────────────┐    │
    │         EVOLVE LOOP             │    │
    │                                 │    │
    │  Proposer/Architect now gets:   │◄───┘
    │  • Harness files     (current)  │
    │  • HarnessIR summary (NEW)      │
    │  • ProjectAnalysis   (NEW)      │
    │  • Key source files  (NEW, ~10K)│
    │  • Traces            (current)  │
    │  • History           (current)  │
    │  • Knowledge base    (current)  │
    │                                 │
    │  Proposer output: unchanged     │
    │  (file-level mutations)         │
    │                                 │
    │  After mutation application:    │
    │  → IR persisted to              │
    │    iterations/N/harness-ir.json │
    └─────────────────────────────────┘
```

## Implementation Steps

### Phase 1: Cache packed source (no behavior change)

**Step 1: Persist packed source during analysis**

Files: `src/analyzer/analyze.ts`, `src/analyzer/cache.ts`

1. After `packCodebase()` returns, write `packed.content` to `.kairn/packed-source.txt`
2. Update `readCache()` to also return packed source path if available
3. Update `writeCache()` to save packed source alongside analysis
4. When cache is valid AND packed source exists, skip Repomix entirely

Tests: `src/analyzer/__tests__/cache.test.ts` — verify packed source is cached and restored
Commit: `feat(analyzer): cache packed source code alongside analysis`

### Phase 2: Enrich compilation intent (biggest quality impact)

**Step 2: Pass packed source through to compilation agents**

Files: `src/commands/optimize.ts`, `src/compiler/compile.ts`, `src/compiler/agents/sections-writer.ts`

1. `buildOptimizeIntent()` gains third parameter: `packedSource?: string`
2. When provided, append `\n## Sampled Source Code (reference for project-specific content)\n\n${packedSource}` to intent
3. Update `compile()` to pass enriched intent to all agents
4. Update `sections-writer.buildUserMessage()` to include intent (already does — intent flows through)
5. No changes to other agents needed — they all receive `intent` from `dispatchAgent()`

Tests: `src/analyzer/__tests__/integration.test.ts` — verify enriched intent contains source code section
Commit: `feat(optimize): pass packed source code through to compilation agents`

**Step 3: Return packed source from analyzeProject()**

Files: `src/analyzer/analyze.ts`, `src/analyzer/types.ts`, `src/commands/optimize.ts`

1. `analyzeProject()` returns `{ analysis: ProjectAnalysis, packedSource: string }` (or add `packedSource` to return)
2. `optimizeCommand` handler receives both analysis and packed source
3. Passes both to `buildOptimizeIntent(profile, analysis, packedSource)`
4. `kairn analyze` command optionally displays packed source stats (file count, token count)

Tests: Verify `analyzeProject()` returns packed source alongside analysis
Commit: `feat(analyzer): return packed source alongside ProjectAnalysis`

### Phase 3: Persist HarnessIR

**Step 4: Serialize IR after compilation**

Files: `src/commands/optimize.ts`, `src/commands/describe.ts`

1. After `compile()` returns `HarnessIR`, write it to `.kairn/harness-ir.json`
2. `JSON.stringify(ir, null, 2)` — human-readable, diffable
3. `.kairn/` directory created alongside `.claude/` on first compile

Tests: Verify `.kairn/harness-ir.json` exists after `kairn optimize`
Commit: `feat(compile): persist HarnessIR to .kairn/harness-ir.json`

**Step 5: Serialize IR after each evolve mutation**

Files: `src/evolve/mutator.ts`

1. In `applyMutationsViaIR()`, after applying all mutations and rendering files:
   ```typescript
   // Persist the new IR for downstream consumers
   await fs.writeFile(
     path.join(newHarnessPath, '..', 'harness-ir.json'),
     JSON.stringify(currentIR, null, 2),
   );
   ```
2. Existing IR computation is unchanged — this is one additional `writeFile` call

Tests: `src/evolve/__tests__/mutator.test.ts` — verify `harness-ir.json` written
Commit: `feat(evolve): persist HarnessIR after mutation application`

### Phase 4: Enrich evolve proposer context

**Step 6: Build IR summary for proposer**

Files: `src/evolve/proposer.ts` (new helper function)

1. Create `buildIRSummary(ir: HarnessIR): string` function:
   ```
   ## Harness Structure (IR)
   Sections (6): purpose, tech-stack, architecture, commands, conventions, verification
   Commands (4): build (Bash(npm*)), test, develop, sprint
   Rules (2): security (**/*), docker-practices (Dockerfile*)
   Agents (3): architect, implementer, reviewer
   MCP Servers (2): context7, sequential-thinking
   Settings: statusLine=enabled, denyPatterns=5, hooks=3
   ```
2. ~200-500 tokens — compact structural overview

Tests: Unit test with mock IR
Commit: `feat(evolve): IR summary builder for proposer context`

**Step 7: Inject ProjectAnalysis + IR + source into proposer**

Files: `src/evolve/proposer.ts`, `src/evolve/loop.ts`

1. Add `projectContext` parameter to `buildProposerUserMessage()`:
   ```typescript
   projectContext?: {
     analysis: ProjectAnalysis;
     irSummary: string;
     keySourceFiles?: string;
   }
   ```
2. Insert after harness files section, before traces:
   ```
   ## Project Understanding
   ${analysis summary}
   
   ## Harness Structure
   ${irSummary}
   
   ## Key Source Files (for reference)
   ${keySourceFiles}
   ```
3. Budget: ProjectAnalysis (~1K) + IR summary (~300) + key source (~10K) = ~11.3K chars
   Current budget: 100K chars. After: ~88.7K for harness + traces + history. Plenty.

4. In `loop.ts`, load analysis from `.kairn/analysis.json` and packed source from `.kairn/packed-source.txt` once at loop start
5. Build key source subset: read packed source, keep only Tier 0 (IDENTITY) and Tier 1 (ENTRY) files (~10K)
6. Parse current IR from `harness-ir.json` if available, build summary
7. Pass `projectContext` to `propose()` and `proposeArchitecture()`

Tests: Verify proposer user message includes project context sections
Commit: `feat(evolve): inject project context into proposer and architect`

**Step 8: Same enrichment for architect**

Files: `src/evolve/architect.ts`

1. Add same `projectContext` parameter to `buildArchitectUserMessage()`
2. Insert at same position (after harness, before traces)
3. Architect uses 50/50 trace/history split; project context is in the fixed (never-truncated) section

Tests: Verify architect user message includes project context
Commit: `feat(evolve): inject project context into architect proposer`

### Phase 5: SWE-bench-style evaluations

**Step 9: New eval templates**

Files: `src/evolve/templates.ts`

1. Add `real-bug-fix` template:
   - Injects a known bug into a source file (e.g., swap two variable names, remove an import, introduce off-by-one)
   - Task description mimics a GitHub issue: "When X happens, Y is broken"
   - Scorer: runs test suite (or checks the specific file was fixed correctly)

2. Add `real-feature-add` template:
   - Describes a small feature with clear acceptance criteria
   - E.g., "Add a `--verbose` flag to the CLI that prints debug output"
   - Scorer: checks feature exists, tests pass, no regressions

3. Add `codebase-question` template:
   - Asks a factual question about the codebase
   - E.g., "What function handles authentication?" or "What environment variables does this project need?"
   - Scorer: LLM-as-judge checks answer accuracy against known-correct answer

Tests: Verify templates produce valid task definitions
Commit: `feat(evolve): SWE-bench-style eval templates (real-bug-fix, real-feature-add, codebase-question)`

**Step 10: Analysis-aware task generation**

Files: `src/evolve/init.ts`

1. Update `kairn evolve init` to read `.kairn/analysis.json` if available
2. Use ProjectAnalysis to generate domain-specific tasks:
   - `real-bug-fix` tasks that reference actual modules
   - `codebase-question` tasks about actual workflows
   - `real-feature-add` tasks that extend actual functionality
3. Mix: 50% harness-sensitivity (existing templates), 50% substantive (new templates)
4. If no analysis available, fall back to existing template menu

Tests: Verify generated tasks reference actual project modules
Commit: `feat(evolve): analysis-aware task generation with mixed eval suite`

**Step 11: Score breakdown in reports**

Files: `src/evolve/report.ts`

1. Tag tasks with `category: 'harness-sensitivity' | 'substantive'` in tasks.yaml
2. `kairn evolve report` shows separate aggregates:
   ```
   Overall:            72.5%
   Harness adherence:  85.0% (6 tasks)
   Substantive tasks:  60.0% (6 tasks)
   ```
3. This reveals whether the evolve loop is optimizing for real work or just gaming harness probes

Tests: Verify report shows split scores
Commit: `feat(evolve): score breakdown by task category in evolve report`

### Phase 6: Finalization

**Step 12: Build, test, release**

1. `npm run build` — must succeed
2. `npx vitest run` — all tests pass
3. Update CHANGELOG.md with v2.15.0 entry
4. Update ROADMAP.md checkboxes
5. `node dist/cli.js --help` — verify commands
6. `git log --oneline -15` — verify commit history
7. Bump version to 2.15.0 in package.json

Commit: `chore: v2.15.0 finalization`

## Budget & Token Analysis

### Compilation pipeline (after changes)
| Component | Before | After |
|-----------|--------|-------|
| Profile summary | ~500 tokens | ~500 tokens |
| ProjectAnalysis | ~1K tokens | ~1K tokens |
| Packed source | 0 tokens | ~60K tokens |
| Task instructions | ~500 tokens | ~500 tokens |
| **Total per agent** | **~2K** | **~62K** |
| Model context limit | 200K | 200K |
| Headroom | 198K wasted | 138K available |

Cost impact: ~$0.18/compile (60K input at Sonnet pricing) — already paid by analyzer, now amortized to compilation agents.

### Evolve proposer (after changes)
| Component | Before | After |
|-----------|--------|-------|
| Harness files | varies (never truncated) | unchanged |
| Task definitions | varies (never truncated) | unchanged |
| ProjectAnalysis | 0 | ~1K tokens |
| IR summary | 0 | ~300 tokens |
| Key source files | 0 | ~10K tokens |
| Traces | 70% remaining | 70% remaining (smaller pool, but sufficient) |
| History | 30% remaining | 30% remaining |
| **Budget** | **100K chars** | **100K chars (unchanged)** |
| **New fixed content** | — | **~11.3K chars** |

## Key Constraints

- **Backward compatible**: `kairn describe` works exactly as before. `kairn optimize` without analysis cache still works.
- **No proposer output changes**: Proposer still emits file-level mutations. Translation layer unchanged.
- **Budget-safe**: All new context fits within existing limits.
- **TDD mandatory**: RED → GREEN → REFACTOR for every step.
- **Strict TypeScript**: no `any`, no `ts-ignore`, `.js` extensions on imports.

## Success Criteria

1. `kairn optimize` on inferix (Python ML project) → generated CLAUDE.md references actual modules, functions, and deployment patterns — not generic placeholders
2. `kairn evolve` proposer can reference specific source code patterns when diagnosing failures
3. `harness-ir.json` persisted after every evolve iteration
4. `.kairn/packed-source.txt` cached and reused on subsequent runs
5. `kairn evolve init` generates mixed eval suite with domain-specific substantive tasks
6. `kairn evolve report` shows separate harness-adherence vs. substantive-task scores
7. All existing tests pass + new tests pass
8. `npm run build` clean
