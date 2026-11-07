import type { AiConfig, AiPrices } from './aiConfig';
import type { TokenUsage } from './provider';

// AI-10: estimated cost in USD. Thinking tokens are billed at the output rate. Rounded to 6 decimals to match
// AiRun.costUsd (Decimal(10,6)).
export function estimateCostUsd(usage: TokenUsage, prices: AiPrices): number {
  return Math.round(microDollars(usage, prices)) / 1_000_000;
}

function microDollars(usage: TokenUsage, prices: AiPrices): number {
  return usage.input * prices.inputPerMTok + (usage.output + usage.thinking) * prices.outputPerMTok;
}

/** The prices a model is billed at: the fallback model at its own prices, any other model at the primary's. */
export function pricesForModel(
  config: Pick<AiConfig, 'fallbackModel' | 'prices' | 'fallbackPrices'>,
  model: string,
): AiPrices {
  return config.fallbackModel !== null && model === config.fallbackModel ? config.fallbackPrices : config.prices;
}

/**
 * One run's cost when it used several models (a fallback, or a repair after one): each model's tokens at that
 * model's prices, summed, then rounded once.
 */
export function estimateRunCostUsd(
  usageByModel: ReadonlyMap<string, TokenUsage>,
  pricesFor: (model: string) => AiPrices,
): number {
  let micro = 0;
  for (const [model, usage] of usageByModel) micro += microDollars(usage, pricesFor(model));
  return Math.round(micro) / 1_000_000;
}
