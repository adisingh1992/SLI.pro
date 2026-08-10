import "dotenv/config";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

/**
 * Central configuration + secret loading.
 *
 * In Azure, secrets live in Key Vault and are fetched at startup using the
 * Container App's user-assigned managed identity — nothing sensitive is baked
 * into image config. Locally, values come from the environment / a .env file.
 *
 * The loader hydrates process.env from Key Vault (without overwriting values
 * that are already set, so a local override always wins), then validates that
 * the required keys are present and fails loudly if not. Because existing
 * modules read process.env at import time, loadConfig() MUST run before the
 * route modules are imported (see server/index.ts).
 */

// Key Vault secret name -> process.env variable name.
// Key Vault secret names use hyphens; env vars use underscores.
const SECRET_MAP: Record<string, string> = {
  "DATABASE-URL": "DATABASE_URL",
  "SESSION-SECRET": "SESSION_SECRET",
  "SENDGRID-API-KEY": "SENDGRID_API_KEY",
  "STRIPE-SECRET-KEY": "STRIPE_SECRET_KEY",
  "STRIPE-WEBHOOK-SECRET": "STRIPE_WEBHOOK_SECRET",
  "LINKEDIN-CLIENT-ID": "LINKEDIN_CLIENT_ID",
  "LINKEDIN-CLIENT-SECRET": "LINKEDIN_CLIENT_SECRET",
  "AZURE-OPENAI-KEY": "AZURE_OPENAI_KEY",
  "ANTHROPIC-API-KEY": "ANTHROPIC_API_KEY",
  "AZURE-STORAGE-ACCOUNT": "AZURE_STORAGE_ACCOUNT",
  "AZURE-OPENAI-ENDPOINT": "AZURE_OPENAI_ENDPOINT",
  "AZURE-OPENAI-DEPLOYMENT-FLAGSHIP": "AZURE_OPENAI_DEPLOYMENT_FLAGSHIP",
  "AZURE-OPENAI-DEPLOYMENT-MID": "AZURE_OPENAI_DEPLOYMENT_MID",
  "AZURE-OPENAI-DEPLOYMENT-NANO": "AZURE_OPENAI_DEPLOYMENT_NANO",
  "AZURE-OPENAI-DEPLOYMENT-EMBEDDINGS": "AZURE_OPENAI_DEPLOYMENT_EMBEDDINGS",
  "AZURE-OPENAI-DEPLOYMENT-TRANSCRIBE": "AZURE_OPENAI_DEPLOYMENT_TRANSCRIBE",
  "OPENAI-API-KEY": "OPENAI_API_KEY",
  "WING-FROM-EMAIL": "WING_FROM_EMAIL"
};

// Config the app cannot start without.
const REQUIRED_KEYS = ["DATABASE_URL", "SESSION_SECRET"];

let loaded = false;

/**
 * Hydrates ONE secret from Key Vault into process.env.
 *
 * Standalone entrypoints — currently the migration job — need a single value
 * and must not run the full loadConfig(): that fetches every secret and throws
 * unless the whole app's required config is present. A migration should not
 * fail because, say, SESSION_SECRET is missing.
 *
 * A value already in the environment always wins, so local runs and CI can
 * override without touching the vault. Returns true if the value is available
 * afterwards, by whatever route.
 */
export async function loadSecretFromVault(envName: string): Promise<boolean> {
  if (process.env[envName]) return true;

  const vaultUri = process.env.KEY_VAULT_URI;
  if (!vaultUri) return false;

  const secretName = Object.entries(SECRET_MAP).find(
    ([, env]) => env === envName,
  )?.[0];
  if (!secretName) {
    throw new Error(`[config] '${envName}' has no Key Vault secret mapping`);
  }

  const credential = new DefaultAzureCredential({
    managedIdentityClientId: process.env.AZURE_MANAGED_IDENTITY_CLIENT_ID,
  });
  const secret = await new SecretClient(vaultUri, credential).getSecret(secretName);

  if (!secret.value) return false;
  process.env[envName] = secret.value;
  return true;
}

/**
 * The secrets a script needs before it can call the LLM orchestrator.
 *
 * `activeProvider()` decides between Azure and Anthropic by looking for
 * AZURE_OPENAI_ENDPOINT. A script that hydrates only DATABASE_URL therefore
 * silently falls through to Anthropic and fails on a missing key — the
 * provider choice is made from an environment that was never populated.
 */
export const LLM_SECRETS = [
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_KEY",
  "AZURE_OPENAI_DEPLOYMENT_FLAGSHIP",
  "AZURE_OPENAI_DEPLOYMENT_MID",
  "AZURE_OPENAI_DEPLOYMENT_NANO",
  "AZURE_OPENAI_DEPLOYMENT_EMBEDDINGS",
  "OPENAI_API_KEY",
] as const;

/**
 * Hydrates several secrets, tolerating ones that are absent.
 *
 * Returns the names that could NOT be resolved, so the caller can decide
 * whether that matters — an absent OPENAI_API_KEY is fine when Azure is the
 * provider, while an absent AZURE_OPENAI_ENDPOINT changes which provider is
 * chosen at all.
 */
export async function loadSecretsFromVault(
  envNames: readonly string[],
): Promise<string[]> {
  const missing: string[] = [];
  for (const name of envNames) {
    try {
      if (!(await loadSecretFromVault(name))) missing.push(name);
    } catch {
      // A secret absent from the vault is expected for optional providers.
      missing.push(name);
    }
  }
  return missing;
}

export async function loadConfig(): Promise<void> {
  if (loaded) return;

  const vaultUri = process.env.KEY_VAULT_URI;

  if (vaultUri) {
    const credential = new DefaultAzureCredential({
      // Set to the user-assigned managed identity's client id in Container Apps.
      managedIdentityClientId: process.env.AZURE_MANAGED_IDENTITY_CLIENT_ID,
    });
    const client = new SecretClient(vaultUri, credential);

    let loadedCount = 0;
    let skippedCount = 0;

    for (const [secretName, envName] of Object.entries(SECRET_MAP)) {
      if (process.env[envName]) continue; // local/env override wins
      try {
        const secret = await client.getSecret(secretName);
        if (secret.value) {
          process.env[envName] = secret.value;
          loadedCount++;
        }
      } catch (err: any) {
        skippedCount++;
        // Surface WHY it failed — the cause determines the fix.
        const status = err?.statusCode ?? err?.status;
        const message: string = err?.message ?? String(err);
        const isAuthFailure =
          /Credential|Authentication|AADSTS/i.test(err?.name ?? "") ||
          /CredentialUnavailableError|AADSTS|az login/i.test(message);

        let reason: string;
        if (isAuthFailure) {
          // The chained-credential error is enormous and identical for every
          // secret — report it once, concisely, and stop trying.
          const aadCode = message.match(/AADSTS\d+/)?.[0];
          console.warn(
            `[config] Key Vault authentication failed${aadCode ? ` (${aadCode})` : ""}. ` +
            `Sign in with the tenant that owns the vault:\n` +
            `         az login --tenant <TENANT_ID>\n` +
            `         Falling back to environment/.env values.`,
          );
          break; // don't repeat this for every remaining secret
        } else if (status === 403) {
          reason =
            "403 Forbidden — the signed-in identity lacks the 'Key Vault Secrets User' role on this vault";
        } else if (status === 404) {
          reason = "404 Not Found — the secret does not exist in this vault";
        } else if (err?.code === "ENOTFOUND" || err?.code === "ETIMEDOUT" || err?.code === "EAI_AGAIN") {
          reason = `network/DNS failure (${err.code}) — private endpoint not reachable; check VPN + private DNS`;
        } else {
          reason = message.split("\n")[0];
        }
        console.warn(`[config] Key Vault '${secretName}': ${reason}`);
      }
    }

    console.log(
      `[config] Key Vault ${vaultUri} — ${loadedCount} secret(s) loaded, ${skippedCount} failed`,
    );
  } else {
    console.log(
      "[config] KEY_VAULT_URI not set; using process.env / .env values only",
    );
  }

  const missing = REQUIRED_KEYS.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `[config] Missing required configuration: ${missing.join(", ")}. ` +
      `Set them in Key Vault (with KEY_VAULT_URI) or the environment.`,
    );
  }

  loaded = true;
}

/** Typed, centralised access to configuration values. */
export const config = {
  get databaseUrl(): string {
    return process.env.DATABASE_URL as string;
  },
  get sessionSecret(): string {
    return process.env.SESSION_SECRET || "supersecretkey";
  },
  get nodeEnv(): string {
    return process.env.NODE_ENV || "development";
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  },
  get port(): number {
    return parseInt(process.env.PORT || "5000", 10);
  },
  /** Serve the built SPA from this process. Off by default in production
   *  because the client is hosted on Azure Static Web Apps. */
  get serveClient(): boolean {
    if (process.env.SERVE_CLIENT !== undefined) {
      return process.env.SERVE_CLIENT === "true";
    }
    return process.env.NODE_ENV !== "production";
  },
};
