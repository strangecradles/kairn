// Eval templates
export type EvalTemplate = 'add-feature' | 'fix-bug' | 'refactor' | 'test-writing' | 'config-change' | 'documentation';

// Rubric criterion for scored evaluations
export interface RubricCriterion {
  criterion: string;
  weight: number;
}

// Task definition
export interface Task {
  id: string;
  template: EvalTemplate;
  description: string;
  setup: string;
  expected_outcome: string | string[];
  scoring: 'pass-fail' | 'llm-judge' | 'rubric';
  rubric?: RubricCriterion[];
  timeout: number;
}

// Task execution result
export interface Score {
  pass: boolean;
  score?: number;
  details?: string;
  reasoning?: string;
  breakdown?: Array<{ criterion: string; score: number; weight: number }>;
}

// Full execution trace for a single task run
export interface Trace {
  taskId: string;
  iteration: number;
  stdout: string;
  stderr: string;
  toolCalls: unknown[];
  filesChanged: Record<string, 'created' | 'modified' | 'deleted'>;
  score: Score;
  timing: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
  };
}

// Config file for evolution run
export interface EvolveConfig {
  model: string;
  proposerModel: string;
  scorer: 'pass-fail' | 'llm-judge' | 'rubric';
  maxIterations: number;
  parallelTasks: number;
}

// Shape of parsed tasks.yaml
export interface TasksFile {
  tasks: Task[];
  config?: Partial<EvolveConfig>;
}

// Represents a snapshotted .claude/ directory
export interface HarnessSnapshot {
  path: string;
  iteration: number;
}

// Returned from runner after a task execution
export interface TaskResult {
  taskId: string;
  score: Score;
  traceDir: string;
}

// Raw output from Claude Code subprocess
export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  toolCalls: unknown[];
  filesChanged: Record<string, 'created' | 'modified' | 'deleted'>;
}

// Iteration metadata
export interface Iteration {
  iteration: number;
  score: number;
  timestamp: string;
  mutations: Mutation[];
  results: Record<string, Score>;
}

// Proposed change to harness
export interface Mutation {
  file: string;
  action: 'replace' | 'add_section' | 'create_file';
  oldText?: string;
  newText: string;
  rationale: string;
}

// Result of proposer's analysis
export interface Proposal {
  reasoning: string;
  mutations: Mutation[];
  expectedImpact: Record<string, string>;
}

// Lightweight project info for task generation
export interface ProjectProfileSummary {
  language: string | null;
  framework: string | null;
  scripts: Record<string, string>;
  keyFiles: string[];
}
