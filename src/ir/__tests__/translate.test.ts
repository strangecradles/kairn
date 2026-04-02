import { describe, it, expect } from "vitest";
import { translateMutation, translateMutations } from "../translate.js";
import {
  createEmptyIR,
  createSection,
  createCommandNode,
  createRuleNode,
  createAgentNode,
} from "../types.js";
import type { HarnessIR, IRMutation } from "../types.js";
import type { Mutation } from "../../evolve/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an IR with sections that contain known text for search-based tests. */
function buildTestIR(): HarnessIR {
  const ir = createEmptyIR();
  return {
    ...ir,
    sections: [
      createSection("purpose", "## Purpose", "Build cool CLI tools for developers.", 0),
      createSection("tech-stack", "## Tech Stack", "- TypeScript (strict, ESM)\n- tsup bundler", 1),
      createSection("conventions", "## Conventions", "Use async/await everywhere.", 2),
    ],
    commands: [createCommandNode("build", "npm run build", "Build the project")],
    rules: [createRuleNode("security", "No dangerous ops", ["src/**"])],
    agents: [createAgentNode("reviewer", "Review code carefully", "sonnet")],
  };
}

// ---------------------------------------------------------------------------
// CLAUDE.md — replace (text found in section)
// ---------------------------------------------------------------------------

describe("translateMutation — CLAUDE.md replace", () => {
  it("emits update_section when oldText is found in a section", () => {
    const ir = buildTestIR();
    const mutation: Mutation = {
      file: "CLAUDE.md",
      action: "replace",
      oldText: "Build cool CLI tools for developers.",
      newText: "Build amazing CLI tools for everyone.",
      rationale: "Broaden purpose",
    };

    const result = translateMutation(mutation, ir);

    expect(result.type).toBe("update_section");
    if (result.type === "update_section") {
      expect(result.sectionId).toBe("purpose");
      expect(result.content).toBe("Build amazing CLI tools for everyone.");
      expect(result.rationale).toBe("Broaden purpose");
    }
  });

  it("falls back to raw_text when oldText is not found in any section", () => {
    const ir = buildTestIR();
    const mutation: Mutation = {
      file: "CLAUDE.md",
      action: "replace",
      oldText: "This text does not exist anywhere",
      newText: "Replacement text",
      rationale: "Fix something",
    };

    const result = translateMutation(mutation, ir);

    expect(result.type).toBe("raw_text");
    if (result.type === "raw_text") {
      expect(result.file).toBe("CLAUDE.md");
      expect(result.action).toBe("replace");
      expect(result.oldText).toBe("This text does not exist anywhere");
      expect(result.newText).toBe("Replacement text");
    }
  });

  it("replaces only the matched portion within section content", () => {
    const ir = buildTestIR();
    const mutation: Mutation = {
      file: "CLAUDE.md",
      action: "replace",
      oldText: "async/await",
      newText: "promises",
      rationale: "Change convention",
    };

    const result = translateMutation(mutation, ir);

    expect(result.type).toBe("update_section");
    if (result.type === "update_section") {
      expect(result.sectionId).toBe("conventions");
      expect(result.content).toBe("Use promises everywhere.");
    }
  });
});

// ---------------------------------------------------------------------------
// CLAUDE.md — add_section
// ---------------------------------------------------------------------------

describe("translateMutation — CLAUDE.md add_section", () => {
  it("emits add_section with correct heading and ID for well-known heading", () => {
    const ir = buildTestIR();
    const mutation: Mutation = {
      file: "CLAUDE.md",
      action: "add_section",
      newText: "## Debugging\n\nUse console.log sparingly.",
      rationale: "Add debugging section",
    };

    const result = translateMutation(mutation, ir);

    expect(result.type).toBe("add_section");
    if (result.type === "add_section") {
      expect(result.section.id).toBe("debugging");
      expect(result.section.heading).toBe("## Debugging");
      expect(result.section.content).toBe("Use console.log sparingly.");
      expect(result.section.order).toBe(ir.sections.length);
      expect(result.rationale).toBe("Add debugging section");
    }
  });

  it("emits add_section with custom-* ID for unknown headings", () => {
    const ir = buildTestIR();
    const mutation: Mutation = {
      file: "CLAUDE.md",
      action: "add_section",
      newText: "## Performance Tips\n\nAvoid unnecessary re-renders.",
      rationale: "Add perf section",
    };

    const result = translateMutation(mutation, ir);

    expect(result.type).toBe("add_section");
    if (result.type === "add_section") {
      expect(result.section.id).toBe("custom-performance-tips");
      expect(result.section.heading).toBe("## Performance Tips");
      expect(result.section.content).toBe("Avoid unnecessary re-renders.");
    }
  });

  it("falls back to raw_text when newText does not start with ## heading", () => {
    const ir = buildTestIR();
    const mutation: Mutation = {
      file: "CLAUDE.md",
      action: "add_section",
      newText: "Just some text without a heading",
      rationale: "Add random text",
    };

    const result = translateMutation(mutation, ir);

    expect(result.type).toBe("raw_text");
    if (result.type === "raw_text") {
      expect(result.file).toBe("CLAUDE.md");
      expect(result.action).toBe("add_section");
    }
  });
});

// ---------------------------------------------------------------------------
// CLAUDE.md — delete_section
// ---------------------------------------------------------------------------

describe("translateMutation — CLAUDE.md delete_section", () => {
  it("emits remove_section when oldText is found in a section", () => {
    const ir = buildTestIR();
    const mutation: Mutation = {
      file: "CLAUDE.md",
      action: "delete_section",
      oldText: "Build cool CLI tools for developers.",
      newText: "",
      rationale: "Remove purpose",
    };

    const result = translateMutation(mutation, ir);

    expect(result.type).toBe("remove_section");
    if (result.type === "remove_section") {
      expect(result.sectionId).toBe("purpose");
      expect(result.rationale).toBe("Remove purpose");
    }
  });

  it("falls back to raw_text when oldText not found in any section", () => {
    const ir = buildTestIR();
    const mutation: Mutation = {
      file: "CLAUDE.md",
      action: "delete_section",
      oldText: "Nonexistent section content",
      newText: "",
      rationale: "Remove nonexistent",
    };

    const result = translateMutation(mutation, ir);

    expect(result.type).toBe("raw_text");
    if (result.type === "raw_text") {
      expect(result.action).toBe("delete_section");
    }
  });
});

// ---------------------------------------------------------------------------
// commands/*.md
// ---------------------------------------------------------------------------

describe("translateMutation — commands/", () => {
  it("emits add_command for create_file on commands/build.md", () => {
    const ir = buildTestIR();
    const mutation: Mutation = {
      file: "commands/build.md",
      action: "create_file",
      newText: "Run the full build pipeline.",
      rationale: "Add build command",
    };

    const result = translateMutation(mutation, ir);

    expect(result.type).toBe("add_command");
    if (result.type === "add_command") {
      expect(result.command.name).toBe("build");
      expect(result.command.content).toBe("Run the full build pipeline.");
      expect(result.rationale).toBe("Add build command");
    }
  });

  it("emits remove_command for delete_file on commands/build.md", () => {
    const ir = buildTestIR();
    const mutation: Mutation = {
      file: "commands/build.md",
      action: "delete_file",
      newText: "",
      rationale: "Remove build command",
    };

    const result = translateMutation(mutation, ir);

    expect(result.type).toBe("remove_command");
    if (result.type === "remove_command") {
      expect(result.name).toBe("build");
      expect(result.rationale).toBe("Remove build command");
    }
  });

  it("emits update_command for replace on commands/build.md", () => {
    const ir = buildTestIR();
    const mutation: Mutation = {
      file: "commands/build.md",
      action: "replace",
      oldText: "old content",
      newText: "Updated build instructions.",
      rationale: "Update build command",
    };

    const result = translateMutation(mutation, ir);

    expect(result.type).toBe("update_command");
    if (result.type === "update_command") {
      expect(result.name).toBe("build");
      expect(result.content).toBe("Updated build instructions.");
      expect(result.rationale).toBe("Update build command");
    }
  });
});

// ---------------------------------------------------------------------------
// rules/*.md
// ---------------------------------------------------------------------------

describe("translateMutation — rules/", () => {
  it("emits add_rule for create_file on rules/security.md", () => {
    const ir = buildTestIR();
    const mutation: Mutation = {
      file: "rules/security.md",
      action: "create_file",
      newText: "Never expose API keys.",
      rationale: "Add security rule",
    };

    const result = translateMutation(mutation, ir);

    expect(result.type).toBe("add_rule");
    if (result.type === "add_rule") {
      expect(result.rule.name).toBe("security");
      expect(result.rule.content).toBe("Never expose API keys.");
      expect(result.rationale).toBe("Add security rule");
    }
  });

  it("emits remove_rule for delete_file on rules/security.md", () => {
    const ir = buildTestIR();
    const mutation: Mutation = {
      file: "rules/security.md",
      action: "delete_file",
      newText: "",
      rationale: "Remove security rule",
    };

    const result = translateMutation(mutation, ir);

    expect(result.type).toBe("remove_rule");
    if (result.type === "remove_rule") {
      expect(result.name).toBe("security");
      expect(result.rationale).toBe("Remove security rule");
    }
  });

  it("emits update_rule for replace on rules/security.md", () => {
    const ir = buildTestIR();
    const mutation: Mutation = {
      file: "rules/security.md",
      action: "replace",
      oldText: "old rule content",
      newText: "Updated security guidelines.",
      rationale: "Tighten security rule",
    };

    const result = translateMutation(mutation, ir);

    expect(result.type).toBe("update_rule");
    if (result.type === "update_rule") {
      expect(result.name).toBe("security");
      expect(result.content).toBe("Updated security guidelines.");
      expect(result.rationale).toBe("Tighten security rule");
    }
  });
});

// ---------------------------------------------------------------------------
// agents/*.md
// ---------------------------------------------------------------------------

describe("translateMutation — agents/", () => {
  it("emits add_agent for create_file on agents/architect.md", () => {
    const ir = buildTestIR();
    const mutation: Mutation = {
      file: "agents/architect.md",
      action: "create_file",
      newText: "Design system architecture.",
      rationale: "Add architect agent",
    };

    const result = translateMutation(mutation, ir);

    expect(result.type).toBe("add_agent");
    if (result.type === "add_agent") {
      expect(result.agent.name).toBe("architect");
      expect(result.agent.content).toBe("Design system architecture.");
      expect(result.rationale).toBe("Add architect agent");
    }
  });

  it("emits remove_agent for delete_file on agents/architect.md", () => {
    const ir = buildTestIR();
    const mutation: Mutation = {
      file: "agents/architect.md",
      action: "delete_file",
      newText: "",
      rationale: "Remove architect agent",
    };

    const result = translateMutation(mutation, ir);

    expect(result.type).toBe("remove_agent");
    if (result.type === "remove_agent") {
      expect(result.name).toBe("architect");
      expect(result.rationale).toBe("Remove architect agent");
    }
  });

  it("emits update_agent for replace on agents/architect.md", () => {
    const ir = buildTestIR();
    const mutation: Mutation = {
      file: "agents/architect.md",
      action: "replace",
      oldText: "old agent content",
      newText: "Updated architecture guidelines.",
      rationale: "Improve architect agent",
    };

    const result = translateMutation(mutation, ir);

    expect(result.type).toBe("update_agent");
    if (result.type === "update_agent") {
      expect(result.name).toBe("architect");
      expect(result.changes).toEqual({ content: "Updated architecture guidelines." });
      expect(result.rationale).toBe("Improve architect agent");
    }
  });
});

// ---------------------------------------------------------------------------
// Fallback — unmappable mutations
// ---------------------------------------------------------------------------

describe("translateMutation — raw_text fallback", () => {
  it("emits raw_text for mutations targeting unrecognized file paths", () => {
    const ir = buildTestIR();
    const mutation: Mutation = {
      file: "random.txt",
      action: "replace",
      oldText: "old",
      newText: "new",
      rationale: "Fix random file",
    };

    const result = translateMutation(mutation, ir);

    expect(result.type).toBe("raw_text");
    if (result.type === "raw_text") {
      expect(result.file).toBe("random.txt");
      expect(result.action).toBe("replace");
      expect(result.oldText).toBe("old");
      expect(result.newText).toBe("new");
      expect(result.rationale).toBe("Fix random file");
    }
  });

  it("emits raw_text for CLAUDE.md create_file action", () => {
    const ir = buildTestIR();
    const mutation: Mutation = {
      file: "CLAUDE.md",
      action: "create_file",
      newText: "entire file content",
      rationale: "Create CLAUDE.md",
    };

    const result = translateMutation(mutation, ir);

    expect(result.type).toBe("raw_text");
  });
});

// ---------------------------------------------------------------------------
// translateMutations — batch
// ---------------------------------------------------------------------------

describe("translateMutations", () => {
  it("maps an array of mutations through translateMutation", () => {
    const ir = buildTestIR();
    const mutations: Mutation[] = [
      {
        file: "CLAUDE.md",
        action: "replace",
        oldText: "Build cool CLI tools for developers.",
        newText: "Build amazing tools.",
        rationale: "Update purpose",
      },
      {
        file: "commands/test.md",
        action: "create_file",
        newText: "Run vitest",
        rationale: "Add test command",
      },
      {
        file: "random.txt",
        action: "replace",
        oldText: "x",
        newText: "y",
        rationale: "Unmapped",
      },
    ];

    const results = translateMutations(mutations, ir);

    expect(results).toHaveLength(3);
    expect(results[0].type).toBe("update_section");
    expect(results[1].type).toBe("add_command");
    expect(results[2].type).toBe("raw_text");
  });

  it("returns an empty array when given an empty mutations array", () => {
    const ir = buildTestIR();
    const results = translateMutations([], ir);
    expect(results).toEqual([]);
  });
});
