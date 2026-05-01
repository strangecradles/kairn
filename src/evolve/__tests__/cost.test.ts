import { describe, it, expect } from 'vitest';
import {
  aggregateTelemetry,
  estimateCost,
  estimateTelemetry,
  estimateTokensFromText,
  formatCost,
  formatTokens,
  getModelPricing,
  unavailableTelemetry,
} from '../cost.js';

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

describe('telemetry helpers', () => {
  it('estimates tokens from text length', () => {
    expect(estimateTokensFromText('12345678')).toBe(2);
    expect(estimateTokensFromText('')).toBe(0);
  });

  it('marks estimated telemetry explicitly', () => {
    const telemetry = estimateTelemetry({
      phase: 'task-execution',
      model: 'claude-sonnet-4-6',
      durationMs: 42,
      inputText: 'abcd',
      outputText: 'abcdefgh',
      source: 'test',
    });

    expect(telemetry.usage.status).toBe('estimated');
    expect(telemetry.usage.inputTokens).toBe(1);
    expect(telemetry.usage.outputTokens).toBe(2);
    expect(telemetry.cost.status).toBe('estimated');
    expect(telemetry.cost.estimatedUSD).toBeGreaterThan(0);
  });

  it('marks unavailable telemetry explicitly when no usage can be inferred', () => {
    const telemetry = unavailableTelemetry('iteration', 'unknown', 0, 'missing');

    expect(telemetry.usage.status).toBe('unavailable');
    expect(telemetry.usage.totalTokens).toBeNull();
    expect(telemetry.cost.status).toBe('unavailable');
    expect(telemetry.cost.estimatedUSD).toBeNull();
  });

  it('aggregates estimated telemetry entries into a cost ledger summary', () => {
    const first = estimateTelemetry({
      phase: 'task-execution',
      model: 'claude-sonnet-4-6',
      durationMs: 10,
      inputText: 'abcd',
      outputText: 'abcd',
      source: 'test',
    });
    const second = estimateTelemetry({
      phase: 'task-execution',
      model: 'claude-sonnet-4-6',
      durationMs: 20,
      inputText: 'abcdefgh',
      outputText: 'abcdefgh',
      source: 'test',
    });

    const aggregate = aggregateTelemetry([first, second], 'iteration', 'claude-sonnet-4-6');

    expect(aggregate.durationMs).toBe(30);
    expect(aggregate.usage.status).toBe('estimated');
    expect(aggregate.usage.totalTokens).toBe(6);
    expect(aggregate.cost.status).toBe('estimated');
    expect(aggregate.cost.estimatedUSD).toBeCloseTo(
      (first.cost.estimatedUSD ?? 0) + (second.cost.estimatedUSD ?? 0),
    );
  });
});
