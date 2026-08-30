/**
 * IG-MJ04 — what Wing does when a life-log entry carries distress.
 *
 * ── THE GATE, VERBATIM ───────────────────────────────────────────────────
 * "When a prompt response contains crisis-level language (acute stress, fear, despair, or
 * identity-threatening content), Wing should NOT immediately recommend a module or
 * escalate. Instead, Wing should respond with a single validating message and wait for the
 * next scheduled prompt cycle."   — UX Addendum §A3
 *
 * ── THE READING, BECAUSE "ESCALATE" IS AMBIGUOUS AND IT MATTERS ──────────
 * The gate table shortens this to "do not recommend a module or escalate", and read alone
 * that could mean "do not escalate a crisis" — which would be a instruction to withhold
 * help, and would contradict IG-S01.
 *
 * The full requirement settles it. The word is "immediately", the sentence pairs escalate
 * with recommending a module, and §A3 is entirely about routing and cadence — its other
 * three bullets are module recommendations, prompt frequency and re-recommendation
 * cooldowns. So "escalate" means escalate the ENGAGEMENT: push a module, raise the
 * cadence, chase a reply. It does not touch the safety path.
 *
 * ── TWO BANDS, NOT ONE ───────────────────────────────────────────────────
 * IG-MJ04's "crisis-level language" is defined by her as acute stress, fear, despair or
 * identity-threatening content. IG-S01's crisis is narrower and more serious: distress
 * beyond career frustration — hopelessness, identity collapse, isolation, any sign of
 * self-harm.
 *
 * They are not the same threshold and must not be collapsed. A student writing "this week
 * broke me" is in IG-MJ04's band and probably not IG-S01's; treating every distressed
 * entry as a safety event would suppress a fortnight of Wing's contact over a bad week,
 * and treating none of them as one is the failure that matters.
 *
 * So the model reports both, separately, and `safetyHold` uses exactly the wording intake
 * already gives it — same test, same vocabulary, same `reportsCrisis` guard on the way
 * back. A student should not get a different standard depending on which surface they
 * happened to write on.
 *
 * ── WHAT WAS THERE BEFORE ────────────────────────────────────────────────
 * Nothing. `RESPONSE_SYSTEM` in `life-log-store.ts` carried voice, register and a NEVER
 * list, and no safety rules at all — `compileSafety()` is compiled into intake and into
 * Foundation, and was absent from the one surface built for a student to write about
 * whatever is happening in their life, several times a week, unprompted.
 *
 * Its register list made that worse rather than neutral: "Something went badly →
 * empathise. Do not reach for a silver lining." That is the branch a distressed entry
 * falls into, so the reply was warm, on-voice, and about career material.
 *
 * ── WHAT IS STRUCTURAL RATHER THAN JUDGED ────────────────────────────────
 * Three of IG-MJ04's four requirements need no classifier: do not recommend a module, do
 * not raise the cadence, wait for the next cycle. Those are properties of the reply path,
 * and `log-reply.test.ts` checks the path for them rather than trusting this file. Only
 * "respond with a single validating message" needs the model's judgement, because whether
 * something is distressing is not a thing a regex knows — IG-S01's own line is "scope, not
 * intensity".
 */

/** What the model reports back about the entry it just read. */
export type LogReplyJudgement = {
  /** The reply itself. Plain text. */
  reply: string;
  /**
   * IG-S01's band, in intake's exact terms. Opens a safety hold.
   *
   * Never read as a bare truthy value — see `reportsCrisis` in `safety-hold-store`, which
   * exists because `if (parsed.safetyHold)` opens a hold on the string "false".
   */
  safetyHold: boolean;
  /** IG-MJ04's band: acute stress, fear, despair, or identity-threatening content. */
  distress: boolean;
};

/**
 * The register instruction, and the contract.
 *
 * Appended to the existing voice rules rather than replacing them: those were written and
 * reviewed, and the failure here was an absence, not a wrong instruction.
 */
export const IG_MJ04_REGISTER = `
WHEN WHAT THEY WROTE CARRIES REAL DISTRESS
Acute stress, fear, despair, or something that reads as a threat to who they are.

- Say one thing that lands. Validating, specific to what they wrote, and short.
- Do NOT suggest a module, an exercise, a session, or anything to go and do.
- Do NOT offer to check in more often, or ask them to write again sooner.
- Do NOT ask a follow-up question. Let the next scheduled prompt be the next contact.
- Do NOT reach for a silver lining, and do not connect it to their positioning.

This is the one register where saying less is the whole job. They wrote something hard
down. Acknowledging it and stopping is the correct reply.`;

export const LOG_REPLY_CONTRACT = `
Reply with JSON and nothing else:

{
  "reply": string,        // what you say. Plain text, no markdown.
  "distress": boolean,    // see below.
  "safetyHold": boolean   // see below. Almost always false.
}

RULES FOR "distress"
- TRUE when what they wrote carries acute stress, fear, despair, or something that reads
  as a threat to who they are.
- A bad week at work is not this. "I'm exhausted and I don't know why I bother" is.
- When it is true, your reply must follow the distress register above.

RULES FOR "safetyHold"
- Set it TRUE when what they wrote suggests distress beyond career frustration:
  hopelessness, identity collapse, isolation, or any sign of self-harm. That is the
  crisis rule you were given above.
- The test is the same one that rule gives you: scope, not intensity. "I'm frustrated
  with my career" is false. "I don't see the point of anything anymore" is true.
- Reading it too cautiously is acceptable. Missing it is not.
- "safetyHold" being true implies "distress" is true as well.`;

/**
 * The model's answer, read defensively.
 *
 * A parse failure returns no reply and BOTH flags false — not because that is safe, but
 * because it is honest: nothing was judged, so nothing may be claimed. The caller's own
 * failure path is what handles a missing reply, and it already exists: the entry is saved
 * whether or not the model answers, and `backfillResponse` retries later.
 *
 * Raising a hold on unparseable output would be the worse error in the other direction —
 * a fortnight of silence from Wing because a model returned malformed JSON.
 */
export function parseLogReply(raw: unknown): LogReplyJudgement {
  const empty: LogReplyJudgement = { reply: "", safetyHold: false, distress: false };
  if (!raw || typeof raw !== "object") return empty;

  const o = raw as Record<string, unknown>;
  const reply = typeof o.reply === "string" ? o.reply.trim() : "";

  /*
   * Strict `=== true`, matching `reportsCrisis`. These come from a JSON parse of model
   * output, where "false" and 0 and "no" are all truthy or falsy in ways that do not mean
   * what they look like.
   */
  const safetyHold = o.safetyHold === true;
  const distress = o.distress === true || safetyHold;

  return { reply, safetyHold, distress };
}

/** What the platform may and may not do after an entry, per IG-MJ04. */
export type PostEntryActions = {
  /** Whether a safety hold should be opened. IG-S01's band only. */
  openHold: boolean;
  /**
   * Whether Wing may follow this entry with a module recommendation.
   *
   * False under distress — her rule — and false everywhere else too, because the life log
   * has never recommended modules and IG-MJ01 would forbid it on one response anyway. It
   * is returned rather than assumed so the reply path has something to check.
   */
  mayRecommendModule: boolean;
  /** Whether Wing may raise this student's prompt cadence off the back of this entry. */
  mayRaiseCadence: boolean;
  /** Whether Wing may send anything else before the next scheduled prompt. */
  mayFollowUpNow: boolean;
  why: string;
};

/**
 * What may happen after an entry is written.
 *
 * Takes only the two bands, not the whole judgement, and that is the honest signature:
 * nothing below reads `reply`. It mattered as well as read better — `composeResponse`
 * returns `reply: string | null`, because a model call can fail and the entry is saved
 * either way, and typing this parameter as the full judgement made that call site an
 * error for a field the function never looks at.
 */
export function postEntryActions(
  j: Pick<LogReplyJudgement, "safetyHold" | "distress">,
): PostEntryActions {
  if (j.safetyHold) {
    return {
      openHold: true,
      mayRecommendModule: false,
      mayRaiseCadence: false,
      mayFollowUpNow: false,
      why: "IG-S01: a hold opens, and suppression governs what Wing sends next",
    };
  }
  if (j.distress) {
    return {
      openHold: false,
      mayRecommendModule: false,
      mayRaiseCadence: false,
      mayFollowUpNow: false,
      why: "IG-MJ04: one validating message, then wait for the next scheduled cycle",
    };
  }
  return {
    openHold: false,
    /*
     * Still false. IG-MJ01 needs three responses showing a consistent pattern before any
     * routing recommendation fires, and one entry is one response — so the life log is
     * never the place a module is recommended, distress or not. Stated here rather than
     * left implicit, because "we don't do that yet" is how it starts happening.
     */
    mayRecommendModule: false,
    mayRaiseCadence: true,
    mayFollowUpNow: true,
    why: "ordinary entry",
  };
}
