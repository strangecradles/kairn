import type {
  Trace,
  TraceDiff,
  IterationLog,
  Task,
  CounterfactualReport,
  CounterfactualEntry,
  Score,
} from './types.js';

/**
 * Compute the numeric score from a Score object.
 * Uses the explicit score field if present, otherwise 100 for pass / 0 for fail.
 */
function numericScore(s: Score): number {
  return s.score ?? (s.pass ? 100 : 0);
}

/**
 * Produce a concise summary of stdout differences between two traces.
 * Shows line counts and the first few differing lines rather than a full diff.
 */
function summarizeStdoutDiff(stdoutA: string, stdoutB: string): string {
  if (stdoutA === stdoutB) return '(identical)';

  const linesA = stdoutA.split('\n');
  const linesB = stdoutB.split('\n');

  const parts: string[] = [];
  parts.push(`Line count: ${linesA.length} → ${linesB.length}`);

  // Find first divergence point
  const minLen = Math.min(linesA.length, linesB.length);
  let firstDiff = -1;
  for (let i = 0; i < minLen; i++) {
    if (linesA[i] !== linesB[i]) {
      firstDiff = i;
      break;
    }
  }
  if (firstDiff === -1 && linesA.length !== linesB.length) {
    firstDiff = minLen;
  }
  if (firstDiff >= 0) {
    parts.push(`First difference at line ${firstDiff + 1}`);
  }

  return parts.join('; ');
}

/**
 * Diff two traces for the same task across different iterations.
 *
 * Compares scores, pass/fail status, stdout content, and file changes
 * to produce a structured TraceDiff showing what changed.
 */
export function diffTaskTraces(traceA: Trace, traceB: Trace): TraceDiff {
  const scoreA = numericScore(traceA.score);
  const scoreB = numericScore(traceB.score);

  const filesA = new Set(Object.keys(traceA.filesChanged));
  const filesB = new Set(Object.keys(traceB.filesChanged));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const f of filesB) {
    if (!filesA.has(f)) {
      added.push(f);
    } else if (traceA.filesChanged[f] !== traceB.filesChanged[f]) {
      changed.push(f);
    }
  }
  for (const f of filesA) {
    if (!filesB.has(f)) {
      removed.push(f);
    }
  }

  return {
    taskId: traceA.taskId,
    iterA: traceA.iteration,
    iterB: traceB.iteration,
    scoreDelta: scoreB - scoreA,
    passChanged: traceA.score.pass !== traceB.score.pass,
    stdoutDiff: summarizeStdoutDiff(traceA.stdout, traceB.stdout),
    filesChangedDiff: { added, removed, changed },
  };
}

/**
 * Analyze an evolution run to identify which mutations helped or hurt specific tasks.
 *
 * For each iteration that has a proposal (mutations), compares per-task scores
 * between consecutive iterations to attribute score changes to the mutations applied.
 */
export function diagnoseCounterfactuals(
  iterations: IterationLog[],
  _tasks: Task[],
): CounterfactualReport {
  const entries: CounterfactualEntry[] = [];

  for (let i = 1; i < iterations.length; i++) {
    const prev = iterations[i - 1];
    const curr = iterations[i];

    // Skip iterations without proposals (rollbacks, baseline)
    if (!curr.proposal && !prev.proposal) continue;

    // The proposal that caused this iteration's harness was from the previous iteration
    const proposal = prev.proposal;
    if (!proposal || proposal.mutations.length === 0) continue;

    const mutationSummary = proposal.mutations
      .map(m => `${m.action} in ${m.file}: ${m.rationale}`)
      .join('; ');

    const helpedTasks: Array<{ taskId: string; delta: number }> = [];
    const hurtTasks: Array<{ taskId: string; delta: number }> = [];

    // Compare per-task scores
    const allTaskIds = new Set([
      ...Object.keys(prev.taskResults),
      ...Object.keys(curr.taskResults),
    ]);

    let netDelta = 0;
    for (const taskId of allTaskIds) {
      const prevScore = prev.taskResults[taskId]
        ? numericScore(prev.taskResults[taskId])
        : 0;
      const currScore = curr.taskResults[taskId]
        ? numericScore(curr.taskResults[taskId])
        : 0;
      const delta = currScore - prevScore;

      if (delta > 0) {
        helpedTasks.push({ taskId, delta });
      } else if (delta < 0) {
        hurtTasks.push({ taskId, delta });
      }
      netDelta += delta;
    }

    entries.push({
      iteration: i,
      mutationSummary,
      helpedTasks,
      hurtTasks,
      netScoreDelta: netDelta,
    });
  }

  return { entries };
}
