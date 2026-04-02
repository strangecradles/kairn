/**
 * Round-trip integration tests: parse(dir) -> IR -> render -> parse -> compare.
 *
 * Proves that no semantic content is lost when going through the
 * parse -> render -> parse cycle. Byte-identical output is NOT required
 * (whitespace normalization, key ordering differences are acceptable),
 * but all content nodes must survive.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import { parseHarness, parseYamlFrontmatter, parseSettings, parseMcpConfig } from "../parser.js";
import {
  renderHarness,
  renderHarnessToDir,
  renderRuleWithFrontmatter,
  renderAgentWithFrontmatter,
  renderSettings,
  renderMcpConfig,
} from "../renderer.js";
import { createEmptyIR, createSection, createEmptySettings } from "../types.js";
import type { HarnessIR, SettingsIR, McpServerNode, RuleNode, AgentNode } from "../types.js";

// ---------------------------------------------------------------------------
// The project root, resolved relative to this test file at src/ir/__tests__/
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");

// ---------------------------------------------------------------------------
// Temp dir lifecycle
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = path.join(
    "/tmp",
    `kairn-roundtrip-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await fs.mkdir(tempDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

/** Write a file inside the temp dir, creating parent dirs as needed. */
async function writeFile(relativePath: string, content: string): Promise<void> {
  const fullPath = path.join(tempDir, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf-8");
}

// ---------------------------------------------------------------------------
// 1. Real .claude/ directory round-trip
// ---------------------------------------------------------------------------

describe("round-trip: real .claude/ directory", () => {
  it("preserves all sections through parse -> render -> parse", async () => {
    const claudeDir = path.join(PROJECT_ROOT, ".claude");

    // Parse original
    const ir1 = await parseHarness(claudeDir);

    // Render to a fresh directory
    const outputDir = path.join(tempDir, "pass1");
    await renderHarnessToDir(ir1, outputDir);

    // Parse the rendered output
    const ir2 = await parseHarness(outputDir);

    // All section IDs must survive
    const ids1 = ir1.sections.map((s) => s.id).sort();
    const ids2 = ir2.sections.map((s) => s.id).sort();
    expect(ids2).toEqual(ids1);
  });

  it("preserves all commands through parse -> render -> parse", async () => {
    const claudeDir = path.join(PROJECT_ROOT, ".claude");
    const ir1 = await parseHarness(claudeDir);

    const outputDir = path.join(tempDir, "pass1-cmds");
    await renderHarnessToDir(ir1, outputDir);
    const ir2 = await parseHarness(outputDir);

    const names1 = ir1.commands.map((c) => c.name).sort();
    const names2 = ir2.commands.map((c) => c.name).sort();
    expect(names2).toEqual(names1);

    // Sanity: we actually have commands to compare
    expect(names1.length).toBeGreaterThan(0);
  });

  it("preserves all rules through parse -> render -> parse", async () => {
    const claudeDir = path.join(PROJECT_ROOT, ".claude");
    const ir1 = await parseHarness(claudeDir);

    const outputDir = path.join(tempDir, "pass1-rules");
    await renderHarnessToDir(ir1, outputDir);
    const ir2 = await parseHarness(outputDir);

    const names1 = ir1.rules.map((r) => r.name).sort();
    const names2 = ir2.rules.map((r) => r.name).sort();
    expect(names2).toEqual(names1);
    expect(names1.length).toBeGreaterThan(0);
  });

  it("preserves all agents through parse -> render -> parse", async () => {
    const claudeDir = path.join(PROJECT_ROOT, ".claude");
    const ir1 = await parseHarness(claudeDir);

    const outputDir = path.join(tempDir, "pass1-agents");
    await renderHarnessToDir(ir1, outputDir);
    const ir2 = await parseHarness(outputDir);

    const names1 = ir1.agents.map((a) => a.name).sort();
    const names2 = ir2.agents.map((a) => a.name).sort();
    expect(names2).toEqual(names1);
    expect(names1.length).toBeGreaterThan(0);
  });

  it("preserves meta.name through parse -> render -> parse", async () => {
    const claudeDir = path.join(PROJECT_ROOT, ".claude");
    const ir1 = await parseHarness(claudeDir);

    const outputDir = path.join(tempDir, "pass1-meta");
    await renderHarnessToDir(ir1, outputDir);
    const ir2 = await parseHarness(outputDir);

    expect(ir2.meta.name).toBe(ir1.meta.name);
  });

  it("preserves section headings through round-trip", async () => {
    const claudeDir = path.join(PROJECT_ROOT, ".claude");
    const ir1 = await parseHarness(claudeDir);

    const outputDir = path.join(tempDir, "pass1-headings");
    await renderHarnessToDir(ir1, outputDir);
    const ir2 = await parseHarness(outputDir);

    const headings1 = ir1.sections.map((s) => s.heading).sort();
    const headings2 = ir2.sections.map((s) => s.heading).sort();
    expect(headings2).toEqual(headings1);
  });

  it("preserves settings structured fields through round-trip", async () => {
    const claudeDir = path.join(PROJECT_ROOT, ".claude");
    const ir1 = await parseHarness(claudeDir);

    const outputDir = path.join(tempDir, "pass1-settings");
    await renderHarnessToDir(ir1, outputDir);
    const ir2 = await parseHarness(outputDir);

    // Deny patterns
    expect(ir2.settings.denyPatterns).toEqual(ir1.settings.denyPatterns);

    // Status line
    expect(ir2.settings.statusLine).toEqual(ir1.settings.statusLine);

    // Hook event types with entries
    const hookEvents = [
      "PreToolUse",
      "PostToolUse",
      "UserPromptSubmit",
      "SessionStart",
      "PostCompact",
    ] as const;

    for (const event of hookEvents) {
      const hooks1 = ir1.settings.hooks[event];
      const hooks2 = ir2.settings.hooks[event];
      if (hooks1 && hooks1.length > 0) {
        expect(hooks2).toBeDefined();
        expect(hooks2!.length).toBe(hooks1.length);
      } else {
        // Both should be undefined or empty
        expect(hooks2 ?? []).toEqual(hooks1 ?? []);
      }
    }
  });

  it("preserves docs through parse -> render -> parse", async () => {
    const claudeDir = path.join(PROJECT_ROOT, ".claude");
    const ir1 = await parseHarness(claudeDir);

    const outputDir = path.join(tempDir, "pass1-docs");
    await renderHarnessToDir(ir1, outputDir);
    const ir2 = await parseHarness(outputDir);

    const names1 = ir1.docs.map((d) => d.name).sort();
    const names2 = ir2.docs.map((d) => d.name).sort();
    expect(names2).toEqual(names1);
  });
});

// ---------------------------------------------------------------------------
// 2. Synthetic full-harness round-trip
// ---------------------------------------------------------------------------

describe("round-trip: synthetic full harness", () => {
  /**
   * Build a complete synthetic harness directory and verify that
   * parse -> render -> parse produces structurally identical IR.
   */
  it("full harness: parse -> render -> parse preserves all node counts and identifiers", async () => {
    // --- Build the synthetic harness ---
    const harnessDir = path.join(tempDir, "harness");

    // CLAUDE.md with 6 sections
    await writeFile(
      "harness/CLAUDE.md",
      `# Synthetic Project

A synthetic harness for round-trip testing.

## Purpose
Validate that the IR round-trips without content loss.

## Tech Stack
- TypeScript (strict, ESM), tsup bundler
- vitest for testing
- npm as package manager

## Commands
\`\`\`bash
npm run build
npm test
\`\`\`

## Conventions
- async/await everywhere
- Use chalk for colors

## Architecture
\`\`\`
src/
  cli.ts
  types.ts
\`\`\`

## Custom Section
This is a custom section that tests custom-* ID assignment.
`,
    );

    // commands/build.md and commands/test.md
    await writeFile(
      "harness/commands/build.md",
      "Run the build pipeline.\n\n```bash\nnpm run build\n```\n",
    );
    await writeFile(
      "harness/commands/test.md",
      "Run all tests.\n\n```bash\nnpm test\n```\n",
    );

    // rules/security.md (with YAML frontmatter paths)
    await writeFile(
      "harness/rules/security.md",
      `---
paths:
  - src/auth/**
  - src/secrets/**
---

# Security Rules

- Never log secrets.
- Always validate input.
`,
    );

    // rules/typescript.md (no frontmatter)
    await writeFile(
      "harness/rules/typescript.md",
      `# TypeScript Rules

- strict mode always on
- Use fs.promises for all file I/O
- ESM only
`,
    );

    // agents/architect.md (with YAML frontmatter model)
    await writeFile(
      "harness/agents/architect.md",
      `---
model: opus
---

You are an implementation architect.
Plan before coding.
`,
    );

    // settings.json with hooks and deny patterns
    await writeFile(
      "harness/settings.json",
      JSON.stringify(
        {
          permissions: {
            deny: ["Bash(rm -rf *)"],
          },
          hooks: {
            PreToolUse: [
              {
                matcher: "Bash",
                hooks: [{ type: "command", command: "echo safety-check" }],
              },
            ],
            PostCompact: [
              {
                matcher: "",
                hooks: [
                  { type: "prompt", prompt: "Re-read CLAUDE.md for context." },
                ],
              },
            ],
          },
          statusLine: {
            command: "git branch --show-current",
          },
        },
        null,
        2,
      ),
    );

    // .mcp.json inside the harness directory
    await writeFile(
      "harness/.mcp.json",
      JSON.stringify(
        {
          mcpServers: {
            "test-mcp": {
              command: "npx",
              args: ["-y", "@test/mcp-server"],
              env: { TOKEN: "abc123" },
            },
          },
        },
        null,
        2,
      ),
    );

    // --- Parse -> Render -> Parse ---
    const ir1 = await parseHarness(harnessDir);

    const outputDir = path.join(tempDir, "output");
    await renderHarnessToDir(ir1, outputDir);

    const ir2 = await parseHarness(outputDir);

    // --- Compare node counts ---
    expect(ir2.sections.length).toBe(ir1.sections.length);
    expect(ir2.commands.length).toBe(ir1.commands.length);
    expect(ir2.rules.length).toBe(ir1.rules.length);
    expect(ir2.agents.length).toBe(ir1.agents.length);

    // --- Compare identifiers ---
    expect(ir2.sections.map((s) => s.id).sort()).toEqual(
      ir1.sections.map((s) => s.id).sort(),
    );
    expect(ir2.commands.map((c) => c.name).sort()).toEqual(
      ir1.commands.map((c) => c.name).sort(),
    );
    expect(ir2.rules.map((r) => r.name).sort()).toEqual(
      ir1.rules.map((r) => r.name).sort(),
    );
    expect(ir2.agents.map((a) => a.name).sort()).toEqual(
      ir1.agents.map((a) => a.name).sort(),
    );

    // --- Compare meta ---
    expect(ir2.meta.name).toBe(ir1.meta.name);
    expect(ir2.meta.purpose).toBe(ir1.meta.purpose);

    // --- Compare rule content (semantic, not byte-identical) ---
    const secRule1 = ir1.rules.find((r) => r.name === "security")!;
    const secRule2 = ir2.rules.find((r) => r.name === "security")!;
    expect(secRule2.paths).toEqual(secRule1.paths);
    expect(secRule2.content).toContain("Never log secrets.");

    const tsRule1 = ir1.rules.find((r) => r.name === "typescript")!;
    const tsRule2 = ir2.rules.find((r) => r.name === "typescript")!;
    expect(tsRule2.paths).toBeUndefined();
    expect(tsRule2.content).toContain("strict mode always on");

    // --- Compare agent model ---
    const arch1 = ir1.agents.find((a) => a.name === "architect")!;
    const arch2 = ir2.agents.find((a) => a.name === "architect")!;
    expect(arch2.model).toBe(arch1.model);
    expect(arch2.content).toContain("implementation architect");

    // --- Compare settings structured fields ---
    expect(ir2.settings.denyPatterns).toEqual(ir1.settings.denyPatterns);
    expect(ir2.settings.statusLine).toEqual(ir1.settings.statusLine);
    expect(ir2.settings.hooks.PreToolUse?.length).toBe(
      ir1.settings.hooks.PreToolUse?.length,
    );
    expect(ir2.settings.hooks.PostCompact?.length).toBe(
      ir1.settings.hooks.PostCompact?.length,
    );

    // --- Compare MCP servers ---
    expect(ir2.mcpServers.map((s) => s.id).sort()).toEqual(
      ir1.mcpServers.map((s) => s.id).sort(),
    );
    const mcpServer1 = ir1.mcpServers.find((s) => s.id === "test-mcp")!;
    const mcpServer2 = ir2.mcpServers.find((s) => s.id === "test-mcp")!;
    expect(mcpServer2.command).toBe(mcpServer1.command);
    expect(mcpServer2.args).toEqual(mcpServer1.args);
    expect(mcpServer2.env).toEqual(mcpServer1.env);
  });

  it("double round-trip is stable (idempotent after first pass)", async () => {
    // Build a simple harness
    const harnessDir = path.join(tempDir, "harness-idem");

    await writeFile(
      "harness-idem/CLAUDE.md",
      `# Idempotent Test

## Purpose
Test double round-trip stability.

## Conventions
- Be consistent.
`,
    );
    await writeFile(
      "harness-idem/commands/build.md",
      "Build the project.\n\n```bash\nnpm run build\n```\n",
    );
    await writeFile(
      "harness-idem/rules/general.md",
      "# General Rules\n\nFollow conventions.\n",
    );

    // First round-trip
    const ir1 = await parseHarness(harnessDir);
    const pass1Dir = path.join(tempDir, "pass1-idem");
    await renderHarnessToDir(ir1, pass1Dir);
    const ir2 = await parseHarness(pass1Dir);

    // Second round-trip
    const pass2Dir = path.join(tempDir, "pass2-idem");
    await renderHarnessToDir(ir2, pass2Dir);
    const ir3 = await parseHarness(pass2Dir);

    // ir2 and ir3 should be identical (the second round-trip introduces no change)
    expect(ir3.sections.map((s) => s.id).sort()).toEqual(
      ir2.sections.map((s) => s.id).sort(),
    );
    expect(ir3.commands.map((c) => c.name).sort()).toEqual(
      ir2.commands.map((c) => c.name).sort(),
    );
    expect(ir3.rules.map((r) => r.name).sort()).toEqual(
      ir2.rules.map((r) => r.name).sort(),
    );
    expect(ir3.meta.name).toBe(ir2.meta.name);

    // Content should also match after stabilization
    for (const section2 of ir2.sections) {
      const section3 = ir3.sections.find((s) => s.id === section2.id);
      expect(section3).toBeDefined();
      expect(section3!.content.trim()).toBe(section2.content.trim());
    }
  });
});

// ---------------------------------------------------------------------------
// 3. YAML frontmatter round-trip
// ---------------------------------------------------------------------------

describe("round-trip: YAML frontmatter", () => {
  it("rule paths survive render -> parse cycle", () => {
    const rule: RuleNode = {
      name: "scoped",
      content: "Only apply to src/compiler.",
      paths: ["src/compiler/**", "src/adapter/**"],
    };

    const rendered = renderRuleWithFrontmatter(rule);
    const { frontmatter, body } = parseYamlFrontmatter(rendered);

    expect(frontmatter["paths"]).toEqual(["src/compiler/**", "src/adapter/**"]);
    expect(body.trim()).toBe("Only apply to src/compiler.");
  });

  it("rule without paths has no frontmatter after render -> parse", () => {
    const rule: RuleNode = {
      name: "unscoped",
      content: "Global rule.",
    };

    const rendered = renderRuleWithFrontmatter(rule);
    const { frontmatter, body } = parseYamlFrontmatter(rendered);

    expect(Object.keys(frontmatter)).toHaveLength(0);
    expect(body.trim()).toBe("Global rule.");
  });

  it("agent model survives render -> parse cycle", () => {
    const agent: AgentNode = {
      name: "planner",
      content: "You are a planning agent.",
      model: "opus",
    };

    const rendered = renderAgentWithFrontmatter(agent);
    const { frontmatter, body } = parseYamlFrontmatter(rendered);

    expect(frontmatter["model"]).toBe("opus");
    expect(body.trim()).toBe("You are a planning agent.");
  });

  it("agent disallowedTools survives render -> parse cycle", () => {
    const agent: AgentNode = {
      name: "reader",
      content: "Read-only agent.",
      model: "sonnet",
      disallowedTools: ["Write", "Edit", "Bash"],
    };

    const rendered = renderAgentWithFrontmatter(agent);
    const { frontmatter, body } = parseYamlFrontmatter(rendered);

    expect(frontmatter["model"]).toBe("sonnet");
    expect(frontmatter["disallowedTools"]).toEqual(["Write", "Edit", "Bash"]);
    expect(body.trim()).toBe("Read-only agent.");
  });

  it("agent without model or disallowedTools has no frontmatter", () => {
    const agent: AgentNode = {
      name: "basic",
      content: "A basic agent.",
    };

    const rendered = renderAgentWithFrontmatter(agent);
    const { frontmatter, body } = parseYamlFrontmatter(rendered);

    expect(Object.keys(frontmatter)).toHaveLength(0);
    expect(body.trim()).toBe("A basic agent.");
  });

  it("rule with single path round-trips", () => {
    const rule: RuleNode = {
      name: "narrow",
      content: "Narrow scope.",
      paths: ["src/index.ts"],
    };

    const rendered = renderRuleWithFrontmatter(rule);
    const { frontmatter, body } = parseYamlFrontmatter(rendered);

    expect(frontmatter["paths"]).toEqual(["src/index.ts"]);
    expect(body.trim()).toBe("Narrow scope.");
  });
});

// ---------------------------------------------------------------------------
// 4. Settings round-trip
// ---------------------------------------------------------------------------

describe("round-trip: settings", () => {
  it("hooks survive render -> parse cycle", () => {
    const settings: SettingsIR = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [{ type: "command", command: "echo pre-check" }],
          },
        ],
        PostToolUse: [
          {
            matcher: "Edit|Write",
            hooks: [{ type: "command", command: "npx eslint --fix" }],
          },
        ],
        PostCompact: [
          {
            matcher: "",
            hooks: [{ type: "prompt", prompt: "Re-read CLAUDE.md" }],
          },
        ],
      },
      raw: {},
    };

    const rendered = renderSettings(settings);
    const parsed = parseSettings(rendered);

    expect(parsed.hooks.PreToolUse).toHaveLength(1);
    expect(parsed.hooks.PreToolUse![0].matcher).toBe("Bash");
    expect(parsed.hooks.PreToolUse![0].hooks[0].type).toBe("command");
    expect(parsed.hooks.PreToolUse![0].hooks[0].command).toBe("echo pre-check");

    expect(parsed.hooks.PostToolUse).toHaveLength(1);
    expect(parsed.hooks.PostToolUse![0].matcher).toBe("Edit|Write");

    expect(parsed.hooks.PostCompact).toHaveLength(1);
    expect(parsed.hooks.PostCompact![0].hooks[0].type).toBe("prompt");
    expect(parsed.hooks.PostCompact![0].hooks[0].prompt).toBe("Re-read CLAUDE.md");
  });

  it("denyPatterns survive render -> parse cycle", () => {
    const settings: SettingsIR = {
      hooks: {},
      denyPatterns: ["Bash(rm -rf *)", "Bash(curl|sh)", "Read(.env)"],
      raw: {},
    };

    const rendered = renderSettings(settings);
    const parsed = parseSettings(rendered);

    expect(parsed.denyPatterns).toEqual([
      "Bash(rm -rf *)",
      "Bash(curl|sh)",
      "Read(.env)",
    ]);
  });

  it("statusLine survives render -> parse cycle", () => {
    const settings: SettingsIR = {
      hooks: {},
      statusLine: { command: "git branch --show-current" },
      raw: {},
    };

    const rendered = renderSettings(settings);
    const parsed = parseSettings(rendered);

    expect(parsed.statusLine).toEqual({ command: "git branch --show-current" });
  });

  it("raw fields survive render -> parse cycle", () => {
    const settings: SettingsIR = {
      hooks: {},
      raw: {
        customBoolean: true,
        customNumber: 42,
        customString: "hello",
        customObject: { nested: "value" },
      },
    };

    const rendered = renderSettings(settings);
    const parsed = parseSettings(rendered);

    expect(parsed.raw["customBoolean"]).toBe(true);
    expect(parsed.raw["customNumber"]).toBe(42);
    expect(parsed.raw["customString"]).toBe("hello");
    expect(parsed.raw["customObject"]).toEqual({ nested: "value" });
  });

  it("combined settings (hooks + deny + statusLine + raw) survive round-trip", () => {
    const settings: SettingsIR = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [{ type: "command", command: "echo check" }],
          },
        ],
        SessionStart: [
          {
            matcher: "",
            hooks: [{ type: "prompt", prompt: "Welcome back." }],
          },
        ],
      },
      denyPatterns: ["Bash(rm -rf /)"],
      statusLine: { command: "echo status" },
      raw: { extraField: "preserved" },
    };

    const rendered = renderSettings(settings);
    const parsed = parseSettings(rendered);

    expect(parsed.hooks.PreToolUse).toHaveLength(1);
    expect(parsed.hooks.SessionStart).toHaveLength(1);
    expect(parsed.denyPatterns).toEqual(["Bash(rm -rf /)"]);
    expect(parsed.statusLine).toEqual({ command: "echo status" });
    expect(parsed.raw["extraField"]).toBe("preserved");
  });

  it("empty settings round-trips to empty settings", () => {
    const settings = createEmptySettings();

    const rendered = renderSettings(settings);
    const parsed = parseSettings(rendered);

    expect(parsed.hooks).toEqual({});
    expect(parsed.denyPatterns).toBeUndefined();
    expect(parsed.statusLine).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. .mcp.json round-trip
// ---------------------------------------------------------------------------

describe("round-trip: .mcp.json", () => {
  it("server IDs survive render -> parse cycle", () => {
    const servers: McpServerNode[] = [
      {
        id: "context7",
        command: "npx",
        args: ["-y", "@upstash/context7-mcp"],
      },
      {
        id: "github",
        command: "npx",
        args: ["-y", "@github/mcp-server"],
        env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" },
      },
    ];

    const rendered = renderMcpConfig(servers);
    const parsed = parseMcpConfig(rendered);

    expect(parsed.map((s) => s.id).sort()).toEqual(["context7", "github"]);
  });

  it("server command and args survive render -> parse cycle", () => {
    const servers: McpServerNode[] = [
      {
        id: "my-server",
        command: "node",
        args: ["--experimental-modules", "server.js", "--port", "3000"],
      },
    ];

    const rendered = renderMcpConfig(servers);
    const parsed = parseMcpConfig(rendered);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].command).toBe("node");
    expect(parsed[0].args).toEqual([
      "--experimental-modules",
      "server.js",
      "--port",
      "3000",
    ]);
  });

  it("server env survives render -> parse cycle", () => {
    const servers: McpServerNode[] = [
      {
        id: "authed",
        command: "npx",
        args: ["-y", "some-mcp"],
        env: {
          API_KEY: "${API_KEY}",
          REGION: "us-east-1",
        },
      },
    ];

    const rendered = renderMcpConfig(servers);
    const parsed = parseMcpConfig(rendered);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].env).toEqual({
      API_KEY: "${API_KEY}",
      REGION: "us-east-1",
    });
  });

  it("server without env has undefined env after round-trip", () => {
    const servers: McpServerNode[] = [
      {
        id: "simple",
        command: "node",
        args: ["server.js"],
      },
    ];

    const rendered = renderMcpConfig(servers);
    const parsed = parseMcpConfig(rendered);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].env).toBeUndefined();
  });

  it("multiple servers all survive round-trip", () => {
    const servers: McpServerNode[] = [
      { id: "alpha", command: "npx", args: ["-y", "alpha-mcp"] },
      { id: "beta", command: "node", args: ["beta.js"] },
      { id: "gamma", command: "deno", args: ["run", "gamma.ts"], env: { X: "1" } },
    ];

    const rendered = renderMcpConfig(servers);
    const parsed = parseMcpConfig(rendered);

    expect(parsed).toHaveLength(3);
    expect(parsed.map((s) => s.id).sort()).toEqual(["alpha", "beta", "gamma"]);

    const gamma = parsed.find((s) => s.id === "gamma")!;
    expect(gamma.command).toBe("deno");
    expect(gamma.args).toEqual(["run", "gamma.ts"]);
    expect(gamma.env).toEqual({ X: "1" });
  });

  it("empty servers array produces empty string (no file written)", () => {
    const rendered = renderMcpConfig([]);
    expect(rendered).toBe("");
  });
});

// ---------------------------------------------------------------------------
// 6. Edge cases
// ---------------------------------------------------------------------------

describe("round-trip: edge cases", () => {
  it("empty harness directory round-trips to empty IR", async () => {
    const emptyDir = path.join(tempDir, "empty-harness");
    await fs.mkdir(emptyDir, { recursive: true });

    const ir1 = await parseHarness(emptyDir);

    // Render (should produce no files for empty IR)
    const files = renderHarness(ir1);
    expect(files.size).toBe(0);
  });

  it("harness with only CLAUDE.md round-trips correctly", async () => {
    const harnessDir = path.join(tempDir, "claude-only");
    await writeFile(
      "claude-only/CLAUDE.md",
      "# Minimal\n\nJust a CLAUDE.md.\n\n## Purpose\nBe minimal.\n",
    );

    const ir1 = await parseHarness(harnessDir);
    const outputDir = path.join(tempDir, "claude-only-output");
    await renderHarnessToDir(ir1, outputDir);
    const ir2 = await parseHarness(outputDir);

    expect(ir2.meta.name).toBe("Minimal");
    expect(ir2.sections.map((s) => s.id).sort()).toEqual(
      ir1.sections.map((s) => s.id).sort(),
    );
    expect(ir2.commands).toEqual([]);
    expect(ir2.rules).toEqual([]);
    expect(ir2.agents).toEqual([]);
  });

  it("section content with code blocks and special characters round-trips", async () => {
    const harnessDir = path.join(tempDir, "special-chars");
    await writeFile(
      "special-chars/CLAUDE.md",
      `# Special Chars

## Commands
\`\`\`bash
npm run build          # tsup -> dist/
npm test               # vitest
echo "hello $WORLD"
\`\`\`

## Conventions
- Use \`chalk\` colors: green=success, yellow=warn
- Errors: catch at command level, \`process.exit(1)\`
- IDs: \`crypto.randomUUID()\` prefixed with \`env_\`
`,
    );

    const ir1 = await parseHarness(harnessDir);
    const outputDir = path.join(tempDir, "special-chars-output");
    await renderHarnessToDir(ir1, outputDir);
    const ir2 = await parseHarness(outputDir);

    const cmds1 = ir1.sections.find((s) => s.id === "commands")!;
    const cmds2 = ir2.sections.find((s) => s.id === "commands")!;
    expect(cmds2.content).toContain("tsup -> dist/");
    expect(cmds2.content).toContain('echo "hello $WORLD"');

    const conv1 = ir1.sections.find((s) => s.id === "conventions")!;
    const conv2 = ir2.sections.find((s) => s.id === "conventions")!;
    expect(conv2.content).toContain("`chalk`");
    expect(conv2.content).toContain("`process.exit(1)`");
  });

  it("command content is preserved exactly through round-trip", async () => {
    const harnessDir = path.join(tempDir, "cmd-content");
    const cmdContent =
      "Run the full build pipeline with type checking.\n\n```bash\nnpm run build && npx tsc --noEmit\n```\n\nExpected: zero errors.";
    await writeFile("cmd-content/commands/build.md", cmdContent);

    const ir1 = await parseHarness(harnessDir);
    const outputDir = path.join(tempDir, "cmd-content-output");
    await renderHarnessToDir(ir1, outputDir);
    const ir2 = await parseHarness(outputDir);

    expect(ir2.commands).toHaveLength(1);
    expect(ir2.commands[0].name).toBe("build");
    expect(ir2.commands[0].content).toBe(ir1.commands[0].content);
  });
});
