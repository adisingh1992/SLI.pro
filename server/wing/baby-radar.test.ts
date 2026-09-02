import assert from "node:assert/strict";
import {
  currentRadarSuggestions,
  isRadarDueThisWeek,
  parseRadarResponse,
  radarEligibility,
  radarEngagedThisMonth,
  recordRadarEngagement,
  resolveRadarDeliveryTrack,
  runDueRadarSuggestions,
} from "./baby-radar";

/**
 * H-701 (Baby Radar). `resolveRadarDeliveryTrack` and `parseRadarResponse` are
 * pure — real unit tests. `radarEligibility`, `isRadarDueThisWeek`,
 * `recordRadarEngagement`, `radarEngagedThisMonth` and `currentRadarSuggestions`
 * touch a `Db`, so these are against a recording mock, same shape as
 * `content-trigger-detect.test.ts`.
 *
 * `generateRadarSuggestions` itself is NOT tested here: it calls
 * `orchestrator.complete()`, which constructs a real Azure client — not
 * mockable from this file without either dependency injection this module
 * doesn't have, or monkey-patching a live ES module binding, which is more
 * fragile than the thing it would be testing. Its two real pieces —
 * eligibility/cadence gating and response parsing — are both covered directly
 * below; the only untested seam is the network call itself and the INSERT
 * loop after it, which is a straightforward composition of already-tested
 * parts. Run: `npx tsx server/wing/baby-radar.test.ts`.
 *
 * `runDueRadarSuggestions` inherits that same limitation for whichever
 * candidate would actually reach `generateRadarSuggestions`'s model call — so
 * its tests below only exercise the paths that don't: every candidate dormant
 * or not due (no model call reached at all), and a per-student failure before
 * that point, to check the batch's isolation and its aggregate throw. A
 * candidate that is both eligible and due is exactly the untested seam above,
 * one level up.
 */

let failures = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`  ok    ${name}`))
    .catch((err) => {
      failures++;
      console.log(`  FAIL  ${name}`);
      console.log(`        ${(err as Error).message}`);
    });
}

function recordingDb(rowsFor: (n: number) => Record<string, unknown>[]) {
  let n = 0;
  return {
    execute: async (_q: unknown) => {
      n++;
      return { rows: rowsFor(n) };
    },
  };
}

console.log("\nbaby-radar\n");

await test("resolveRadarDeliveryTrack: pathway wins over status, one bucket only (no stage split)", () => {
  assert.equal(resolveRadarDeliveryTrack("mid_career_or_senior", "venture").track, "entrepreneur");
  assert.equal(resolveRadarDeliveryTrack(null, "freelance").track, "entrepreneur");
});

await test("resolveRadarDeliveryTrack: early_career has no bucket of its own, defaults to undergraduate", () => {
  const r = resolveRadarDeliveryTrack("early_career", null);
  assert.equal(r.track, "undergraduate");
  assert.match(r.resolvedBy, /no early_career bucket/);
});

await test("resolveRadarDeliveryTrack: mid_career_or_senior defaults to mid_career, not executive", () => {
  assert.equal(resolveRadarDeliveryTrack("mid_career_or_senior", null).track, "mid_career");
});

await test("resolveRadarDeliveryTrack: undergraduate and career_returner map directly", () => {
  assert.equal(resolveRadarDeliveryTrack("undergraduate_or_recent_grad", null).track, "undergraduate");
  assert.equal(resolveRadarDeliveryTrack("career_break_or_transition", null).track, "career_returner");
});

await test("resolveRadarDeliveryTrack: unresolved status returns null, not a guess", () => {
  assert.equal(resolveRadarDeliveryTrack(null, null).track, null);
  assert.equal(resolveRadarDeliveryTrack(null, "employment").track, null);
});

await test("parseRadarResponse: a well-formed batch of 3-5 topics parses in full", () => {
  const raw = JSON.stringify({
    topics: [
      { topic: "AI adoption in mid-market logistics", whyRelevant: "matches their function in supply chain ops", suggestedAction: "post" },
      { topic: "Return-to-office policy debates", whyRelevant: "relevant to their industry area", suggestedAction: "comment" },
      { topic: "Vendor consolidation trends", whyRelevant: "adjacent to their stated topic area", suggestedAction: "save_for_later" },
    ],
  });
  const topics = parseRadarResponse(raw);
  assert.equal(topics.length, 3);
  assert.equal(topics[0].suggestedAction, "post");
});

await test("parseRadarResponse: malformed entries are dropped, not fatal, as long as something survives", () => {
  const raw = JSON.stringify({
    topics: [
      { topic: "Real one", whyRelevant: "because", suggestedAction: "comment" },
      { topic: "", whyRelevant: "empty topic", suggestedAction: "post" },
      { topic: "Bad action", whyRelevant: "because", suggestedAction: "share_on_twitter" },
      { topic: "Missing whyRelevant", suggestedAction: "post" },
      "not even an object",
    ],
  });
  const topics = parseRadarResponse(raw);
  assert.equal(topics.length, 1);
  assert.equal(topics[0].topic, "Real one");
});

await test("parseRadarResponse: capped at 5 even if the model sends more", () => {
  const raw = JSON.stringify({
    topics: Array.from({ length: 8 }, (_, i) => ({
      topic: `Topic ${i}`,
      whyRelevant: "because",
      suggestedAction: "comment",
    })),
  });
  assert.equal(parseRadarResponse(raw).length, 5);
});

await test("parseRadarResponse: nothing usable throws, rather than storing an empty week silently", () => {
  assert.throws(() => parseRadarResponse(JSON.stringify({ topics: [] })), /no usable topics/);
  assert.throws(() => parseRadarResponse(JSON.stringify({ topics: [{ topic: "", whyRelevant: "", suggestedAction: "x" }] })), /no usable topics/);
});

await test("radarEligibility: neither Foundation 1 function nor Q5.5 topic area — dormant", async () => {
  const db = recordingDb(() => []);
  const r = await radarEligibility(db, 1);
  assert.equal(r.eligible, false);
  assert.match(r.reason, /dormant/);
});

await test("radarEligibility: a Foundation 1 function alone is enough", async () => {
  const db = recordingDb((n) => {
    if (n === 1) return [{ content: { primaryFunction: "Runs supply chain ops for a mid-market retailer" } }];
    return []; // no Q5.5
  });
  const r = await radarEligibility(db, 1);
  assert.equal(r.eligible, true);
  assert.ok(r.primaryFunction);
  assert.equal(r.topicArea, null);
});

await test("radarEligibility: a Q5.5 topic area alone is enough, with no Foundation 1 yet", async () => {
  const db = recordingDb((n) => {
    if (n === 1) return []; // no Foundation 1 artifact
    return [{ structured_responses: { brandingIntake: { responses: { "Q5.5": "vendor risk management" } } } }];
  });
  const r = await radarEligibility(db, 1);
  assert.equal(r.eligible, true);
  assert.equal(r.primaryFunction, null);
  assert.ok(r.topicArea);
});

await test("radarEligibility: lockedFunction is read when primaryFunction is absent", async () => {
  const db = recordingDb((n) => {
    if (n === 1) return [{ content: { lockedFunction: "Product marketing for developer tools" } }];
    return [];
  });
  const r = await radarEligibility(db, 1);
  assert.equal(r.eligible, true);
  assert.equal(r.primaryFunction, "Product marketing for developer tools");
});

await test("isRadarDueThisWeek: no prior generation — due", async () => {
  const db = recordingDb(() => []);
  const r = await isRadarDueThisWeek(db, 1);
  assert.equal(r.due, true);
});

await test("isRadarDueThisWeek: 3 days since the last generation — not due", async () => {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const db = recordingDb(() => [{ at: threeDaysAgo }]);
  const r = await isRadarDueThisWeek(db, 1);
  assert.equal(r.due, false);
});

await test("isRadarDueThisWeek: 8 days since the last generation — due", async () => {
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const db = recordingDb(() => [{ at: eightDaysAgo }]);
  const r = await isRadarDueThisWeek(db, 1);
  assert.equal(r.due, true);
});

await test("recordRadarEngagement and radarEngagedThisMonth: write then read", async () => {
  let updateCalls = 0;
  const db = {
    execute: async (_q: unknown) => {
      updateCalls++;
      return { rows: [] };
    },
  };
  await recordRadarEngagement(db, 42);
  assert.equal(updateCalls, 1);

  const dbWithEngagement = recordingDb(() => [{ "?column?": 1 }]);
  assert.equal(await radarEngagedThisMonth(dbWithEngagement, 1), true);

  const dbWithout = recordingDb(() => []);
  assert.equal(await radarEngagedThisMonth(dbWithout, 1), false);
});

/*
 * The 7-day window itself lives in the SQL (`generated_at >= ${since}`), not
 * in this function's own logic — a recording mock doesn't inspect the query
 * it was given, so that predicate isn't exercised here. What's covered is
 * the row mapping (snake_case columns to the camelCase RadarSuggestionRow
 * shape, including the null-vs-timestamp branch on engaged_at) and the
 * empty case.
 */
await test("currentRadarSuggestions: maps snake_case rows, including a null engaged_at", async () => {
  const db = recordingDb(() => [
    {
      id: 7,
      topic: "Pricing transparency in B2B SaaS",
      why_relevant: "Matches your Foundation 1 function in revenue strategy.",
      suggested_action: "comment",
      generated_at: "2026-08-30T12:00:00.000Z",
      engaged_at: null,
    },
    {
      id: 8,
      topic: "Return-to-office debates",
      why_relevant: "Your intake topic area touches org design.",
      suggested_action: "save_for_later",
      generated_at: "2026-08-31T09:00:00.000Z",
      engaged_at: "2026-09-01T10:00:00.000Z",
    },
  ]);

  const rows = await currentRadarSuggestions(db, 1);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    id: 7,
    topic: "Pricing transparency in B2B SaaS",
    whyRelevant: "Matches your Foundation 1 function in revenue strategy.",
    suggestedAction: "comment",
    generatedAt: "2026-08-30T12:00:00.000Z",
    engagedAt: null,
  });
  assert.equal(rows[1].engagedAt, "2026-09-01T10:00:00.000Z");
});

await test("currentRadarSuggestions: nothing in the window — empty array, not an error", async () => {
  const db = recordingDb(() => []);
  assert.deepEqual(await currentRadarSuggestions(db, 1), []);
});

await test("runDueRadarSuggestions: every candidate dormant — all skipped, no model call reached", async () => {
  // n=1 candidateStudentIds -> [1, 2]; every query after that (statusAndPathway,
  // then radarEligibility's two Promise.all queries per student, resolved in
  // array order per this session's established synchronous-until-first-await
  // convention) returns no rows, so both students read as dormant.
  let n = 0;
  const db = {
    execute: async (_q: unknown) => {
      n++;
      if (n === 1) return { rows: [{ id: 1 }, { id: 2 }] };
      return { rows: [] };
    },
  };
  const result = await runDueRadarSuggestions(db as any, Date.now());
  assert.equal(result.candidates, 2);
  assert.equal(result.generated, 0);
  assert.equal(result.skipped, 2);
  assert.equal(result.failed, 0);
});

await test("runDueRadarSuggestions: one candidate throws, the other is still evaluated, and the batch throws at the end", async () => {
  let n = 0;
  const db = {
    execute: async (_q: unknown) => {
      n++;
      if (n === 1) return { rows: [{ id: 1 }, { id: 2 }] }; // candidateStudentIds
      if (n === 2) throw new Error("connection reset"); // student 1's statusAndPathway
      return { rows: [] }; // student 2's three queries, all empty -> dormant
    },
  };
  await assert.rejects(
    () => runDueRadarSuggestions(db as any, Date.now()),
    /1 of 2 Baby Radar generation\(s\) failed/,
  );
});

await test("runDueRadarSuggestions: no candidates — a clean, empty result, not a failure", async () => {
  const db = recordingDb(() => []);
  const result = await runDueRadarSuggestions(db as any, Date.now());
  assert.deepEqual(result, { candidates: 0, generated: 0, skipped: 0, failed: 0 });
});

console.log(`\n${failures} failures\n`);
if (failures > 0) process.exit(1);
