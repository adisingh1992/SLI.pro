import "dotenv/config";

/**
 * Bootstrap for standalone scripts (seeds, migrations, one-off tools).
 *
 * WHY THIS EXISTS
 * server/db.ts constructs its connection pool at module load and throws if
 * DATABASE_URL is absent. That means a script cannot simply `await` a secret
 * fetch at the top of main(): by then `import { db } from "../db"` has already
 * been evaluated and has already thrown. The secret has to be in the
 * environment BEFORE ../db is imported at all.
 *
 * So this helper hydrates DATABASE_URL first — from the environment, or from
 * Key Vault via managed identity — and only then imports the data layer,
 * returning it to the caller. It mirrors what server/index.ts does with
 * loadConfig() before `await import("./routes")`.
 *
 * USAGE
 *   let db: Db;
 *   async function main() {
 *     ({ db } = await initScript());
 *     ...
 *   }
 *
 * Only DATABASE_URL is fetched, not the full app config: a seed or a migration
 * should not fail because some unrelated application secret is missing.
 */

export type ScriptDb = typeof import("./db");

export type InitScriptOptions = {
  /**
   * Also hydrate the LLM secrets. Required by any script that calls the
   * orchestrator. Without them the script starts happily and fails on its
   * first model call, which in a backfill can be thousands of rows in — so
   * `initScript` checks up front instead.
   */
  llm?: boolean;
};

export async function initScript(opts: InitScriptOptions = {}): Promise<ScriptDb> {
  const { loadSecretFromVault, loadSecretsFromVault, LLM_SECRETS } =
    await import("./config");

  if (!(await loadSecretFromVault("DATABASE_URL"))) {
    throw new Error(
      "DATABASE_URL must be set in the environment, or available as the " +
        "'DATABASE-URL' secret in the vault named by KEY_VAULT_URI",
    );
  }

  if (opts.llm) {
    const missing = await loadSecretsFromVault(LLM_SECRETS);

    // Azure OpenAI is the only provider. Fail here rather than on the first
    // model call, which in a backfill can be thousands of rows in.
    if (!process.env.AZURE_OPENAI_ENDPOINT) {
      throw new Error(
        "AZURE_OPENAI_ENDPOINT did not resolve from the environment or Key Vault " +
          `(unresolved: ${missing.join(", ") || "none"}). ` +
          "Check KEY_VAULT_URI and that the identity has Key Vault Secrets User.",
      );
    }
  }

  // Imported only now — see above.
  return import("./db");
}
