import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getUserRegistryPath } from "../config.js";
import type { RegistryTool } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadBundledRegistry(): Promise<RegistryTool[]> {
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

export async function loadUserRegistry(): Promise<RegistryTool[]> {
  try {
    const data = await fs.readFile(getUserRegistryPath(), "utf-8");
    return JSON.parse(data) as RegistryTool[];
  } catch {
    return [];
  }
}

export async function saveUserRegistry(tools: RegistryTool[]): Promise<void> {
  await fs.writeFile(getUserRegistryPath(), JSON.stringify(tools, null, 2), "utf-8");
}

export async function loadRegistry(): Promise<RegistryTool[]> {
  const bundled = await loadBundledRegistry();
  const user = await loadUserRegistry();

  if (user.length === 0) return bundled;

  // User tools take precedence by ID
  const merged = new Map<string, RegistryTool>();
  for (const tool of bundled) {
    merged.set(tool.id, tool);
  }
  for (const tool of user) {
    merged.set(tool.id, tool);
  }
  return Array.from(merged.values());
}
