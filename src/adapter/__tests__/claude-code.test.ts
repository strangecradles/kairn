/**
 * Tests for claude-code adapter: placeholder doc filtering and .env hook removal.
 *
 * Step 5 (honest .env handling): Verifies ENV_LOADER_HOOK is removed
 * Step 6 (living docs): Verifies isPlaceholderDoc filters template-only docs
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EnvironmentSpec } from '../../types.js';

vi.mock('../../autonomy.js', () => ({
  applyAutonomyLevel: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
  },
}));

import { buildFileMap, writeEnvironment } from '../claude-code.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSpec(overrides: Partial<EnvironmentSpec> = {}): EnvironmentSpec {
  return {
    id: 'env_test-123',
    name: 'test-project',
    description: 'A test project',
    intent: 'Build a test project',
    created_at: new Date().toISOString(),
    autonomy_level: 1,
    tools: [],
    harness: {
      claude_md: '# Test\n',
      settings: {},
      mcp_config: {},
      commands: {},
      rules: {},
      skills: {},
      agents: {},
      docs: {},
      hooks: {},
      intent_patterns: [],
      intent_prompt_template: '',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Placeholder doc filtering in buildFileMap
// ---------------------------------------------------------------------------

describe('buildFileMap — placeholder doc filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('excludes docs with only header rows and no data', () => {
    const spec = makeSpec({
      harness: {
        ...makeSpec().harness,
        docs: {
          DECISIONS: '# Decisions\n\n| Date | Decision | Rationale |\n|------|----------|-----------|',
        },
      },
    });

    const files = buildFileMap(spec);
    expect(files.has('.claude/docs/DECISIONS.md')).toBe(false);
  });

  it('excludes docs containing "(Add decisions here as they are made)"', () => {
    const spec = makeSpec({
      harness: {
        ...makeSpec().harness,
        docs: {
          DECISIONS: '# Decisions\n\n(Add decisions here as they are made)',
        },
      },
    });

    const files = buildFileMap(spec);
    expect(files.has('.claude/docs/DECISIONS.md')).toBe(false);
  });

  it('excludes docs containing "(Add learnings here as they are discovered)"', () => {
    const spec = makeSpec({
      harness: {
        ...makeSpec().harness,
        docs: {
          LEARNINGS: '# Learnings\n\n(Add learnings here as they are discovered)',
        },
      },
    });

    const files = buildFileMap(spec);
    expect(files.has('.claude/docs/LEARNINGS.md')).toBe(false);
  });

  it('excludes docs with very short non-header content', () => {
    const spec = makeSpec({
      harness: {
        ...makeSpec().harness,
        docs: {
          SPRINT: '# Sprint\n\n## Status\n\nNot started',
        },
      },
    });

    const files = buildFileMap(spec);
    expect(files.has('.claude/docs/SPRINT.md')).toBe(false);
  });

  it('includes docs with substantial content', () => {
    const spec = makeSpec({
      harness: {
        ...makeSpec().harness,
        docs: {
          DECISIONS: '# Decisions\n\n| Date | Decision | Rationale |\n|------|----------|----------|\n| 2024-01-01 | Use TypeScript strict mode | Catches bugs at compile time, improves refactoring safety |',
        },
      },
    });

    const files = buildFileMap(spec);
    expect(files.has('.claude/docs/DECISIONS.md')).toBe(true);
  });

  it('includes docs with real prose content', () => {
    const spec = makeSpec({
      harness: {
        ...makeSpec().harness,
        docs: {
          ARCHITECTURE: '# Architecture\n\nThis project follows a clean architecture pattern with separate layers for domain, application, and infrastructure concerns. The domain layer contains entities and value objects that are framework-agnostic.',
        },
      },
    });

    const files = buildFileMap(spec);
    expect(files.has('.claude/docs/ARCHITECTURE.md')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Placeholder doc filtering in writeEnvironment
// ---------------------------------------------------------------------------

describe('writeEnvironment — placeholder doc filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not write placeholder docs to disk', async () => {
    const spec = makeSpec({
      harness: {
        ...makeSpec().harness,
        docs: {
          DECISIONS: '# Decisions\n\n| Date | Decision | Rationale |\n|------|----------|-----------|',
          LEARNINGS: '# Learnings\n\n(Add learnings here as they are discovered)',
        },
      },
    });

    const written = await writeEnvironment(spec, '/tmp/test-env');
    expect(written).not.toContain('.claude/docs/DECISIONS.md');
    expect(written).not.toContain('.claude/docs/LEARNINGS.md');
  });

  it('writes docs with real content to disk', async () => {
    const spec = makeSpec({
      harness: {
        ...makeSpec().harness,
        docs: {
          ARCHITECTURE: '# Architecture\n\nThis project uses a microservices architecture with event-driven communication between services. Each service owns its database and communicates via message queues.',
        },
      },
    });

    const written = await writeEnvironment(spec, '/tmp/test-env');
    expect(written).toContain('.claude/docs/ARCHITECTURE.md');
  });
});

// ---------------------------------------------------------------------------
// .env loader hook removal
// ---------------------------------------------------------------------------

describe('resolveSettings — .env loader hook removed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not inject SessionStart .env loader hook even when hasEnvVars is true', () => {
    const spec = makeSpec({
      harness: {
        ...makeSpec().harness,
        commands: { status: 'Show status', test: 'Run tests' },
        settings: {
          permissions: { allow: ['Read'], deny: ['Bash(rm -rf *)'] },
        },
      },
    });

    const files = buildFileMap(spec);
    const settingsJson = files.get('.claude/settings.json');
    expect(settingsJson).toBeDefined();

    const settings = JSON.parse(settingsJson!);
    // SessionStart should not contain the .env loader
    const sessionStart = settings.hooks?.SessionStart ?? [];
    for (const hook of sessionStart) {
      for (const h of (hook.hooks ?? [])) {
        if (typeof h.command === 'string') {
          expect(h.command).not.toContain('CLAUDE_ENV_FILE');
          expect(h.command).not.toContain('grep -v "^#" .env');
        }
      }
    }
  });
});
