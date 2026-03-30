import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { loadConfig, getEnvsDir, ensureDirs } from "../config.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import type { EnvironmentSpec, RegistryTool } from "../types.js";

async function loadRegistry(): Promise<RegistryTool[]> {
  // Resolve relative to the source tree root, not dist/
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // Works both in dev (src/compiler/) and built (dist/) by walking up to find the registry
  const candidates = [
    path.resolve(__dirname, "../registry/tools.json"),       // dev: src/compiler -> src/registry
    path.resolve(__dirname, "../src/registry/tools.json"),   // built: dist -> src/registry
    path.resolve(__dirname, "../../src/registry/tools.json"),// built: dist/compiler -> src/registry
  ];
  for (const candidate of candidates) {
    try {
      const data = await fs.readFile(candidate, "utf-8");
      return JSON.parse(data) as RegistryTool[];
    } catch {
      continue;
    }
  }
  throw new Error("Could not find tools.json registry");
}

function buildUserMessage(intent: string, registry: RegistryTool[]): string {
  const registrySummary = registry
    .map(
      (t) =>
        `- ${t.id} (${t.type}, tier ${t.tier}, auth: ${t.auth}): ${t.description} [best_for: ${t.best_for.join(", ")}]`
    )
    .join("\n");

  return `## User Intent

${intent}

## Available Tool Registry

${registrySummary}

Generate the EnvironmentSpec JSON now.`;
}

function parseSpecResponse(text: string): Omit<EnvironmentSpec, "id" | "intent" | "created_at"> {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  return JSON.parse(cleaned);
}

export async function compile(intent: string): Promise<EnvironmentSpec> {
  const config = await loadConfig();
  if (!config) {
    throw new Error("No config found. Run `kairn init` first.");
  }

  const registry = await loadRegistry();
  const client = new Anthropic({ apiKey: config.anthropic_api_key });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserMessage(intent, registry),
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from compiler LLM");
  }

  const parsed = parseSpecResponse(textBlock.text);

  const spec: EnvironmentSpec = {
    id: `env_${crypto.randomUUID()}`,
    intent,
    created_at: new Date().toISOString(),
    ...parsed,
  };

  // Save to ~/.kairn/envs/
  await ensureDirs();
  const envPath = path.join(getEnvsDir(), `${spec.id}.json`);
  await fs.writeFile(envPath, JSON.stringify(spec, null, 2), "utf-8");

  return spec;
}
