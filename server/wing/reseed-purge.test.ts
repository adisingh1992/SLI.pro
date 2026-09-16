import assert from "node:assert/strict";
import { REFERENCING_TABLES, fingerprint, undeclaredTables, type ManifestCycle } from "./reseed-purge";

/**
 * Tests for the drift check that guards the purge.
 *
 * `fingerprint` is the only pure thing in reseed-purge.ts and it is the one
 * that decides whether a human-approved plan still describes the database. It
 * has to be insensitive to the things that legitimately vary between two reads
 * — row order — and sensitive to everything that means the plan is stale: a
 * pointer moved, a card added to a sequence, a card removed, a card's position
 * changed.
 *
 * A false negative here is the expensive one. It would let the purge run against
 * a database someone had changed since the report was read and approved.
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

console.log("\nreseed-purge\n");

const base: ManifestCycle[] = [
  {
    cycleId: 2,
    institution: "Berkeley",
    sequenceId: 13,
    versionNumber: 4,
    entries: [
      { cardCode: "H-101", position: 1, weight: 1, appliesToSession: "foundation_1" },
      { cardCode: "H-102", position: 2, weight: 1.5, appliesToSession: "foundation_1" },
    ],
  },
  {
    cycleId: 1,
    institution: "SLI.pro Direct",
    sequenceId: 18,
    versionNumber: 8,
    entries: [{ cardCode: "H-001", position: 1, weight: 2, appliesToSession: null }],
  },
];

const clone = (): ManifestCycle[] => JSON.parse(JSON.stringify(base));

test("identical captures agree", () => {
  assert.equal(fingerprint(base), fingerprint(clone()));
});

test("cycle order does not matter", () => {
  const reordered = clone().reverse();
  assert.equal(fingerprint(base), fingerprint(reordered));
});

test("entry order within a sequence does not matter", () => {
  const shuffled = clone();
  shuffled[0].entries.reverse();
  assert.equal(fingerprint(base), fingerprint(shuffled));
});

test("a moved pointer is caught", () => {
  const moved = clone();
  moved[0].sequenceId = 19;
  assert.notEqual(fingerprint(base), fingerprint(moved));
});

test("a card added to a sequence is caught", () => {
  const added = clone();
  added[0].entries.push({ cardCode: "H-103", position: 3, weight: 1, appliesToSession: null });
  assert.notEqual(fingerprint(base), fingerprint(added));
});

test("a card removed from a sequence is caught", () => {
  const removed = clone();
  removed[0].entries.pop();
  assert.notEqual(fingerprint(base), fingerprint(removed));
});

test("a card that moved position is caught", () => {
  const moved = clone();
  moved[0].entries[0].position = 9;
  assert.notEqual(fingerprint(base), fingerprint(moved));
});

test("a new cycle appearing is caught", () => {
  const extra = clone();
  extra.push({
    cycleId: 5,
    institution: "New",
    sequenceId: null,
    versionNumber: null,
    entries: [],
  });
  assert.notEqual(fingerprint(base), fingerprint(extra));
});

test("a weight change is deliberately NOT drift", () => {
  // Weight is restored from the manifest, so a change between the report and the
  // run is overwritten rather than lost. Blocking on it would stop the purge for
  // something the purge is about to set anyway.
  const reweighted = clone();
  reweighted[0].entries[0].weight = 2.0;
  assert.equal(fingerprint(base), fingerprint(reweighted));
});

/* ── The catalog check ───────────────────────────────────────────────────── */

/*
 * The first attempt at this script enumerated the tables referencing a card
 * from a comment in reset-cards.ts, which names five. There are six —
 * gate_audit_findings arrived in migration 0021, after that comment was written
 * — and the run died on its foreign key. These cases are why the list is now
 * checked against pg_constraint instead of trusted.
 */

test("every table the schema wires to a card has a declared disposition", () => {
  // The six that exist today, from shared/wing-schema.ts.
  const inSchema = [
    "heuristic_components",
    "heuristic_sequence_entries",
    "transcript_turns",
    "user_heuristic_applications",
    "user_heuristic_scores",
    "gate_audit_findings",
  ];
  assert.deepEqual(undeclaredTables(inSchema), []);
  assert.deepEqual(Object.keys(REFERENCING_TABLES).sort(), inSchema.slice().sort());
});

test("a table added by a future migration blocks the run rather than rolling it back", () => {
  const withNewOne = ["heuristic_components", "card_review_assignments"];
  assert.deepEqual(undeclaredTables(withNewOne), ["card_review_assignments"]);
});

test("the review queue is preserved, and nothing else is", () => {
  assert.equal(REFERENCING_TABLES.gate_audit_findings, "preserve");
  assert.equal(REFERENCING_TABLES.transcript_turns, "null");
  for (const t of [
    "heuristic_components",
    "heuristic_sequence_entries",
    "user_heuristic_applications",
    "user_heuristic_scores",
  ]) {
    assert.equal(REFERENCING_TABLES[t], "delete", `${t} should be deleted`);
  }
});

console.log(`\n${failures} failures\n`);
if (failures > 0) process.exit(1);
