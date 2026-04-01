import { describe, it, expect } from 'vitest';
import { diffTaskTraces, diagnoseCounterfactuals } from '../diagnosis.js';
import type { Trace, IterationLog, Task, Proposal } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrace(overrides: Partial<Trace> = {}): Trace {
  return {
    taskId: 'task-1',
    iteration: 0,
    stdout: 'output line 1\noutput line 2',
    stderr: '',
    toolCalls: [],
    filesChanged: {},
    score: { pass: false, score: 50 },
    timing: {
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:01:00.000Z',
      durationMs: 60000,
    },
    ...overrides,
  };
}

function makeIterationLog(overrides: Partial<IterationLog> = {}): IterationLog {
  return {
    iteration: 0,
    score: 50,
    taskResults: { 'task-1': { pass: false, score: 50 } },
    proposal: null,
    diffPatch: null,
    timestamp: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    reasoning: 'Test reasoning',
    mutations: [
      {
        file: 'CLAUDE.md',
        action: 'add_section',
        newText: '## New section',
        rationale: 'Add guidance',
      },
    ],
    expectedImpact: {},
    ...overrides,
  };
}

function makeTask(id: string): Task {
  return {
    id,
    template: 'add-feature',
    description: `Task ${id}`,
    setup: '',
    expected_outcome: 'Outcome',
    scoring: 'pass-fail',
    timeout: 60,
  };
}

// ---------------------------------------------------------------------------
// diffTaskTraces
// ---------------------------------------------------------------------------

describe('diffTaskTraces', () => {
  it('computes score delta between two traces', () => {
    const traceA = makeTrace({ iteration: 0, score: { pass: false, score: 40 } });
    const traceB = makeTrace({ iteration: 1, score: { pass: true, score: 80 } });

    const diff = diffTaskTraces(traceA, traceB);

    expect(diff.taskId).toBe('task-1');
    expect(diff.iterA).toBe(0);
    expect(diff.iterB).toBe(1);
    expect(diff.scoreDelta).toBe(40);
  });

  it('detects pass/fail state change', () => {
    const traceA = makeTrace({ score: { pass: false, score: 30 } });
    const traceB = makeTrace({ score: { pass: true, score: 70 } });

    const diff = diffTaskTraces(traceA, traceB);

    expect(diff.passChanged).toBe(true);
  });

  it('reports no pass change when both pass', () => {
    const traceA = makeTrace({ score: { pass: true, score: 60 } });
    const traceB = makeTrace({ score: { pass: true, score: 80 } });

    const diff = diffTaskTraces(traceA, traceB);

    expect(diff.passChanged).toBe(false);
  });

  it('uses 100/0 fallback when score field is undefined', () => {
    const traceA = makeTrace({ score: { pass: false } });
    const traceB = makeTrace({ score: { pass: true } });

    const diff = diffTaskTraces(traceA, traceB);

    expect(diff.scoreDelta).toBe(100);
  });

  it('detects added files in filesChanged', () => {
    const traceA = makeTrace({ filesChanged: { 'src/a.ts': 'created' } });
    const traceB = makeTrace({
      filesChanged: { 'src/a.ts': 'created', 'src/b.ts': 'created' },
    });

    const diff = diffTaskTraces(traceA, traceB);

    expect(diff.filesChangedDiff.added).toEqual(['src/b.ts']);
    expect(diff.filesChangedDiff.removed).toEqual([]);
  });

  it('detects removed files in filesChanged', () => {
    const traceA = makeTrace({
      filesChanged: { 'src/a.ts': 'created', 'src/b.ts': 'modified' },
    });
    const traceB = makeTrace({ filesChanged: { 'src/a.ts': 'created' } });

    const diff = diffTaskTraces(traceA, traceB);

    expect(diff.filesChangedDiff.removed).toEqual(['src/b.ts']);
  });

  it('detects changed file actions', () => {
    const traceA = makeTrace({ filesChanged: { 'src/a.ts': 'created' } });
    const traceB = makeTrace({ filesChanged: { 'src/a.ts': 'modified' } });

    const diff = diffTaskTraces(traceA, traceB);

    expect(diff.filesChangedDiff.changed).toEqual(['src/a.ts']);
  });

  it('produces stdout diff summary for identical output', () => {
    const traceA = makeTrace({ stdout: 'same' });
    const traceB = makeTrace({ stdout: 'same' });

    const diff = diffTaskTraces(traceA, traceB);

    expect(diff.stdoutDiff).toBe('(identical)');
  });

  it('produces stdout diff summary for different output', () => {
    const traceA = makeTrace({ stdout: 'line1\nline2' });
    const traceB = makeTrace({ stdout: 'line1\nchanged\nline3' });

    const diff = diffTaskTraces(traceA, traceB);

    expect(diff.stdoutDiff).toContain('Line count');
    expect(diff.stdoutDiff).toContain('First difference at line 2');
  });
});

// ---------------------------------------------------------------------------
// diagnoseCounterfactuals
// ---------------------------------------------------------------------------

describe('diagnoseCounterfactuals', () => {
  it('identifies tasks helped by a mutation', () => {
    const iterations: IterationLog[] = [
      makeIterationLog({
        iteration: 0,
        score: 50,
        taskResults: { 'task-1': { pass: false, score: 50 } },
        proposal: makeProposal(),
      }),
      makeIterationLog({
        iteration: 1,
        score: 80,
        taskResults: { 'task-1': { pass: true, score: 80 } },
      }),
    ];

    const report = diagnoseCounterfactuals(iterations, [makeTask('task-1')]);

    expect(report.entries).toHaveLength(1);
    expect(report.entries[0].helpedTasks).toHaveLength(1);
    expect(report.entries[0].helpedTasks[0].taskId).toBe('task-1');
    expect(report.entries[0].helpedTasks[0].delta).toBe(30);
    expect(report.entries[0].hurtTasks).toHaveLength(0);
    expect(report.entries[0].netScoreDelta).toBe(30);
  });

  it('identifies tasks hurt by a mutation', () => {
    const iterations: IterationLog[] = [
      makeIterationLog({
        iteration: 0,
        score: 80,
        taskResults: {
          'task-1': { pass: true, score: 80 },
          'task-2': { pass: true, score: 80 },
        },
        proposal: makeProposal(),
      }),
      makeIterationLog({
        iteration: 1,
        score: 65,
        taskResults: {
          'task-1': { pass: true, score: 90 },
          'task-2': { pass: false, score: 40 },
        },
      }),
    ];

    const report = diagnoseCounterfactuals(iterations, [
      makeTask('task-1'),
      makeTask('task-2'),
    ]);

    expect(report.entries).toHaveLength(1);
    expect(report.entries[0].helpedTasks).toHaveLength(1);
    expect(report.entries[0].helpedTasks[0].taskId).toBe('task-1');
    expect(report.entries[0].hurtTasks).toHaveLength(1);
    expect(report.entries[0].hurtTasks[0].taskId).toBe('task-2');
    expect(report.entries[0].hurtTasks[0].delta).toBe(-40);
    expect(report.entries[0].netScoreDelta).toBe(-30);
  });

  it('includes mutation summary from proposal', () => {
    const iterations: IterationLog[] = [
      makeIterationLog({
        iteration: 0,
        score: 50,
        taskResults: { 'task-1': { pass: false, score: 50 } },
        proposal: makeProposal({
          mutations: [
            {
              file: 'CLAUDE.md',
              action: 'replace',
              oldText: 'old',
              newText: 'new',
              rationale: 'Improve instructions',
            },
          ],
        }),
      }),
      makeIterationLog({
        iteration: 1,
        score: 70,
        taskResults: { 'task-1': { pass: true, score: 70 } },
      }),
    ];

    const report = diagnoseCounterfactuals(iterations, [makeTask('task-1')]);

    expect(report.entries[0].mutationSummary).toContain('CLAUDE.md');
    expect(report.entries[0].mutationSummary).toContain('Improve instructions');
  });

  it('skips iterations without proposals', () => {
    const iterations: IterationLog[] = [
      makeIterationLog({
        iteration: 0,
        score: 50,
        taskResults: { 'task-1': { pass: false, score: 50 } },
        proposal: null,
      }),
      makeIterationLog({
        iteration: 1,
        score: 50,
        taskResults: { 'task-1': { pass: false, score: 50 } },
        proposal: null,
      }),
    ];

    const report = diagnoseCounterfactuals(iterations, [makeTask('task-1')]);

    expect(report.entries).toHaveLength(0);
  });

  it('handles multiple iterations', () => {
    const iterations: IterationLog[] = [
      makeIterationLog({
        iteration: 0,
        score: 40,
        taskResults: { 'task-1': { pass: false, score: 40 } },
        proposal: makeProposal({ reasoning: 'First' }),
      }),
      makeIterationLog({
        iteration: 1,
        score: 60,
        taskResults: { 'task-1': { pass: false, score: 60 } },
        proposal: makeProposal({ reasoning: 'Second' }),
      }),
      makeIterationLog({
        iteration: 2,
        score: 90,
        taskResults: { 'task-1': { pass: true, score: 90 } },
      }),
    ];

    const report = diagnoseCounterfactuals(iterations, [makeTask('task-1')]);

    expect(report.entries).toHaveLength(2);
    expect(report.entries[0].iteration).toBe(1);
    expect(report.entries[0].netScoreDelta).toBe(20);
    expect(report.entries[1].iteration).toBe(2);
    expect(report.entries[1].netScoreDelta).toBe(30);
  });

  it('returns empty entries for single iteration', () => {
    const iterations: IterationLog[] = [
      makeIterationLog({ iteration: 0, score: 50 }),
    ];

    const report = diagnoseCounterfactuals(iterations, [makeTask('task-1')]);

    expect(report.entries).toHaveLength(0);
  });
});
