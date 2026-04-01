# PLAN-v2.2.1 — Proposer JSON Fix + Mutation Scope Expansion

**Goal:** Fix the #1 blocker (proposer returns English instead of JSON, meaning no mutations are ever applied) AND expand the mutation vocabulary so the loop can remove bloat and optimize MCP config.

**Design doc:** `docs/design/v2.0-kairn-evolve.md` (Section: v2.2.1 — Mutation Scope Expansion)

**Bug report:** `.omc/evolve-bugs.md` (Bugs 3, 4, 5) + latest test run output (2026-04-01)

**Latest test run results:**
```
3 iterations, 4 tasks, baseline 93.0% → best 96.3% (iteration 1)
Reality: Proposer failed on ALL iterations — returned English text instead of JSON.
No mutations were ever applied. Score variance is random Claude Code nondeterminism.
Error: "Proposer returned invalid JSON: Looking at the traces, I need to analyze why..."
```

**Root cause:** `callLLM()` in `src/llm.ts` doesn't use Anthropic's JSON mode or structured output. The system prompt says "Return ONLY valid JSON" but the LLM ignores it and writes natural language analysis first. The parser (`parseProposerResponse`) only handles code fences — it can't extract JSON embedded in prose.

**Depends on:** v2.2.0 — specifically: `callLLM()`, `Mutation` type, `applyMutations()`, `propose()`, `createBaseline()`, `createIsolatedWorkspace()`, `parseProposerResponse()`

**Estimated complexity:** Medium (9 steps, 2 parallel groups)

---

## Implementation Steps

### Step 1: Add JSON Mode to callLLM [parallel-safe]

**What to build:** Add an optional `jsonMode` parameter to `callLLM()` that enables structured JSON output from the provider.

**Files to modify:**
- `src/llm.ts`

**Key implementation details:**
- Add `jsonMode?: boolean` to the options parameter
- For Anthropic provider: There is no built-in `response_format` for Anthropic Messages API. Instead, we must:
  - Prepend `[JSON_ONLY]` or add a more forceful system prompt suffix: `"\n\nIMPORTANT: Your response must be ONLY a valid JSON object. No text before or after. No markdown fences. No explanations. Start with { and end with }."`
  - Alternatively: use tool_use with a schema to force JSON structure (more reliable)
- For OpenAI-compatible providers: Add `response_format: { type: "json_object" }` to the request
- The caller (proposer) passes `jsonMode: true`

**Important Anthropic note:** The most reliable approach for Anthropic is to:
  1. Add a forceful system prompt suffix when `jsonMode` is true
  2. Prefix the assistant response with `{` using the `messages` array (assistant prefill technique):
     ```typescript
     messages: [
       { role: "user", content: userMessage },
       { role: "assistant", content: "{" }
     ]
     ```
     Then prepend `{` to the response text. This forces the model to start generating JSON immediately.

**Verification command:**
```bash
npm run build
npm run typecheck
npm test -- src/__tests__/llm.test.ts
```

**Commit message:** `feat(llm): add jsonMode with assistant prefill for reliable JSON responses`

---

### Step 2: Robust JSON Extraction in Parser [parallel-safe]

**What to build:** Make `parseProposerResponse()` tolerant of prose-wrapped JSON. If the raw response contains JSON embedded in English text, extract it.

**Files to modify:**
- `src/evolve/proposer.ts`

**Key implementation details:**
- Before the current fence-stripping logic, add a JSON extraction step:
  1. Try direct `JSON.parse(cleaned)` first (current behavior)
  2. If that fails, strip markdown fences and try again (current behavior)
  3. If that fails, scan for the first `{` and last `}` in the string, extract that substring, and try `JSON.parse()`
  4. If that fails, try regex for `\{[\s\S]*"reasoning"[\s\S]*"mutations"[\s\S]*\}` to find the JSON block
  5. Only throw after all extraction strategies fail
- This handles the exact failure mode seen in the test run: `"Looking at the traces, I need to analyze... { \"reasoning\": \"...\", \"mutations\": [...] }"`
- Log a warning when fallback extraction is used (so we know the LLM misbehaved)

**Verification command:**
```bash
npm run build
npm test -- src/evolve/__tests__/proposer.test.ts
```

**Commit message:** `fix(evolve): robust JSON extraction from prose-wrapped proposer responses`

---

### Step 3: Wire jsonMode in Proposer [depends-on: 1]

**What to build:** Pass `jsonMode: true` when calling the proposer LLM.

**Files to modify:**
- `src/evolve/proposer.ts`

**Key implementation details:**
- In `propose()`, the existing call is:
  ```typescript
  const response = await callLLM(proposerConfig, userMessage, {
    systemPrompt: PROPOSER_SYSTEM_PROMPT,
    maxTokens: 8192,
  });
  ```
  Add `jsonMode: true`:
  ```typescript
  const response = await callLLM(proposerConfig, userMessage, {
    systemPrompt: PROPOSER_SYSTEM_PROMPT,
    maxTokens: 8192,
    jsonMode: true,
  });
  ```
- The combination of jsonMode (assistant prefill) + robust parser (Step 2) gives us two layers of defense

**Verification command:**
```bash
npm run build
npm test -- src/evolve/__tests__/proposer.test.ts
```

**Commit message:** `feat(evolve): enable jsonMode for proposer LLM call`

---

### Step 4: Expand Mutation Type [parallel-safe]

**What to build:** Add `delete_section` and `delete_file` to the `Mutation.action` union type.

**Files to modify:**
- `src/evolve/types.ts`

**Key implementation details:**
- Change `action: 'replace' | 'add_section' | 'create_file'` → `action: 'replace' | 'add_section' | 'create_file' | 'delete_section' | 'delete_file'`
- `delete_section`: requires `oldText` (the text to remove), `newText` should be empty string
- `delete_file`: only requires `file` and `rationale`, `newText` can be empty string
- No other type changes needed — `oldText` is already optional

**Verification command:**
```bash
npm run build
npm run typecheck
```

**Commit message:** `feat(evolve): add delete_section and delete_file mutation actions`

---

### Step 5: Implement Delete Handlers in Mutator [depends-on: 4]

**What to build:** Handle the two new mutation actions in `applyMutations()`.

**Files to modify:**
- `src/evolve/mutator.ts`

**Key implementation details:**
- After the `create_file` branch in the if/else chain, add:
  - `delete_section`: Read file, verify `oldText` exists in content, replace `oldText` with empty string, write back. Skip if `oldText` is missing or not found in file.
  - `delete_file`: `await fs.rm(filePath, { force: true })`. Use `force: true` so missing files don't throw.
- Security: path traversal check (`..`) already exists above — new actions inherit it
- The `generateDiff` function already handles deleted files (shows all lines as `-`)

**Verification command:**
```bash
npm run build
npm test -- src/evolve/__tests__/mutator.test.ts
```

**Commit message:** `feat(evolve): implement delete_section and delete_file in mutator`

---

### Step 6: Update Proposer JSON Parser for Delete Actions [depends-on: 4]

**What to build:** Allow `parseProposerResponse()` to accept the new action types.

**Files to modify:**
- `src/evolve/proposer.ts`

**Key implementation details:**
- In `parseProposerResponse()`, the action validation currently does:
  ```typescript
  if (action !== 'replace' && action !== 'add_section' && action !== 'create_file') {
    continue;
  }
  ```
  Add `'delete_section'` and `'delete_file'` to the valid set.
- For `delete_section`, require `oldText` (same as `replace`)
- For `delete_file`, `oldText` is not required

**Verification command:**
```bash
npm run build
npm test -- src/evolve/__tests__/proposer.test.ts
```

**Commit message:** `feat(evolve): accept delete mutations in proposer response parser`

---

### Step 7: MCP in Harness Scope [parallel-safe]

**What to build:** Include `.mcp.json` in harness baseline, runner workspace deployment, and proposer reading.

**Files to modify:**
- `src/evolve/baseline.ts` — copy `.mcp.json` into harness snapshot as `mcp.json`
- `src/evolve/runner.ts` — deploy harness `mcp.json` as `.mcp.json` in workspace root

**Key implementation details:**
- **Baseline:** After copying `.claude/` to `iterations/0/harness/`, check for `.mcp.json` at project root. If exists, copy to `iterations/0/harness/mcp.json`. If not, skip silently.
- **Runner:** In `createIsolatedWorkspace()`, after `.claude/` swap, check if harness has `mcp.json` and copy to `.mcp.json` at workspace root. Handle both worktree and copy paths.
- **Proposer:** `buildProposerUserMessage()` already reads all harness files via `readHarnessFiles()` — it will automatically include `mcp.json` once it's in the harness directory.

**Verification command:**
```bash
npm run build
npm test -- src/evolve/__tests__/baseline.test.ts
npm test -- src/evolve/__tests__/runner.test.ts
```

**Commit message:** `feat(evolve): include .mcp.json in harness scope (baseline + runner)`

---

### Step 8: Rebalance Proposer Prompt [parallel-safe]

**What to build:** Update the proposer system prompt to consider removals, list all mutation actions, and mention MCP optimization.

**Files to modify:**
- `src/evolve/proposer.ts`

**Key implementation details:**
- Replace the `## Rules` section of `PROPOSER_SYSTEM_PROMPT`:
  - Remove: `"Prefer ADDITIVE changes over replacements when possible."`
  - Add: Balanced guidance for both additions AND removals
  - List all 5 mutation actions: `replace`, `add_section`, `create_file`, `delete_section`, `delete_file`
  - Add MCP guidance: "If mcp.json is in the harness, you can optimize MCP server configuration"
  - Add lean harness principle: "Leaner harnesses perform better — fewer tokens consumed means more context for the actual task"
- Update the `## Output Format` JSON example to show a delete_section example mutation
- Strengthen JSON formatting instruction: replace `"Return ONLY valid JSON."` with `"Return ONLY a valid JSON object. No text before or after. No markdown code fences. Start your response with { and end with }."`

**Verification command:**
```bash
npm run build
npm test -- src/evolve/__tests__/proposer.test.ts
```

**Commit message:** `feat(evolve): rebalance proposer prompt for add/remove and strengthen JSON instruction`

---

### Step 9: Tests [depends-on: all above]

**What to build:** Comprehensive tests for all changes.

**Files to modify:**
- `src/__tests__/llm.test.ts`
- `src/evolve/__tests__/mutator.test.ts`
- `src/evolve/__tests__/proposer.test.ts`
- `src/evolve/__tests__/baseline.test.ts`

**Key test scenarios:**

**LLM tests:**
- `callLLM` with `jsonMode: true` uses assistant prefill (Anthropic)
- `callLLM` with `jsonMode: true` adds `response_format` (OpenAI)
- `callLLM` without `jsonMode` behaves unchanged (backward compat)

**Proposer parser tests (critical — these cover the exact failure mode):**
- Raw JSON string → parses correctly (existing)
- JSON in markdown fences → parses correctly (existing)
- English text THEN JSON → extracts JSON from prose (**NEW — this is the test run failure**)
- English text with no JSON at all → throws meaningful error
- `parseProposerResponse` accepts `delete_section` action with oldText
- `parseProposerResponse` accepts `delete_file` action without oldText
- `parseProposerResponse` rejects `delete_section` without oldText
- System prompt contains all 5 action types
- System prompt does NOT contain "Prefer ADDITIVE"
- System prompt contains stronger JSON instruction

**Mutator tests:**
- `delete_section` removes matching text from file
- `delete_section` skips if oldText not found
- `delete_file` removes the file
- `delete_file` on non-existent file doesn't throw

**Baseline tests:**
- Snapshot includes `mcp.json` when `.mcp.json` exists
- Snapshot works without `.mcp.json`

**Verification command:**
```bash
npm test
npm run build
```

**Commit message:** `test(evolve): comprehensive tests for JSON extraction, delete mutations, MCP scope`

---

## Parallel Groups

**Group A [parallel, no dependencies]:** Steps 1, 2, 4, 7, 8
- LLM jsonMode, robust parser, types expansion, MCP scope, prompt rebalance — all independent

**Group B [after Group A]:** Steps 3, 5, 6, 9
- Wire jsonMode into proposer, mutator delete handlers, parser update, tests

---

## Success Criteria (v2.2.1 Complete)

- [ ] All 9 steps committed to feature branch
- [ ] `npm run build` succeeds
- [ ] `npm test` passes (all new + existing tests green)
- [ ] **Proposer returns valid JSON** (the #1 blocker — test with real `kairn evolve run`)
- [ ] Prose-wrapped JSON is extracted correctly by parser fallback
- [ ] `delete_section` mutation removes text from harness files
- [ ] `delete_file` mutation removes files from harness
- [ ] `.mcp.json` is captured in baseline and deployed to workspaces
- [ ] Proposer prompt lists all 5 mutation actions
- [ ] Proposer prompt no longer says "Prefer ADDITIVE"
- [ ] `parseProposerResponse` accepts delete_section and delete_file
- [ ] Code follows v2.0-v2.2 patterns (no new dependencies)
