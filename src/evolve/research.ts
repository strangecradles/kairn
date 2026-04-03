/**
 * Cross-repo research protocol with convergence analysis.
 *
 * Clones N repos, runs evolve on each, catalogs discovered patterns,
 * and identifies convergent mutations that appear across multiple repos.
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { loadKnowledgeBase, saveConvergence } from './knowledge.js';
import type {
  KnowledgePattern,
  ResearchConfig,
  ResearchReport,
  ResearchProgressEvent,
  EvolveConfig,
} from './types.js';
import type { KairnConfig } from '../types.js';

const execAsync = promisify(exec);

/**
 * Validate a repository URL for safety.
 * Only allows https:// and git@ protocols.
 */
function validateRepoUrl(url: string): boolean {
  return url.startsWith('https://') || url.startsWith('git@');
}

/**
 * Extract a short name from a repo URL.
 */
function repoName(url: string): string {
  const match = url.match(/\/([^/]+?)(?:\.git)?$/);
  return match?.[1] ?? 'unknown';
}

/**
 * Run the full cross-repo research protocol.
 *
 * Clones each repo, checks for a .claude/ harness directory,
 * collects discovered patterns, and performs convergence analysis.
 * Emits progress events via the optional onProgress callback.
 */
export async function runResearch(
  config: ResearchConfig,
  _kairnConfig: KairnConfig,
  _evolveConfig: EvolveConfig,
  onProgress?: (event: ResearchProgressEvent) => void,
): Promise<ResearchReport> {
  // Validate all URLs before starting
  for (const url of config.repos) {
    if (!validateRepoUrl(url)) {
      throw new Error(`Invalid repo URL (must be https:// or git@): ${url}`);
    }
  }

  const allPatterns: KnowledgePattern[] = [];
  const repoResults: ResearchReport['repoResults'] = [];
  const tempBase = path.join(os.tmpdir(), `kairn-research-${Date.now()}`);
  await fs.mkdir(tempBase, { recursive: true });

  try {
    for (let i = 0; i < config.repos.length; i++) {
      const url = config.repos[i];
      const name = repoName(url);

      onProgress?.({
        type: 'repo-start',
        repo: name,
        repoIndex: i,
        totalRepos: config.repos.length,
        message: `Cloning ${name}...`,
      });

      // Clone repo (shallow clone for speed)
      const repoDir = path.join(tempBase, name);
      try {
        // URL validated by validateRepoUrl(); repoDir is a temp path we control
        await execAsync(`git clone --depth 1 '${url.replace(/'/g, "'\\''")}' '${repoDir.replace(/'/g, "'\\''")}' 2>/dev/null`, { timeout: 60000 });
      } catch (err) {
        onProgress?.({
          type: 'repo-complete',
          repo: name,
          repoIndex: i,
          totalRepos: config.repos.length,
          message: `Failed to clone ${name}: ${err instanceof Error ? err.message : String(err)}`,
        });
        repoResults.push({ repo: name, bestScore: 0, patternsFound: 0 });
        continue;
      }

      // Check for .claude/ directory (harness presence)
      const claudeDir = path.join(repoDir, '.claude');
      let hasHarness = false;
      try {
        await fs.access(claudeDir);
        hasHarness = true;
      } catch {
        // No harness -- skip for MVP
        onProgress?.({
          type: 'repo-complete',
          repo: name,
          repoIndex: i,
          totalRepos: config.repos.length,
          message: `Skipping ${name}: no .claude/ directory found`,
        });
        repoResults.push({ repo: name, bestScore: 0, patternsFound: 0 });
        continue;
      }

      if (hasHarness) {
        // For MVP: detect harness, report presence.
        // Full evolve integration (workspace creation, task generation, evolve run)
        // will be wired in a subsequent step.
        onProgress?.({
          type: 'repo-complete',
          repo: name,
          repoIndex: i,
          totalRepos: config.repos.length,
          bestScore: 0,
          message: `${name}: harness found, evolve integration pending`,
        });
        repoResults.push({ repo: name, bestScore: 0, patternsFound: 0 });
      }
    }

    // Analyze convergence across all discovered patterns
    onProgress?.({ type: 'convergence-analysis', message: 'Analyzing convergent patterns...' });
    const existingPatterns = await loadKnowledgeBase();
    const allPatternsForAnalysis = [...existingPatterns, ...allPatterns];
    const convergence = analyzeConvergence(
      allPatternsForAnalysis,
      config.repos.length,
      config.convergenceThreshold,
    );

    // Save convergence data to the knowledge base
    const convergenceMap: Record<string, KnowledgePattern> = {};
    for (const p of [
      ...convergence.universal,
      ...Object.values(convergence.languageSpecific).flat(),
    ]) {
      convergenceMap[p.id] = p;
    }
    if (Object.keys(convergenceMap).length > 0) {
      await saveConvergence(convergenceMap);
    }

    const report: ResearchReport = {
      ...convergence,
      repoResults,
    };

    onProgress?.({ type: 'research-complete', message: 'Research complete' });
    return report;
  } finally {
    // Clean up temp directory regardless of success/failure
    await fs.rm(tempBase, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Analyze convergence of patterns across multiple repos.
 *
 * Classification logic:
 * - Patterns rejected in >= 50% of appearances are marked as failed.
 * - Patterns appearing (accepted) in >= threshold fraction of repos are universal.
 * - Patterns appearing in >= 2 repos of the same language are language-specific.
 */
export function analyzeConvergence(
  allPatterns: KnowledgePattern[],
  repoCount: number,
  threshold: number,
): {
  universal: KnowledgePattern[];
  languageSpecific: Record<string, KnowledgePattern[]>;
  failed: KnowledgePattern[];
} {
  if (allPatterns.length === 0 || repoCount === 0) {
    return { universal: [], languageSpecific: {}, failed: [] };
  }

  const universal: KnowledgePattern[] = [];
  const languageSpecific: Record<string, KnowledgePattern[]> = {};
  const failed: KnowledgePattern[] = [];

  // Group patterns by normalized description (rough similarity)
  const groups = new Map<string, KnowledgePattern[]>();
  for (const pattern of allPatterns) {
    const key = normalizeDescription(pattern.description);
    const group = groups.get(key) ?? [];
    group.push(pattern);
    groups.set(key, group);
  }

  for (const [, group] of groups) {
    const helpedCount = group.filter((p) => !p.rejected).length;
    const rejectedCount = group.filter((p) => p.rejected).length;
    const totalTested = helpedCount + rejectedCount;

    if (totalTested === 0) continue;

    // Check if rejected in >= 50% of appearances => failed experiment
    if (rejectedCount / totalTested >= 0.5) {
      const representative = { ...group[0] };
      representative.type = 'universal';
      representative.evidence = {
        ...representative.evidence,
        repos_tested: totalTested,
        repos_helped: helpedCount,
      };
      failed.push(representative);
      continue;
    }

    // Check if universal (accepted in >= threshold fraction of repos)
    if (helpedCount / repoCount >= threshold) {
      const representative = { ...group[0] };
      representative.type = 'universal';
      representative.evidence = {
        ...representative.evidence,
        repos_tested: totalTested,
        repos_helped: helpedCount,
      };
      universal.push(representative);
      continue;
    }

    // Check for language-specific patterns (>= 2 repos of same language)
    const languages = new Set(group.flatMap((p) => p.evidence.languages));
    for (const lang of languages) {
      const langPatterns = group.filter(
        (p) => p.evidence.languages.includes(lang) && !p.rejected,
      );
      if (langPatterns.length >= 2) {
        if (!languageSpecific[lang]) languageSpecific[lang] = [];
        const representative = { ...langPatterns[0] };
        representative.type = 'language';
        representative.evidence = {
          ...representative.evidence,
          repos_tested: langPatterns.length,
          repos_helped: langPatterns.length,
        };
        languageSpecific[lang].push(representative);
      }
    }
  }

  return { universal, languageSpecific, failed };
}

/**
 * Normalize a description string for grouping similar patterns.
 *
 * Lowercases, strips non-alphanumeric characters, and collapses whitespace.
 */
function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Format a research report as Markdown.
 *
 * Produces sections for: repositories analyzed, universal patterns,
 * language-specific patterns, and failed experiments.
 */
export function formatResearchReport(report: ResearchReport): string {
  const lines: string[] = ['# Evolution Research Report\n'];

  // Repo results
  lines.push('## Repositories Analyzed\n');
  for (const repo of report.repoResults) {
    lines.push(
      `- **${repo.repo}**: best score ${repo.bestScore.toFixed(1)}%, ${repo.patternsFound} patterns`,
    );
  }
  lines.push('');

  // Universal patterns
  lines.push(`## Universal Patterns (${report.universal.length} found)\n`);
  if (report.universal.length === 0) {
    lines.push('No universal patterns discovered.\n');
  } else {
    for (const p of report.universal) {
      lines.push(
        `- ${p.description} (mean score delta: +${p.evidence.mean_score_delta.toFixed(1)}, ${p.evidence.repos_helped}/${p.evidence.repos_tested} repos)`,
      );
    }
    lines.push('');
  }

  // Language-specific patterns
  const langKeys = Object.keys(report.languageSpecific);
  if (langKeys.length > 0) {
    lines.push('## Language-Specific Patterns\n');
    for (const lang of langKeys) {
      lines.push(
        `### ${lang} (${report.languageSpecific[lang].length} patterns)\n`,
      );
      for (const p of report.languageSpecific[lang]) {
        lines.push(`- ${p.description}`);
      }
      lines.push('');
    }
  }

  // Failed experiments
  lines.push(`## Failed Experiments (${report.failed.length} patterns)\n`);
  if (report.failed.length === 0) {
    lines.push('No consistent failures identified.\n');
  } else {
    for (const p of report.failed) {
      lines.push(
        `- ${p.description} (tried in ${p.evidence.repos_tested} repos, helped ${p.evidence.repos_helped})`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}
