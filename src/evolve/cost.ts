/**
 * Model pricing in USD per million tokens.
 * Updated as of 2026-04. Add new models as needed.
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  'claude-opus-4-6': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 0.8, output: 4 },
  // OpenAI
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'o4-mini': { input: 1.1, output: 4.4 },
  // Google
  'gemini-2.5-flash': { input: 0.15, output: 0.6 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
};

const DEFAULT_PRICING = { input: 3, output: 15 }; // Sonnet-tier fallback

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export type UsageStatus = 'actual' | 'estimated' | 'unavailable';

export type CostStatus = 'estimated' | 'unavailable';

export type TelemetryPhase =
  | 'task-execution'
  | 'scorer'
  | 'proposer'
  | 'architect'
  | 'synthesis'
  | 'task-generation'
  | 'iteration'
  | 'report';

export interface UsageTelemetry {
  status: UsageStatus;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  source: string;
  reason?: string;
}

export interface CostTelemetry {
  status: CostStatus;
  estimatedUSD: number | null;
  currency: 'USD';
  source: string;
  reason?: string;
}

export interface EvolveTelemetry {
  phase: TelemetryPhase;
  model: string;
  durationMs: number;
  usage: UsageTelemetry;
  cost: CostTelemetry;
}

export interface PhaseCostSummary {
  phase: TelemetryPhase;
  calls: number;
  durationMs: number;
  usage: UsageTelemetry;
  cost: CostTelemetry;
  models: string[];
}

export interface IterationCost {
  inputTokens: number;
  outputTokens: number;
  estimatedUSD: number;
  wallTimeMs: number;
}

/**
 * Estimate cost in USD for a given token usage and model.
 */
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  model: string,
): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

/**
 * Rough text-token estimate used when provider/CLI APIs do not return usage.
 * This is intentionally marked as estimated in telemetry records.
 */
export function estimateTokensFromText(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.ceil(trimmed.length / 4);
}

export function unavailableTelemetry(
  phase: TelemetryPhase,
  model: string,
  durationMs: number,
  reason: string,
): EvolveTelemetry {
  return {
    phase,
    model,
    durationMs,
    usage: {
      status: 'unavailable',
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      source: 'unavailable',
      reason,
    },
    cost: {
      status: 'unavailable',
      estimatedUSD: null,
      currency: 'USD',
      source: 'unavailable',
      reason,
    },
  };
}

export function estimateTelemetry(input: {
  phase: TelemetryPhase;
  model: string;
  durationMs: number;
  inputText?: string;
  outputText?: string;
  source: string;
}): EvolveTelemetry {
  const inputTokens = estimateTokensFromText(input.inputText ?? '');
  const outputTokens = estimateTokensFromText(input.outputText ?? '');
  const totalTokens = inputTokens + outputTokens;

  if (totalTokens === 0) {
    return unavailableTelemetry(
      input.phase,
      input.model,
      input.durationMs,
      'No token-bearing text was available for estimation',
    );
  }

  return {
    phase: input.phase,
    model: input.model,
    durationMs: input.durationMs,
    usage: {
      status: 'estimated',
      inputTokens,
      outputTokens,
      totalTokens,
      source: input.source,
      reason: 'Provider usage was not returned; tokens estimated from text length',
    },
    cost: {
      status: 'estimated',
      estimatedUSD: estimateCost(inputTokens, outputTokens, input.model),
      currency: 'USD',
      source: 'src/evolve/cost.ts',
      reason: 'Estimated from token counts and configured model pricing',
    },
  };
}

export function aggregateTelemetry(
  entries: Array<EvolveTelemetry | undefined>,
  phase: TelemetryPhase,
  model = 'mixed',
): EvolveTelemetry {
  const present = entries.filter((entry): entry is EvolveTelemetry => entry !== undefined);
  const durationMs = present.reduce((sum, entry) => sum + entry.durationMs, 0);
  const withUsage = present.filter(entry => entry.usage.totalTokens !== null);

  if (present.length === 0 || withUsage.length === 0) {
    return unavailableTelemetry(
      phase,
      model,
      durationMs,
      present.length === 0
        ? 'No telemetry entries were available'
        : 'Telemetry entries did not include token usage',
    );
  }

  const inputTokens = withUsage.reduce((sum, entry) => sum + (entry.usage.inputTokens ?? 0), 0);
  const outputTokens = withUsage.reduce((sum, entry) => sum + (entry.usage.outputTokens ?? 0), 0);
  const totalTokens = inputTokens + outputTokens;
  const estimatedUSD = withUsage.reduce(
    (sum, entry) => sum + (entry.cost.estimatedUSD ?? 0),
    0,
  );

  return {
    phase,
    model,
    durationMs,
    usage: {
      status: withUsage.every(entry => entry.usage.status === 'actual') ? 'actual' : 'estimated',
      inputTokens,
      outputTokens,
      totalTokens,
      source: 'aggregate',
      reason: withUsage.some(entry => entry.usage.status !== 'actual')
        ? 'Includes estimated or partially unavailable usage'
        : undefined,
    },
    cost: {
      status: 'estimated',
      estimatedUSD,
      currency: 'USD',
      source: 'aggregate',
      reason: 'Aggregated from per-attempt estimated USD values',
    },
  };
}

export function aggregateCostByPhase(
  entries: Array<EvolveTelemetry | undefined>,
): Partial<Record<TelemetryPhase, PhaseCostSummary>> {
  const grouped = new Map<TelemetryPhase, EvolveTelemetry[]>();

  for (const entry of entries) {
    if (!entry) continue;
    const phaseEntries = grouped.get(entry.phase) ?? [];
    phaseEntries.push(entry);
    grouped.set(entry.phase, phaseEntries);
  }

  const summary: Partial<Record<TelemetryPhase, PhaseCostSummary>> = {};
  for (const [phase, phaseEntries] of grouped.entries()) {
    const telemetry = aggregateTelemetry(phaseEntries, phase);
    summary[phase] = {
      phase,
      calls: phaseEntries.length,
      durationMs: telemetry.durationMs,
      usage: telemetry.usage,
      cost: telemetry.cost,
      models: Array.from(new Set(phaseEntries.map(entry => entry.model))).sort(),
    };
  }

  return summary;
}

/**
 * Look up pricing for a model. Returns per-million-token rates.
 */
export function getModelPricing(model: string): { input: number; output: number } {
  return MODEL_PRICING[model] ?? DEFAULT_PRICING;
}

/**
 * Format a cost in USD for display.
 */
export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/**
 * Format token counts for display.
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}
