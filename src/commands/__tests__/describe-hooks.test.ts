import { describe, it, expect } from 'vitest';
import { buildFileMap } from '../../adapter/claude-code.js';
import type { EnvironmentSpec } from '../../types.js';

function makeSpec(overrides?: Partial<EnvironmentSpec>): EnvironmentSpec {
  return {
    id: 'env_test-123',
    name: 'test-project',
    description: 'Test project',
    intent: 'Build a test project',
    created_at: '2026-04-01T00:00:00.000Z',
    autonomy_level: 1,
    tools: [],
    harness: {
      claude_md: '# Test\n## Purpose\nTest project',
      settings: {},
      mcp_config: {},
      commands: { deploy: '# Deploy\nDeploy to production.' },
      rules: { security: '# Security\nDo not leak secrets.' },
      skills: {},
      agents: { debugger: '# Debugger\nRoot-cause analysis.' },
      docs: {},
      hooks: {
        'intent-router': '// router script content',
        'intent-learner': '// learner script content',
      },
      intent_patterns: [
        {
          pattern: '\\b(deploy|ship)\\b',
          command: '/project:deploy',
          description: 'Deploy to production',
          source: 'generated',
        },
      ],
      intent_prompt_template: 'You are an intent classifier...',
    },
    ...overrides,
  };
}

describe('buildFileMap with hooks', () => {
  it('includes intent-router.mjs in file map', () => {
    const spec = makeSpec();
    const files = buildFileMap(spec);
    expect(files.has('.claude/hooks/intent-router.mjs')).toBe(true);
    expect(files.get('.claude/hooks/intent-router.mjs')).toBe('// router script content');
  });

  it('includes intent-learner.mjs in file map', () => {
    const spec = makeSpec();
    const files = buildFileMap(spec);
    expect(files.has('.claude/hooks/intent-learner.mjs')).toBe(true);
    expect(files.get('.claude/hooks/intent-learner.mjs')).toBe('// learner script content');
  });

  it('settings.json contains UserPromptSubmit hooks', () => {
    const spec = makeSpec();
    const files = buildFileMap(spec);
    const settingsJson = files.get('.claude/settings.json');
    expect(settingsJson).toBeDefined();
    const settings = JSON.parse(settingsJson!);
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.UserPromptSubmit).toBeDefined();
    expect(settings.hooks.UserPromptSubmit.length).toBeGreaterThan(0);
  });

  it('UserPromptSubmit has Tier 1 command hook', () => {
    const spec = makeSpec();
    const files = buildFileMap(spec);
    const settings = JSON.parse(files.get('.claude/settings.json')!);
    const upsHooks = settings.hooks.UserPromptSubmit;
    const tier1 = upsHooks.find((h: any) =>
      h.hooks?.some((hh: any) => hh.type === 'command' && hh.command?.includes('intent-router.mjs'))
    );
    expect(tier1).toBeDefined();
  });

  it('UserPromptSubmit has Tier 2 prompt hook', () => {
    const spec = makeSpec();
    const files = buildFileMap(spec);
    const settings = JSON.parse(files.get('.claude/settings.json')!);
    const upsHooks = settings.hooks.UserPromptSubmit;
    const tier2 = upsHooks.find((h: any) =>
      h.hooks?.some((hh: any) => hh.type === 'prompt')
    );
    expect(tier2).toBeDefined();
  });

  it('SessionStart includes intent-learner hook', () => {
    const spec = makeSpec();
    const files = buildFileMap(spec);
    const settings = JSON.parse(files.get('.claude/settings.json')!);
    const sessionStart = settings.hooks?.SessionStart;
    expect(sessionStart).toBeDefined();
    const learnerHook = sessionStart?.find((h: any) =>
      h.hooks?.some((hh: any) => hh.command?.includes('intent-learner.mjs'))
    );
    expect(learnerHook).toBeDefined();
  });

  it('hook paths use $CLAUDE_PROJECT_DIR', () => {
    const spec = makeSpec();
    const files = buildFileMap(spec);
    const settings = JSON.parse(files.get('.claude/settings.json')!);
    const upsHooks = settings.hooks.UserPromptSubmit;
    const tier1 = upsHooks.find((h: any) =>
      h.hooks?.some((hh: any) => hh.command?.includes('$CLAUDE_PROJECT_DIR'))
    );
    expect(tier1).toBeDefined();
  });

  it('preserves existing settings (statusLine, env loader)', () => {
    const spec = makeSpec({
      harness: {
        ...makeSpec().harness,
        settings: { statusLine: { command: 'echo test' } },
        commands: { status: '# Status\nShow status.' },
      },
    });
    const files = buildFileMap(spec, { hasEnvVars: true });
    const settings = JSON.parse(files.get('.claude/settings.json')!);
    expect(settings.statusLine).toBeDefined();
    // Should also have env loader hook in SessionStart
    const sessionStart = settings.hooks?.SessionStart;
    expect(sessionStart?.length).toBeGreaterThanOrEqual(2); // env loader + intent learner
  });

  it('handles spec with no hooks gracefully', () => {
    const spec = makeSpec();
    spec.harness.hooks = {};
    spec.harness.intent_patterns = [];
    spec.harness.intent_prompt_template = '';
    const files = buildFileMap(spec);
    // Should not write empty hook files
    expect(files.has('.claude/hooks/intent-router.mjs')).toBe(false);
  });

  it('includes intent-log.jsonl placeholder', () => {
    const spec = makeSpec();
    const files = buildFileMap(spec);
    expect(files.has('.claude/hooks/intent-log.jsonl')).toBe(true);
    expect(files.get('.claude/hooks/intent-log.jsonl')).toBe('');
  });
});
