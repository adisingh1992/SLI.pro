import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/wing-schema";
import { log } from "../logger";
import { parseJsonResponse } from "../json-response";
import * as orchestrator from "../orchestrator";
import * as sessionStore from "./session-store";
import * as intakeStore from "./intake-store";
import { planChunks, type Chunk } from "./chunking";
import * as engine from "./engine";
import * as voice from "./voice";
import { compileSafety, safetyTokenEstimate } from "./safety-rules";
import { captureForTurn } from "./self-description";
import * as selfDescriptionStore from "./self-description-store";
import { recordAiTurn, recordHumanTurn } from "./provenance";
import { openHold, recordReturn, reportsCrisis } from "./safety-hold-store";
import { statedInSchool, statedUnder18 } from "./minor-protection";
import {
  BEATS,
  DELIVERY_STYLES,
  applicableBeats,
  insightReady,
  insightWindowClosed,
  isComplete,
  isDeliveryStyle,
  isSatisfied,
  progress,
  satisfiedKeys,
  verbatimFallbackField,
  type Beat,
  type DeliveryStyle,
  type PopulationTag,
} from "./intake-beats";
import { askedFor, describePlan, isCodeOwnedField, planTurn } from "./baseline-turn";
import { detectTrack, pathwayFor, type Answers } from "./audience-track";
import { revealFacts } from "./reveal-facts";
import { revealDirective, selectReveal } from "./reveal-select";

/**
 * The conversational intake (Feature List A1).
 *
 * Wing's first interaction. Replaces a six-stage form that people described as
 * clinical and burdensome, and at whose final screen 43% of registrants stalled.
 *
 * ── BOTH STORAGE FORMATS, BECAUSE THE SPEC REQUIRES BOTH ─────────────────
 * "All intake responses must be stored as structured data (for analytics) AND
 * as conversational transcript (for Wing's longitudinal memory). Both formats
 * are needed."
 *
 *   transcript  a `sessions` row with session_type='intake', with turns
 *               carrying provenance — so the intake is embeddable memory on the
 *               same footing as every other conversation.
 *   structured  intake_records.structured_responses, the same field names the
 *               form produced, so profile-store, the session prompts and the
 *               admin exports keep working untouched.
 *
 * The two are linked by intake_records.session_id. Both existed in the schema
 * before this file did; neither was being written.
 *
 * ── ONE MODEL CALL PER TURN, NOT TWO ─────────────────────────────────────
 * The call returns Wing's reply AND the fields it extracted from what the
 * student just said. Extracting separately would double latency and cost on the
 * one surface where latency is most expensive — this is the first thing a new
 * student ever experiences, and a slow reply here is the drop-off the feature
 * exists to prevent.
 *
 * ── THE MODEL PROPOSES, THE CODE DISPOSES ────────────────────────────────
 * Everything the model returns is treated as a suggestion and validated:
 * enum-valued fields are checked against the actual enum and dropped if they do
 * not match, unknown field names are discarded, and the early insight fires
 * only when intake-beats.ts agrees it should — never because the model claimed
 * it was ready. This project has been bitten eight times by an extractor that
 * produced a plausible non-empty result while being wrong.
 */

/* ── Enum-valued fields ─────────────────────────────────────────────────── */

/**
 * Fields whose values must match a database enum exactly.
 *
 * `professional_status` is the one that matters most: it selects the completion
 * criteria, the analysis methodology and the objective set for all three
 * foundation sessions. A near-miss like "undergraduate" instead of
 * "undergraduate_or_recent_grad" would not error — it would quietly pitch the
 * entire arc at the wrong population.
 */
const ENUM_FIELDS: Record<string, readonly string[]> = {
  professional_status: [
    "undergraduate_or_recent_grad",
    "early_career",
    "mid_career_or_senior",
    "career_break_or_transition",
  ],
  pathway: ["employment", "venture", "freelance"],
};

/** Field names the intake is allowed to write. Anything else is dropped. */
const KNOWN_FIELDS = new Set(BEATS.flatMap((b) => b.captures));

/**
 * Every free-text or enum field the model may write into `extracted`, with the question
 * it came from — rendered into the prompt so the model has the exact keys, not just a
 * prose description of what to listen for.
 *
 * ── THE BUG THIS EXISTS TO FIX ────────────────────────────────────────────────────
 * It was missing entirely. `renderBeat` told the model WHAT to learn, in prose — "their
 * self-presentation instinct" — and `OUTPUT_CONTRACT` told it to return `extracted` as
 * an object, but nothing anywhere told it what to NAME the keys. `sanitiseExtracted`
 * keeps only keys in `KNOWN_FIELDS`, the exact snake_case names each beat's `captures`
 * declares, so a model free-associating a key — `presentation_style` instead of
 * `self_presentation_style`, `field` instead of `career_focus` — had everything it wrote
 * silently dropped, every turn, for every beat except `professional_status`, the one
 * field `OUTPUT_CONTRACT` happens to name explicitly for its enum rule.
 *
 * That is not a rare miss. It is why a beat could go unsatisfied turn after turn even
 * though the student plainly answered it: `isSatisfied` never saw a value land, so
 * `nextBeatAfter` kept stepping forward — and once every later beat was in the same
 * state, the walk ran off the end of the list and `nextBeat` restarted it from the top.
 * From the outside that reads as exactly what it looked like: Wing asking the same nine
 * questions again after it had already asked them once.
 *
 * ── WHY GLOBAL, NOT SCOPED TO THE CURRENT BEAT ────────────────────────────────────
 * A rich answer legitimately fills fields the current beat does not own — Q3 is
 * explicitly allowed to be skipped when Q1 or Q2 already named the institution — and a
 * dictionary scoped to "what this turn is asking" would only ever let that beat's own
 * answer land, leaving the opportunistic-capture behaviour the spec calls for unable to
 * write anything.
 *
 * Baseline fields (`baseline_*`) are excluded: they are code-owned (`isCodeOwnedField`,
 * `sanitiseExtracted`) and read by `readScale`/`classifyBarrier`, never by the model, so
 * listing them here would only invite the model to guess a number in the one field where
 * a guess is worse than a re-ask.
 */
const FIELD_DICTIONARY =
  `FIELD NAMES — use these exact keys in "extracted". A key not on this list is silently\n` +
  `discarded, so an invented or paraphrased name records nothing:\n` +
  BEATS.map((b) => {
    const names = b.captures.filter((f) => !isCodeOwnedField(f));
    return names.length ? `${b.question}: ${names.join(", ")}` : null;
  })
    .filter((line): line is string => line !== null)
    .join("\n");

export type IntakeState = {
  sessionId: number;
  messages: { role: "assistant" | "user"; content: string }[];
  population: PopulationTag | null;
  captured: Record<string, unknown>;
  satisfied: string[];
  progress: { satisfied: number; total: number };
  complete: boolean;
  insightDelivered: boolean;
};

/* ── Reading state ──────────────────────────────────────────────────────── */

async function capturedFor(userId: number): Promise<Record<string, unknown>> {
  const intake = await intakeStore.getBrandingIntake(userId);
  return ((intake?.responses ?? {}) as Record<string, unknown>) ?? {};
}

function populationOf(captured: Record<string, unknown>): PopulationTag | null {
  const v = captured.professional_status;
  return typeof v === "string" && ENUM_FIELDS.professional_status.includes(v)
    ? (v as PopulationTag)
    : null;
}

export async function getState(userId: number): Promise<IntakeState | null> {
  const studentId = await sessionStore.studentIdFor(userId);
  const session = await sessionStore.ensureSession(studentId, "intake", "available");

  const [captured, messages, record] = await Promise.all([
    capturedFor(userId),
    sessionStore.getTurnsAsMessages(session.id),
    intakeStore.getIntakeRecord(userId),
  ]);

  const population = populationOf(captured);

  return {
    sessionId: session.id,
    messages,
    population,
    captured,
    satisfied: satisfiedKeys(population, captured),
    progress: progress(population, captured),
    complete: isComplete(population, captured),
    insightDelivered: !!record?.earlyInsightDeliveredAt,
  };
}

/* ── Prompt assembly ────────────────────────────────────────────────────── */

const IDENTITY = `You are Wing — a career positioning partner, not a form and not a chatbot mascot.

This is your FIRST conversation with this person. They just registered. Everything they think this platform is gets decided in the next few minutes.

VOICE (from the Wing Voice and Personality Guide, which governs all copy)
- Contractions throughout. A sharp colleague over coffee, not a career centre.
- "I" when you observe something. "we" and "let's" when you propose action.
  You see as an individual; you act as a partner.
- Specific over abstract. Use their words back at them, not paraphrases.
- Confident, not hedging. Never "you might want to consider".
- One question at a time. Never stack two.
- Short. Two or three sentences before the question, usually fewer.

NEVER
- Never say "great!", "amazing", "I love that", "thanks for sharing".
- Never tell them to build their personal brand or leverage anything.
- Never summarise their answer back at them before asking the next thing.
- Never mention questions numbers, progress, stages or how much is left.
- Never ask what their personality type is. You infer it from how they write.`;

/**
 * Keeps intake from turning into the coaching session it is not.
 *
 * ── WHAT THIS EXISTS TO FIX ────────────────────────────────────────────────
 * A real transcript: asked to help write a LinkedIn post mid-intake, Wing said
 * "Yes — we can create a post next" and, a few turns later, "we'll start with
 * the post" — agreeing to do a piece of work that belongs to Module 6, not to
 * question 4 of 9. Asked why there's no logout button, Wing answered the UI
 * question instead of declining and returning to what it was asking. Neither
 * is what A1 specifies: intake gathers information, and everything else —
 * feedback, drafting, product questions, tasks — is a Foundation Session's job
 * or the app's own UI, not this conversation's.
 *
 * A soft "stay on topic" note buried in IDENTITY was not enough — the model's
 * instinct to be helpful about whatever the student just asked wins against a
 * one-line aside. This is its own block for the same reason SCOPE-adjacent
 * rules elsewhere in this file are their own blocks: something worth holding
 * against the model's default helpfulness needs to be said once, plainly, and
 * not diluted by sharing space with tone guidance.
 */
const SCOPE = `SCOPE — you ask questions here, you do not do things
This is information gathering, not a coaching session and not a place to
produce work for them — that is what their Foundation Sessions are for.
Answering "why are you asking that" or clarifying the question you just asked
is fine; that is still part of answering here.

Anything else — write something for them, give feedback, explain how a
feature works, answer a question about their account or the product, help
with a task, anything not on your list to learn — refuse it. One short
sentence: say you'll get to that together once this is done, then go straight
back to the question you just asked. Do not treat their message as an answer
to it, and do not ask anything new.

If they explicitly disengage ("let's move on", "I'll get back to you"),
acknowledge briefly and hold the same question ready for when they return —
do not soften that into "no worries, moving on" and skip ahead.

This does not apply to the one early-insight moment below, when it fires —
that is a designed part of the intake, not something you extend on your own.`;

/**
 * What Wing says once the required beats (and, once reached, the optional baselines
 * too) are all satisfied — fixed text, not model-composed.
 *
 * ── THE BUG THIS EXISTS TO FIX ────────────────────────────────────────────────────
 * "It's just keep going, there is no end." A real transcript ran to over sixty
 * exchanges: every required beat and all three baselines were satisfied by around
 * exchange ten, `buildSystemPrompt` correctly started including a CLOSING instruction
 * telling the model to wrap up and stop asking things — and the model kept right on
 * going anyway, improvising new questions (a pilot proposal, who could sponsor it,
 * what evidence to bring the CEO) that aren't in `BEATS` at all. It also did this
 * mid-intake, in miniature: `renderBaselineGuidance`'s "ONE follow-up, THEN STOP" was
 * good for exactly one follow-up before the model asked another anyway.
 *
 * A soft instruction competing against a long system prompt that spends most of its
 * words telling the model to be a curious, engaged coach is not reliable, and this file
 * already has the answer for that: "the model proposes, the code disposes" — the same
 * reason `readScale` reads baseline numbers instead of asking the model to, and the
 * same reason the opening in `begin()` is fixed text rather than generated ("there is
 * nothing to adapt to yet"). At the close there is, symmetrically, nothing NEW to
 * adapt to: the required material is already gathered. So once `turn.wrapUp` is true,
 * this replaces `parsed.reply` outright — the model is still called every turn (crisis
 * detection has to run on every message unconditionally, close or not), but what it
 * writes for `reply` on a wrap-up turn is discarded rather than shown.
 */
const CLOSING_REPLY = (firstName: string) =>
  `That's what I needed, ${firstName}. Hit "Wrap up" below whenever you're ready — ` +
  `a short set of optional questions, then your first real session with me.`;

/**
 * If they keep talking after that. Short on purpose — the alternative is the model
 * treating a reply to its own closing line as an invitation to open something new,
 * which is exactly the failure mode this file exists to stop.
 */
const CLOSING_NUDGE =
  `Nothing else I need from you right now — "Wrap up" is right below whenever you're ready.`;

function renderBeat(beat: Beat): string {
  /*
   * The scale note exists because the model's instinct is to be accommodating: offered
   * a rating question it will happily accept "somewhere in the middle" and move on, and
   * the code then has nothing to record. It is allowed to take the answer in words —
   * `readScale` reads "about a two" — but it has to ask for a number.
   */
  const scale =
    beat.answer === "scale_1_5"
      ? `\n\nThis one is a 1-to-5 rating. Ask for their number. If they answer in words that carry a number ("about a two") that is fine — do not correct them, and do not talk them through the scale a second time.`
      : "";

  return `WHAT YOU ARE TRYING TO LEARN NEXT
${beat.intent}

Why it matters, if they ask: ${beat.why}

A natural way in — rephrase it to fit what they just said, do not recite it:
"${beat.opening}"${scale}

Ask ONLY this. Even if their last answer opens up something genuinely worth
digging into — a business idea, a specific plan, a real opportunity — that is
material for their first real session, not for another question here. Land
one brief, specific reaction to what they said, then ask this and stop.`;
}

function renderStyle(style: DeliveryStyle | null): string {
  if (!style) {
    return `DELIVERY
You have not read them yet. Stay neutral and specific, and watch how they write — length, hedging, whether they claim credit or deflect it.`;
  }
  const s = DELIVERY_STYLES[style];
  return `DELIVERY — read as: ${style}
Signals: ${s.signals}
Approach: ${s.approach}

This changes the doorway, never the destination. You do not soften a conclusion
to make it easier to hear. If their positioning is weak you still say so.`;
}

function renderCaptured(captured: Record<string, unknown>): string {
  const entries = Object.entries(captured).filter(([k, v]) => {
    /*
     * Underscore-prefixed keys are Wing's own bookkeeping — `_delivery_style`, and now
     * `_asked` — and they were being printed in ALREADY KNOWN as though the user had
     * volunteered them. `_asked` is an object, so it would have arrived in the prompt
     * as "_asked: [object Object]", which is the kind of thing a model quotes back.
     */
    if (k.charAt(0) === "_") return false;
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim() !== "";
    if (Array.isArray(v)) return v.length > 0;
    return true;
  });

  if (!entries.length) return "ALREADY KNOWN\n(nothing yet)";

  return (
    "ALREADY KNOWN — do not ask about any of this again\n" +
    entries.map(([k, v]) => `  ${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`).join("\n")
  );
}

const INSIGHT_INSTRUCTION = `── THIS TURN: THE EARLY INSIGHT ─────────────────────────────────────────
Before your next question, surface something you have genuinely noticed. This
is the most important moment in the intake — it turns filling in a form into
being seen by something intelligent.

Build it from what they have actually told you: their goals, what holds them
back, how visible they are, how they think they are seen. NOT job history, NOT
their headline — you do not have those yet.

The shape, in your own words:
  1. Mark it: "I'm already noticing something."
  2. Name the tension, quoting them: "You said X — but you also said Y."
  3. Normalise it: it is a common pattern in people with real potential.
  4. Say it is one of the first things you work on together.
  5. ONE small action they could take this week. Genuinely small. No post
     required, nothing that takes an evening.
  6. Move on: "Let's keep going."

Reference for register, not to copy:
"Interesting — I'm already noticing something. You said you want to be more
active professionally but you're worried about how people will perceive you.
That's actually one of the most common blind spots high-potential professionals
have — and it's one of the first things we work on together. One small idea to
start: pick one person whose content you admire and leave a thoughtful comment
this week. No post required. Just show up once. Let's keep going."

It must be about THEM. If you cannot point at two specific things they said
that pull against each other, do not force it — set deliveredInsight false and
just ask the next question.`;

const OUTPUT_CONTRACT = `── OUTPUT ───────────────────────────────────────────────────────────────
Reply with ONLY a JSON object, no prose around it:

{
  "reply": string,             // what you say. Plain text, no markdown.
  "extracted": object,         // fields you learned FROM THEIR LAST MESSAGE ONLY
  "deliveryStyle": string,     // one of: affirming, normalising, evidential, permitting
  "deliveredInsight": boolean, // true only if your reply contains the early insight
  "safetyHold": boolean        // see below. Almost always false.
}

RULES FOR "safetyHold"
- Set it TRUE when you stopped coaching because what they wrote suggests distress
  beyond career frustration: hopelessness, identity collapse, isolation, or any sign
  of self-harm. That is the crisis rule you were given above.
- The test is the same one that rule gives you: scope, not intensity. "I'm frustrated
  with my career" is false. "I don't see the point of anything anymore" is true.
- It describes what YOU just did. If your reply is a coaching move, it is false.
- Reading it too cautiously is acceptable. Missing it is not.

RULES FOR "extracted"
- Only what this last message told you. Do not restate earlier fields.
- Omit anything you are guessing at. An empty object is a fine answer.
- professional_status must be exactly one of: undergraduate_or_recent_grad,
  early_career, mid_career_or_senior, career_break_or_transition.
- Free-text fields keep their words, trimmed. Do not tidy their phrasing —
  their exact language is the point.`;

function buildSystemPrompt(params: {
  beat: Beat | null;
  captured: Record<string, unknown>;
  style: DeliveryStyle | null;
  /**
   * The reveal for this turn, rendered — or null, which is the commoner answer.
   *
   * Was `withInsight: boolean`. A boolean could only ever select the generic
   * instruction, which asked the model to find its own tension in everything the
   * student had said. Her selection rules pick one shape, from one pair of answers,
   * and refuse when nothing qualifies — see `selectReveal`.
   */
  insightDirective: string | null;
  firstName: string;
  wrapUp: boolean;
  /** Unconditional. A module constant with no inputs — see safety-rules.ts. */
  safetySection: string;
  /** Null until a cohort points at a published voice profile. */
  voiceSection: string | null;
  /** Null until a published sequence carries gates scoped to intake. */
  gateSection: string | null;
  /**
   * The Phase 3.5 instruction for this turn — a re-ask, a follow-up, or a skip
   * acknowledgement. Null on every other turn.
   */
  baselineGuidance: string | null;
  /**
   * True when the baseline guidance IS this turn's question — a follow-up. The next
   * beat must not also be rendered, or the model asks two questions in one reply,
   * which the voice guide forbids and which loses the follow-up's answer.
   */
  suppressBeat: boolean;
}): string {
  /*
   * ── WHY THESE THREE COME FIRST, AND WHY THEY ARE HERE AT ALL ───────────
   * They were missing. Every other student-facing surface assembles safety →
   * voice → gates → its own prompt (see foundation-sessions-routes.ts), and this
   * one — the first thing a student ever talks to — had none of the three. It ran
   * on IDENTITY plus the current beat.
   *
   * The safety gap is the one that mattered. IG-INT04 is explicit: "IG-S01
   * (crisis language), IG-S02 (harm prevention), IG-S07 (anti-sycophancy), IG-S09
   * (cultural attribution) all active from Q1." Those four shipped as a module
   * constant precisely so no missing pointer could switch them off — and then the
   * surface with the most first-time users never called it.
   *
   * Order is Danielle's hierarchy: safety > methodology > helpfulness. The safety
   * section's own first line claims it outranks everything below it, which is only
   * true if what it outranks comes after.
   */
  const parts = [
    params.safetySection,
    ...(params.voiceSection ? [params.voiceSection] : []),
    ...(params.gateSection ? [params.gateSection] : []),
    IDENTITY,
    SCOPE,
    `Their first name is ${params.firstName}.`,
    renderStyle(params.style),
  ];

  parts.push(renderCaptured(params.captured));

  /*
   * The directive first, then the register. The directive says WHAT the observation
   * is and what it rests on; INSIGHT_INSTRUCTION says how it is delivered — mark it,
   * quote them, normalise it, one small action, move on. Neither is sufficient: the
   * shape without the register produces a diagnosis, and the register without the
   * shape is what shipped before this, which is a model guessing.
   */
  if (params.insightDirective) {
    parts.push(params.insightDirective);
    parts.push(INSIGHT_INSTRUCTION);
  }

  if (params.baselineGuidance) parts.push(params.baselineGuidance);

  if (params.wrapUp) {
    /*
     * `reply` is discarded on this turn regardless of what the model writes here — see
     * `CLOSING_REPLY`. This instruction still matters for `extracted`, `deliveryStyle`
     * and `safetyHold`, which are still read from this response: it keeps the model
     * oriented on "the intake is over" rather than mid-conversation, which is what a
     * correct `safetyHold` judgement needs.
     */
    parts.push(
      `── THIS TURN: CLOSING ───────────────────────────────────────────────
You have everything required. The intake is OVER — not paused, not at a good
stopping point, over. Whatever they just said, do not turn it into a new
question, a follow-up, or a next step to plan. That includes anything that
sounds like a real opportunity worth digging into; there will be a real
session for that. Ask nothing else, about anything, for the rest of this
conversation.`,
    );
  } else if (params.beat && !params.suppressBeat) {
    parts.push(renderBeat(params.beat));
  }

  parts.push(FIELD_DICTIONARY);
  parts.push(OUTPUT_CONTRACT);
  return parts.join("\n\n");
}

/* ── Validation of what comes back ──────────────────────────────────────── */

/**
 * Keeps only fields the intake owns, with values that survive their enum.
 *
 * Silently dropping a bad value is correct here and unusual: the conversation
 * continues, the beat stays unsatisfied, and Wing asks again. The alternative —
 * storing "undergraduate" where the enum needs
 * "undergraduate_or_recent_grad" — is a value that looks right in the database
 * and silently routes the student into the wrong population for every session
 * that follows.
 */
export function sanitiseExtracted(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!KNOWN_FIELDS.has(key)) continue;
    /*
     * The baseline fields are read from the user's own words by `readScale` and
     * `classifyBarrier`, never from the model. It sees the 1-to-5 scale in the beat
     * opening and will offer `baseline_positioning_clarity: "quite low"` — a string,
     * in the field that carries the headline institutional metric. Dropped here so
     * there is exactly one thing that can write them.
     */
    if (isCodeOwnedField(key)) continue;
    if (value === null || value === undefined) continue;

    const allowed = ENUM_FIELDS[key];
    if (allowed) {
      if (typeof value === "string" && allowed.includes(value)) out[key] = value;
      continue;
    }

    if (typeof value === "string") {
      const t = value.trim();
      // A long paragraph in a field meant for a phrase is the model narrating
      // rather than extracting. Cap rather than reject: the first part is
      // usually the answer.
      if (t) out[key] = t.length > 2000 ? t.slice(0, 2000) : t;
    } else if (Array.isArray(value)) {
      const items = value.filter((v): v is string => typeof v === "string" && v.trim() !== "");
      if (items.length) out[key] = items.slice(0, 20);
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    }
  }

  return out;
}

/* ── The turn ───────────────────────────────────────────────────────────── */

export type TurnResult = {
  /**
   * The whole reply as one string.
   *
   * Kept alongside `messages` rather than replaced by it: every existing caller reads
   * this, and a delivery layer is not a reason to change what a reply IS. It is also the
   * text the audit runs against, and auditing four fragments separately would let a rule
   * hold in each chunk and be broken by the pair.
   */
  reply: string;
  /**
   * The same reply as the messages the student actually receives, in order, each with the
   * pause that precedes it.
   *
   * Named `delivery` and not `messages` on purpose: `GET /api/intake` already returns
   * `messages` meaning the whole transcript, and one key with two meanings across two
   * endpoints of the same resource is a bug waiting for whoever wires the client.
   *
   * H-007, and v3.3 is firmer than the card: chunked delivery "governs the intake surface
   * throughout and is a design requirement, not a preference". One chunk is the normal
   * case — the splitter deliberately refuses to chop a short reply into fragments.
   */
  delivery: Chunk[];
  /** The beat after the last message. Non-zero only on a reveal, where the pause is the product. */
  pauseAfterMs: number;
  state: IntakeState;
  insightDelivered: boolean;
};

/** Opens the conversation. Idempotent — returns existing state if already begun. */
export async function begin(userId: number): Promise<TurnResult | null> {
  const state = await getState(userId);
  if (!state) return null;
  if (state.messages.length) {
    /*
     * Already begun, so nothing is re-sent: the client has the transcript. `reply` is the
     * last thing Wing said, which after chunking is the last CHUNK rather than a whole
     * reply — correct, because that is the message the student is looking at. `messages`
     * is empty on purpose: replaying a chunk sequence here would re-animate typing pauses
     * for text already on screen.
     */
    const last = state.messages[state.messages.length - 1]?.content ?? "";
    return {
      reply: last,
      delivery: [],
      pauseAfterMs: 0,
      state,
      insightDelivered: state.insightDelivered,
    };
  }

  const [who] = await db
    .select({ firstName: users.firstName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  await sessionStore.startSession(state.sessionId);
  await intakeStore.attachIntakeSession(userId, state.sessionId);

  // The opening is fixed rather than generated. It is the first sentence Wing
  // ever says; it should not vary by model temperature, and there is nothing to
  // adapt to yet.
  const opening =
    `Hi ${who?.firstName ?? "there"} — I'm Wing.\n\n` +
    `Before we get into the real work, I want to understand where you're starting from. ` +
    `This is a conversation, not a form: answer in whatever detail you feel like, and ` +
    `skip anything you'd rather not get into.\n\n` +
    `${BEATS[0].opening}`;

  /*
   * The opening is the clearest case H-007 describes: a greeting, a framing paragraph and
   * then Q1. Delivered as one wall of text it buries the question the student is supposed
   * to answer, and the card's success criterion is exactly that they respond to the final
   * prompt message rather than to the framing.
   */
  const plan = planChunks(opening, { kind: "reply" });
  for (const chunk of plan.chunks) {
    await recordAiTurn(state.sessionId, chunk.text, { channel: "in_app" });
  }

  // The opening asks Q1, so the first answer has something to be an answer to.
  await intakeStore.mergeIntakeResponses(userId, { _asked: askedFor(BEATS[0].key) });

  return {
    reply: opening,
    delivery: plan.chunks,
    pauseAfterMs: plan.pauseAfterMs,
    state: (await getState(userId)) as IntakeState,
    insightDelivered: false,
  };
}

/**
 * One exchange: record what they said, work out what to do, reply.
 */
export async function respond(userId: number, message: string): Promise<TurnResult | null> {
  const before = await getState(userId);
  if (!before) return null;

  const text = message.trim();
  if (!text) return null;

  // Recorded first. If the model call fails afterwards, what the student wrote
  // is still in the transcript — the same rule as the life log.
  await recordHumanTurn(before.sessionId, text, { channel: "in_app" });

  /*
   * This turn's answer, filed under the question it answers — computed here rather
   * than at the write below, because the reveal needs it.
   *
   * `_asked` is written at the END of a turn, so `before.captured._track_answers`
   * holds everything up to but NOT including what the student just said. On the turn
   * where the reveal fires, that is exactly the answer most likely to complete a
   * contradiction: Q7 is asked eighth and RT-08 reads the Q5/Q6/Q7 triangle. Selecting
   * from the stale set would have deferred reveals that qualified.
   */
  const trackAnswers = withTrackAnswer(before.captured, text);

  /*
   * The person wrote to Wing of their own accord, which is the only thing that lifts a
   * safety hold. Recorded here rather than after the reply, because it is true the moment
   * they typed it and a model failure must not cost them the return.
   *
   * Recording is not lifting. `activeHold` still refuses to release inside the seven-day
   * minimum, so on day two this changes nothing — which is the point. And it never
   * suppresses the reply itself: `mayRespondToUser()` is unconditional, and someone in
   * distress who opens the app and types is the person the hold exists for.
   */
  /*
   * ── IG-S06, THE HALF THAT CANNOT BE ASKED FOR ──────────────────────────
   * Wing never asks anyone's age — IG-INT03 forbids demographic collection at intake, so
   * detection is passive by construction and reads only what someone volunteers.
   *
   * Persisted under an underscore key, which `renderCaptured` already filters, so it
   * never reaches the model as something the student told Wing about themselves. It is
   * Wing's own bookkeeping and the model has the conversational half of the rule already.
   *
   * Sticky: once someone has said they are sixteen, a later turn that does not mention it
   * must not clear the footing. Only ever set to true.
   */
  const minorSignal = statedUnder18(text) || statedInSchool(text);
  if (minorSignal && before.captured._minor_stated !== true) {
    try {
      await intakeStore.mergeIntakeResponses(userId, { _minor_stated: true });
      log(`minor protection engaged for user ${userId} (stated, IG-S06)`, "intake");
    } catch (err) {
      log(`could not record IG-S06 signal for user ${userId}: ${(err as Error).message}`, "intake");
    }
  }

  try {
    await recordReturn(db as never, await sessionStore.studentIdFor(userId), new Date());
  } catch (err) {
    // Never break someone's turn over bookkeeping. A missed return costs a held
    // channel for one more turn; a thrown error costs them the conversation.
    log(`could not record safety-hold return for user ${userId}: ${(err as Error).message}`, "intake");
  }

  const [who] = await db
    .select({ firstName: users.firstName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  /*
   * Exchanges, not turns: one exchange is a question and an answer, which is what the
   * spec means by "question 8-10".
   *
   * Counted from the USER's turns rather than from the transcript length, and that is not
   * a simplification. Chunked delivery records each message the student received as its
   * own AI turn, because the transcript has to say what they actually saw — so a
   * four-message reveal adds four assistant rows for one exchange. Halving the total would
   * read that as two and a half exchanges and walk the intake off the end of the spec's
   * question numbering. Counting answers is chunk-proof and is what an exchange means.
   *
   * Identical to the old arithmetic on an unchunked transcript: alternating turns give
   * `ceil((2k + 1) / 2) = k + 1`, and k user turns plus this one is the same k + 1.
   */
  const exchanges = before.messages.filter((m) => m.role === "user").length + 1;

  /*
   * ── PHASE 3.5: WHAT DID WE ASK, AND IS THIS AN ANSWER TO IT? ───────────
   * The baselines are the one part of the intake the code reads rather than the model.
   * A 1-to-5 rating is the number that goes to Berkeley at ninety days, and a model
   * asked to extract it will round, interpret and fill in — so `readScale` reads the
   * user's own words and `baseline-turn.ts` decides what that means.
   *
   * This runs before the prompt is built, because the fields it produces change what
   * Wing should ask next: with B1's score recorded, the next question is B2. Persisted
   * before the model call for the same reason the self-description capture is — a model
   * failure on the next line must not cost an answer the user has already given.
   */
  const turn = planTurn({
    population: before.population,
    captured: before.captured,
    text,
  });

  if (Object.keys(turn.fields).length) {
    await intakeStore.mergeIntakeResponses(userId, turn.fields);
  }
  if (turn.record) {
    await intakeStore.appendBaseline(userId, turn.record.entry, {
      beat: turn.record.beat,
      wave: "T0",
    });
  }
  if (turn.baseline.kind !== "none") {
    log(`[intake] baseline — ${describePlan(turn.baseline)}`, "intake");
  }

  /*
   * ── THE EARLY INSIGHT, IN TWO PARTS ────────────────────────────────────
   * A1 calls this the early value add and marks it critical: "by approximately
   * question 8-10 … Wing must surface a preliminary insight". It has two questions
   * in it and they were answered by one boolean.
   *
   * TIMING — `insightReady` and `insightWindowClosed`. Enough exchanges, enough
   * material beats satisfied, not already delivered, not past the window.
   *
   * CONTENT — `selectReveal`, which is where her rules live: fourteen templates in
   * five priority bands, each with a trigger over classified facts, a track
   * restriction, and a falsifiability requirement that refuses a template with
   * nothing quotable. It returns one template or an IG-INT06 deferral, and it cannot
   * return a blend — "Frankenstein reveals lose coherence".
   *
   * Only timing ran. `selectReveal`, `revealFacts` and the track detector were all
   * written and tested and imported by nothing, so what fired was the generic
   * instruction: find a tension somewhere in everything they have said. That reveals
   * something most of the time, and it is not what she specified — no band priority,
   * no falsifiability check, and no way to decline.
   *
   * Deferral is the part worth having most. The old path could not say no: once the
   * timing gate opened, the model was told to produce an insight, and a weak one at
   * the moment the product is asking someone to believe it is worse than none. That
   * is IG-INT06's whole argument, and the reveal moves to the start of Foundation 1.
   */
  /*
   * `!turn.wrapUp`: an insight the model wrote this turn would have landed inside
   * `parsed.reply` — which is discarded outright on a wrap-up turn in favour of the
   * fixed `CLOSING_REPLY` (see below). Without this guard, a reveal could be marked
   * delivered (`markEarlyInsightDelivered`) for an insight the student never actually
   * saw, permanently burning the one early-insight opportunity intake gets.
   */
  const timingReady =
    !turn.wrapUp &&
    insightReady({
      exchanges,
      population: before.population,
      captured: turn.captured,
      alreadyDelivered: before.insightDelivered,
    }) && !insightWindowClosed(exchanges);

  let insightDirective: string | null = null;
  if (timingReady) {
    const chosen = chooseReveal(trackAnswers ?? before.captured._track_answers);
    if (!chosen) {
      log(`reveal held for user ${userId}: no Q-numbered answers recorded yet`, "intake");
    } else if (chosen.selection.outcome === "fire") {
      insightDirective = revealDirective(chosen.selection.template, chosen.facts);
      log(
        `reveal ${chosen.selection.template.code} for user ${userId}: ${chosen.selection.because}`,
        "intake",
      );
    } else {
      log(`reveal deferred for user ${userId}: ${chosen.selection.because}`, "intake");
    }
  }

  const style = readStyle(before.captured);

  /*
   * Safety is not fetched, not conditional and not filtered — it cannot be, or it
   * would not be a safety rule. Voice and gates are legitimately absent until a
   * cohort points at a published profile and a published sequence carries
   * intake-scoped gates, and both render nothing in the meantime rather than
   * failing the turn. Same fail-open shape as the Foundation path.
   *
   * Danielle's intake trait hierarchy — lead with ENCOURAGING and CURIOUS, prove
   * you are paying attention before asking for anything — is in voice profile v2
   * and reaches a student through this call and nowhere else.
   */
  const studentId = await sessionStore.studentIdFor(userId);
  const safetySection = compileSafety();

  const [voiceContext, loadedGates] = await Promise.all([
    voice.voiceSectionFor({
      studentId,
      sessionType: "intake",
      studentTurns: before.messages
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .concat([text]),
    }),
    engine.loadTurnGates({ studentId, sessionId: before.sessionId }),
  ]);
  const gateContext = engine.compileTurnGates(loadedGates);

  log(
    `[intake] safety ${safetyTokenEstimate(safetySection)} tokens; ` +
      (voiceContext.section
        ? `voice profile #${voiceContext.profileId} (${voiceContext.tokens} tokens` +
          `${voiceContext.register ? `, ${voiceContext.register} register` : ""}` +
          `${voiceContext.doorway ? `, ${voiceContext.doorway} doorway` : ", no doorway"})`
        : "no voice profile") +
      "; " +
      (gateContext ? `${gateContext.active.length} gate(s)` : "no gates"),
    "intake",
  );

  const system = buildSystemPrompt({
    beat: turn.beat,
    captured: turn.captured,
    style,
    insightDirective,
    firstName: who?.firstName ?? "there",
    wrapUp: turn.wrapUp,
    safetySection,
    voiceSection: voiceContext.section,
    gateSection: gateContext?.section ?? null,
    baselineGuidance: turn.guidance,
    suppressBeat: turn.suppressBeat,
  });

  let parsed: {
    reply?: string;
    extracted?: unknown;
    deliveryStyle?: unknown;
    deliveredInsight?: unknown;
    /**
     * The model's own answer to "did I just apply the crisis rule".
     *
     * ── WHY THE MODEL AND NOT A DETECTOR ───────────────────────────────────
     * IG-S01's own wording rules out a phrase list: "The line is scope, not intensity."
     * A regex on hopelessness vocabulary would fire on "this job market is hopeless" and
     * miss "I don't see the point of anything anymore", which is her worked example of
     * the thing it must catch. Writing one would be inventing a crisis classifier she did
     * not specify, on the surface where being wrong costs the most.
     *
     * The model is already required to make this judgement — the rule is unconditional in
     * every prompt and tells it to stop coaching. Asking it to report what it did adds no
     * new judgement; it only writes down one that was already made and was, until now,
     * thrown away.
     *
     * It is a floor, not a ceiling. A hold opened here can only be too cautious, which her
     * rule explicitly permits: "Reading it too cautiously is acceptable. Missing it is not."
     */
    safetyHold?: unknown;
  };

  try {
    const result = await orchestrator.complete({
      // "mid": a short adaptive reply plus field extraction. Latency matters
      // more than depth on the first screen a student ever sees.
      tier: "mid",
      system,
      maxTokens: 1200,
      temperature: 0.7,
      messages: [
        ...before.messages,
        { role: "user" as const, content: text },
      ],
    });
    parsed = parseJsonResponse(result.text, "intake turn");
  } catch (err) {
    log(`intake turn failed for user ${userId}: ${(err as Error).message}`, "intake");
    return null;
  }

  /*
   * ── THE CLOSE IS FIXED, NOT MODEL-COMPOSED ─────────────────────────────
   * See `CLOSING_REPLY`/`CLOSING_NUDGE` above for why: a soft instruction telling the
   * model to stop asking things has already been shown, in production, not to hold once
   * `wrapUp` goes true — this is the code-level guarantee that a soft instruction can't
   * be. `alreadyClosed` distinguishes the first wrap-up turn (warmer, names what's next)
   * from every one after it (short, because the risk on turn two is the model treating
   * its OWN closing line as an opening to keep going).
   */
  const alreadyClosed = before.captured._closing_reached === true;
  let reply: string;
  if (turn.wrapUp) {
    reply = alreadyClosed ? CLOSING_NUDGE : CLOSING_REPLY(who?.firstName ?? "there");
  } else {
    reply = String(parsed.reply ?? "").trim();
    if (!reply) {
      log(`intake turn produced no reply for user ${userId}`, "intake");
      return null;
    }
  }

  /* Persist: structured fields first, so the transcript never claims a field
     was captured that was not stored. */
  const extracted = sanitiseExtracted(parsed.extracted);
  if (Object.keys(extracted).length) {
    // mergeIntakeResponses, NOT upsertBrandingIntake: the latter replaces the
    // whole responses object, which would discard everything captured so far
    // on every turn.
    await intakeStore.mergeIntakeResponses(userId, extracted);

    // professional_status is not just an intake field — it is the population
    // tag that selects criteria, methodology and objectives for every session
    // that follows, and it lives on wing.users. Mirrored here rather than
    // derived later, so there is one answer to "which population is this".
    if (typeof extracted.professional_status === "string") {
      await db
        .update(users)
        .set({ professionalStatus: extracted.professional_status as any, updatedAt: new Date() })
        .where(eq(users.id, userId));
    }

    /*
     * `pathway` is NOT taken from the model here, and the branch that did has been
     * removed rather than left in.
     *
     * It could never have run: `KNOWN_FIELDS` is built from the beats' `captures`
     * arrays and no beat captures `pathway`, so `sanitiseExtracted` dropped the key
     * before this line ever saw it. What it looked like from a distance was a field
     * being written; what it was, was a comment describing a mechanism that did not
     * exist — and `intake_records.pathway` sat NULL for every student while A2's
     * founder/freelancer branch waited on it.
     *
     * It is derived instead, once, as intake closes: see `derivePathway`. That is
     * what `intake-beats.test.ts` says it should be — "it must be derived from the
     * audience track" — and deriving from the track is stronger than asking a model
     * to classify, because the track rules are enumerated and tested.
     */
  }

  /*
   * ── GUARANTEEING A BEAT IS SATISFIED ONCE IT HAS BEEN ANSWERED ─────────
   * `turn.answeredBeat` is the beat this message is a reply to — the question Wing
   * actually asked last turn. If nothing this turn's extraction wrote landed in any
   * field that beat owns, `isSatisfied` would still say no, and `nextBeatAfter`'s
   * forward walk plus its `nextBeat` fallback would eventually surface this exact
   * beat again — see `verbatimFallbackField` in intake-beats.ts for the full story
   * and the real transcript that found it (Q4, asked six times).
   *
   * Baselines are excluded: B1/B2/B3 are already guaranteed satisfied by
   * `planTurn`/`planBaselineTurn` above (recorded, declined, or mid-re-ask), which
   * runs before this and does not need a second guarantee.
   *
   * This never overrides a real extraction — it only fires when nothing landed —
   * and it stores exactly what the student wrote, which is what "the intake is only
   * to gather information" means when the information does not fit any of the
   * beat's named fields.
   */
  const answeredBeatDef = turn.answeredBeat ? BEATS.find((b) => b.key === turn.answeredBeat) : null;
  if (answeredBeatDef && answeredBeatDef.question.charAt(0) !== "B") {
    const mergedSoFar = { ...turn.captured, ...extracted };
    if (!isSatisfied(answeredBeatDef, mergedSoFar)) {
      const field = verbatimFallbackField(answeredBeatDef);
      const raw = text.length > 2000 ? text.slice(0, 2000) : text;
      await intakeStore.mergeIntakeResponses(userId, { [field]: raw });
      log(
        `[intake] ${answeredBeatDef.key} (${answeredBeatDef.question}) had no field extracted ` +
          `from the student's answer; stored it verbatim under ${field} so it is not re-asked`,
        "intake",
      );
    }
  }

  /*
   * ── THE SELF-DESCRIPTION CAPTURE ───────────────────────────────────────
   * Danielle, 19 August: "Start capturing now, regardless of intake build order...
   * retroactive capture is impossible."
   *
   * After the extraction, because whether the turn captured a field is the evidence
   * that the user said something about themselves rather than asking what this is.
   * Before the reply is recorded, so a model failure on the next line cannot cost a
   * row that can never be recreated.
   *
   * `answeredBeat` is the beat whose answer this message contains — the question Wing
   * actually put to them last turn, not the one it is about to ask.
   */
  const capture = captureForTurn({
    askedBeat: turn.answeredBeat,
    extractedFields: Object.keys(extracted),
    afterInsight: before.insightDelivered,
    reactionAlreadyStored: before.insightDelivered
      ? await selfDescriptionStore.hasRevealReaction(studentId)
      : false,
  });
  if (capture) {
    await selfDescriptionStore.captureSelfDescription({
      studentId,
      sessionId: before.sessionId,
      capture,
      // The user's words. Never `reply`.
      userText: text,
    });
    log(
      `[intake] captured self-description: ${capture.askedAs}` +
        `${capture.sourceQuestion ? ` (${capture.sourceQuestion}, ${capture.equivalence})` : " (no equivalent question)"}` +
        `, ${capture.provenance}`,
      "intake",
    );
  }

  const styleFromModel = isDeliveryStyle(parsed.deliveryStyle) ? parsed.deliveryStyle : null;
  if (styleFromModel && styleFromModel !== style) {
    await intakeStore.mergeIntakeResponses(userId, { _delivery_style: styleFromModel });
  }

  /*
   * What this reply just asked for, so the next turn can read its own answer correctly.
   *
   * Written before the reply is recorded: if this write failed after the transcript
   * already carried the question, the next turn would parse a follow-up answer as a
   * baseline score — the exact failure `_asked` exists to prevent. A recorded reply with
   * missing bookkeeping is recoverable; the reverse is silent bad data.
   *
   * Null on the closing turn, which asks for nothing.
   */
  await intakeStore.mergeIntakeResponses(userId, {
    _asked: turn.nextAsked,
    ...(trackAnswers ? { _track_answers: trackAnswers } : {}),
    // Sticky once true — see `alreadyClosed` above. `turn.wrapUp` independently
    // re-evaluates true on every turn from here on anyway (nothing becomes
    // unsatisfied again), so this only needs to ever be written, never cleared.
    ...(turn.wrapUp ? { _closing_reached: true } : {}),
  });

  /*
   * ── DELIVERY ───────────────────────────────────────────────────────────
   * H-007. The model is told to write one reply; a model told to send three messages
   * sends one message with two blank lines in it, so the split is a decision the code
   * makes about text the model produced.
   *
   * `kind` matters. A reveal gets the longer beat before its deepening question, and the
   * gate that decides whether a reveal happened is the same conjunction used below: the
   * gate opened AND the model says it wrote one. Passing "reveal" on a turn where it
   * declined would spend the four-second pause on an ordinary answer, and the pause only
   * reads as a pause because it is longer than any typing gap.
   */
  /*
   * Marked delivered only when BOTH the gate opened and the model says it actually wrote
   * one. The model is allowed to decline — the prompt tells it to, if it cannot point at
   * two things that pull against each other — and marking it delivered anyway would burn
   * the one chance at that moment on a turn where it never happened.
   */
  const revealed = insightDirective !== null && parsed.deliveredInsight === true;
  const plan = planChunks(reply, { kind: revealed ? "reveal" : "reply" });

  /*
   * ── THE SAFETY HOLD ────────────────────────────────────────────────────
   * The model reports that it applied the crisis rule; this is what makes that report
   * mean something. Until now the judgement was made on every turn and discarded, so
   * IG-S01 changed what Wing said and nothing else — no record, and every scheduled
   * channel kept sending.
   *
   * Written before the reply is recorded, on the same rule as `_asked`: a hold that
   * failed to save after the transcript already carried the crisis turn is the one
   * ordering that loses. `openHold` is idempotent within an open hold, so a second
   * crisis turn does not restart the seven-day minimum — which would make the minimum a
   * function of how much someone talks.
   *
   * `reportsCrisis` rather than a truthy check: the value comes from a JSON parse of
   * model output, and `if (parsed.safetyHold)` opens a hold on the string "false".
   */
  if (reportsCrisis(parsed.safetyHold)) {
    try {
      await openHold(
        db as never,
        studentId,
        "IG-S01 applied during intake; recorded from the turn's own report",
      );
      log(`safety hold opened for student ${studentId} (IG-S01, intake)`, "intake");
    } catch (err) {
      /*
       * Loud, and it does not stop the reply. The reply is the caring message the rule
       * asks for and the student must get it. What is lost is the outbound suppression,
       * and `maySend` fails closed on an unreadable table — so the failure mode of a
       * failed write is a student who keeps receiving scheduled messages, which is
       * exactly why this logs at the level someone reads.
       */
      log(
        `FAILED to open safety hold for student ${studentId}: ${(err as Error).message} — ` +
          "outbound contact is NOT suppressed for this student",
        "intake",
      );
    }
  }

  /*
   * Each chunk is its own AI turn, because the transcript is the record of what the
   * student saw. One row holding all four would make the audit and any later read of the
   * conversation disagree with the conversation.
   *
   * Sequentially, not in parallel: `recordAiTurn` appends, and four concurrent appends
   * have no defined order. Out-of-order chunks in the transcript would be invisible until
   * someone read a reveal back and found the deepening question before the observation.
   */
  for (const chunk of plan.chunks) {
    await recordAiTurn(before.sessionId, chunk.text, { channel: "in_app" });
  }

  /*
   * Wing wrote more than four chunks' worth. Not an error and not something to truncate —
   * her own note calls this a voice problem rather than a delivery one — but it is the
   * signal that the intake voice is drifting long, and nothing else would ever say so.
   */
  if (plan.tooLong) {
    log(
      `intake reply for user ${userId} exceeded ${plan.chunks.length} chunks; ` +
        "the last one absorbed the remainder",
      "intake",
    );
  }

  if (revealed) await intakeStore.markEarlyInsightDelivered(userId);

  const after = await getState(userId);
  return {
    reply,
    delivery: plan.chunks,
    pauseAfterMs: plan.pauseAfterMs,
    state: after as IntakeState,
    insightDelivered: revealed,
  };
}

/* ── The audience track, and the one field A2 derives from it ───────────── */

/**
 * This turn's answer, filed under the question it answers.
 *
 * `audience-track` reads her question codes — Q1…Q7 — and nothing else: no name, no
 * profile, no demographics. `Beat.question` is the mapping and it is already declared
 * on every beat, so nothing here is invented; `_asked` says which beat the student is
 * answering, and this files the text under that beat's question.
 *
 * ── WHY A SECOND COPY OF TEXT THE TRANSCRIPT ALREADY HAS ─────────────────
 * Reluctantly, and because the alternative is not "one copy" but "no derivation". The
 * transcript records what was said and in what order; it does not record which beat
 * each turn answered, and `_asked` is overwritten every turn. Once intake closes, the
 * mapping is unrecoverable, so it is kept as it is made.
 *
 * Underscore-prefixed, so `renderCaptured` filters it and the model never reads it
 * back as something the student volunteered — the same rule `_asked` and
 * `_delivery_style` follow.
 *
 * Baselines are skipped. Her B1–B3 are scores, the track rules read none of them, and
 * a number filed as an answer would only dilute the text the regexes run over.
 */
function withTrackAnswer(
  captured: Record<string, unknown>,
  text: string,
): Record<string, string> | null {
  const asked = captured._asked as { beat?: string } | null | undefined;
  if (!asked?.beat) return null;

  const beat = BEATS.find((b) => b.key === asked.beat);
  if (!beat || beat.question.charAt(0) !== "Q") return null;

  const prior = (captured._track_answers ?? {}) as Record<string, string>;
  return { ...prior, [beat.question]: text };
}

/**
 * The reveal for this turn: her track detection, her fact classification, her
 * selection rules — or null when there is nothing recorded to run them over.
 *
 * Returns the facts alongside the selection because the directive quotes them, and
 * recomputing would mean two answers to "what did it decide from".
 */
function chooseReveal(
  raw: unknown,
): { selection: ReturnType<typeof selectReveal>; facts: ReturnType<typeof revealFacts> } | null {
  const answers = (raw ?? {}) as Answers;
  if (!Object.keys(answers).length) return null;

  const track = detectTrack(answers).track;
  const facts = revealFacts(answers, track);
  return { selection: selectReveal(facts), facts };
}

/**
 * Derives `intake_records.pathway` and writes it. Called once, as intake closes.
 *
 * ── THE FIELD THAT NOTHING WROTE ─────────────────────────────────────────
 * A2's founder/freelancer branch is built and was receiving nothing.
 * `PATHWAY_GUIDANCE` is injected into every Foundation prompt and `populationTagsFor`
 * maps venture and freelance onto the entrepreneur populations — and the column those
 * read stayed NULL for every student, so a founder was coached as an employee.
 *
 * Not because the question was dropped by accident: it was dropped on purpose, and
 * `intake-beats.test.ts` records the decision — "pathway is no longer asked … it must
 * be derived from the audience track". The deriver was written too. It had no caller,
 * so nothing asked and nothing derived, and the only visible trace was a NULL column.
 *
 * ── WHY AT finish() AND NOT PER TURN ─────────────────────────────────────
 * `detectTrack` wants two questions to agree before it will name a track, so a partial
 * answer set produces a worse verdict rather than an earlier one. Nothing downstream
 * reads the pathway until a Foundation session opens, which is after this.
 *
 * ── AND WHY IT CAN STILL DECLINE ─────────────────────────────────────────
 * `pathwayFor` always returns a value — employment is its residual — so it is only
 * called once there is at least one answer to read. Writing "employment" for a student
 * who has told Wing nothing would be a guess wearing a derivation's clothes.
 *
 * Best-effort: a failure here costs a branch, and throwing would cost the student the
 * end of their intake.
 */
async function derivePathway(userId: number, captured: Record<string, unknown>): Promise<void> {
  try {
    const answers = (captured._track_answers ?? {}) as Answers;
    if (!Object.keys(answers).length) {
      log(`no pathway derived for user ${userId}: no Q-numbered answers recorded`, "intake");
      return;
    }

    const verdict = detectTrack(answers);
    const pathway = pathwayFor(verdict.track, answers);
    await intakeStore.setPathway(userId, pathway);

    log(
      `pathway for user ${userId}: ${pathway} ` +
        `(track ${verdict.track ?? "none"}, ${verdict.confidence})`,
      "intake",
    );
  } catch (err) {
    log(`pathway derivation failed for user ${userId}: ${(err as Error).message}`, "intake");
  }
}

function readStyle(captured: Record<string, unknown>): DeliveryStyle | null {
  const v = captured._delivery_style;
  return isDeliveryStyle(v) ? v : null;
}

/**
 * Closes the intake.
 *
 * Called once the optional demographics step is submitted (or skipped). Marks
 * the session complete so the transcript is sealed, and records the intake as
 * done so the dashboard stops routing them back here.
 */
export async function finish(userId: number): Promise<void> {
  const state = await getState(userId);
  if (!state) return;

  // Before the transcript is sealed, so a failure here is visible in the same run.
  await derivePathway(userId, state.captured);

  const { completeTranscript } = await import("./provenance");
  await sessionStore.completeSession(state.sessionId);
  await completeTranscript(state.sessionId);

  await intakeStore.upsertBrandingIntake(userId, { completed: true });
}

/** Beats, for the progress display. Not the questions — the shape of them. */
export function beatsFor(population: PopulationTag | null) {
  return applicableBeats(population).map((b) => ({ key: b.key, required: b.required }));
}
