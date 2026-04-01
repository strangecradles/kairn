# PLAN v2.5.0 — Intent-Aware Harnesses

> **Thesis:** Users shouldn't memorize command names. Kairn generates project-specific intent routing hooks that intercept natural language and activate the right workflow. Two tiers: regex (fast, free) + Haiku prompt (semantic, ~$0.001). The harness learns the user's vocabulary over time.

---

## Context

**Design doc:** `docs/design/v2.5-intent-routing.md` (full architecture, comparisons, open questions)

**Current state:** `kairn describe` generates CLAUDE.md, commands/, rules/, agents/, skills/, settings.json. The adapter (`src/adapter/claude-code.ts`) writes all files via `writeEnvironment()`. Settings already support hooks (see `ENV_LOADER_HOOK` for .env loading on SessionStart). The evolve pipeline snapshots/mutates the full `.claude/` directory.

**Key insight from Claude Code docs:** There are FOUR hook types: `command`, `http`, `prompt`, `agent`. Prompt hooks use Haiku for single-turn LLM evaluation (30s default timeout). OMC only uses `command` hooks (regex). Kairn uses both `command` (Tier 1) and `prompt` (Tier 2).

**Key files:**
- `src/types.ts` — `EnvironmentSpec`, `HarnessContent`, `SkeletonSpec`
- `src/adapter/claude-code.ts` — `writeEnvironment()`, `buildFileMap()`, `resolveSettings()`
- `src/compiler/compile.ts` — compilation pipeline (Pass 1: skeleton, Pass 2: harness content)
- `src/compiler/prompt.ts` — system prompts for compilation
- `src/evolve/types.ts` — `Mutation`, `Proposal`, `EvolveConfig`
- `src/evolve/proposer.ts` — proposer LLM call
- `src/evolve/mutator.ts` — `applyMutations()`
- `src/evolve/baseline.ts` — `snapshotBaseline()`, `copyDir()`
- `src/evolve/templates.ts` — eval templates

---

## Steps

### Step 1: Types & Intent Pattern Module
> Foundation. Define the data model and the pattern generation logic.

**New file: `src/intent/types.ts`**
```typescript
export interface IntentPattern {
  pattern: string;           // regex source (no delimiters)
  command: string;           // /project:command-name
  description: string;       // human-readable description
  source: 'generated' | 'evolved' | 'learned';
}

export interface IntentConfig {
  tier1Patterns: IntentPattern[];
  tier2PromptTemplate: string;  // compiled with workflow manifest
  enableTier2: boolean;         // true by default
}
```

**Modify: `src/types.ts`**

Extend `EnvironmentSpec.harness`:
```typescript
harness: {
  // ... existing fields ...
  hooks: Record<string, string>;          // filename → content
  intent_patterns: IntentPattern[];       // compiled patterns for Tier 1
  intent_prompt_template: string;         // compiled Tier 2 prompt
};
```

Extend `HarnessContent`:
```typescript
export interface HarnessContent {
  // ... existing fields ...
  hooks: Record<string, string>;
}
```

**New file: `src/intent/patterns.ts`**

Core function: given a map of generated commands + their descriptions, produce `IntentPattern[]`.

```typescript
export function generateIntentPatterns(
  commands: Record<string, string>,  // name → markdown content
  agents: Record<string, string>,    // name → markdown content
  projectProfile: { language: string; framework: string; scripts: Record<string, string> },
): IntentPattern[]
```

Logic:
1. For each command name, extract the verb: `deploy`, `test`, `lint`, `format`, etc.
2. Look up synonyms from a static map: `deploy → [ship, push to prod, release]`, `test → [check, verify, run tests]`, etc.
3. Build regex: `/\b(deploy|ship|push\s+to\s+prod|release)\b/i`
4. For npm scripts in the project, add script-name patterns: `"test:e2e"` → `/\b(e2e|end.to.end)\b/`
5. Return `IntentPattern[]` sorted by specificity (longer patterns first)

**New file: `src/intent/prompt-template.ts`**

```typescript
export function compileIntentPrompt(
  commands: Record<string, string>,
  agents: Record<string, string>,
): string
```

Builds the Tier 2 prompt by:
1. Extracting first-line descriptions from each command markdown
2. Listing all agents with their roles
3. Embedding into the classification prompt template
4. Returns the full prompt string ready for `settings.json`

**Tests: `src/intent/__tests__/patterns.test.ts`**
- Generates patterns for common commands (deploy, test, lint)
- Includes synonyms
- Handles edge cases (empty commands, duplicate verbs)
- Patterns are valid regex
- Question filter excludes "what is deploy?"

**Tests: `src/intent/__tests__/prompt-template.test.ts`**
- Compiles prompt with workflow manifest
- Includes all commands and agents
- Contains classification instructions
- Handles empty commands/agents

**Acceptance:** `npm run build` passes, `npm test` passes, pattern generation produces valid regex for a sample command set.

---

### Step 2: Hook Templates (intent-router.mjs + intent-learner.mjs)
> Generate the actual JavaScript files that run as Claude Code hooks.

**New file: `src/intent/router-template.ts`**

```typescript
export function renderIntentRouter(
  patterns: IntentPattern[],
  generationTimestamp: string,
): string
```

Renders the full `intent-router.mjs` script with:
1. Stdin JSON parsing (Claude Code hooks API)
2. Sanitization (code blocks, URLs, file paths stripped)
3. Question filter (informational queries don't trigger)
4. Generated PATTERNS array (from `IntentPattern[]`)
5. Match loop → additionalContext output
6. Fallthrough → `{ continue: true, suppressOutput: true }`

**New file: `src/intent/learner-template.ts`**

```typescript
export function renderIntentLearner(): string
```

Renders `intent-learner.mjs` (static — not project-specific):
1. Reads `.claude/hooks/intent-log.jsonl`
2. Groups entries by `routed_to` command
3. For commands with ≥3 entries: extract common words, build regex
4. Reads current `intent-router.mjs`, appends new patterns to PATTERNS array
5. Writes `.claude/hooks/intent-promotions.jsonl` audit log
6. Truncates processed entries from log

**Tests: `src/intent/__tests__/router.test.ts`**
- Rendered script is valid JavaScript (parse with acorn or just `new Function()`)
- Contains all patterns from input
- Sanitization strips code blocks and URLs
- Question filter works (doesn't match "what is deploy?")

**Tests: `src/intent/__tests__/learner.test.ts`**
- Promotion logic: 3+ entries → generates regex
- Appends to PATTERNS array correctly
- Handles empty log file
- Handles corrupt log entries gracefully

**Acceptance:** `npm run build` passes, `npm test` passes, generated scripts are syntactically valid JavaScript.

---

### Step 3: Adapter Integration (kairn describe writes hooks)
> Wire the intent module into the generation pipeline so `kairn describe` outputs hooks.

**Modify: `src/compiler/compile.ts`**

After Pass 2 (harness content generation), add a new step:
1. Call `generateIntentPatterns(commands, agents, projectProfile)`
2. Call `compileIntentPrompt(commands, agents)`
3. Call `renderIntentRouter(patterns, timestamp)`
4. Call `renderIntentLearner()`
5. Store results in `EnvironmentSpec.harness.hooks`, `.intent_patterns`, `.intent_prompt_template`

**Modify: `src/adapter/claude-code.ts`**

In `resolveSettings()`:
1. Add `UserPromptSubmit` hook array to settings:
   - Tier 1: `{ type: "command", command: "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/intent-router.mjs\"", timeout: 5 }`
   - Tier 2: `{ type: "prompt", prompt: spec.harness.intent_prompt_template, timeout: 15 }`
2. Add `SessionStart` hook for intent-learner:
   - `{ type: "command", command: "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/intent-learner.mjs\"", timeout: 10 }`

In `writeEnvironment()`:
1. Write `.claude/hooks/intent-router.mjs` from `spec.harness.hooks['intent-router']`
2. Write `.claude/hooks/intent-learner.mjs` from `spec.harness.hooks['intent-learner']`
3. Create empty `.claude/hooks/intent-log.jsonl`

In `buildFileMap()`:
1. Include hooks in the file map (for evolve baseline snapshots)

**Modify: `src/compiler/prompt.ts`**

Add to the Pass 2 system prompt a note that the compiler should consider what natural-language phrases users might say for each command, to inform pattern generation. (This is optional — pattern generation can be purely heuristic.)

**Tests: `src/commands/__tests__/describe-hooks.test.ts`**
- `kairn describe` output includes hooks in settings.json
- intent-router.mjs is written to .claude/hooks/
- intent-learner.mjs is written to .claude/hooks/
- Tier 2 prompt includes all generated command names
- Hook paths use $CLAUDE_PROJECT_DIR correctly
- Existing settings (statusLine, env loader) are preserved

**Acceptance:** `npm run build` passes, `npm test` passes. Running `kairn describe "build a Next.js app"` produces `.claude/hooks/intent-router.mjs` with Next.js-specific patterns and `settings.json` with UserPromptSubmit hooks.

---

### Step 4: Evolve Integration (proposer + mutator + baseline)
> Make the evolution loop aware of intent routing so it can improve patterns over time.

**Modify: `src/evolve/baseline.ts`**

`snapshotBaseline()` already copies the full `.claude/` directory. Verify that `.claude/hooks/` is included. If using selective file lists anywhere, add hooks glob.

**Modify: `src/evolve/mutator.ts`**

The existing mutation actions (`replace`, `add_section`, `create_file`, `delete_section`, `delete_file`) should work for `.claude/hooks/intent-router.mjs` since it's a text file. No new mutation types needed — the proposer can use `replace` to swap patterns or `add_section` to append new ones.

However, verify that `.mjs` files are included in the harness scope (the mutator may filter by extension).

**Modify: `src/evolve/proposer.ts`**

In `buildProposerUserMessage()`, include intent patterns as part of the harness context the proposer reads:
1. List all Tier 1 patterns with their commands
2. Show the Tier 2 prompt template
3. Add guidance: "You can propose adding new intent patterns for commands that users might phrase differently, or refine existing patterns that are too broad/narrow."

**Modify: `src/evolve/templates.ts`**

Add a new eval template:
```typescript
{
  id: 'intent-routing',
  name: 'Intent Routing',
  description: 'Test that natural language prompts route to the correct workflow command',
  defaultScoring: 'llm-judge',
  defaultTimeout: 120,
  generateTasks: (profile, claudeMd) => {
    // Generate tasks like:
    // "User says 'ship it' — does Claude execute /project:deploy?"
    // "User says 'make sure tests pass' — does Claude run /project:test?"
  }
}
```

**Tests: `src/evolve/__tests__/intent-evolve.test.ts`**
- Baseline snapshot includes .claude/hooks/
- Proposer context includes intent patterns
- Mutations can target .claude/hooks/intent-router.mjs
- Intent-routing eval template generates valid tasks

**Acceptance:** `npm run build` passes, `npm test` passes. `kairn evolve init` offers intent-routing as a template option. Proposer mentions intent patterns in its analysis.

---

### Step 5: End-to-End Validation
> Prove the full pipeline works: describe generates hooks → hooks route prompts → evolve improves patterns.

**Manual test sequence:**
1. `cd /tmp/test-project && npm init -y && mkdir src`
2. Add a package.json with scripts: test, build, lint, deploy
3. `kairn describe "Node.js project with deploy to Vercel"`
4. Verify: `.claude/hooks/intent-router.mjs` exists with patterns for test, build, lint, deploy
5. Verify: `.claude/settings.json` has UserPromptSubmit hooks
6. Inspect generated patterns — do they look reasonable?
7. `kairn evolve init` → verify intent-routing template is available
8. `kairn evolve baseline` → verify .claude/hooks/ is in snapshot

**Integration test: `src/intent/__tests__/e2e.test.ts`**
- Create a mock project with known commands
- Run compilation pipeline
- Assert: intent-router.mjs has patterns matching command names
- Assert: settings.json has correct hook structure
- Assert: Tier 2 prompt lists all commands
- Simulate intent-router.mjs execution with sample prompts
- Assert: "deploy this" → additionalContext with /project:deploy
- Assert: "what is deploy?" → no match (question filter)
- Assert: "random unrelated thing" → suppressOutput (fallthrough)

**Acceptance:** Integration test passes. Manual test produces reasonable output. npm run build clean, npm test all green.

---

## Execution Order

```
Step 1 (types + patterns)
    │
    ▼
Step 2 (hook templates)  ← depends on Step 1 types
    │
    ▼
Step 3 (adapter wiring)  ← depends on Steps 1+2
    │
    ▼
Step 4 (evolve integration)  ← depends on Step 3
    │
    ▼
Step 5 (E2E validation)  ← depends on all
```

All steps are sequential. Each builds on the previous.

---

## Completion Criteria

- [ ] `IntentPattern` type defined, pattern generation works for common command names
- [ ] `intent-router.mjs` template renders valid JavaScript with project-specific patterns
- [ ] `intent-learner.mjs` template renders valid JavaScript with promotion logic
- [ ] `kairn describe` writes hooks to `.claude/hooks/` and `settings.json`
- [ ] Evolve pipeline snapshots/reads/mutates intent routing files
- [ ] Intent-routing eval template available in `kairn evolve init`
- [ ] E2E test: "deploy this" → routes to /project:deploy
- [ ] E2E test: "what is deploy?" → does NOT trigger (question filter)
- [ ] `npm run build` clean, `npm test` all green
- [ ] Version bumped to 2.5.0 in package.json
- [ ] ROADMAP.md updated (v2.5.0 marked ✅)
- [ ] CHANGELOG.md updated

---

## Ralph Loop Prompt

```
Read PLAN-v2.5.0.md and docs/design/v2.5-intent-routing.md. Execute steps 1-5 in order. For each step: write failing tests first (RED), implement until tests pass (GREEN), then clean up (REFACTOR). Run npm run build and npm test after each step. Commit after each step passes. Use TDD strictly — no implementation without a failing test first.
```
