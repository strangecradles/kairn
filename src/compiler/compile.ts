import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { loadConfig, getEnvsDir, ensureDirs } from "../config.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import type { EnvironmentSpec, RegistryTool, KairnConfig } from "../types.js";

async function loadRegistry(): Promise<RegistryTool[]> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const candidates = [
    path.resolve(__dirname, "../registry/tools.json"),
    path.resolve(__dirname, "../src/registry/tools.json"),
    path.resolve(__dirname, "../../src/registry/tools.json"),
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

  return `## User Intent\n\n${intent}\n\n## Available Tool Registry\n\n${registrySummary}\n\nGenerate the EnvironmentSpec JSON now.`;
}

function parseSpecResponse(text: string): Omit<EnvironmentSpec, "id" | "intent" | "created_at"> {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  return JSON.parse(cleaned);
}

async function callLLM(config: KairnConfig, userMessage: string): Promise<string> {
  if (config.provider === "anthropic") {
    const client = new Anthropic({ apiKey: config.api_key });
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from compiler LLM");
    }
    return textBlock.text;
  } else if (config.provider === "openai" || config.provider === "google") {
    const clientOptions: { apiKey: string; baseURL?: string } = { apiKey: config.api_key };
    if (config.provider === "google") {
      clientOptions.baseURL = "https://generativelanguage.googleapis.com/v1beta/openai/";
    }
    const client = new OpenAI(clientOptions);
    const response = await client.chat.completions.create({
      model: config.model,
      max_tokens: 8192,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    });
    const text = response.choices[0]?.message?.content;
    if (!text) {
      throw new Error("No text response from compiler LLM");
    }
    return text;
  }
  throw new Error(`Unsupported provider: ${config.provider}`);
}

export async function compile(
  intent: string,
  onProgress?: (msg: string) => void
): Promise<EnvironmentSpec> {
  const config = await loadConfig();
  if (!config) {
    throw new Error("No config found. Run `kairn init` first.");
  }

  onProgress?.("Loading tool registry...");
  const registry = await loadRegistry();

  onProgress?.(`Compiling with ${config.provider} (${config.model})...`);
  const userMessage = buildUserMessage(intent, registry);
  const responseText = await callLLM(config, userMessage);

  onProgress?.("Parsing environment spec...");
  const parsed = parseSpecResponse(responseText);

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
