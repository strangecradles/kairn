import { describe, expect, it } from 'vitest';
import {
  BudgetExhaustedError,
  ExecutionMeter,
} from '../execution-meter.js';

describe('ExecutionMeter', () => {
  it('records phase, model, usage, duration, and cost for successful calls', async () => {
    const meter = new ExecutionMeter();

    const { result, telemetry } = await meter.run(
      {
        phase: 'proposer',
        model: 'claude-sonnet-4-6',
        inputText: 'input text',
        source: 'test',
        estimateOutputText: (value) => value,
      },
      async () => 'output text',
    );

    expect(result).toBe('output text');
    expect(telemetry.phase).toBe('proposer');
    expect(telemetry.model).toBe('claude-sonnet-4-6');
    expect(telemetry.durationMs).toBeGreaterThanOrEqual(0);
    expect(telemetry.usage.totalTokens).toBeGreaterThan(0);
    expect(telemetry.cost.estimatedUSD).toBeGreaterThan(0);
    expect(meter.entries()).toHaveLength(1);
  });

  it('records failed calls before rethrowing', async () => {
    const meter = new ExecutionMeter();

    await expect(
      meter.run(
        {
          phase: 'scorer',
          model: 'claude-sonnet-4-6',
          inputText: 'judge prompt',
          source: 'test',
        },
        async () => {
          throw new Error('provider failed');
        },
      ),
    ).rejects.toThrow('provider failed');

    const entries = meter.entries();
    expect(entries).toHaveLength(1);
    expect(entries[0].phase).toBe('scorer');
    expect(entries[0].model).toBe('claude-sonnet-4-6');
    expect(entries[0].usage.totalTokens).toBeGreaterThan(0);
    expect(entries[0].cost.estimatedUSD).toBeGreaterThan(0);
  });

  it('checks budgets before and after expensive calls', async () => {
    const preflightMeter = new ExecutionMeter({ runUSD: 0 });
    let called = false;

    await expect(
      preflightMeter.run(
        {
          phase: 'task-execution',
          model: 'claude-sonnet-4-6',
          inputText: 'task',
          source: 'test',
          budgetField: 'taskUSD',
        },
        async () => {
          called = true;
          return 'should not run';
        },
      ),
    ).rejects.toBeInstanceOf(BudgetExhaustedError);
    expect(called).toBe(false);

    const postCallMeter = new ExecutionMeter({ proposerUSD: 0.000001 });
    await expect(
      postCallMeter.run(
        {
          phase: 'proposer',
          model: 'claude-sonnet-4-6',
          inputText: 'x'.repeat(10_000),
          source: 'test',
          budgetField: 'proposerUSD',
          estimateOutputText: () => 'x'.repeat(10_000),
        },
        async () => 'done',
      ),
    ).rejects.toBeInstanceOf(BudgetExhaustedError);
    expect(postCallMeter.entries()).toHaveLength(1);
  });
});
