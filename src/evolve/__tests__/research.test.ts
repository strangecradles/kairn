import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { KnowledgePattern, ResearchConfig, ResearchProgressEvent, EvolveConfig } from '../types.js';
import type { KairnConfig } from '../../types.js';

// Mock knowledge module to avoid real filesystem calls
vi.mock('../knowledge.js', () => ({
  loadKnowledgeBase: vi.fn().mockResolvedValue([]),
  extractAndSavePatterns: vi.fn().mockResolvedValue([]),
  saveConvergence: vi.fn().mockResolvedValue(undefined),
}));

// Mock child_process exec to avoid real git clones
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

// Mock fs to control .claude/ detection and cleanup
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    default: {
      ...actual,
      mkdir: vi.fn().mockResolvedValue(undefined),
      access: vi.fn().mockRejectedValue(new Error('ENOENT')),
      rm: vi.fn().mockResolvedValue(undefined),
    },
  };
});

import { analyzeConvergence, formatResearchReport, runResearch } from '../research.js';
import { loadKnowledgeBase, saveConvergence } from '../knowledge.js';
import { exec } from 'child_process';
import fs from 'fs/promises';

function makePattern(overrides: Partial<KnowledgePattern> = {}): KnowledgePattern {
  return {
    id: `pattern_${Math.random().toString(36).slice(2, 10)}`,
    type: 'universal',
    description: 'Add explicit return types to exported functions',
    mutation: {
      file: 'CLAUDE.md',
      action: 'add_section',
      newText: '## Return Types\nAll exported functions must have explicit return types.',
      rationale: 'Improves type safety',
    },
    evidence: {
      repos_tested: 3,
      repos_helped: 2,
      mean_score_delta: 5.2,
      languages: ['typescript'],
    },
    discovered_at: '2026-04-01T00:00:00.000Z',
    last_validated: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeKairnConfig(): KairnConfig {
  return {
    provider: 'anthropic',
    api_key: 'test-key',
    model: 'claude-sonnet-4-6',
    default_runtime: 'claude-code',
    created_at: '2026-04-01T00:00:00.000Z',
  };
}

function makeEvolveConfig(): EvolveConfig {
  return {
    model: 'claude-sonnet-4-6',
    proposerModel: 'claude-opus-4-6',
    scorer: 'pass-fail',
    maxIterations: 5,
    parallelTasks: 1,
    runsPerTask: 1,
    maxMutationsPerIteration: 3,
    pruneThreshold: 0.3,
    maxTaskDrop: 2,
    usePrincipal: false,
    evalSampleSize: 0,
    samplingStrategy: 'uniform',
    klLambda: 0,
    pbtBranches: 1,
    architectEvery: 3,
    schedule: 'constant',
    architectModel: 'claude-opus-4-6',
  };
}

describe('analyzeConvergence', () => {
  it('returns empty arrays when given empty input', () => {
    const result = analyzeConvergence([], 5, 0.6);
    expect(result.universal).toEqual([]);
    expect(result.languageSpecific).toEqual({});
    expect(result.failed).toEqual([]);
  });

  it('returns empty arrays when repoCount is 0', () => {
    const patterns = [makePattern()];
    const result = analyzeConvergence(patterns, 0, 0.6);
    expect(result.universal).toEqual([]);
    expect(result.languageSpecific).toEqual({});
    expect(result.failed).toEqual([]);
  });

  it('identifies universal patterns appearing in >= threshold fraction of repos', () => {
    // 5 repos, threshold 0.6 => need 3/5 repos
    const desc = 'add explicit return types';
    const patterns: KnowledgePattern[] = [
      makePattern({ description: desc, rejected: false }),
      makePattern({ description: desc, rejected: false }),
      makePattern({ description: desc, rejected: false }),
    ];

    const result = analyzeConvergence(patterns, 5, 0.6);
    expect(result.universal).toHaveLength(1);
    expect(result.universal[0].type).toBe('universal');
    expect(result.universal[0].evidence.repos_helped).toBe(3);
  });

  it('threshold 0.8 requires 4/5 repos for universal', () => {
    const desc = 'add explicit return types';
    // Only 3 patterns -- not enough for 0.8 threshold with 5 repos
    const threePatterns: KnowledgePattern[] = [
      makePattern({ description: desc, rejected: false }),
      makePattern({ description: desc, rejected: false }),
      makePattern({ description: desc, rejected: false }),
    ];
    const result3 = analyzeConvergence(threePatterns, 5, 0.8);
    expect(result3.universal).toHaveLength(0);

    // 4 patterns -- enough for 0.8 threshold with 5 repos
    const fourPatterns: KnowledgePattern[] = [
      makePattern({ description: desc, rejected: false }),
      makePattern({ description: desc, rejected: false }),
      makePattern({ description: desc, rejected: false }),
      makePattern({ description: desc, rejected: false }),
    ];
    const result4 = analyzeConvergence(fourPatterns, 5, 0.8);
    expect(result4.universal).toHaveLength(1);
  });

  it('marks patterns as failed when rejected in >= 50% of appearances', () => {
    const desc = 'remove all comments';
    // 2 rejected, 1 accepted => 2/3 >= 0.5 => failed
    const patterns: KnowledgePattern[] = [
      makePattern({ description: desc, rejected: true }),
      makePattern({ description: desc, rejected: true }),
      makePattern({ description: desc, rejected: false }),
    ];

    const result = analyzeConvergence(patterns, 5, 0.6);
    expect(result.failed).toHaveLength(1);
    expect(result.universal).toHaveLength(0);
  });

  it('does not classify pattern as failed when rejection rate < 50%', () => {
    const desc = 'add type annotations';
    // 1 rejected, 3 accepted => 1/4 = 25% < 50% => not failed
    const patterns: KnowledgePattern[] = [
      makePattern({ description: desc, rejected: true }),
      makePattern({ description: desc, rejected: false }),
      makePattern({ description: desc, rejected: false }),
      makePattern({ description: desc, rejected: false }),
    ];

    const result = analyzeConvergence(patterns, 5, 0.6);
    expect(result.failed).toHaveLength(0);
    // 3/5 >= 0.6 => universal
    expect(result.universal).toHaveLength(1);
  });

  it('identifies language-specific patterns (>= 2 repos of same language)', () => {
    const desc = 'add pyproject toml configuration';
    const patterns: KnowledgePattern[] = [
      makePattern({
        description: desc,
        rejected: false,
        evidence: { repos_tested: 1, repos_helped: 1, mean_score_delta: 3, languages: ['python'] },
      }),
      makePattern({
        description: desc,
        rejected: false,
        evidence: { repos_tested: 1, repos_helped: 1, mean_score_delta: 4, languages: ['python'] },
      }),
    ];

    // 2 out of 10 repos => 0.2 < 0.6 threshold, not universal
    const result = analyzeConvergence(patterns, 10, 0.6);
    expect(result.universal).toHaveLength(0);
    expect(result.languageSpecific).toHaveProperty('python');
    expect(result.languageSpecific['python']).toHaveLength(1);
    expect(result.languageSpecific['python'][0].type).toBe('language');
  });

  it('groups patterns by normalized description', () => {
    // Same meaning, different casing/punctuation
    const patterns: KnowledgePattern[] = [
      makePattern({ description: 'Add explicit return types!', rejected: false }),
      makePattern({ description: 'add explicit return types', rejected: false }),
      makePattern({ description: 'ADD EXPLICIT RETURN TYPES', rejected: false }),
    ];

    const result = analyzeConvergence(patterns, 5, 0.6);
    // All three should be grouped as one, 3/5 >= 0.6 => universal
    expect(result.universal).toHaveLength(1);
    expect(result.universal[0].evidence.repos_helped).toBe(3);
  });
});

describe('formatResearchReport', () => {
  it('produces valid Markdown with expected sections', () => {
    const report = {
      universal: [
        makePattern({
          description: 'Universal pattern A',
          evidence: { repos_tested: 5, repos_helped: 4, mean_score_delta: 7.5, languages: ['typescript'] },
        }),
      ],
      languageSpecific: {
        python: [
          makePattern({
            description: 'Python pattern B',
            evidence: { repos_tested: 3, repos_helped: 3, mean_score_delta: 3.0, languages: ['python'] },
          }),
        ],
      },
      failed: [
        makePattern({
          description: 'Failed pattern C',
          evidence: { repos_tested: 4, repos_helped: 1, mean_score_delta: -2.0, languages: [] },
        }),
      ],
      repoResults: [
        { repo: 'repo-alpha', bestScore: 85.5, patternsFound: 3 },
        { repo: 'repo-beta', bestScore: 72.0, patternsFound: 1 },
      ],
    };

    const md = formatResearchReport(report);

    // Check headers
    expect(md).toContain('# Evolution Research Report');
    expect(md).toContain('## Repositories Analyzed');
    expect(md).toContain('## Universal Patterns (1 found)');
    expect(md).toContain('## Language-Specific Patterns');
    expect(md).toContain('### python (1 patterns)');
    expect(md).toContain('## Failed Experiments (1 patterns)');

    // Check content
    expect(md).toContain('repo-alpha');
    expect(md).toContain('85.5%');
    expect(md).toContain('Universal pattern A');
    expect(md).toContain('Python pattern B');
    expect(md).toContain('Failed pattern C');
  });

  it('handles empty report', () => {
    const report = {
      universal: [],
      languageSpecific: {},
      failed: [],
      repoResults: [],
    };

    const md = formatResearchReport(report);

    expect(md).toContain('# Evolution Research Report');
    expect(md).toContain('No universal patterns discovered.');
    expect(md).toContain('No consistent failures identified.');
    expect(md).not.toContain('## Language-Specific Patterns');
  });

  it('formats score delta with one decimal place', () => {
    const report = {
      universal: [
        makePattern({
          description: 'Precise delta',
          evidence: { repos_tested: 3, repos_helped: 3, mean_score_delta: 4.567, languages: [] },
        }),
      ],
      languageSpecific: {},
      failed: [],
      repoResults: [],
    };

    const md = formatResearchReport(report);
    expect(md).toContain('+4.6');
  });
});

describe('runResearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid repo URLs (not https:// or git@)', async () => {
    const config: ResearchConfig = {
      repos: ['http://insecure.example.com/repo.git'],
      iterationsPerRepo: 3,
      convergenceThreshold: 0.6,
    };

    await expect(
      runResearch(config, makeKairnConfig(), makeEvolveConfig()),
    ).rejects.toThrow('Invalid repo URL');
  });

  it('rejects file:// protocol URLs', async () => {
    const config: ResearchConfig = {
      repos: ['file:///etc/passwd'],
      iterationsPerRepo: 3,
      convergenceThreshold: 0.6,
    };

    await expect(
      runResearch(config, makeKairnConfig(), makeEvolveConfig()),
    ).rejects.toThrow('Invalid repo URL');
  });

  it('accepts https:// URLs', async () => {
    const config: ResearchConfig = {
      repos: ['https://github.com/example/repo.git'],
      iterationsPerRepo: 3,
      convergenceThreshold: 0.6,
    };

    // Mock exec to simulate a clone failure (so it doesn't block)
    const mockExec = vi.mocked(exec);
    mockExec.mockImplementation((...args: unknown[]) => {
      const callback = args.find((a) => typeof a === 'function');
      if (typeof callback === 'function') {
        (callback as (err: Error | null) => void)(new Error('clone failed'));
      }
      return undefined as unknown as ReturnType<typeof exec>;
    });

    // runResearch should not throw for valid URL even if clone fails
    const events: ResearchProgressEvent[] = [];
    const report = await runResearch(config, makeKairnConfig(), makeEvolveConfig(), (e) => {
      events.push(e);
    });

    expect(report.repoResults).toHaveLength(1);
    expect(report.repoResults[0].repo).toBe('repo');
  });

  it('accepts git@ URLs', async () => {
    const config: ResearchConfig = {
      repos: ['git@github.com:example/repo.git'],
      iterationsPerRepo: 3,
      convergenceThreshold: 0.6,
    };

    const mockExec = vi.mocked(exec);
    mockExec.mockImplementation((_cmd: string, _opts: unknown, callback?: unknown) => {
      if (typeof callback === 'function') {
        (callback as (err: Error | null) => void)(new Error('clone failed'));
      }
      return undefined as unknown as ReturnType<typeof exec>;
    });

    const report = await runResearch(config, makeKairnConfig(), makeEvolveConfig());
    expect(report.repoResults).toHaveLength(1);
    expect(report.repoResults[0].repo).toBe('repo');
  });

  it('emits progress events during research', async () => {
    const config: ResearchConfig = {
      repos: ['https://github.com/example/test-repo.git'],
      iterationsPerRepo: 3,
      convergenceThreshold: 0.6,
    };

    const mockExec = vi.mocked(exec);
    mockExec.mockImplementation((_cmd: string, _opts: unknown, callback?: unknown) => {
      if (typeof callback === 'function') {
        (callback as (err: Error | null) => void)(new Error('clone failed'));
      }
      return undefined as unknown as ReturnType<typeof exec>;
    });

    const events: ResearchProgressEvent[] = [];
    await runResearch(config, makeKairnConfig(), makeEvolveConfig(), (e) => {
      events.push(e);
    });

    // Should have: repo-start, repo-complete, convergence-analysis, research-complete
    const types = events.map((e) => e.type);
    expect(types).toContain('repo-start');
    expect(types).toContain('repo-complete');
    expect(types).toContain('convergence-analysis');
    expect(types).toContain('research-complete');
  });

  it('returns a ResearchReport with correct structure', async () => {
    const config: ResearchConfig = {
      repos: ['https://github.com/example/repo.git'],
      iterationsPerRepo: 3,
      convergenceThreshold: 0.6,
    };

    const mockExec = vi.mocked(exec);
    mockExec.mockImplementation((_cmd: string, _opts: unknown, callback?: unknown) => {
      if (typeof callback === 'function') {
        (callback as (err: Error | null) => void)(new Error('clone failed'));
      }
      return undefined as unknown as ReturnType<typeof exec>;
    });

    const report = await runResearch(config, makeKairnConfig(), makeEvolveConfig());

    expect(report).toHaveProperty('universal');
    expect(report).toHaveProperty('languageSpecific');
    expect(report).toHaveProperty('failed');
    expect(report).toHaveProperty('repoResults');
    expect(Array.isArray(report.universal)).toBe(true);
    expect(Array.isArray(report.failed)).toBe(true);
    expect(Array.isArray(report.repoResults)).toBe(true);
  });
});
