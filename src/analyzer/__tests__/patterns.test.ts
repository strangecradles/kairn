import { describe, it, expect } from 'vitest';
import { getStrategy, getAlwaysInclude, STRATEGIES, classifyFilePriority, FileTier } from '../patterns.js';
import type { SamplingStrategy } from '../patterns.js';

describe('getStrategy', () => {
  it('returns the Python strategy for "python"', () => {
    const strategy = getStrategy('python');
    expect(strategy).not.toBeNull();
    expect(strategy!.language).toBe('Python');
    expect(strategy!.extensions).toEqual(['.py']);
  });

  it('is case-insensitive — "Python" works', () => {
    const strategy = getStrategy('Python');
    expect(strategy).not.toBeNull();
    expect(strategy!.language).toBe('Python');
  });

  it('returns the TypeScript strategy for "typescript"', () => {
    const strategy = getStrategy('typescript');
    expect(strategy).not.toBeNull();
    expect(strategy!.language).toBe('TypeScript');
    expect(strategy!.extensions).toEqual(['.ts', '.tsx']);
  });

  it('returns the Go strategy for "go"', () => {
    const strategy = getStrategy('go');
    expect(strategy).not.toBeNull();
    expect(strategy!.language).toBe('Go');
    expect(strategy!.extensions).toEqual(['.go']);
  });

  it('returns the Rust strategy for "rust"', () => {
    const strategy = getStrategy('rust');
    expect(strategy).not.toBeNull();
    expect(strategy!.language).toBe('Rust');
    expect(strategy!.extensions).toEqual(['.rs']);
  });

  it('returns null for an unknown language', () => {
    const strategy = getStrategy('unknown');
    expect(strategy).toBeNull();
  });

  it('returns null when language is null', () => {
    const strategy = getStrategy(null);
    expect(strategy).toBeNull();
  });
});

describe('getAlwaysInclude', () => {
  it('returns the expected array of always-included patterns', () => {
    const result = getAlwaysInclude();
    expect(result).toEqual([
      'README.md',
      'README.rst',
      '*.toml',
      '*.yaml',
      '*.yml',
    ]);
  });
});

describe('STRATEGIES completeness', () => {
  const strategyKeys = Object.keys(STRATEGIES);

  it('has entries for python, typescript, go, and rust', () => {
    expect(strategyKeys).toContain('python');
    expect(strategyKeys).toContain('typescript');
    expect(strategyKeys).toContain('go');
    expect(strategyKeys).toContain('rust');
  });

  it.each(strategyKeys)(
    'strategy "%s" has non-empty entryPoints and domainPatterns',
    (key) => {
      const strategy: SamplingStrategy = STRATEGIES[key];
      expect(strategy.entryPoints.length).toBeGreaterThan(0);
      expect(strategy.domainPatterns.length).toBeGreaterThan(0);
    },
  );

  it.each(strategyKeys)(
    'strategy "%s" has non-empty extensions, configPatterns, and excludePatterns',
    (key) => {
      const strategy: SamplingStrategy = STRATEGIES[key];
      expect(strategy.extensions.length).toBeGreaterThan(0);
      expect(strategy.configPatterns.length).toBeGreaterThan(0);
      expect(strategy.excludePatterns.length).toBeGreaterThan(0);
    },
  );

  it.each(strategyKeys)(
    'strategy "%s" has maxFilesPerCategory set to 5',
    (key) => {
      const strategy: SamplingStrategy = STRATEGIES[key];
      expect(strategy.maxFilesPerCategory).toBe(5);
    },
  );
});

describe('classifyFilePriority', () => {
  const ts = getStrategy('typescript')!;
  const py = getStrategy('python')!;

  it('classifies README.md as IDENTITY (tier 0)', () => {
    expect(classifyFilePriority('README.md', ts)).toBe(FileTier.IDENTITY);
  });

  it('classifies config files as IDENTITY', () => {
    expect(classifyFilePriority('package.json', ts)).toBe(FileTier.IDENTITY);
    expect(classifyFilePriority('tsconfig.json', ts)).toBe(FileTier.IDENTITY);
    expect(classifyFilePriority('pyproject.toml', py)).toBe(FileTier.IDENTITY);
  });

  it('classifies entry points as ENTRY (tier 1)', () => {
    expect(classifyFilePriority('src/index.ts', ts)).toBe(FileTier.ENTRY);
    expect(classifyFilePriority('src/cli.ts', ts)).toBe(FileTier.ENTRY);
    expect(classifyFilePriority('main.py', py)).toBe(FileTier.ENTRY);
    expect(classifyFilePriority('app.py', py)).toBe(FileTier.ENTRY);
  });

  it('classifies domain directory files as DOMAIN (tier 2)', () => {
    expect(classifyFilePriority('src/services/auth.ts', ts)).toBe(FileTier.DOMAIN);
    expect(classifyFilePriority('src/api/routes.ts', ts)).toBe(FileTier.DOMAIN);
    expect(classifyFilePriority('src/core/engine.py', py)).toBe(FileTier.DOMAIN);
    expect(classifyFilePriority('api/views.py', py)).toBe(FileTier.DOMAIN);
  });

  it('classifies other files as OTHER (tier 3)', () => {
    expect(classifyFilePriority('src/utils/helpers.ts', ts)).toBe(FileTier.OTHER);
    expect(classifyFilePriority('scripts/deploy.py', py)).toBe(FileTier.OTHER);
  });

  it('priority order: IDENTITY < ENTRY < DOMAIN < OTHER', () => {
    expect(FileTier.IDENTITY).toBeLessThan(FileTier.ENTRY);
    expect(FileTier.ENTRY).toBeLessThan(FileTier.DOMAIN);
    expect(FileTier.DOMAIN).toBeLessThan(FileTier.OTHER);
  });
});
