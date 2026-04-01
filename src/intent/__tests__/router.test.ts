import { describe, it, expect } from 'vitest';
import { renderIntentRouter } from '../router-template.js';
import type { IntentPattern } from '../types.js';

describe('renderIntentRouter', () => {
  const patterns: IntentPattern[] = [
    {
      pattern: '\\b(deploy|ship|push\\s+to\\s+prod|release)\\b',
      command: '/project:deploy',
      description: 'Deploy to Vercel production',
      source: 'generated',
    },
    {
      pattern: '\\b(test|run\\s+tests|check|verify)\\b',
      command: '/project:test',
      description: 'Run test suite (vitest)',
      source: 'generated',
    },
  ];

  const timestamp = '2026-04-01T00:00:00.000Z';

  it('renders valid JavaScript', () => {
    const script = renderIntentRouter(patterns, timestamp);
    // Should not throw when parsed as a module
    // Check for basic structural validity
    expect(script).toContain('import');
    expect(script).toContain('PATTERNS');
    expect(script).toContain('process.exit');
  });

  it('contains all patterns from input', () => {
    const script = renderIntentRouter(patterns, timestamp);
    expect(script).toContain('/project:deploy');
    expect(script).toContain('/project:test');
    expect(script).toContain('Deploy to Vercel production');
    expect(script).toContain('Run test suite (vitest)');
  });

  it('includes pattern regex sources', () => {
    const script = renderIntentRouter(patterns, timestamp);
    expect(script).toContain('deploy|ship|push\\s+to\\s+prod|release');
    expect(script).toContain('test|run\\s+tests|check|verify');
  });

  it('includes sanitization logic', () => {
    const script = renderIntentRouter(patterns, timestamp);
    // Should strip code blocks
    expect(script).toContain('```');
    // Should strip URLs
    expect(script).toContain('http');
  });

  it('includes question filter', () => {
    const script = renderIntentRouter(patterns, timestamp);
    expect(script).toContain('what');
    expect(script).toContain('how');
    expect(script).toContain('isQuestion');
  });

  it('includes generation timestamp', () => {
    const script = renderIntentRouter(patterns, timestamp);
    expect(script).toContain(timestamp);
  });

  it('includes fallthrough output', () => {
    const script = renderIntentRouter(patterns, timestamp);
    expect(script).toContain('suppressOutput');
    expect(script).toContain('"continue": true');
  });

  it('handles empty patterns', () => {
    const script = renderIntentRouter([], timestamp);
    expect(script).toContain('PATTERNS');
    expect(script).toContain('suppressOutput');
  });

  it('produces a script with proper stdin parsing', () => {
    const script = renderIntentRouter(patterns, timestamp);
    expect(script).toContain('readFileSync');
    expect(script).toContain('/dev/stdin');
    expect(script).toContain('JSON.parse');
  });

  it('outputs additionalContext on match', () => {
    const script = renderIntentRouter(patterns, timestamp);
    expect(script).toContain('additionalContext');
    expect(script).toContain('INTENT ROUTED');
  });
});
