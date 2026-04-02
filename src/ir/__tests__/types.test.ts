import { describe, it, expect } from "vitest";
import {
  createEmptyIR,
  createSection,
  createCommandNode,
  createRuleNode,
  createAgentNode,
  createEmptyDiff,
  createEmptySettings,
} from "../types.js";
import type {
  HarnessIR,
  HarnessMeta,
  Section,
  CommandNode,
  RuleNode,
  AgentNode,
  SkillNode,
  DocNode,
  HookNode,
  SettingsIR,
  HookEntry,
  McpServerNode,
  IntentNode,
  IRMutation,
  IRDiff,
} from "../types.js";

describe("createEmptyIR", () => {
  it("returns an object with all required HarnessIR fields", () => {
    const ir = createEmptyIR();

    expect(ir).toBeDefined();
    expect(ir.meta).toBeDefined();
    expect(ir.sections).toBeDefined();
    expect(ir.commands).toBeDefined();
    expect(ir.rules).toBeDefined();
    expect(ir.agents).toBeDefined();
    expect(ir.skills).toBeDefined();
    expect(ir.docs).toBeDefined();
    expect(ir.hooks).toBeDefined();
    expect(ir.settings).toBeDefined();
    expect(ir.mcpServers).toBeDefined();
    expect(ir.intents).toBeDefined();
  });

  it("returns empty arrays for all collection fields", () => {
    const ir = createEmptyIR();

    expect(ir.sections).toEqual([]);
    expect(ir.commands).toEqual([]);
    expect(ir.rules).toEqual([]);
    expect(ir.agents).toEqual([]);
    expect(ir.skills).toEqual([]);
    expect(ir.docs).toEqual([]);
    expect(ir.hooks).toEqual([]);
    expect(ir.mcpServers).toEqual([]);
    expect(ir.intents).toEqual([]);
  });

  it("returns meta with empty string fields and default autonomy level 2", () => {
    const ir = createEmptyIR();

    expect(ir.meta.name).toBe("");
    expect(ir.meta.purpose).toBe("");
    expect(ir.meta.techStack.language).toBe("");
    expect(ir.meta.autonomyLevel).toBe(2);
  });

  it("returns meta.techStack with optional fields undefined", () => {
    const ir = createEmptyIR();

    expect(ir.meta.techStack.framework).toBeUndefined();
    expect(ir.meta.techStack.buildTool).toBeUndefined();
    expect(ir.meta.techStack.testRunner).toBeUndefined();
    expect(ir.meta.techStack.packageManager).toBeUndefined();
  });

  it("returns empty settings via createEmptySettings", () => {
    const ir = createEmptyIR();

    expect(ir.settings.hooks).toEqual({});
    expect(ir.settings.raw).toEqual({});
    expect(ir.settings.statusLine).toBeUndefined();
    expect(ir.settings.denyPatterns).toBeUndefined();
  });

  it("returns a new object each time (no shared references)", () => {
    const ir1 = createEmptyIR();
    const ir2 = createEmptyIR();

    expect(ir1).not.toBe(ir2);
    expect(ir1.sections).not.toBe(ir2.sections);
    expect(ir1.meta).not.toBe(ir2.meta);
    expect(ir1.settings).not.toBe(ir2.settings);
  });
});

describe("createSection", () => {
  it("creates a section with all required fields", () => {
    const section = createSection("purpose", "## Purpose", "Build amazing things", 1);

    expect(section.id).toBe("purpose");
    expect(section.heading).toBe("## Purpose");
    expect(section.content).toBe("Build amazing things");
    expect(section.order).toBe(1);
  });

  it("preserves empty string content", () => {
    const section = createSection("empty", "## Empty", "", 0);

    expect(section.content).toBe("");
  });

  it("preserves zero order", () => {
    const section = createSection("first", "## First", "content", 0);

    expect(section.order).toBe(0);
  });
});

describe("createCommandNode", () => {
  it("creates a command node with name and content", () => {
    const cmd = createCommandNode("dev", "Run development server");

    expect(cmd.name).toBe("dev");
    expect(cmd.content).toBe("Run development server");
  });

  it("uses an empty string description when not provided", () => {
    const cmd = createCommandNode("test", "Run tests");

    expect(cmd.description).toBe("");
  });

  it("uses the provided description when given", () => {
    const cmd = createCommandNode("deploy", "Deploy to production", "Deploys the app");

    expect(cmd.description).toBe("Deploys the app");
  });
});

describe("createRuleNode", () => {
  it("creates a rule node with name and content", () => {
    const rule = createRuleNode("security", "No dangerous operations allowed");

    expect(rule.name).toBe("security");
    expect(rule.content).toBe("No dangerous operations allowed");
  });

  it("has undefined paths when not provided", () => {
    const rule = createRuleNode("security", "content");

    expect(rule.paths).toBeUndefined();
  });

  it("includes paths when provided", () => {
    const rule = createRuleNode("typescript", "Use strict mode", ["src/**/*.ts"]);

    expect(rule.paths).toEqual(["src/**/*.ts"]);
  });
});

describe("createAgentNode", () => {
  it("creates an agent node with name and content", () => {
    const agent = createAgentNode("reviewer", "Review code for quality");

    expect(agent.name).toBe("reviewer");
    expect(agent.content).toBe("Review code for quality");
  });

  it("has undefined model when not provided", () => {
    const agent = createAgentNode("reviewer", "content");

    expect(agent.model).toBeUndefined();
  });

  it("includes model when provided", () => {
    const agent = createAgentNode("architect", "Design systems", "opus");

    expect(agent.model).toBe("opus");
  });
});

describe("createEmptyDiff", () => {
  it("returns a diff with all required top-level keys", () => {
    const diff = createEmptyDiff();

    expect(diff.sections).toBeDefined();
    expect(diff.commands).toBeDefined();
    expect(diff.rules).toBeDefined();
    expect(diff.agents).toBeDefined();
    expect(diff.mcpServers).toBeDefined();
    expect(diff.settings).toBeDefined();
  });

  it("returns empty arrays for all section diff fields", () => {
    const diff = createEmptyDiff();

    expect(diff.sections.added).toEqual([]);
    expect(diff.sections.removed).toEqual([]);
    expect(diff.sections.modified).toEqual([]);
    expect(diff.sections.reordered).toEqual([]);
  });

  it("returns empty arrays for command diff fields", () => {
    const diff = createEmptyDiff();

    expect(diff.commands.added).toEqual([]);
    expect(diff.commands.removed).toEqual([]);
    expect(diff.commands.modified).toEqual([]);
  });

  it("returns empty arrays for rule diff fields", () => {
    const diff = createEmptyDiff();

    expect(diff.rules.added).toEqual([]);
    expect(diff.rules.removed).toEqual([]);
    expect(diff.rules.modified).toEqual([]);
  });

  it("returns empty arrays for agent diff fields", () => {
    const diff = createEmptyDiff();

    expect(diff.agents.added).toEqual([]);
    expect(diff.agents.removed).toEqual([]);
    expect(diff.agents.modified).toEqual([]);
  });

  it("returns empty arrays for mcpServers diff fields", () => {
    const diff = createEmptyDiff();

    expect(diff.mcpServers.added).toEqual([]);
    expect(diff.mcpServers.removed).toEqual([]);
  });

  it("returns empty changes array for settings diff", () => {
    const diff = createEmptyDiff();

    expect(diff.settings.changes).toEqual([]);
  });

  it("returns a new object each time", () => {
    const diff1 = createEmptyDiff();
    const diff2 = createEmptyDiff();

    expect(diff1).not.toBe(diff2);
    expect(diff1.sections).not.toBe(diff2.sections);
  });
});

describe("createEmptySettings", () => {
  it("returns settings with empty hooks object", () => {
    const settings = createEmptySettings();

    expect(settings.hooks).toEqual({});
  });

  it("returns settings with empty raw object", () => {
    const settings = createEmptySettings();

    expect(settings.raw).toEqual({});
  });

  it("returns settings with undefined optional fields", () => {
    const settings = createEmptySettings();

    expect(settings.statusLine).toBeUndefined();
    expect(settings.denyPatterns).toBeUndefined();
  });

  it("returns a new object each time", () => {
    const s1 = createEmptySettings();
    const s2 = createEmptySettings();

    expect(s1).not.toBe(s2);
    expect(s1.hooks).not.toBe(s2.hooks);
    expect(s1.raw).not.toBe(s2.raw);
  });
});

describe("type shape verification", () => {
  it("HarnessIR satisfies the interface when constructed manually", () => {
    const ir: HarnessIR = {
      meta: {
        name: "test",
        purpose: "testing",
        techStack: { language: "typescript" },
        autonomyLevel: 3,
      },
      sections: [],
      commands: [],
      rules: [],
      agents: [],
      skills: [],
      docs: [],
      hooks: [],
      settings: createEmptySettings(),
      mcpServers: [],
      intents: [],
    };

    expect(ir.meta.name).toBe("test");
    expect(ir.meta.autonomyLevel).toBe(3);
  });

  it("Section satisfies the interface", () => {
    const section: Section = {
      id: "test",
      heading: "## Test",
      content: "content",
      order: 0,
    };

    expect(section.id).toBe("test");
  });

  it("CommandNode satisfies the interface", () => {
    const cmd: CommandNode = {
      name: "build",
      description: "Build the project",
      content: "npm run build",
    };

    expect(cmd.name).toBe("build");
  });

  it("RuleNode satisfies the interface with optional paths", () => {
    const rule: RuleNode = {
      name: "security",
      content: "No dangerous operations",
      paths: ["src/**"],
    };

    expect(rule.paths).toEqual(["src/**"]);

    const ruleNoPaths: RuleNode = {
      name: "general",
      content: "Be nice",
    };

    expect(ruleNoPaths.paths).toBeUndefined();
  });

  it("AgentNode satisfies the interface with optional fields", () => {
    const agent: AgentNode = {
      name: "coder",
      content: "Write code",
      model: "sonnet",
      disallowedTools: ["Bash"],
    };

    expect(agent.model).toBe("sonnet");
    expect(agent.disallowedTools).toEqual(["Bash"]);
  });

  it("SkillNode satisfies the interface", () => {
    const skill: SkillNode = {
      name: "debug",
      content: "Debug instructions",
    };

    expect(skill.name).toBe("debug");
  });

  it("DocNode satisfies the interface", () => {
    const doc: DocNode = {
      name: "api",
      content: "API documentation",
    };

    expect(doc.name).toBe("api");
  });

  it("HookNode satisfies the interface", () => {
    const hook: HookNode = {
      name: "pre-commit",
      content: "console.log('hook')",
      type: "command",
    };

    expect(hook.type).toBe("command");
  });

  it("McpServerNode satisfies the interface", () => {
    const server: McpServerNode = {
      id: "github",
      command: "npx",
      args: ["-y", "@github/mcp-server"],
      env: { GITHUB_TOKEN: "xxx" },
    };

    expect(server.id).toBe("github");
    expect(server.args).toHaveLength(2);
  });

  it("IntentNode satisfies the interface", () => {
    const intent: IntentNode = {
      commandName: "deploy",
      patterns: ["deploy to *", "ship it"],
      priority: 10,
    };

    expect(intent.commandName).toBe("deploy");
    expect(intent.patterns).toHaveLength(2);
  });

  it("HookEntry satisfies the interface", () => {
    const entry: HookEntry = {
      matcher: "Write",
      hooks: [
        { type: "command", command: "npm run lint", timeout: 30000 },
        { type: "prompt", prompt: "Check formatting" },
      ],
    };

    expect(entry.matcher).toBe("Write");
    expect(entry.hooks).toHaveLength(2);
  });

  it("SettingsIR satisfies the interface with all optional fields", () => {
    const settings: SettingsIR = {
      statusLine: { command: "git status" },
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [{ type: "command", command: "echo check" }],
          },
        ],
      },
      denyPatterns: ["rm -rf /"],
      raw: { custom: true },
    };

    expect(settings.statusLine?.command).toBe("git status");
    expect(settings.denyPatterns).toHaveLength(1);
  });
});

describe("IRMutation type verification", () => {
  it("update_section mutation has correct shape", () => {
    const mutation: IRMutation = {
      type: "update_section",
      sectionId: "purpose",
      content: "New purpose",
      rationale: "Clarify purpose",
    };

    expect(mutation.type).toBe("update_section");
  });

  it("add_section mutation has correct shape", () => {
    const mutation: IRMutation = {
      type: "add_section",
      section: createSection("new", "## New", "content", 5),
      rationale: "Add new section",
    };

    expect(mutation.type).toBe("add_section");
  });

  it("remove_section mutation has correct shape", () => {
    const mutation: IRMutation = {
      type: "remove_section",
      sectionId: "old",
      rationale: "No longer needed",
    };

    expect(mutation.type).toBe("remove_section");
  });

  it("reorder_section mutation has correct shape", () => {
    const mutation: IRMutation = {
      type: "reorder_section",
      sectionId: "commands",
      newOrder: 3,
      rationale: "Move commands up",
    };

    expect(mutation.type).toBe("reorder_section");
  });

  it("add_command mutation has correct shape", () => {
    const mutation: IRMutation = {
      type: "add_command",
      command: createCommandNode("lint", "Run linting"),
      rationale: "Add lint command",
    };

    expect(mutation.type).toBe("add_command");
  });

  it("update_command mutation has correct shape", () => {
    const mutation: IRMutation = {
      type: "update_command",
      name: "dev",
      content: "Updated content",
      rationale: "Fix dev command",
    };

    expect(mutation.type).toBe("update_command");
  });

  it("remove_command mutation has correct shape", () => {
    const mutation: IRMutation = {
      type: "remove_command",
      name: "old-cmd",
      rationale: "Deprecated",
    };

    expect(mutation.type).toBe("remove_command");
  });

  it("add_rule mutation has correct shape", () => {
    const mutation: IRMutation = {
      type: "add_rule",
      rule: createRuleNode("lint", "Run lint before commit"),
      rationale: "Add lint rule",
    };

    expect(mutation.type).toBe("add_rule");
  });

  it("update_rule mutation has correct shape", () => {
    const mutation: IRMutation = {
      type: "update_rule",
      name: "security",
      content: "Updated security rules",
      rationale: "Tighten security",
    };

    expect(mutation.type).toBe("update_rule");
  });

  it("remove_rule mutation has correct shape", () => {
    const mutation: IRMutation = {
      type: "remove_rule",
      name: "old-rule",
      rationale: "No longer relevant",
    };

    expect(mutation.type).toBe("remove_rule");
  });

  it("add_agent mutation has correct shape", () => {
    const mutation: IRMutation = {
      type: "add_agent",
      agent: createAgentNode("tester", "Run tests", "haiku"),
      rationale: "Add testing agent",
    };

    expect(mutation.type).toBe("add_agent");
  });

  it("update_agent mutation has correct shape", () => {
    const mutation: IRMutation = {
      type: "update_agent",
      name: "reviewer",
      changes: { model: "opus" },
      rationale: "Upgrade reviewer model",
    };

    expect(mutation.type).toBe("update_agent");
  });

  it("remove_agent mutation has correct shape", () => {
    const mutation: IRMutation = {
      type: "remove_agent",
      name: "old-agent",
      rationale: "Consolidating agents",
    };

    expect(mutation.type).toBe("remove_agent");
  });

  it("add_mcp_server mutation has correct shape", () => {
    const mutation: IRMutation = {
      type: "add_mcp_server",
      server: { id: "gh", command: "npx", args: ["@github/mcp"] },
      rationale: "Add GitHub integration",
    };

    expect(mutation.type).toBe("add_mcp_server");
  });

  it("remove_mcp_server mutation has correct shape", () => {
    const mutation: IRMutation = {
      type: "remove_mcp_server",
      id: "gh",
      rationale: "Remove GitHub integration",
    };

    expect(mutation.type).toBe("remove_mcp_server");
  });

  it("update_settings mutation has correct shape", () => {
    const mutation: IRMutation = {
      type: "update_settings",
      path: "statusLine.command",
      value: "git log --oneline -5",
      rationale: "Update status line",
    };

    expect(mutation.type).toBe("update_settings");
  });

  it("raw_text mutation has correct shape", () => {
    const mutation: IRMutation = {
      type: "raw_text",
      file: "CLAUDE.md",
      action: "replace",
      oldText: "old content",
      newText: "new content",
      rationale: "Fix typo",
    };

    expect(mutation.type).toBe("raw_text");
    expect(mutation.action).toBe("replace");
  });

  it("raw_text mutation supports all action types", () => {
    const actions: Array<IRMutation & { type: "raw_text" }> = [
      { type: "raw_text", file: "f", action: "replace", oldText: "a", newText: "b", rationale: "r" },
      { type: "raw_text", file: "f", action: "add_section", newText: "b", rationale: "r" },
      { type: "raw_text", file: "f", action: "create_file", newText: "b", rationale: "r" },
      { type: "raw_text", file: "f", action: "delete_section", newText: "", rationale: "r" },
      { type: "raw_text", file: "f", action: "delete_file", newText: "", rationale: "r" },
    ];

    expect(actions).toHaveLength(5);
    expect(actions[0].action).toBe("replace");
    expect(actions[1].action).toBe("add_section");
    expect(actions[2].action).toBe("create_file");
    expect(actions[3].action).toBe("delete_section");
    expect(actions[4].action).toBe("delete_file");
  });
});

describe("IRDiff type verification", () => {
  it("can represent a diff with additions", () => {
    const diff: IRDiff = {
      ...createEmptyDiff(),
      sections: {
        added: [createSection("new", "## New", "content", 5)],
        removed: [],
        modified: [],
        reordered: [],
      },
      commands: {
        added: [createCommandNode("lint", "Run linting")],
        removed: [],
        modified: [],
      },
    };

    expect(diff.sections.added).toHaveLength(1);
    expect(diff.commands.added).toHaveLength(1);
  });

  it("can represent a diff with removals", () => {
    const diff: IRDiff = {
      ...createEmptyDiff(),
      sections: {
        added: [],
        removed: [createSection("old", "## Old", "gone", 2)],
        modified: [],
        reordered: [],
      },
      commands: {
        added: [],
        removed: ["old-cmd"],
        modified: [],
      },
    };

    expect(diff.sections.removed).toHaveLength(1);
    expect(diff.commands.removed).toEqual(["old-cmd"]);
  });

  it("can represent a diff with modifications", () => {
    const diff: IRDiff = {
      ...createEmptyDiff(),
      sections: {
        added: [],
        removed: [],
        modified: [{ id: "purpose", before: "old", after: "new" }],
        reordered: [{ id: "commands", oldOrder: 3, newOrder: 1 }],
      },
    };

    expect(diff.sections.modified).toHaveLength(1);
    expect(diff.sections.modified[0].id).toBe("purpose");
    expect(diff.sections.reordered).toHaveLength(1);
  });

  it("can represent settings changes", () => {
    const diff: IRDiff = {
      ...createEmptyDiff(),
      settings: {
        changes: [{ path: "statusLine.command", before: "old", after: "new" }],
      },
    };

    expect(diff.settings.changes).toHaveLength(1);
    expect(diff.settings.changes[0].path).toBe("statusLine.command");
  });
});
