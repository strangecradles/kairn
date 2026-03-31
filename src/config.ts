import fs from "fs/promises";
import path from "path";
import os from "os";
import type { KairnConfig } from "./types.js";

const KAIRN_DIR = path.join(os.homedir(), ".kairn");
const CONFIG_PATH = path.join(KAIRN_DIR, "config.json");
const ENVS_DIR = path.join(KAIRN_DIR, "envs");
const TEMPLATES_DIR = path.join(KAIRN_DIR, "templates");
const USER_REGISTRY_PATH = path.join(KAIRN_DIR, "user-registry.json");

export function getKairnDir(): string {
  return KAIRN_DIR;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function getEnvsDir(): string {
  return ENVS_DIR;
}

export function getTemplatesDir(): string {
  return TEMPLATES_DIR;
}

export function getUserRegistryPath(): string {
  return USER_REGISTRY_PATH;
}

export async function ensureDirs(): Promise<void> {
  await fs.mkdir(KAIRN_DIR, { recursive: true });
  await fs.mkdir(ENVS_DIR, { recursive: true });
  await fs.mkdir(TEMPLATES_DIR, { recursive: true });
}

export async function loadConfig(): Promise<KairnConfig | null> {
  try {
    const data = await fs.readFile(CONFIG_PATH, "utf-8");
    const raw = JSON.parse(data) as Record<string, unknown>;

    // Handle old config format (v1.0.0: anthropic_api_key)
    if (raw.anthropic_api_key && !raw.provider) {
      return {
        provider: "anthropic",
        api_key: raw.anthropic_api_key as string,
        model: "claude-sonnet-4-6",
        default_runtime: "claude-code",
        created_at: (raw.created_at as string) || new Date().toISOString(),
      };
    }

    return raw as unknown as KairnConfig;
  } catch {
    return null;
  }
}

export async function saveConfig(config: KairnConfig): Promise<void> {
  await ensureDirs();
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}
