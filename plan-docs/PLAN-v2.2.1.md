# PLAN-v2.2.2 — Proposer JSON Fix (Critical Blocker)

**Goal:** Fix the #1 blocker discovered in post-v2.2.1 testing: proposer returns English instead of JSON, meaning no mutations are ever applied despite the loop running successfully.

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

**Estimated complexity:** Small (4 steps, 2 groups)

---

## Implementation Steps

### Step 1: Add JSON Mode to callLLM [parallel-safe] ⭐ CRITICAL

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

### Step 2: Robust JSON Extraction in Parser [parallel-safe] ⭐ CRITICAL

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

### Step 4: Tests [depends-on: 1, 2, 3]

**What to build:** Tests for JSON mode, robust extraction, and proposer wire.

**Files to modify:**
- `src/__tests__/llm.test.ts`
- `src/evolve/__tests__/proposer.test.ts`

**Key test scenarios:**

**LLM tests:**
- `callLLM` with `jsonMode: true` uses assistant prefill (Anthropic)
- `callLLM` with `jsonMode: true` adds `response_format` (OpenAI)
- `callLLM` without `jsonMode` behaves unchanged (backward compat)

**Proposer parser tests (critical — these cover the exact failure mode):**
- Raw JSON string → parses correctly (existing)
- JSON in markdown fences → parses correctly (existing)
- English text THEN JSON → extracts JSON from prose (**NEW — this is the blocker**)
  - Example: `"Looking at the traces... { \"reasoning\": \"...\", \"mutations\": [...] }"` → extracts and parses
- English text with no JSON at all → throws meaningful error
- System prompt includes `jsonMode` instruction

**Verification command:**
```bash
npm test -- src/__tests__/llm.test.ts src/evolve/__tests__/proposer.test.ts
npm run build
```

**Commit message:** `test(evolve): add tests for jsonMode, robust JSON extraction, and assistant prefill`

---

## Parallel Groups

**Group A [parallel, no dependencies]:** Steps 1, 2
- LLM jsonMode with assistant prefill, robust JSON extraction — independent

**Group B [after Group A]:** Steps 3, 4
- Wire jsonMode into proposer, tests

---

## Success Criteria (v2.2.2 Complete)

- [ ] All 4 steps committed to feature branch
- [ ] `npm run build` succeeds
- [ ] `npm test` passes (all new + existing tests green)
- [ ] **Proposer returns valid JSON on real `kairn evolve run`** (the #1 blocker)
- [ ] Prose-wrapped JSON is extracted correctly by parser fallback
- [ ] Assistant prefill forces JSON start for Anthropic
- [ ] OpenAI-compatible providers use `response_format`
- [ ] Backward compat: `callLLM()` without `jsonMode` unchanged
- [ ] Code follows v2.0-v2.2 patterns (no new dependencies)
