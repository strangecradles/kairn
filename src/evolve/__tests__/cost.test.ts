import { describe, it, expect } from 'vitest';
import { estimateCost, getModelPricing, formatCost, formatTokens } from '../cost.js';

describe('estimateCost', () => {
  it('calculates cost for claude-sonnet-4-6', () => {
    // 1M input @ $3, 500K output @ $15
    const cost = estimateCost(1_000_000, 500_000, 'claude-sonnet-4-6');
    expect(cost).toBeCloseTo(3 + 7.5, 2); // $10.50
  });

  it('calculates cost for claude-opus-4-6', () => {
    // 100K input @ $15, 50K output @ $75
    const cost = estimateCost(100_000, 50_000, 'claude-opus-4-6');
    expect(cost).toBeCloseTo(1.5 + 3.75, 2); // $5.25
  });

  it('calculates cost for gpt-4.1', () => {
    // 200K input @ $2, 100K output @ $8
    const cost = estimateCost(200_000, 100_000, 'gpt-4.1');
    expect(cost).toBeCloseTo(0.4 + 0.8, 2); // $1.20
  });

  it('uses default pricing for unknown models', () => {
    // Default is Sonnet-tier: $3 input, $15 output
    const cost = estimateCost(1_000_000, 1_000_000, 'unknown-model-v99');
    expect(cost).toBeCloseTo(3 + 15, 2); // $18
  });

  it('returns 0 for zero tokens', () => {
    expect(estimateCost(0, 0, 'claude-sonnet-4-6')).toBe(0);
  });
});

describe('getModelPricing', () => {
  it('returns correct pricing for known models', () => {
    const pricing = getModelPricing('claude-opus-4-6');
    expect(pricing.input).toBe(15);
    expect(pricing.output).toBe(75);
  });

  it('returns default pricing for unknown models', () => {
    const pricing = getModelPricing('nonexistent');
    expect(pricing.input).toBe(3);
    expect(pricing.output).toBe(15);
  });
});

describe('formatCost', () => {
  it('formats small costs with 4 decimal places', () => {
    expect(formatCost(0.0012)).toBe('$0.0012');
  });

  it('formats medium costs with 3 decimal places', () => {
    expect(formatCost(0.125)).toBe('$0.125');
  });

  it('formats large costs with 2 decimal places', () => {
    expect(formatCost(5.678)).toBe('$5.68');
  });
});

describe('formatTokens', () => {
  it('formats millions', () => {
    expect(formatTokens(2_500_000)).toBe('2.5M');
  });

  it('formats thousands', () => {
    expect(formatTokens(45_000)).toBe('45.0K');
  });

  it('formats small numbers as-is', () => {
    expect(formatTokens(500)).toBe('500');
  });
});
