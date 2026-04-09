import { db } from "./db";
import { costLogs } from "@shared/schema";

const USD_TO_INR = 83.5;

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, output: 0 },
  "text-embedding-ada-002": { input: 0.10, output: 0 },
  "azure.gpt-4.1": { input: 2.00, output: 8.00 },
  "azure.gpt-4.1-mini": { input: 0.40, output: 1.60 },
  "azure.gpt-4.1-nano": { input: 0.10, output: 0.40 },
  "claude-sonnet-4-20250514": { input: 3.00, output: 15.00 },
  "claude-sonnet-4": { input: 3.00, output: 15.00 },
  "claude-opus-4-20250514": { input: 15.00, output: 75.00 },
  "claude-opus-4": { input: 15.00, output: 75.00 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4o": { input: 2.50, output: 10.00 },
  "gpt-4": { input: 30.00, output: 60.00 },
  "gpt-3.5-turbo": { input: 0.50, output: 1.50 },
  "azure.gpt-4.1-vision": { input: 2.00, output: 8.00 },
};

function getModelPricing(model: string): { input: number; output: number } {
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.includes(key) || key.includes(model)) return pricing;
  }
  return { input: 2.00, output: 8.00 };
}

function calculateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = getModelPricing(model);
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

export async function logCost(params: {
  type: "embedding" | "extraction";
  leaseId?: number | null;
  siteId?: number | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<{ costUsd: number; costInr: number }> {
  const totalTokens = params.inputTokens + params.outputTokens;
  const costUsd = calculateCostUsd(params.model, params.inputTokens, params.outputTokens);
  const costInr = costUsd * USD_TO_INR;

  try {
    await db.insert(costLogs).values({
      type: params.type,
      leaseId: params.leaseId ?? null,
      siteId: params.siteId ?? null,
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      totalTokens,
      costUsd,
      costInr,
    });
  } catch (err: any) {
    console.error("[COST] Failed to log cost:", err.message);
  }

  return { costUsd, costInr };
}

export { USD_TO_INR };
