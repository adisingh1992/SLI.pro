/**
 * H-620/H-621 detection, against a recording mock — same shape and same
 * caveat as `content-progression.test.ts`: depends on drizzle-orm at
 * runtime, so run with `npx tsx server/wing/content-trigger-detect.test.ts`.
 *
 * Fewer cases than content-progression.test.ts by design — not every branch
 * is covered, since each detector makes a variable number of DB calls
 * depending on which signal fires, and over-fitting a mock to exact call
 * counts makes the test more fragile than the code it's testing. These cover
 * the signals grounded in real data (Foundation completion, content activity,
 * Tier 1 journal entries) plus one caller-supplied signal per detector, to
 * confirm the "not available yet" inputs actually work when a caller does
 * eventually have something to pass.
 */
import { detectArticleTrigger, detectCommentTrigger, detectPostTrigger } from "./content-trigger-detect";

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

console.log("\ncontent-trigger-detect\n");

console.log("H-620 signal (a): a supplied Radar content match fires immediately, no DB lookback needed");
{
  const before = failures;
  // Even an empty rowsFor works here — progression's two queries still run
  // first (comment is allowed at every stage), but signal (a) short-circuits
  // before any Foundation/activity lookup.
  const db = recordingDb(() => []);
  const r = await detectCommentTrigger(db, 1, {
    radarContentMatch: { authorName: "J. Rivera", topic: "supply chain resilience" },
  });
  if (!r.fires || r.signal !== "a") fail(`expected signal a, got fires=${r.fires} signal=${r.signal}`);
  if (before === failures) ok("signal (a) fires from a supplied Radar match");
}

console.log("H-620 signal (d): Foundation 1 completed within 48 hours fires");
{
  const before = failures;
  const recentIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const db = recordingDb((n) => {
    if (n === 1) return []; // progression: no published activity
    if (n === 2) return []; // comfort: unestablished
    if (n === 3) return [{ completed_at: recentIso }]; // foundation_1 completedAt
    return [];
  });
  const r = await detectCommentTrigger(db, 1);
  if (!r.fires || r.signal !== "d") fail(`expected signal d, got fires=${r.fires} signal=${r.signal}`);
  if (before === failures) ok("signal (d) fires on a recent Foundation 1 completion");
}

console.log("H-620 signal (b): low comfort + Foundation 1 (not recent) + 14+ idle days fires");
{
  const before = failures;
  const oldIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const db = recordingDb((n) => {
    if (n === 1) return [];
    if (n === 2) return [];
    if (n === 3) return [{ completed_at: oldIso }]; // foundation_1, 30 days ago
    if (n === 4) return [{ last_at: oldIso }]; // last content activity, 30 days ago
    return [];
  });
  const r = await detectCommentTrigger(db, 1);
  if (!r.fires || r.signal !== "b") fail(`expected signal b, got fires=${r.fires} signal=${r.signal}`);
  if (before === failures) ok("signal (b) fires on low comfort + dormancy");
}

console.log("H-620: nothing fires when no signal is present");
{
  const before = failures;
  const oldIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const db = recordingDb((n) => {
    if (n === 1) return [{ trigger_type: "post", n: 3 }]; // high comfort inputs below
    if (n === 2) {
      return [
        { trigger_type: "post", event_type: "published", content_draft_id: 1 },
        { trigger_type: "comment", event_type: "published", content_draft_id: 2 },
      ];
    }
    if (n === 3) return [{ completed_at: oldIso }]; // foundation_1, not recent
    if (n === 4) return []; // never mind — comfort is established, so call 4 shouldn't even fire
    return [];
  });
  const r = await detectCommentTrigger(db, 1);
  if (r.fires) fail(`expected no signal, got fires=true signal=${r.signal}`);
  if (before === failures) ok("no false positive when nothing qualifies");
}

console.log("H-621: post is blocked entirely below Stage 2 (no comments, no explicit request)");
{
  const before = failures;
  const db = recordingDb(() => []); // zero activity -> Stage 1, progression's 2 calls only
  const r = await detectPostTrigger(db, 1);
  if (r.fires) fail(`expected no fire at Stage 1, got signal=${r.signal}`);
  if (before === failures) ok("post correctly blocked below Stage 2, no Foundation lookups even attempted");
}

console.log("H-621: an explicit request reaches Stage 2 and fires on its own, honored regardless of history");
{
  const before = failures;
  const db = recordingDb(() => []); // zero activity — the request itself must carry the student to Stage 2+
  const r = await detectPostTrigger(db, 1, { explicitRequest: true });
  if (!r.fires || r.signal !== "explicit") fail(`expected explicit signal, got fires=${r.fires} signal=${r.signal}`);
  if (before === failures) ok("explicit request reaches Stage 2 and fires on its own");
}

console.log("H-621 signal (a): Foundation 3 completed within 48 hours fires (reached Stage 2 via 3+ comments)");
{
  const before = failures;
  const recentIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const db = recordingDb((n) => {
    if (n === 1) return [{ trigger_type: "comment", n: 3 }]; // -> Stage 2
    if (n === 2) return [];
    if (n === 3) return [{ completed_at: recentIso }]; // foundation_3
    return [];
  });
  const r = await detectPostTrigger(db, 1);
  if (!r.fires || r.signal !== "a") fail(`expected signal a, got fires=${r.fires} signal=${r.signal}`);
  if (before === failures) ok("signal (a) fires on a recent Foundation 3 completion");
}

console.log("H-621 signal (d) takes priority over (g) when both are present (3+ comments AND prior engagement)");
{
  const before = failures;
  const db = recordingDb((n) => {
    if (n === 1) return [{ trigger_type: "comment", n: 3 }];
    if (n === 2) return [];
    return []; // foundation_3, foundation_2 — neither completed
  });
  const r = await detectPostTrigger(db, 1, { priorPostEngagement: 12 });
  if (!r.fires || r.signal !== "d") fail(`expected signal d to take priority, got fires=${r.fires} signal=${r.signal}`);
  if (before === failures) ok("signal (d) correctly takes priority over (g)");
}

console.log("H-621 signal (g): reachable when Stage 3 came from posts, not comments (0 comments, 3+ posts)");
{
  const before = failures;
  const db = recordingDb((n) => {
    if (n === 1) return [{ trigger_type: "post", n: 3 }]; // 0 comments, 3 posts
    if (n === 2) {
      // Two distinct published trigger types -> "established" comfort, so
      // Stage 3 is reached (publishedPostCount>=3 AND comfort demonstrated)
      // without ever tripping signal (d)'s commentCount>=3 check.
      return [
        { trigger_type: "post", event_type: "published", content_draft_id: 1 },
        { trigger_type: "comment", event_type: "published", content_draft_id: 2 },
      ];
    }
    if (n === 5) return []; // recentTier1JournalQuote — none available
    return []; // foundation_3, foundation_2 — neither completed
  });
  const r = await detectPostTrigger(db, 1, { priorPostEngagement: 12 });
  if (!r.fires || r.signal !== "g") fail(`expected signal g, got fires=${r.fires} signal=${r.signal}`);
  if (before === failures) ok("signal (g) fires when Stage 3 was reached without tripping signal (d)");
}

console.log("H-621 signal (b): falls back to a real Baby Radar 'post' suggestion when no caller override is supplied");
{
  const before = failures;
  const genIso = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const db = recordingDb((n) => {
    if (n === 1) return [{ trigger_type: "post", n: 3 }]; // 0 comments, 3 posts — signal (d)'s commentCount check stays unreached
    if (n === 2) {
      return [
        { trigger_type: "post", event_type: "published", content_draft_id: 1 },
        { trigger_type: "comment", event_type: "published", content_draft_id: 2 },
      ]; // -> established comfort -> Stage 3 (allows post) without tripping signal (d)
    }
    if (n === 5) return []; // recentTier1JournalQuote — none available
    if (n === 6) {
      return [{ topic: "AI in supply chains", why_relevant: "matches your Foundation 1 function", generated_at: genIso }];
    }
    return []; // foundation_3, foundation_2 — neither completed
  });
  const r = await detectPostTrigger(db, 1);
  if (!r.fires || r.signal !== "b") fail(`expected signal b (Radar fallback), got fires=${r.fires} signal=${r.signal}`);
  if (r.fires && !r.triggerSource?.includes("AI in supply chains")) fail(`expected triggerSource to name the Radar topic, got ${r.triggerSource}`);
  if (before === failures) ok("signal (b) falls back to a real Baby Radar 'post' suggestion");
}

console.log("H-621: a caller-supplied radarTopicWithAngle still takes priority over the Radar fallback query");
{
  const before = failures;
  const db = recordingDb((n) => {
    if (n === 1) return [{ trigger_type: "post", n: 3 }];
    if (n === 2) {
      return [
        { trigger_type: "post", event_type: "published", content_draft_id: 1 },
        { trigger_type: "comment", event_type: "published", content_draft_id: 2 },
      ];
    }
    if (n === 5) return []; // journal — none
    // n === 6 (recentRadarTopic) should never be reached — the override short-circuits first
    if (n === 6) throw new Error("recentRadarTopic queried even though a caller override was supplied");
    return [];
  });
  const r = await detectPostTrigger(db, 1, {
    radarTopicWithAngle: { topic: "climate tech", sessionReference: "session 4" },
  });
  if (!r.fires || r.signal !== "b" || !r.triggerSource?.includes("climate tech")) {
    fail(`expected the supplied override to win, got fires=${r.fires} signal=${r.signal} source=${r.triggerSource}`);
  }
  if (before === failures) ok("caller-supplied radarTopicWithAngle still takes priority");
}

console.log("H-622: article is blocked below Stage 3 (fewer than 3 posts)");
{
  const before = failures;
  const db = recordingDb(() => []); // zero activity -> Stage 1
  const r = await detectArticleTrigger(db, 1);
  if (r.fires) fail(`expected no fire below Stage 3, got signal=${r.signal}`);
  if (before === failures) ok("article correctly blocked below Stage 3");
}

console.log("H-622: an explicit request reaches Stage 3 and fires on its own, honored regardless of history");
{
  const before = failures;
  const db = recordingDb(() => []); // zero activity — the request itself must carry the student to Stage 3
  const r = await detectArticleTrigger(db, 1, { explicitRequest: true });
  if (!r.fires || r.signal !== "explicit") fail(`expected explicit signal, got fires=${r.fires} signal=${r.signal}`);
  if (before === failures) ok("explicit request reaches Stage 3 and fires on its own");
}

console.log("H-622 signal (c): topic depth across sessions fires once Stage 3 is reached");
{
  const before = failures;
  const db = recordingDb((n) => {
    if (n === 1) return [{ trigger_type: "post", n: 3 }];
    if (n === 2) {
      return [
        { trigger_type: "post", event_type: "published", content_draft_id: 1 },
        { trigger_type: "comment", event_type: "published", content_draft_id: 2 },
      ]; // -> established comfort -> Stage 3
    }
    return [];
  });
  const r = await detectArticleTrigger(db, 1, { topicDepthAcrossSessions: true });
  if (!r.fires || r.signal !== "c") fail(`expected signal c, got fires=${r.fires} signal=${r.signal}`);
  if (before === failures) ok("signal (c) fires on caller-supplied topic depth, once gated Stage 3 is reached");
}

console.log("H-622 signal (e): a real Baby Radar 'post' suggestion fires when (c) and (d) are absent");
{
  const before = failures;
  const genIso = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
  const db = recordingDb((n) => {
    if (n === 1) return [{ trigger_type: "post", n: 3 }];
    if (n === 2) {
      return [
        { trigger_type: "post", event_type: "published", content_draft_id: 1 },
        { trigger_type: "comment", event_type: "published", content_draft_id: 2 },
      ];
    }
    if (n === 3) {
      return [{ topic: "personal branding for founders", why_relevant: "ties to 3 recent sessions", generated_at: genIso }];
    }
    return [];
  });
  const r = await detectArticleTrigger(db, 1);
  if (!r.fires || r.signal !== "e") fail(`expected signal e, got fires=${r.fires} signal=${r.signal}`);
  if (r.fires && !r.triggerSource?.includes("personal branding for founders")) {
    fail(`expected triggerSource to name the Radar topic, got ${r.triggerSource}`);
  }
  if (before === failures) ok("signal (e) fires from a real Baby Radar 'post' suggestion");
}

console.log("H-622: nothing fires at Stage 3 when no signal is present");
{
  const before = failures;
  const db = recordingDb((n) => {
    if (n === 1) return [{ trigger_type: "post", n: 3 }];
    if (n === 2) {
      return [
        { trigger_type: "post", event_type: "published", content_draft_id: 1 },
        { trigger_type: "comment", event_type: "published", content_draft_id: 2 },
      ];
    }
    return []; // recentRadarTopic — nothing available either
  });
  const r = await detectArticleTrigger(db, 1);
  if (r.fires) fail(`expected no signal, got fires=true signal=${r.signal}`);
  if (before === failures) ok("no false positive at Stage 3 when nothing qualifies");
}

console.log(`\n${failures} failures\n`);
if (failures > 0) process.exit(1);
