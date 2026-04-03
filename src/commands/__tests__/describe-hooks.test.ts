import { describe, it, expect } from 'vitest';
import { buildFileMap, summarizeSpec } from '../../adapter/claude-code.js';
import type { EnvironmentSpec, RegistryTool } from '../../types.js';
import { createEmptyIR, createCommandNode, createRuleNode, createAgentNode } from '../../ir/types.js';
import type { HarnessIR } from '../../ir/types.js';

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
      hooks: {},
      intent_patterns: [],
      intent_prompt_template: '',
    },
    ...overrides,
  };
}

describe('buildFileMap after intent routing removal (v2.12)', () => {
  it('does not include intent-router.mjs in file map', () => {
    const spec = makeSpec();
    const files = buildFileMap(spec);
    expect(files.has('.claude/hooks/intent-router.mjs')).toBe(false);
  });

  it('does not include intent-learner.mjs in file map', () => {
    const spec = makeSpec();
    const files = buildFileMap(spec);
    expect(files.has('.claude/hooks/intent-learner.mjs')).toBe(false);
  });

  it('does not include intent-log.jsonl in file map', () => {
    const spec = makeSpec();
    const files = buildFileMap(spec);
    expect(files.has('.claude/hooks/intent-log.jsonl')).toBe(false);
  });

  it('settings.json does not contain intent routing hooks in UserPromptSubmit', () => {
    const spec = makeSpec();
    const files = buildFileMap(spec);
    const settingsJson = files.get('.claude/settings.json');
    if (settingsJson) {
      const settings = JSON.parse(settingsJson);
      const upsHooks = settings.hooks?.UserPromptSubmit ?? [];
      const intentHook = upsHooks.find((h: Record<string, unknown>) => {
        const hooks = h.hooks as Array<Record<string, unknown>> | undefined;
        return hooks?.some((hh) => typeof hh.command === 'string' && hh.command.includes('intent-router.mjs'));
      });
      expect(intentHook).toBeUndefined();
    }
  });

  it('settings.json does not contain intent-learner in SessionStart', () => {
    const spec = makeSpec();
    const files = buildFileMap(spec);
    const settingsJson = files.get('.claude/settings.json');
    if (settingsJson) {
      const settings = JSON.parse(settingsJson);
      const sessionStart = settings.hooks?.SessionStart ?? [];
      const learnerHook = sessionStart.find((h: Record<string, unknown>) => {
        const hooks = h.hooks as Array<Record<string, unknown>> | undefined;
        return hooks?.some((hh) => typeof hh.command === 'string' && hh.command.includes('intent-learner.mjs'));
      });
      expect(learnerHook).toBeUndefined();
    }
  });

  it('preserves existing settings (statusLine)', () => {
    const spec = makeSpec({
      harness: {
        ...makeSpec().harness,
        settings: { statusLine: { command: 'echo test' } },
        commands: { status: '# Status\nShow status.' },
      },
    });
    const files = buildFileMap(spec);
    const settings = JSON.parse(files.get('.claude/settings.json')!);
    expect(settings.statusLine).toBeDefined();
  });

  it('handles spec with empty hooks gracefully', () => {
    const spec = makeSpec();
    spec.harness.hooks = {};
    spec.harness.intent_patterns = [];
    spec.harness.intent_prompt_template = '';
    const files = buildFileMap(spec);
    // Should not write any hook files (no persist-router for L1)
    expect(files.has('.claude/hooks/intent-router.mjs')).toBe(false);
    expect(files.has('.claude/hooks/intent-learner.mjs')).toBe(false);
  });

  it('includes persist-router for L3+ code projects', () => {
    const spec = makeSpec({
      autonomy_level: 3,
      harness: {
        ...makeSpec().harness,
        commands: { status: '# Status\nShow status.', test: '# Test\nRun tests.' },
      },
    });
    const files = buildFileMap(spec);
    expect(files.has('.claude/hooks/persist-router.mjs')).toBe(true);
  });

  it('does not include persist-router for L1 projects', () => {
    const spec = makeSpec();
    const files = buildFileMap(spec);
    expect(files.has('.claude/hooks/persist-router.mjs')).toBe(false);
  });
});

/**
 * Construct a minimal HarnessIR matching the flat harness fields in makeSpec().
 * Uses 1 command, 1 rule, 1 agent — same as the default spec.
 */
function makeIR(): HarnessIR {
  const ir = createEmptyIR();
  ir.commands.push(createCommandNode('deploy', '# Deploy\nDeploy to production.', 'Deploy'));
  ir.rules.push(createRuleNode('security', '# Security\nDo not leak secrets.'));
  ir.agents.push(createAgentNode('debugger', '# Debugger\nRoot-cause analysis.'));
  return ir;
}

/** Empty registry — summarizeSpec needs it but our tests don't depend on tool details. */
const emptyRegistry: RegistryTool[] = [];

describe('buildFileMap with ir field', () => {
  it('produces identical file map for spec with ir and spec without ir', () => {
    const specWithoutIR = makeSpec();
    const specWithIR = makeSpec({ ir: makeIR() });

    const mapWithout = buildFileMap(specWithoutIR);
    const mapWith = buildFileMap(specWithIR);

    // Both should have the same set of keys
    const keysWithout = [...mapWithout.keys()].sort();
    const keysWith = [...mapWith.keys()].sort();
    expect(keysWith).toEqual(keysWithout);

    // Both should have the same content for each key
    for (const key of keysWithout) {
      expect(mapWith.get(key)).toBe(mapWithout.get(key));
    }
  });

  it('works correctly with a legacy spec that has no ir field', () => {
    const legacySpec = makeSpec();
    // Explicitly ensure no ir field
    delete (legacySpec as Partial<Pick<EnvironmentSpec, 'ir'>> & Omit<EnvironmentSpec, 'ir'>).ir;

    const files = buildFileMap(legacySpec);
    expect(files.has('.claude/CLAUDE.md')).toBe(true);
    expect(files.has('.claude/commands/deploy.md')).toBe(true);
    expect(files.has('.claude/rules/security.md')).toBe(true);
    expect(files.has('.claude/agents/debugger.md')).toBe(true);
  });
});

describe('summarizeSpec with HarnessIR', () => {
  it('uses ir counts when ir field is present', () => {
    const ir = makeIR();
    // Add extra items to IR that differ from flat harness to prove IR is preferred
    ir.commands.push(createCommandNode('test', '# Test\nRun tests.', 'Test'));
    ir.rules.push(createRuleNode('naming', '# Naming\nUse camelCase.'));

    const spec = makeSpec({ ir });
    // Flat harness has: 1 command, 1 rule, 1 agent, 0 skills
    // IR has: 2 commands, 2 rules, 1 agent, 0 skills
    const summary = summarizeSpec(spec, emptyRegistry);

    expect(summary.commandCount).toBe(2); // From IR, not flat harness (which has 1)
    expect(summary.ruleCount).toBe(2);    // From IR, not flat harness (which has 1)
    expect(summary.agentCount).toBe(1);
    expect(summary.skillCount).toBe(0);
    expect(summary.toolCount).toBe(0);
  });

  it('falls back to harness flat field counts when ir is absent', () => {
    const spec = makeSpec();
    // Flat harness has: 1 command, 1 rule, 1 agent, 0 skills
    const summary = summarizeSpec(spec, emptyRegistry);

    expect(summary.commandCount).toBe(1);
    expect(summary.ruleCount).toBe(1);
    expect(summary.agentCount).toBe(1);
    expect(summary.skillCount).toBe(0);
    expect(summary.toolCount).toBe(0);
  });

  it('returns correct tool count from spec.tools regardless of ir presence', () => {
    const specWithTools = makeSpec({
      tools: [
        { tool_id: 'github', reason: 'Version control' },
        { tool_id: 'linear', reason: 'Issue tracking' },
      ],
      ir: makeIR(),
    });
    const summary = summarizeSpec(specWithTools, emptyRegistry);
    expect(summary.toolCount).toBe(2);
  });

  it('returns pluginCommands and envSetup from registry lookup', () => {
    const registry: RegistryTool[] = [{
      id: 'test-tool',
      name: 'Test Tool',
      description: 'A test tool',
      category: 'testing',
      tier: 1,
      type: 'plugin',
      auth: 'api_key',
      best_for: ['testing'],
      env_vars: [{ name: 'TEST_KEY', description: 'API key for testing' }],
      signup_url: 'https://example.com',
      install: { plugin_command: 'npm install test-tool' },
    }];

    const spec = makeSpec({
      tools: [{ tool_id: 'test-tool', reason: 'For testing' }],
      ir: makeIR(),
    });
    const summary = summarizeSpec(spec, registry);

    expect(summary.pluginCommands).toEqual(['npm install test-tool']);
    expect(summary.envSetup).toHaveLength(1);
    expect(summary.envSetup[0].envVar).toBe('TEST_KEY');
  });
});
