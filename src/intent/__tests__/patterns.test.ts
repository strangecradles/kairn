import { describe, it, expect } from 'vitest';
import { generateIntentPatterns } from '../patterns.js';
import type { IntentPattern } from '../types.js';

describe('generateIntentPatterns', () => {
  const commands: Record<string, string> = {
    deploy: '# Deploy\nDeploy to production via Vercel.',
    test: '# Test\nRun the test suite with vitest.',
    lint: '# Lint\nRun ESLint and Prettier checks.',
    'db-migrate': '# Database Migration\nRun Prisma schema migrations.',
  };

  const agents: Record<string, string> = {
    debugger: '# Debugger\nRoot-cause analysis for build errors.',
    reviewer: '# Reviewer\nCode review with security focus.',
  };

  const projectProfile = {
    language: 'TypeScript',
    framework: 'Next.js',
    scripts: { test: 'vitest', build: 'next build', lint: 'eslint src/' } as Record<string, string>,
  };

  it('generates patterns for each command', () => {
    const patterns = generateIntentPatterns(commands, agents, projectProfile);
    const commandNames = patterns.map(p => p.command);
    expect(commandNames).toContain('/project:deploy');
    expect(commandNames).toContain('/project:test');
    expect(commandNames).toContain('/project:lint');
    expect(commandNames).toContain('/project:db-migrate');
  });

  it('includes synonyms in patterns', () => {
    const patterns = generateIntentPatterns(commands, agents, projectProfile);
    const deployPattern = patterns.find(p => p.command === '/project:deploy');
    expect(deployPattern).toBeDefined();
    const regex = new RegExp(deployPattern!.pattern, 'i');
    expect(regex.test('ship it')).toBe(true);
    expect(regex.test('push to prod')).toBe(true);
    expect(regex.test('release')).toBe(true);
  });

  it('generates valid regex patterns', () => {
    const patterns = generateIntentPatterns(commands, agents, projectProfile);
    for (const p of patterns) {
      expect(() => new RegExp(p.pattern, 'i')).not.toThrow();
    }
  });

  it('matches command name directly', () => {
    const patterns = generateIntentPatterns(commands, agents, projectProfile);
    const testPattern = patterns.find(p => p.command === '/project:test');
    expect(testPattern).toBeDefined();
    const regex = new RegExp(testPattern!.pattern, 'i');
    expect(regex.test('run tests')).toBe(true);
    expect(regex.test('test this')).toBe(true);
  });

  it('handles empty commands gracefully', () => {
    const patterns = generateIntentPatterns({}, {}, projectProfile);
    expect(patterns).toEqual([]);
  });

  it('handles npm script patterns', () => {
    const patterns = generateIntentPatterns(commands, agents, {
      ...projectProfile,
      scripts: { ...projectProfile.scripts, 'test:e2e': 'playwright test' },
    });
    // Should have a pattern that can match "e2e" related terms
    const hasE2E = patterns.some(p => {
      const regex = new RegExp(p.pattern, 'i');
      return regex.test('run e2e tests');
    });
    expect(hasE2E).toBe(true);
  });

  it('sorts patterns by specificity (longer patterns first)', () => {
    const patterns = generateIntentPatterns(commands, agents, projectProfile);
    // Multi-word patterns should come before single-word patterns
    for (let i = 0; i < patterns.length - 1; i++) {
      expect(patterns[i].pattern.length).toBeGreaterThanOrEqual(
        patterns[i + 1].pattern.length
      );
    }
  });

  it('sets source to generated', () => {
    const patterns = generateIntentPatterns(commands, agents, projectProfile);
    for (const p of patterns) {
      expect(p.source).toBe('generated');
    }
  });

  it('includes description from command content', () => {
    const patterns = generateIntentPatterns(commands, agents, projectProfile);
    const deployPattern = patterns.find(p => p.command === '/project:deploy');
    expect(deployPattern?.description).toBeTruthy();
    expect(deployPattern!.description.length).toBeGreaterThan(0);
  });
});
