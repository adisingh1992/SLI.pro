/**
 * H-627's routing, against a recording mock — same shape and same caveat as
 * `content-trigger-detect.test.ts`: this whole chain (safety-hold-store →
 * suppression, content-progression, content-trigger-detect) depends on
 * drizzle-orm at runtime, so run with
 * `npx tsx server/wing/content-trigger-integration.test.ts`.
 *
 * Every case here is hand-traced call-by-call against the actual source of
 * every function in the chain — `routeContentTrigger` calls
 * `contentSuggestionsSuppressed` (2 queries), `contentSuggestionCadenceInputs`
 * (5 queries, via Promise.all — see the file header note on why that order is
 * still deterministic), then `detectArticleTrigger`, `detectPostTrigger` and/or
 * `detectCommentTrigger` in that order (each starting with
 * `contentProgressionStage`'s own 2 queries — a student below Stage 3/2 gets
 * turned away after just those 2, so a Stage-1 student's article and post
 * checks each cost exactly 2 queries before falling through). Getting the
 * call index wrong here fails LOUDLY (a case reads the wrong row and asserts
 * on the wrong thing), which is the same trade `content-trigger-detect.test.ts`
 * itself accepts for the same reason: over-fitting a mock to something more
 * elaborate would be more fragile than the code it tests.
 */
import { recordTriggerFired, routeContentTrigger } from "./content-trigger-integration";

let failures = 0;
const fail = (msg: string) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
const ok = (msg: string) => console.log(`  ok — ${msg}`);

function recordingDb(rowsFor: (n: number) => Record<string, unknown>[]) {
  let n = 0;
  return {
    execute: async (_q: unknown) => {
      n++;
      return { rows: rowsFor(n) };
    },
  };
}

console.log("\ncontent-trigger-integration\n");

console.log("IG-M6-02: an active safety hold suppresses everything, before any cadence or detector query runs");
{
  const before = failures;
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  let calls = 0;
  const db = {
    execute: async (_q: unknown) => {
      calls++;
      if (calls === 1) return { rows: [{ rule: "IG-S01", fired_at: twoDaysAgo, note: null, soft_check_in_sent_at: null }] };
      if (calls === 2) return { rows: [] }; // no user-initiated turns since
      throw new Error(`unexpected call ${calls} — suppression should have short-circuited everything after it`);
    },
  };
  const r = await routeContentTrigger(db, 1);
  if (r.fires) fail(`expected suppressed, got fires=true`);
  if (calls !== 2) fail(`expected exactly 2 queries (both suppression's), got ${calls}`);
  if (!/held/.test(r.reason) && !/safety hold/.test(r.reason)) fail(`reason should name the hold: "${r.reason}"`);
  if (before === failures) ok("suppressed after exactly 2 queries, no cadence or detector call made");
}

console.log("H-625/IG-M6-02: a recent suggestion inside the track's band blocks before any detector runs");
{
  const before = failures;
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const db = recordingDb((n) => {
    if (n === 1) return []; // no holds
    if (n === 2) return []; // no turns
    if (n === 3) return [{ professional_status: "mid_career_or_senior", pathway: null }];
    if (n === 4) return []; // comfort: unestablished (irrelevant — mid_career is a single band)
    if (n === 5) return [{ at: threeDaysAgo }]; // daysSinceLastSuggestion = 3
    if (n === 6) return []; // daysSinceLastUserContentAction = null
    if (n === 7) return []; // declineStreak = 0
    throw new Error(`unexpected call ${n} — cadence should have blocked before any detector query`);
  });
  const r = await routeContentTrigger(db, 1);
  if (r.fires) fail(`expected not due, got fires=true`);
  if (!r.cadence || r.cadence.due) fail("cadence result should be present and not due");
  if (before === failures) ok(`held on cadence — "${r.reason}"`);
}

console.log("cadence due but no signal anywhere: article and post are blocked by Stage 1, comment finds nothing");
{
  const before = failures;
  const db = recordingDb((n) => {
    if (n >= 1 && n <= 7) return []; // no hold, no track/pathway, unestablished comfort, no history
    if (n === 8) return []; // article's contentProgressionStage: published counts — none
    if (n === 9) return []; // article's contentProgressionStage: comfort — unestablished, stage 1
    if (n === 10) return []; // post's contentProgressionStage: published counts — none
    if (n === 11) return []; // post's contentProgressionStage: comfort — unestablished, stage 1
    if (n === 12) return []; // comment's contentProgressionStage: published counts — none
    if (n === 13) return []; // comment's contentProgressionStage: comfort — unestablished, stage 1
    if (n === 14) return []; // comment's foundationCompletedAt(foundation_1) — never completed
    throw new Error(`unexpected call ${n}`);
  });
  const r = await routeContentTrigger(db, 1);
  if (r.fires) fail(`expected no signal, got fires=true contentType=${r.contentType}`);
  if (r.cadence?.due !== true) fail("cadence should have been due (no prior suggestion, fallback band)");
  if (before === failures) ok(`due, but nothing fired — "${r.reason}"`);
}

console.log("an explicit post request reaches Stage 2 on its own and fires immediately, cadence permitting (article checked first, blocked at Stage 1)");
{
  const before = failures;
  const db = recordingDb((n) => {
    if (n === 3) return [{ professional_status: "early_career", pathway: null }]; // track
    if (n >= 1 && n <= 7) return []; // no hold; unestablished comfort; no prior suggestion/action/streak
    if (n === 8) return []; // detectArticleTrigger's progression: published counts — none
    if (n === 9) return []; // detectArticleTrigger's progression: comfort — unestablished, stage 1, blocked
    if (n === 10) return []; // detectPostTrigger's progression: published counts — none
    if (n === 11) return []; // detectPostTrigger's progression: comfort — unestablished (explicit override still lifts it to Stage 2)
    throw new Error(`unexpected call ${n} — explicit request should fire before any further query`);
  });
  const r = await routeContentTrigger(db, 1, { post: { explicitRequest: true } });
  if (!r.fires || r.contentType !== "post") fail(`expected an explicit post fire, got fires=${r.fires} contentType=${r.contentType}`);
  if (r.detection?.signal !== "explicit") fail(`expected signal "explicit", got ${r.detection?.signal}`);
  if (before === failures) ok("explicit request fires as a post, after exactly 11 queries (article's 2, then post's 2)");
}

console.log("an explicit article request reaches Stage 3 on its own and fires immediately, ahead of post/comment");
{
  const before = failures;
  const db = recordingDb((n) => {
    if (n >= 1 && n <= 7) return []; // no hold; unestablished comfort; no prior suggestion/action/streak
    if (n === 8) return []; // detectArticleTrigger's progression: published counts — none
    if (n === 9) return []; // detectArticleTrigger's progression: comfort — unestablished (explicit override still lifts it to Stage 3)
    throw new Error(`unexpected call ${n} — explicit article request should fire before post or comment are ever checked`);
  });
  const r = await routeContentTrigger(db, 1, { article: { explicitRequest: true } });
  if (!r.fires || r.contentType !== "article") fail(`expected an explicit article fire, got fires=${r.fires} contentType=${r.contentType}`);
  if (r.detection?.signal !== "explicit") fail(`expected signal "explicit", got ${r.detection?.signal}`);
  if (before === failures) ok("explicit article request fires immediately, ahead of post/comment, after exactly 9 queries");
}

console.log("recordTriggerFired writes exactly one row and does not throw");
{
  const before = failures;
  let calls = 0;
  const db = {
    execute: async (_q: unknown) => {
      calls++;
      return { rows: [] };
    },
  };
  await recordTriggerFired(db, 1, "post", {
    fires: true,
    signal: "explicit",
    reason: "user explicitly asked to write a post",
    triggerSource: "explicit_request:post",
  });
  if (calls !== 1) fail(`expected exactly one insert, got ${calls}`);
  if (before === failures) ok("one row written");
}

console.log(`\n${failures} failures\n`);
if (failures > 0) process.exit(1);
