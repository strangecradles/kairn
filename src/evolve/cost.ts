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
