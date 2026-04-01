import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { copyDir } from './baseline.js';
import { writeTrace } from './trace.js';
import type { Task, TaskResult, Trace } from './types.js';

const execAsync = promisify(exec);

/**
 * Run a single task against a harness in an isolated workspace.
 *
 * 1. Creates temp directory
 * 2. Copies harness (.claude/) into it
 * 3. Runs task.setup commands
 * 4. Spawns `claude` CLI with --print flag
 * 5. Captures stdout, stderr, files changed
 * 6. Writes all trace files
 * 7. Cleans up temp directory
 */
export async function runTask(
  task: Task,
  harnessPath: string,
  traceDir: string,
  iteration: number,
): Promise<TaskResult> {
  await fs.mkdir(traceDir, { recursive: true });
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  // 1. Create isolated workspace
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kairn-evolve-'));

  try {
    // 2. Copy harness into workspace
    await copyDir(harnessPath, path.join(tmpDir, '.claude'));

    // 3. Run setup commands if any
    let setupStderr = '';
    if (task.setup.trim()) {
      try {
        await execAsync(task.setup, { cwd: tmpDir, timeout: 60_000 });
      } catch (err) {
        // Setup failure -- record it but continue to capture the trace
        setupStderr =
          err instanceof Error ? err.message : String(err);
      }
    }

    // 4. Snapshot file list before execution for diffing
    const filesBefore = await snapshotFileList(tmpDir);

    // 5. Spawn claude CLI
    const spawnResult = await spawnClaude(task.description, tmpDir, task.timeout);

    // 6. Diff files to detect changes
    const filesAfter = await snapshotFileList(tmpDir);
    const filesChanged = diffFileLists(filesBefore, filesAfter);

    // 7. Parse tool calls from JSON output (if available)
    const toolCalls = parseToolCalls(spawnResult.stdout);

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    // 8. Build trace
    const combinedStderr = setupStderr
      ? `[setup] ${setupStderr}\n${spawnResult.stderr}`
      : spawnResult.stderr;

    const trace: Trace = {
      taskId: task.id,
      iteration,
      stdout: spawnResult.stdout,
      stderr: combinedStderr,
      toolCalls,
      filesChanged,
      score: { pass: false, details: 'Pending scoring' },
      timing: { startedAt, completedAt, durationMs },
    };

    // 9. Write trace files
    await writeTrace(traceDir, trace);

    // 10. Return result (scoring is done by the caller / CLI command)
    return {
      taskId: task.id,
      score: trace.score,
      traceDir,
    };
  } finally {
    // 11. Clean up temp directory
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Spawn the claude CLI with --print flag and capture output.
 */
export async function spawnClaude(
  instruction: string,
  cwd: string,
  timeoutSec: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const args = ['--print', '--output-format', 'text', '--max-turns', '50'];
    const child = spawn('claude', args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutSec * 1000,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    // Send the instruction via stdin
    child.stdin.write(instruction);
    child.stdin.end();

    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    child.on('error', (err) => {
      resolve({
        stdout,
        stderr: stderr + `\nSpawn error: ${err.message}`,
        exitCode: 1,
      });
    });
  });
}

/**
 * Snapshot all file paths + mtimes in a directory recursively.
 * Used for before/after diffing to detect file changes.
 */
export async function snapshotFileList(
  dir: string,
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};

  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const relativePath = path.relative(dir, fullPath);

      // Skip .claude directory (that's the harness, not task output)
      if (relativePath.startsWith('.claude')) continue;
      // Skip node_modules
      if (relativePath.startsWith('node_modules')) continue;
      // Skip .git
      if (relativePath.startsWith('.git')) continue;

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        try {
          const stat = await fs.stat(fullPath);
          result[relativePath] = stat.mtimeMs;
        } catch {
          // File might have been deleted between readdir and stat
        }
      }
    }
  }

  await walk(dir);
  return result;
}

/**
 * Compare before/after file snapshots to determine what changed.
 */
export function diffFileLists(
  before: Record<string, number>,
  after: Record<string, number>,
): Record<string, 'created' | 'modified' | 'deleted'> {
  const changes: Record<string, 'created' | 'modified' | 'deleted'> = {};

  // Check for new and modified files
  for (const [file, mtime] of Object.entries(after)) {
    if (!(file in before)) {
      changes[file] = 'created';
    } else if (before[file] !== mtime) {
      changes[file] = 'modified';
    }
  }

  // Check for deleted files
  for (const file of Object.keys(before)) {
    if (!(file in after)) {
      changes[file] = 'deleted';
    }
  }

  return changes;
}

/**
 * Try to parse tool calls from claude output.
 * Looks for JSON lines containing tool_use type or tool_name field.
 * Falls back to empty array if output is plain text.
 */
export function parseToolCalls(stdout: string): unknown[] {
  try {
    const lines = stdout.split('\n').filter((l) => l.trim());
    const toolCalls: unknown[] = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        if (obj.type === 'tool_use' || obj.tool_name) {
          toolCalls.push(obj);
        }
      } catch {
        // Not JSON, skip
      }
    }
    return toolCalls;
  } catch {
    return [];
  }
}
