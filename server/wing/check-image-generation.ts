import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initScript } from "../script-init";

/**
 * Confirms `orchestrator.generateImage()` (Phase 5, IG-M6-01/IG-IMG-01–03)
 * actually works against a real, configured `AZURE_OPENAI_DEPLOYMENT_IMAGE`.
 *
 * Run:  npm run wing:check-image-generation
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * `generateImage()` was built and typechecked in a sandbox with no Azure
 * network route and no deployment configured to test against — its own
 * header comment says so. It guesses at MAI-Image-2.5-Flash's response
 * shape (asks for `b64_json`, retries without it on an unsupported-param
 * 400, accepts whichever of `b64_json`/`url` comes back) without ever
 * having seen a real response. This script is the confirmation step that
 * header comment asks for: one real call, end to end, outside the
 * content-drafts/DB plumbing so a failure here can only mean the
 * orchestrator call itself, not something upstream of it.
 *
 * Read-only for the app's own data — this never touches `content_drafts`
 * or any student row. It does call `initScript` (which needs `DATABASE_URL`
 * to resolve, per that helper's own design) even though this script makes
 * no queries, because that's the established way secrets get hydrated from
 * Key Vault before anything in server/ is imported.
 */

const TEST_PROMPT =
  "Abstract professional editorial header illustration: soft geometric " +
  "shapes suggesting forward momentum and clarity, a muted teal and warm " +
  "neutral palette, clean modern aesthetic, no people, no text or " +
  "lettering of any kind, no logos.";

async function main() {
  await initScript({ llm: true });
  const orchestrator = await import("../orchestrator/index");

  const { endpoint, deployment } = orchestrator.imageConfiguration();
  console.log(`endpoint:   ${endpoint ?? "NOT SET"}`);
  console.log(`deployment: ${deployment ?? "NOT SET"}`);

  if (!endpoint || !deployment) {
    console.log(
      "\nNot configured. Set AZURE_OPENAI_DEPLOYMENT_IMAGE — as the " +
        "'AZURE-OPENAI-DEPLOYMENT-IMAGE' secret in the vault named by " +
        "KEY_VAULT_URI, or directly in the environment — to the real " +
        "MAI-Image-2.5-Flash deployment name in Azure AI Foundry (the " +
        "deployment name, not the model name), then re-run this.",
    );
    process.exit(1);
  }

  console.log(`\nCalling generateImage() with a real request...`);
  const startedAt = Date.now();

  try {
    const result = await orchestrator.generateImage({ prompt: TEST_PROMPT });
    const elapsedMs = Date.now() - startedAt;

    const outPath = join(tmpdir(), `wing-image-generation-check-${Date.now()}.png`);
    await writeFile(outPath, result.imageBuffer);

    console.log(`\nSUCCESS in ${elapsedMs}ms`);
    console.log(`  model:      ${result.model}`);
    console.log(`  bytes:      ${result.imageBuffer.length}`);
    console.log(`  saved to:   ${outPath}`);
    console.log(`\nOpen it to eyeball the result:  open "${outPath}"`);
  } catch (err: any) {
    const elapsedMs = Date.now() - startedAt;
    if (err?.name === "ImageGenerationBlockedError") {
      // Not a failure of the integration — confirms the content-filter
      // detection path itself works, which IG-IMG-01's 2-strikes rule
      // depends on. Worth knowing, not worth exit(1)-ing over.
      console.log(`\nBLOCKED by content filter after ${elapsedMs}ms (this is a real, working signal, not a bug):`);
      console.log(`  ${err.message}`);
      return;
    }
    console.log(`\nFAILED after ${elapsedMs}ms:`);
    console.log(`  ${err?.message ?? err}`);
    if (err?.status) console.log(`  http status: ${err.status}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("check failed:", e);
  process.exit(1);
});
