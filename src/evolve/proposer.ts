import fs from 'fs/promises';
import path from 'path';
import { callLLM } from '../llm.js';
import { loadIterationTraces } from './trace.js';
import type { Task, Trace, Proposal, Mutation, IterationLog } from './types.js';
import type { KairnConfig } from '../types.js';

/**
 * System prompt for the proposer agent.
 *
 * Instructs the LLM to analyze execution traces, diagnose root causes
 * of task failures, and propose minimal, targeted harness mutations.
 */
export const PROPOSER_SYSTEM_PROMPT = `You are an expert agent environment optimizer. Your job is to improve a Claude Code
agent environment (.claude/ directory) based on execution traces from real tasks.

## What You Have Access To
1. Current harness: The .claude/ directory files (CLAUDE.md, commands/, rules/, agents/)
2. Execution traces: Full stdout/stderr, tool call sequences, file changes, and scores
3. History: Previous iterations' proposals, diffs, and resulting score changes

## Your Task
Analyze the traces to identify WHY tasks fail or underperform. Then propose specific,
minimal changes to the harness files that will fix those failures.

## Diagnosis Process
1. For each failed/low-scoring task:
   a. Read the full trace (stdout, tool calls, file changes)
   b. Identify the ROOT CAUSE: bad instruction? Missing tool? Wrong rule?
   c. Trace the failure back to a specific harness decision
   d. Propose a fix

2. For each successful task:
   a. Note what worked well
   b. Ensure proposed changes don't break what's working

3. Check history for counterfactual evidence

## Output Format
Return a JSON object:
{
  "reasoning": "Your full causal analysis...",
  "mutations": [
    { "file": "CLAUDE.md", "action": "replace", "old_text": "...", "new_text": "...", "rationale": "..." },
    { "file": "commands/develop.md", "action": "add_section", "new_text": "...", "rationale": "..." }
  ],
  "expected_impact": { "task-id": "+15% — explanation" }
}

## Rules
- MINIMAL changes only. Don't rewrite the entire CLAUDE.md.
- Each mutation must have a clear rationale tied to a specific trace observation.
- Never remove something that's working for another task.
- If a previous iteration's change caused a regression, REVERT it.
- Prefer ADDITIVE changes over replacements when possible.

Return ONLY valid JSON.`;

/** Maximum characters of stdout to include per trace in the prompt. */
const STDOUT_TRUNCATION_LIMIT = 1000;

/** Maximum total characters for the proposer user message. */
const MAX_CONTEXT_CHARS = 100_000;

/**
 * Recursively read all files in a harness directory.
 *
 * Returns a record mapping relative file paths (e.g. "commands/develop.md")
 * to their string contents. Missing or unreadable directories return an
 * empty record.
 */
export async function readHarnessFiles(
  harnessPath: string,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  async function walk(dir: string, prefix: string): Promise<void> {
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const relativePath = prefix ? path.join(prefix, entry.name) : entry.name;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath, relativePath);
      } else if (entry.isFile()) {
        try {
          result[relativePath] = await fs.readFile(fullPath, 'utf-8');
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  await walk(harnessPath, '');
  return result;
}

/**
 * Truncate a string to the last `limit` characters.
 * Prepends a truncation notice if the string was shortened.
 */
function truncateStdout(stdout: string, limit: number): string {
  if (stdout.length <= limit) {
    return stdout;
  }
  return `[...truncated, showing last ${limit} chars...]\n${stdout.slice(-limit)}`;
}

/**
 * Build the user-facing prompt for the proposer LLM call.
 *
 * Assembles current harness file contents, trace summaries (with truncated
 * stdout), task definitions, and iteration history into a single string.
 */
export function buildProposerUserMessage(
  harnessFiles: Record<string, string>,
  traces: Trace[],
  tasks: Task[],
  history: IterationLog[],
): string {
  const sections: string[] = [];

  // Section 1: Current harness files
  sections.push('## Current Harness Files\n');
  const fileEntries = Object.entries(harnessFiles);
  if (fileEntries.length === 0) {
    sections.push('(No harness files found)\n');
  } else {
    for (const [filePath, content] of fileEntries) {
      sections.push(`### ${filePath}\n\`\`\`\n${content}\n\`\`\`\n`);
    }
  }

  // Section 2: Task definitions
  sections.push('## Task Definitions\n');
  if (tasks.length === 0) {
    sections.push('(No tasks defined)\n');
  } else {
    for (const task of tasks) {
      sections.push(
        `### Task: ${task.id}\n` +
        `- Template: ${task.template}\n` +
        `- Description: ${task.description}\n` +
        `- Expected outcome: ${Array.isArray(task.expected_outcome) ? task.expected_outcome.join('; ') : task.expected_outcome}\n` +
        `- Scoring: ${task.scoring}\n`,
      );
    }
  }

  // Section 3: Execution traces
  sections.push('## Execution Traces\n');
  if (traces.length === 0) {
    sections.push('(No traces available)\n');
  } else {
    for (const trace of traces) {
      const scoreNum = trace.score.score !== undefined ? trace.score.score : (trace.score.pass ? 100 : 0);
      const truncatedStdout = truncateStdout(trace.stdout, STDOUT_TRUNCATION_LIMIT);
      const filesChangedList = Object.entries(trace.filesChanged)
        .map(([f, action]) => `  - ${f}: ${action}`)
        .join('\n');

      sections.push(
        `### Trace: ${trace.taskId}\n` +
        `- Pass: ${trace.score.pass}\n` +
        `- Score: ${scoreNum}\n` +
        (trace.score.details ? `- Details: ${trace.score.details}\n` : '') +
        `- Duration: ${trace.timing.durationMs}ms\n` +
        `- Files changed:\n${filesChangedList || '  (none)'}\n` +
        `- Stdout (last ${STDOUT_TRUNCATION_LIMIT} chars):\n\`\`\`\n${truncatedStdout}\n\`\`\`\n`,
      );
    }
  }

  // Section 4: Iteration history
  sections.push('## Iteration History\n');
  if (history.length === 0) {
    sections.push('(No previous iterations)\n');
  } else {
    for (const log of history) {
      const taskScores = Object.entries(log.taskResults)
        .map(([id, s]) => `  - ${id}: ${s.score !== undefined ? s.score : (s.pass ? 100 : 0)} (pass=${s.pass})`)
        .join('\n');

      sections.push(
        `### Iteration ${log.iteration} — Score: ${log.score}\n` +
        `- Task results:\n${taskScores}\n`,
      );

      if (log.proposal) {
        sections.push(
          `- Proposal reasoning: ${log.proposal.reasoning}\n` +
          `- Mutations: ${log.proposal.mutations.length} change(s)\n`,
        );
      }
    }
  }

  let message = sections.join('\n');

  // Truncate if total context exceeds limit to avoid token overflow
  if (message.length > MAX_CONTEXT_CHARS) {
    message = message.slice(0, MAX_CONTEXT_CHARS) + '\n\n[...context truncated to fit token limit...]';
  }

  return message;
}

/**
 * Parse a raw LLM response string into a validated Proposal.
 *
 * Strips markdown code fences, extracts JSON, maps snake_case keys
 * (old_text, new_text, expected_impact) to camelCase, and filters out
 * any mutations with path traversal in the file field.
 *
 * @throws Error if the response is not valid JSON or lacks required fields.
 */
export function parseProposerResponse(raw: string): Proposal {
  // Strip leading/trailing whitespace
  let cleaned = raw.trim();

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Proposer returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Proposer response is not a JSON object');
  }

  const obj = parsed as Record<string, unknown>;

  // Validate reasoning
  if (typeof obj['reasoning'] !== 'string') {
    throw new Error('Proposer response missing required "reasoning" string field');
  }

  // Validate mutations
  if (!Array.isArray(obj['mutations'])) {
    throw new Error('Proposer response missing required "mutations" array field');
  }

  // Parse and validate each mutation
  const mutations: Mutation[] = [];
  for (const entry of obj['mutations'] as unknown[]) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const m = entry as Record<string, unknown>;

    const file = typeof m['file'] === 'string' ? m['file'] : '';
    const action = typeof m['action'] === 'string' ? m['action'] : '';
    const newText = typeof m['new_text'] === 'string'
      ? m['new_text']
      : (typeof m['newText'] === 'string' ? m['newText'] as string : '');
    const oldText = typeof m['old_text'] === 'string'
      ? m['old_text']
      : (typeof m['oldText'] === 'string' ? m['oldText'] as string : undefined);
    const rationale = typeof m['rationale'] === 'string' ? m['rationale'] : '';

    // Security: reject path traversal
    if (file.includes('..')) {
      continue;
    }

    // Validate action type
    if (action !== 'replace' && action !== 'add_section' && action !== 'create_file') {
      continue;
    }

    // For replace action, oldText is required
    if (action === 'replace' && !oldText) {
      continue;
    }

    const mutation: Mutation = {
      file,
      action: action as Mutation['action'],
      newText,
      rationale,
    };

    if (oldText !== undefined) {
      mutation.oldText = oldText;
    }

    mutations.push(mutation);
  }

  // Parse expectedImpact (accept both snake_case and camelCase)
  const rawImpact = obj['expected_impact'] ?? obj['expectedImpact'] ?? {};
  const expectedImpact: Record<string, string> = {};
  if (typeof rawImpact === 'object' && rawImpact !== null) {
    for (const [key, value] of Object.entries(rawImpact as Record<string, unknown>)) {
      expectedImpact[key] = typeof value === 'string' ? value : String(value);
    }
  }

  return {
    reasoning: obj['reasoning'] as string,
    mutations,
    expectedImpact,
  };
}

/**
 * Run the proposer agent: read harness, load traces, call LLM, return a Proposal.
 *
 * The proposer analyzes execution traces from the current iteration, diagnoses
 * root causes of failures, and proposes minimal mutations to the harness files.
 *
 * @param iteration - Current iteration number
 * @param workspacePath - Path to the .kairn-evolve workspace
 * @param harnessPath - Path to the current harness (.claude/) directory
 * @param history - Logs from previous iterations
 * @param tasks - Task definitions being evaluated
 * @param config - Kairn configuration (for LLM access)
 * @param proposerModel - Model ID to use for the proposer call
 * @returns A validated Proposal with reasoning, mutations, and expected impact
 */
export async function propose(
  iteration: number,
  workspacePath: string,
  harnessPath: string,
  history: IterationLog[],
  tasks: Task[],
  config: KairnConfig,
  proposerModel: string,
): Promise<Proposal> {
  // 1. Read harness files
  const harnessFiles = await readHarnessFiles(harnessPath);

  // 2. Load traces for this iteration
  const traces = await loadIterationTraces(workspacePath, iteration);

  // 3. Build user message
  const userMessage = buildProposerUserMessage(harnessFiles, traces, tasks, history);

  // 4. Call LLM with proposer model override
  const proposerConfig: KairnConfig = { ...config, model: proposerModel };
  const response = await callLLM(proposerConfig, userMessage, {
    systemPrompt: PROPOSER_SYSTEM_PROMPT,
    maxTokens: 8192,
  });

  // 5. Parse response
  return parseProposerResponse(response);
}
