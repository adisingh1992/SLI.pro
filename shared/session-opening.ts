/**
 * IG-UX06 — module messaging adapts to what Wing knows.
 *
 * Pure. Imports only the access rules from `session-access`.
 *
 * ── HER GATE, QUOTED ─────────────────────────────────────────────────────
 * "Wing must NEVER deliver a generic module introduction when it has accumulated context.
 * Every module opening must reference what Wing already knows, using the user's own
 * language from prior sessions… The adaptation table from Part 2.5 (What Wing Knows)
 * governs what Wing references at each accumulation level. Wing should feel like it
 * remembers you, not like it's reading a script."
 *
 * Success: "No user who has completed Foundation sessions ever receives a generic,
 * context-free module introduction. Every post-Foundation module opening references at
 * least one specific element from the user's prior work."
 *
 * Delivery: "Scales with accumulated data, not with audience track. A new executive and a
 * new undergraduate both get minimal-context openings."
 *
 * Failure path: "If Wing cannot access prior session data for a returning user →
 * acknowledge the gap… Never pretend to know the user when the data isn't accessible."
 *
 * ── WHAT THE OPENING WAS ─────────────────────────────────────────────────
 * One static string per population, `getInitialGuidanceMessage(sessionNumber)`, written
 * into the transcript at session start. A student who had finished Foundation 1 and 2 and
 * opened Foundation 3 was greeted by copy written for someone Wing had never met — which
 * is the generic introduction her card rules out by name.
 *
 * The data was not missing. `buildPriorSessionContexts` already collected prior sessions
 * for prompt assembly on every TURN; it just never ran at the moment the opening was
 * written. So this gate is not new capability, it is the opening reading what the rest of
 * the session already reads.
 *
 * ── WHY THE LEVEL IS KEYED ON WHAT IS CITABLE, NOT ON WHAT IS FINISHED ───
 * Her table is keyed on completion ("Foundation 1 complete", "Foundation 1-3 complete"),
 * but her success criterion is about a REFERENCE: "references at least one specific
 * element from the user's prior work." A session can be finished and its record hold
 * nothing quotable. Keying on completion would then have Wing announce an accumulation
 * level it cannot back with a single specific — the failure her card's last line names.
 *
 * So the level is what Wing can actually cite, and a finished session whose record cannot
 * be read raises `unreadablePriorWork`, which gets her acknowledgment sentence verbatim.
 *
 * ── PROVENANCE IS NOT DECORATION ─────────────────────────────────────────
 * Her principle paragraph: "Once Wing knows something, it references it — by name, with
 * the user's own language, citing the specific module and approximate timing (H-002
 * universal provenance gate)." So every cited fact carries where it came from and roughly
 * when, and each fact carries its own timing rather than one timestamp for the message:
 * a student who did Session 1 in March and Session 2 last week is owed both.
 *
 * ── WHAT IS TIER 1 HERE ──────────────────────────────────────────────────
 * Her table has nine accumulation rows. Four are reachable in Tier 1 — Nothing, LinkedIn +
 * Resume, Foundation 1, Foundation 1-3. The other five (Module 6 content, Module 7 Radar,
 * Module 8 competencies, Module 9 power map, multiple Reveal Cycles) need substrate that
 * defers with their modules, and they are named in `AccumulationLevel` as a deliberate gap
 * rather than left for someone to discover the table was only half read.
 */
import { isFoundationNumber, outOfOrderNote, type FoundationNumber } from "./session-access";

/**
 * One thing Wing can say it knows, with where it came from and roughly when.
 *
 * `value` is the student's own wording wherever the record holds it — a proof bullet, a
 * story title. `sourceSession` and `daysAgo` are H-002's "specific module and approximate
 * timing", carried per fact rather than per message.
 */
export type KnownFact = {
  value: string;
  sourceSession: FoundationNumber;
  /** Null when the record does not say. The citation then omits the timing rather than guessing. */
  daysAgo: number | null;
};

/**
 * Everything Wing holds about this student that an opening may draw on.
 *
 * Assembled by the caller from the Foundation records; nothing here is inferred.
 */
export type WingKnows = {
  hasResume: boolean;
  hasLinkedIn: boolean;
  /** Which Foundation sessions are finished. Separate from what is citable — see above. */
  completed: readonly number[];
  /** Session 1's output: the function, named. */
  fn: KnownFact | null;
  /** Session 2's output: what their credibility rests on, in their words. */
  evidence: KnownFact | null;
  /** Session 3's output: their strongest story, in their words. */
  story: KnownFact | null;
  /**
   * True when a finished session's record could not be read. Her failure path: acknowledge
   * the gap, never pretend.
   */
  unreadablePriorWork: boolean;
};

/**
 * Her Part 2.5 rows. The five after `foundation_complete` are hers and are not reachable
 * yet; they are listed so the table is visibly whole and the gap is a decision.
 */
export type AccumulationLevel =
  | "nothing"
  | "documents"
  | "foundation_1"
  | "foundation_complete"
  /* Deferred with their modules — no substrate in Tier 1. */
  | "content_produced"
  | "radar_engaged"
  | "competency_mapped"
  | "power_mapped"
  | "multiple_reveals";

/**
 * Where this student sits on her table.
 *
 * `documents` requires BOTH, because that row's whole content is the cross-document
 * observation — "your LinkedIn leads with [title] but your resume shows [function]" — and
 * one document cannot produce it. A student holding one falls to `nothing` and gets the
 * warm generic opening, which is honest rather than thin. Whether she wants a row for the
 * single-document case is a question for her, not a row to invent.
 */
export function accumulationLevel(k: WingKnows): AccumulationLevel {
  if (k.fn && k.evidence && k.story) return "foundation_complete";
  if (k.fn || k.evidence || k.story) return "foundation_1";
  if (k.hasResume && k.hasLinkedIn) return "documents";
  return "nothing";
}

/** Roughly when, in the register a person uses. Never a date, never a false precision. */
export function approximately(daysAgo: number | null): string {
  if (daysAgo === null || !Number.isFinite(daysAgo) || daysAgo < 0) return "";
  if (daysAgo < 1) return "earlier today";
  if (daysAgo < 2) return "yesterday";
  if (daysAgo < 7) return "a few days ago";
  if (daysAgo < 14) return "last week";
  if (daysAgo < 28) return "a couple of weeks ago";
  if (daysAgo < 60) return "about a month ago";
  if (daysAgo < 120) return "a couple of months ago";
  return "a while back";
}

/**
 * What this session builds ON, in the order it should be cited.
 *
 * Not "everything Wing knows" — a session opening that recites the whole record reads as a
 * report. Her Module 4 example cites exactly two things, and they are the two that session
 * uses: the function from Session 1 and the evidence from Session 2.
 *
 * So each session cites its inputs, never its own output. Session 2 works out credibility,
 * so it opens on the function. Session 3 turns evidence into stories, so it opens on the
 * function and the evidence. Session 1 works out the function, so it cites the function at
 * nobody — it cites whatever a student who arrived out of order already has.
 */
const CITES: Readonly<Record<FoundationNumber, ReadonlyArray<FactKey>>> = {
  1: ["evidence", "story"],
  2: ["fn", "story"],
  3: ["fn", "evidence"],
};

/** At most this many facts in one opening. Her own example cites two. */
const MAX_CITED = 2;

/**
 * How much of the student's own wording fits in an opening sentence.
 *
 * A proof bullet can run to a paragraph, and a paragraph dropped into a greeting reads as
 * a database record being read back. Beyond this the quote is cut and MARKED with an
 * ellipsis, never silently: the value is presented as the student's own words, so shortening
 * it without saying so would be putting a sentence in their mouth that they did not write.
 */
const MAX_QUOTE = 120;

/** Their words, cut at a word boundary and marked when cut. */
export function excerpt(value: string): string {
  const v = value.trim().replace(/\s+/g, " ");
  if (v.length <= MAX_QUOTE) return v;
  const cut = v.slice(0, MAX_QUOTE);
  const at = cut.lastIndexOf(" ");
  return `${(at > 40 ? cut.slice(0, at) : cut).replace(/[,;:.\u2014-]+$/, "")}…`;
}

/**
 * The facts this opening will name, most relevant to this session first.
 *
 * Falls through to anything else Wing holds when this session's own inputs are absent —
 * a student who did Session 3 first and now opens Session 2 has no function to be told
 * about, and her success criterion still requires at least one specific.
 */
export type FactKey = "fn" | "evidence" | "story";

export type CitedFact = { key: FactKey; fact: KnownFact };

export function citedFacts(n: FoundationNumber, k: WingKnows): CitedFact[] {
  /*
   * The key travels with the fact rather than being recovered by comparing the object
   * against `k.fn` and friends. Identity comparison worked and was wrong to rely on: two
   * facts holding the same value would collapse, and a caller reusing one object across
   * fields would pick the first branch. The key is known here, so it is carried.
   */
  const all: CitedFact[] = [];
  if (k.fn) all.push({ key: "fn", fact: k.fn });
  if (k.evidence) all.push({ key: "evidence", fact: k.evidence });
  if (k.story) all.push({ key: "story", fact: k.story });

  const ordered: CitedFact[] = [];
  for (const key of CITES[n]) {
    const found = all.find((c) => c.key === key);
    if (found && !ordered.includes(found)) ordered.push(found);
  }
  for (const c of all) {
    if (!ordered.includes(c)) ordered.push(c);
  }
  return ordered.slice(0, MAX_CITED);
}

/**
 * One sentence naming a fact, its source and roughly when — H-002, per fact.
 *
 * The lead-in differs by which fact it is, because "your credibility rests on X" and "your
 * strongest story is Y" are her phrasings and they are not interchangeable.
 */
function cite({ key, fact }: CitedFact): string {
  const when = approximately(fact.daysAgo);
  const from = when ? `from Session ${fact.sourceSession}, ${when}` : `from Session ${fact.sourceSession}`;

  /*
   * The function is a value from a fixed set, not free text, so it is never excerpted —
   * "Marketing" cannot be too long. The other two are the student's own wording.
   */
  if (key === "fn") return `You're a ${fact.value.trim()} person — that's what you landed on ${from}.`;
  if (key === "evidence") return `Your credibility rests on ${excerpt(fact.value)} — your words, ${from}.`;
  return `Your strongest story is ${excerpt(fact.value)} — ${from}.`;
}

/**
 * Her failure-path copy, verbatim.
 *
 * Hers rather than mine because it is the sentence a student reads at the exact moment
 * Wing has let them down, and the wording of an apology is a coaching decision.
 */
export const UNREADABLE_PRIOR_WORK =
  "I should know more about you from our prior work, but I'm working from a fresh start " +
  "here. Bear with me — we'll get back to full context quickly.";

/**
 * What Wing says it knows, before this session starts. Null at the `nothing` level, where
 * the population's warm generic opening is correct and is what her table asks for.
 */
export function contextOpening(n: FoundationNumber, k: WingKnows): string | null {
  if (k.unreadablePriorWork) return UNREADABLE_PRIOR_WORK;

  const level = accumulationLevel(k);
  if (level === "nothing") return null;

  if (level === "documents") {
    /*
     * Her row asks for the specific gap between the two documents. Wing does not compute
     * that gap at session start — it lives in the document analysis — so this says what is
     * true (both are read, this session works from them) rather than asserting a gap
     * nobody has looked for. Wiring the analysis output through is a separate job and is
     * on the list; a fabricated observation would be worse than a modest true one.
     */
    return "I've read your resume and your LinkedIn, so I'm not starting from nothing here.";
  }

  const facts = citedFacts(n, k);
  if (!facts.length) return null;
  return facts.map(cite).join(" ");
}

/**
 * The session's opening message.
 *
 * ── ONE ASSEMBLY POINT, ON PURPOSE ───────────────────────────────────────
 * This moved here from `session-access.ts` and absorbed IG-UX06 rather than sitting beside
 * it, for the reason that function exists at all: the route must not be able to compute a
 * part and drop it. There is one call and it returns the whole opening.
 *
 * Order: what Wing knows, then what Wing does not have, then what this session does. That
 * is recognition before gap before instruction — the same satisfaction-then-orientation
 * shape IG-UX05 requires of transitions, and the reverse reads as an apology with a
 * postscript.
 *
 * `guidance` — the population's static opener — is kept at every level rather than being
 * replaced. It carries what the session IS, which the context lines deliberately do not
 * say. Above the `nothing` level it stops being the greeting and becomes the part that
 * says what happens next.
 */
export function foundationOpening(
  n: FoundationNumber,
  k: WingKnows,
  guidance: string | null,
): string {
  const context = contextOpening(n, k);
  const gap = outOfOrderNote(n, k.completed);
  return [context, gap, guidance?.trim() || null].filter(Boolean).join("\n\n");
}

/** Re-exported so callers need one import for the opening path. */
export { isFoundationNumber };
