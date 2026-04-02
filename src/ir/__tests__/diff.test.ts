import { describe, it, expect } from "vitest";
import { diffIR, formatIRDiff } from "../diff.js";
import {
  createEmptyIR,
  createEmptyDiff,
  createSection,
  createCommandNode,
  createRuleNode,
  createAgentNode,
  createEmptySettings,
} from "../types.js";
import type { HarnessIR, McpServerNode } from "../types.js";

// ---------------------------------------------------------------------------
// Helper: build an IR with specific overrides
// ---------------------------------------------------------------------------

function buildIR(overrides: Partial<HarnessIR>): HarnessIR {
  return { ...createEmptyIR(), ...overrides };
}

// ---------------------------------------------------------------------------
// diffIR
// ---------------------------------------------------------------------------

describe("diffIR", () => {
  // 1. Identical IRs
  it("returns an empty diff when both IRs are identical", () => {
    const ir = createEmptyIR();
    const diff = diffIR(ir, ir);

    expect(diff).toEqual(createEmptyDiff());
  });

  // --- Sections ---

  // 2. Added section
  it("detects an added section", () => {
    const before = createEmptyIR();
    const after = buildIR({
      sections: [createSection("intro", "## Intro", "Welcome", 0)],
    });

    const diff = diffIR(before, after);

    expect(diff.sections.added).toHaveLength(1);
    expect(diff.sections.added[0].id).toBe("intro");
    expect(diff.sections.removed).toHaveLength(0);
  });

  // 3. Removed section
  it("detects a removed section", () => {
    const before = buildIR({
      sections: [createSection("old", "## Old", "Gone soon", 0)],
    });
    const after = createEmptyIR();

    const diff = diffIR(before, after);

    expect(diff.sections.removed).toHaveLength(1);
    expect(diff.sections.removed[0].id).toBe("old");
    expect(diff.sections.added).toHaveLength(0);
  });

  // 4. Modified section (same id, different content)
  it("detects a modified section when content changes", () => {
    const before = buildIR({
      sections: [createSection("purpose", "## Purpose", "Old purpose", 0)],
    });
    const after = buildIR({
      sections: [createSection("purpose", "## Purpose", "New purpose", 0)],
    });

    const diff = diffIR(before, after);

    expect(diff.sections.modified).toHaveLength(1);
    expect(diff.sections.modified[0].id).toBe("purpose");
    expect(diff.sections.modified[0].before).toBe("Old purpose");
    expect(diff.sections.modified[0].after).toBe("New purpose");
  });

  // 5. Reordered section (same id, different order)
  it("detects a reordered section when order changes", () => {
    const before = buildIR({
      sections: [createSection("commands", "## Commands", "content", 3)],
    });
    const after = buildIR({
      sections: [createSection("commands", "## Commands", "content", 5)],
    });

    const diff = diffIR(before, after);

    expect(diff.sections.reordered).toHaveLength(1);
    expect(diff.sections.reordered[0].id).toBe("commands");
    expect(diff.sections.reordered[0].oldOrder).toBe(3);
    expect(diff.sections.reordered[0].newOrder).toBe(5);
    // Content did not change, so modified should be empty
    expect(diff.sections.modified).toHaveLength(0);
  });

  // --- Commands ---

  // 6. Added command
  it("detects an added command", () => {
    const before = createEmptyIR();
    const after = buildIR({
      commands: [createCommandNode("deploy", "Deploy to prod", "Deploys app")],
    });

    const diff = diffIR(before, after);

    expect(diff.commands.added).toHaveLength(1);
    expect(diff.commands.added[0].name).toBe("deploy");
  });

  // 7. Removed command
  it("detects a removed command", () => {
    const before = buildIR({
      commands: [createCommandNode("old-deploy", "Old deploy script")],
    });
    const after = createEmptyIR();

    const diff = diffIR(before, after);

    expect(diff.commands.removed).toEqual(["old-deploy"]);
  });

  // 8. Modified command
  it("detects a modified command when content changes", () => {
    const before = buildIR({
      commands: [createCommandNode("build", "npm run build")],
    });
    const after = buildIR({
      commands: [createCommandNode("build", "npm run build && npm test")],
    });

    const diff = diffIR(before, after);

    expect(diff.commands.modified).toHaveLength(1);
    expect(diff.commands.modified[0].name).toBe("build");
    expect(diff.commands.modified[0].before).toBe("npm run build");
    expect(diff.commands.modified[0].after).toBe("npm run build && npm test");
  });

  // --- Rules ---

  // 9. Added rule
  it("detects an added rule", () => {
    const before = createEmptyIR();
    const after = buildIR({
      rules: [createRuleNode("security", "No dangerous ops")],
    });

    const diff = diffIR(before, after);

    expect(diff.rules.added).toHaveLength(1);
    expect(diff.rules.added[0].name).toBe("security");
  });

  // 10. Modified rule
  it("detects a modified rule when content changes", () => {
    const before = buildIR({
      rules: [createRuleNode("typescript", "Use strict mode")],
    });
    const after = buildIR({
      rules: [createRuleNode("typescript", "Use strict mode always")],
    });

    const diff = diffIR(before, after);

    expect(diff.rules.modified).toHaveLength(1);
    expect(diff.rules.modified[0].name).toBe("typescript");
    expect(diff.rules.modified[0].before).toBe("Use strict mode");
    expect(diff.rules.modified[0].after).toBe("Use strict mode always");
  });

  // --- Agents ---

  // 11. Added agent
  it("detects an added agent", () => {
    const before = createEmptyIR();
    const after = buildIR({
      agents: [createAgentNode("designer", "Design UI components")],
    });

    const diff = diffIR(before, after);

    expect(diff.agents.added).toHaveLength(1);
    expect(diff.agents.added[0].name).toBe("designer");
  });

  // 12. Modified agent (model changed)
  it("detects a modified agent when model changes", () => {
    const before = buildIR({
      agents: [createAgentNode("architect", "Design systems", "sonnet")],
    });
    const after = buildIR({
      agents: [createAgentNode("architect", "Design systems", "opus")],
    });

    const diff = diffIR(before, after);

    expect(diff.agents.modified).toHaveLength(1);
    expect(diff.agents.modified[0].name).toBe("architect");
    expect(diff.agents.modified[0].changes).toContain("model");
    expect(diff.agents.modified[0].changes).toContain("sonnet");
    expect(diff.agents.modified[0].changes).toContain("opus");
  });

  // 13. Removed agent
  it("detects a removed agent", () => {
    const before = buildIR({
      agents: [createAgentNode("old-agent", "Deprecated agent")],
    });
    const after = createEmptyIR();

    const diff = diffIR(before, after);

    expect(diff.agents.removed).toEqual(["old-agent"]);
  });

  // --- MCP Servers ---

  // 14. Added MCP server
  it("detects an added MCP server", () => {
    const server: McpServerNode = {
      id: "sentry",
      command: "npx",
      args: ["-y", "@sentry/mcp-server"],
      env: { SENTRY_TOKEN: "xxx" },
    };
    const before = createEmptyIR();
    const after = buildIR({ mcpServers: [server] });

    const diff = diffIR(before, after);

    expect(diff.mcpServers.added).toHaveLength(1);
    expect(diff.mcpServers.added[0].id).toBe("sentry");
  });

  // 15. Removed MCP server
  it("detects a removed MCP server", () => {
    const server: McpServerNode = {
      id: "old-server",
      command: "npx",
      args: ["@old/mcp"],
    };
    const before = buildIR({ mcpServers: [server] });
    const after = createEmptyIR();

    const diff = diffIR(before, after);

    expect(diff.mcpServers.removed).toEqual(["old-server"]);
  });

  // --- Settings ---

  // 16. Settings change (denyPatterns changed)
  it("detects a settings change when denyPatterns differ", () => {
    const before = buildIR({
      settings: {
        ...createEmptySettings(),
        denyPatterns: ["rm -rf"],
      },
    });
    const after = buildIR({
      settings: {
        ...createEmptySettings(),
        denyPatterns: ["rm -rf", "curl | sh"],
      },
    });

    const diff = diffIR(before, after);

    expect(diff.settings.changes.length).toBeGreaterThanOrEqual(1);
    const denyChange = diff.settings.changes.find(
      (c) => c.path === "denyPatterns",
    );
    expect(denyChange).toBeDefined();
    expect(denyChange?.before).toEqual(["rm -rf"]);
    expect(denyChange?.after).toEqual(["rm -rf", "curl | sh"]);
  });

  // Settings: statusLine change
  it("detects a settings change when statusLine differs", () => {
    const before = buildIR({
      settings: {
        ...createEmptySettings(),
        statusLine: { command: "git status" },
      },
    });
    const after = buildIR({
      settings: {
        ...createEmptySettings(),
        statusLine: { command: "git log --oneline -3" },
      },
    });

    const diff = diffIR(before, after);

    const statusChange = diff.settings.changes.find(
      (c) => c.path === "statusLine",
    );
    expect(statusChange).toBeDefined();
    expect(statusChange?.before).toEqual({ command: "git status" });
    expect(statusChange?.after).toEqual({ command: "git log --oneline -3" });
  });

  // Settings: hooks change
  it("detects a settings change when hooks differ", () => {
    const before = buildIR({
      settings: {
        ...createEmptySettings(),
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [{ type: "command", command: "echo pre" }],
            },
          ],
        },
      },
    });
    const after = buildIR({
      settings: {
        ...createEmptySettings(),
        hooks: {},
      },
    });

    const diff = diffIR(before, after);

    const hooksChange = diff.settings.changes.find(
      (c) => c.path === "hooks",
    );
    expect(hooksChange).toBeDefined();
  });

  // --- Combined / Multiple ---

  // 17. Multiple changes across categories in one diff
  it("captures multiple changes across categories", () => {
    const before = buildIR({
      sections: [createSection("purpose", "## Purpose", "Old", 0)],
      commands: [createCommandNode("build", "npm build")],
      agents: [createAgentNode("reviewer", "Review code", "sonnet")],
      mcpServers: [
        { id: "old-mcp", command: "npx", args: ["@old/mcp"] },
      ],
    });
    const after = buildIR({
      sections: [
        createSection("purpose", "## Purpose", "New", 0),
        createSection("arch", "## Architecture", "Design notes", 1),
      ],
      commands: [],
      rules: [createRuleNode("lint", "Run linter")],
      agents: [createAgentNode("reviewer", "Review code", "opus")],
      mcpServers: [
        { id: "new-mcp", command: "npx", args: ["@new/mcp"] },
      ],
    });

    const diff = diffIR(before, after);

    // Sections: purpose modified, arch added
    expect(diff.sections.modified).toHaveLength(1);
    expect(diff.sections.added).toHaveLength(1);

    // Commands: build removed
    expect(diff.commands.removed).toEqual(["build"]);

    // Rules: lint added
    expect(diff.rules.added).toHaveLength(1);

    // Agents: reviewer modified (model change)
    expect(diff.agents.modified).toHaveLength(1);

    // MCP: old-mcp removed, new-mcp added
    expect(diff.mcpServers.removed).toEqual(["old-mcp"]);
    expect(diff.mcpServers.added).toHaveLength(1);
    expect(diff.mcpServers.added[0].id).toBe("new-mcp");
  });

  // Agent modified with content change
  it("detects agent modification when content changes", () => {
    const before = buildIR({
      agents: [createAgentNode("coder", "Write code", "sonnet")],
    });
    const after = buildIR({
      agents: [createAgentNode("coder", "Write excellent code", "sonnet")],
    });

    const diff = diffIR(before, after);

    expect(diff.agents.modified).toHaveLength(1);
    expect(diff.agents.modified[0].name).toBe("coder");
    expect(diff.agents.modified[0].changes).toContain("content");
  });

  // Agent modified with disallowedTools change
  it("detects agent modification when disallowedTools change", () => {
    const beforeAgent = createAgentNode("coder", "Write code", "sonnet");
    beforeAgent.disallowedTools = ["Bash"];
    const afterAgent = createAgentNode("coder", "Write code", "sonnet");
    afterAgent.disallowedTools = ["Bash", "Write"];

    const before = buildIR({ agents: [beforeAgent] });
    const after = buildIR({ agents: [afterAgent] });

    const diff = diffIR(before, after);

    expect(diff.agents.modified).toHaveLength(1);
    expect(diff.agents.modified[0].changes).toContain("disallowedTools");
  });

  // Unchanged section produces no diff entry
  it("does not report unchanged sections", () => {
    const section = createSection("stable", "## Stable", "Same content", 2);
    const before = buildIR({ sections: [section] });
    const after = buildIR({ sections: [section] });

    const diff = diffIR(before, after);

    expect(diff.sections.added).toHaveLength(0);
    expect(diff.sections.removed).toHaveLength(0);
    expect(diff.sections.modified).toHaveLength(0);
    expect(diff.sections.reordered).toHaveLength(0);
  });

  // Section with both content and order change
  it("reports both modified and reordered when content and order change", () => {
    const before = buildIR({
      sections: [createSection("mixed", "## Mixed", "Old content", 1)],
    });
    const after = buildIR({
      sections: [createSection("mixed", "## Mixed", "New content", 5)],
    });

    const diff = diffIR(before, after);

    expect(diff.sections.modified).toHaveLength(1);
    expect(diff.sections.reordered).toHaveLength(1);
  });

  // Removed rule
  it("detects a removed rule", () => {
    const before = buildIR({
      rules: [createRuleNode("old-rule", "Deprecated rule")],
    });
    const after = createEmptyIR();

    const diff = diffIR(before, after);

    expect(diff.rules.removed).toEqual(["old-rule"]);
  });
});

// ---------------------------------------------------------------------------
// formatIRDiff
// ---------------------------------------------------------------------------

describe("formatIRDiff", () => {
  // 19. Empty diff
  it("returns 'No changes.' for an empty diff", () => {
    const diff = createEmptyDiff();
    const output = formatIRDiff(diff);

    expect(output).toBe("No changes.");
  });

  // 18. Produces readable output with + and - markers
  it("produces readable output with section additions and removals", () => {
    const diff = createEmptyDiff();
    diff.sections.added = [createSection("new", "## New Section", "content", 0)];
    diff.sections.removed = [
      createSection("old", "## Old Section", "gone", 1),
    ];
    diff.sections.modified = [
      { id: "conv", before: "old text", after: "new text" },
    ];
    diff.sections.reordered = [{ id: "cmds", oldOrder: 3, newOrder: 5 }];

    const output = formatIRDiff(diff);

    expect(output).toContain("Sections:");
    expect(output).toContain("+ Added: ## New Section");
    expect(output).toContain("- Removed: ## Old Section");
    expect(output).toContain("~ Modified: conv");
    expect(output).toMatch(/Reordered:.*cmds.*3.*5/);
  });

  // Commands formatting
  it("formats command additions and removals", () => {
    const diff = createEmptyDiff();
    diff.commands.added = [createCommandNode("deploy", "Deploy script")];
    diff.commands.removed = ["old-deploy"];

    const output = formatIRDiff(diff);

    expect(output).toContain("Commands:");
    expect(output).toContain("+ Added: deploy");
    expect(output).toContain("- Removed: old-deploy");
  });

  // Rules formatting
  it("formats rule modifications", () => {
    const diff = createEmptyDiff();
    diff.rules.modified = [
      { name: "typescript", before: "old", after: "new" },
    ];

    const output = formatIRDiff(diff);

    expect(output).toContain("Rules:");
    expect(output).toContain("~ Modified: typescript");
  });

  // Agents formatting
  it("formats agent additions, removals, and modifications", () => {
    const diff = createEmptyDiff();
    diff.agents.added = [createAgentNode("designer", "Design components")];
    diff.agents.removed = ["old-agent"];
    diff.agents.modified = [
      { name: "architect", changes: "model changed from sonnet to opus" },
    ];

    const output = formatIRDiff(diff);

    expect(output).toContain("Agents:");
    expect(output).toContain("+ Added: designer");
    expect(output).toContain("- Removed: old-agent");
    expect(output).toContain("~ Modified: architect");
    expect(output).toContain("model changed from sonnet to opus");
  });

  // MCP Servers formatting
  it("formats MCP server additions and removals", () => {
    const diff = createEmptyDiff();
    diff.mcpServers.added = [
      { id: "sentry", command: "npx", args: ["-y", "@sentry/mcp"] },
    ];
    diff.mcpServers.removed = ["old-server"];

    const output = formatIRDiff(diff);

    expect(output).toContain("MCP Servers:");
    expect(output).toContain("+ Added: sentry");
    expect(output).toContain("- Removed: old-server");
  });

  // Settings formatting
  it("formats settings changes", () => {
    const diff = createEmptyDiff();
    diff.settings.changes = [
      {
        path: "denyPatterns",
        before: ["rm -rf"],
        after: ["rm -rf", "curl | sh"],
      },
    ];

    const output = formatIRDiff(diff);

    expect(output).toContain("Settings:");
    expect(output).toContain("~ denyPatterns changed");
  });

  // 20. Omits categories with no changes
  it("omits categories that have no changes", () => {
    const diff = createEmptyDiff();
    diff.commands.added = [createCommandNode("deploy", "Deploy")];
    // All other categories are empty

    const output = formatIRDiff(diff);

    expect(output).toContain("Commands:");
    expect(output).not.toContain("Sections:");
    expect(output).not.toContain("Rules:");
    expect(output).not.toContain("Agents:");
    expect(output).not.toContain("MCP Servers:");
    expect(output).not.toContain("Settings:");
  });

  // Multiple categories
  it("includes multiple categories when they have changes", () => {
    const diff = createEmptyDiff();
    diff.sections.added = [createSection("s1", "## S1", "content", 0)];
    diff.commands.removed = ["old-cmd"];
    diff.agents.added = [createAgentNode("new-agent", "Does things")];

    const output = formatIRDiff(diff);

    expect(output).toContain("Sections:");
    expect(output).toContain("Commands:");
    expect(output).toContain("Agents:");
    expect(output).not.toContain("Rules:");
    expect(output).not.toContain("MCP Servers:");
    expect(output).not.toContain("Settings:");
  });
});
