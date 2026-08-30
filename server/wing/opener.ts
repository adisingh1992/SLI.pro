/**
 * The greeting that precedes a prompt — her opener pool, selected independently.
 *
 * Pure.
 *
 * ── HER NOTE, QUOTED ─────────────────────────────────────────────────────
 * "Every prompt is preceded by a greeting + opener. The greeting uses the user's name.
 * The opener rotates from this pool."
 *
 * "The universal opener pool should be implemented as a separate layer — the system
 * selects the opener independently of the prompt, ensuring variety in how prompts feel
 * even when the underlying question repeats at the 14-day minimum interval."
 *
 * ── THE OPENER IS THE GREETING ───────────────────────────────────────────
 * Every one of her fourteen already contains it: "Hey [Name] — quick one for you."
 * So this does not sit above a greeting, it replaces one. `life_log_nudge` opens with
 * "Hi {{firstName}}," and putting an opener under that would greet a student twice.
 *
 * ── HER THREE POOLS ARE PRECONDITIONS, NOT FLAVOURS ──────────────────────
 * She labels them with their conditions: warm-return openers are "for users who haven't
 * responded in 5+ days", post-response openers are "when Wing is following up on a theme".
 * Sending "missed you" to somebody who answered yesterday is the failure this separation
 * exists to prevent, so the pool is chosen from state rather than drawn at random.
 *
 * ── WHY A PLACEHOLDER IT CANNOT FILL DISQUALIFIES AN OPENER ──────────────
 * One of her post-response openers interpolates a topic: "remember what you told me about
 * [topic]?" Wing does not always have one. An opener rendered with the placeholder still
 * in it — "remember what you told me about [topic]?" — is worse than a plainer greeting,
 * so it is filtered out rather than filled with a guess.
 *
 * That is also why `prompt_openers.placeholders` is a column: the renderer refuses what it
 * cannot complete, rather than the copy quietly depending on values it hopes are there.
 */

export type OpenerPool = "casual" | "warm_return" | "post_response";

export type Opener = {
  id: number;
  pool: string;
  text: string;
  placeholders: readonly string[];
};

export type OpenerState = {
  /** Days since the student last answered anything, or null if they never have. */
  daysSinceLastResponse: number | null;
  /**
   * A theme Wing is following up on, when there is one. Its presence is what makes the
   * post-response pool eligible — not a preference, a precondition.
   */
  followingUpOn: string | null;
  /** The opener sent last time, so the same greeting does not arrive twice running. */
  lastOpenerId: number | null;
};

/** Her threshold: "users who haven't responded in 5+ days". */
export const WARM_RETURN_DAYS = 5;

/**
 * Which pool applies.
 *
 * Post-response outranks warm-return: a student who has been quiet for a week and whose
 * last message Wing is following up on is better served by the follow-up, which references
 * something they actually said, than by a greeting that only observes they were away.
 *
 * A student who has never responded is NOT a warm return. They have not gone quiet; they
 * have not started. "Missed you" to someone in their first week is a lie about a
 * relationship that has not happened yet.
 */
export function poolFor(state: OpenerState): OpenerPool {
  if (state.followingUpOn) return "post_response";
  if (state.daysSinceLastResponse !== null && state.daysSinceLastResponse >= WARM_RETURN_DAYS) {
    return "warm_return";
  }
  return "casual";
}

/** Every `[Placeholder]` a value is available for. */
export function fillable(opener: Opener, values: Readonly<Record<string, string>>): boolean {
  return opener.placeholders.every((p) => {
    const v = values[p];
    return typeof v === "string" && v.trim().length > 0;
  });
}

/** Substitutes `[Name]` and friends. Unknown placeholders are left alone by construction. */
export function fill(text: string, values: Readonly<Record<string, string>>): string {
  let out = text;
  for (const key of Object.keys(values)) {
    out = out.split(`[${key}]`).join(values[key]);
  }
  return out;
}

export type RenderedOpener = { id: number; text: string } | null;

/**
 * One opener, rendered, or null with nothing rendered.
 *
 * Null is a real outcome and the caller must handle it: every one of her openers
 * interpolates the student's name, so a student whose name Wing does not hold gets no
 * opener at all. Sending "Hey [Name]" would be worse than sending the prompt plainly, and
 * inventing a name is not on the table.
 *
 * `random` is injected for the same reason as in `prompt-selection`: a rotation tested
 * against a live `Math.random` either flakes or proves nothing.
 */
export function renderOpener(
  openers: readonly Opener[],
  state: OpenerState,
  values: Readonly<Record<string, string>>,
  random: () => number = Math.random,
): RenderedOpener {
  const pool = poolFor(state);

  const usable = openers.filter((o) => o.pool === pool && fillable(o, values));
  if (!usable.length) {
    /*
     * No fallback to another pool. If the post-response pool has nothing fillable because
     * Wing has no topic, `poolFor` would not have chosen it; if the warm-return pool is
     * empty, the student is owed a greeting that acknowledges their absence and a casual
     * one would paper over it. An empty pool is a seeding problem, and returning null
     * makes it visible instead of substituting something that reads slightly wrong.
     */
    return null;
  }

  /*
   * "Ensuring variety in how prompts feel even when the underlying question repeats."
   * The last opener is skipped where there is another to use — the same shape as the
   * recommendation's no-repeat, and for the same reason: with one usable opener, repeating
   * it is correct rather than a bug.
   */
  const fresh = usable.filter((o) => o.id !== state.lastOpenerId);
  const choices = fresh.length ? fresh : usable;

  const chosen = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
  return { id: chosen.id, text: fill(chosen.text, values) };
}
