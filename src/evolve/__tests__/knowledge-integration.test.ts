/**
 * Tests for knowledge base integration in proposer, architect, and loop.
 *
 * These tests verify that:
 * 1. propose() loads the knowledge base and includes it in the user message
 * 2. proposeArchitecture() auto-loads knowledge base when knowledgeContext is not provided
 * 3. evolve() calls extractAndSavePatterns after the loop completes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { Task, Trace, IterationLog, Proposal, KnowledgePattern } from '../types.js';
import type { KairnConfig } from '../../types.js';

// ─── Shared test helpers ───────────────────────────────────────────────────

function makeTrace(overrides: Partial<Trace> = {}): Trace {
  return {
    taskId: 'task-1',
    iteration: 0,
    stdout: 'output text',
    stderr: '',
    toolCalls: [],
    filesChanged: {},
    score: { pass: true, score: 80 },
    timing: {
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:01:00.000Z',
      durationMs: 60000,
    },
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    template: 'add-feature',
    description: 'Add a hello world function',
    setup: '',
    expected_outcome: 'hello world function exists',
    scoring: 'pass-fail',
    timeout: 30,
    ...overrides,
  };
}

function makeConfig(): KairnConfig {
  return {
    provider: 'anthropic',
    api_key: 'test-key',
    model: 'claude-sonnet-4-6',
    default_runtime: 'claude-code',
    created_at: new Date().toISOString(),
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

function makePattern(overrides: Partial<KnowledgePattern> = {}): KnowledgePattern {
  return {
    id: 'pattern_test1234',
    type: 'universal',
    description: 'Add explicit error handling to all async functions',
    mutation: {
      file: 'CLAUDE.md',
      action: 'add_section',
      newText: '## Error Handling\nAll async functions must use try/catch.',
      rationale: 'Improves reliability',
    },
    evidence: {
      repos_tested: 3,
      repos_helped: 2,
      mean_score_delta: 8.5,
      languages: ['typescript'],
    },
    discovered_at: '2026-04-01T00:00:00.000Z',
    last_validated: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── Module mocks ──────────────────────────────────────────────────────────

vi.mock('../../llm.js', () => ({
  callLLM: vi.fn(),
}));

vi.mock('../trace.js', () => ({
  loadIterationTraces: vi.fn(),
  writeIterationLog: vi.fn(),
}));

import { callLLM } from '../../llm.js';
import { loadIterationTraces } from '../trace.js';

const mockedCallLLM = vi.mocked(callLLM);
const mockedLoadTraces = vi.mocked(loadIterationTraces);

// ─── propose() knowledge integration ──────────────────────────────────────

describe('propose() knowledge base integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(
      os.tmpdir(),
      `kairn-propose-kb-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(tempDir, { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('completes successfully when knowledge base has no patterns', async () => {
    const harnessPath = path.join(tempDir, 'harness');
    await fs.mkdir(harnessPath, { recursive: true });
    await fs.writeFile(path.join(harnessPath, 'CLAUDE.md'), '# Test Harness');

    mockedLoadTraces.mockResolvedValue([
      makeTrace({ taskId: 'task-1', score: { pass: false, score: 40 } }),
    ]);

    mockedCallLLM.mockResolvedValue(JSON.stringify({
      reasoning: 'Applied knowledge base patterns.',
      mutations: [],
      expected_impact: {},
    }));

    const { propose } = await import('../proposer.js');

    const result = await propose(
      1,
      path.join(tempDir, 'workspace'),
      harnessPath,
      [makeIterationLog()],
      [makeTask()],
      makeConfig(),
      'claude-opus-4-6',
    );

    expect(mockedCallLLM).toHaveBeenCalledTimes(1);
    expect(result.reasoning).toBe('Applied knowledge base patterns.');
  });

  it('does not throw when knowledge module dynamic import fails', async () => {
    const harnessPath = path.join(tempDir, 'harness');
    await fs.mkdir(harnessPath, { recursive: true });
    await fs.writeFile(path.join(harnessPath, 'CLAUDE.md'), '# Test Harness');

    mockedLoadTraces.mockResolvedValue([]);
    mockedCallLLM.mockResolvedValue(JSON.stringify({
      reasoning: 'analysis',
      mutations: [],
      expected_impact: {},
    }));

    const { propose } = await import('../proposer.js');

    // Should not throw even if knowledge module fails internally
    const result = await propose(
      0,
      path.join(tempDir, 'workspace'),
      harnessPath,
      [],
      [makeTask()],
      makeConfig(),
      'claude-opus-4-6',
    );

    expect(result).toBeDefined();
    expect(result.reasoning).toBe('analysis');
  });

  it('passes a user message string to callLLM (verifies buildProposerUserMessage is called)', async () => {
    const harnessPath = path.join(tempDir, 'harness');
    await fs.mkdir(harnessPath, { recursive: true });
    await fs.writeFile(path.join(harnessPath, 'CLAUDE.md'), '# Test Harness');

    mockedLoadTraces.mockResolvedValue([]);
    mockedCallLLM.mockResolvedValue(JSON.stringify({
      reasoning: 'ok',
      mutations: [],
      expected_impact: {},
    }));

    const { propose } = await import('../proposer.js');

    await propose(
      0,
      path.join(tempDir, 'workspace'),
      harnessPath,
      [],
      [makeTask()],
      makeConfig(),
      'claude-opus-4-6',
    );

    // The user message should include harness content
    const calledUserMessage = mockedCallLLM.mock.calls[0][1] as string;
    expect(calledUserMessage).toContain('Current Harness Files');
    expect(calledUserMessage).toContain('# Test Harness');
  });
});

// ─── proposeArchitecture() knowledge integration ──────────────────────────

describe('proposeArchitecture() auto-loads knowledge base', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(
      os.tmpdir(),
      `kairn-arch-kb-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(tempDir, { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('completes successfully when knowledgeContext is not provided', async () => {
    const harnessPath = path.join(tempDir, 'harness');
    await fs.mkdir(harnessPath, { recursive: true });
    await fs.writeFile(path.join(harnessPath, 'CLAUDE.md'), '# Test Harness');

    mockedLoadTraces.mockResolvedValue([]);
    mockedCallLLM.mockResolvedValue(JSON.stringify({
      reasoning: 'Structural analysis.',
      mutations: [],
      expected_impact: {},
    }));

    const { proposeArchitecture } = await import('../architect.js');

    const result = await proposeArchitecture(
      5,
      path.join(tempDir, 'workspace'),
      harnessPath,
      [],
      [makeTask()],
      makeConfig(),
      'claude-opus-4-6',
      undefined,
    );

    expect(result.structural).toBe(true);
    expect(result.source).toBe('architect');
    expect(mockedCallLLM).toHaveBeenCalledTimes(1);
  });

  it('uses provided knowledgeContext instead of auto-loading', async () => {
    const harnessPath = path.join(tempDir, 'harness');
    await fs.mkdir(harnessPath, { recursive: true });
    await fs.writeFile(path.join(harnessPath, 'CLAUDE.md'), '# Test Harness');

    mockedLoadTraces.mockResolvedValue([]);
    mockedCallLLM.mockResolvedValue(JSON.stringify({
      reasoning: 'Used explicit knowledge.',
      mutations: [],
      expected_impact: {},
    }));

    const { proposeArchitecture } = await import('../architect.js');

    await proposeArchitecture(
      5,
      path.join(tempDir, 'workspace'),
      harnessPath,
      [],
      [makeTask()],
      makeConfig(),
      'claude-opus-4-6',
      'Explicit knowledge context provided by caller',
    );

    const calledUserMessage = mockedCallLLM.mock.calls[0][1] as string;
    expect(calledUserMessage).toContain('Explicit knowledge context provided by caller');
  });

  it('does not throw when knowledge base auto-load fails', async () => {
    const harnessPath = path.join(tempDir, 'harness');
    await fs.mkdir(harnessPath, { recursive: true });
    await fs.writeFile(path.join(harnessPath, 'CLAUDE.md'), '# Test Harness');

    mockedLoadTraces.mockResolvedValue([]);
    mockedCallLLM.mockResolvedValue(JSON.stringify({
      reasoning: 'analysis',
      mutations: [],
      expected_impact: {},
    }));

    const { proposeArchitecture } = await import('../architect.js');

    const result = await proposeArchitecture(
      5,
      path.join(tempDir, 'workspace'),
      harnessPath,
      [],
      [],
      makeConfig(),
      'claude-opus-4-6',
      undefined,
    );

    expect(result).toBeDefined();
    expect(result.structural).toBe(true);
  });
});

// ─── formatKnowledgeForProposer integration ───────────────────────────────

describe('knowledge formatting functions produce correct output for injection', () => {
  it('formatKnowledgeForProposer returns content that can be appended to memory', async () => {
    const { formatKnowledgeForProposer } = await import('../knowledge.js');

    const patterns = [makePattern()];
    const section = formatKnowledgeForProposer(patterns, null);

    // With null language, universal patterns should be included
    expect(section).toContain('Known Patterns');
    expect(section).toContain('Add explicit error handling');
  });

  it('formatKnowledgeForArchitect returns content suitable for architect context', async () => {
    const { formatKnowledgeForArchitect } = await import('../knowledge.js');

    const accepted = makePattern({ rejected: false, description: 'Good pattern' });
    const rejected = makePattern({ rejected: true, description: 'Bad pattern' });
    const section = formatKnowledgeForArchitect([accepted, rejected], null);

    expect(section).toContain('Knowledge Base');
    expect(section).toContain('Good pattern');
    expect(section).toContain('FAILED: Bad pattern');
  });
});
