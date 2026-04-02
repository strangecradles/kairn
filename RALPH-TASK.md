# Ralph Loop Task: v2.11.0 — Multi-Agent Compilation Pipeline

## Context

**Version:** v2.11.0  
**Branch:** `feature/v2.11.0-multi-agent-compilation`  
**Design doc:** `docs/design/v2.11-multi-agent-compilation.md`  
**ROADMAP:** See `ROADMAP.md` → v2.11.0 section  
**Current state:** main = v2.9.0, feature/v2.10.0 branch ready (936/936 tests pass)

## Goal

Replace the monolithic Pass 2 LLM call in `src/compiler/compile.ts` with a multi-agent pipeline:
1. **@orchestrator** reads skeleton + intent → emits `CompilationPlan`
2. **6 specialist agents** execute in parallel phases → produce typed `HarnessIR` nodes
3. **@linker** validates cross-references
4. **Assembly** merges into `HarnessIR` → adapters render to files

This fixes the JSON truncation bug (Unterminated string at position 25629) and produces higher quality harnesses.

## Pre-Steps (before Phase 1)

1. Merge v2.10.0 to main: `git checkout main && git merge feature/v2.10.0-persistent-execution`
2. Bump version: edit package.json to 2.11.0
3. Create feature branch: `git checkout -b feature/v2.11.0-multi-agent-compilation`
4. Commit the design doc, ROADMAP, and README changes already staged

## Implementation Plan

Read `docs/design/v2.11-multi-agent-compilation.md` for full design. Here are the ordered steps:

### Step 1: Types & Infrastructure (parallel-safe)
**Files:** `src/compiler/agents/types.ts`, `src/llm.ts`

1. Create `src/compiler/agents/types.ts` with:
   - `CompilationPlan` interface (project_context, phases[])
   - `CompilationPhase` interface (id, agents[], dependsOn[])
   - `AgentTask` interface (agent name, items[], context_hint?, max_tokens)
   - `AgentResult` discriminated union (sections | commands | agents | rules | docs | skills)
   - `TruncationError` class extending Error

2. In `src/llm.ts`:
   - After getting Anthropic response, check `response.stop_reason === 'max_tokens'`
   - If truncated, throw `TruncationError` with agent name and tokens used
   - Same for OpenAI: check `response.choices[0].finish_reason === 'length'`

**Tests:** `src/compiler/agents/__tests__/types.test.ts` — type validation, TruncationError behavior  
**Commit:** `feat(compiler): add multi-agent types and truncation detection`

### Step 2: Batch Execution Engine (parallel-safe)
**Files:** `src/compiler/batch.ts`

1. Create `executePlan()` function:
   - Takes `CompilationPlan`, `KairnConfig`, `concurrency: number`, `onProgress`
   - Topologically sorts phases by `dependsOn`
   - For each phase, runs agents with `runWithConcurrency` (import from evolve or reimplement)
   - Merges `AgentResult[]` into a growing `HarnessIR` (using `createEmptyIR()`)
   - Returns complete `HarnessIR`

2. Create `runWithConcurrency<T>()` if not importable from evolve:
   - Takes array of `() => Promise<T>`, concurrency limit
   - Returns `T[]` preserving order

**Tests:** `src/compiler/__tests__/batch.test.ts` — phase ordering, concurrency, error propagation, dependency validation  
**Commit:** `feat(compiler): batch execution engine with concurrency control`

### Step 3: @orchestrator Agent
**Files:** `src/compiler/plan.ts`

1. Create `generatePlan()` function:
   - System prompt: "You are the Kairn compilation planner. Given a project skeleton and user intent, produce a CompilationPlan that determines what sections, commands, agents, rules, docs, and skills to generate, organized into dependency phases."
   - Input: intent string, skeleton (from Pass 1)
   - Output: `CompilationPlan` (parsed from LLM JSON response)
   - Max tokens: 2048
   - Include the list of standard sections (Purpose, Tech Stack, Commands, Architecture, Conventions, Key Commands, Output, Verification, Known Gotchas, Debugging, Git Workflow, Engineering Standards, Tool Usage Policy, Code Philosophy, First Turn Protocol, Sprint Contract, Completion Standards)
   - Include the list of standard commands, agents based on autonomy level
   - Let the orchestrator decide which are relevant and how to phase them

2. Fallback: if LLM call fails, generate a default plan deterministically from skeleton fields

**Tests:** `src/compiler/__tests__/plan.test.ts` — plan generation for simple/complex/research/content projects  
**Commit:** `feat(compiler): @orchestrator compilation planner`

### Step 4: Specialist Agents — Phase A (no dependencies)
**Files:** `src/compiler/agents/sections-writer.ts`, `src/compiler/agents/rule-writer.ts`, `src/compiler/agents/doc-writer.ts`

For each agent:
1. Focused system prompt (500-1000 tokens) with format-specific conventions
2. `generate*()` function taking intent, skeleton, plan context
3. JSON output parsed into typed IR nodes
4. Retry with higher max_tokens on `TruncationError`

**@sections-writer:**
- System prompt: CLAUDE.md template rules, section ordering, mandatory structure, line budgets
- Input: project_context, tech_stack, autonomy_level, section list from plan
- Output: `Section[]` (with id, heading, content, order)
- Max tokens: 4096

**@rule-writer:**
- System prompt: path-scoped YAML frontmatter syntax, security baseline, constraint format
- Input: project_context, tech_stack, rule list from plan
- Output: `RuleNode[]` (with name, paths?, content)
- Max tokens: 2048

**@doc-writer:**
- System prompt: template structures, acceptance criteria format
- Input: project_context, doc list from plan
- Output: `DocNode[]` (DECISIONS.md, LEARNINGS.md, SPRINT.md)
- Max tokens: 2048

**Tests:** `src/compiler/agents/__tests__/sections-writer.test.ts`, etc. — mock callLLM, verify output types  
**Commit:** `feat(compiler): Phase A specialist agents (sections, rules, docs)`

### Step 5: Specialist Agents — Phase B (depends on Phase A)
**Files:** `src/compiler/agents/command-writer.ts`, `src/compiler/agents/agent-writer.ts`, `src/compiler/agents/skill-writer.ts`

**@command-writer:**
- System prompt: `!` shell integration, `$ARGUMENTS`, orchestration patterns, command format
- Input: project_context, command list from plan, Section[] from Phase A (for context)
- Output: `CommandNode[]` (with name, description, content)
- Max tokens: 4096 (or batched if >10 commands)

**@agent-writer:**
- System prompt: YAML frontmatter conventions (`modelRouting`, `disallowedTools`), persona design, model tiering
- Input: project_context, agent list from plan, RuleNode[] from Phase A (for scope)
- Output: `AgentNode[]` (with name, model?, modelRouting?, content)
- Max tokens: 4096 (or batched if >8 agents)

**@skill-writer:**
- System prompt: SKILL.md format, 3-phase TDD patterns
- Input: project_context, skill list from plan
- Output: `SkillNode[]`
- Max tokens: 2048

**Tests:** `src/compiler/agents/__tests__/command-writer.test.ts`, etc.  
**Commit:** `feat(compiler): Phase B specialist agents (commands, agents, skills)`

### Step 6: @linker (Phase C)
**Files:** `src/compiler/linker.ts`

1. Cross-reference validation:
   - Commands that mention `@agent-name` → verify agent exists
   - Agents that reference `/project:command` → verify command exists
   - Rules with path scopes → warn if no matching project structure
   - Commands referencing docs/ files → verify doc exists

2. Auto-fix simple issues:
   - Remove `@` mentions for agents that don't exist
   - Add missing `/project:help` command if absent
   - Ensure `security.md` and `continuity.md` rules always present

3. Return patched nodes (modified in place or as new copies)

**Tests:** `src/compiler/__tests__/linker.test.ts` — broken refs detected, auto-fixes applied  
**Commit:** `feat(compiler): @linker cross-reference validation`

### Step 7: Compile Pipeline Refactor
**Files:** `src/compiler/compile.ts`, `src/compiler/prompt.ts`

1. Refactor `compile()`:
   - Pass 1: unchanged (skeleton)
   - Pass 2: call `generatePlan()` (new @orchestrator)
   - Pass 3: call `executePlan()` (new batch engine → specialists → linker)
   - Pass 4: deterministic assembly (settings, MCP config, intents — reuse existing code)
   - Return `HarnessIR` wrapped in `EnvironmentSpec`

2. Remove `HARNESS_PROMPT` from `prompt.ts` (replaced by per-agent prompts)
   - Keep `SKELETON_PROMPT`, `SYSTEM_PROMPT`, `CLARIFICATION_PROMPT`
   - Remove `buildHarnessMessage()`, `parseHarnessResponse()`

3. Update `EnvironmentSpec.harness` type:
   - Add `ir: HarnessIR` field
   - Keep existing string fields for backward compat (populated from IR via renderer)
   - Or: migrate to IR-only if adapters are updated in same PR

**Tests:** Update `src/compiler/__tests__/compile.test.ts`  
**Commit:** `feat(compiler): multi-agent compilation pipeline`

### Step 8: Adapter Updates
**Files:** `src/adapter/claude-code.ts`, `src/adapter/hermes-agent.ts`

1. Update `writeEnvironment()` in claude-code adapter:
   - Accept `HarnessIR` (or `EnvironmentSpec` containing it)
   - Use `renderClaudeMd()`, `renderSettings()`, etc. from `src/ir/renderer.ts`
   - Fall back to old string-based fields if `ir` is absent (backward compat)

2. Same for hermes-agent adapter

3. Update `src/commands/activate.ts` to handle both old and new EnvironmentSpec shapes

**Tests:** Verify adapter output is identical for same input  
**Commit:** `feat(adapter): consume HarnessIR via renderer`

### Step 9: UX Updates
**Files:** `src/ui.ts`, `src/commands/describe.ts`

1. Update progress display for multi-agent phases:
   - Show plan summary after Pass 2
   - Show Phase A/B/C progress with agent names
   - Show per-agent retry warnings
   - Show total compilation time

2. Update time estimate logic for multi-agent (parallel is faster)

**Tests:** Snapshot tests for progress output  
**Commit:** `feat(ui): multi-phase compilation progress display`

### Step 10: Integration & Regression
**Files:** Various test files

1. End-to-end: `kairn describe` with mocked LLM → valid `.claude/` directory
2. Round-trip: compile → render → parse → compare IR
3. Evolve compatibility: compile → evolve → mutations work
4. Backward compat: old EnvironmentSpec JSON files still load and activate
5. Both adapters produce correct output

**Commit:** `test(compiler): integration tests for multi-agent pipeline`

### Step 11: Finalize
1. `npm run build` — must succeed
2. `npx vitest run` — all tests pass
3. Update CHANGELOG.md
4. `node dist/cli.js describe --help` — verify
5. Manual smoke test: `kairn describe "Build a Python FastAPI with PostgreSQL"` (with real API key)
6. `git log --oneline -15` — verify commit history

**Commit:** `chore: bump to v2.11.0, update CHANGELOG`

## Key Constraints

- **TDD mandatory:** RED → GREEN → REFACTOR for every step
- **Strict TypeScript:** no `any`, no `ts-ignore`, .js extensions on imports
- **Max 3 fix rounds** in review phase
- **Preserve all 936 existing tests** — none may break
- **Cost-neutral:** total LLM tokens for compilation should be ≤2x current (prompt caching helps)

## Success Criteria

1. `kairn describe` never produces truncated JSON
2. `compile()` returns `HarnessIR` (not flat strings)
3. Generated harness quality ≥ current monolithic output
4. All existing tests pass
5. Both adapters produce identical file output
6. `kairn evolve` works on environments compiled with new pipeline
