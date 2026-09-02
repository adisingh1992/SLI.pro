import assert from "node:assert/strict";
import {
  bandFor,
  isOutreachSuggestionDue,
  isSuggestionDue,
  resolveCadenceTrack,
} from "./content-cadence";

/**
 * Tests for H-625's cadence engine. Pure module, so these are plain unit
 * cases rather than assertions against a real document — the analogous
 * document-fidelity discipline lives in parse-content-system.test.ts, which
 * is what pins the actual day counts this file's tables were transcribed
 * from.
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

console.log("\ncontent-cadence\n");

test("split tracks (undergraduate, career_returner) respond to comfort", () => {
  assert.deepEqual(bandFor("undergraduate", "unestablished"), { minDays: 10, maxDays: 14 });
  assert.deepEqual(bandFor("undergraduate", "emerging"), { minDays: 10, maxDays: 14 });
  assert.deepEqual(bandFor("undergraduate", "established"), { minDays: 7, maxDays: 10 });
  assert.deepEqual(bandFor("undergraduate", "confident"), { minDays: 7, maxDays: 10 });
  assert.deepEqual(bandFor("career_returner", "emerging"), { minDays: 14, maxDays: 21 });
  assert.deepEqual(bandFor("career_returner", "confident"), { minDays: 10, maxDays: 14 });
});

test("single-band tracks ignore comfort entirely", () => {
  for (const comfort of ["unestablished", "emerging", "established", "confident"] as const) {
    assert.deepEqual(bandFor("executive", comfort), { minDays: 21, maxDays: 30 });
  }
});

test("resolveCadenceTrack: entrepreneur pathway wins over status", () => {
  assert.equal(resolveCadenceTrack("early_career", "venture").track, "entrepreneur_early");
  assert.equal(resolveCadenceTrack(null, "freelance").track, "entrepreneur_early");
});

test("resolveCadenceTrack: mid_career_or_senior defaults to mid_career, not executive", () => {
  assert.equal(resolveCadenceTrack("mid_career_or_senior", null).track, "mid_career");
});

test("resolveCadenceTrack: unresolvable status returns null track, not a guess", () => {
  assert.equal(resolveCadenceTrack(null, null).track, null);
  assert.equal(resolveCadenceTrack(null, "employment").track, null);
});

test("IG-M6-02: platform suppression overrides everything else", () => {
  const r = isSuggestionDue({
    track: "executive",
    comfort: "confident",
    daysSinceLastSuggestion: 999,
    daysSinceLastUserContentAction: 999,
    declineStreak: 0,
    platformSuppressed: true,
  });
  assert.equal(r.due, false);
  assert.match(r.reason, /IG-M6-02/);
});

test("H-625 failure_path: a decline streak of 3 pauses rather than extends", () => {
  const r = isSuggestionDue({
    track: "early_career",
    comfort: "emerging",
    daysSinceLastSuggestion: 999,
    daysSinceLastUserContentAction: null,
    declineStreak: 3,
    platformSuppressed: false,
  });
  assert.equal(r.due, false);
  assert.equal(r.pausedByDeclineStreak, true);
});

test("H-625 timing rule: a decline streak of 2 extends the interval by 50%", () => {
  const r = isSuggestionDue({
    track: "early_career", // band 7-10
    comfort: "emerging",
    daysSinceLastSuggestion: 9,
    daysSinceLastUserContentAction: null,
    declineStreak: 2,
    platformSuppressed: false,
  });
  assert.equal(r.effectiveBand.minDays, 11); // ceil(7 * 1.5)
  assert.equal(r.due, false); // 9 < 11
});

test("H-625 timing rule: a content action within 3 days suppresses the next suggestion", () => {
  const r = isSuggestionDue({
    track: "early_career",
    comfort: "emerging",
    daysSinceLastSuggestion: 30,
    daysSinceLastUserContentAction: 1,
    declineStreak: 0,
    platformSuppressed: false,
  });
  assert.equal(r.due, false);
});

test("a student with no prior suggestion is always due", () => {
  const r = isSuggestionDue({
    track: "executive",
    comfort: "unestablished",
    daysSinceLastSuggestion: null,
    daysSinceLastUserContentAction: null,
    declineStreak: 0,
    platformSuppressed: false,
  });
  assert.equal(r.due, true);
});

test("H-625: 'wait for engagement data' suppresses even when the band is otherwise met", () => {
  const r = isSuggestionDue({
    track: "early_career",
    comfort: "emerging",
    daysSinceLastSuggestion: 999,
    daysSinceLastUserContentAction: null,
    declineStreak: 0,
    platformSuppressed: false,
    awaitingEngagementData: true,
  });
  assert.equal(r.due, false);
});

test("H-625: DM/connection-request cap is 1 per 14 days, independent of content cadence", () => {
  assert.equal(
    isOutreachSuggestionDue({ kind: "dm", suggestedInLast14Days: 0, platformSuppressed: false }).due,
    true,
  );
  assert.equal(
    isOutreachSuggestionDue({ kind: "dm", suggestedInLast14Days: 1, platformSuppressed: false }).due,
    false,
  );
  assert.equal(
    isOutreachSuggestionDue({
      kind: "connection_request",
      suggestedInLast14Days: 0,
      platformSuppressed: true,
    }).due,
    false,
  );
});

console.log(`\n${failures} failures\n`);
if (failures > 0) process.exit(1);
