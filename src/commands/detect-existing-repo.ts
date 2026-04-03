import fs from "fs/promises";
import path from "path";

/** Config files that indicate an existing project */
const CONFIG_FILES = [
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "Gemfile",
  "Dockerfile",
  "docker-compose.yml",
] as const;

/** Source directories that indicate an existing project */
const SOURCE_DIRS = ["src/", "lib/", "app/", "api/"] as const;

/** Result returned when an existing repo is detected */
export interface ExistingRepoSignal {
  /** Config files found in the directory */
  configFiles: string[];
  /** Source directories found in the directory */
  sourceDirs: string[];
  /** Total count of non-hidden entries in the directory */
  fileCount: number;
}

/**
 * Detect whether the given directory contains an existing project with source code.
 *
 * Detection heuristic:
 * - At least one config file (package.json, pyproject.toml, etc.) OR source dir (src/, lib/, etc.) is present
 * - AND the directory has more than 5 non-hidden entries (files or directories)
 *
 * @param dir - The directory to scan (defaults to process.cwd())
 * @returns An ExistingRepoSignal if detected, or null if the directory looks empty/greenfield
 */
export async function detectExistingRepo(
  dir: string,
): Promise<ExistingRepoSignal | null> {
  let entries: string[];
  try {
    const raw = await fs.readdir(dir);
    entries = raw.filter((name) => !name.startsWith("."));
  } catch {
    return null;
  }

  // Count non-hidden entries
  const fileCount = entries.length;
  if (fileCount <= 5) {
    return null;
  }

  // Check for config file signals
  const configFiles: string[] = [];
  for (const cfg of CONFIG_FILES) {
    if (entries.includes(cfg)) {
      configFiles.push(cfg);
    }
  }

  // Check for source directory signals
  const sourceDirs: string[] = [];
  for (const dirName of SOURCE_DIRS) {
    const bare = dirName.replace(/\/$/, "");
    if (entries.includes(bare)) {
      try {
        const stat = await fs.stat(path.join(dir, bare));
        if (stat.isDirectory()) {
          sourceDirs.push(dirName);
        }
      } catch {
        // Entry exists but can't be stat'd -- skip
      }
    }
  }

  // Need at least one signal (config file or source dir) AND >5 files
  if (configFiles.length === 0 && sourceDirs.length === 0) {
    return null;
  }

  return { configFiles, sourceDirs, fileCount };
}
