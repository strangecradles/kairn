import { describe, it, expect } from 'vitest';
import { compileIntentPrompt } from '../prompt-template.js';

describe('compileIntentPrompt', () => {
  const commands: Record<string, string> = {
    deploy: '# Deploy\nDeploy to Vercel production.',
    test: '# Test\nRun test suite with vitest.',
    lint: '# Lint\nRun ESLint checks.',
  };

  const agents: Record<string, string> = {
    debugger: '# Debugger\nRoot-cause analysis for errors.',
    reviewer: '# Reviewer\nCode review with security focus.',
  };

  it('includes all command names in the prompt', () => {
    const prompt = compileIntentPrompt(commands, agents);
    expect(prompt).toContain('/project:deploy');
    expect(prompt).toContain('/project:test');
    expect(prompt).toContain('/project:lint');
  });

  it('includes all agent names in the prompt', () => {
    const prompt = compileIntentPrompt(commands, agents);
    expect(prompt).toContain('@debugger');
    expect(prompt).toContain('@reviewer');
  });

  it('includes first-line descriptions from commands', () => {
    const prompt = compileIntentPrompt(commands, agents);
    expect(prompt).toContain('Deploy to Vercel production');
    expect(prompt).toContain('Run test suite with vitest');
  });

  it('contains classification instructions', () => {
    const prompt = compileIntentPrompt(commands, agents);
    expect(prompt).toContain('intent');
    expect(prompt).toContain('additionalContext');
  });

  it('handles empty commands', () => {
    const prompt = compileIntentPrompt({}, agents);
    expect(prompt).toContain('@debugger');
    expect(prompt).toContain('no workflows defined');
  });

  it('handles empty agents', () => {
    const prompt = compileIntentPrompt(commands, {});
    expect(prompt).toContain('/project:deploy');
  });

  it('handles both empty', () => {
    const prompt = compileIntentPrompt({}, {});
    expect(prompt).toBeTruthy();
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('includes instructions to not activate for questions', () => {
    const prompt = compileIntentPrompt(commands, agents);
    expect(prompt.toLowerCase()).toContain('question');
  });
});
