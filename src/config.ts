import fs from "fs/promises";
import path from "path";
import os from "os";
import type { KairnConfig } from "./types.js";

const KAIRN_DIR = path.join(os.homedir(), ".kairn");
const CONFIG_PATH = path.join(KAIRN_DIR, "config.json");
const ENVS_DIR = path.join(KAIRN_DIR, "envs");

export function getKairnDir(): string {
  return KAIRN_DIR;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function getEnvsDir(): string {
  return ENVS_DIR;
}

export async function ensureDirs(): Promise<void> {
  await fs.mkdir(KAIRN_DIR, { recursive: true });
  await fs.mkdir(ENVS_DIR, { recursive: true });
}

export async function loadConfig(): Promise<KairnConfig | null> {
  try {
    const data = await fs.readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(data) as KairnConfig;
  } catch {
    return null;
  }
}

export async function saveConfig(config: KairnConfig): Promise<void> {
  await ensureDirs();
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}
