import { eq } from "drizzle-orm";
import { db } from "../db";
import { transcriptTurns } from "@shared/wing-schema";
import * as orchestrator from "../orchestrator";
import { parseJsonResponse } from "../json-response";
import { log } from "../logger";
import * as store from "./heuristics-store";
import {
  INTENSITY_RECOVERY_GUIDANCE,
  buildSignalCatalogue,
  catalogueRules,
  intensityOf,
  interpretDetection,
  shouldDeferHighIntensity,
} from "./engine-rules";
import {
  compileGates,
  excludedGates,
  turnPathGates,
  type GateCard,
  type GateConditions,
} from "./gate-compiler";
import { countUnansweredForStudent } from "./homework-store";
import { auditReply } from "./gate-audit";
import { gateAuditFindings } from "@shared/wing-schema";
import type { HeuristicCard } from "./heuristics-store";

/**
 * The heuristics engine — the real-time loop from spec §6.
 *
 * Per turn: read the active sequence for the student, evaluate the turn
 * against the signal definitions in heuristic_components, and if a signal
 * fires, return the intervention and coaching move as context for Wing's next
 * response. The application is logged with the exact component versions used.
 *
 * WHAT THIS MODULE DOES NOT DO
 * It does not generate Wing's reply. It returns guidance that the caller folds
 * into its existing LLM call, so there is exactly one place where Wing speaks.
 * It also encodes no methodology: every signal, intervention and coaching move
 * is read from the database (spec §2, "code the engine, not the heuristics").
 *
 * FAILURE POSTURE — read this before changing anything here
 * Detection is best-effort and must NEVER break a session. Every failure path
 * returns null, which means "no heuristic fired" and leaves the conversation
 * exactly as it would have been. A student in the middle of a Foundation
 * Session must not see an error because a classifier call timed out. Failures
 * are logged loudly rather than swallowed silently — the bug that hid inside a
 * bare catch cost a day, and this module has more catch blocks than most.
 */

/** How many prior turns of context the detector sees. Keeps the Nano call small. */
const CONTEXT_TURNS = 6;

export type DetectedSignal = {
  heuristicId: number;
  name: string;
  confidence: number;
  /** Why the detector thought this fired — stored on the application log. */
  rationale: string;
  signalComponentId: number;
  interventionComponentId: number | null;
  /**
   * Legacy free-text intervention. Null on every v2 card: v2 splits that into
   * `intervention_type` (a column on the card) and `coaching_move`. Kept so
   * pre-v2 cards still render, and so the difference is visible rather than
   * silently absent.
   */
  intervention: string | null;
  coachingMove: string | null;
  /** COACH · CHALLENGE · … — what H-003 derives intensity from. */
  interventionType: string | null;
  /** v2. Per-population and per-personality delivery rules. */
  deliveryAdaptation: string | null;
  /** v2. What to do when the intervention does not land. */
  failurePath: string | null;
};

export type EngineGuidance = {
  detected: DetectedSignal;
  sequenceId: number;
  cycleId: number | null;
  applicationId: number;
  /** Ready to append to the system prompt of the caller's completion call. */
  systemPromptFragment: string;
};

/* ── Detection ──────────────────────────────────────────────────────────── */

function buildDetectorSystemPrompt(cards: HeuristicCard[]): string {
  // Only cards with a signal can be matched against, and only coaching cards
  // should be here at all — the caller filters by kind, this is belt and braces.
  const catalogue = buildSignalCatalogue(
    cards
      .filter((c) => c.components.signal && c.cardKind === "coaching_card")
      .map((c) => ({
        heuristicId: c.heuristicId,
        name: c.name,
        weight: c.weight,
        signal: c.components.signal!.content,
      })),
  );

  return [
    "You are a signal detector inside a professional-branding coaching system.",
    "You are given a catalogue of behavioural signal definitions and the latest",
    "turn of a conversation. Decide whether the student's latest turn matches",
    "ONE of the signal definitions.",
    "",
    "Signal catalogue:",
    catalogue,
    "",
    "Rules:",
    ...catalogueRules(),
    "",
    'Reply with JSON only: {"heuristicId": <number|null>, "confidence": <0..1>,',
    '"rationale": "<one sentence>"}',
    'If nothing matches, reply {"heuristicId": null, "confidence": 0, "rationale": "..."}',
  ].join("\n");
}

/**
 * Runs the Nano-tier detector against the latest turn.
 *
 * Nano because this is on the session's critical path — the whole real-time
 * cycle is meant to complete within the turn, so the detector must be small
 * and fast. Returns null on no match, low confidence, or any failure.
 */
export async function detectSignal(params: {
  cards: HeuristicCard[];
  content: string;
  recentTurns?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<DetectedSignal | null> {
  const candidates = params.cards.filter((c) => c.components.signal);
  if (!candidates.length) return null;

  const context = (params.recentTurns ?? []).slice(-CONTEXT_TURNS);

  let raw: string;
  try {
    const result = await orchestrator.complete({
      tier: "nano",
      system: buildDetectorSystemPrompt(candidates),
      messages: [
        ...context,
        { role: "user", content: `Student's latest turn:\n${params.content}` },
      ],
      maxTokens: 300,
      temperature: 0,
    });
    raw = result.text;
  } catch (err) {
    log(`signal detection call failed: ${(err as Error).message}`, "engine");
    return null;
  }

  let parsed: unknown;
  try {
    parsed = parseJsonResponse(raw, "Signal detection");
  } catch (err) {
    log(`signal detection returned non-JSON: ${(err as Error).message}`, "engine");
    return null;
  }

  const verdict = interpretDetection(
    parsed,
    candidates.map((c) => c.heuristicId),
  );

  if (!verdict.accepted) {
    // Only the anomalous rejections are logged; "no_match" and "low_confidence"
    // are the normal case and would drown the log.
    if (verdict.reason === "unknown_heuristic" || verdict.reason === "malformed") {
      log(
        `signal detection rejected (${verdict.reason}): ${JSON.stringify(parsed).slice(0, 200)}`,
        "engine",
      );
    }
    return null;
  }

  const card = candidates.find((c) => c.heuristicId === verdict.heuristicId)!;

  return {
    heuristicId: card.heuristicId,
    name: card.name,
    confidence: verdict.confidence,
    rationale: verdict.rationale,
    signalComponentId: card.components.signal!.id,
    interventionComponentId: card.components.intervention?.id ?? null,
    intervention: card.components.intervention?.content ?? null,
    coachingMove: card.components.coaching_move?.content ?? null,
    interventionType: card.interventionType,
    deliveryAdaptation: card.components.delivery_adaptation?.content ?? null,
    failurePath: card.components.failure_path?.content ?? null,
  };
}

/* ── Integrity gates ────────────────────────────────────────────────────── */

/**
 * The gate section for a student's current session, or null.
 *
 * Separate from `evaluateTurn` on purpose. Gates apply to every reply Wing makes
 * whether or not a coaching signal fired, and `evaluateTurn` returns null when
 * nothing fires — so riding on its result would silently drop every rule on the
 * majority of turns, which is exactly when a rule about what Wing must never say
 * matters most.
 *
 * Returns null rather than "" so the caller can tell "no methodology published"
 * from "published and it compiled to nothing".
 */
export type GateContext = {
  /** Ready to prepend to the system prompt, or null when there is nothing. */
  section: string | null;
  /** The gates actually in force this turn, for the post-delivery audit. */
  active: Array<{ heuristicId: number; cardCode: string }>;
};

/**
 * The gate cards for this session, loaded but not yet rendered.
 *
 * ── WHY LOADING AND COMPILING ARE SEPARATE ───────────────────────────────
 * Two gates apply only when a fact about this turn holds: IG-U03 when the student
 * has uploaded something, IG-U05 when they have an unanswered task — see
 * GATE_PRECONDITIONS in gate-compiler.ts for why compiling them regardless is
 * worse than wasteful. One of those facts, whether an uploaded document is in
 * this turn's context, is not known until the context read returns, and the
 * caller deliberately starts the gate read BEFORE that so the two overlap.
 * Compiling inside the load would mean compiling before the answer exists.
 *
 * So the database work happens here and the rendering happens in
 * `compileTurnGates`, which is synchronous and takes the facts. The overlap
 * survives and the preconditions are honoured.
 */
export type LoadedGates = {
  gates: GateCard[];
  /** Card code → heuristic id, so an audit finding can be attributed. */
  byCode: Map<string, number>;
  /** Unanswered assigned tasks. IG-U05's precondition. */
  openTasks: number;
};

export async function loadTurnGates(params: {
  studentId: number;
  sessionId: number;
}): Promise<LoadedGates | null> {
  try {
    const [sequence, openTasks] = await Promise.all([
      store.getActiveSequenceForStudent(params.studentId, {
        kinds: ["integrity_gate"],
        sessionId: params.sessionId,
      }),
      /*
       * A count, not the questions. The gate needs to know that something is
       * outstanding; the text of what was asked is the student's and has no
       * business in a rules section. Never rejects — a missing count must not
       * cost the turn its gates, and undefined would read as "unknown", which
       * counts as satisfied.
       */
      countUnansweredForStudent(params.studentId).catch(() => 0),
    ]);
    if (!sequence?.cards.length) return null;

    return {
      gates: sequence.cards.map((c) => ({
        cardCode: c.cardCode,
        name: c.name,
        coachingMove: c.components.coaching_move?.content ?? null,
        failurePath: c.components.failure_path?.content ?? null,
        appliesToSession: c.appliesToSession,
      })),
      byCode: new Map(sequence.cards.map((c) => [c.cardCode, c.heuristicId])),
      openTasks,
    };
  } catch (err) {
    /*
     * Never throws. A failure to load the gates must not fail the turn — but it
     * is logged loudly rather than swallowed, because a turn that proceeds
     * without them is a turn with no integrity rules applied, and that is not
     * something to discover later from a transcript.
     */
    log(`gate load failed: ${(err as Error).message}`, "engine");
    return null;
  }
}

/**
 * Renders the loaded gates against the facts of this turn.
 *
 * Pure and synchronous, so it can run at the point in the route where the
 * context is finally known without adding a wait. `conditions` carries what the
 * caller learned after the load started; `openTasks` comes from the load itself
 * and the caller may override it.
 */
export function compileTurnGates(
  loaded: LoadedGates | null,
  conditions: GateConditions = {},
): GateContext | null {
  if (!loaded) return null;

  const facts: GateConditions = { openTasks: loaded.openTasks, ...conditions };
  const skipped = excludedGates(loaded.gates, facts);
  if (skipped.length) {
    log(
      `gates excluded from the turn prompt: ` +
        skipped.map((s) => `${s.cardCode} (${s.reason})`).join(", "),
      "engine",
    );
  }

  const compiled = compileGates(loaded.gates, { conditions: facts });
  return {
    section: compiled || null,
    // The audit is scoped to the gates that were actually in the prompt, so a
    // reply is never measured against a rule Wing was never given.
    active: turnPathGates(loaded.gates, facts).map((g) => ({
      heuristicId: loaded.byCode.get(g.cardCode) ?? 0,
      cardCode: g.cardCode,
    })),
  };
}

/**
 * Checks a delivered reply against the gates that were in force, and records
 * what it found.
 *
 * Runs AFTER the response has closed, deliberately. Thirteen gates ask for
 * inspection before delivery and the turn path streams, so the choice was between
 * not streaming and measuring afterwards. Measuring afterwards is what makes "did
 * the gate hold?" answerable at all, and it is the evidence that decides whether
 * any gate earns the cost of buffering the stream.
 *
 * Never throws and never blocks: the student's turn is already complete when this
 * runs, so a failure here must cost nothing but a log line.
 */
export async function auditDeliveredReply(params: {
  studentId: number;
  sessionId: number;
  turnId?: number | null;
  reply: string;
  gates: GateContext | null;
}): Promise<void> {
  try {
    if (!params.gates?.active.length || !params.reply.trim()) return;

    const codes = params.gates.active.map((g) => g.cardCode);
    const findings = auditReply(params.reply, codes);
    if (!findings.length) return;

    const byCode = new Map(params.gates.active.map((g) => [g.cardCode, g.heuristicId]));

    await db.insert(gateAuditFindings).values(
      findings
        .filter((f) => byCode.get(f.cardCode))
        .map((f) => ({
          studentId: params.studentId,
          sessionId: params.sessionId,
          turnId: params.turnId ?? null,
          heuristicId: byCode.get(f.cardCode)!,
          cardCode: f.cardCode,
          mode: f.mode as never,
          matched: f.matched,
          excerpt: f.excerpt,
        })),
    );

    log(
      `gate audit: ${findings
        .map((f) => `${f.cardCode}(${f.mode})`)
        .join(", ")} on session ${params.sessionId}`,
      "engine",
    );
  } catch (err) {
    log(`gate audit failed: ${(err as Error).message}`, "engine");
  }
}

/* ── The per-turn cycle ─────────────────────────────────────────────────── */

function buildGuidance(detected: DetectedSignal): string {
  const parts = [
    `A coaching signal has been detected in the student's last message: ${detected.name}.`,
  ];
  if (detected.intervention) {
    parts.push(`Intervention to apply: ${detected.intervention}`);
  }
  if (detected.coachingMove) {
    parts.push(`How to deliver it: ${detected.coachingMove}`);
  }
  /*
   * delivery_adaptation is where the seven audiences actually differ, so without
   * it every population receives identical coaching language — which was the
   * single largest thing lost by the pre-0019 schema holding three of the seven
   * v2 components.
   */
  if (detected.deliveryAdaptation) {
    parts.push(`Adapt the delivery: ${detected.deliveryAdaptation}`);
  }
  /*
   * failure_path is given as a contingency, not an instruction. It describes what
   * to do if the intervention does not land, and the model must not perform the
   * recovery pre-emptively — that would deliver the fallback instead of the
   * coaching move.
   */
  if (detected.failurePath) {
    parts.push(
      `If this does not land, and only then: ${detected.failurePath}`,
    );
  }
  parts.push(
    "Apply this naturally within your reply. Do not mention the heuristic, " +
      "the signal, or that a rule fired — the student should experience good " +
      "coaching, not an explanation of the system.",
  );
  return parts.join("\n");
}

/**
 * Evaluates one human turn and, if a heuristic fires, logs it and returns
 * guidance for Wing's next response.
 *
 * Call this AFTER the turn has been recorded, so the turn id exists to attach
 * the application to. Returns null when no methodology is active for the
 * student, nothing matched, or anything failed.
 */
export async function evaluateTurn(params: {
  studentId: number;
  sessionId: number;
  content: string;
  turnId?: number | null;
  recentTurns?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<EngineGuidance | null> {
  try {
    // Coaching cards only, scoped to this session. Gates are loaded separately
    // when they are compiled into the prompt — they fire on Wing's output, not
    // on the student's turn, so they must never reach the detector.
    const sequence = await store.getActiveSequenceForStudent(params.studentId, {
      kinds: ["coaching_card"],
      sessionId: params.sessionId,
    });
    if (!sequence) return null;

    const detected = await detectSignal({
      cards: sequence.cards,
      content: params.content,
      recentTurns: params.recentTurns,
    });
    if (!detected) return null;

    /*
     * H-003 · coaching intensity sequencing.
     *
     * "No more than two consecutive high-intensity interactions without a
     * recovery interaction between them. The periodization principle from sports
     * science applies: adaptation happens during recovery, not during loading."
     *
     * This is the one Tier 1 gate that changes what Wing DOES rather than what it
     * says, so it cannot be handled by compiling text into the prompt — the model
     * has no way to know how hard the previous two turns landed. It is checked
     * here, between detection and delivery, because that is the only point where
     * both the card about to fire and the session's history are in hand.
     *
     * The card is not logged as applied when it is held back: it did not fire.
     * H-003 is logged instead, which is accurate — it is the rule that acted —
     * and it makes "how often does this gate intervene?" answerable.
     */
    if (intensityOf(detected.interventionType) === "high") {
      const recent = (await store.recentIntensities(params.sessionId, 2)).map(intensityOf);

      if (shouldDeferHighIntensity(recent)) {
        const gate = await store.findGateInSequence(sequence.sequenceId, "H-003");

        if (gate) {
          const applicationId = await store.logApplication({
            studentId: params.studentId,
            sessionId: params.sessionId,
            heuristicId: gate.heuristicId,
            heuristicComponentId: gate.componentId,
            sequenceId: sequence.sequenceId,
            turnId: params.turnId ?? null,
            cycleId: sequence.cycleId,
            notes: `held back ${detected.name} — two consecutive high-intensity turns`,
          });

          log(
            `H-003 deferred ${detected.name} for student ${params.studentId} ` +
              `(session ${params.sessionId}) — recovery turn`,
            "engine",
          );

          return {
            detected,
            sequenceId: sequence.sequenceId,
            cycleId: sequence.cycleId,
            applicationId,
            systemPromptFragment: INTENSITY_RECOVERY_GUIDANCE,
          };
        }

        /*
         * H-003 is not in this cohort's sequence, so it is not enforced for them.
         * Logged rather than silently applied anyway: the methodology owner decides
         * which gates a cohort gets, and a rule enforced without being published is
         * a rule nobody can audit.
         */
        log(
          `two consecutive high-intensity turns for student ${params.studentId} ` +
            `but H-003 is not in sequence ${sequence.sequenceId} — not enforced`,
          "engine",
        );
      }
    }

    // The audit record pins the component version actually used, so "why did
    // Wing say that?" stays answerable after the card is later revised.
    const applicationId = await store.logApplication({
      studentId: params.studentId,
      sessionId: params.sessionId,
      heuristicId: detected.heuristicId,
      heuristicComponentId:
        detected.interventionComponentId ?? detected.signalComponentId,
      sequenceId: sequence.sequenceId,
      turnId: params.turnId ?? null,
      cycleId: sequence.cycleId,
      notes: detected.rationale
        ? `confidence ${detected.confidence.toFixed(2)}: ${detected.rationale}`
        : `confidence ${detected.confidence.toFixed(2)}`,
    });

    if (params.turnId) {
      await markTurnSignal(params.turnId, detected.heuristicId);
    }

    log(
      `${detected.name} fired for student ${params.studentId} ` +
        `(session ${params.sessionId}, confidence ${detected.confidence.toFixed(2)})`,
      "engine",
    );

    return {
      detected,
      sequenceId: sequence.sequenceId,
      cycleId: sequence.cycleId,
      applicationId,
      systemPromptFragment: buildGuidance(detected),
    };
  } catch (err) {
    // Deliberately broad: a failure here must degrade to ordinary conversation
    // rather than surface to the student. Logged with a stack because a silent
    // engine is indistinguishable from an engine with no matching heuristics.
    log(`evaluateTurn failed: ${(err as Error).stack ?? err}`, "engine");
    return null;
  }
}

/** Stamps the triggering turn with the heuristic that was active. */
export async function markTurnSignal(turnId: number, heuristicId: number) {
  await db
    .update(transcriptTurns)
    .set({ signalDetected: true, activeHeuristicId: heuristicId })
    .where(eq(transcriptTurns.id, turnId));
}
