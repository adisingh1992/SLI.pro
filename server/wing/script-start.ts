import { initScript, type InitScriptOptions, type ScriptDb } from "../script-init";

/**
 * `initScript()` with a readable failure.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * `initScript` hydrates DATABASE_URL from the environment or, failing that,
 * from Key Vault via `DefaultAzureCredential`. When the credential chain has
 * nothing to offer, the Azure SDK throws an `AggregateAuthenticationError`
 * carrying one `CredentialUnavailableError` per link — environment, managed
 * identity, VS Code, CLI, PowerShell, developer CLI — each with its own stack.
 * Unhandled, that is roughly two hundred lines of output for a problem whose
 * fix is one line, and the actionable sentence (`az login`, or set
 * DATABASE_URL) is buried in the middle of it.
 *
 * The repo already holds the principle this applies: the seeders query
 * `pg_enum` before their first insert and refuse with the `ALTER TYPE` that
 * would fix it, because "a precondition that can be checked in advance should
 * never be discovered by failing". Same idea, one layer out.
 *
 * ── WHAT IT DOES NOT DO ──────────────────────────────────────────────────
 * It does not change how secrets resolve, add a fallback, or weaken anything:
 * `initScript` is called unmodified and the resolution order is untouched. This
 * only catches the throw and prints something a person can act on. A real
 * database error — wrong credentials, host unreachable — is re-thrown as-is,
 * because that one is worth reading in full.
 */

/** The credential chain failing is a configuration state, not a bug.
 *
 *  Exported for its test: the branch that matters is the NEGATIVE one. A real
 *  database error misclassified as a config problem would be replaced by the
 *  guide below and lost. */
export function isSecretResolutionFailure(err: unknown): boolean {
  const e = err as { name?: string; message?: string };
  const text = `${e?.name ?? ""} ${e?.message ?? ""}`;
  return (
    /AggregateAuthenticationError|ChainedTokenCredential|CredentialUnavailable|AADSTS/i.test(text) ||
    /DATABASE_URL must be set/i.test(text)
  );
}

const GUIDE = `
  DATABASE_URL could not be resolved, so this script has nothing to connect to.
  Nothing ran and nothing was written. This is configuration, not a fault in the
  script.

  It resolves in one of two ways — server/config.ts, loadSecretFromVault():

  1 · FROM THE ENVIRONMENT, which short-circuits Key Vault entirely.
      The stage runbook's own convention is a shell export, not .env:

        export DATABASE_URL='postgres://…'
        echo $DATABASE_URL | sed 's/:.*@/:***@/'     # confirm you are on stage

  2 · FROM KEY VAULT, which is what .env's KEY_VAULT_URI selects today.
      That needs an Azure identity with 'Key Vault Secrets User' on the vault:

        az login --scope https://vault.azure.net/.default

      A personal Microsoft account (live.com / outlook.com) cannot read an
      org vault — AADSTS50020 says exactly that: the account "does not exist
      in tenant". Sign in with the work account instead.

  AND, EITHER WAY: stage Postgres is VNet-private. The Point-to-Site VPN has to
  be up, and Step 5 of AZURE_P2S_VPN_SETUP.md — the private DNS zone — has to be
  done, or a correct DATABASE_URL still cannot resolve the host. That step is
  called out in the runbook as the single most common reason the tunnel connects
  and the database stays unreachable.
`;

export async function startScript(opts: InitScriptOptions = {}): Promise<ScriptDb> {
  try {
    return await initScript(opts);
  } catch (err) {
    if (!isSecretResolutionFailure(err)) throw err;

    console.error(GUIDE);
    /*
     * The underlying error is summarised rather than printed. Every line of it
     * says the same thing in a different dialect, and the one that matters is
     * already quoted in the guide above. `--verbose` prints the whole chain for
     * the case where the failure is not one of the two above.
     */
    if (process.argv.includes("--verbose")) {
      console.error("  --verbose: the full credential chain follows\n");
      console.error(err);
    } else {
      console.error("  Re-run with --verbose for the full Azure credential chain.\n");
    }
    process.exit(1);
  }
}
