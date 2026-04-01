import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { loadConfig, getEnvsDir, ensureDirs } from "../config.js";
import { SYSTEM_PROMPT, SKELETON_PROMPT, HARNESS_PROMPT, CLARIFICATION_PROMPT } from "./prompt.js";
import { loadRegistry } from "../registry/loader.js";
import { getCheapModel } from "../providers.js";
import { callLLM } from "../llm.js";
import type { EnvironmentSpec, RegistryTool, Clarification, SkeletonSpec, HarnessContent, CompileProgress } from "../types.js";
import { generateIntentPatterns } from "../intent/patterns.js";
import { compileIntentPrompt } from "../intent/prompt-template.js";
import { renderIntentRouter } from "../intent/router-template.js";
import { renderIntentLearner } from "../intent/learner-template.js";

function buildUserMessage(intent: string, registry: RegistryTool[]): string {
  const registrySummary = registry
    .map(
      (t) =>
        `- ${t.id} (${t.type}, tier ${t.tier}, auth: ${t.auth}): ${t.description} [best_for: ${t.best_for.join(", ")}]`
    )
    .join("\n");

  return `## User Intent\n\n${intent}\n\n## Available Tool Registry\n\n${registrySummary}\n\nGenerate the EnvironmentSpec JSON now.`;
}

function buildSkeletonMessage(intent: string, registry: RegistryTool[]): string {
  const registrySummary = registry
    .map(
      (t) =>
        `- ${t.id} (${t.type}, tier ${t.tier}, auth: ${t.auth}): ${t.description} [best_for: ${t.best_for.join(", ")}]`
    )
    .join("\n");

  return `## User Intent\n\n${intent}\n\n## Available Tool Registry\n\n${registrySummary}\n\nGenerate the skeleton JSON now.`;
}

function buildHarnessMessage(intent: string, skeleton: SkeletonSpec, concise?: boolean): string {
  const skeletonJson = JSON.stringify(skeleton, null, 2);
  const conciseNote = concise
    ? "\n\nIMPORTANT: Be concise. Maximum 80 lines for claude_md. Maximum 5 commands. Keep all content brief."
    : "";
  return `## User Intent\n\n${intent}\n\n## Project Skeleton\n\n${skeletonJson}\n\nGenerate the harness content JSON now.${conciseNote}`;
}

function parseSpecResponse(text: string): Omit<EnvironmentSpec, "id" | "intent" | "created_at"> {
  let cleaned = text.trim();
  // Strip markdown code fences
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  // Try to extract JSON if there's surrounding text
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(
      "LLM response did not contain valid JSON. Try again or use a different model."
    );
  }
  try {
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    throw new Error(
      `Failed to parse LLM response as JSON: ${err instanceof Error ? err.message : String(err)}\n` +
      `Response started with: ${cleaned.slice(0, 200)}...`
    );
  }
}

function parseSkeletonResponse(text: string): SkeletonSpec {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Pass 1 (skeleton) did not return valid JSON.");
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    // Validate required fields
    if (!parsed.name || !parsed.tools || !Array.isArray(parsed.tools)) {
      throw new Error("Skeleton missing required fields: name, tools");
    }
    return parsed as SkeletonSpec;
  } catch (err) {
    throw new Error(
      `Failed to parse skeleton JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

function parseHarnessResponse(text: string): HarnessContent {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Pass 2 (harness) did not return valid JSON.");
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.claude_md || !parsed.commands) {
      throw new Error("Harness missing required fields: claude_md, commands");
    }
    return parsed as HarnessContent;
  } catch (err) {
    throw new Error(
      `Failed to parse harness JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

function buildSettings(skeleton: SkeletonSpec, registry: RegistryTool[]): Record<string, unknown> {
  const selectedTools = skeleton.tools
    .map((t) => registry.find((r) => r.id === t.tool_id))
    .filter(Boolean);

  // Build permissions based on workflow type
  const allow = ["Read", "Write", "Edit", "Bash(npm run *)", "Bash(npx *)"];
  const deny = [
    "Bash(rm -rf *)",
    "Bash(curl * | sh)",
    "Bash(wget * | sh)",
    "Read(./.env)",
    "Read(./secrets/**)",
  ];

  // Build hooks
  const hooks: Record<string, unknown[]> = {
    PreToolUse: [
      {
        matcher: "Bash",
        hooks: [
          {
            type: "command",
            command:
              "CMD=$(cat | jq -r '.tool_input.command // empty') && echo \"$CMD\" | grep -qiE 'rm\\s+-rf\\s+/|DROP\\s+TABLE|curl.*\\|\\s*sh' && echo 'Blocked destructive command' >&2 && exit 2 || true",
          },
        ],
      },
    ],
    PostCompact: [
      {
        matcher: "",
        hooks: [
          {
            type: "prompt",
            prompt:
              "Re-read CLAUDE.md and docs/SPRINT.md (if it exists) to restore project context after compaction.",
          },
        ],
      },
    ],
  };

  // Add formatter hook if project uses common formatters
  const techStack = skeleton.outline.tech_stack.map((t) => t.toLowerCase());
  if (
    techStack.some((t) => t.includes("typescript") || t.includes("javascript") || t.includes("react") || t.includes("next"))
  ) {
    hooks.PostToolUse = [
      {
        matcher: "Edit|Write",
        hooks: [
          {
            type: "command",
            command:
              'FILE=$(cat | jq -r \'.tool_input.file_path // empty\') && [ -n "$FILE" ] && npx prettier --write "$FILE" 2>/dev/null || true',
          },
        ],
      },
    ];
  }

  return { permissions: { allow, deny }, hooks };
}

function buildMcpConfig(skeleton: SkeletonSpec, registry: RegistryTool[]): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const tool of skeleton.tools) {
    const reg = registry.find((r) => r.id === tool.tool_id);
    if (reg?.install.mcp_config) {
      config[tool.tool_id] = reg.install.mcp_config;
    }
  }
  return config;
}

function validateSpec(spec: EnvironmentSpec): string[] {
  const warnings: string[] = [];

  if (spec.tools.length > 8) {
    warnings.push(`${spec.tools.length} MCP servers selected (recommended: ≤6)`);
  }

  if (spec.harness.claude_md) {
    const lines = spec.harness.claude_md.split('\n').length;
    if (lines > 150) {
      warnings.push(`CLAUDE.md is ${lines} lines (recommended: ≤150)`);
    }
  }

  if (spec.harness.skills && Object.keys(spec.harness.skills).length > 5) {
    warnings.push(`${Object.keys(spec.harness.skills).length} skills (recommended: ≤3)`);
  }

  return warnings;
}

export async function compile(
  intent: string,
  onProgress?: (progress: CompileProgress) => void
): Promise<EnvironmentSpec> {
  const startTime = Date.now();
  const config = await loadConfig();
  if (!config) {
    throw new Error("No config found. Run `kairn init` first.");
  }

  // Registry
  onProgress?.({ phase: 'registry', status: 'running', message: 'Loading tool registry...' });
  const registry = await loadRegistry();
  onProgress?.({ phase: 'registry', status: 'success', message: 'Tool registry loaded', detail: `${registry.length} tools` });

  // Pass 1: Skeleton (tool selection + project outline)
  onProgress?.({ phase: 'pass1', status: 'running', message: 'Pass 1: Analyzing workflow & selecting tools...' });
  const skeletonMsg = buildSkeletonMessage(intent, registry);
  const skeletonText = await callLLM(config, skeletonMsg, {
    maxTokens: 2048,
    systemPrompt: SKELETON_PROMPT,
  });
  const skeleton = parseSkeletonResponse(skeletonText);
  const toolNames = skeleton.tools.map(t => t.tool_id).join(', ');
  onProgress?.({
    phase: 'pass1', status: 'success',
    message: `Pass 1: Selected ${skeleton.tools.length} tools`,
    detail: toolNames,
    elapsed: (Date.now() - startTime) / 1000,
  });

  // Pass 2: Harness content (CLAUDE.md + commands + rules + agents)
  onProgress?.({ phase: 'pass2', status: 'running', message: 'Pass 2: Generating CLAUDE.md, commands, agents...' });
  const harnessMsg = buildHarnessMessage(intent, skeleton);
  let harness: HarnessContent;
  try {
    const harnessText = await callLLM(config, harnessMsg, {
      maxTokens: 8192,
      systemPrompt: HARNESS_PROMPT,
    });
    harness = parseHarnessResponse(harnessText);
  } catch {
    // Retry with concise mode if Pass 2 fails (likely JSON truncation)
    onProgress?.({ phase: 'pass2-retry', status: 'warning', message: 'Pass 2: Response too large, retrying in concise mode...' });
    const retryMsg = buildHarnessMessage(intent, skeleton, true);
    const retryText = await callLLM(config, retryMsg, {
      maxTokens: 8192,
      systemPrompt: HARNESS_PROMPT,
    });
    harness = parseHarnessResponse(retryText);
  }
  const cmdCount = Object.keys(harness.commands).length;
  const agentCount = Object.keys(harness.agents ?? {}).length;
  const ruleCount = Object.keys(harness.rules).length;
  onProgress?.({
    phase: 'pass2', status: 'success',
    message: `Pass 2: Generated ${cmdCount} commands, ${agentCount} agents, ${ruleCount} rules`,
    elapsed: (Date.now() - startTime) / 1000,
  });

  // Pass 3: Settings + MCP config (deterministic, no LLM)
  onProgress?.({ phase: 'pass3', status: 'running', message: 'Pass 3: Configuring MCP servers & settings...' });
  const settings = buildSettings(skeleton, registry);
  const mcpConfig = buildMcpConfig(skeleton, registry);

  // Intent routing: generate patterns, prompt template, and hook scripts
  const projectProfile = {
    language: skeleton.outline.tech_stack[0] ?? 'unknown',
    framework: skeleton.outline.tech_stack[1] ?? 'none',
    scripts: {} as Record<string, string>, // scripts come from project scanning, not compilation
  };
  const intentPatterns = generateIntentPatterns(
    harness.commands,
    harness.agents ?? {},
    projectProfile,
  );
  const intentPromptTemplate = compileIntentPrompt(
    harness.commands,
    harness.agents ?? {},
  );
  const generationTimestamp = new Date().toISOString();
  const intentHooks: Record<string, string> = {};
  if (intentPatterns.length > 0) {
    intentHooks['intent-router'] = renderIntentRouter(intentPatterns, generationTimestamp);
    intentHooks['intent-learner'] = renderIntentLearner();
  }

  onProgress?.({ phase: 'pass3', status: 'success', message: 'Pass 3: Configured MCP servers & settings' });

  // Assemble final EnvironmentSpec
  const spec: EnvironmentSpec = {
    id: `env_${crypto.randomUUID()}`,
    intent,
    created_at: new Date().toISOString(),
    name: skeleton.name,
    description: skeleton.description,
    autonomy_level: 1,
    tools: skeleton.tools,
    harness: {
      claude_md: harness.claude_md,
      settings,
      mcp_config: mcpConfig,
      commands: harness.commands,
      rules: harness.rules,
      skills: harness.skills ?? {},
      agents: harness.agents ?? {},
      docs: harness.docs,
      hooks: intentHooks,
      intent_patterns: intentPatterns,
      intent_prompt_template: intentPromptTemplate,
    },
  };

  const warnings = validateSpec(spec);
  for (const w of warnings) {
    onProgress?.({ phase: 'done', status: 'warning', message: `⚠ ${w}` });
  }

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  onProgress?.({ phase: 'done', status: 'success', message: `Environment compiled in ${totalElapsed}s`, elapsed: (Date.now() - startTime) / 1000 });

  // Save to ~/.kairn/envs/
  await ensureDirs();
  const envPath = path.join(getEnvsDir(), `${spec.id}.json`);
  await fs.writeFile(envPath, JSON.stringify(spec, null, 2), "utf-8");

  return spec;
}

export async function generateClarifications(
  intent: string,
  onProgress?: (msg: string) => void
): Promise<Clarification[]> {
  const config = await loadConfig();
  if (!config) {
    throw new Error("No config found. Run `kairn init` first.");
  }

  onProgress?.("Analyzing your request...");

  // Use the cheapest model for clarifications regardless of selected compilation model
  const clarificationConfig = { ...config };
  clarificationConfig.model = getCheapModel(config.provider, config.model);

  const response = await callLLM(clarificationConfig, CLARIFICATION_PROMPT + "\n\nUser description: " + intent, {
    systemPrompt: SYSTEM_PROMPT,
  });

  try {
    let cleaned = response.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    return JSON.parse(jsonMatch[0]) as Clarification[];
  } catch {
    return [];
  }
}
