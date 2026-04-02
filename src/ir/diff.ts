/**
 * Structural diff engine for HarnessIR snapshots.
 *
 * Compares two HarnessIR trees and produces an IRDiff describing
 * every addition, removal, modification, and reordering across
 * sections, commands, rules, agents, MCP servers, and settings.
 */

import type {
  HarnessIR,
  IRDiff,
  Section,
  CommandNode,
  RuleNode,
  AgentNode,
  McpServerNode,
  SettingsIR,
} from "./types.js";
import { createEmptyDiff } from "./types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a structural diff between two HarnessIR snapshots.
 *
 * Every category is compared by its natural key (id for sections/servers,
 * name for commands/rules/agents). Settings are deep-compared field by field.
 */
export function diffIR(before: HarnessIR, after: HarnessIR): IRDiff {
  const diff = createEmptyDiff();

  diffSections(before.sections, after.sections, diff);
  diffByName(before.commands, after.commands, diff.commands);
  diffByName(before.rules, after.rules, diff.rules);
  diffAgents(before.agents, after.agents, diff);
  diffMcpServers(before.mcpServers, after.mcpServers, diff);
  diffSettings(before.settings, after.settings, diff);

  return diff;
}

/**
 * Format an IRDiff into a human-readable, plain-text summary.
 *
 * Categories with no changes are omitted. If the entire diff is empty
 * the string "No changes." is returned.
 */
export function formatIRDiff(diff: IRDiff): string {
  const blocks: string[] = [];

  // Sections
  const sectionLines = formatSectionBlock(diff);
  if (sectionLines.length > 0) {
    blocks.push(["Sections:", ...sectionLines].join("\n"));
  }

  // Commands
  const commandLines = formatNamedBlock(diff.commands, "commands");
  if (commandLines.length > 0) {
    blocks.push(["Commands:", ...commandLines].join("\n"));
  }

  // Rules
  const ruleLines = formatNamedBlock(diff.rules, "rules");
  if (ruleLines.length > 0) {
    blocks.push(["Rules:", ...ruleLines].join("\n"));
  }

  // Agents
  const agentLines = formatAgentBlock(diff);
  if (agentLines.length > 0) {
    blocks.push(["Agents:", ...agentLines].join("\n"));
  }

  // MCP Servers
  const mcpLines = formatMcpBlock(diff);
  if (mcpLines.length > 0) {
    blocks.push(["MCP Servers:", ...mcpLines].join("\n"));
  }

  // Settings
  const settingsLines = formatSettingsBlock(diff);
  if (settingsLines.length > 0) {
    blocks.push(["Settings:", ...settingsLines].join("\n"));
  }

  if (blocks.length === 0) {
    return "No changes.";
  }

  return blocks.join("\n\n");
}

// ---------------------------------------------------------------------------
// Diff internals
// ---------------------------------------------------------------------------

/** Compare sections by `id`, detecting adds, removes, modifications, and reorderings. */
function diffSections(
  beforeList: Section[],
  afterList: Section[],
  diff: IRDiff,
): void {
  const beforeMap = new Map<string, Section>();
  for (const s of beforeList) {
    beforeMap.set(s.id, s);
  }

  const afterMap = new Map<string, Section>();
  for (const s of afterList) {
    afterMap.set(s.id, s);
  }

  // Added: in after but not in before
  for (const s of afterList) {
    if (!beforeMap.has(s.id)) {
      diff.sections.added.push(s);
    }
  }

  // Removed: in before but not in after
  for (const s of beforeList) {
    if (!afterMap.has(s.id)) {
      diff.sections.removed.push(s);
    }
  }

  // Modified & reordered: present in both
  for (const [id, afterSection] of afterMap) {
    const beforeSection = beforeMap.get(id);
    if (beforeSection === undefined) continue;

    if (beforeSection.content !== afterSection.content) {
      diff.sections.modified.push({
        id,
        before: beforeSection.content,
        after: afterSection.content,
      });
    }

    if (beforeSection.order !== afterSection.order) {
      diff.sections.reordered.push({
        id,
        oldOrder: beforeSection.order,
        newOrder: afterSection.order,
      });
    }
  }
}

/**
 * Generic diff for node lists keyed by `name` (commands and rules share this shape).
 * Populates `added`, `removed`, and `modified` arrays on the target bucket.
 */
function diffByName<T extends { name: string; content: string }>(
  beforeList: T[],
  afterList: T[],
  target: {
    added: T[];
    removed: string[];
    modified: Array<{ name: string; before: string; after: string }>;
  },
): void {
  const beforeMap = new Map<string, T>();
  for (const n of beforeList) {
    beforeMap.set(n.name, n);
  }

  const afterMap = new Map<string, T>();
  for (const n of afterList) {
    afterMap.set(n.name, n);
  }

  // Added
  for (const n of afterList) {
    if (!beforeMap.has(n.name)) {
      target.added.push(n);
    }
  }

  // Removed
  for (const n of beforeList) {
    if (!afterMap.has(n.name)) {
      target.removed.push(n.name);
    }
  }

  // Modified
  for (const [name, afterNode] of afterMap) {
    const beforeNode = beforeMap.get(name);
    if (beforeNode === undefined) continue;

    if (beforeNode.content !== afterNode.content) {
      target.modified.push({
        name,
        before: beforeNode.content,
        after: afterNode.content,
      });
    }
  }
}

/** Compare agents by `name`, building a human-readable `changes` description. */
function diffAgents(
  beforeList: AgentNode[],
  afterList: AgentNode[],
  diff: IRDiff,
): void {
  const beforeMap = new Map<string, AgentNode>();
  for (const a of beforeList) {
    beforeMap.set(a.name, a);
  }

  const afterMap = new Map<string, AgentNode>();
  for (const a of afterList) {
    afterMap.set(a.name, a);
  }

  // Added
  for (const a of afterList) {
    if (!beforeMap.has(a.name)) {
      diff.agents.added.push(a);
    }
  }

  // Removed
  for (const a of beforeList) {
    if (!afterMap.has(a.name)) {
      diff.agents.removed.push(a.name);
    }
  }

  // Modified
  for (const [name, afterAgent] of afterMap) {
    const beforeAgent = beforeMap.get(name);
    if (beforeAgent === undefined) continue;

    const changeParts: string[] = [];

    if (beforeAgent.model !== afterAgent.model) {
      const from = beforeAgent.model ?? "none";
      const to = afterAgent.model ?? "none";
      changeParts.push(`model changed from ${from} to ${to}`);
    }

    if (beforeAgent.content !== afterAgent.content) {
      changeParts.push("content updated");
    }

    const beforeTools = JSON.stringify(beforeAgent.disallowedTools ?? []);
    const afterTools = JSON.stringify(afterAgent.disallowedTools ?? []);
    if (beforeTools !== afterTools) {
      changeParts.push("disallowedTools changed");
    }

    if (changeParts.length > 0) {
      diff.agents.modified.push({
        name,
        changes: changeParts.join("; "),
      });
    }
  }
}

/** Compare MCP servers by `id`. */
function diffMcpServers(
  beforeList: McpServerNode[],
  afterList: McpServerNode[],
  diff: IRDiff,
): void {
  const beforeIds = new Set(beforeList.map((s) => s.id));
  const afterIds = new Set(afterList.map((s) => s.id));

  for (const s of afterList) {
    if (!beforeIds.has(s.id)) {
      diff.mcpServers.added.push(s);
    }
  }

  for (const s of beforeList) {
    if (!afterIds.has(s.id)) {
      diff.mcpServers.removed.push(s.id);
    }
  }
}

/** Deep-compare settings fields: statusLine, denyPatterns, and hooks. */
function diffSettings(
  before: SettingsIR,
  after: SettingsIR,
  diff: IRDiff,
): void {
  // statusLine
  if (!deepEqual(before.statusLine, after.statusLine)) {
    diff.settings.changes.push({
      path: "statusLine",
      before: before.statusLine,
      after: after.statusLine,
    });
  }

  // denyPatterns
  if (!deepEqual(before.denyPatterns, after.denyPatterns)) {
    diff.settings.changes.push({
      path: "denyPatterns",
      before: before.denyPatterns,
      after: after.denyPatterns,
    });
  }

  // hooks
  if (!deepEqual(before.hooks, after.hooks)) {
    diff.settings.changes.push({
      path: "hooks",
      before: before.hooks,
      after: after.hooks,
    });
  }
}

// ---------------------------------------------------------------------------
// Format internals
// ---------------------------------------------------------------------------

/** Format the Sections block lines. */
function formatSectionBlock(diff: IRDiff): string[] {
  const lines: string[] = [];

  for (const s of diff.sections.added) {
    lines.push(`  + Added: ${s.heading}`);
  }
  for (const s of diff.sections.removed) {
    lines.push(`  - Removed: ${s.heading}`);
  }
  for (const m of diff.sections.modified) {
    lines.push(`  ~ Modified: ${m.id} (content changed)`);
  }
  for (const r of diff.sections.reordered) {
    lines.push(
      `  \u2195 Reordered: ${r.id} (${r.oldOrder} \u2192 ${r.newOrder})`,
    );
  }

  return lines;
}

/**
 * Format a generic named block (commands or rules).
 * The `_category` parameter is unused but kept for clarity at the call site.
 */
function formatNamedBlock(
  bucket: {
    added: Array<{ name: string }>;
    removed: string[];
    modified: Array<{ name: string }>;
  },
  _category: string,
): string[] {
  const lines: string[] = [];

  for (const n of bucket.added) {
    lines.push(`  + Added: ${n.name}`);
  }
  for (const name of bucket.removed) {
    lines.push(`  - Removed: ${name}`);
  }
  for (const m of bucket.modified) {
    lines.push(`  ~ Modified: ${m.name} (content changed)`);
  }

  return lines;
}

/** Format the Agents block. */
function formatAgentBlock(diff: IRDiff): string[] {
  const lines: string[] = [];

  for (const a of diff.agents.added) {
    lines.push(`  + Added: ${a.name}`);
  }
  for (const name of diff.agents.removed) {
    lines.push(`  - Removed: ${name}`);
  }
  for (const m of diff.agents.modified) {
    lines.push(`  ~ Modified: ${m.name} (${m.changes})`);
  }

  return lines;
}

/** Format the MCP Servers block. */
function formatMcpBlock(diff: IRDiff): string[] {
  const lines: string[] = [];

  for (const s of diff.mcpServers.added) {
    lines.push(`  + Added: ${s.id}`);
  }
  for (const id of diff.mcpServers.removed) {
    lines.push(`  - Removed: ${id}`);
  }

  return lines;
}

/** Format the Settings block. */
function formatSettingsBlock(diff: IRDiff): string[] {
  const lines: string[] = [];

  for (const c of diff.settings.changes) {
    lines.push(`  ~ ${c.path} changed`);
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Simple deep-equality check using JSON serialisation. */
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
