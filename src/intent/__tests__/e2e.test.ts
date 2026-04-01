import { describe, it, expect } from 'vitest';
import { generateIntentPatterns } from '../patterns.js';
import { compileIntentPrompt } from '../prompt-template.js';
import { renderIntentRouter } from '../router-template.js';
import { renderIntentLearner } from '../learner-template.js';
import { buildFileMap } from '../../adapter/claude-code.js';
import type { EnvironmentSpec } from '../../types.js';
import type { IntentPattern } from '../types.js';

/**
 * Simulate the intent-router.mjs matching logic in-process.
 * This mirrors what the generated script does at runtime.
 */
function simulateRouter(
  patterns: IntentPattern[],
  userPrompt: string,
): { matched: boolean; command?: string; description?: string } {
  // Sanitize (same as intent-router.mjs)
  const clean = userPrompt
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/(\/[\w.-]+){2,}/g, '')
    .toLowerCase();

  // Question filter
  const QUESTION_PATTERNS = [
    /\b(?:what(?:'s|\s+is)|how\s+(?:to|do\s+i)\s+use|explain|describe|tell\s+me\s+about)\b/i,
  ];
  function isQuestion(text: string, position: number, length: number): boolean {
    const start = Math.max(0, position - 80);
    const end = Math.min(text.length, position + length + 80);
    const ctx = text.slice(start, end);
    return QUESTION_PATTERNS.some(p => p.test(ctx));
  }

  // Match loop
  for (const { pattern, command, description } of patterns) {
    const regex = new RegExp(pattern, 'i');
    const match = clean.match(regex);
    if (match && !isQuestion(clean, match.index!, match[0].length)) {
      return { matched: true, command, description };
    }
  }

  return { matched: false };
}

describe('E2E: Intent routing pipeline', () => {
  // Simulate a real project
  const commands: Record<string, string> = {
    deploy: '# Deploy\nDeploy to Vercel production via `vercel deploy --prod`.',
    test: '# Test\nRun test suite with `vitest run`.',
    lint: '# Lint\nRun ESLint checks on source files.',
    'db-migrate': '# Database Migration\nRun Prisma schema migration.',
    status: '# Status\nShow project status and git state.',
  };

  const agents: Record<string, string> = {
    debugger: '# Debugger\nRoot-cause analysis for build/runtime errors.',
    reviewer: '# Reviewer\nCode review with security focus.',
  };

  const projectProfile = {
    language: 'TypeScript',
    framework: 'Next.js',
    scripts: {
      test: 'vitest',
      build: 'next build',
      lint: 'eslint src/',
      'test:e2e': 'playwright test',
    } as Record<string, string>,
  };

  // Generate patterns from the mock project
  const patterns = generateIntentPatterns(commands, agents, projectProfile);
  const promptTemplate = compileIntentPrompt(commands, agents);
  const timestamp = '2026-04-01T00:00:00.000Z';
  const routerScript = renderIntentRouter(patterns, timestamp);
  const learnerScript = renderIntentLearner();

  describe('pattern generation', () => {
    it('generates patterns for all commands', () => {
      expect(patterns.length).toBeGreaterThanOrEqual(Object.keys(commands).length);
    });

    it('all patterns are valid regex', () => {
      for (const p of patterns) {
        expect(() => new RegExp(p.pattern, 'i')).not.toThrow();
      }
    });
  });

  describe('intent matching: action requests route correctly', () => {
    it('"deploy this" → /project:deploy', () => {
      const result = simulateRouter(patterns, 'deploy this to production');
      expect(result.matched).toBe(true);
      expect(result.command).toBe('/project:deploy');
    });

    it('"ship it" → /project:deploy (synonym)', () => {
      const result = simulateRouter(patterns, 'ship it');
      expect(result.matched).toBe(true);
      expect(result.command).toBe('/project:deploy');
    });

    it('"run tests" → /project:test', () => {
      const result = simulateRouter(patterns, 'run tests please');
      expect(result.matched).toBe(true);
      expect(result.command).toBe('/project:test');
    });

    it('"check the code" → /project:test (synonym)', () => {
      const result = simulateRouter(patterns, 'check the code');
      expect(result.matched).toBe(true);
      expect(result.command).toBe('/project:test');
    });

    it('"lint the source" → /project:lint', () => {
      const result = simulateRouter(patterns, 'lint the source files');
      expect(result.matched).toBe(true);
      expect(result.command).toBe('/project:lint');
    });

    it('"migrate the database" → /project:db-migrate', () => {
      const result = simulateRouter(patterns, 'migrate the database schema');
      expect(result.matched).toBe(true);
      expect(result.command).toBe('/project:db-migrate');
    });
  });

  describe('question filter: informational queries do NOT trigger', () => {
    it('"what is deploy?" → no match', () => {
      const result = simulateRouter(patterns, 'what is deploy?');
      expect(result.matched).toBe(false);
    });

    it('"how do I use the test command?" → no match', () => {
      const result = simulateRouter(patterns, 'how do I use the test command?');
      expect(result.matched).toBe(false);
    });

    it('"explain the lint process" → no match', () => {
      const result = simulateRouter(patterns, 'explain the lint process');
      expect(result.matched).toBe(false);
    });
  });

  describe('fallthrough: unrelated prompts do NOT match', () => {
    it('"hello world" → no match', () => {
      const result = simulateRouter(patterns, 'hello world');
      expect(result.matched).toBe(false);
    });

    it('"write a function to calculate fibonacci" → no match', () => {
      const result = simulateRouter(patterns, 'write a function to calculate fibonacci');
      expect(result.matched).toBe(false);
    });
  });

  describe('generated scripts are structurally valid', () => {
    it('router script contains all pattern commands', () => {
      for (const cmd of Object.keys(commands)) {
        expect(routerScript).toContain(`/project:${cmd}`);
      }
    });

    it('router script contains PATTERNS array', () => {
      expect(routerScript).toContain('const PATTERNS');
    });

    it('learner script references intent-log.jsonl', () => {
      expect(learnerScript).toContain('intent-log.jsonl');
    });

    it('learner script references intent-promotions.jsonl', () => {
      expect(learnerScript).toContain('intent-promotions.jsonl');
    });
  });

  describe('Tier 2 prompt template', () => {
    it('lists all workflows with descriptions', () => {
      expect(promptTemplate).toContain('/project:deploy');
      expect(promptTemplate).toContain('/project:test');
      expect(promptTemplate).toContain('Deploy to Vercel production');
    });

    it('lists all agents', () => {
      expect(promptTemplate).toContain('@debugger');
      expect(promptTemplate).toContain('@reviewer');
    });

    it('includes classification instructions', () => {
      expect(promptTemplate).toContain('additionalContext');
      expect(promptTemplate).toContain('INTENT ROUTED');
    });
  });

  describe('adapter integration: buildFileMap', () => {
    function makeFullSpec(): EnvironmentSpec {
      return {
        id: 'env_e2e-test',
        name: 'next-app',
        description: 'Next.js app',
        intent: 'Build a Next.js app with deploy to Vercel',
        created_at: timestamp,
        autonomy_level: 1,
        tools: [],
        harness: {
          claude_md: '# Next App\n## Purpose\nNext.js app',
          settings: {},
          mcp_config: {},
          commands,
          rules: { security: '# Security\nDo not leak secrets.' },
          skills: {},
          agents,
          docs: {},
          hooks: {
            'intent-router': routerScript,
            'intent-learner': learnerScript,
          },
          intent_patterns: patterns,
          intent_prompt_template: promptTemplate,
        },
      };
    }

    it('file map includes intent-router.mjs', () => {
      const files = buildFileMap(makeFullSpec());
      expect(files.has('.claude/hooks/intent-router.mjs')).toBe(true);
    });

    it('file map includes intent-learner.mjs', () => {
      const files = buildFileMap(makeFullSpec());
      expect(files.has('.claude/hooks/intent-learner.mjs')).toBe(true);
    });

    it('settings.json has UserPromptSubmit hooks', () => {
      const files = buildFileMap(makeFullSpec());
      const settings = JSON.parse(files.get('.claude/settings.json')!);
      expect(settings.hooks.UserPromptSubmit).toBeDefined();
    });

    it('settings.json has SessionStart hooks with learner', () => {
      const files = buildFileMap(makeFullSpec());
      const settings = JSON.parse(files.get('.claude/settings.json')!);
      expect(settings.hooks.SessionStart).toBeDefined();
      const hasLearner = settings.hooks.SessionStart.some((h: any) =>
        h.hooks?.some((hh: any) => hh.command?.includes('intent-learner.mjs'))
      );
      expect(hasLearner).toBe(true);
    });

    it('settings.json Tier 2 prompt contains workflow manifest', () => {
      const files = buildFileMap(makeFullSpec());
      const settings = JSON.parse(files.get('.claude/settings.json')!);
      const upsHooks = settings.hooks.UserPromptSubmit;
      const promptHook = upsHooks
        .flatMap((h: any) => h.hooks ?? [])
        .find((hh: any) => hh.type === 'prompt');
      expect(promptHook).toBeDefined();
      expect(promptHook.prompt).toContain('/project:deploy');
    });
  });
});
