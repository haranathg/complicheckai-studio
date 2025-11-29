/**
 * Token cost calculation for Claude models
 * Pricing per million tokens (as of 2024)
 */

interface ModelPricing {
  input: number;  // cost per million input tokens
  output: number; // cost per million output tokens
}

// Pricing for different Claude models
const MODEL_PRICING: Record<string, ModelPricing> = {
  // Claude Sonnet 4
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-4-sonnet': { input: 3.0, output: 15.0 },
  // Claude Opus 4
  'claude-opus-4-20250514': { input: 15.0, output: 75.0 },
  'claude-4-opus': { input: 15.0, output: 75.0 },
  // Claude 3.5 Sonnet
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-3-5-sonnet': { input: 3.0, output: 15.0 },
  // Claude 3 Haiku
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  // Default fallback (Sonnet pricing)
  'default': { input: 3.0, output: 15.0 },
};

export function getModelPricing(model?: string): ModelPricing {
  if (!model) return MODEL_PRICING['default'];

  // Try exact match first
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];

  // Try partial match
  const lowerModel = model.toLowerCase();
  if (lowerModel.includes('opus')) return MODEL_PRICING['claude-4-opus'];
  if (lowerModel.includes('haiku')) return MODEL_PRICING['claude-3-haiku'];
  if (lowerModel.includes('sonnet')) return MODEL_PRICING['claude-4-sonnet'];

  return MODEL_PRICING['default'];
}

export function calculateCost(inputTokens: number, outputTokens: number, model?: string): number {
  const pricing = getModelPricing(model);
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

export function formatCost(cost: number): string {
  // Round up to nearest cent (minimum $0.01)
  const roundedCost = cost < 0.01 ? 0.01 : Math.ceil(cost * 100) / 100;
  return `$${roundedCost.toFixed(2)}`;
}

export function formatTokensWithCost(inputTokens: number, outputTokens: number, model?: string): string {
  const cost = calculateCost(inputTokens, outputTokens, model);
  return `${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out (~${formatCost(cost)})`;
}
