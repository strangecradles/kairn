/**
 * Legacy Mutation Translator — converts evolve-era `Mutation` objects into
 * structured `IRMutation` values that the IR mutation engine can apply.
 *
 * This bridge allows the existing proposer (which emits file-level text mutations)
 * to target the structured IR without rewriting the proposer prompt.
 */

import type { HarnessIR, IRMutation } from "./types.js";
import type { Mutation } from "../evolve/types.js";
import {
  createSection,
  createCommandNode,
  createRuleNode,
  createAgentNode,
} from "./types.js";
import { resolveSectionId } from "./parser.js";

// ---------------------------------------------------------------------------
// Path matching helpers
// ---------------------------------------------------------------------------

/** Regex for paths targeting command files: `commands/X.md` or `commands/X`. */
const COMMANDS_PATH_RE = /^commands\/([^/]+?)(?:\.md)?$/;

/** Regex for paths targeting rule files: `rules/X.md` or `rules/X`. */
const RULES_PATH_RE = /^rules\/([^/]+?)(?:\.md)?$/;

/** Regex for paths targeting agent files: `agents/X.md` or `agents/X`. */
const AGENTS_PATH_RE = /^agents\/([^/]+?)(?:\.md)?$/;

/**
 * Extract a name from a file path using the given regex.
 * Returns the first capture group (the bare file name) or `null` if no match.
 */
function extractName(filePath: string, pattern: RegExp): string | null {
  const match = filePath.match(pattern);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Section search helper
// ---------------------------------------------------------------------------

/**
 * Find the first section whose `content` includes the given text.
 * Returns the section or `undefined` if not found.
 */
function findSectionContaining(
  ir: HarnessIR,
  text: string,
): HarnessIR["sections"][number] | undefined {
  return ir.sections.find((s) => s.content.includes(text));
}

// ---------------------------------------------------------------------------
// CLAUDE.md translation
// ---------------------------------------------------------------------------

/**
 * Translate a mutation targeting `CLAUDE.md` into a structured IR mutation.
 */
function translateClaudeMdMutation(
  mutation: Mutation,
  ir: HarnessIR,
): IRMutation {
  switch (mutation.action) {
    case "replace": {
      if (mutation.oldText === undefined) {
        return buildRawText(mutation);
      }
      const section = findSectionContaining(ir, mutation.oldText);
      if (!section) {
        return buildRawText(mutation);
      }
      return {
        type: "update_section",
        sectionId: section.id,
        content: section.content.replace(mutation.oldText, mutation.newText),
        rationale: mutation.rationale,
      };
    }

    case "add_section": {
      const headingMatch = mutation.newText.match(/^## (.+)/);
      if (!headingMatch) {
        return buildRawText(mutation);
      }
      const headingText = headingMatch[1].trim();
      const sectionId = resolveSectionId(headingText);
      const heading = `## ${headingText}`;

      // Content is everything after the heading line
      const newlineIdx = mutation.newText.indexOf("\n");
      const content =
        newlineIdx >= 0 ? mutation.newText.slice(newlineIdx + 1).trim() : "";

      const nextOrder = ir.sections.length;

      return {
        type: "add_section",
        section: createSection(sectionId, heading, content, nextOrder),
        rationale: mutation.rationale,
      };
    }

    case "delete_section": {
      if (mutation.oldText === undefined) {
        return buildRawText(mutation);
      }
      const section = findSectionContaining(ir, mutation.oldText);
      if (!section) {
        return buildRawText(mutation);
      }
      return {
        type: "remove_section",
        sectionId: section.id,
        rationale: mutation.rationale,
      };
    }

    default:
      return buildRawText(mutation);
  }
}

// ---------------------------------------------------------------------------
// commands/ translation
// ---------------------------------------------------------------------------

/**
 * Translate a mutation targeting a `commands/*.md` file into a structured IR mutation.
 */
function translateCommandMutation(
  mutation: Mutation,
  name: string,
): IRMutation {
  switch (mutation.action) {
    case "create_file":
      return {
        type: "add_command",
        command: createCommandNode(name, mutation.newText),
        rationale: mutation.rationale,
      };

    case "delete_file":
      return {
        type: "remove_command",
        name,
        rationale: mutation.rationale,
      };

    case "replace":
      return {
        type: "update_command",
        name,
        content: mutation.newText,
        rationale: mutation.rationale,
      };

    default:
      return buildRawText(mutation);
  }
}

// ---------------------------------------------------------------------------
// rules/ translation
// ---------------------------------------------------------------------------

/**
 * Translate a mutation targeting a `rules/*.md` file into a structured IR mutation.
 */
function translateRuleMutation(
  mutation: Mutation,
  name: string,
): IRMutation {
  switch (mutation.action) {
    case "create_file":
      return {
        type: "add_rule",
        rule: createRuleNode(name, mutation.newText),
        rationale: mutation.rationale,
      };

    case "delete_file":
      return {
        type: "remove_rule",
        name,
        rationale: mutation.rationale,
      };

    case "replace":
      return {
        type: "update_rule",
        name,
        content: mutation.newText,
        rationale: mutation.rationale,
      };

    default:
      return buildRawText(mutation);
  }
}

// ---------------------------------------------------------------------------
// agents/ translation
// ---------------------------------------------------------------------------

/**
 * Translate a mutation targeting an `agents/*.md` file into a structured IR mutation.
 */
function translateAgentMutation(
  mutation: Mutation,
  name: string,
): IRMutation {
  switch (mutation.action) {
    case "create_file":
      return {
        type: "add_agent",
        agent: createAgentNode(name, mutation.newText),
        rationale: mutation.rationale,
      };

    case "delete_file":
      return {
        type: "remove_agent",
        name,
        rationale: mutation.rationale,
      };

    case "replace":
      return {
        type: "update_agent",
        name,
        changes: { content: mutation.newText },
        rationale: mutation.rationale,
      };

    default:
      return buildRawText(mutation);
  }
}

// ---------------------------------------------------------------------------
// raw_text fallback builder
// ---------------------------------------------------------------------------

/** Build a `raw_text` IRMutation from a legacy Mutation (passthrough). */
function buildRawText(mutation: Mutation): IRMutation {
  return {
    type: "raw_text",
    file: mutation.file,
    action: mutation.action,
    oldText: mutation.oldText,
    newText: mutation.newText,
    rationale: mutation.rationale,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Translate a single legacy `Mutation` (file-level text operation) into a
 * structured `IRMutation` by inspecting the file path and action.
 *
 * The IR is used to look up which section contains text being replaced.
 *
 * @param mutation - A legacy evolve-era Mutation.
 * @param ir - The current HarnessIR state (used for section lookups).
 * @returns The equivalent structured IRMutation.
 */
export function translateMutation(mutation: Mutation, ir: HarnessIR): IRMutation {
  // CLAUDE.md mutations
  if (mutation.file === "CLAUDE.md") {
    return translateClaudeMdMutation(mutation, ir);
  }

  // commands/*.md mutations
  const commandName = extractName(mutation.file, COMMANDS_PATH_RE);
  if (commandName !== null) {
    return translateCommandMutation(mutation, commandName);
  }

  // rules/*.md mutations
  const ruleName = extractName(mutation.file, RULES_PATH_RE);
  if (ruleName !== null) {
    return translateRuleMutation(mutation, ruleName);
  }

  // agents/*.md mutations
  const agentName = extractName(mutation.file, AGENTS_PATH_RE);
  if (agentName !== null) {
    return translateAgentMutation(mutation, agentName);
  }

  // Fallback: anything else becomes a raw_text passthrough
  return buildRawText(mutation);
}

/**
 * Translate an array of legacy `Mutation` values into structured `IRMutation` values.
 *
 * @param mutations - Array of legacy Mutations.
 * @param ir - The current HarnessIR state.
 * @returns Array of equivalent IRMutations, in the same order.
 */
export function translateMutations(mutations: Mutation[], ir: HarnessIR): IRMutation[] {
  return mutations.map((m) => translateMutation(m, ir));
}
