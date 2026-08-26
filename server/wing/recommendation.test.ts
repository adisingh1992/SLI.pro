/**
 * IG-UX02 — one recommendation, not a menu.
 *
 * The gate's success criteria are three claims about behaviour, so each one gets a test
 * that fails if the claim stops being true:
 *
 *   "always shows exactly one"      → enumerated over every reachable state, not sampled
 *   "changes based on context"      → distinct reasons, no shared keys
 *   "never twice in a row"          → rotates where there is a choice, repeats where not
 *
 * Plus the one her card does not state and the product does: a recommendation must point
 * at something the student can actually click. Every `navLabel` is checked against the
 * dashboard file itself, so a renamed sidebar label breaks the test rather than silently
 * turning the recommendation into a dead button.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { eligibleActions, recommend, type RecommendationState } from "@shared/recommendation";

let failed = 0;
function check(label: string, ok: boolean, detail: string) {
  if (ok) {
    console.log(`  ok — ${detail}`);
  } else {
    failed++;
    console.log(`  FAIL — ${label}: ${detail}`);
  }
}

const base: RecommendationState = {
  intakeComplete: false,
  hasResume: false,
  hasLinkedIn: false,
  foundationSessionsBuilt: 0,
  hasBrandReport: false,
  sliOptionsReady: false,
  sliChosen: false,
  linkedinOptimised: false,
  openHomework: 0,
};

const s = (over: Partial<RecommendationState>): RecommendationState => ({ ...base, ...over });

console.log("\nrecommendation — IG-UX02\n");

/* ─────────────────────────────────────────────────────────────────────────
 * 1. The order is the app's order.
 *
 * These are not arbitrary fixtures. Each one is a state the client's own gates make
 * reachable, and the expected key is what the student is actually permitted to do there.
 * The `documents` cases are the ones a first draft of the rule table got wrong: it
 * recommended Foundation 1 while the sessions were locked behind an unuploaded resume.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("The recommendation follows the sequence the product enforces");
{
  const cases: Array<[string, RecommendationState, string]> = [
    ["nothing done", base, "intake"],
    ["intake done, no documents", s({ intakeComplete: true }), "documents"],
    ["resume only — sessions still locked", s({ intakeComplete: true, hasResume: true }), "documents"],
    ["linkedin only — sessions still locked", s({ intakeComplete: true, hasLinkedIn: true }), "documents"],
    ["documents in", s({ intakeComplete: true, hasResume: true, hasLinkedIn: true }), "foundation_1"],
    ["session 1 built", s({ intakeComplete: true, hasResume: true, hasLinkedIn: true, foundationSessionsBuilt: 1 }), "foundation_2"],
    ["session 2 built", s({ intakeComplete: true, hasResume: true, hasLinkedIn: true, foundationSessionsBuilt: 2 }), "foundation_3"],
    ["foundation done", s({ intakeComplete: true, hasResume: true, hasLinkedIn: true, foundationSessionsBuilt: 3 }), "brand_report"],
    [
      "foundation done, homework open",
      s({ intakeComplete: true, hasResume: true, hasLinkedIn: true, foundationSessionsBuilt: 3, openHomework: 2 }),
      "homework",
    ],
    [
      "report in, coach has generated options",
      s({ intakeComplete: true, hasResume: true, hasLinkedIn: true, foundationSessionsBuilt: 3, hasBrandReport: true, sliOptionsReady: true }),
      "sli",
    ],
    [
      "report in, coach has NOT generated options",
      s({ intakeComplete: true, hasResume: true, hasLinkedIn: true, foundationSessionsBuilt: 3, hasBrandReport: true }),
      "coaching_call",
    ],
    [
      "sli chosen",
      s({ intakeComplete: true, hasResume: true, hasLinkedIn: true, foundationSessionsBuilt: 3, hasBrandReport: true, sliOptionsReady: true, sliChosen: true }),
      "linkedin",
    ],
    [
      "linkedin aligned",
      s({ intakeComplete: true, hasResume: true, hasLinkedIn: true, foundationSessionsBuilt: 3, hasBrandReport: true, sliOptionsReady: true, sliChosen: true, linkedinOptimised: true }),
      "content",
    ],
  ];

  let wrong: string[] = [];
  for (const [name, state, expected] of cases) {
    const got = recommend(state).key;
    if (got !== expected) wrong.push(`${name}: expected ${expected}, got ${got}`);
  }
  check("sequence", wrong.length === 0, wrong.length === 0 ? `${cases.length} states, each pointing at the one thing it can do` : wrong.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 2. Her three elements, on every recommendation the table can produce.
 *
 * `minutes` is permitted to be null and that is checked separately below, because it is
 * a known, listed omission rather than a thing to assert away.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nEvery recommendation has an action and a reason about this student");
{
  const all = eligibleActions(
    s({ intakeComplete: true, hasResume: true, hasLinkedIn: true, foundationSessionsBuilt: 3, hasBrandReport: true, sliOptionsReady: true, sliChosen: true, openHomework: 1 }),
  ).concat(
    eligibleActions(base),
    eligibleActions(s({ intakeComplete: true })),
    eligibleActions(s({ intakeComplete: true, hasResume: true, hasLinkedIn: true, foundationSessionsBuilt: 1 })),
    eligibleActions(s({ intakeComplete: true, hasResume: true, hasLinkedIn: true, foundationSessionsBuilt: 2 })),
  );

  const bad: string[] = [];
  for (const r of all) {
    if (!r.action.trim()) bad.push(`${r.key}: no action`);
    if (!r.why.trim()) bad.push(`${r.key}: no reason`);
    /* Her card rules out the generic acknowledgment by name; the same applies to a reason
       that describes the feature instead of the student. Every reason must be about them. */
    if (!/\byou\b|\byour\b|\bwing\b/i.test(r.why)) bad.push(`${r.key}: reason is not about them — "${r.why}"`);
    if (r.minutes !== null && !/\d/.test(r.minutes)) bad.push(`${r.key}: minutes with no number — "${r.minutes}"`);
  }
  check("elements", bad.length === 0, bad.length === 0 ? `${all.length} recommendations, every one an action plus a reason about them` : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 3. Durations are quoted, never estimated.
 *
 * The three that carry a number must carry the number the product already shows. If
 * someone edits the copy on one surface, this fails rather than letting Wing quote a
 * duration no screen agrees with.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nEvery stated duration is one the product already states");
{
  const quoted: Array<[string, RecommendationState, string]> = [
    ["intake", base, "5"],
    ["foundation_1", s({ intakeComplete: true, hasResume: true, hasLinkedIn: true }), "7-9"],
    ["foundation_2", s({ intakeComplete: true, hasResume: true, hasLinkedIn: true, foundationSessionsBuilt: 1 }), "8-10"],
    ["foundation_3", s({ intakeComplete: true, hasResume: true, hasLinkedIn: true, foundationSessionsBuilt: 2 }), "9-10"],
    ["coaching_call", s({ intakeComplete: true, hasResume: true, hasLinkedIn: true, foundationSessionsBuilt: 3, hasBrandReport: true }), "30"],
  ];
  const bad: string[] = [];
  for (const [key, state, figure] of quoted) {
    const r = recommend(state);
    if (r.key !== key) { bad.push(`${key}: state resolved to ${r.key}`); continue; }
    if (!r.minutes || !r.minutes.includes(figure)) bad.push(`${key}: expected ${figure}, got ${r.minutes}`);
  }
  /*
   * And the split itself, so a new rule cannot quietly arrive with an invented figure.
   *
   * Collected over the whole state space rather than a handful of fixtures: the first
   * version of this check sampled six states, reached only nine of the eleven rules, and
   * reported the split as 5/4. A count assertion built on a sample counts the sample.
   */
  const byKey = new Map<string, ReturnType<typeof recommend>>();
  {
    const bools = [false, true];
    for (const intakeComplete of bools)
      for (const hasResume of bools)
        for (const hasLinkedIn of bools)
          for (const foundationSessionsBuilt of [0, 1, 2, 3])
            for (const hasBrandReport of bools)
              for (const sliOptionsReady of bools)
                for (const sliChosen of bools)
                  for (const linkedinOptimised of bools)
                    for (const openHomework of [0, 1, 2])
                      for (const r of eligibleActions({
                        intakeComplete, hasResume, hasLinkedIn, foundationSessionsBuilt,
                        hasBrandReport, sliOptionsReady, sliChosen, linkedinOptimised, openHomework,
                      })) {
                        if (!byKey.has(r.key)) byKey.set(r.key, r);
                      }
  }
  const quotedCount = Array.from(byKey.values()).filter((r) => r.minutes !== null).length;
  const nullCount = Array.from(byKey.values()).filter((r) => r.minutes === null).length;
  if (byKey.size !== 11 || quotedCount !== 5 || nullCount !== 6) {
    bad.push(`split changed: ${byKey.size} rules, ${quotedCount} quoted, ${nullCount} null (expected 11/5/6)`);
  }

  check(
    "durations",
    bad.length === 0,
    bad.length === 0
      ? "5 quoted figures matching what the product shows, 6 honestly null"
      : bad.join("; "),
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * 4. No-repeat, on both sides of the conflict in her card.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nNo-repeat applies only where there is a real second choice");
{
  const linear = s({ intakeComplete: true, hasResume: true, hasLinkedIn: true });
  const repeats = recommend(linear, "foundation_1").key === "foundation_1";

  const several = s({
    intakeComplete: true, hasResume: true, hasLinkedIn: true, foundationSessionsBuilt: 3,
    hasBrandReport: true, sliOptionsReady: true, sliChosen: true, openHomework: 1,
  });
  const options = eligibleActions(several);
  const first = recommend(several).key;
  const second = recommend(several, first).key;

  check(
    "no-repeat",
    repeats && options.length > 1 && second !== first,
    repeats && second !== first
      ? `repeats on the linear path, rotates off ${first} when ${options.length} are eligible`
      : `repeats=${repeats}, eligible=${options.length}, ${first} → ${second}`,
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * 5. It reads as an opinion, not a rotation of the same sentence.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe reasons are distinct, so the recommendation reads as an opinion");
{
  const all = eligibleActions(
    s({ intakeComplete: true, hasResume: true, hasLinkedIn: true, foundationSessionsBuilt: 3, hasBrandReport: true, sliOptionsReady: true, sliChosen: true, openHomework: 1 }),
  );
  const whys = new Set(all.map((r) => r.why));
  const keys = new Set(all.map((r) => r.key));
  check(
    "distinct",
    whys.size === all.length && keys.size === all.length,
    `${all.length} eligible, ${whys.size} distinct reasons, ${keys.size} distinct keys`,
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * 6. "Always exactly one" — enumerated, not sampled.
 *
 * The earlier version of this test checked eight hand-written states, and a mutation that
 * made `recommend` return the fallback passed it. So this walks the whole state space.
 * It also proves the fallback branch is unreachable, which is why that branch carries a
 * comment saying so rather than a test pretending to exercise it.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nEvery reachable state yields exactly one — enumerated, not sampled");
{
  let n = 0;
  let empty = 0;
  const bools = [false, true];
  for (const intakeComplete of bools)
    for (const hasResume of bools)
      for (const hasLinkedIn of bools)
        for (const foundationSessionsBuilt of [0, 1, 2, 3])
          for (const hasBrandReport of bools)
            for (const sliOptionsReady of bools)
              for (const sliChosen of bools)
                for (const linkedinOptimised of bools)
                  for (const openHomework of [0, 1, 2]) {
                    const state: RecommendationState = {
                      intakeComplete, hasResume, hasLinkedIn, foundationSessionsBuilt,
                      hasBrandReport, sliOptionsReady, sliChosen, linkedinOptimised, openHomework,
                    };
                    n++;
                    if (!eligibleActions(state).length) empty++;
                    const r = recommend(state);
                    if (!r || !r.action) {
                      failed++;
                      console.log(`  FAIL — no recommendation for ${JSON.stringify(state)}`);
                    }
                  }
  check(
    "exhaustive",
    empty === 0,
    empty === 0
      ? `${n} states, all yield one, fallback provably unreached`
      : `${empty} of ${n} states have no eligible action — the fallback is now live`,
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * 7. Every recommendation points at something the dashboard can dispatch.
 *
 * Read off the file rather than duplicated here. A recommendation whose label the
 * dispatcher does not know is a button that silently does nothing, and that is the one
 * failure mode this gate can produce that looks like a broken product rather than a
 * missing feature.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nEvery recommendation points at something the dashboard dispatches");
{
  const dashboard = readFileSync(
    join(process.cwd(), "client", "src", "pages", "new-dashboard.tsx"),
    "utf8",
  );
  /* `handleNavItemClick` is the single dispatcher, and it branches on the label string. */
  const start = dashboard.indexOf("const handleNavItemClick");
  const end = dashboard.indexOf("const handleSessionClick", start);
  const dispatcher = start >= 0 && end > start ? dashboard.slice(start, end) : "";

  /*
   * Enumerated, for the same reason the duration split is: a sampled set of states reaches
   * nine of the eleven labels, and a check that only sees nine cannot fail on the other
   * two. Every label the rule table can ever emit is checked against the dispatcher.
   */
  const everyLabel = new Set<string>();
  {
    const bools = [false, true];
    for (const intakeComplete of bools)
      for (const hasResume of bools)
        for (const hasLinkedIn of bools)
          for (const foundationSessionsBuilt of [0, 1, 2, 3])
            for (const hasBrandReport of bools)
              for (const sliOptionsReady of bools)
                for (const sliChosen of bools)
                  for (const linkedinOptimised of bools)
                    for (const openHomework of [0, 1, 2])
                      for (const r of eligibleActions({
                        intakeComplete, hasResume, hasLinkedIn, foundationSessionsBuilt,
                        hasBrandReport, sliOptionsReady, sliChosen, linkedinOptimised, openHomework,
                      })) {
                        everyLabel.add(r.navLabel);
                      }
  }

  const missing: string[] = [];
  /* Array.from rather than iterating the Set directly: tsconfig sets no `target`, so
     output is ES5 and a for-of over an iterable is TS2802. */
  for (const label of Array.from(everyLabel)) {
    if (!dispatcher.includes(`"${label}"`)) missing.push(`${label} — not dispatched`);
    if (!dashboard.includes(`label: "${label}"`)) missing.push(`${label} — not a sidebar item`);
  }
  check(
    "dispatch",
    dispatcher.length > 0 && missing.length === 0,
    dispatcher.length === 0
      ? "could not find handleNavItemClick in new-dashboard.tsx"
      : missing.length === 0
        ? `all ${everyLabel.size} labels dispatch and exist in the sidebar`
        : missing.join("; "),
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * 8. No recommendation ever points at a locked screen.
 *
 * This is the invariant the rule table exists to satisfy, and it is restated here from the
 * client's own `locked` expressions rather than from the rules — so it is a second opinion
 * and not a paraphrase. Mutating either side breaks it.
 *
 * Transcribed from `buildSidebarSections` in new-dashboard.tsx, where
 *   canGenerateLinkedIn = isDocumentsComplete && (sliSelected || sliRefined) && hasFreshnessReport
 * and every Phase 3/4 item additionally carries `!areAllSessionsComplete`.
 *
 * Four rules failed this the first time it ran: foundation_2 and foundation_3 did not
 * require the documents, and linkedin and content required neither the documents nor a
 * finished Foundation. All four were reachable states pointing at a disabled button.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nNo recommendation ever points at a screen the client locks");
{
  const docs = (t: RecommendationState) => t.hasResume && t.hasLinkedIn;
  const allSessions = (t: RecommendationState) => t.foundationSessionsBuilt >= 3;
  const canGenerateLinkedIn = (t: RecommendationState) =>
    docs(t) && t.sliChosen && t.hasBrandReport;

  const UNLOCKED: Record<string, (t: RecommendationState) => boolean> = {
    "Professional Branding Assessment": () => true,
    "Document Vault": (t) => t.intakeComplete,
    "Functional Identity Mapping": (t) => docs(t),
    "Professional Credibility Assessment": (t) => docs(t) && t.foundationSessionsBuilt >= 1,
    "Positioning Story Development": (t) => docs(t) && t.foundationSessionsBuilt >= 2,
    "Assigned Homework": (t) => allSessions(t) && t.openHomework > 0,
    "Brand Intelligence Report": (t) => allSessions(t),
    "Single Lasting Impression": (t) => allSessions(t) && t.sliOptionsReady,
    "LinkedIn Optimization": (t) => allSessions(t) && canGenerateLinkedIn(t),
    "Strategic Content": (t) => allSessions(t) && canGenerateLinkedIn(t),
    "Schedule Coaching Call": (t) => allSessions(t),
  };

  const bad: string[] = [];
  let n = 0;
  const bools = [false, true];
  for (const intakeComplete of bools)
    for (const hasResume of bools)
      for (const hasLinkedIn of bools)
        for (const foundationSessionsBuilt of [0, 1, 2, 3])
          for (const hasBrandReport of bools)
            for (const sliOptionsReady of bools)
              for (const sliChosen of bools)
                for (const linkedinOptimised of bools)
                  for (const openHomework of [0, 1, 2]) {
                    const state: RecommendationState = {
                      intakeComplete, hasResume, hasLinkedIn, foundationSessionsBuilt,
                      hasBrandReport, sliOptionsReady, sliChosen, linkedinOptimised, openHomework,
                    };
                    n++;
                    /* Every eligible action, not just the winner: the no-repeat rule can
                       return the second one, so a locked runner-up is a live defect. */
                    for (const r of eligibleActions(state)) {
                      const open = UNLOCKED[r.navLabel];
                      if (!open) { bad.push(`${r.key}: no lock rule for "${r.navLabel}"`); continue; }
                      if (!open(state)) bad.push(`${r.key} → locked "${r.navLabel}" at ${JSON.stringify(state)}`);
                    }
                  }

  const uniq = Array.from(new Set(bad.map((b) => b.split(" at ")[0])));
  check(
    "locks",
    bad.length === 0,
    bad.length === 0
      ? `${n} states, no recommendation points at a locked screen`
      : `${uniq.length} rule(s) point at locked screens: ${uniq.slice(0, 4).join("; ")}`,
  );
}

console.log(failed === 0 ? "\nall passed\n" : `\n${failed} failed\n`);
if (failed > 0) process.exit(1);
