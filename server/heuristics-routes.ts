import { Express, Request, Response, NextFunction } from "express";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  schoolCycles,
  institutions,
  heuristicSequences,
  heuristicSequenceEntries,
  heuristics,
  userHeuristicScores,
  userHeuristicApplications,
} from "@shared/wing-schema";
import * as store from "./wing/heuristics-store";
import type { ComponentType } from "./wing/heuristics-store";
import { log } from "./logger";
import { isPlatformAdmin } from "./admin-guards";
import { annotate } from "./wing/card-annotations";
import { evaluationWindowState } from "./wing/evaluation-window";
import {
  SEQUENCE_HARD_LIMIT,
  SEQUENCE_SOFT_LIMIT,
  peakDetectorLoad,
} from "./wing/sequence-limits";

/**
 * Methodology authoring API — the surface Danielle and Sam use to write the
 * heuristics the engine executes.
 *
 * This is the other half of "code the engine, not the heuristics" (spec §2).
 * The engine ships once; the methodology changes continuously through here,
 * without a deploy.
 *
 * ADMIN ONLY. Authoring methodology changes what every student experiences,
 * so these routes require an admin role, not merely authentication.
 */

const COMPONENT_TYPES: ComponentType[] = [
  "signal", "intervention", "coaching_move", "outcome",
  "module_mapping", "population_context", "notes",
  // v2 (migration 0019). Without these the editor renders a v2 card's
  // detection_method and delivery_adaptation and then rejects the save with
  // "Unknown component type", which reads as a bug in the field rather than a
  // gap in this list.
  "detection_method", "delivery_adaptation", "failure_path", "success_criteria",
];

/** The three kinds. Only `coaching_card` may enter the detector catalogue. */
const CARD_KINDS: string[] = ["coaching_card", "integrity_gate", "exercise"];

/**
 * Every value `heuristic_intervention_type` can store.
 *
 * Kept in step with the enum by hand, and the seeder's preflight is what
 * actually catches a drift — it queries pg_enum before its first insert and
 * refuses with the ALTER TYPE that would fix it. EDUCATE and SAFETY_OVERRIDE
 * arrived with Module 13 and the Reveal Cycle in migration 0049.
 */
const INTERVENTION_TYPES: string[] = [
  "COACH", "CHALLENGE", "REDIRECT", "REFRAME", "AFFIRM", "META", "GATE",
  "ELICIT", "OBSERVE", "EDUCATE", "SAFETY_OVERRIDE",
];

/**
 * Sequence size limits.
 *
 * WHY A LIMIT EXISTS AT ALL
 * The engine builds its detector prompt by concatenating the signal definition
 * of EVERY card in the active sequence, and runs it on every student turn.
 * Sequence size is therefore not a matter of taste — it is per-turn latency
 * and cost on the critical path, measured:
 *
 *     10 cards  ~=   360 tokens per turn
 *     25 cards  ~= 1,000 tokens per turn
 *     91 cards  ~= 4,500 tokens per turn
 *
 * Worse than the cost is the discrimination: a small model asked to pick one
 * of ninety near-neighbour signals matches far less reliably than one choosing
 * among a dozen, and every false match logs a heuristic application that
 * pollutes the evidence base used to validate the methodology.
 *
 * A library of hundreds of cards is fine and desirable. A SEQUENCE of hundreds
 * is not. The sequence is a deliberate selection from the library.
 */
/*
 * The constants and the measurement now live in server/wing/sequence-limits.ts,
 * because what they should be measured AGAINST changed: session scope and
 * card_kind mean "cards in the sequence" is no longer "signals the detector
 * chooses between". The reasoning above is still why the numbers are 15 and 40.
 */

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isNaN(n) || n < 1 ? null : n;
}

/**
 * Is the cycle currently inside its evaluation window?
 *
 * Spec §2: "Methodology evolves between cycles, not during them. No active
 * student is ever affected by a mid-cycle change." This is the check that
 * makes that principle real rather than aspirational — see the sequence
 * publishing route for how it is applied.
 */

export function registerHeuristicsRoutes(app: Express) {
  /* ── Cards ───────────────────────────────────────────────────────────── */

  app.get("/api/admin/heuristics", isPlatformAdmin, async (req, res, next) => {
    try {
      const cards = await store.listHeuristics(req.query.includeRetired === "true");
      /*
       * Module and advisory are derived from the card code, never stored. The
       * advisory in particular must not come from the card's notes: notes are
       * editable now, and a warning a user can delete by tidying a text field
       * is not a warning.
       */
      res.json(cards.map((c) => ({ ...c, ...annotate(c.cardCode) })));
    } catch (error) {
      next(error);
    }
  });

  /** One card with the full version history of every component. */
  app.get("/api/admin/heuristics/:id", isPlatformAdmin, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid heuristic id" });

      const card = await store.getHeuristic(id);
      if (!card) return res.status(404).json({ error: "Heuristic not found" });

      res.json({ ...card, ...annotate(card.cardCode) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/heuristics", isPlatformAdmin, async (req, res, next) => {
    try {
      const { name, description, populationTags, components, cardCode, cardKind, interventionType } =
        req.body ?? {};

      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "name is required" });
      }
      if (typeof description !== "string" || !description.trim()) {
        return res.status(400).json({ error: "description is required" });
      }

      const invalid = (components ?? []).find(
        (c: any) => !COMPONENT_TYPES.includes(c?.componentType),
      );
      if (invalid) {
        return res.status(400).json({
          error: `Unknown component type '${invalid.componentType}'`,
          allowed: COMPONENT_TYPES,
        });
      }

      /*
       * card_kind on create, and it matters more than it looks. The column
       * defaults to `coaching_card`, so before this every gate authored in the
       * panel entered the DETECTOR CATALOGUE as a student-turn card — a gate
       * that fires on Wing's own output being asked to match what a student
       * said. Nothing warned about it.
       */
      if (cardKind !== undefined && !CARD_KINDS.includes(cardKind)) {
        return res.status(400).json({ error: `Unknown card kind '${cardKind}'`, allowed: CARD_KINDS });
      }
      if (
        interventionType !== undefined &&
        interventionType !== null &&
        !INTERVENTION_TYPES.includes(interventionType)
      ) {
        return res.status(400).json({
          error: `Unknown intervention type '${interventionType}'`,
          allowed: INTERVENTION_TYPES,
        });
      }

      const card = await store.createHeuristic({
        name: name.trim(),
        description: description.trim(),
        // The methodology owner's own number, when she supplies one. Without
        // this the code is slugged from the name, so a card created as
        // "Module 13 — The Experiment Framework" gets a slug rather than
        // H-1305 and her numbering registry silently stops matching.
        cardCode: typeof cardCode === "string" && cardCode.trim() ? cardCode.trim() : undefined,
        cardKind,
        interventionType: interventionType ?? null,
        populationTags: Array.isArray(populationTags) ? populationTags : [],
        components: components ?? [],
      });

      log(`heuristic '${card.name}' #${card.id} created by user ${req.user!.id}`, "methodology");
      res.status(201).json(card);
    } catch (error) {
      next(error);
    }
  });

  /**
   * Revises one component — writes a NEW version rather than editing.
   *
   * PUT, not PATCH: the caller supplies the complete new content for that
   * component. The previous version is retained and marked not-current, so
   * every historical application still resolves to the text that was actually
   * used at the time.
   */
  app.put(
    "/api/admin/heuristics/:id/components/:componentType",
    isPlatformAdmin,
    async (req, res, next) => {
      try {
        const id = parseId(req.params.id);
        if (!id) return res.status(400).json({ error: "Invalid heuristic id" });

        const componentType = req.params.componentType as ComponentType;
        if (!COMPONENT_TYPES.includes(componentType)) {
          return res.status(400).json({
            error: `Unknown component type '${componentType}'`,
            allowed: COMPONENT_TYPES,
          });
        }

        const { content } = req.body ?? {};
        if (typeof content !== "string" || !content.trim()) {
          return res.status(400).json({ error: "content is required" });
        }

        const existing = await store.getHeuristic(id);
        if (!existing) return res.status(404).json({ error: "Heuristic not found" });

        const revised = await store.reviseComponent({
          heuristicId: id,
          componentType,
          content: content.trim(),
        });

        log(
          `heuristic #${id} ${componentType} revised to v${revised.versionNumber} ` +
            `by user ${req.user!.id}`,
          "methodology",
        );
        res.json(revised);
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Promotes or retires a card.
   *
   * Retiring stops the card firing everywhere immediately — getSequenceCards
   * excludes retired cards regardless of sequence membership — while keeping
   * it as a permanent record so past applications stay interpretable.
   */
  /**
   * Edits the card-level fields. Components and status have their own routes.
   *
   * ── WHY card_kind NEEDS AN ACKNOWLEDGEMENT ───────────────────────────────
   * It is the only field here that changes what the engine does. A gate never
   * enters the detector catalogue; a coaching card does. Moving a card from
   * `integrity_gate` to `coaching_card` therefore takes a rule written about
   * Wing's own output and starts matching it against what students type, in
   * every session, silently. The caller must send acknowledgeKindChange: true,
   * so the confirmation is in the request rather than only in a dialog that a
   * future redesign could drop.
   */
  app.patch("/api/admin/heuristics/:id", isPlatformAdmin, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid heuristic id" });

      const existing = await store.getHeuristic(id);
      if (!existing) return res.status(404).json({ error: "Heuristic not found" });

      const { name, description, populationTags, interventionType, cardKind } = req.body ?? {};
      const patch: Record<string, unknown> = {};

      if (name !== undefined) {
        if (typeof name !== "string" || !name.trim()) {
          return res.status(400).json({ error: "name cannot be empty" });
        }
        patch.name = name.trim();
      }
      if (description !== undefined) {
        if (typeof description !== "string" || !description.trim()) {
          return res.status(400).json({ error: "description cannot be empty" });
        }
        patch.description = description.trim();
      }
      if (populationTags !== undefined) {
        if (!Array.isArray(populationTags)) {
          return res.status(400).json({ error: "populationTags must be an array" });
        }
        patch.populationTags = populationTags;
      }
      if (interventionType !== undefined) {
        if (interventionType !== null && !INTERVENTION_TYPES.includes(interventionType)) {
          return res.status(400).json({
            error: `Unknown intervention type '${interventionType}'`,
            allowed: INTERVENTION_TYPES,
          });
        }
        patch.interventionType = interventionType;
      }
      if (cardKind !== undefined && cardKind !== existing.cardKind) {
        if (!CARD_KINDS.includes(cardKind)) {
          return res.status(400).json({ error: `Unknown card kind '${cardKind}'`, allowed: CARD_KINDS });
        }
        if (req.body?.acknowledgeKindChange !== true) {
          return res.status(409).json({
            error:
              `Changing card kind from '${existing.cardKind}' to '${cardKind}' changes what the ` +
              `engine does with this card. A coaching card enters the detector catalogue and can ` +
              `fire on a student's turn; an integrity gate never does. Re-send with ` +
              `acknowledgeKindChange: true.`,
            from: existing.cardKind,
            to: cardKind,
          });
        }
        patch.cardKind = cardKind;
      }

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: "nothing to update" });
      }

      const card = await store.updateHeuristic(id, patch as never);
      log(
        `heuristic '${card.name}' #${id} fields [${Object.keys(patch).join(", ")}] updated by ` +
          `user ${req.user!.id}`,
        "methodology",
      );
      res.json({ ...card, ...annotate(card.cardCode) });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/admin/heuristics/:id/status", isPlatformAdmin, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid heuristic id" });

      const { status } = req.body ?? {};
      if (!["candidate", "validated", "retired"].includes(status)) {
        return res.status(400).json({
          error: "status must be candidate, validated or retired",
        });
      }

      const updated = await store.setHeuristicStatus(id, status);
      if (!updated) return res.status(404).json({ error: "Heuristic not found" });

      log(
        `heuristic #${id} status -> ${status} by user ${req.user!.id}`,
        "methodology",
      );
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  /** Aggregate performance for a card — the evidence behind promotion. */
  app.get("/api/admin/heuristics/:id/performance", isPlatformAdmin, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid heuristic id" });

      const scores = await db
        .select()
        .from(userHeuristicScores)
        .where(eq(userHeuristicScores.heuristicId, id));

      const recent = await db
        .select()
        .from(userHeuristicApplications)
        .where(eq(userHeuristicApplications.heuristicId, id))
        .orderBy(desc(userHeuristicApplications.appliedAt))
        .limit(50);

      const outcomes: Record<string, number> = {};
      for (const a of recent) {
        const key = a.outcomeSignal ?? "unscored";
        outcomes[key] = (outcomes[key] ?? 0) + 1;
      }

      const scored = scores.filter((s) => s.compositeScore != null);
      const meanComposite = scored.length
        ? scored.reduce((sum, s) => sum + Number(s.compositeScore), 0) / scored.length
        : null;

      res.json({
        heuristicId: id,
        studentsScored: scores.length,
        totalSessionsApplied: scores.reduce((sum, s) => sum + s.sessionsApplied, 0),
        meanComposite,
        recentOutcomes: outcomes,
        recentApplications: recent,
      });
    } catch (error) {
      next(error);
    }
  });

  /* ── Cycles and sequences ────────────────────────────────────────────── */

  app.get("/api/admin/cycles", isPlatformAdmin, async (_req, res, next) => {
    try {
      const rows = await db
        .select({
          id: schoolCycles.id,
          label: schoolCycles.label,
          cycleYear: schoolCycles.cycleYear,
          status: schoolCycles.status,
          institutionName: institutions.name,
          activeSequenceId: schoolCycles.activeHeuristicSequenceId,
          evaluationWindowStart: schoolCycles.evaluationWindowStart,
          evaluationWindowEnd: schoolCycles.evaluationWindowEnd,
        })
        .from(schoolCycles)
        .innerJoin(institutions, eq(institutions.id, schoolCycles.institutionId))
        .orderBy(desc(schoolCycles.cycleYear));

      /*
       * What the pointer actually resolves to, alongside the pointer itself.
       *
       * `activeSequenceId` alone cannot distinguish a cohort governed by 53 cards
       * from one pointing at a sequence that `wing:reset-cards` emptied — and that
       * second state existed on dev, reading as a healthy published cycle
       * everywhere. Any screen answering "is anything live?" needs the count, so it
       * is returned here rather than fetched per cycle by each caller.
       */
      const active = rows
        .map((c) => c.activeSequenceId)
        .filter((id): id is number => id != null);

      const counts = active.length
        ? await db
            .select({
              sequenceId: heuristicSequenceEntries.sequenceId,
              versionNumber: heuristicSequences.versionNumber,
              n: count(),
            })
            .from(heuristicSequenceEntries)
            .innerJoin(
              heuristicSequences,
              eq(heuristicSequences.id, heuristicSequenceEntries.sequenceId),
            )
            .where(inArray(heuristicSequenceEntries.sequenceId, active))
            .groupBy(heuristicSequenceEntries.sequenceId, heuristicSequences.versionNumber)
        : [];

      // A sequence with no entries has no row in the group-by at all, so the
      // default is zero rather than unknown.
      const bySequence = new Map(
        counts.map((r) => [r.sequenceId, { cards: Number(r.n), version: r.versionNumber }]),
      );

      const versions = active.length
        ? await db
            .select({ id: heuristicSequences.id, versionNumber: heuristicSequences.versionNumber })
            .from(heuristicSequences)
            .where(inArray(heuristicSequences.id, active))
        : [];
      const versionById = new Map(versions.map((v) => [v.id, v.versionNumber]));

      res.json(
        rows.map((c) => ({
          ...c,
          evaluationWindow: evaluationWindowState(c as any),
          activeSequenceCards: c.activeSequenceId
            ? (bySequence.get(c.activeSequenceId)?.cards ?? 0)
            : null,
          activeSequenceVersion: c.activeSequenceId
            ? (versionById.get(c.activeSequenceId) ?? null)
            : null,
        })),
      );
    } catch (error) {
      next(error);
    }
  });

  /** The sequence a cycle's students are currently governed by. */
  app.get("/api/admin/cycles/:id/sequence", isPlatformAdmin, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid cycle id" });

      const [cycle] = await db
        .select()
        .from(schoolCycles)
        .where(eq(schoolCycles.id, id))
        .limit(1);
      if (!cycle) return res.status(404).json({ error: "Cycle not found" });

      res.json({
        cycleId: id,
        sequenceId: cycle.activeHeuristicSequenceId,
        evaluationWindow: evaluationWindowState(cycle as any),
        cards: cycle.activeHeuristicSequenceId
          ? await store.getSequenceCards(cycle.activeHeuristicSequenceId)
          : [],
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Publishes a new sequence for a cycle.
   *
   * THE EVALUATION-WINDOW GATE
   * Outside the window this is refused with 409, because changing the active
   * sequence mid-cycle changes the methodology under students who are partway
   * through it — the exact thing spec §2 forbids, and the thing that would
   * make cohort-to-cohort comparison meaningless.
   *
   * The override exists because a harmful card sometimes has to be pulled
   * immediately, and a system with no escape hatch gets bypassed at the
   * database instead, where nothing is recorded. It demands an explicit reason
   * and logs it. Retiring a single card via the status route is the better
   * tool for that case; this override is for genuine emergencies.
   */
  app.put("/api/admin/cycles/:id/sequence", isPlatformAdmin, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid cycle id" });

      const { entries, force, reason } = req.body ?? {};
      if (!Array.isArray(entries) || !entries.length) {
        return res.status(400).json({ error: "entries must be a non-empty array" });
      }

      const [cycle] = await db
        .select()
        .from(schoolCycles)
        .where(eq(schoolCycles.id, id))
        .limit(1);
      if (!cycle) return res.status(404).json({ error: "Cycle not found" });

      // Every referenced card must exist and must not be retired. A sequence
      // pointing at a missing heuristic fails at resolution time — inside a
      // live session, where the engine swallows it and the student simply gets
      // no coaching. Validating here is the only place it is visible.
      const ids: number[] = entries.map((e: any) => Number(e.heuristicId));

      if (ids.some((i) => !Number.isFinite(i) || i < 1)) {
        return res.status(400).json({ error: "Every entry needs a numeric heuristicId" });
      }
      if (new Set(ids).size !== ids.length) {
        return res.status(400).json({
          error: "The same heuristic appears more than once in the sequence",
        });
      }

      const referenced = await db
        .select({ id: heuristics.id, status: heuristics.status })
        .from(heuristics)
        .where(inArray(heuristics.id, ids));

      const byId = new Map(referenced.map((r) => [r.id, r.status]));

      const missing = ids.filter((i) => !byId.has(i));
      if (missing.length) {
        return res.status(400).json({
          error: "Sequence references heuristics that do not exist",
          missing,
        });
      }

      const retiredInPayload = ids.filter((i) => byId.get(i) === "retired");
      if (retiredInPayload.length) {
        return res.status(400).json({
          error: "Cannot publish a sequence containing retired heuristics",
          retired: retiredInPayload,
        });
      }

      // Size gate — see the limit constants for the measurements behind these.
      if (ids.length > SEQUENCE_HARD_LIMIT) {
        return res.status(400).json({
          error: `A sequence may contain at most ${SEQUENCE_HARD_LIMIT} cards`,
          detail:
            `You sent ${ids.length}. Every card's signal definition is sent to the ` +
            `detector on every student turn, so this would add roughly ` +
            `${Math.round((ids.length * 173) / 4)} tokens of latency per turn and ` +
            `badly degrade match accuracy.`,
          remedy:
            "Keep the full library as unsequenced cards and select the ones this " +
            "cohort should actually be coached on. The library is not the sequence.",
        });
      }

      const warnings: string[] = [];
      if (ids.length > SEQUENCE_SOFT_LIMIT) {
        warnings.push(
          `${ids.length} cards is above the recommended ${SEQUENCE_SOFT_LIMIT}. ` +
            "Detection accuracy falls as the detector has more near-neighbour " +
            "signals to choose between, and every false match adds noise to the " +
            "evidence used to validate these cards.",
        );
      }

      const window = evaluationWindowState(cycle as any);
      if (!window.open && force !== true) {
        return res.status(409).json({
          error: "Methodology changes belong in the evaluation window",
          detail: window.reason,
          remedy:
            "Wait for the evaluation window, or retire the specific card via " +
            "PATCH /api/admin/heuristics/:id/status, which takes effect immediately. " +
            "To override, resend with force: true and a reason.",
        });
      }

      if (!window.open && force === true) {
        if (typeof reason !== "string" || reason.trim().length < 10) {
          return res.status(400).json({
            error: "An override requires a reason of at least 10 characters",
          });
        }
        log(
          `MID-CYCLE OVERRIDE: cycle ${id} sequence republished by user ` +
            `${req.user!.id} outside the evaluation window. Reason: ${reason.trim()}`,
          "methodology",
        );
      }

      const sequenceId = await store.publishCycleSequence({
        cycleId: id,
        entries: entries.map((e: any) => ({
          heuristicId: Number(e.heuristicId),
          weight: e.weight != null ? Number(e.weight) : 1.0,
        })),
      });

      log(
        `cycle ${id} sequence #${sequenceId} published with ${entries.length} card(s) ` +
          `by user ${req.user!.id}`,
        "methodology",
      );

      res.status(201).json({
        sequenceId,
        warnings,
        cards: await store.getSequenceCards(sequenceId),
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Points a cycle at a sequence that already exists.
   *
   * ── WHY THIS EXISTS ALONGSIDE THE PUBLISH ROUTE ──────────────────────────
   * `PUT .../sequence` composes a new version from a posted entry list. There was
   * no way to publish a version that had already been built, and
   * `wing:build-sequences` deliberately builds without publishing — so the
   * 53-card Foundation sequence existed, was reviewable, and could only be
   * switched on with a hand-written UPDATE. Doing it through the compose path
   * would have created a duplicate differing from the reviewed version only by
   * id, which defeats the point of reviewing it.
   *
   * The same route is the rollback. Pointing back at the previous version is the
   * fastest possible undo, and it is one pointer.
   *
   * ── WHY THE SIZE LIMIT IS COUNTED DIFFERENTLY HERE ───────────────────────
   * SEQUENCE_HARD_LIMIT is 40 and this route will happily activate 53 cards. That
   * is not an oversight. The limit was measured when every entry's signal went
   * into the detector prompt on every turn — the comment above the constants has
   * the numbers. That is no longer how the engine reads a sequence: the detector
   * asks for `kinds: ["coaching_card"]` and then narrows by session and
   * population, gates are compiled on a separate path, and exercises never reach
   * the detector at all. Of the 53-card build, 22 are coaching cards and a single
   * session sees fewer still.
   *
   * So the limit is applied to what the detector will actually see. The publish
   * route keeps counting entries, correctly — it receives a bare list whose kinds
   * it cannot know without a lookup, and a caller composing a sequence by hand is
   * a different kind of caller from one activating a reviewed build.
   */
  app.put("/api/admin/cycles/:id/active-sequence", isPlatformAdmin, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid cycle id" });

      const { force, reason } = req.body ?? {};
      const sequenceId = Number(req.body?.sequenceId);
      if (!Number.isInteger(sequenceId) || sequenceId < 1) {
        return res.status(400).json({ error: "sequenceId must be a positive integer" });
      }

      const [cycle] = await db
        .select()
        .from(schoolCycles)
        .where(eq(schoolCycles.id, id))
        .limit(1);
      if (!cycle) return res.status(404).json({ error: "Cycle not found" });

      const [sequence] = await db
        .select({
          id: heuristicSequences.id,
          ownerType: heuristicSequences.ownerType,
          ownerId: heuristicSequences.ownerId,
          versionNumber: heuristicSequences.versionNumber,
        })
        .from(heuristicSequences)
        .where(eq(heuristicSequences.id, sequenceId))
        .limit(1);
      if (!sequence) return res.status(404).json({ error: "Sequence not found" });

      /*
       * Ownership, not merely existence. Two integers and no constraint between
       * them is exactly how one cohort ends up governed by another cohort's
       * methodology — `heuristic_sequences.owner_id` is polymorphic and carries no
       * foreign key by design, so nothing else would catch it.
       */
      if (sequence.ownerType !== "school_cycle" || sequence.ownerId !== id) {
        return res.status(400).json({
          error: "That sequence belongs to a different owner",
          detail:
            `Sequence #${sequenceId} is owned by ${sequence.ownerType} ` +
            `#${sequence.ownerId}, not cycle #${id}.`,
        });
      }

      if (cycle.activeHeuristicSequenceId === sequenceId) {
        return res.status(409).json({
          error: `Version ${sequence.versionNumber} is already live for this cycle`,
        });
      }

      const [entryRow] = await db
        .select({ n: count() })
        .from(heuristicSequenceEntries)
        .where(eq(heuristicSequenceEntries.sequenceId, sequenceId));
      const entryCount = Number(entryRow?.n ?? 0);

      /*
       * The refusal this route exists to make impossible to reach by accident.
       * A cycle CAN point at an empty sequence — one does today, because
       * `wing:reset-cards` deletes every sequence entry and left the pointer
       * where it was — and the result is a cohort whose engine resolves a
       * sequence, finds nothing in it, and coaches with no methodology while
       * every screen reports a published cycle.
       */
      if (!entryCount) {
        return res.status(409).json({
          error: `Version ${sequence.versionNumber} contains no cards`,
          detail:
            "Publishing it would resolve to a sequence with nothing in it: no card " +
            "would fire, no gate would be compiled, and the cycle would still read " +
            "as published everywhere.",
          remedy: "Build the sequence first, then activate it.",
        });
      }

      // Retired cards are filtered out at resolution, so this is the set that
      // will actually be in force.
      const effective = await store.getSequenceCards(sequenceId);
      const retiredCount = entryCount - effective.length;

      if (!effective.length) {
        return res.status(409).json({
          error: `Every card in version ${sequence.versionNumber} is retired`,
          detail: `All ${entryCount} entries point at retired cards, which resolution skips.`,
          remedy: "Un-retire the cards, or build a sequence from live ones.",
        });
      }

      const detectorCards = effective.filter((c) => c.cardKind === "coaching_card");
      const gates = effective.filter((c) => c.cardKind === "integrity_gate");
      const unclassified = effective.filter((c) => !c.cardKind);

      /*
       * Per session, not per sequence. An entry scoped to foundation_2 is invisible
       * during intake, so the detector never chooses between all of them at once;
       * the number that matters is the worst single turn. For a sequence with no
       * scope — everything publishCycleSequence writes — the peak equals the total
       * and this is exactly the old check. See wing/sequence-limits.ts.
       */
      const peak = peakDetectorLoad(effective);

      if (peak.count > SEQUENCE_HARD_LIMIT) {
        return res.status(400).json({
          error: `A sequence may put at most ${SEQUENCE_HARD_LIMIT} coaching cards in front of the detector in one session`,
          detail:
            `Version ${sequence.versionNumber} has ${detectorCards.length} coaching card(s) in ` +
            `total, and ${peak.count} of them are visible in ` +
            `${peak.session ?? "every session, because the sequence has no session scope"}. ` +
            `Every one of their signal definitions is sent to the detector on that turn.`,
          remedy:
            peak.session === null
              ? "Scope the entries by session — a sequence built by wing:build-sequences " +
                "sets applies_to_session, so a single turn sees only the cards for that session."
              : `Split the ${peak.session} set, or move some of its cards to another session.`,
        });
      }

      const warnings: string[] = [];
      if (peak.count > SEQUENCE_SOFT_LIMIT) {
        warnings.push(
          `${peak.count} coaching cards in ${peak.session ?? "every session"} is above ` +
            `the recommended ${SEQUENCE_SOFT_LIMIT} (${detectorCards.length} in the ` +
            `sequence overall). Session scope has already been applied, but ` +
            "detection accuracy still falls as the detector has more near-neighbour " +
            "signals to choose between.",
        );
      }
      if (retiredCount > 0) {
        warnings.push(
          `${retiredCount} of the ${entryCount} entries point at retired cards and will ` +
            "be skipped at resolution. That is the expected result of retiring a card " +
            "under a live sequence, not an error.",
        );
      }
      if (unclassified.length) {
        warnings.push(
          `${unclassified.length} card(s) have no kind set. The detector asks for ` +
            "coaching cards specifically, so an unclassified card is invisible to it — " +
            "these are almost certainly pre-v2 cards that predate migration 0019.",
        );
      }

      const window = evaluationWindowState(cycle as any);
      if (!window.open && force !== true) {
        return res.status(409).json({
          error: "Methodology changes belong in the evaluation window",
          detail: window.reason,
          remedy:
            "Wait for the evaluation window, or retire the specific card via " +
            "PATCH /api/admin/heuristics/:id/status, which takes effect immediately. " +
            "To override, resend with force: true and a reason.",
        });
      }

      if (!window.open && force === true) {
        if (typeof reason !== "string" || reason.trim().length < 10) {
          return res.status(400).json({
            error: "An override requires a reason of at least 10 characters",
          });
        }
        log(
          `MID-CYCLE OVERRIDE: cycle ${id} pointed at sequence #${sequenceId} ` +
            `(version ${sequence.versionNumber}) by user ${req.user!.id} outside the ` +
            `evaluation window. Reason: ${reason.trim()}`,
          "methodology",
        );
      }

      const { previousSequenceId } = await store.activateExistingSequence({
        cycleId: id,
        sequenceId,
      });

      log(
        `cycle ${id} now points at sequence #${sequenceId} (version ` +
          `${sequence.versionNumber}, ${effective.length} live card(s): ` +
          `${detectorCards.length} coaching, ${gates.length} gates) by user ` +
          `${req.user!.id}. Previous: ${previousSequenceId ?? "none"}`,
        "methodology",
      );

      res.json({
        cycleId: id,
        sequenceId,
        versionNumber: sequence.versionNumber,
        previousSequenceId,
        entryCount,
        liveCards: effective.length,
        detectorCards: detectorCards.length,
        gates: gates.length,
        warnings,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Every sequence ever built for a cycle — what was live, what is live, and
   * what has been built and not published.
   *
   * ── WHY entryCount AND isActive ARE HERE ─────────────────────────────────
   * This route returned bare `heuristic_sequences` rows, and no screen called it.
   * That combination hid something real: `wing:build-sequences` writes a full
   * sequence per cycle WITHOUT pointing the cycle at it, deliberately, so the
   * methodology can be assembled and reviewed before it reaches a student. The
   * result was a sequence that existed, governed nobody, and was visible nowhere
   * — the row said nothing about how many cards were in it or whether it was the
   * live one, so even reading the table by hand answered neither question.
   *
   * `isActive` is derived from the cycle's own pointer, `activeHeuristicSequenceId`,
   * because that pointer is the single thing `resolveSequenceId` reads. A row's
   * `supersededAt` being null does NOT mean it is live; it means nothing replaced
   * it. Publishing is the pointer, and only the pointer.
   */
  app.get("/api/admin/cycles/:id/sequence/history", isPlatformAdmin, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid cycle id" });

      const [cycle] = await db
        .select({ activeSequenceId: schoolCycles.activeHeuristicSequenceId })
        .from(schoolCycles)
        .where(eq(schoolCycles.id, id))
        .limit(1);
      if (!cycle) return res.status(404).json({ error: "Cycle not found" });

      const rows = await db
        .select({
          id: heuristicSequences.id,
          versionNumber: heuristicSequences.versionNumber,
          activeFrom: heuristicSequences.activeFrom,
          supersededAt: heuristicSequences.supersededAt,
          createdAt: heuristicSequences.createdAt,
          entryCount: count(heuristicSequenceEntries.id),
        })
        .from(heuristicSequences)
        .leftJoin(
          heuristicSequenceEntries,
          eq(heuristicSequenceEntries.sequenceId, heuristicSequences.id),
        )
        .where(
          and(
            eq(heuristicSequences.ownerType, "school_cycle"),
            eq(heuristicSequences.ownerId, id),
          ),
        )
        // Grouped by the primary key, so the other columns come along by
        // functional dependency rather than being repeated here.
        .groupBy(heuristicSequences.id)
        .orderBy(desc(heuristicSequences.versionNumber));

      res.json({
        cycleId: id,
        activeSequenceId: cycle.activeSequenceId,
        sequences: rows.map((r) => ({
          ...r,
          entryCount: Number(r.entryCount),
          isActive: r.id === cycle.activeSequenceId,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * The cards in one sequence, live or not.
   *
   * `/api/admin/cycles/:id/sequence` answers "what governs this cohort now" and
   * returns nothing at all when the cycle points at no sequence. This answers
   * "what is in this sequence", which is the only way to review a build before
   * publishing it — and, when a cycle points at nothing, the only way to see that
   * the methodology exists and is simply not switched on.
   *
   * Components are dropped deliberately. The full card is `/api/admin/heuristics/:id`
   * and a reviewer of a 53-card sequence wants the shape of the set, not 371
   * component bodies.
   */
  app.get("/api/admin/sequences/:id/cards", isPlatformAdmin, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid sequence id" });

      const [sequence] = await db
        .select({
          id: heuristicSequences.id,
          ownerType: heuristicSequences.ownerType,
          ownerId: heuristicSequences.ownerId,
          versionNumber: heuristicSequences.versionNumber,
          activeFrom: heuristicSequences.activeFrom,
          supersededAt: heuristicSequences.supersededAt,
        })
        .from(heuristicSequences)
        .where(eq(heuristicSequences.id, id))
        .limit(1);
      if (!sequence) return res.status(404).json({ error: "Sequence not found" });

      const cards = await store.getSequenceCards(id);

      res.json({
        sequence,
        cards: cards.map((c) => ({
          heuristicId: c.heuristicId,
          cardCode: c.cardCode,
          name: c.name,
          status: c.status,
          cardKind: c.cardKind,
          interventionType: c.interventionType,
          populationTags: c.populationTags,
          position: c.position,
          weight: c.weight,
          appliesToSession: c.appliesToSession,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  /** Component types, for building the authoring form. */
  app.get("/api/admin/heuristic-component-types", isPlatformAdmin, (_req, res) => {
    res.json(COMPONENT_TYPES);
  });
}
