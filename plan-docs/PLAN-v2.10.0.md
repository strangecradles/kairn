# PLAN v2.10.0 — Persistent Execution Loop

> **Thesis:** The single biggest gap between Kairn-generated harnesses and production agent workflows is persistence. `/project:develop` runs once linearly. If it fails, the user restarts manually. A persistence loop keeps working until all acceptance criteria pass, tracks progress across retries, and auto-routes complex tasks through the loop.

**Design doc:** [`docs/design/v2.10-persistent-execution.md`](docs/design/v2.10-persistent-execution.md)

---

## Context

**Current state:** v2.9.0 shipped sprint contracts, memory persistence hooks, smart model routing, and expanded security rules. The harness can now define acceptance criteria (`docs/SPRINT.md`), persist memory across sessions (`memory.json`), and route agents to appropriate model tiers. But execution is still linear and non-resumable.

**Key integration points:**
- `src/compiler/prompt.ts` — HARNESS_PROMPT (primary: Steps 1, 2, 3)
- `src/templates/hooks.md` — hook templates (Steps 2, 3)
- `src/templates/settings.md` — settings templates (Step 3)
- `src/evolve/templates.ts` — eval template registry (Step 4)
- `src/evolve/types.ts` — EvalTemplate union type (Step 4)
- `src/autonomy.ts` — autonomy-level routing config (Step 3)
- `src/adapter/claude-code.ts` — hook file deployment (Step 2)

---

## Steps

### Step 1: `/project:persist` Command Template in HARNESS_PROMPT
> The core feature. Add the persist command to what Kairn generates for every code project.

**Modify: `src/compiler/prompt.ts` (HARNESS_PROMPT)**

In the "For Code Projects, Additionally Include" section (after `/project:reset`), add:

```
- `/project:persist` command (persistent execution loop — reads acceptance criteria from docs/SPRINT.md, works criterion-by-criterion with structured progress tracking in .claude/progress.json, auto-retries on verification failure up to 3 times per criterion, delegates to @grill for review gate before completion, resumes from progress.json if session was interrupted)
```

Also add the full `/project:persist` command content to the output schema `commands` object:
```json
"persist": "..."
```

**Modify: `src/compiler/prompt.ts` (SYSTEM_PROMPT)**

Add `persist` to the output schema commands object (alongside help, develop, status, etc.).

**Create: template content for the persist command**

The persist command template (written to `.claude/commands/persist.md`) should contain the full protocol from the design doc Section 1: load/initialize progress, criterion-by-criterion loop, verification, retry logic, review gate, session persistence.

**Tests: `src/commands/__tests__/describe-hooks.test.ts`**
- Compiled harness for a code project includes `persist` in commands object
- Persist command content references `progress.json`, `SPRINT.md`, and `@grill`
- Persist command includes retry protocol (max 3 attempts)

**Acceptance:**
- `npm run build && npx tsc --noEmit && npm test` clean
- Generate a test harness → verify `/project:persist` command exists with progress tracking protocol

**Commit:** `feat(harness): add /project:persist command template to HARNESS_PROMPT`

---

### Step 2: Persist-Router Hook + SessionEnd/Start Integration
> The hook that makes persistence discoverable — auto-routes complex tasks and integrates with existing memory persistence.

**Create: `.claude/hooks/persist-router.mjs` template in `src/templates/`**

New file `src/templates/persist-router.mjs` containing the ESM hook from design doc Section 3. This is the template that `claude-code.ts` adapter writes to `.claude/hooks/` during deployment.

The hook:
- Reads stdin for `UserPromptSubmit` event
- Checks pass-through patterns (questions, single-file edits, lookups, existing commands)
- Checks `persistence_routing` setting (`auto` | `manual` | `off`)
- Scores complexity signals: multi-step, feature-scope, refactor-scope, bug-with-repro, explicit, long-prompt
- Routes when 2+ signals detected (auto mode) or explicit keyword (manual mode)
- Injects additionalContext instructing the agent to use `/project:persist` workflow

**Modify: `src/templates/hooks.md`**

Add new section "Persistence Routing (UserPromptSubmit)" between "Memory Persistence" and "Selection Guide":

```markdown
## Persistence Routing (UserPromptSubmit)

For code projects with autonomy level 3+, include a UserPromptSubmit hook that
detects complex tasks and routes them through `/project:persist`.

The hook is generated as `.claude/hooks/persist-router.mjs` — an ESM module
that reads the prompt, scores complexity signals, and injects routing context.

Complexity signals (2+ triggers routing in auto mode):
- Multi-step: "then", "after that", numbered steps
- Feature scope: "add/implement/build" + noun phrases
- Refactor scope: "migrate/convert/replace/upgrade"
- Bug with reproduction: "when X happens", "steps to reproduce"
- Explicit: "persist", "keep working", "until done"
- Long prompt: >50 words

Pass-through (no routing):
- Questions, lookups, single-file edits, existing /project: commands
```

Update the Selection Guide table to include:
```
| Persistence routing | Code projects, autonomy level 3+ |
```

**Modify: `src/templates/hooks.md` — Memory Persistence section**

Update the SessionEnd hook description to note the persistence-aware enhancement:
- When `.claude/progress.json` exists with status `in_progress`, include a persistence summary in `memory.json`

Update the SessionStart hook description to note:
- When `memory.json` contains `persistence.active: true`, inject a resume prompt

**Modify: `src/adapter/claude-code.ts`**

In the function that writes hook files to `.claude/hooks/`:
- Add logic to write `persist-router.mjs` when the environment is a code project with autonomy level >= 3

**Tests:**
- Hook template includes persistence routing section
- Selection guide references persistence routing
- `persist-router.mjs` template is syntactically valid ESM
- Adapter writes hook file for L3+ code projects, skips for L1-2

**Acceptance:**
- `npm run build && npx tsc --noEmit && npm test` clean

**Commit:** `feat(harness): add persist-router hook and memory persistence integration`

---

### Step 3: Settings + Autonomy Integration [parallel-safe with Step 4]
> Wire the routing config into settings.json and autonomy levels.

**Modify: `src/templates/settings.md`**

Add `persistence_routing` field to the "Full" settings template:
```json
{
  "persistence_routing": "auto",
  "hooks": {
    "UserPromptSubmit": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "node .claude/hooks/persist-router.mjs"
      }]
    }]
  }
}
```

Add a new "With Persistence Routing" template variant that includes the UserPromptSubmit hook alongside existing PreToolUse, PostToolUse, PostCompact, and SessionStart/End hooks.

**Modify: `src/compiler/prompt.ts` (HARNESS_PROMPT)**

In the Hooks section, after the Memory Persistence Hooks paragraph, add:

```
## Persistence Routing Hook

For code projects with autonomy level 3+, include a `UserPromptSubmit` hook that routes complex tasks through `/project:persist`.
Generate `.claude/hooks/persist-router.mjs` (the routing logic) and add a `UserPromptSubmit` hook entry in settings.json that invokes it.
Also add `"persistence_routing": "auto"` (level 3-4) or `"persistence_routing": "manual"` (level 1-2) to settings.json.
```

**Modify: `src/autonomy.ts`**

In the autonomy level configuration:
- Level 1-2: set `persistence_routing: "manual"` in generated settings
- Level 3-4: set `persistence_routing: "auto"` in generated settings

**Modify: `src/compiler/prompt.ts` (Context Budget)**

Update the hooks budget from "maximum 4" to "maximum 5" to accommodate the UserPromptSubmit hook:
```
- Hooks: maximum 5 (auto-format, block-destructive, PostCompact, memory-persistence, plus one contextual).
```

**Tests:**
- Settings template includes `persistence_routing` field
- Settings template includes `UserPromptSubmit` hook entry
- Autonomy L1-2 → `persistence_routing: "manual"`
- Autonomy L3-4 → `persistence_routing: "auto"`
- Context budget allows 5 hooks

**Acceptance:**
- `npm run build && npx tsc --noEmit && npm test` clean

**Commit:** `feat(harness): wire persistence routing into settings and autonomy levels`

---

### Step 4: Eval Template — `persistence-completion` [parallel-safe with Step 3]
> Measure whether the persistence loop actually improves multi-step task completion.

**Modify: `src/evolve/types.ts`**

Add `'persistence-completion'` to the `EvalTemplate` union type:
```typescript
export type EvalTemplate = 'add-feature' | 'fix-bug' | ... | 'intent-routing' | 'persistence-completion';
```

**Modify: `src/evolve/templates.ts`**

Add to `EVAL_TEMPLATES`:
```typescript
'persistence-completion': {
  id: 'persistence-completion',
  name: 'Persistence Completion',
  description: 'Can the agent complete a multi-criterion task using the persistence loop?',
  bestFor: ['feature-development', 'full-stack', 'api-building', 'maintenance'],
},
```

Update `selectTemplatesForWorkflow()` mappings — add `'persistence-completion'` to:
- `feature-development`
- `full-stack`
- `api-building`
- `maintenance`

**Modify: `src/evolve/templates.ts` (TASK_GENERATION_PROMPT)**

Add guidance for the `persistence-completion` template:
```
- persistence-completion: Task MUST have 3+ acceptance criteria that require sequential implementation. The task description should be a realistic feature request — the agent must parse it into criteria. Judge by: (a) all criteria met (progress.json status: complete), (b) structured tracking used (progress.json exists with 3+ criteria), (c) tests pass, (d) review gate executed (progress.json review field present).
```

**Tests: `src/evolve/__tests__/templates.test.ts`**
- `persistence-completion` exists in EVAL_TEMPLATES
- `selectTemplatesForWorkflow('feature-development')` includes `persistence-completion`
- `selectTemplatesForWorkflow('full-stack')` includes `persistence-completion`
- Task generation prompt references persistence-completion

**Acceptance:**
- `npm run build && npx tsc --noEmit && npm test` clean

**Commit:** `feat(evolve): add persistence-completion eval template`

---

### Step 5: Documentation + ROADMAP Link
> Connect the design doc and update project docs.

**Modify: `ROADMAP.md`**

Update the v2.10.0 section header to include a link to the design doc:
```markdown
### v2.10.0 — Persistent Execution Loop ([design doc](docs/design/v2.10-persistent-execution.md)) [NEXT]
```

**Modify: `docs/DECISIONS.md`** (if it exists)

Add entry:
```
## 2026-04-02: Persistent Execution Loop (v2.10.0)

Decided to implement persistence as a command template + routing hook rather than a runtime daemon.
The persist command reads SPRINT.md criteria, tracks progress in progress.json, and retries failed criteria.
Auto-routing via UserPromptSubmit hook detects complex tasks by scoring multiple complexity signals.

Alternatives considered:
- Runtime daemon (rejected: too complex, doesn't fit Claude Code's session model)
- Extending /project:develop with retry logic (rejected: different abstraction level — develop is phase-based, persist is criterion-based)
- Always-on persistence for all tasks (rejected: overhead for simple tasks, surprising behavior)
```

**Tests:** None (docs only).

**Acceptance:**
- ROADMAP.md links to design doc
- DECISIONS.md records the architectural choice

**Commit:** `docs: v2.10.0 design doc and ROADMAP link`

---

## Execution Order

```
Step 1 (/project:persist template)       ← first: core feature in HARNESS_PROMPT
    │
Step 2 (persist-router hook)             ← depends on Step 1 (references the command)
    │
    ├── Step 3 (settings + autonomy)     ← parallel-safe with Step 4
    │
    ├── Step 4 (eval template)           ← parallel-safe with Step 3
    │
    ▼
Step 5 (docs + ROADMAP)                  ← last: documentation after implementation
```

Steps 3 and 4 can be executed in parallel (they touch different files: settings/autonomy vs evolve templates).

---

## Complexity Estimate

| Step | New Files | Modified Files | New Tests | Lines (est.) |
|------|-----------|----------------|-----------|-------------|
| 1. Persist command template | 0 | 1 (prompt.ts) | ~4 | ~100 |
| 2. Router hook + memory integration | 1 (persist-router.mjs template) | 2 (hooks.md, claude-code.ts) | ~6 | ~150 |
| 3. Settings + autonomy | 0 | 3 (settings.md, prompt.ts, autonomy.ts) | ~5 | ~60 |
| 4. Eval template | 0 | 2 (templates.ts, types.ts) | ~5 | ~50 |
| 5. Docs | 0 | 2 (ROADMAP.md, DECISIONS.md) | 0 | ~30 |
| **Total** | **1 new** | **~8 modified** | **~20** | **~390** |

This is a moderate milestone — mostly prompt engineering and template additions, with one new hook file and integration wiring.

---

## Ralph Loop Prompt

```
Read PLAN-v2.10.0.md. Execute steps 1-5 in order (Steps 3 and 4 can be parallel). For each step: implement the change, run npm run build && npx tsc --noEmit && npm test to verify. Commit after each step passes with conventional commit format. After all steps: run the full test suite one final time and report the result.
```
