# Ralph Loop Task: v2.15.0 — Context Enrichment & IR Persistence

## Context

**Version:** v2.15.0
**Branch:** `feature/v2.15.0-context-enrichment`
**Plan:** `PLAN-v2.15.0.md`
**ROADMAP:** See `ROADMAP.md` → v2.15.0 section
**Current state:** main = v2.14.0 (Semantic Codebase Analyzer shipped)

## Goal

Three problems in one release:

1. **Compilation agents are context-starved.** The analyzer extracts 60K tokens of source code, compresses it to ~1K of ProjectAnalysis, then discards the raw code. Every compilation agent (sections-writer, command-writer, etc.) only sees the 1K summary → generic output.

2. **Evolve proposers are project-blind.** The proposer and architect have never seen the source code, the ProjectAnalysis, or the structured IR. They optimize a harness for a project they don't understand.

3. **The IR is ephemeral.** The HarnessIR is computed during mutation, used for ~100ms, then garbage collected. It's never persisted or shared.

4. **Evolve evals are shallow.** 100% harness-sensitivity probes (does the agent follow conventions?), 0% substantive tasks (can the agent actually fix bugs and build features?).

## Pre-Steps (before Phase 1)

1. Verify main is at v2.14.0: `git log --oneline -1 main`
2. Create feature branch: `git checkout -b feature/v2.15.0-context-enrichment`
3. Bump version: edit `package.json` to `"version": "2.15.0"`
4. Commit: `git commit -am "chore: bump to v2.15.0"`

## Implementation Plan

Read `PLAN-v2.15.0.md` for full specification. Here are the ordered steps:

### Step 1: Cache packed source during analysis (parallel-safe)
**Files:** `src/analyzer/analyze.ts`, `src/analyzer/cache.ts`

1. After `packCodebase()`, write `packed.content` to `.kairn/packed-source.txt`
2. Update `readCache()` to return packed source path if available
3. Update `writeCache()` to save packed source alongside analysis
4. When cache valid AND packed source exists, skip Repomix

**Tests:** `src/analyzer/__tests__/cache.test.ts`
**Commit:** `feat(analyzer): cache packed source code alongside analysis`

### Step 2: Return packed source from analyzeProject() (depends on Step 1)
**Files:** `src/analyzer/analyze.ts`, `src/analyzer/types.ts`

1. Change `analyzeProject()` return type to include `packedSource: string`
2. Return both analysis and packed source content
3. Update `kairn analyze` command to show packed source stats

**Tests:** `src/analyzer/__tests__/analyze.test.ts`
**Commit:** `feat(analyzer): return packed source alongside ProjectAnalysis`

### Step 3: Enrich compilation intent with packed source (depends on Step 2)
**Files:** `src/commands/optimize.ts`

1. `buildOptimizeIntent()` gains `packedSource?: string` parameter
2. Append `## Sampled Source Code` section to intent when provided
3. `optimizeCommand` handler passes `packedSource` from analyzer result
4. Compilation agents now receive ~62K tokens (vs ~2K today)

**Tests:** `src/analyzer/__tests__/integration.test.ts`
**Commit:** `feat(optimize): pass packed source code through to compilation agents`

### Step 4: Persist IR after compilation (parallel-safe)
**Files:** `src/commands/optimize.ts`, `src/commands/describe.ts`

1. After `compile()` returns IR, write to `.kairn/harness-ir.json`
2. Create `.kairn/` directory if needed
3. `JSON.stringify(ir, null, 2)` for human readability

**Tests:** Verify file exists after compile
**Commit:** `feat(compile): persist HarnessIR to .kairn/harness-ir.json`

### Step 5: Persist IR after evolve mutations (depends on Step 4)
**Files:** `src/evolve/mutator.ts`

1. In `applyMutationsViaIR()`, write `currentIR` to `iterations/N/harness-ir.json`
2. One additional `fs.writeFile` call — no logic changes
3. Legacy fallback path does not persist IR (acceptable — it's the fallback)

**Tests:** `src/evolve/__tests__/mutator.test.ts`
**Commit:** `feat(evolve): persist HarnessIR after mutation application`

### Step 6: Build IR summary helper (parallel-safe after Step 4)
**Files:** `src/evolve/proposer.ts`

1. Create `buildIRSummary(ir: HarnessIR): string` function
2. Output: compact structural overview (~200-500 tokens):
   ```
   Sections (6): purpose, tech-stack, architecture, commands, conventions, verification
   Commands (4): build (Bash(npm*)), test, develop, sprint
   Rules (2): security (**/*), docker-practices (Dockerfile*)
   Agents (3): architect, implementer, reviewer
   MCP Servers (2): context7, sequential-thinking
   ```
3. Export for use by proposer and architect

**Tests:** Unit test with mock IR → verify output format
**Commit:** `feat(evolve): IR summary builder for proposer context`

### Step 7: Inject context into reactive proposer (depends on Steps 5, 6)
**Files:** `src/evolve/proposer.ts`, `src/evolve/loop.ts`

1. Add `projectContext` parameter to `buildProposerUserMessage()`:
   - `analysis: ProjectAnalysis` (~1K tokens)
   - `irSummary: string` (~300 tokens)
   - `keySourceFiles?: string` (~10K tokens — Tier 0+1 files from packed source)
2. Insert after harness files, before traces (fixed section, never truncated)
3. In `loop.ts` `evolve()` function:
   - At loop start, load `.kairn/analysis.json` if exists
   - Load `.kairn/packed-source.txt`, extract key files (first 10K chars)
   - On each iteration, read `harness-ir.json` and build summary
   - Pass `projectContext` to `propose()`

**Tests:** Verify proposer user message includes `## Project Understanding` section
**Commit:** `feat(evolve): inject project context into reactive proposer`

### Step 8: Inject context into architect proposer (depends on Step 7)
**Files:** `src/evolve/architect.ts`

1. Add same `projectContext` parameter to `buildArchitectUserMessage()`
2. Insert at same position (fixed section, before traces)
3. In `loop.ts`, pass same `projectContext` to `proposeArchitecture()`

**Tests:** Verify architect user message includes project context
**Commit:** `feat(evolve): inject project context into architect proposer`

### Step 9: New SWE-bench-style eval templates (parallel-safe)
**Files:** `src/evolve/templates.ts`

1. Add `real-bug-fix` template:
   - Injects known bug → task agent with fixing from issue description
   - Scorer: test suite passes OR specific file content verified
2. Add `real-feature-add` template:
   - Small feature with clear acceptance criteria
   - Scorer: feature exists + tests pass + no regressions
3. Add `codebase-question` template:
   - Factual question about codebase requiring source reading
   - Scorer: LLM-as-judge checks accuracy
4. Tag all templates with `category: 'harness-sensitivity' | 'substantive'`

**Tests:** `src/evolve/__tests__/templates.test.ts`
**Commit:** `feat(evolve): SWE-bench-style eval templates`

### Step 10: Analysis-aware task generation (depends on Steps 2, 9)
**Files:** `src/evolve/init.ts`

1. `kairn evolve init` reads `.kairn/analysis.json` when available
2. Generates domain-specific tasks using ProjectAnalysis:
   - `real-bug-fix` referencing actual modules
   - `codebase-question` about actual workflows
   - `real-feature-add` extending actual functionality
3. Mix: 50% harness-sensitivity, 50% substantive
4. Fallback to existing menu if no analysis

**Tests:** `src/evolve/__tests__/init.test.ts`
**Commit:** `feat(evolve): analysis-aware task generation with mixed eval suite`

### Step 11: Score breakdown in reports (depends on Step 9)
**Files:** `src/evolve/report.ts`, `src/evolve/types.ts`

1. Add `category` field to `Task` type
2. `kairn evolve report` shows split aggregates:
   ```
   Overall:            72.5%
   Harness adherence:  85.0% (6 tasks)
   Substantive tasks:  60.0% (6 tasks)
   ```
3. `kairn evolve report --json` includes both categories

**Tests:** `src/evolve/__tests__/report.test.ts`
**Commit:** `feat(evolve): score breakdown by task category`

### Step 12: Finalize
1. `npm run build` — must succeed
2. `npx vitest run` — all tests pass
3. Update CHANGELOG.md with v2.15.0 entry
4. Update ROADMAP.md checkboxes
5. `node dist/cli.js --help` — verify commands
6. `git log --oneline -15` — verify commit history

**Commit:** `chore: v2.15.0 finalization`

## Dependency Graph

```
Step 1 (cache packed)  ─────────┐
Step 4 (persist IR compile) ──┐ │
Step 6 (IR summary helper) ──┤ │
Step 9 (eval templates)  ───┐ │ │
                            │ │ │
Step 2 (return packed) ─────┤─┘─┘ (depends on 1)
Step 5 (persist IR evolve)──┤     (depends on 4)
                            │
Step 3 (enrich intent) ─────┤     (depends on 2)
Step 7 (proposer context) ──┤     (depends on 5, 6)
Step 10 (task generation) ──┤     (depends on 2, 9)
Step 11 (score breakdown) ──┤     (depends on 9)
                            │
Step 8 (architect context) ─┤     (depends on 7)
                            │
Step 12 (finalize) ─────────┘     (depends on all)
```

Parallelizable groups:
- **Group A:** Steps 1, 4, 6, 9 (all parallel-safe)
- **Group B:** Steps 2, 5 (after their deps from A)
- **Group C:** Steps 3, 7, 10, 11 (after B)
- **Group D:** Step 8 (after 7)
- **Group E:** Step 12 (after all)

## Key Constraints

- **TDD mandatory:** RED → GREEN → REFACTOR for every step
- **Strict TypeScript:** no `any`, no `ts-ignore`, `.js` extensions on imports
- **Max 3 fix rounds** in review phase
- **Backward compatible:** `kairn describe` in empty dir → unchanged behavior
- **Budget-safe:** All new context fits within existing token limits
- **Preserve all existing tests** — none may break
- **Proposer output unchanged:** Still emits file-level mutations. No changes to translation layer.

## Success Criteria

1. `kairn optimize` on a real Python project → CLAUDE.md references actual functions, modules, and workflows
2. `kairn evolve` proposer reasoning mentions specific project patterns (not just trace symptoms)
3. `.kairn/packed-source.txt` cached and reused on subsequent runs
4. `.kairn/harness-ir.json` exists after compilation
5. `iterations/N/harness-ir.json` exists after every evolve mutation
6. `kairn evolve init` generates mixed eval suite with domain-specific tasks
7. `kairn evolve report` shows harness-adherence vs. substantive-task scores separately
8. All existing tests pass + all new tests pass
9. `npm run build` clean
