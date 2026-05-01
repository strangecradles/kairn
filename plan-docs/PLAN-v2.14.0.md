# PLAN v2.14.0 — Semantic Codebase Analyzer

**Status:** Ready for implementation  
**ROADMAP:** See `ROADMAP.md` → v2.14.0 section  
**Branch:** `feature/v2.14.0-semantic-analyzer`

---

## Overview

The scanner (`src/scanner/scan.ts`) extracts metadata — package.json fields, file existence, dependency lists — but never reads source code. When `buildOptimizeIntent()` feeds this to the compilation agents, they have no choice but to hallucinate generic project structures.

v2.14.0 adds a **semantic analysis stage** between scan and compile:

```
scanProject() → ProjectProfile (metadata)
                      ↓
analyzeProject() → ProjectAnalysis (semantic understanding from source code)
                      ↓
buildOptimizeIntent(profile, analysis) → enriched intent
                      ↓
compile() → domain-specific harness
```

**Key dependency:** [Repomix](https://github.com/yamadashy/repomix) (npm: `repomix`) for intelligent file sampling with token counting, security scanning, and .gitignore awareness.

---

## Step 1: Add Repomix dependency + types [parallel-safe]

**Files:** `package.json`, `src/analyzer/types.ts` (create)

1. `npm install repomix`
2. Create `src/analyzer/types.ts` with:

```ts
export interface ProjectAnalysis {
  purpose: string;
  domain: string;
  key_modules: AnalysisModule[];
  workflows: AnalysisWorkflow[];
  architecture_style: string;
  deployment_model: string;
  dataflow: DataflowEdge[];
  config_keys: ConfigKey[];
  // Cache metadata
  sampled_files: string[];
  content_hash: string;
  analyzed_at: string;
}

export interface AnalysisModule {
  name: string;
  path: string;
  description: string;
  responsibilities: string[];
}

export interface AnalysisWorkflow {
  name: string;
  description: string;
  trigger: string;
  steps: string[];
}

export interface DataflowEdge {
  from: string;
  to: string;
  data: string;
}

export interface ConfigKey {
  name: string;
  purpose: string;
}

export class AnalysisError extends Error {
  constructor(
    message: string,
    public readonly type: 'no_entry_point' | 'empty_sample' | 'llm_parse_failure' | 'repomix_failure',
    public readonly details?: string,
  ) {
    super(message);
    this.name = 'AnalysisError';
  }
}
```

**Verification:** `npm run typecheck`  
**Commit:** `feat(analyzer): add repomix dependency and ProjectAnalysis types`

---

## Step 2: Language-specific sampling strategies [parallel-safe]

**Files:** `src/analyzer/patterns.ts` (create)

Define sampling strategies per language. Each strategy specifies:
- Entry point file patterns (ordered by priority)
- Domain directory patterns (where the "interesting" code lives)
- Config file patterns (always included)
- Exclude patterns (tests, build output, caches)

```ts
export interface SamplingStrategy {
  language: string;
  extensions: string[];
  entryPoints: string[];           // ordered: try first, then second, etc.
  domainPatterns: string[];        // glob patterns for "core" directories
  configPatterns: string[];        // always include these
  excludePatterns: string[];       // never include these
  maxFilesPerCategory: number;     // cap per entry/domain/config
}

export const STRATEGIES: Record<string, SamplingStrategy> = {
  python: {
    language: 'Python',
    extensions: ['.py'],
    entryPoints: ['main.py', 'app.py', 'run.py', 'cli.py', 'server.py', '__main__.py',
                  'src/main.py', 'src/app.py', 'src/__main__.py'],
    domainPatterns: ['src/', 'lib/', 'app/', 'models/', 'pipelines/', 'services/',
                     'api/', 'core/', 'engine/'],
    configPatterns: ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt',
                     'Pipfile', 'poetry.lock'],
    excludePatterns: ['**/__pycache__/**', '**/*.pyc', '**/test_*', '**/*_test.py',
                      '**/tests/**', '**/.venv/**', '**/venv/**', '**/dist/**',
                      '**/build/**', '**/*.egg-info/**'],
    maxFilesPerCategory: 5,
  },
  typescript: {
    language: 'TypeScript',
    extensions: ['.ts', '.tsx'],
    entryPoints: ['src/index.ts', 'src/main.ts', 'src/app.ts', 'index.ts',
                  'src/server.ts', 'src/cli.ts', 'pages/index.tsx', 'app/page.tsx'],
    domainPatterns: ['src/lib/', 'src/services/', 'src/modules/', 'src/api/',
                     'src/core/', 'src/components/', 'src/routes/', 'src/handlers/'],
    configPatterns: ['tsconfig.json', 'package.json'],
    excludePatterns: ['**/__tests__/**', '**/*.test.ts', '**/*.spec.ts',
                      '**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**'],
    maxFilesPerCategory: 5,
  },
  go: {
    language: 'Go',
    extensions: ['.go'],
    entryPoints: ['main.go', 'cmd/main.go', 'cmd/server/main.go'],
    domainPatterns: ['internal/', 'pkg/', 'api/', 'handlers/', 'services/'],
    configPatterns: ['go.mod', 'go.sum'],
    excludePatterns: ['**/*_test.go', '**/vendor/**', '**/testdata/**'],
    maxFilesPerCategory: 5,
  },
  rust: {
    language: 'Rust',
    extensions: ['.rs'],
    entryPoints: ['src/main.rs', 'src/lib.rs'],
    domainPatterns: ['src/', 'crates/'],
    configPatterns: ['Cargo.toml', 'Cargo.lock'],
    excludePatterns: ['**/target/**', '**/tests/**', '**/benches/**'],
    maxFilesPerCategory: 5,
  },
};

export function getStrategy(language: string | null): SamplingStrategy | null;
export function getAlwaysInclude(): string[];  // README.md, README.rst, etc.
```

**Verification:** `npm run typecheck`  
**Commit:** `feat(analyzer): language-specific file sampling strategies`

---

## Step 3: Repomix adapter [depends on Step 1]

**Files:** `src/analyzer/repomix-adapter.ts` (create)

Wrap Repomix's API for our use case:

```ts
export interface RepomixResult {
  content: string;        // packed file contents (markdown format)
  fileCount: number;
  tokenCount: number;
  filePaths: string[];    // which files were included
}

export async function packCodebase(
  dir: string,
  options: {
    include?: string[];
    exclude?: string[];
    maxTokens?: number;
    outputFormat?: 'markdown' | 'xml' | 'json';
  }
): Promise<RepomixResult>;
```

Key behaviors:
- Call Repomix programmatically (not via CLI spawn)
- If Repomix API isn't available as a library, fall back to CLI: `npx repomix --output /tmp/kairn-pack.md --include "..." --exclude "..."`
- Parse output to extract file list and content
- Enforce token budget — if result exceeds `maxTokens`, truncate least-important files (by strategy ordering)

**Verification:** Manual test against a real repo  
**Commit:** `feat(analyzer): repomix adapter for intelligent file packing`

---

## Step 4: Core analyzer module [depends on Steps 1, 2, 3]

**Files:** `src/analyzer/analyze.ts` (create)

The main analysis function:

```ts
export async function analyzeProject(
  dir: string,
  profile: ProjectProfile,
  config: KairnConfig,
  options?: { refresh?: boolean }
): Promise<ProjectAnalysis>;
```

Flow:
1. Check cache (`.kairn-analysis.json`) — return if valid and not `--refresh`
2. Determine language from `profile.language`
3. Get sampling strategy from `patterns.ts`
4. If no strategy matches → throw `AnalysisError('no_entry_point', ...)`
5. Use Repomix adapter to pack sampled files (5000 token budget)
6. If Repomix returns 0 files → throw `AnalysisError('empty_sample', ...)`
7. Call LLM with analysis prompt + packed content
8. Parse response as `ProjectAnalysis` JSON
9. If parse fails → throw `AnalysisError('llm_parse_failure', ...)`
10. Compute content hash of sampled files
11. Write cache to `.kairn-analysis.json`
12. Return `ProjectAnalysis`

**LLM System Prompt:**

```
You are analyzing a codebase to understand its purpose, architecture, and key workflows.

You will receive sampled source files from the project. Produce a JSON analysis.

## Rules
- Be SPECIFIC. Don't say "data processing" — say "Bayesian posterior estimation via SBI".
- Don't list generic modules — list the domain-specific ones that define THIS project.
- Every field must reflect what you actually see in the code. If unsure, say "unknown".
- Do NOT hallucinate files, functions, or modules that aren't in the samples.

## Output Format
Return a single JSON object:
{
  "purpose": "one-line project goal",
  "domain": "category",
  "key_modules": [{ "name": "...", "path": "...", "description": "...", "responsibilities": ["..."] }],
  "workflows": [{ "name": "...", "description": "...", "trigger": "...", "steps": ["..."] }],
  "architecture_style": "monolithic | microservice | serverless | CLI | library | plugin",
  "deployment_model": "local | containerized | serverless | hybrid",
  "dataflow": [{ "from": "module_a", "to": "module_b", "data": "what flows between them" }],
  "config_keys": [{ "name": "ENV_VAR_NAME", "purpose": "what it configures" }]
}
```

**Verification:** `npm run typecheck`  
**Commit:** `feat(analyzer): core semantic analysis with LLM and fail-hard policy`

---

## Step 5: Cache module [parallel-safe after Step 1]

**Files:** `src/analyzer/cache.ts` (create)

```ts
export interface AnalysisCache {
  analysis: ProjectAnalysis;
  content_hash: string;
  kairn_version: string;
}

export async function readCache(dir: string): Promise<AnalysisCache | null>;
export async function writeCache(dir: string, analysis: ProjectAnalysis): Promise<void>;
export async function computeContentHash(filePaths: string[], dir: string): Promise<string>;
export async function isCacheValid(dir: string): Promise<boolean>;
```

Cache file: `<project-dir>/.kairn-analysis.json`

Invalidation: hash of sampled file contents. If any sampled file changed → cache invalid.

**Verification:** `npm run typecheck`  
**Commit:** `feat(analyzer): analysis caching with content-hash invalidation`

---

## Step 6: Integrate into optimize pipeline [depends on Steps 4, 5]

**Files:** `src/commands/optimize.ts` (modify)

1. After `scanProject(targetDir)`, add:

```ts
// Semantic analysis
console.log(ui.section("Codebase Analysis"));
const analysisSpinner = ora({ text: "Analyzing source code...", indent: 2 }).start();
try {
  const analysis = await analyzeProject(targetDir, profile, config);
  analysisSpinner.succeed("Codebase analyzed");
  console.log(ui.kv("Purpose:", analysis.purpose));
  console.log(ui.kv("Domain:", analysis.domain));
  console.log(ui.kv("Modules:", analysis.key_modules.map(m => m.name).join(", ")));
  console.log(ui.kv("Workflows:", analysis.workflows.map(w => w.name).join(", ")));
} catch (err) {
  analysisSpinner.fail("Analysis failed");
  if (err instanceof AnalysisError) {
    console.log(ui.errorBox("KAIRN — Analysis Error", `${err.message}\n\nRun \`kairn analyze\` for details.`));
    process.exit(1);
  }
  throw err;
}
```

2. Update `buildOptimizeIntent()` signature to accept `ProjectAnalysis`:

```ts
function buildOptimizeIntent(profile: ProjectProfile, analysis: ProjectAnalysis): string
```

3. Add semantic analysis sections to the intent:

```ts
parts.push(`## Semantic Analysis (from source code)\n`);
parts.push(`Purpose: ${analysis.purpose}`);
parts.push(`Domain: ${analysis.domain}`);
parts.push(`Architecture: ${analysis.architecture_style}`);
parts.push(`Deployment: ${analysis.deployment_model}`);

parts.push(`\n### Key Modules`);
for (const mod of analysis.key_modules) {
  parts.push(`- **${mod.name}** (${mod.path}): ${mod.description}`);
  parts.push(`  Owns: ${mod.responsibilities.join(", ")}`);
}

parts.push(`\n### Core Workflows`);
for (const wf of analysis.workflows) {
  parts.push(`- **${wf.name}**: ${wf.description}`);
  parts.push(`  Trigger: ${wf.trigger}`);
  parts.push(`  Steps: ${wf.steps.join(" → ")}`);
}

parts.push(`\n### Dataflow`);
for (const edge of analysis.dataflow) {
  parts.push(`- ${edge.from} → ${edge.to}: ${edge.data}`);
}

if (analysis.config_keys.length > 0) {
  parts.push(`\n### Configuration`);
  for (const key of analysis.config_keys) {
    parts.push(`- \`${key.name}\`: ${key.purpose}`);
  }
}
```

**Verification:** `npm run typecheck && npm test`  
**Commit:** `feat(optimize): integrate semantic analyzer into compilation pipeline`

---

## Step 7: `kairn analyze` CLI command [depends on Step 4]

**Files:** `src/commands/analyze.ts` (create), `src/cli.ts` (modify)

New standalone command:

```
kairn analyze [--refresh] [--json]
```

- Runs `scanProject()` + `analyzeProject()` on `cwd`
- Displays analysis results in formatted output
- `--refresh` forces re-analysis, bypasses cache
- `--json` outputs raw `ProjectAnalysis` JSON (for piping)
- Shows cache status: "Using cached analysis (2 hours old)" or "Analyzing from scratch..."

Register in `cli.ts` alongside other commands.

**Verification:** `npm run build && node dist/cli.js analyze --help`  
**Commit:** `feat(cli): add kairn analyze command`

---

## Step 8: Tests — Wave 1 [parallel-safe]

**Files:**
- `src/analyzer/__tests__/types.test.ts` — type validation, AnalysisError construction
- `src/analyzer/__tests__/patterns.test.ts` — strategy lookup, always-include files, edge cases (unknown language)
- `src/analyzer/__tests__/cache.test.ts` — read/write cache, hash computation, invalidation

**Commit:** `test(analyzer): types, patterns, and cache unit tests`

---

## Step 9: Tests — Wave 2 [depends on Steps 3, 4]

**Files:**
- `src/analyzer/__tests__/analyze.test.ts` — full analysis flow with mocked LLM and Repomix
  - Test: valid analysis returns structured JSON
  - Test: no entry point → throws AnalysisError('no_entry_point')
  - Test: empty sample → throws AnalysisError('empty_sample')
  - Test: LLM returns garbage → throws AnalysisError('llm_parse_failure')
  - Test: cached analysis returned when valid
  - Test: cache bypassed with `refresh: true`
- `src/analyzer/__tests__/repomix-adapter.test.ts` — Repomix wrapper tests

**Commit:** `test(analyzer): core analysis and repomix adapter tests`

---

## Step 10: Tests — Integration [depends on Step 6]

**Files:**
- `src/compiler/__tests__/integration.test.ts` (modify) — verify enriched intent includes analysis fields
- `src/commands/__tests__/optimize.test.ts` (create or modify) — verify optimize pipeline calls analyzer

**Commit:** `test(analyzer): integration tests for optimize pipeline`

---

## Step 11: Finalize

1. `npm run build` — must succeed
2. `npm run typecheck` — no errors
3. `npx vitest run` — all tests pass
4. Update CHANGELOG.md with v2.14.0 entry
5. Update ROADMAP.md checkboxes
6. `git log --oneline -15` — verify commit history
7. Manual smoke test: `kairn analyze` in a real project directory

**Commit:** `chore: v2.14.0 finalization`

---

## Parallelism Map

```
Wave 1 (independent):  Steps 1, 2, 5, 8
Wave 2 (depends on 1): Steps 3, 4
Wave 3 (depends on 2): Steps 6, 7, 9
Wave 4 (depends on 3): Steps 10
Wave 5 (all):          Step 11
```

---

## Key Constraints

- **Fail hard:** No fallback to metadata-only. If analysis fails, the user must fix the issue (missing files, unsupported language) or use `kairn describe` for intent-only compilation.
- **Repomix as dependency:** Don't reinvent file sampling. Use Repomix for .gitignore awareness, token counting, and security scanning.
- **Token budget: 5000 tokens** for sampled code content. Enough for 15-20 key files in summary.
- **TDD mandatory:** RED → GREEN → REFACTOR for every step.
- **Strict TypeScript:** no `any`, no `ts-ignore`, `.js` extensions on imports.
- **Backward compatible:** `kairn describe` (no existing project) works exactly as before. Only `kairn optimize` and the new `kairn analyze` use the analyzer.

## Success Criteria

1. `kairn analyze` in inferix repo → returns analysis with "SBI", "warfarin PKPD", "Modal", "FastAPI" in output
2. `kairn optimize` in inferix repo → generated CLAUDE.md references actual modules, not hallucinated `src/api/`
3. `kairn analyze` in empty dir → throws AnalysisError, not a generic result
4. `kairn analyze --refresh` re-runs analysis even with valid cache
5. `.kairn-analysis.json` written and read correctly on second run
6. `kairn describe` in empty dir → works exactly as before (no analyzer involved)
7. All existing tests pass
8. `npm run build` clean
