/**
 * IG-UX01 — access does not adapt. Depth does.
 *
 * Pure. No imports.
 *
 * ── THE RULING ───────────────────────────────────────────────────────────
 * WING_DECISIONS ruling 1, on the C1 conflict between IG-UX01 and Feature List A2:
 *
 *   "IG-UX01. Every module enterable at any time; depth adapts, access does not.
 *    Prerequisites are communicated inside the module, never on the navigation."
 *
 * IG-UX01's own words: "Wing never shows modules as locked… every module is enterable at
 * any time." Feature List A2 said the opposite — "forward progression remains locked until
 * prerequisites are complete" — and the platform implemented A2.
 *
 * ── WHAT WAS ACTUALLY ENFORCING IT ───────────────────────────────────────
 * Not the client. The SERVER refused:
 *
 *   POST /api/foundation-sessions/2/start  →  403 "Complete the previous session first"
 *
 * and `initializeFoundationSessions` wrote `status: "locked"` onto sessions 2 and 3 at
 * account creation. A second copy of the same initialisation sat in `server/routes.ts`.
 * So no client — including a rebuilt one — could satisfy the ruling: removing the lock
 * from the navigation would have produced a button that 403s.
 *
 * The schema was right all along. `wing.sessions.status` defaults to `available`, and its
 * comment reads: "Forward-locking and prerequisites are engine logic, not schema:
 * completed sessions stay revisitable, Enhancement Modules default to available and are
 * skippable in any order." The engine logic was the part that disagreed.
 *
 * ── WHY `locked` STAYS IN THE ENUM ───────────────────────────────────────
 * Retire rows, never delete — the convention the schema already enforces, and dropping a
 * value from a Postgres enum means recreating the type. Nothing writes it and nothing
 * reads it as a gate any more, and migration 0027 flips the rows that carry it. The one
 * thing that must not survive is a WRITER: a status value nobody enforces is worse than no
 * value at all, because the field then claims something is in force that is not. That has
 * now been the failure shape three times in this work — an empty published sequence, a
 * cycle pointed at a draft, a voice register reported from the resolved population rather
 * than the rendered one — so the test checks for writers, not just for readers.
 *
 * ── WHAT REPLACES THE REFUSAL ────────────────────────────────────────────
 * Not silence. Her ruling has a second half — "prerequisites are communicated inside the
 * module" — and IG-U016 asks for more than access: modules must *work well* when entered
 * without prerequisites. Her Platform Updates note is explicit that "Foundation sessions
 * are offered as a visible option but never required as a redirect."
 *
 * So the server reports what is missing as data, and the session says so in its opening.
 * The sentence below is the floor, not the finished thing: the full context-aware opening
 * is IG-UX06, which rewrites the whole opening from what Wing already knows. This is what
 * keeps the ruling honest until then, and it is deliberately one sentence that names an
 * absence rather than a paragraph that explains a policy.
 */

/** The Foundation arc, in the order the methodology builds it. */
export const FOUNDATION_SEQUENCE = [1, 2, 3] as const;

export type FoundationNumber = (typeof FOUNDATION_SEQUENCE)[number];

export function isFoundationNumber(n: number): n is FoundationNumber {
  return n === 1 || n === 2 || n === 3;
}

/**
 * The earlier Foundation sessions this student has not finished.
 *
 * "Prerequisites" in the informational sense only — nothing in the platform may refuse
 * entry on the strength of this. It exists so the session can say what it does not have.
 *
 * Not derived from `status === "locked"`, deliberately: that value is retired and a row
 * still carrying it means nothing. Completion is the only fact here.
 */
export function missingPrerequisites(
  n: FoundationNumber,
  completed: readonly number[],
): FoundationNumber[] {
  const done = new Set(completed);
  return FOUNDATION_SEQUENCE.filter((s) => s < n && !done.has(s));
}

/** Whether this entry skips something. Never a reason to refuse. */
export function enteredOutOfOrder(
  n: FoundationNumber,
  completed: readonly number[],
): boolean {
  return missingPrerequisites(n, completed).length > 0;
}

/**
 * What each session produces, in the terms the next one needs it.
 *
 * Phrased as the OUTPUT rather than the activity, because the sentence has to tell a
 * student what Wing is missing, not which screen they skipped. "Session 1" means nothing
 * to someone who has not done it; "which single function you are credible in" does.
 */
const PRODUCES: Readonly<Record<FoundationNumber, string>> = {
  1: "which single function you are credible in",
  2: "the evidence behind your claims",
  3: "the stories that prove them",
};

/**
 * One sentence, said inside the session, naming what Wing does not have.
 *
 * Null when nothing is missing — there is no note to make, and an unconditional
 * reassurance ("you have everything you need!") is the generic opening IG-UX06 rules out.
 *
 * The closing clause is her constraint, not a courtesy: the earlier session is offered as
 * a visible option and never as a redirect. A sentence that ended "go and do Session 1
 * first" would be the 403 again, in prose.
 */
export function outOfOrderNote(
  n: FoundationNumber,
  completed: readonly number[],
): string | null {
  const missing = missingPrerequisites(n, completed);
  if (!missing.length) return null;

  const parts = missing.map((s) => PRODUCES[s]);
  const absent =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} or ${parts[parts.length - 1]}`;

  return (
    `Worth saying up front: I don't have ${absent} yet, so I'll work from what you tell ` +
    `me here. You can do the earlier session whenever you like and this will get sharper.`
  );
}

/*
 * `foundationOpening` moved to `shared/session-opening.ts` when IG-UX06 landed.
 *
 * It is still the single assembly point and still exists for the same reason — the route
 * must not be able to compute a part and drop it — but the opening now also carries what
 * Wing already knows, and that belongs with the accumulation table rather than here. This
 * file keeps the access semantics: what is missing, and the sentence that says so.
 */
