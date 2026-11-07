import type { AiPrices } from './aiConfig';
import type { TokenUsage } from './provider';

// AI-10: estimated cost in USD. Thinking tokens are billed at the output rate. Rounded to 6 decimals to match
// AiRun.costUsd (Decimal(10,6)).
export function estimateCostUsd(usage: TokenUsage, prices: AiPrices): number {
  const micro = usage.input * prices.inputPerMTok + (usage.output + usage.thinking) * prices.outputPerMTok;
  return Math.round(micro) / 1_000_000;
}
