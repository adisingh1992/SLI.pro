import type { ModelTier } from "../orchestrator";

/**
 * The persona-tier vocabulary — extracted out of `test-run-engine.ts`
 * specifically so `harness-persona-store.ts` can validate a persona's own
 * default tier (Aditya, 11 Sep 2026: "provide a dropdown in the admin panel
 * for danielle to select a model for persona") without creating a cycle.
 *
 * `test-run-engine.ts` already imports `composeSpecPrompt` from
 * `harness-persona-store.ts`. If that file needed `isModelTier` from
 * `test-run-engine.ts` in the other direction, the two files would import
 * each other. This module imports only a type from `../orchestrator` — never
 * either of them — so both can depend on it with nothing pointing back.
 *
 * `test-run-engine.ts` still re-exports `isModelTier` from here, so nothing
 * that imports it from `./wing/test-run-engine` (`harness-test-run-routes.ts`)
 * had to change.
 */
export const DEFAULT_PERSONA_TIER: ModelTier = "nano";
export const PERSONA_TIERS = new Set<ModelTier>(["flagship", "mid", "nano"]);

export function isModelTier(v: unknown): v is ModelTier {
  return typeof v === "string" && PERSONA_TIERS.has(v as ModelTier);
}
