# PLAN v3.0.0 - Agent Harness Platform Refactor

Status: planning backlog  
Prepared: 2026-05-01  
Linear target: Kairn project, implemented by Symphony agents after Linear access is enabled

## Thesis

Kairn should become the default way to spin up agent harnesses for any repo by
making setup cheap, deterministic, target-aware, and repo-specific.

The current product path overuses online LLM/evolution work for setup. The v3
architecture changes the default flow to:

```
repo scan -> repo facts -> recipe match -> HarnessProgram IR -> target adapter -> local validation
```

Evolve remains valuable, but it moves from "default optimizer" to an explicit,
budgeted evaluation lab used for canaries, regression tests, and offline recipe
improvement.

## Product Outcome

The main user workflow should become:

```bash
kairn setup
kairn setup --target codex
kairn setup --target claude-code
kairn setup --target all
kairn setup --target agnostic
kairn setup --budget 0.25 --canary
```

Default behavior:

1. Detect repo structure, package manager, languages, scripts, CI, test commands,
   existing harness files, and installed/desired agent runtimes.
2. Select one or more versioned harness recipes from a local catalog.
3. Render agent-specific output through adapters.
4. Validate generated files locally.
5. Ask before writing unless `--yes` is set.
6. Avoid expensive LLM calls unless deterministic evidence is insufficient or
   the user explicitly enables canary/evolve.

## Runtime Targets

Kairn should support these targets through one shared semantic model:

- `generic`: portable `AGENTS.md` / `HARNESS.md` output with commands, rules,
  verification, and safety policies.
- `codex`: `AGENTS.md`, Codex-friendly skills/subagents/config guidance, and
  sandbox/approval instructions.
- `claude-code`: `.claude/CLAUDE.md`, `.claude/settings.json`, commands,
  agents, skills, hooks, and `.mcp.json`.
- `opencode`: `opencode.json`, `.opencode/agents/`, `.opencode/skills/`,
  permission-aware primary/subagent definitions.
- `forgecode`: `AGENTS.md`, `.forge/agents/`, `forge.yaml` or compatible
  config output where appropriate.
- `hermes`: preserve current Hermes support, but render from shared IR instead
  of Claude-shaped flat fields.

Checked external references:

- OpenAI Codex AGENTS.md:
  https://developers.openai.com/codex/guides/agents-md
- OpenAI Codex configuration and subagents:
  https://developers.openai.com/codex/config-reference,
  https://developers.openai.com/codex/subagents
- OpenAI Codex Linear integration:
  https://developers.openai.com/codex/integrations/linear
- Claude Code settings, subagents, and hooks:
  https://code.claude.com/docs/en/settings,
  https://code.claude.com/docs/en/sub-agents,
  https://code.claude.com/docs/en/hooks
- OpenCode agents and skills:
  https://opencode.ai/docs/agents/,
  https://opencode.ai/docs/skills
- ForgeCode agent configuration and project guidelines:
  https://forgecode.dev/docs/agent-configuration/,
  https://forgecode.dev/docs/creating-agents/,
  https://forgecode.dev/docs/custom-rules/

## Current Problems

### Evolve Is Too Expensive For Default Use

Current defaults imply many Claude task executions before counting proposer,
architect, and scorer calls:

- `src/commands/evolve.ts` defaults to 5 iterations, Sonnet-tier models,
  explore/exploit schedule, KL regularization, and architect iterations.
- `src/evolve/schedule.ts` makes explore/exploit run the architect early and
  periodically.
- `src/evolve/loop.ts` evaluates architect staging on the full task suite.
- `src/evolve/runner.ts` shells to `claude` with fixed text output and no model
  or budget arguments.
- `src/evolve/cost.ts` has pricing helpers, but production code does not use
  them as a control plane.

More important: some measurements are weak enough that the spend is not yet
trustworthy. Scoring happens after `runTask()` has cleaned up the isolated
workspace, and `scoreTask()` receives the trace directory as the workspace path.
That means deterministic verification can run in the wrong place. Architect
staging can also write into the same trace namespace as normal evaluation.

### Compiler Is Still Claude-Shaped

The repo already has a `HarnessIR`, but many nodes and writers assume `.claude/`
layout, Claude slash commands, and Claude settings. `RuntimeTarget` is currently
too small, and `optimize` branches between Claude and Hermes directly instead
of resolving adapters through a registry.

### Setup Uses Large Context Too Early

`optimize` builds a large Markdown intent, optionally appends packed source, and
sends that through multiple compiler agents. This is quality-improving, but it
is the opposite of the desired cheap default path. The default should use local
facts and recipes first, then use a small model only for ambiguity.

### CLI Persistence Has Sharp Edges

Command files mix prompts, orchestration, filesystem writes, and LLM calls.
Some persistence happens before confirmation, `audit-only` still performs
expensive analysis, autonomy can be saved inconsistently, and config/env loading
needs typed validation.

## Target Architecture

### 1. Repo Intelligence Layer

Create a structured `RepoFacts` model from local evidence:

- languages and subdirectory ownership
- package manager and lockfile
- framework and runtime signals
- scripts and verification commands
- CI workflows
- existing harness files
- installed agent CLIs
- MCP and tool configuration
- env key names from examples only
- test/lint/build confidence

This layer should be deterministic and cached. It should not require an LLM.

### 2. Recipe Catalog

Create a versioned catalog of harness recipes:

- `typescript-cli-vitest`
- `typescript-library`
- `nextjs-app-router`
- `node-api-service`
- `python-fastapi-pytest`
- `python-library`
- `monorepo-pnpm-turbo`
- `rust-cargo`
- `go-service`
- `docs-only`
- `no-tests-detected`
- `existing-harness-cleanup`
- `security-sensitive-repo`

Each recipe should define:

- matching signals
- confidence score
- default workflows
- verification commands
- safety rules
- target capability requirements
- expected files
- known failure modes
- benchmark evidence when available

### 3. Target-Neutral HarnessProgram

Introduce a semantic IR separate from target file layouts:

```typescript
interface HarnessProgram {
  meta: HarnessMeta;
  repo: RepoFacts;
  targets: RuntimeTarget[];
  instructions: InstructionBlock[];
  workflows: Workflow[];
  commands: WorkflowCommand[];
  agents: HarnessAgent[];
  skills: HarnessSkill[];
  tools: ToolBinding[];
  permissions: PermissionPolicy;
  hooks: HookPolicy[];
  memory: MemoryPolicy;
  verification: VerificationPolicy;
  docs: HarnessDoc[];
}
```

The existing `HarnessIR` remains as a compatibility layer while the compiler and
adapters migrate.

### 4. Adapter Registry

Create one adapter interface:

```typescript
interface HarnessAdapter {
  id: RuntimeTarget;
  displayName: string;
  detect(projectDir: string, facts: RepoFacts): Promise<TargetDetection>;
  render(program: HarnessProgram, context: RenderContext): RenderedHarness;
  validate(program: HarnessProgram, rendered: RenderedHarness): ValidationIssue[];
  summarize(rendered: RenderedHarness): AdapterSummary;
}
```

All command paths should ask the registry for an adapter rather than hardcoding
target-specific writes.

### 5. Cheap Compiler Pipeline

Default `kairn setup` pipeline:

```
scan local repo
detect target runtimes
select recipes
assemble HarnessProgram
render adapter outputs
validate files and commands
show diff or write
```

Optional LLM use:

- summarize repo purpose when README/package metadata are weak
- resolve recipe ambiguity
- review generated harness for contradictions
- generate a small number of target-specific instructions

Hard rule: do not send packed source to every specialist agent in the default
path.

### 6. Budgeted Evolve Lab

Evolve should become:

```bash
kairn evolve doctor
kairn evolve canary --budget 0.25
kairn evolve run --budget 5.00 --explicit
kairn evolve lab --recipe typescript-cli-vitest
```

Required changes:

- score inside the live workspace or preserve workspace until scoring completes
- pass configured model and budget to the task runner
- capture Claude JSON output and usage when available
- track usage from `callLLM`
- centralize budget enforcement through `ExecutionMeter`
- separate trace namespaces by phase
- persist complete iteration evidence
- label measured versus carried-forward scores
- make architect/PBT opt-in or budget-gated

### 7. Symphony Delivery Model

Once Linear is connected, create one Linear project:

`Kairn v3 - Agent Harness Platform`

Recommended labels:

- `area:evolve`
- `area:ir`
- `area:adapter`
- `area:scanner`
- `area:compiler`
- `area:cli`
- `area:test`
- `area:symphony`
- `priority:blocker`
- `priority:high`
- `type:refactor`
- `type:feature`
- `type:test`

Recommended states:

- Backlog
- Todo
- In Progress
- Human Review
- Rework
- Merging
- Done

Symphony should run no more than 2 implementation agents until the budget and
validation tickets are landed. After that, adapter and recipe tickets can fan
out safely.

## Delivery Waves

### Wave 0 - Planning And Linear Setup

Goal: create the Linear project, epics, labels, and dependency graph.

Blocker: this session does not expose the `linear_graphql` tool required by the
repo's Linear skill. The backlog below is ready to seed once that tool is
available.

### Wave 1 - Stop Wasting Credits

Goal: make evolve measurable and budgeted before running more experiments.

Parallel lanes:

- Evolve scoring correctness
- Cost ledger and budgets
- Trace/log persistence

Exit criteria:

- `kairn evolve run` refuses over-budget runs.
- Reports show measured cost and whether each score is measured or estimated.
- Deterministic verification runs against the actual task workspace.

### Wave 2 - Runtime-Agnostic Foundation

Goal: introduce the shared `HarnessProgram`, target registry, and Claude adapter
without changing external behavior.

Exit criteria:

- Claude output is rendered through the adapter registry.
- Existing tests pass.
- Saved legacy environments still load.

### Wave 3 - Cheap Setup Path

Goal: add `kairn setup` and recipe-first generation.

Exit criteria:

- Fresh repos can get useful `generic`, `codex`, and `claude-code` harnesses
  without evolve.
- `--audit-only` and `--dry-run` are deterministic and cheap.
- LLM calls are optional and visible.

### Wave 4 - Cross-Agent Adapters

Goal: add Codex, OpenCode, ForgeCode, Generic, and Hermes adapters.

Exit criteria:

- Each adapter has golden file tests.
- No Claude syntax leaks into non-Claude outputs.
- Target detection can recommend installed/desired runtimes.

### Wave 5 - Benchmarks And Offline Evolution

Goal: make recipe quality improve over time without charging every user for
online optimization.

Exit criteria:

- A small benchmark corpus exercises recipe outputs across repo types.
- Evolve lab can optimize recipes offline with explicit budgets.
- Recipe metadata includes benchmark evidence.

## Linear-Ready Backlog

### Epic A - Evolve Correctness And Cost Control

#### A1. Fix task scoring workspace semantics

Labels: `area:evolve`, `priority:blocker`, `type:refactor`

Description:
`runTask()` currently cleans up the isolated workspace before `scoreTask()` runs,
and evaluation passes the trace directory as the workspace path. Move scoring
into the live workspace lifecycle or preserve the workspace until scoring
finishes.

Acceptance criteria:

- Deterministic verification commands run from the modified task workspace.
- `runTask()` returns enough data for scoring without using `traceDir` as a
  workspace substitute.
- Cleanup happens only after scoring and trace persistence.
- Tests cover pass/fail scorer commands that depend on files changed by the
  agent.

#### A2. Add first-class evolve telemetry and cost ledger

Labels: `area:evolve`, `priority:blocker`, `type:feature`

Description:
Add usage, model, phase, duration, and estimated USD fields to task attempts,
traces, iteration logs, and reports.

Acceptance criteria:

- `TaskResult`, `Trace`, `IterationLog`, and report JSON include usage and cost
  fields.
- Unknown usage is explicitly marked as estimated or unavailable.
- `src/evolve/cost.ts` is used by production code.
- Existing tests are updated without losing backward compatibility.

#### A3. Route Claude task runs through JSON output and budget caps

Labels: `area:evolve`, `priority:high`, `type:feature`

Description:
Update the Claude runner to request structured output, pass configured model
where supported, and use per-task budget flags where supported.

Acceptance criteria:

- `spawnClaude()` accepts model, max turns, and max budget options.
- Runner parses JSON output for tool calls, usage, and final text.
- Text output is preserved for scorer prompts.
- Tests cover legacy text fallback and structured output parsing.

#### A4. Add evolve budget config and preflight forecasts

Labels: `area:evolve`, `priority:blocker`, `type:feature`

Description:
Expose hard budget settings in `config.yaml` and CLI flags.

Acceptance criteria:

- `EvolveConfig` supports run, task, scorer, proposer, architect, and PBT budget
  fields.
- `kairn evolve run` prints a forecast before expensive work.
- Over-budget runs fail closed unless explicitly overridden.
- Tests cover budget exhaustion and dry-run estimates.

#### A5. Centralize expensive calls behind ExecutionMeter

Labels: `area:evolve`, `priority:high`, `type:refactor`

Description:
Create a common execution wrapper for Claude task runs, proposer calls,
architect calls, synthesis, LLM judges, and rubric scoring.

Acceptance criteria:

- Every expensive call records phase, model, usage, duration, and cost.
- Budget checks happen before and after each expensive call.
- Reports aggregate cost by phase.
- Unit tests cover metered success, failure, and budget exhaustion.

#### A6. Split trace namespaces by phase

Labels: `area:evolve`, `priority:high`, `type:refactor`

Description:
Prevent architect staging, normal evaluation, canaries, and reruns from
overwriting each other's trace evidence.

Acceptance criteria:

- Trace paths include phase and harness id or attempt id.
- Rejected architect staging cannot overwrite accepted iteration traces.
- Proposer loads only the intended trace phase.
- Report generation still finds all relevant traces.

#### A7. Persist complete iteration logs

Labels: `area:evolve`, `priority:high`, `type:refactor`

Description:
Stop reconstructing fake proposal objects from lossy logs. Store complete
iteration evidence.

Acceptance criteria:

- Iteration logs round-trip proposal mutations, rationale, raw score,
  complexity cost, source, phase, timestamps, and cost summary.
- `loadIterationLog()` does not synthesize placeholder proposals.
- Report mutation counts and reasoning are accurate after reload.

#### A8. Replace carried-forward scores with measured/estimated score model

Labels: `area:evolve`, `priority:high`, `type:refactor`

Description:
Adaptive pruning should save money without pretending skipped tasks were
measured in the current iteration.

Acceptance criteria:

- Aggregates distinguish measured scores from carried estimates.
- Best/apply-ready selection requires configured measured evidence.
- Reports label estimates clearly.
- Rollback logic does not select an unmeasured best harness by accident.

#### A9. Add global concurrency and budget gates for PBT

Labels: `area:evolve`, `priority:high`, `type:feature`

Description:
Population-based training should obey global cost and concurrency controls.

Acceptance criteria:

- PBT branches share one global budget.
- Branch launches stop cleanly when the budget is exhausted.
- Global concurrent Claude task runs are capped.
- Tests cover multi-branch budget exhaustion.

#### A10. Make architect/PBT opt-in or strongly budget-gated

Labels: `area:evolve`, `priority:high`, `type:refactor`

Description:
The default evolve schedule should not surprise users with expensive structural
search.

Acceptance criteria:

- Default `architectEvery`, `schedule`, and PBT behavior are cheap and explicit.
- Config generated by `evolve init` exposes all cost-relevant defaults.
- CLI help documents expected spend multipliers.

### Epic B - HarnessProgram IR And Adapter Registry

#### B1. Introduce expanded RuntimeTarget and adapter registry

Labels: `area:adapter`, `area:ir`, `priority:blocker`, `type:refactor`

Acceptance criteria:

- `RuntimeTarget` includes `generic`, `codex`, `claude-code`, `opencode`,
  `forgecode`, and `hermes`.
- Adapters are resolved through a registry.
- `describe` and `optimize` no longer hardcode Claude/Hermes branching.
- Tests cover unknown target handling and aliases.

#### B2. Create target-neutral HarnessProgram IR

Labels: `area:ir`, `priority:blocker`, `type:feature`

Acceptance criteria:

- New semantic IR separates workflows, instructions, tools, permissions,
  agents, skills, hooks, memory, and verification from file paths.
- Existing `HarnessIR` remains loadable for compatibility.
- Tests cover conversion from existing generated Claude IR.

#### B3. Add RenderedHarness file map contract

Labels: `area:adapter`, `priority:high`, `type:feature`

Acceptance criteria:

- Adapters return deterministic file maps with metadata.
- File paths are sanitized and target-root relative.
- Shared diff/write code consumes `RenderedHarness`.
- Tests cover path traversal rejection.

#### B4. Extract Claude Code adapter

Labels: `area:adapter`, `priority:high`, `type:refactor`

Acceptance criteria:

- `.claude/` rendering, `.mcp.json`, settings, hooks, commands, agents, and
  persist-router logic live under the Claude adapter.
- Existing Claude output tests pass.
- No behavior change for current `claude-code` users.

#### B5. Implement Generic adapter MVP

Labels: `area:adapter`, `priority:high`, `type:feature`

Acceptance criteria:

- `generic` renders portable `AGENTS.md` or `HARNESS.md`, workflow docs,
  command references, rules, and tool guidance.
- Output contains no target-specific command syntax.
- Golden tests validate deterministic output.

#### B6. Implement Codex adapter MVP

Labels: `area:adapter`, `priority:high`, `type:feature`

Acceptance criteria:

- `codex` renders `AGENTS.md` and Codex-compatible skill/subagent artifacts
  where applicable.
- Output includes sandbox, approval, validation, and tool usage guidance.
- No Claude `/project:` or `.claude/settings.json` syntax leaks into Codex
  output.
- Golden tests cover a TypeScript CLI repo and a monorepo.

#### B7. Implement OpenCode adapter MVP

Labels: `area:adapter`, `priority:medium`, `type:feature`

Acceptance criteria:

- `opencode` renders `opencode.json` and project-local agents/skills.
- Permissions distinguish planning, build, review, and read-only agents.
- Tests validate JSON schema shape and deterministic file output.

#### B8. Implement ForgeCode adapter MVP

Labels: `area:adapter`, `priority:medium`, `type:feature`

Acceptance criteria:

- `forgecode` renders `AGENTS.md` plus `.forge/agents/` or `forge.yaml`
  artifacts where appropriate.
- Agent tool lists are narrow by role.
- Tests validate frontmatter and deterministic file output.

#### B9. Convert Hermes to shared adapter

Labels: `area:adapter`, `priority:medium`, `type:refactor`

Acceptance criteria:

- Hermes renders from `HarnessProgram`, not Claude flat fields.
- Existing Hermes tests pass.
- Hermes behavior stays backward-compatible.

#### B10. Add adapter capability validation

Labels: `area:adapter`, `area:test`, `priority:high`, `type:feature`

Acceptance criteria:

- Each adapter declares supported features and limitations.
- Compiler warns when a recipe needs unsupported features.
- Validation catches target-incompatible commands, hooks, and tools.

### Epic C - Repo Intelligence And Recipe Catalog

#### C1. Expand scanner harness detection

Labels: `area:scanner`, `priority:high`, `type:feature`

Acceptance criteria:

- Scanner detects `.claude`, `AGENTS.md`, `.codex`, `.opencode`,
  `.forge`, `.agents`, `.mcp.json`, and Hermes config.
- Profile exposes `existingHarnesses[]`.
- Optimize audit reports per-target findings.

#### C2. Add installed runtime detector

Labels: `area:scanner`, `priority:high`, `type:feature`

Acceptance criteria:

- Detection checks for `claude`, `codex`, `opencode`, and `forge` without
  executing untrusted repo commands.
- `kairn setup --target auto` recommends a target based on installed CLIs and
  existing harness files.
- Ambiguity produces one concise prompt.

#### C3. Introduce RepoFacts model

Labels: `area:scanner`, `area:compiler`, `priority:high`, `type:refactor`

Acceptance criteria:

- `RepoFacts` contains local evidence for languages, scripts, CI, package
  manager, test/build/lint commands, env examples, modules, and harnesses.
- Existing `ProjectProfile` remains compatible or converts cleanly.
- Tests cover TypeScript CLI, monorepo, Python service, and docs-only fixtures.

#### C4. Add recipe schema and initial catalog

Labels: `area:compiler`, `priority:blocker`, `type:feature`

Acceptance criteria:

- Recipe schema supports signals, confidence, workflows, verification, safety,
  target capabilities, expected files, and known failure modes.
- Initial catalog includes TypeScript CLI, Next.js, Node API, Python service,
  monorepo, docs-only, no-tests, and existing-harness cleanup recipes.
- Tests validate schema and recipe loading.

#### C5. Implement recipe matching engine

Labels: `area:compiler`, `priority:blocker`, `type:feature`

Acceptance criteria:

- Matcher returns ranked recipe candidates with evidence.
- Ambiguous matches are explainable.
- Deterministic tests cover common repo shapes.

#### C6. Replace giant optimize intent with structured CompilerContext

Labels: `area:compiler`, `priority:high`, `type:refactor`

Acceptance criteria:

- `compile()` accepts structured profile, analysis, snippets, runtime targets,
  registry tools, and harness audit.
- `buildOptimizeIntent()` is no longer required for internal structured calls.
- Packed source is not blindly sent to every specialist.

#### C7. Add source snippet selector

Labels: `area:compiler`, `area:scanner`, `priority:medium`, `type:feature`

Acceptance criteria:

- Compiler can request small targeted snippets by recipe need.
- Snippet selection is cached and bounded by token budget.
- Tests cover entrypoint, config, test, and workflow snippets.

#### C8. Cache repo facts and invalidation

Labels: `area:scanner`, `priority:medium`, `type:feature`

Acceptance criteria:

- Repo facts cache invalidates on relevant manifest/config/harness changes.
- `--refresh` forces rescan.
- Cache never stores secrets.

### Epic D - Cheap Setup CLI And Persistence

#### D1. Add `kairn setup` command

Labels: `area:cli`, `priority:blocker`, `type:feature`

Acceptance criteria:

- `kairn setup` runs scan, target detection, recipe match, render, validate,
  diff, and optional write.
- Supports `--target`, `--yes`, `--dry-run`, `--diff`, `--budget`, and
  `--canary`.
- Defaults to cheap deterministic behavior.

#### D2. Extract setup/describe/optimize workflow services

Labels: `area:cli`, `priority:high`, `type:refactor`

Acceptance criteria:

- Command files mostly parse options and render output.
- Shared services own scan, analyze, compile, preview, confirm, write, and
  persist.
- Existing command tests keep passing.

#### D3. Add fast deterministic audit-only mode

Labels: `area:cli`, `priority:high`, `type:feature`

Acceptance criteria:

- `kairn optimize --audit-only` does not call semantic analysis or compile.
- Audit uses scanner and harness evidence only.
- Tests prove no LLM/analyzer calls.

#### D4. Make project artifact persistence transactional

Labels: `area:cli`, `priority:high`, `type:refactor`

Acceptance criteria:

- `.kairn/harness-ir.json` or future program files are written only after
  confirmed apply/write.
- Declined diff and abort paths leave no new project artifact.
- Tests cover describe, optimize, and setup abort paths.

#### D5. Fix autonomy persistence

Labels: `area:cli`, `priority:medium`, `type:bug`

Acceptance criteria:

- Selected autonomy is present in saved env specs, activated environments,
  project files, and persisted IR metadata.
- Tests cover describe and activate flows.

#### D6. Refactor config into validated repository

Labels: `area:cli`, `priority:medium`, `type:refactor`

Acceptance criteria:

- Missing, malformed, and invalid config are distinct typed states.
- Old config migration still works.
- Secret values are never logged.
- Tests cover save/load/migration/error cases.

#### D7. Extract environment persistence service

Labels: `area:cli`, `priority:medium`, `type:refactor`

Acceptance criteria:

- Global env save/list/load logic is centralized.
- Malformed env handling is explicit.
- `list` uses the service.
- Tests cover sorting, malformed files, and partial ID lookup.

#### D8. Improve diff and automation flags

Labels: `area:cli`, `priority:medium`, `type:feature`

Acceptance criteria:

- Diff output is contextual and reviewable.
- `--diff --yes` can apply without a second prompt.
- `--dry-run` previews without writing.

#### D9. Harden init UX and secret handling

Labels: `area:cli`, `priority:medium`, `type:refactor`

Acceptance criteria:

- Overwriting config requires confirmation unless `--yes`.
- Key verification can be intentionally skipped.
- Config never logs secrets.
- Tests cover overwrite, no-key, and custom provider paths.

#### D10. Upgrade list UX

Labels: `area:cli`, `priority:low`, `type:feature`

Acceptance criteria:

- Environments sort newest-first.
- Malformed entries appear in a warning summary.
- Output includes activation hints.
- `--json` is available for automation.

### Epic E - Validation, Benchmarks, And Recipe Quality

#### E1. Add static harness linter

Labels: `area:test`, `priority:high`, `type:feature`

Acceptance criteria:

- Linter checks contradictions, oversized instruction files, missing validation,
  unsafe commands, path traversal, and target-incompatible syntax.
- `kairn doctor` can run the linter.
- Tests cover each lint category.

#### E2. Add adapter golden tests

Labels: `area:test`, `area:adapter`, `priority:high`, `type:test`

Acceptance criteria:

- Each adapter has at least two golden repo fixtures.
- Golden updates are explicit.
- CI validates deterministic render output.

#### E3. Add setup canary mode

Labels: `area:evolve`, `area:cli`, `priority:medium`, `type:feature`

Acceptance criteria:

- `kairn setup --canary --budget <usd>` runs one or two tiny validation tasks.
- Canary cannot exceed budget.
- Results are reported separately from full evolve.

#### E4. Create recipe benchmark corpus

Labels: `area:test`, `priority:medium`, `type:feature`

Acceptance criteria:

- Corpus includes small fixtures for major repo archetypes.
- Benchmarks validate generated commands, files, and lint output.
- Results can be used to compare recipe changes.

#### E5. Add offline recipe evolve lab

Labels: `area:evolve`, `priority:medium`, `type:feature`

Acceptance criteria:

- Evolve can optimize recipe outputs against benchmark fixtures.
- Runs require explicit budget.
- Results update recipe evidence, not user harnesses by default.

### Epic F - Symphony And Linear Program Operations

#### F1. Create Linear v3 project, labels, and milestones

Labels: `area:symphony`, `priority:blocker`, `type:feature`

Acceptance criteria:

- Linear project `Kairn v3 - Agent Harness Platform` exists.
- Labels from this plan exist.
- Epics A through F are represented as parent issues or project milestones.
- Dependencies are linked.

#### F2. Seed Linear issues from this plan

Labels: `area:symphony`, `priority:blocker`, `type:feature`

Acceptance criteria:

- Every backlog item above exists as a Linear issue with description,
  acceptance criteria, labels, and dependencies.
- Initial state is Backlog unless explicitly selected for Wave 1.
- Issues link back to this plan doc.

#### F3. Add Symphony workpad template for v3 tickets

Labels: `area:symphony`, `priority:high`, `type:feature`

Acceptance criteria:

- Workpad template includes acceptance criteria, validation, risk, and rollback
  sections.
- Template requires `npm run build`, `npx tsc --noEmit`, and `npm test`.
- CLI entrypoint tickets include `node dist/cli.js --help` smoke tests.

#### F4. Define parallelization lanes and dependency gates

Labels: `area:symphony`, `priority:high`, `type:feature`

Acceptance criteria:

- Wave 1 tickets are sequenced to avoid conflicting file ownership.
- Adapter tickets have disjoint write scopes.
- Max concurrent Symphony agents remains 2 until A1-A5 land.

#### F5. Add v3 tracking dashboard issue

Labels: `area:symphony`, `priority:medium`, `type:feature`

Acceptance criteria:

- One Linear tracking issue lists wave status, blockers, active PRs, and budget
  decisions.
- Symphony agents update only their ticket workpads; the tracking issue is
  updated manually or by a coordinator ticket.

## Suggested Symphony Execution Order

Start with these tickets in `Todo`:

1. A1. Fix task scoring workspace semantics
2. A2. Add first-class evolve telemetry and cost ledger

After A1/A2 merge:

3. A3. Route Claude task runs through JSON output and budget caps
4. A4. Add evolve budget config and preflight forecasts

After A1-A4 merge:

5. B1. Introduce expanded RuntimeTarget and adapter registry
6. B2. Create target-neutral HarnessProgram IR
7. D6. Refactor config into validated repository

After B1/B2 merge:

8. B4. Extract Claude Code adapter
9. C1. Expand scanner harness detection
10. C4. Add recipe schema and initial catalog

Then fan out:

- B5/B6/B7/B8 adapter tickets in parallel with disjoint files.
- C5/C6/C7 compiler tickets after recipe schema stabilizes.
- D1 setup command after adapter registry and recipe matching are usable.
- E1/E2 validation tickets once at least Claude, Generic, and Codex adapters
  exist.

## Success Metrics

- A typical TypeScript CLI repo can run `kairn setup --target auto` without any
  paid model call.
- Generated harnesses are specific enough to include actual scripts,
  verification commands, package manager, and repo conventions.
- Claude, Codex, OpenCode, ForgeCode, Generic, and Hermes outputs render from
  the same semantic program.
- `kairn evolve run` displays a forecast, enforces a budget, and reports actual
  or estimated cost.
- Offline benchmarks improve recipes without requiring every user to pay for
  online evolution.

## Open Blocker

Linear access is not currently exposed in this Codex session. The repo's Linear
skill expects Symphony's `linear_graphql` tool, but tool discovery returned only
GitHub and Gmail tools. Once `linear_graphql` is available, the backlog in this
document can be created in Linear and handed to Symphony.
