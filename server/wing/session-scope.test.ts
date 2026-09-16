import assert from "node:assert/strict";
import { collectLibrary } from "./collect-library";
import { moduleFromCode } from "./parse-compendium";
import { SEQUENCE_HARD_LIMIT, SEQUENCE_SOFT_LIMIT, peakDetectorLoad } from "./sequence-limits";
import { sessionScopeFor, unscopedCoaching, type ScopedEntry } from "./session-scope";

/**
 * Tests for per-module session scoping, against the real 325-card library.
 *
 * The one that earns its place is the peak-load case. The whole reason
 * migration 0050 exists is that scoping every module to `module_run` put 105
 * coaching cards in front of the detector on one turn, against a hard limit of
 * 40. If a future change collapses the scopes again — a module dropped from
 * DIRECT, a new module nobody maps — this is what says so, in the number that
 * actually governs.
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

console.log("\nsession-scope\n");

const entries: ScopedEntry[] = collectLibrary().elements.map((e) => {
  const module = moduleFromCode(e.seed.cardCode);
  return {
    cardCode: e.seed.cardCode,
    cardKind: e.seed.cardKind,
    module,
    scope: sessionScopeFor(module),
  };
});

test("every element in the library gets a scope decision", () => {
  assert.equal(entries.length, 325);
});

test("no coaching card is left unscoped", () => {
  const loose = unscopedCoaching(entries);
  assert.deepEqual(
    loose.map((e) => `${e.cardCode} (${e.module})`),
    [],
    "an unscoped coaching card fires on every turn of every session",
  );
});

test("everything unscoped is a gate or an exercise", () => {
  for (const e of entries.filter((x) => x.scope === null)) {
    assert.ok(
      e.cardKind === "integrity_gate" || e.cardKind === "exercise",
      `${e.cardCode} is unscoped and is a ${e.cardKind}`,
    );
  }
});

test("the safety, voice and universal gates apply everywhere", () => {
  for (const code of ["IG-S01", "IG-V01", "H-001", "IG-U014"]) {
    const e = entries.find((x) => x.cardCode === code);
    assert.ok(e, `${code} missing from the library`);
    assert.equal(e!.scope, null, `${code} must not be confined to one session`);
  }
});

test("each module's cards are scoped to that module, not to module_run", () => {
  const expected: Record<string, string> = {
    "H-011": "intake",
    "H-101": "foundation_1",
    "H-201": "foundation_2",
    "H-301": "foundation_3",
    "H-401": "module_4",
    "H-501": "module_5",
    "H-601": "module_6",
    "H-701": "module_7",
    "H-801": "module_8",
    "H-901": "module_9",
    "H-1001": "module_10",
    "H-1101": "module_11",
    "H-1301": "module_13",
    "H-RC04": "reveal_cycle",
  };
  for (const [code, scope] of Object.entries(expected)) {
    const e = entries.find((x) => x.cardCode === code);
    assert.ok(e, `${code} missing from the library`);
    assert.equal(e!.scope, scope, `${code} should be scoped to ${scope}`);
  }
  assert.ok(
    !entries.some((e) => e.scope === "module_run" as never),
    "module_run is the collapsed scope this migration exists to stop using",
  );
});

test("peak detector load is under the hard limit, which is the point", () => {
  const peak = peakDetectorLoad(
    entries.map((e) => ({ cardKind: e.cardKind, appliesToSession: e.scope })),
  );
  assert.ok(
    peak.count <= SEQUENCE_HARD_LIMIT,
    `peak load ${peak.count} in ${peak.session} exceeds the hard limit of ${SEQUENCE_HARD_LIMIT}`,
  );
  // Recorded rather than asserted exactly: it moves when the methodology does,
  // and the number that must hold is the limit above, not today's value.
  console.log(`        peak ${peak.count} coaching cards, in ${peak.session}`);
});

test("the soft limit is exceeded, and that is a warning not a failure", () => {
  const peak = peakDetectorLoad(
    entries.map((e) => ({ cardKind: e.cardKind, appliesToSession: e.scope })),
  );
  // Four modules sit above 15. The soft limit exists to make a reviewer look,
  // and this test exists so nobody is surprised that they will have to.
  assert.ok(
    peak.count > SEQUENCE_SOFT_LIMIT,
    "if this ever passes, the library shrank and the warning can go",
  );
});

console.log(`\n${entries.length} entries scoped, ${failures} failures\n`);
if (failures > 0) process.exit(1);
