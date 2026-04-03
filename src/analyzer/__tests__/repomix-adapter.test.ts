import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const { packCodebase } = await import('../repomix-adapter.js');
const { AnalysisError } = await import('../types.js');

describe('packCodebase', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kairn-repomix-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('returns results for a directory with real files', async () => {
    await fs.writeFile(path.join(tempDir, 'index.ts'), 'export const hello = "world";');
    await fs.writeFile(path.join(tempDir, 'utils.ts'), 'export function add(a: number, b: number) { return a + b; }');

    const result = await packCodebase(tempDir, {});

    expect(result.fileCount).toBeGreaterThanOrEqual(2);
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.filePaths.length).toBeGreaterThanOrEqual(2);
    expect(result.tokenCount).toBeGreaterThan(0);
  });

  it('respects include filter — only includes matching files', async () => {
    await fs.writeFile(path.join(tempDir, 'app.ts'), 'export const app = true;');
    await fs.writeFile(path.join(tempDir, 'readme.md'), '# Hello');
    await fs.writeFile(path.join(tempDir, 'style.css'), 'body {}');

    const result = await packCodebase(tempDir, {
      include: ['*.ts'],
    });

    // Only .ts files should be included
    expect(result.filePaths.every((p) => p.endsWith('.ts'))).toBe(true);
    expect(result.fileCount).toBe(1);
    expect(result.content).toContain('app.ts');
    expect(result.content).not.toContain('readme.md');
    expect(result.content).not.toContain('style.css');
  });

  it('throws AnalysisError with type empty_sample for empty directory', async () => {
    // The temp dir has no files at all
    await expect(packCodebase(tempDir, {})).rejects.toThrow(AnalysisError);

    try {
      await packCodebase(tempDir, {});
    } catch (err) {
      expect(err).toBeInstanceOf(AnalysisError);
      expect((err as InstanceType<typeof AnalysisError>).type).toBe('empty_sample');
    }
  });

  it('returns result with correct structure', async () => {
    await fs.writeFile(path.join(tempDir, 'main.ts'), 'console.log("hi");');

    const result = await packCodebase(tempDir, {});

    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('fileCount');
    expect(result).toHaveProperty('tokenCount');
    expect(result).toHaveProperty('filePaths');

    expect(typeof result.content).toBe('string');
    expect(typeof result.fileCount).toBe('number');
    expect(typeof result.tokenCount).toBe('number');
    expect(Array.isArray(result.filePaths)).toBe(true);
  });

  it('content includes file path headers for each processed file', async () => {
    await fs.writeFile(path.join(tempDir, 'alpha.ts'), 'const a = 1;');
    await fs.writeFile(path.join(tempDir, 'beta.ts'), 'const b = 2;');

    const result = await packCodebase(tempDir, {});

    expect(result.content).toContain('### alpha.ts');
    expect(result.content).toContain('### beta.ts');
  });

  it('truncates content when maxTokens is exceeded', async () => {
    // Create many files to push token count up
    for (let i = 0; i < 20; i++) {
      const content = `export const value${i} = "${'x'.repeat(500)}";`;
      await fs.writeFile(path.join(tempDir, `file${i.toString().padStart(3, '0')}.ts`), content);
    }

    const fullResult = await packCodebase(tempDir, {});

    // Request a very small token budget — should truncate
    const truncatedResult = await packCodebase(tempDir, {
      maxTokens: Math.floor(fullResult.tokenCount / 4),
    });

    expect(truncatedResult.fileCount).toBeLessThan(fullResult.fileCount);
    expect(truncatedResult.content.length).toBeLessThan(fullResult.content.length);
  });
});
