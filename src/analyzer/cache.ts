import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import type { ProjectAnalysis } from './types.js';

/**
 * Resolve the kairn CLI version from package.json.
 *
 * Walks up from this file's directory until it finds the kairn-cli
 * package.json. Works both during development (`src/analyzer/cache.ts`)
 * and after tsup bundles everything into `dist/cli.js`.
 */
function getKairnVersion(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    try {
      const pkgPath = path.join(dir, 'package.json');
      const content = fsSync.readFileSync(pkgPath, 'utf-8');
      const parsed = JSON.parse(content) as { name?: string; version?: string };
      if (parsed.name === 'kairn-cli') return parsed.version ?? '0.0.0';
    } catch {
      // Not found at this level, try parent
    }
    dir = path.dirname(dir);
  }
  return '0.0.0';
}

const KAIRN_VERSION = getKairnVersion();

/** Filename for the on-disk analysis cache written to the project root. */
export const CACHE_FILENAME = '.kairn-analysis.json';

/** Filename for the cached packed source code alongside the analysis cache. */
export const PACKED_SOURCE_FILENAME = '.kairn-packed-source.txt';

/** Shape of the analysis cache file written to disk. */
export interface AnalysisCache {
  analysis: ProjectAnalysis;
  content_hash: string;
  kairn_version: string;
  /** Packed source code content, or null if not available (backward compat). */
  packedSource: string | null;
}

/**
 * Read a cached analysis from disk.
 *
 * Returns `null` if the cache file is missing or contains invalid JSON.
 * Also reads the packed source file if it exists alongside the cache,
 * returning `null` for `packedSource` if the file is missing (backward compat).
 */
export async function readCache(dir: string): Promise<AnalysisCache | null> {
  const filePath = path.join(dir, CACHE_FILENAME);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);

    // Minimal runtime validation: ensure the required `analysis` field is an object
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>).analysis !== 'object' ||
      (parsed as Record<string, unknown>).analysis === null
    ) {
      return null;
    }

    const cache = parsed as Omit<AnalysisCache, 'packedSource'>;

    // Attempt to read packed source file (may not exist for older caches)
    let packedSource: string | null = null;
    try {
      const packedPath = path.join(dir, PACKED_SOURCE_FILENAME);
      packedSource = await fs.readFile(packedPath, 'utf-8');
    } catch {
      // Packed source file doesn't exist — backward compatible
    }

    return { ...cache, packedSource };
  } catch {
    return null;
  }
}

/**
 * Write an analysis cache to disk.
 *
 * Persists the analysis along with its content_hash and the current kairn
 * CLI version for future invalidation checks. When `packedSource` is provided,
 * also writes the packed source content to a separate file alongside the cache.
 *
 * @param dir - Directory to write the cache files to.
 * @param analysis - The ProjectAnalysis to cache.
 * @param packedSource - Optional packed source code to persist alongside the analysis.
 */
export async function writeCache(
  dir: string,
  analysis: ProjectAnalysis,
  packedSource?: string,
): Promise<void> {
  const filePath = path.join(dir, CACHE_FILENAME);
  const cache: Omit<AnalysisCache, 'packedSource'> = {
    analysis,
    content_hash: analysis.content_hash,
    kairn_version: KAIRN_VERSION,
  };
  await fs.writeFile(filePath, JSON.stringify(cache, null, 2), 'utf-8');

  // Write packed source to a separate file if provided
  if (packedSource !== undefined) {
    const packedPath = path.join(dir, PACKED_SOURCE_FILENAME);
    await fs.writeFile(packedPath, packedSource, 'utf-8');
  }
}

/**
 * Compute a SHA-256 content hash over a list of file paths.
 *
 * Reads each file relative to `dir`, concatenates their contents, and returns
 * the hex-encoded SHA-256 digest. Files that cannot be read (missing,
 * permission errors, etc.) are silently skipped.
 */
export async function computeContentHash(filePaths: string[], dir: string): Promise<string> {
  const hash = createHash('sha256');
  for (const filePath of filePaths) {
    try {
      const fullPath = path.join(dir, filePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      hash.update(content);
    } catch {
      // Skip files that can't be read
    }
  }
  return hash.digest('hex');
}

/**
 * Check whether a cached analysis is still valid.
 *
 * A cache is valid when both:
 * - The content hash matches the current hash (files haven't changed)
 * - The kairn CLI version matches (no schema changes across upgrades)
 */
export function isCacheValid(cache: AnalysisCache, currentHash: string): boolean {
  return cache.content_hash === currentHash && cache.kairn_version === KAIRN_VERSION;
}
