# PLAN-v2.0.0 — Task Definition & Trace Infrastructure

Implementation plan for v2.0.0 of Kairn Evolve. Follow this exactly for the Ralph loop.

---

## Step 1: Types & Schema (src/evolve/types.ts)

**What to build:** Core types for the evolution system.

**Files to create:**
- `src/evolve/types.ts`

**What goes in it:**
```typescript
// Eval templates
export type EvalTemplate = 'add-feature' | 'fix-bug' | 'refactor' | 'test-writing' | 'config-change' | 'documentation';

// Task definition
export interface Task {
  id: string;
  template: EvalTemplate;
  description: string;
  setup: string;          // shell commands to run before task
  expected_outcome: string | string[];  // acceptance criteria
  scoring: 'pass-fail' | 'llm-judge' | 'rubric';
  rubric?: Array<{ criterion: string; weight: number }>;
  timeout: number;        // seconds
}

// Task execution result
export interface Score {
  pass: boolean;
  score?: number;         // 0-100 for llm-judge/rubric
  details?: string;
  reasoning?: string;
}

// Full execution trace for a single task run
export interface Trace {
  taskId: string;
  iteration: number;
  stdout: string;
  stderr: string;
  toolCalls: unknown[];   // Can detail later
  filesChanged: Record<string, 'created' | 'modified' | 'deleted'>;
  score: Score;
  timing: {
    startedAt: string;    // ISO timestamp
    completedAt: string;
    durationMs: number;
  };
}

// Config file for evolution run
export interface EvolveConfig {
  model: string;                    // e.g., 'claude-sonnet-4-6'
  proposerModel: string;            // e.g., 'claude-opus-4-6'
  scorer: 'pass-fail' | 'llm-judge'; // Default scorer
  maxIterations: number;
  parallelTasks: number;
}

// Iteration metadata
export interface Iteration {
  iteration: number;
  score: number;                    // aggregate score %
  timestamp: string;                // ISO
  mutations: Mutation[];
  results: Map<string, Score>;      // task ID → score
}

// Proposed change to harness
export interface Mutation {
  file: string;                     // e.g., 'CLAUDE.md'
  action: 'replace' | 'add_section' | 'create_file';
  oldText?: string;                 // for 'replace'
  newText: string;                  // for 'replace' and 'add_section'
  rationale: string;                // why this change
}

// Result of proposer's analysis
export interface Proposal {
  reasoning: string;
  mutations: Mutation[];
  expectedImpact: Record<string, string>;  // taskId → impact description
}
```

**Verification:**
```bash
npm run build
# Should succeed with no TypeScript errors
npx tsc --noEmit
```

**Expected outcome:**
- `src/evolve/types.ts` exists and exports all interfaces
- Build passes
- No unused imports or exports

---

## Step 2: Eval Template Menu (src/evolve/templates.ts)

**What to build:** The 6 built-in eval templates + helper to select by workflow.

**Files to create:**
- `src/evolve/templates.ts`

**What goes in it:**
```typescript
// Export the 6 templates with metadata
export const EVAL_TEMPLATES = {
  'add-feature': {
    id: 'add-feature',
    name: 'Add Feature',
    description: 'Can the agent add a new capability?',
    bestFor: ['feature-development', 'api-building', 'full-stack'],
  },
  'fix-bug': {
    id: 'fix-bug',
    name: 'Fix Bug',
    description: 'Can the agent diagnose and fix a problem?',
    bestFor: ['maintenance', 'debugging', 'qa'],
  },
  'refactor': {
    id: 'refactor',
    name: 'Refactor',
    description: 'Can the agent restructure code?',
    bestFor: ['maintenance', 'architecture', 'backend'],
  },
  'test-writing': {
    id: 'test-writing',
    name: 'Test Writing',
    description: 'Can the agent write tests?',
    bestFor: ['tdd', 'qa', 'backend'],
  },
  'config-change': {
    id: 'config-change',
    name: 'Config Change',
    description: 'Can the agent update configuration?',
    bestFor: ['devops', 'infrastructure', 'backend'],
  },
  'documentation': {
    id: 'documentation',
    name: 'Documentation',
    description: 'Can the agent write and update docs?',
    bestFor: ['content', 'api-building', 'full-stack'],
  },
};

// Helper to select relevant templates for a workflow type
export function selectTemplatesForWorkflow(workflowType: string): string[] {
  // Map workflow → most relevant templates (3-5 per workflow)
  const mapping: Record<string, string[]> = {
    'feature-development': ['add-feature', 'test-writing', 'documentation'],
    'api-building': ['add-feature', 'fix-bug', 'test-writing'],
    'full-stack': ['add-feature', 'fix-bug', 'test-writing'],
    'maintenance': ['fix-bug', 'refactor', 'test-writing'],
    'debugging': ['fix-bug', 'test-writing'],
    'qa': ['fix-bug', 'test-writing', 'add-feature'],
    'architecture': ['refactor', 'test-writing', 'config-change'],
    'backend': ['fix-bug', 'refactor', 'config-change', 'test-writing'],
    'devops': ['config-change', 'fix-bug'],
    'infrastructure': ['config-change', 'refactor'],
    'tdd': ['test-writing', 'add-feature', 'fix-bug'],
    'content': ['documentation', 'add-feature'],
    'research': ['documentation', 'add-feature'],
  };
  return mapping[workflowType] || ['add-feature', 'fix-bug', 'test-writing'];
}
```

**Verification:**
```bash
npm run build
npx tsc --noEmit
```

**Expected outcome:**
- `src/evolve/templates.ts` exports EVAL_TEMPLATES and selectTemplatesForWorkflow
- Build passes

---

## Step 3: Workspace Scaffold (src/evolve/init.ts)

**What to build:** Logic for `kairn evolve init` — creates `.kairn-evolve/` directory structure.

**Files to create:**
- `src/evolve/init.ts`

**What goes in it:**
```typescript
import fs from 'fs/promises';
import path from 'path';
import { readFile } from 'fs/promises';
import type { EvolveConfig, Task } from './types.js';

/**
 * Creates the .kairn-evolve/ directory structure.
 * Returns the path to the workspace.
 */
export async function createEvolveWorkspace(
  projectRoot: string,
  config: EvolveConfig,
): Promise<string> {
  const workspace = path.join(projectRoot, '.kairn-evolve');

  // Create directories
  await fs.mkdir(path.join(workspace, 'baseline'), { recursive: true });
  await fs.mkdir(path.join(workspace, 'traces'), { recursive: true });
  await fs.mkdir(path.join(workspace, 'iterations'), { recursive: true });

  // Write config.yaml
  const configYaml = `
model: ${config.model}
proposer_model: ${config.proposerModel}
scorer: ${config.scorer}
max_iterations: ${config.maxIterations}
parallel_tasks: ${config.parallelTasks}
  `.trim();

  await fs.writeFile(path.join(workspace, 'config.yaml'), configYaml, 'utf-8');

  return workspace;
}

/**
 * Writes tasks.yaml to the workspace.
 */
export async function writeTasksFile(
  workspacePath: string,
  tasks: Task[],
): Promise<void> {
  // Convert tasks to YAML format
  let yaml = '# .kairn-evolve/tasks.yaml\n';
  yaml += '# Auto-generated by kairn evolve init — edit freely\n';
  yaml += 'tasks:\n';

  for (const task of tasks) {
    yaml += `  - id: ${task.id}\n`;
    yaml += `    template: ${task.template}\n`;
    yaml += `    description: "${task.description}"\n`;
    yaml += `    setup: |\n`;
    for (const line of task.setup.split('\n')) {
      yaml += `      ${line}\n`;
    }
    yaml += `    expected_outcome: |\n`;
    const outcomes = Array.isArray(task.expected_outcome) 
      ? task.expected_outcome 
      : task.expected_outcome.split('\n');
    for (const outcome of outcomes) {
      yaml += `      - ${outcome}\n`;
    }
    yaml += `    scoring: ${task.scoring}\n`;
    if (task.rubric) {
      yaml += `    rubric:\n`;
      for (const criterion of task.rubric) {
        yaml += `      - criterion: "${criterion.criterion}"\n`;
        yaml += `        weight: ${criterion.weight}\n`;
      }
    }
    yaml += `    timeout: ${task.timeout}\n`;
    yaml += '\n';
  }

  await fs.writeFile(path.join(workspacePath, 'tasks.yaml'), yaml, 'utf-8');
}
```

**Verification:**
```bash
npm run build
# Manual: mkdir -p /tmp/test-project/.claude && cp -r <sample CLAUDE.md> && npm run && node dist/cli.js evolve init --help
```

**Expected outcome:**
- `src/evolve/init.ts` exports createEvolveWorkspace, writeTasksFile
- Build passes
- Directory structure can be created

---

## Step 4: Baseline Snapshot (src/evolve/baseline.ts)

**What to build:** Logic for `kairn evolve baseline` — copies `.claude/` to `.kairn-evolve/baseline/`.

**Files to create:**
- `src/evolve/baseline.ts`

**What goes in it:**
```typescript
import fs from 'fs/promises';
import path from 'path';

/**
 * Creates a baseline snapshot of the .claude/ directory.
 */
export async function snapshotBaseline(
  projectRoot: string,
  workspacePath: string,
): Promise<void> {
  const claudeDir = path.join(projectRoot, '.claude');
  const baselineDir = path.join(workspacePath, 'baseline');

  // Check if .claude exists
  try {
    await fs.access(claudeDir);
  } catch {
    throw new Error(`.claude/ directory not found in ${projectRoot}`);
  }

  // Recursively copy .claude/ to baseline/
  await copyDir(claudeDir, baselineDir);
}

/**
 * Recursively copy directory.
 */
async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
```

**Verification:**
```bash
npm run build
```

**Expected outcome:**
- `src/evolve/baseline.ts` exports snapshotBaseline
- Build passes

---

## Step 5: Task Runner (src/evolve/runner.ts)

**What to build:** Execute a single task and capture full trace.

**Files to create:**
- `src/evolve/runner.ts`

**What goes in it:**
```typescript
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import type { Task, Trace, Score } from './types.js';

/**
 * Run a single task against a harness in an isolated workspace.
 * Captures stdout, stderr, files changed, and scores the result.
 */
export async function runTask(
  task: Task,
  harnessPath: string,
  traceDir: string,
  taskDescription: string,
): Promise<Score> {
  // Create trace directory
  await fs.mkdir(traceDir, { recursive: true });

  // For now: stub implementation that captures basic output
  // Full implementation will invoke Claude Code agent

  const trace: Trace = {
    taskId: task.id,
    iteration: 0,
    stdout: '(task execution pending)',
    stderr: '',
    toolCalls: [],
    filesChanged: {},
    score: { pass: false, details: 'Not yet implemented' },
    timing: {
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 0,
    },
  };

  // Write trace files
  await fs.writeFile(path.join(traceDir, 'stdout.log'), trace.stdout, 'utf-8');
  await fs.writeFile(path.join(traceDir, 'stderr.log'), trace.stderr, 'utf-8');
  await fs.writeFile(path.join(traceDir, 'tool_calls.jsonl'), '', 'utf-8');
  await fs.writeFile(
    path.join(traceDir, 'files_changed.json'),
    JSON.stringify(trace.filesChanged, null, 2),
    'utf-8',
  );
  await fs.writeFile(
    path.join(traceDir, 'timing.json'),
    JSON.stringify(trace.timing, null, 2),
    'utf-8',
  );

  return trace.score;
}
```

**Verification:**
```bash
npm run build
npx tsc --noEmit
```

**Expected outcome:**
- `src/evolve/runner.ts` exports runTask
- Build passes
- Trace files can be written

---

## Step 6: Scorers (src/evolve/scorers.ts)

**What to build:** Pass/fail and LLM-judge scorers.

**Files to create:**
- `src/evolve/scorers.ts`

**What goes in it:**
```typescript
import type { Task, Score } from './types.js';

/**
 * Pass/fail scorer: check if expected outcomes are met.
 */
export async function passFailScorer(
  task: Task,
  workspacePath: string,
  stdout: string,
  stderr: string,
): Promise<Score> {
  // Stub: check for basic success patterns
  // Full implementation will run verification commands

  const passed = !stderr.includes('error') && !stderr.includes('failed');

  return {
    pass: passed,
    score: passed ? 100 : 0,
    details: passed ? 'All checks passed' : 'Verification failed',
  };
}

/**
 * LLM-as-judge scorer: ask LLM to evaluate outcome.
 */
export async function llmJudgeScorer(
  task: Task,
  workspacePath: string,
  stdout: string,
  stderr: string,
): Promise<Score> {
  // Stub: LLM evaluation pending
  return {
    pass: false,
    score: 50,
    reasoning: 'LLM scoring not yet implemented',
  };
}

/**
 * Select scorer based on task config.
 */
export async function scoreTask(
  task: Task,
  workspacePath: string,
  stdout: string,
  stderr: string,
): Promise<Score> {
  if (task.scoring === 'pass-fail') {
    return passFailScorer(task, workspacePath, stdout, stderr);
  } else if (task.scoring === 'llm-judge') {
    return llmJudgeScorer(task, workspacePath, stdout, stderr);
  }
  // Default to pass-fail
  return passFailScorer(task, workspacePath, stdout, stderr);
}
```

**Verification:**
```bash
npm run build
npx tsc --noEmit
```

**Expected outcome:**
- `src/evolve/scorers.ts` exports passFailScorer, llmJudgeScorer, scoreTask
- Build passes

---

## Step 7: Trace Utilities (src/evolve/trace.ts)

**What to build:** Read/write trace files, load traces from filesystem.

**Files to create:**
- `src/evolve/trace.ts`

**What goes in it:**
```typescript
import fs from 'fs/promises';
import path from 'path';
import type { Trace } from './types.js';

/**
 * Load a trace from filesystem.
 */
export async function loadTrace(traceDir: string): Promise<Trace> {
  const stdout = await fs.readFile(path.join(traceDir, 'stdout.log'), 'utf-8').catch(() => '');
  const stderr = await fs.readFile(path.join(traceDir, 'stderr.log'), 'utf-8').catch(() => '');
  const filesChangedStr = await fs.readFile(
    path.join(traceDir, 'files_changed.json'),
    'utf-8',
  ).catch(() => '{}');
  const timingStr = await fs.readFile(
    path.join(traceDir, 'timing.json'),
    'utf-8',
  ).catch(() => '{}');
  const scoreStr = await fs.readFile(
    path.join(traceDir, 'score.json'),
    'utf-8',
  ).catch(() => '{}');

  return {
    taskId: path.basename(traceDir),
    iteration: 0,
    stdout,
    stderr,
    toolCalls: [],
    filesChanged: JSON.parse(filesChangedStr),
    score: JSON.parse(scoreStr),
    timing: JSON.parse(timingStr),
  };
}

/**
 * Load all traces for an iteration.
 */
export async function loadIterationTraces(
  workspacePath: string,
  iteration: number,
): Promise<Trace[]> {
  const tracesDir = path.join(workspacePath, 'traces', iteration.toString());
  const traces: Trace[] = [];

  try {
    const taskDirs = await fs.readdir(tracesDir);
    for (const taskId of taskDirs) {
      const trace = await loadTrace(path.join(tracesDir, taskId));
      traces.push(trace);
    }
  } catch {
    // Directory doesn't exist yet
  }

  return traces;
}

/**
 * Write a trace to filesystem.
 */
export async function writeTrace(traceDir: string, trace: Trace): Promise<void> {
  await fs.mkdir(traceDir, { recursive: true });
  await fs.writeFile(path.join(traceDir, 'stdout.log'), trace.stdout, 'utf-8');
  await fs.writeFile(path.join(traceDir, 'stderr.log'), trace.stderr, 'utf-8');
  await fs.writeFile(path.join(traceDir, 'score.json'), JSON.stringify(trace.score, null, 2), 'utf-8');
}
```

**Verification:**
```bash
npm run build
npx tsc --noEmit
```

**Expected outcome:**
- `src/evolve/trace.ts` exports loadTrace, loadIterationTraces, writeTrace
- Build passes

---

## Step 8: CLI Entry Point (src/commands/evolve.ts)

**What to build:** Wire up subcommands that CALL the actual implementation functions. NOT stubs. Each subcommand must import and invoke the real logic from src/evolve/.

**Files to create:**
- `src/commands/evolve.ts`

**What goes in it:**

The evolve command must:
1. `kairn evolve init` → calls createEvolveWorkspace() and writeTasksFile() from init.ts
   - Reads .claude/CLAUDE.md to extract project context
   - Uses templates.ts to select relevant eval templates
   - Generates tasks.yaml with project-specific evals
   - Shows branded output using ui.ts helpers
   - Has try/catch error handling

2. `kairn evolve baseline` → calls snapshotBaseline() from baseline.ts
   - Verifies .kairn-evolve/ exists (error if not: "Run kairn evolve init first")
   - Copies .claude/ into .kairn-evolve/baseline/
   - Shows success message with file count

3. `kairn evolve run --task <id>` → calls runTask() from runner.ts
   - Loads tasks from tasks.yaml
   - Runs specified task (or all tasks if no --task flag)
   - Writes trace files
   - Shows score output

All actions wrapped in try/catch with ui.error() messages. Follow the pattern from src/commands/describe.ts.

**Verification:**
```bash
npm run build
node dist/cli.js evolve --help
node dist/cli.js evolve init --help
node dist/cli.js evolve baseline --help
node dist/cli.js evolve run --help
# Functional test: create a temp project with .claude/ and run:
# node dist/cli.js evolve init
# node dist/cli.js evolve baseline
```

**Expected outcome:**
- `src/commands/evolve.ts` exports evolveCommand
- Commands call REAL functions, not stubs
- `npm run build` succeeds
- `kairn evolve init` actually creates .kairn-evolve/ with tasks.yaml
- `kairn evolve baseline` actually copies .claude/ to baseline/

---

## Step 9: Wire CLI & Integration Test (src/cli.ts + test)

**What to build:** Add evolveCommand to main CLI, run a basic integration test.

**Files to modify:**
- `src/cli.ts` (add import + addCommand)

**What to change:**

In `src/cli.ts`, add:
```typescript
import { evolveCommand } from "./commands/evolve.js";

// Then in the program.addCommand() section:
program.addCommand(evolveCommand);
```

**Verification:**
```bash
npm run build
node dist/cli.js --help  # Should list 'evolve' as a command
node dist/cli.js evolve --help  # Should show init, baseline, run subcommands
```

**Expected outcome:**
- `kairn evolve` is callable
- All three subcommands appear in help
- No build errors
- Package version is still 1.14.0 (don't bump yet)

---

## Commit & Summary

After all 9 steps:

```bash
git add -A
git commit -m "v2.0.0: Task Definition & Trace Infrastructure

- src/evolve/types.ts: Core types (Task, Trace, Score, Config, etc.)
- src/evolve/templates.ts: 6 eval templates + workflow mapping
- src/evolve/init.ts: Workspace scaffold (creates .kairn-evolve/)
- src/evolve/baseline.ts: Baseline snapshot (.claude/ → baseline/)
- src/evolve/runner.ts: Task runner + trace capture (stubbed)
- src/evolve/scorers.ts: Pass/fail + LLM-judge scorers (stubbed)
- src/evolve/trace.ts: Trace read/write utilities
- src/commands/evolve.ts: CLI subcommands (init, baseline, run)
- src/cli.ts: Wire evolveCommand to main CLI

Status: v2.0.0 foundation complete, ready for quality gate review.
All subcommands callable but core logic (task execution, LLM
instantiation, proposer) deferred to v2.1."
```

---

## Notes for Builder

- **Keep it modular:** Each file is a single concern. Don't merge types into init.
- **Use existing patterns:** Look at `src/commands/describe.ts` and `src/ui.ts` for style.
- **Stub vs. implement:** For v2.0, we're stubbing the hard parts (Claude Code invocation, LLM calls). That's v2.1.
- **TypeScript strict:** All files must pass `npx tsc --noEmit` with no warnings.
- **Imports:** Use `.js` extensions (ESM) and relative paths.
- **No external deps:** Don't add new npm packages without asking.
