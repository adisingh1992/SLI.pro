import assert from "node:assert/strict";
import { isSecretResolutionFailure } from "./script-start";

/**
 * The only interesting thing here is what this predicate REFUSES to classify.
 *
 * A true positive costs a helpful message. A false positive replaces a real
 * database error — bad password, host unreachable, relation does not exist —
 * with a page about `az login`, and the actual cause never reaches the screen.
 * So the negative cases are asserted at least as hard as the positive ones.
 */

let failures = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${(err as Error).message}`);
  }
}

console.log("\nscript-start\n");

/* ── Recognised: configuration ───────────────────────────────────────────── */

test("the aggregate error the Azure SDK actually throws is recognised", () => {
  const err = Object.assign(new Error("ChainedTokenCredential authentication failed."), {
    name: "AggregateAuthenticationError",
  });
  assert.equal(isSecretResolutionFailure(err), true);
});

test("a personal Microsoft account against an org vault is recognised", () => {
  // The exact shape seen on 10 September: a live.com identity, AADSTS50020.
  const err = new Error(
    "ERROR: AADSTS50020: User account '{EUII Hidden}' from identity provider " +
      "'live.com' does not exist in tenant 'Default Directory'",
  );
  assert.equal(isSecretResolutionFailure(err), true);
});

test("each individual CredentialUnavailableError is recognised", () => {
  for (const m of [
    "EnvironmentCredential is unavailable. No underlying credential could be used.",
    "ManagedIdentityCredential: Authentication failed. Attempted to use the IMDS endpoint",
    "Visual Studio Code Authentication is not available.",
    "Azure Developer CLI couldn't be found.",
  ]) {
    const err = Object.assign(new Error(m), { name: "CredentialUnavailableError" });
    assert.equal(isSecretResolutionFailure(err), true, m);
  }
});

test("initScript's own message is recognised — no vault configured at all", () => {
  const err = new Error(
    "DATABASE_URL must be set in the environment, or available as the " +
      "'DATABASE-URL' secret in the vault named by KEY_VAULT_URI",
  );
  assert.equal(isSecretResolutionFailure(err), true);
});

/* ── Refused: everything a person needs to read in full ─────────────────── */

test("a real Postgres error is NOT swallowed", () => {
  for (const m of [
    'relation "wing.prompt_log" does not exist',
    "password authentication failed for user \"slipro\"",
    "getaddrinfo ENOTFOUND slipro-database-stage.postgres.database.azure.com",
    "connect ETIMEDOUT 10.0.1.4:5432",
    "no pg_hba.conf entry for host",
  ]) {
    assert.equal(isSecretResolutionFailure(new Error(m)), false, m);
  }
});

test("a bug in the script is NOT swallowed", () => {
  assert.equal(
    isSecretResolutionFailure(new TypeError("Cannot read properties of undefined")),
    false,
  );
});

test("a VPN-down timeout is NOT swallowed — the guide would be half-right", () => {
  /*
   * The guide names the VPN and the private DNS zone, so it is tempting to
   * catch this too. It must not: a timeout after DATABASE_URL resolved is a
   * network fact, and printing a page about `az login` over it would send
   * someone to fix the thing that already worked.
   */
  assert.equal(isSecretResolutionFailure(new Error("Connection terminated unexpectedly")), false);
});

test("nothing at all is NOT a config failure", () => {
  for (const v of [null, undefined, "", 0, {}, new Error("")]) {
    assert.equal(isSecretResolutionFailure(v), false, String(v));
  }
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");
