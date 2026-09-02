/**
 * H-626's progression stages, against a recording mock of `content_activity_log`
 * and `behavioralContentComfort`'s own query.
 *
 * Run:  npx tsx server/wing/content-progression.test.ts
 *
 * ── WHAT IS WORTH TESTING HERE ────────────────────────────────────────────
 * `content-cadence.test.ts` proves the pure timing logic. This proves the two
 * things that only exist once counts come back from a database:
 *
 *   1. **Stage 3 needs BOTH conditions, not either.** 3+ posts without
 *      demonstrated comfort must NOT reach Stage 3 — that's exactly the kind
 *      of silent over-eager progression IG-M6-03 exists to prevent.
 *   2. **The regression rule narrows what's offered without changing the
 *      computed stage.** A student stays "Stage 3" on paper while post/article
 *      suggestions are suppressed — collapsing those into one number would
 *      lose the distinction H-626 itself draws ("this is not a punishment").
 *
 * Uses the same `recordingDb` shape `prompt-log-store.test.ts` and
 * `safety-hold-store.test.ts` already use — two queries per call
 * (`content_activity_log` counts, then `behavioralContentComfort`'s own
 * 90-day read), so `rowsFor(n)` branches on call order.
 */
import { contentProgressionStage, contentTypeAllowed } from "./content-progression";

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

console.log("\ncontent-progression\n");

console.log("A new student with no activity is Stage 1, comments only");
{
  const before = failures;
  const db = recordingDb(() => []);
  const r = await contentProgressionStage(db, 1);
  if (r.stage !== 1) fail(`expected stage 1, got ${r.stage}`);
  if (!contentTypeAllowed(r, "comment")) fail("comment should be allowed at Stage 1");
  if (contentTypeAllowed(r, "post")) fail("post should NOT be allowed at Stage 1");
  if (before === failures) ok("Stage 1, comments only");
}

console.log("3+ published comments reaches Stage 2 (posts and comments)");
{
  const before = failures;
  const db = recordingDb((n) =>
    n === 1 ? [{ trigger_type: "comment", n: 3 }] : [],
  );
  const r = await contentProgressionStage(db, 1);
  if (r.stage !== 2) fail(`expected stage 2, got ${r.stage}`);
  if (!contentTypeAllowed(r, "post")) fail("post should be allowed at Stage 2");
  if (contentTypeAllowed(r, "article")) fail("article should NOT be allowed at Stage 2");
  if (before === failures) ok("Stage 2 from comment count");
}

console.log("3+ published posts WITHOUT demonstrated comfort holds at Stage 2, not 3");
{
  const before = failures;
  const db = recordingDb((n) => {
    if (n === 1) return [{ trigger_type: "post", n: 3 }];
    // behavioralContentComfort's own query: one published post, one trigger type
    // -> "emerging" (not established/confident), by content-progression's own
    // reading of behavioral-content-comfort.ts's thresholds.
    return [{ trigger_type: "post", event_type: "published", content_draft_id: 1 }];
  });
  const r = await contentProgressionStage(db, 1);
  if (r.stage === 3) fail(`Stage 3 reached without demonstrated comfort (comfort="${r.comfort}")`);
  if (contentTypeAllowed(r, "article")) fail("article should NOT be allowed without demonstrated comfort");
  if (before === failures) ok(`held at Stage ${r.stage}, comfort="${r.comfort}"`);
}

console.log("3+ published posts WITH established comfort reaches Stage 3");
{
  const before = failures;
  const db = recordingDb((n) => {
    if (n === 1) return [{ trigger_type: "post", n: 3 }];
    // Two distinct published trigger types -> "established" per
    // behavioral-content-comfort.ts's own thresholds.
    return [
      { trigger_type: "post", event_type: "published", content_draft_id: 1 },
      { trigger_type: "comment", event_type: "published", content_draft_id: 2 },
    ];
  });
  const r = await contentProgressionStage(db, 1);
  if (r.stage !== 3) fail(`expected stage 3, got ${r.stage} (comfort="${r.comfort}")`);
  if (!contentTypeAllowed(r, "article")) fail("article should be allowed at Stage 3");
  if (before === failures) ok("Stage 3 reached with established comfort");
}

console.log("an explicit article request is honored regardless of computed stage");
{
  const before = failures;
  const db = recordingDb(() => []);
  const r = await contentProgressionStage(db, 1, { explicitlyRequestedType: "article" });
  if (r.stage !== 3) fail(`expected stage 3 from explicit request, got ${r.stage}`);
  if (before === failures) ok("explicit request honored");
}

console.log("the regression rule narrows what's offered without changing the stage");
{
  const before = failures;
  const db = recordingDb((n) => {
    if (n === 1) return [{ trigger_type: "post", n: 3 }];
    return [
      { trigger_type: "post", event_type: "published", content_draft_id: 1 },
      { trigger_type: "comment", event_type: "published", content_draft_id: 2 },
    ];
  });
  const r = await contentProgressionStage(db, 1, { recentNegativePostExperience: true });
  if (r.stage !== 3) fail(`stage should stay 3 (not a punishment), got ${r.stage}`);
  if (!r.postSuggestionsSuppressedByRegression) fail("regression flag should be set");
  if (contentTypeAllowed(r, "post")) fail("post should be suppressed by the regression rule");
  if (contentTypeAllowed(r, "article")) fail("article should be suppressed by the regression rule");
  if (!contentTypeAllowed(r, "comment")) fail("comment should still be allowed during regression suppression");
  if (before === failures) ok("stage held at 3, post/article suppressed, comment still allowed");
}

console.log(`\n${failures} failures\n`);
if (failures > 0) process.exit(1);
