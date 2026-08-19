import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SEQUENCE_HARD_LIMIT,
  SEQUENCE_SOFT_LIMIT,
  detectorLoadBySession,
  peakDetectorLoad,
  type ScopedCard,
} from "./sequence-limits";
import { isTier1, parseCompendium } from "./parse-compendium";
import { INTAKE_SOURCE, parseIntake } from "./parse-intake";
import { RESEARCH_GATES_SOURCE, parseResearchGates } from "./parse-research-gates";

/**
 * Tests for the detector-load measurement.
 *
 * ── WHY THIS CHANGED ─────────────────────────────────────────────────────
 * The hard limit was applied to every coaching card in a sequence, which was the
 * right measurement when a sequence had no session scope: all of them entered the
 * detector catalogue on every turn. Migration 0020 scoped entries by session and
 * `card_kind` took gates out of the catalogue, so the premise moved and the number
 * stopped describing anything a student experiences.
 *
 * The Tier 1 set after the 18 August documents is the case that forced it: 104
 * entries, 46 coaching cards, and no single turn seeing more than 23. The old
 * check refuses it at 46. The peak passes it at 23, which is the number the
 * detector is actually asked to choose between.
 *
 * The unscoped case is asserted just as hard, because that is the loophole this
 * could have opened: `publishCycleSequence` writes no session scope, so a sequence
 * composed through the API is entirely unscoped, and for it the peak equals the
 * total. One formula, both cases.
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

console.log("\nsequence-limits\n");

const card = (kind: string | null, session: string | null): ScopedCard => ({
  cardKind: kind,
  appliesToSession: session,
});

test("the limits are unchanged — only what they measure moved", () => {
  assert.equal(SEQUENCE_SOFT_LIMIT, 15);
  assert.equal(SEQUENCE_HARD_LIMIT, 40);
});

test("an unscoped sequence peaks at its own total", () => {
  /*
   * The loophole that is not one. `publishCycleSequence` does not set
   * applies_to_session, so everything the compose route writes is unscoped —
   * every coaching card really is in front of the detector on every turn, and the
   * peak says so.
   */
  const cards = Array.from({ length: 46 }, () => card("coaching_card", null));
  assert.deepEqual(peakDetectorLoad(cards), { session: null, count: 46 });
  assert.ok(peakDetectorLoad(cards).count > SEQUENCE_HARD_LIMIT);
});

test("gates and exercises are not in front of the detector", () => {
  /*
   * A gate's signal describes something WING is about to say. Offering it to a
   * detector that matches the student's words is a category error, and
   * getActiveSequenceForStudent asks for coaching cards for exactly that reason —
   * so counting gates against a detector limit measures the wrong thing.
   */
  const cards = [
    card("coaching_card", "intake"),
    card("integrity_gate", "intake"),
    card("integrity_gate", null),
    card("exercise", "foundation_3"),
    card(null, "intake"),
  ];
  assert.deepEqual(peakDetectorLoad(cards), { session: "intake", count: 1 });
});

test("cards scoped to nothing are counted in every session", () => {
  const cards = [
    card("coaching_card", null),
    card("coaching_card", null),
    card("coaching_card", "intake"),
    card("coaching_card", "foundation_1"),
    card("coaching_card", "foundation_1"),
    card("coaching_card", "foundation_1"),
  ];
  assert.deepEqual(detectorLoadBySession(cards), [
    { session: "intake", count: 3 },
    { session: "foundation_1", count: 5 },
  ]);
  assert.deepEqual(peakDetectorLoad(cards), { session: "foundation_1", count: 5 });
});

test("an empty sequence is zero, not an error", () => {
  assert.deepEqual(peakDetectorLoad([]), { session: null, count: 0 });
  assert.deepEqual(peakDetectorLoad([card("integrity_gate", null)]), {
    session: null,
    count: 0,
  });
});

test("the real Tier 1 set passes per turn and would have failed per sequence", () => {
  /*
   * Built from the three documents the way wing:build-foundation-sequences scopes
   * them: Foundation modules to their own session, intake to intake, universal and
   * voice to nothing. If this ever exceeds the hard limit, the sequence genuinely
   * cannot be activated and the methodology needs splitting — which is a decision,
   * not a number to raise.
   */
  const compendium = parseCompendium(
    readFileSync("methodology/wing-master-module-compendium-v2.md", "utf8"),
  );
  const intake = parseIntake(readFileSync(INTAKE_SOURCE, "utf8"));
  const research = parseResearchGates(readFileSync(RESEARCH_GATES_SOURCE, "utf8"));

  const scopeOf = (module: string): string | null =>
    module === "foundation_1" || module === "foundation_2" || module === "foundation_3"
      ? module
      : module === "intake"
        ? "intake"
        : null;

  const entries: ScopedCard[] = [];
  for (const c of compendium.cards.filter(isTier1)) {
    entries.push(card(c.cardKind, scopeOf(c.module)));
  }
  for (const c of intake.cards) entries.push(card(c.cardKind, "intake"));
  for (const g of intake.gates) entries.push(card("integrity_gate", "intake"));
  for (const g of research.universalGates) entries.push(card("integrity_gate", null));
  for (const g of research.moduleGates.filter(isTier1)) {
    entries.push(card(g.cardKind, scopeOf(g.module)));
  }

  assert.equal(entries.length, 104);
  const coaching = entries.filter((e) => e.cardKind === "coaching_card").length;
  assert.equal(coaching, 46);

  const loads = detectorLoadBySession(entries);
  assert.deepEqual(loads.slice().sort((a, b) => a.count - b.count), [
    { session: "foundation_2", count: 7 },
    { session: "foundation_1", count: 8 },
    { session: "foundation_3", count: 8 },
    { session: "intake", count: 23 },
  ]);

  const peak = peakDetectorLoad(entries);
  assert.deepEqual(peak, { session: "intake", count: 23 });
  assert.ok(peak.count <= SEQUENCE_HARD_LIMIT, "the real set must be activatable");
  assert.ok(coaching > SEQUENCE_HARD_LIMIT, "and the old measurement must have refused it");
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");
