import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import {
  pack,
  mergeConfigs,
  loadFileConfig,
  buildCliConfig,
  setLogLevel,
} from 'repomix';
import type { CliOptions } from 'repomix';
import { AnalysisError } from './types.js';

/** Result of packing a codebase using repomix. */
export interface RepomixResult {
  /** Packed file contents, concatenated with path headers. */
  content: string;
  /** Number of files included in the pack. */
  fileCount: number;
  /** Total token count of all packed files. */
  tokenCount: number;
  /** Relative file paths that were included. */
  filePaths: string[];
}

/**
 * Pack a codebase directory into a single concatenated string using repomix.
 *
 * Wraps the repomix `pack()` API with sensible defaults for Kairn analysis:
 * plain output style, no clipboard copy, no file output, comments and empty
 * lines removed.
 *
 * @param dir - Absolute path to the project directory to pack.
 * @param options - Include/exclude globs and optional token budget.
 * @returns Packed codebase content with metadata.
 * @throws {AnalysisError} With type `empty_sample` if no files match.
 * @throws {AnalysisError} With type `repomix_failure` if repomix errors.
 */
export async function packCodebase(
  dir: string,
  options: {
    include?: string[];
    exclude?: string[];
    maxTokens?: number;
  },
): Promise<RepomixResult> {
  // Suppress repomix verbose logging (0 = ERROR level)
  setLogLevel(0 as Parameters<typeof setLogLevel>[0]);

  // Create a temporary output file path that repomix can write to.
  // We don't use this file — we read processedFiles directly — but repomix
  // requires a valid writable path for its output stage.
  const tempOutputFile = path.join(
    os.tmpdir(),
    `kairn-repomix-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
  );

  try {
    // Load any existing repomix config in the target directory
    const fileConfig = await loadFileConfig(dir, null);

    // Build CLI-level config overrides
    const cliOptions: CliOptions = {
      include: options.include?.join(','),
      ignore: options.exclude?.join(','),
      style: 'plain' as const,
      fileSummary: false,
      directoryStructure: false,
      removeComments: true,
      removeEmptyLines: true,
      securityCheck: false,
      copy: false,
      output: tempOutputFile,
    };

    const cliConfig = buildCliConfig(cliOptions);

    // Merge file config + CLI config into final merged config
    const config = mergeConfigs(dir, fileConfig, cliConfig);

    // Ensure clipboard copy is disabled on the merged config
    config.output.copyToClipboard = false;

    // Run the pack
    const result = await pack([dir], config);

    // Guard: no files found
    if (result.totalFiles === 0) {
      throw new AnalysisError(
        'No source files found to sample',
        'empty_sample',
        'Repomix returned 0 files for the specified include/exclude patterns',
      );
    }

    let processedFiles = [...result.processedFiles];
    let fileCount = result.totalFiles;
    let tokenCount = result.totalTokens;

    // Token budget truncation: drop files from the end until under budget
    if (options.maxTokens && result.totalTokens > options.maxTokens) {
      const totalChars = result.processedFiles.reduce(
        (sum, f) => sum + f.content.length,
        0,
      );

      let estimatedTokens = result.totalTokens;
      while (estimatedTokens > options.maxTokens && processedFiles.length > 1) {
        const removed = processedFiles.pop();
        if (!removed) break;
        // Estimate tokens proportional to character count
        const removedTokens = totalChars > 0
          ? Math.ceil((removed.content.length / totalChars) * result.totalTokens)
          : 0;
        estimatedTokens -= removedTokens;
      }

      fileCount = processedFiles.length;
      tokenCount = estimatedTokens;
    }

    // Build concatenated content with path headers
    const content = processedFiles
      .map((f) => `### ${f.path}\n\n${f.content}`)
      .join('\n\n');

    return {
      content,
      fileCount,
      tokenCount,
      filePaths: processedFiles.map((f) => f.path),
    };
  } catch (error: unknown) {
    // Re-throw AnalysisError instances as-is
    if (error instanceof AnalysisError) {
      throw error;
    }

    // Wrap unexpected errors
    const message = error instanceof Error ? error.message : String(error);
    throw new AnalysisError(
      'Repomix packing failed',
      'repomix_failure',
      message,
    );
  } finally {
    // Clean up the temporary output file
    await fs.rm(tempOutputFile, { force: true }).catch(() => {
      // Ignore cleanup errors — file may not have been created
    });
  }
}
