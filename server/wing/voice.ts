import * as voiceStore from "./voice-store";
import { compileVoice, renderedRegister, voiceTokenEstimate } from "./voice-compiler";
import { chooseDoorway, type DoorwayChoice } from "./voice-doorway";
import { populationTagsForStudent } from "./heuristics-store";
import { log } from "../logger";

/**
 * The voice layer, assembled — the one function the turn path calls.
 *
 * Three pieces that are separately testable and separately replaceable: the store
 * decides WHICH profile applies (a pointer on the cycle), `voice-doorway` decides
 * HOW to open with this person (in-session signals only), and `voice-compiler`
 * renders it. This file joins them and swallows every failure.
 *
 * ── WHY IT NEVER THROWS ──────────────────────────────────────────────────
 * A student mid-session must not lose their turn because a voice profile could
 * not be read. The failure mode is a reply in Wing's pre-T5 voice, which is the
 * voice the prompt files already carry — degraded, not broken. Same contract as
 * the gate path.
 */

/**
 * Which register a student gets, from the population tags they resolve to.
 *
 * ── WHY THE ORDER IS WHAT IT IS ──────────────────────────────────────────
 * `populationTagsFor` deliberately returns the SET of methodology populations a
 * stored value could mean rather than guessing one — "mid_career_or_senior"
 * yields both mid-career and executive, because the column cannot tell them
 * apart. The register has to pick one, so:
 *
 * - Entrepreneur wins outright. It comes from a pathway the student chose
 *   explicitly ("venture", "freelance"), which is a statement rather than an
 *   inference.
 * - Otherwise the LEAST senior reading wins. The two errors are not symmetrical:
 *   giving an executive register to a mid-career person strips the scaffolding
 *   and reads as brusque, while giving the mid-career register to an executive
 *   costs them a few extra words. IG-V01's executive line is "concise,
 *   high-signal, minimal scaffolding" — that is the one to be sure about before
 *   applying.
 *
 * - A career returner outranks mid-career, because the two tags co-occur and only one
 *   of them is a decision. Answered by Danielle on 18 August; before that a returner
 *   received the mid-career register by accident of ordering.
 */
const REGISTER_PRECEDENCE = [
  "entrepreneur",
  /*
   * Ahead of mid-career, and that ordering is the entire point of having asked.
   * `career_break_or_transition` resolves to both `career_returner` and `mid_career`,
   * so before 18 August a returner silently got the mid-career register — a fallback
   * dressed as a decision. Danielle's is a different register deliberately: warm but
   * not pitying, forward-looking, confidence rebuilt through evidence. Placing it
   * after mid-career here would preserve the old behaviour while looking fixed.
   */
  "career_returner",
  "undergraduate",
  "early_career",
  "mid_career",
  "executive",
];

export function audienceFor(tags: readonly string[]): string | null {
  for (const candidate of REGISTER_PRECEDENCE) {
    if (tags.indexOf(candidate) >= 0) return candidate;
  }
  return null;
}

export type VoiceContextResult = {
  /** Prepend to the system prompt, or null when nothing applies. */
  section: string | null;
  profileId: number | null;
  doorway: string | null;
  /** The population this student resolved to, whether or not a register exists for it. */
  audience: string | null;
  /**
   * The register actually in the prompt.
   *
   * Null while `audience` is set means the profile carries no register for that
   * population — a profile seeded before T5f carries none at all. The two fields
   * are separate because collapsing them is how the turn log came to report a
   * register that was not there.
   */
  register: string | null;
  tokens: number;
};

/** Session type → the voice context whose trait hierarchy applies. */
export function voiceContextFor(sessionType: string | null | undefined): string | null {
  if (!sessionType) return null;
  if (sessionType === "intake") return "intake";
  if (sessionType.indexOf("foundation_") === 0) return "foundation_session";
  if (sessionType === "ongoing_engagement") return "ongoing_engagement";
  if (sessionType === "career_event_review") return "setback";
  /*
   * Everything else — enhancement_a/b/c, module_run — has no hierarchy in either
   * source document. Null renders the universal rules, which is Wing's voice
   * without a context-specific lean, rather than borrowing a lean from a context
   * the documents never assigned it.
   */
  return null;
}

export async function voiceSectionFor(params: {
  studentId: number;
  sessionType: string | null;
  /** The student's own turns in this session, oldest first. */
  studentTurns: readonly string[];
}): Promise<VoiceContextResult> {
  const empty: VoiceContextResult = {
    section: null,
    profileId: null,
    doorway: null,
    audience: null,
    register: null,
    tokens: 0,
  };

  try {
    const profile = await voiceStore.getVoiceProfileForStudent(params.studentId);
    if (!profile) return empty;

    const choice: DoorwayChoice = chooseDoorway(params.studentTurns);

    /*
     * Never fails the section. A population that cannot be resolved renders no
     * register, which is Wing's voice without a stage-specific pitch — the
     * pre-T5f behaviour, and a perfectly good conversation.
     */
    const audience = audienceFor(
      await populationTagsForStudent(params.studentId).catch(() => [] as string[]),
    );

    const section = compileVoice(profile.components, {
      context: voiceContextFor(params.sessionType),
      doorway: choice.doorway,
      audience,
    });
    if (!section) return empty;

    /*
     * Recorded after the section is built, not awaited. It is a log of what Wing
     * decided — see `recordDoorway` — so it must not sit on the turn path, and a
     * failure to write it costs nothing but a log line.
     */
    void (async () => {
      const ids = choice.doorway ? await voiceStore.doorwayComponentIds(profile.profileId) : {};
      await voiceStore.recordDoorway({
        studentId: params.studentId,
        componentId: choice.doorway ? ids[choice.doorway] ?? null : null,
        confidence: choice.confidence,
        signals: { ...choice.signals, reasons: choice.reasons, doorway: choice.doorway },
      });
    })();

    return {
      section,
      profileId: profile.profileId,
      doorway: choice.doorway,
      audience,
      register: renderedRegister(profile.components, audience),
      tokens: voiceTokenEstimate(section),
    };
  } catch (err) {
    log(`voice section failed for student ${params.studentId}: ${(err as Error).message}`, "voice");
    return empty;
  }
}
