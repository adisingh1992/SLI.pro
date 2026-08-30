/**
 * IG-UX06 — module messaging adapts to what Wing knows.
 *
 * Her success criterion is a negative one — "No user who has completed Foundation sessions
 * ever receives a generic, context-free module introduction" — so the central test is an
 * enumeration over every combination of what Wing might hold, asserting that a specific is
 * named whenever there is one to name. A sample cannot establish "ever".
 *
 * The rest check the things a context-aware opening can get wrong in ways that read fine:
 * quoting the student without saying where it came from, quoting them at a length nobody
 * writes, claiming context on a fresh account, or apologising to someone with nothing to
 * apologise for.
 */
import {
  UNREADABLE_PRIOR_WORK,
  accumulationLevel,
  approximately,
  citedFacts,
  contextOpening,
  excerpt,
  foundationOpening,
  type KnownFact,
  type WingKnows,
} from "@shared/session-opening";
import { FOUNDATION_SEQUENCE, type FoundationNumber } from "@shared/session-access";

let failed = 0;
function check(label: string, ok: boolean, detail: string) {
  if (ok) console.log(`  ok — ${detail}`);
  else {
    failed++;
    console.log(`  FAIL — ${label}: ${detail}`);
  }
}

const fact = (value: string, sourceSession: FoundationNumber, daysAgo: number | null = 3): KnownFact => ({
  value,
  sourceSession,
  daysAgo,
});

const FN = fact("Marketing", 1, 30);
const EV = fact("rebuilt the onboarding funnel and cut drop-off by a third", 2, 5);
const ST = fact("The launch nobody wanted", 3, 0);

const base: WingKnows = {
  hasResume: false,
  hasLinkedIn: false,
  completed: [],
  fn: null,
  evidence: null,
  story: null,
  unreadablePriorWork: false,
};

const k = (over: Partial<WingKnows>): WingKnows => ({ ...base, ...over });

/** Every combination of the three citable facts, the two documents, and completion. */
function everyState(): WingKnows[] {
  const out: WingKnows[] = [];
  for (const fn of [null, FN])
    for (const evidence of [null, EV])
      for (const story of [null, ST])
        for (const hasResume of [false, true])
          for (const hasLinkedIn of [false, true])
            for (let mask = 0; mask < 8; mask++) {
              out.push({
                fn,
                evidence,
                story,
                hasResume,
                hasLinkedIn,
                completed: FOUNDATION_SEQUENCE.filter((_, i) => mask & (1 << i)),
                unreadablePriorWork: false,
              });
            }
  return out;
}

console.log("\nsession opening — IG-UX06\n");

/* ─────────────────────────────────────────────────────────────────────────
 * 1. Her success criterion, enumerated.
 *
 * "Every post-Foundation module opening references at least one specific element from the
 * user's prior work." The converse matters as much: a student Wing knows nothing about
 * must NOT be told that it remembers them.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("A specific is named whenever there is one, and never when there is not");
{
  const bad: string[] = [];
  let referenced = 0;
  let generic = 0;

  for (const state of everyState()) {
    const known = [state.fn, state.evidence, state.story].filter(Boolean) as KnownFact[];
    for (const n of FOUNDATION_SEQUENCE) {
      const context = contextOpening(n, state);

      if (known.length) {
        if (!context) { bad.push(`session ${n}: ${known.length} known, no context line`); continue; }
        /* The specific has to be IN the message, not merely available. */
        const named = known.some((f) => context.includes(f.value) || context.includes(excerpt(f.value)));
        if (!named) bad.push(`session ${n}: context names none of the ${known.length} known — "${context}"`);
        else referenced++;
      } else if (state.hasResume && state.hasLinkedIn) {
        if (!context) bad.push(`session ${n}: both documents held, no context line`);
      } else {
        generic++;
        if (context) bad.push(`session ${n}: context claimed with nothing known — "${context}"`);
      }
    }
  }
  check(
    "specificity",
    bad.length === 0,
    bad.length === 0
      ? `${referenced} openings naming a specific, ${generic} correctly generic`
      : bad.slice(0, 3).join("; "),
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * 2. Provenance on every citation.
 *
 * "citing the specific module and approximate timing (H-002 universal provenance gate)".
 * A quote of the student's words with no source is the thing H-002 exists to prevent.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nEvery citation says where it came from, and roughly when");
{
  const bad: string[] = [];
  let cited = 0;

  for (const state of everyState()) {
    if (!state.fn && !state.evidence && !state.story) continue;
    for (const n of FOUNDATION_SEQUENCE) {
      const context = contextOpening(n, state);
      if (!context) continue;
      const facts = citedFacts(n, state);
      for (const { fact: f } of facts) {
        cited++;
        if (!context.includes(`Session ${f.sourceSession}`)) {
          bad.push(`session ${n}: cites a fact from ${f.sourceSession} without naming it`);
        }
        const when = approximately(f.daysAgo);
        if (when && !context.includes(when)) {
          bad.push(`session ${n}: timing "${when}" known but not said`);
        }
      }
    }
  }
  check("provenance", bad.length === 0, bad.length === 0 ? `${cited} citations, all sourced and timed` : bad.slice(0, 3).join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 3. Each session opens on what it builds on.
 *
 * Her Module 4 example cites the function and the evidence — that module's inputs. So when
 * a session's own inputs are available they lead. A session may still cite its own past
 * output when nothing else is there, which is a revisit and is recognition, not confusion.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nEach session opens on its inputs, at most two of them");
{
  const OWN_OUTPUT: Record<FoundationNumber, "fn" | "evidence" | "story"> = {
    1: "fn",
    2: "evidence",
    3: "story",
  };
  const bad: string[] = [];

  for (const state of everyState()) {
    for (const n of FOUNDATION_SEQUENCE) {
      const cites = citedFacts(n, state);
      if (cites.length > 2) bad.push(`session ${n}: ${cites.length} facts cited`);

      const inputs = cites.filter((c) => c.key !== OWN_OUTPUT[n]);
      const own = cites.filter((c) => c.key === OWN_OUTPUT[n]);
      /* An input must never be displaced by this session's own output. */
      if (own.length && inputs.length) {
        const firstOwn = cites.findIndex((c) => c.key === OWN_OUTPUT[n]);
        const lastInput = cites.map((c) => c.key !== OWN_OUTPUT[n]).lastIndexOf(true);
        if (firstOwn < lastInput) bad.push(`session ${n}: own output cited above an input`);
      }
      /* Nothing is cited that Wing does not hold. */
      for (const c of cites) {
        if (state[c.key] !== c.fact) bad.push(`session ${n}: cited a ${c.key} Wing does not hold`);
      }
    }
  }
  check("ordering", bad.length === 0, bad.length === 0 ? "inputs lead, own output never displaces one, never more than two" : bad.slice(0, 3).join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 4. The accumulation level is her table's.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe accumulation level follows her table");
{
  const cases: Array<[string, WingKnows, string]> = [
    ["fresh account", base, "nothing"],
    ["resume only", k({ hasResume: true }), "nothing"],
    ["linkedin only", k({ hasLinkedIn: true }), "nothing"],
    ["both documents", k({ hasResume: true, hasLinkedIn: true }), "documents"],
    ["function known", k({ fn: FN }), "foundation_1"],
    ["function and evidence", k({ fn: FN, evidence: EV }), "foundation_1"],
    ["all three", k({ fn: FN, evidence: EV, story: ST }), "foundation_complete"],
    ["story only, out of order", k({ story: ST }), "foundation_1"],
  ];
  const bad = cases
    .filter(([, state, expected]) => accumulationLevel(state) !== expected)
    .map(([name, state, expected]) => `${name}: expected ${expected}, got ${accumulationLevel(state)}`);
  check("levels", bad.length === 0, bad.length === 0 ? `${cases.length} states on her table` : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 5. Her failure path, verbatim, and nothing claimed alongside it.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nUnreadable prior work gets her sentence and no claims beside it");
{
  const bad: string[] = [];
  for (const n of FOUNDATION_SEQUENCE) {
    /* Even with facts present — the flag means the record is not trustworthy. */
    const context = contextOpening(n, k({ unreadablePriorWork: true, fn: FN, evidence: EV, completed: [1, 2] }));
    if (context !== UNREADABLE_PRIOR_WORK) bad.push(`session ${n}: got "${context}"`);
    if (context?.includes("Marketing")) bad.push(`session ${n}: claimed a fact anyway`);
  }
  const sentence = UNREADABLE_PRIOR_WORK;
  if (!sentence.includes("I should know more about you from our prior work")) {
    bad.push("her wording has drifted");
  }
  check("failure path", bad.length === 0, bad.length === 0 ? "her acknowledgment, alone, on all three" : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 6. Timing is approximate and never inverted.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nTiming is approximate, ordered, and silent when unknown");
{
  const bad: string[] = [];
  if (approximately(null) !== "") bad.push("null produced a phrase");
  if (approximately(-1) !== "") bad.push("a negative age produced a phrase");
  if (approximately(NaN) !== "") bad.push("NaN produced a phrase");

  const seen: string[] = [];
  for (let d = 0; d <= 400; d++) {
    const phrase = approximately(d);
    if (!phrase) { bad.push(`day ${d} produced nothing`); break; }
    if (/\d/.test(phrase)) bad.push(`day ${d} produced a number: "${phrase}"`);
    if (seen[seen.length - 1] !== phrase) seen.push(phrase);
  }
  /* Monotonic: each phrase appears in one contiguous run, so time never reads backwards. */
  if (new Set(seen).size !== seen.length) bad.push(`phrases repeat out of order: ${seen.join(" → ")}`);

  check("timing", bad.length === 0, bad.length === 0 ? `${seen.length} bands, monotonic, no digits` : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 7. Their words are quoted whole, or cut and marked.
 *
 * The value is presented as the student's own wording, so shortening it silently would put
 * a sentence in their mouth they did not write.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nQuotes are whole, or visibly cut");
{
  const bad: string[] = [];
  const short = "cut drop-off by a third";
  if (excerpt(short) !== short) bad.push(`a short quote was altered: "${excerpt(short)}"`);

  const long = "rebuilt the onboarding funnel end to end ".repeat(12);
  const cutd = excerpt(long);
  if (!cutd.endsWith("…")) bad.push("a cut quote is not marked");
  if (cutd.length > 130) bad.push(`a cut quote is still ${cutd.length} characters`);
  if (!long.replace(/\s+/g, " ").startsWith(cutd.slice(0, -1))) bad.push("the excerpt is not a prefix of their words");

  /* Whitespace is normalised, never words. */
  if (excerpt("  two   spaces  ") !== "two spaces") bad.push(`whitespace handling: "${excerpt("  two   spaces  ")}"`);

  check("quoting", bad.length === 0, bad.length === 0 ? "short quotes untouched, long ones cut at a word and marked" : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 8. IG-U005 and IG-UX03 on everything this file can emit.
 *
 * The opening is user-facing text assembled from methodology-derived values, which is
 * exactly where internal vocabulary leaks, and it is read by every student every session.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nNo internal vocabulary and no completion language reaches the student");
{
  const METHODOLOGY = /\bheuristic|signal condition|intervention type|coaching move|delivery adaptation|failure path|population tag|sequence weight|\bartifact\b|\bgate\b|accumulation level/i;
  const COMPLETION = /\bcomplete[sd]?\b|\bprogress\b|\b\d+\s*of\s*\d+\b|\bunlock/i;

  const bad: string[] = [];
  let scanned = 0;
  for (const state of everyState().slice(0, 400)) {
    for (const n of FOUNDATION_SEQUENCE) {
      for (const guidance of ["Let's get started.", null]) {
        const opening = foundationOpening(n, state, guidance);
        scanned++;
        if (METHODOLOGY.test(opening)) bad.push(`session ${n}: internal vocabulary — "${opening.slice(0, 80)}"`);
        if (COMPLETION.test(opening)) bad.push(`session ${n}: completion language — "${opening.slice(0, 80)}"`);
      }
    }
  }
  const unreadable = foundationOpening(1, k({ unreadablePriorWork: true }), null);
  if (METHODOLOGY.test(unreadable) || COMPLETION.test(unreadable)) bad.push("the acknowledgment sentence trips a rule");

  check("vocabulary", bad.length === 0, bad.length === 0 ? `${scanned} openings, clean` : bad.slice(0, 2).join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 9. Recognition, then the gap, then what happens next.
 *
 * Reversed, the message opens by apologising and closes by claiming to remember them.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nWhat Wing knows comes before what Wing lacks");
{
  const state = k({ story: ST, completed: [3] });
  const opening = foundationOpening(2, state, "Session 2 is about evidence.");

  const iContext = opening.indexOf("strongest story");
  const iGap = opening.indexOf("don't have");
  const iGuidance = opening.indexOf("Session 2 is about evidence.");

  const ok = iContext >= 0 && iGap > iContext && iGuidance > iGap;
  check("order", ok, ok ? "context, then the gap, then the session" : `context=${iContext} gap=${iGap} guidance=${iGuidance}`);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 10. The static opener is kept, not replaced.
 *
 * It carries what the session IS, which no context line says. Dropping it at higher
 * accumulation levels would leave a student who is well known with a greeting and no idea
 * what they just opened.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe session's own opener survives at every level");
{
  const guidance = "This session works out which stories prove your claim.";
  const bad: string[] = [];
  for (const state of [base, k({ hasResume: true, hasLinkedIn: true }), k({ fn: FN }), k({ fn: FN, evidence: EV, story: ST })]) {
    for (const n of FOUNDATION_SEQUENCE) {
      if (!foundationOpening(n, state, guidance).includes(guidance)) {
        bad.push(`${accumulationLevel(state)} / session ${n}: opener dropped`);
      }
    }
  }
  check("opener", bad.length === 0, bad.length === 0 ? "kept at all four levels" : bad.join("; "));
}

console.log(failed === 0 ? "\nall passed\n" : `\n${failed} failed\n`);
if (failed > 0) process.exit(1);
