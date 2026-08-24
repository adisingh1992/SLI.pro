import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/wing-schema";
import { log } from "../logger";
import { parseJsonResponse } from "../json-response";
import * as orchestrator from "../orchestrator";
import * as sessionStore from "./session-store";
import * as intakeStore from "./intake-store";
import * as engine from "./engine";
import * as voice from "./voice";
import { compileSafety, safetyTokenEstimate } from "./safety-rules";
import { captureForTurn } from "./self-description";
import * as selfDescriptionStore from "./self-description-store";
import { recordAiTurn, recordHumanTurn } from "./provenance";
import {
  BEATS,
  DELIVERY_STYLES,
  applicableBeats,
  insightReady,
  insightWindowClosed,
  isComplete,
  isDeliveryStyle,
  progress,
  satisfiedKeys,
  type Beat,
  type DeliveryStyle,
  type PopulationTag,
} from "./intake-beats";
import { askedFor, describePlan, isCodeOwnedField, planTurn } from "./baseline-turn";

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
"${beat.opening}"${scale}`;
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
  "deliveredInsight": boolean  // true only if your reply contains the early insight
}

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
  withInsight: boolean;
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
    `Their first name is ${params.firstName}.`,
    renderStyle(params.style),
  ];

  parts.push(renderCaptured(params.captured));

  if (params.withInsight) parts.push(INSIGHT_INSTRUCTION);

  if (params.baselineGuidance) parts.push(params.baselineGuidance);

  if (params.wrapUp) {
    parts.push(
      `── THIS TURN: CLOSING ───────────────────────────────────────────────
You have what you need. Say so briefly, tell them what happens next — a short
set of optional questions, then their first real session — and stop asking
things. Do not recap everything they told you.`,
    );
  } else if (params.beat && !params.suppressBeat) {
    parts.push(renderBeat(params.beat));
  }

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
  reply: string;
  state: IntakeState;
  insightDelivered: boolean;
};

/** Opens the conversation. Idempotent — returns existing state if already begun. */
export async function begin(userId: number): Promise<TurnResult | null> {
  const state = await getState(userId);
  if (!state) return null;
  if (state.messages.length) {
    return { reply: state.messages[state.messages.length - 1]?.content ?? "", state, insightDelivered: state.insightDelivered };
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

  await recordAiTurn(state.sessionId, opening, { channel: "in_app" });

  // The opening asks Q1, so the first answer has something to be an answer to.
  await intakeStore.mergeIntakeResponses(userId, { _asked: askedFor(BEATS[0].key) });

  return { reply: opening, state: await getState(userId) as IntakeState, insightDelivered: false };
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

  const [who] = await db
    .select({ firstName: users.firstName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  // Exchanges, not turns: one exchange is a question and an answer, which is
  // what the spec means by "question 8-10".
  const exchanges = Math.ceil((before.messages.length + 1) / 2);

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

  const wantsInsight =
    insightReady({
      exchanges,
      population: before.population,
      captured: turn.captured,
      alreadyDelivered: before.insightDelivered,
    }) && !insightWindowClosed(exchanges);

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
    withInsight: wantsInsight,
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

  const reply = String(parsed.reply ?? "").trim();
  if (!reply) {
    log(`intake turn produced no reply for user ${userId}`, "intake");
    return null;
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
     * pathway gets its own column as well as living in structured_responses.
     *
     * `intake_records.pathway` is what A2's founder/freelancer branch reads,
     * and the sessions change register on it — hiring manager, investor or
     * client. Leaving it only inside the JSON blob would mean every consumer
     * reaching into structured_responses to find it, which is how a field ends
     * up with two answers.
     */
    if (typeof extracted.pathway === "string") {
      await intakeStore.setPathway(userId, extracted.pathway as any);
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
  await intakeStore.mergeIntakeResponses(userId, { _asked: turn.nextAsked });

  await recordAiTurn(before.sessionId, reply, { channel: "in_app" });

  /*
   * The insight is marked delivered only when BOTH the gate opened and the
   * model says it actually wrote one. The model is allowed to decline — the
   * prompt tells it to, if it cannot point at two things that pull against
   * each other — and marking it delivered anyway would burn the one chance at
   * that moment on a turn where it never happened.
   */
  const delivered = wantsInsight && parsed.deliveredInsight === true;
  if (delivered) await intakeStore.markEarlyInsightDelivered(userId);

  const after = await getState(userId);
  return { reply, state: after as IntakeState, insightDelivered: delivered };
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

  const { completeTranscript } = await import("./provenance");
  await sessionStore.completeSession(state.sessionId);
  await completeTranscript(state.sessionId);

  await intakeStore.upsertBrandingIntake(userId, { completed: true });
}

/** Beats, for the progress display. Not the questions — the shape of them. */
export function beatsFor(population: PopulationTag | null) {
  return applicableBeats(population).map((b) => ({ key: b.key, required: b.required }));
}
