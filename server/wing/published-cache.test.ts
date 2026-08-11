import { cached, invalidate, stats, __reset } from "./published-cache";

/**
 * The cache is the only thing in the turn path that can serve a stale answer,
 * so its rules are pinned rather than assumed.
 *
 * The failure this project keeps meeting is a plausible wrong answer from a
 * lookup that quietly missed. A cache is a machine for producing those, which
 * is why the entry conditions matter more than the speed: it holds only
 * immutable published content, every publish path clears it, and a failed read
 * is never remembered.
 */

let failures = 0;
const check = (name: string, got: unknown, expected: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.error(`  ✗ ${name}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
  }
};

async function main() {
  console.log("\nPublished-content cache");

  /* ── A second read does not hit the database ────────────────────────── */
  __reset();
  let calls = 0;
  const read = async () => {
    calls++;
    return { versionNumber: 3 };
  };

  await cached("criteria:mid:foundation_1", read);
  await cached("criteria:mid:foundation_1", read);
  await cached("criteria:mid:foundation_1", read);
  check("three reads, one query", calls, 1);
  check("hits counted", stats().hits, 2);

  /* ── Different keys are different entries ───────────────────────────── */
  await cached("criteria:early_career:foundation_1", read);
  check("population is part of the key", calls, 2);
  await cached("criteria:mid:foundation_2", read);
  check("session type is part of the key", calls, 3);

  /* ── null is a real answer and is cached ────────────────────────────── *
   * "No published version for this population" is the common case for a
   * population nobody has authored yet. Not caching it would leave the most
   * common path paying the full round trip every turn — the exact cost this
   * exists to remove.                                                      */
  __reset();
  let nullCalls = 0;
  const readNull = async () => {
    nullCalls++;
    return null;
  };
  await cached("criteria:none:foundation_1", readNull);
  await cached("criteria:none:foundation_1", readNull);
  check("null is cached", nullCalls, 1);

  /* ── Publishing clears the namespace, and only that namespace ───────── *
   * A full flush on every publish would throw away the objective set a live
   * session is mid-way through using, to make an unrelated criteria edit
   * visible. Prefixes keep the blast radius at the thing that changed.      */
  __reset();
  let criteriaCalls = 0;
  let methodologyCalls = 0;
  const readCriteria = async () => ++criteriaCalls;
  const readMethodology = async () => ++methodologyCalls;

  await cached("criteria:mid:foundation_1", readCriteria);
  await cached("methodology:mid:foundation_1", readMethodology);

  invalidate("criteria:");

  await cached("criteria:mid:foundation_1", readCriteria);
  await cached("methodology:mid:foundation_1", readMethodology);

  check("criteria re-read after its publish", criteriaCalls, 2);
  check("methodology untouched by a criteria publish", methodologyCalls, 1);

  /* ── A failed read is not remembered ────────────────────────────────── *
   * Caching a rejection would turn a one-second network blip into a minute of
   * sessions falling back to the prompt file's built-in criteria — degraded
   * coaching, with nothing in the logs after the first error.               */
  __reset();
  let attempts = 0;
  const flaky = async () => {
    attempts++;
    if (attempts === 1) throw new Error("connection reset");
    return { versionNumber: 9 };
  };

  await cached("criteria:mid:foundation_3", flaky).catch(() => {});
  const recovered = await cached("criteria:mid:foundation_3", flaky);

  check("a rejection is not cached", attempts, 2);
  check("the retry's value is returned", recovered, { versionNumber: 9 });

  if (failures) {
    console.error(`\n${failures} failure(s)\n`);
    process.exit(1);
  }
  console.log("  ok — 11 checks");
  console.log("\nall passed\n");
}

void main();
