import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createProgressRenderer } from '../ui.js';
import type { CompileProgress } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Capture all writes to process.stdout during a test. */
function captureStdout(): { output: string[]; restore: () => void } {
  const output: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  const mock = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    output.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  });
  return {
    output,
    restore: () => mock.mockRestore(),
  };
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// ---------------------------------------------------------------------------
// createProgressRenderer
// ---------------------------------------------------------------------------

describe('createProgressRenderer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns an object with update, finish, and fail methods', () => {
    const renderer = createProgressRenderer();

    expect(typeof renderer.update).toBe('function');
    expect(typeof renderer.finish).toBe('function');
    expect(typeof renderer.fail).toBe('function');
  });

  it('renders a cumulative timer line above phase lines', () => {
    const capture = captureStdout();
    try {
      const renderer = createProgressRenderer();

      renderer.update({
        phase: 'registry',
        status: 'running',
        message: 'Loading tool registry...',
      });

      // The first rendered line should contain "Total:" (cumulative timer)
      const joined = capture.output.join('');
      expect(joined).toContain('Total:');
    } finally {
      capture.restore();
    }
  });

  it('uses braille spinner frames instead of static symbol', () => {
    const capture = captureStdout();
    try {
      const renderer = createProgressRenderer();

      renderer.update({
        phase: 'pass1',
        status: 'running',
        message: 'Pass 1: Analyzing...',
      });

      const joined = capture.output.join('');
      // Should contain one of the braille spinner frames, not the old static symbol
      const hasSpinnerFrame = SPINNER_FRAMES.some((frame) => joined.includes(frame));
      expect(hasSpinnerFrame).toBe(true);
      expect(joined).not.toContain('\u25D0'); // old static ◐ should not appear
    } finally {
      capture.restore();
    }
  });

  it('cycles spinner frames on interval ticks', () => {
    const capture = captureStdout();
    try {
      const renderer = createProgressRenderer();

      renderer.update({
        phase: 'pass1',
        status: 'running',
        message: 'Pass 1: Analyzing...',
      });

      // Clear initial output to only check interval updates
      capture.output.length = 0;

      // Advance time by 100ms to trigger the interval
      vi.advanceTimersByTime(100);

      const tick1 = capture.output.join('');
      capture.output.length = 0;

      vi.advanceTimersByTime(100);

      const tick2 = capture.output.join('');

      // Both ticks should have rendered something (spinner cycling)
      expect(tick1.length).toBeGreaterThan(0);
      expect(tick2.length).toBeGreaterThan(0);

      // The output should include spinner frames (the animation is happening)
      const allOutput = tick1 + tick2;
      const hasSpinnerFrame = SPINNER_FRAMES.some((frame) => allOutput.includes(frame));
      expect(hasSpinnerFrame).toBe(true);

      renderer.finish();
    } finally {
      capture.restore();
    }
  });

  it('updates cumulative timer across multiple phases', () => {
    const capture = captureStdout();
    try {
      const renderer = createProgressRenderer();

      renderer.update({
        phase: 'registry',
        status: 'running',
        message: 'Loading...',
      });

      // Advance time by 3 seconds
      vi.advanceTimersByTime(3000);

      // Complete registry phase
      renderer.update({
        phase: 'registry',
        status: 'success',
        message: 'Registry loaded',
        elapsed: 3,
      });

      // Start pass1
      renderer.update({
        phase: 'pass1',
        status: 'running',
        message: 'Pass 1: Analyzing...',
      });

      // Advance another 2 seconds
      vi.advanceTimersByTime(2000);

      // The cumulative timer should now show ~5s (3 + 2)
      const joined = capture.output.join('');
      // At some point the "Total: 5s" should appear
      expect(joined).toContain('Total: 5s');

      renderer.finish();
    } finally {
      capture.restore();
    }
  });

  it('replaces spinner with checkmark on success', () => {
    const capture = captureStdout();
    try {
      const renderer = createProgressRenderer();

      renderer.update({
        phase: 'registry',
        status: 'running',
        message: 'Loading...',
      });

      renderer.update({
        phase: 'registry',
        status: 'success',
        message: 'Registry loaded',
        detail: '45 tools',
        elapsed: 2,
      });

      const joined = capture.output.join('');
      expect(joined).toContain('\u2714'); // ✔ checkmark
      expect(joined).toContain('Registry loaded');
      expect(joined).toContain('45 tools');
    } finally {
      capture.restore();
    }
  });

  it('replaces spinner with X on failure', () => {
    const capture = captureStdout();
    try {
      const renderer = createProgressRenderer();

      renderer.update({
        phase: 'pass1',
        status: 'running',
        message: 'Analyzing...',
      });

      renderer.fail(new Error('LLM call failed'));

      const joined = capture.output.join('');
      expect(joined).toContain('\u2716'); // ✖ X mark
      expect(joined).toContain('Compilation failed');
    } finally {
      capture.restore();
    }
  });

  it('uses 100ms interval for smooth animation', () => {
    const capture = captureStdout();
    try {
      const renderer = createProgressRenderer();

      renderer.update({
        phase: 'pass1',
        status: 'running',
        message: 'Working...',
      });

      capture.output.length = 0;

      // At 50ms, no tick should have fired yet
      vi.advanceTimersByTime(50);
      const at50ms = capture.output.length;

      // At 100ms, first tick should fire
      vi.advanceTimersByTime(50);
      const at100ms = capture.output.length;

      expect(at50ms).toBe(0);
      expect(at100ms).toBeGreaterThan(0);

      renderer.finish();
    } finally {
      capture.restore();
    }
  });

  it('stops interval on finish', () => {
    const capture = captureStdout();
    try {
      const renderer = createProgressRenderer();

      renderer.update({
        phase: 'pass1',
        status: 'running',
        message: 'Working...',
      });

      renderer.finish();

      capture.output.length = 0;

      // After finish, advancing time should produce no new output
      vi.advanceTimersByTime(500);

      expect(capture.output.length).toBe(0);
    } finally {
      capture.restore();
    }
  });

  it('stops interval on fail', () => {
    const capture = captureStdout();
    try {
      const renderer = createProgressRenderer();

      renderer.update({
        phase: 'pass1',
        status: 'running',
        message: 'Working...',
      });

      renderer.fail(new Error('boom'));

      capture.output.length = 0;

      vi.advanceTimersByTime(500);

      expect(capture.output.length).toBe(0);
    } finally {
      capture.restore();
    }
  });

  it('renders warning lines correctly', () => {
    const capture = captureStdout();
    try {
      const renderer = createProgressRenderer();

      renderer.update({
        phase: 'done',
        status: 'warning',
        message: 'Too many MCP servers',
      });

      const joined = capture.output.join('');
      expect(joined).toContain('\u26A0'); // ⚠ warning symbol
      expect(joined).toContain('Too many MCP servers');
    } finally {
      capture.restore();
    }
  });

  it('updates per-phase elapsed time correctly', () => {
    const capture = captureStdout();
    try {
      const renderer = createProgressRenderer();

      renderer.update({
        phase: 'pass1',
        status: 'running',
        message: 'Pass 1: Analyzing...',
      });

      // Advance by 3 seconds
      vi.advanceTimersByTime(3000);

      const joined = capture.output.join('');
      // Should have updated the per-phase elapsed to show [3s]
      expect(joined).toContain('[3s]');

      renderer.finish();
    } finally {
      capture.restore();
    }
  });
});
