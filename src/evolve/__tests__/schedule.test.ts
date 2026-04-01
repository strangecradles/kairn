import { describe, it, expect } from 'vitest';
import { computeMutationCap } from '../loop.js';

describe('computeMutationCap (exploration/exploitation schedule)', () => {
  it('returns full cap for early iterations (first 40%)', () => {
    // Iteration 0 of 10: progress=0, exploration phase
    expect(computeMutationCap(0, 10, 5)).toBe(5);
    // Iteration 3 of 10: progress=0.33, still exploration
    expect(computeMutationCap(3, 10, 5)).toBe(5);
  });

  it('decays cap for late iterations (last 60%)', () => {
    // Iteration 9 of 10: progress=1.0, full exploitation
    expect(computeMutationCap(9, 10, 5)).toBe(1);
  });

  it('minimum cap is always 1', () => {
    expect(computeMutationCap(99, 100, 10)).toBe(1);
    expect(computeMutationCap(9, 10, 1)).toBe(1);
  });

  it('returns maxMutations for single-iteration runs', () => {
    expect(computeMutationCap(0, 1, 5)).toBe(5);
  });

  it('decays linearly between 40% and 100% progress', () => {
    const caps: number[] = [];
    for (let i = 0; i < 10; i++) {
      caps.push(computeMutationCap(i, 10, 5));
    }
    // First 4 should be 5 (exploration)
    expect(caps[0]).toBe(5);
    expect(caps[3]).toBe(5);
    // Middle should be between 1 and 5
    expect(caps[6]).toBeGreaterThanOrEqual(1);
    expect(caps[6]).toBeLessThanOrEqual(5);
    // Last should be 1
    expect(caps[9]).toBe(1);
    // Should be monotonically non-increasing from iteration 4 onward
    for (let i = 5; i < 10; i++) {
      expect(caps[i]).toBeLessThanOrEqual(caps[i - 1]);
    }
  });

  it('is deterministic — same inputs always produce same output', () => {
    const a = computeMutationCap(5, 10, 3);
    const b = computeMutationCap(5, 10, 3);
    expect(a).toBe(b);
  });
});
