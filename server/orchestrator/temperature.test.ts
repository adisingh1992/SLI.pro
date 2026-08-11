import { acceptsTemperature } from "./index";

/**
 * Which deployments may be sent an explicit `temperature`.
 *
 * ── WHY THIS IS WORTH A TEST ─────────────────────────────────────────────
 * The GPT-5 series and o-series reasoning models reject any explicit
 * temperature with a 400. The orchestrator can either know that up front or
 * discover it by failing — and discovering it costs a wasted round trip to the
 * model API on every cold start, paid by whichever student sends the first turn
 * on a new replica.
 *
 * Knowing it up front means a name pattern, and a name pattern means
 * near-misses. `gpt-4o` contains an "o" followed by nothing; `o4-mini` starts
 * with one. Getting that wrong in the permissive direction reinstates the
 * wasted round trip; getting it wrong in the strict direction silently drops
 * temperature from a model that honours it — which would make the nano-tier
 * classifier non-deterministic without any error to notice.
 *
 * So the boundaries are the point, and they are pinned here.
 *
 * ── THESE ARE STRINGS, NOT DEPLOYMENTS ───────────────────────────────────
 * Every name below is input to a regex. Nothing here is deployed, requested,
 * or reachable, and the presence of a name in this file says nothing about
 * what exists in Azure. The project's actual deployments are the three marked
 * "in use" — the rest are fixtures chosen because they sit either side of a
 * boundary in the pattern.
 */

let failures = 0;
const check = (model: string, expected: boolean, why: string) => {
  const got = acceptsTemperature(model);
  if (got === expected) return;
  failures++;
  console.error(
    `  ✗ ${model}: temperature ${got ? "sent" : "omitted"}, expected ` +
      `${expected ? "sent" : "omitted"} — ${why}`,
  );
};

console.log("\nDeployments that must NOT receive a temperature");
for (const model of [
  "gpt-5.6-luna",   // the three in use — these are the ones that matter
  "gpt-5.6-terra",
  "gpt-5.6-sol",
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-5-chat",
  "gpt5-prod",      // no separator
  "o1",
  "o1-mini",
  "o3-mini",
  "o4-mini",
  "my-o3-deployment", // reasoning model behind a custom deployment name
]) {
  check(model, false, "GPT-5 / o-series reject an explicit temperature");
}

console.log("Deployments that MUST still receive one");
for (const model of [
  "gpt-4o",                 // the near-miss: trailing "o", not the o-series
  "gpt-4o-mini",
  "gpt-4o-transcribe-diarize", // the transcription deployment shape
  "gpt-4.1",
  "gpt-35-turbo",
  "text-embedding-3-large", // the embeddings tier, which does honour it
  "mistral-large-5",        // "-5" alone must not trigger the gpt-5 rule
  "prod-gpt-4o-westus",
]) {
  check(model, true, "this model honours temperature; dropping it loses determinism");
}

if (failures) {
  console.error(`\n${failures} mismatch(es)\n`);
  process.exit(1);
}
console.log("\nall passed\n");
