import { Express, Request, Response, NextFunction } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
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
import { isPlatformAdmin as isAdmin } from "./admin-guards";

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
const SEQUENCE_SOFT_LIMIT = 15;
const SEQUENCE_HARD_LIMIT = 40;

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
function evaluationWindowState(cycle: {
  status: string;
  evaluationWindowStart: string | null;
  evaluationWindowEnd: string | null;
}): { open: boolean; reason: string } {
  if (cycle.status !== "active") {
    return { open: true, reason: "cycle is not active, so no student is mid-cycle" };
  }
  if (!cycle.evaluationWindowStart || !cycle.evaluationWindowEnd) {
    return { open: false, reason: "cycle has no evaluation window defined" };
  }

  const today = new Date().toISOString().slice(0, 10);
  const open =
    today >= cycle.evaluationWindowStart && today <= cycle.evaluationWindowEnd;

  return {
    open,
    reason: open
      ? `inside the evaluation window (${cycle.evaluationWindowStart} to ${cycle.evaluationWindowEnd})`
      : `outside the evaluation window (${cycle.evaluationWindowStart} to ${cycle.evaluationWindowEnd})`,
  };
}

export function registerHeuristicsRoutes(app: Express) {
  /* ── Cards ───────────────────────────────────────────────────────────── */

  app.get("/api/admin/heuristics", isAdmin, async (req, res, next) => {
    try {
      res.json(await store.listHeuristics(req.query.includeRetired === "true"));
    } catch (error) {
      next(error);
    }
  });

  /** One card with the full version history of every component. */
  app.get("/api/admin/heuristics/:id", isAdmin, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid heuristic id" });

      const card = await store.getHeuristic(id);
      if (!card) return res.status(404).json({ error: "Heuristic not found" });

      res.json(card);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/heuristics", isAdmin, async (req, res, next) => {
    try {
      const { name, description, populationTags, components } = req.body ?? {};

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

      const card = await store.createHeuristic({
        name: name.trim(),
        description: description.trim(),
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
    isAdmin,
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
  app.patch("/api/admin/heuristics/:id/status", isAdmin, async (req, res, next) => {
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
  app.get("/api/admin/heuristics/:id/performance", isAdmin, async (req, res, next) => {
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

  app.get("/api/admin/cycles", isAdmin, async (_req, res, next) => {
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

      res.json(
        rows.map((c) => ({ ...c, evaluationWindow: evaluationWindowState(c as any) })),
      );
    } catch (error) {
      next(error);
    }
  });

  /** The sequence a cycle's students are currently governed by. */
  app.get("/api/admin/cycles/:id/sequence", isAdmin, async (req, res, next) => {
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
  app.put("/api/admin/cycles/:id/sequence", isAdmin, async (req, res, next) => {
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

  /** Sequence history for a cycle — what was live, and when. */
  app.get("/api/admin/cycles/:id/sequence/history", isAdmin, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid cycle id" });

      const rows = await db
        .select()
        .from(heuristicSequences)
        .where(
          and(
            eq(heuristicSequences.ownerType, "school_cycle"),
            eq(heuristicSequences.ownerId, id),
          ),
        )
        .orderBy(desc(heuristicSequences.versionNumber));

      res.json(rows);
    } catch (error) {
      next(error);
    }
  });

  /** Component types, for building the authoring form. */
  app.get("/api/admin/heuristic-component-types", isAdmin, (_req, res) => {
    res.json(COMPONENT_TYPES);
  });
}
