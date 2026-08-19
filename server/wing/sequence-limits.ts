/**
 * How many cards a sequence actually puts in front of the detector.
 *
 * ── WHY A WHOLE-SEQUENCE COUNT MEASURES THE WRONG THING ──────────────────
 * The limits below were set when a sequence had no session scope: every card in
 * it entered the detector catalogue on every student turn, so "cards in the
 * sequence" and "signals the detector chooses between" were the same number.
 *
 * Migration 0020 put `applies_to_session` on the entry, and `getSequenceCards`
 * filters on it — an entry scoped to `foundation_2` is invisible during intake.
 * At the same time `card_kind` took gates and exercises out of the catalogue
 * entirely: `getActiveSequenceForStudent` asks for coaching cards, because a
 * gate's signal describes something WING is about to say and offering it to a
 * detector that matches the student's words is a category error.
 *
 * So the number that matters is per session: the coaching cards scoped to it,
 * plus the coaching cards scoped to nothing. The Tier 1 set after the 18 August
 * documents makes the difference concrete — 104 entries, 46 of them coaching
 * cards, and no single turn seeing more than 23. Counting the sequence would
 * refuse it at 46; counting a turn passes it at 23, which is what the detector
 * is actually asked to do.
 *
 * ── WHY THIS IS NOT A LOOPHOLE ───────────────────────────────────────────
 * `publishCycleSequence` does not set `applies_to_session`, so a sequence
 * composed through the API is entirely unscoped — and for an unscoped sequence
 * every coaching card has a null scope, so the peak equals the total and the
 * limit bites exactly as hard as it did before. One formula, correct in both
 * cases, and no way to evade it by omitting scope.
 */

/**
 * Above this, a reviewer is warned. From the measurements in the routes file:
 * detection accuracy falls as the detector has more near-neighbour signals to
 * choose between, and every false match pollutes the evidence base used to
 * validate the methodology.
 */
export const SEQUENCE_SOFT_LIMIT = 15;

/** Above this, publication and activation are refused. */
export const SEQUENCE_HARD_LIMIT = 40;

/** The two fields the calculation needs. Anything wider is a coincidence. */
export type ScopedCard = {
  cardKind: string | null;
  appliesToSession: string | null;
};

/** Coaching cards visible in one session: scoped to it, plus scoped to nothing. */
export function detectorLoadBySession(
  cards: readonly ScopedCard[],
): Array<{ session: string | null; count: number }> {
  const coaching = cards.filter((c) => c.cardKind === "coaching_card");
  const universal = coaching.filter((c) => c.appliesToSession === null).length;

  const sessions: string[] = [];
  for (const c of coaching) {
    if (c.appliesToSession && sessions.indexOf(c.appliesToSession) < 0) {
      sessions.push(c.appliesToSession);
    }
  }

  /*
   * No scoped sessions at all still yields one row. An unscoped sequence has a
   * real detector load and returning an empty list would let it past a limit by
   * having nothing to compare.
   */
  if (!sessions.length) return [{ session: null, count: universal }];

  return sessions.map((session) => ({
    session,
    count: coaching.filter((c) => c.appliesToSession === session).length + universal,
  }));
}

/** The worst turn in the sequence — the number the limits apply to. */
export function peakDetectorLoad(cards: readonly ScopedCard[]): {
  session: string | null;
  count: number;
} {
  const loads = detectorLoadBySession(cards);
  let peak = loads[0];
  for (const l of loads) if (l.count > peak.count) peak = l;
  return peak;
}
