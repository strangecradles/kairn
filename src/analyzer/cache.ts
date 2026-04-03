import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import type { ProjectAnalysis } from './types.js';

/**
 * Resolve the kairn CLI version from package.json.
 *
 * Uses fileURLToPath + directory traversal so the path is correct both
 * during development (`src/analyzer/cache.ts`) and after tsup bundles
 * everything into `dist/cli.js`.
 */
function getKairnVersion(): string {
  // Walk up from this file's directory until we find package.json
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    try {
      const pkgPath = path.join(dir, 'package.json');
      // Use require-less approach: we only need this at module init time
      // eslint-disable-next-line no-restricted-syntax
      const content = require('fs').readFileSync(pkgPath, 'utf-8') as string;
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

const CACHE_FILENAME = '.kairn-analysis.json';

/** Shape of the analysis cache file written to disk. */
export interface AnalysisCache {
  analysis: ProjectAnalysis;
  content_hash: string;
  kairn_version: string;
}

/**
 * Read a cached analysis from disk.
 *
 * Returns `null` if the cache file is missing or contains invalid JSON.
 */
export async function readCache(dir: string): Promise<AnalysisCache | null> {
  const filePath = path.join(dir, CACHE_FILENAME);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    return parsed as AnalysisCache;
  } catch {
    return null;
  }
}

/**
 * Write an analysis cache to disk.
 *
 * Persists the analysis along with its content_hash and the current kairn
 * CLI version for future invalidation checks.
 */
export async function writeCache(dir: string, analysis: ProjectAnalysis): Promise<void> {
  const filePath = path.join(dir, CACHE_FILENAME);
  const cache: AnalysisCache = {
    analysis,
    content_hash: analysis.content_hash,
    kairn_version: KAIRN_VERSION,
  };
  await fs.writeFile(filePath, JSON.stringify(cache, null, 2), 'utf-8');
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
