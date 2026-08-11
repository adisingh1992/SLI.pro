import { and, asc, eq, inArray, ne } from "drizzle-orm";
import * as cache from "./published-cache";
import { db } from "../db";
import {
  students,
  schoolCycles,
  heuristics,
  heuristicComponents,
  heuristicSequences,
  heuristicSequenceEntries,
  userHeuristicApplications,
} from "@shared/wing-schema";
import { codeFromName, uniqueCode } from "./card-code";

/**
 * Methodology store — reads and authors heuristics-as-data.
 *
 * "Code the engine, not the heuristics" (spec §2). Nothing in this file
 * encodes what a heuristic *says*; it only resolves which cards are active for
 * a student and returns their current component versions. The engine executes
 * whatever the methodology owner has authored.
 *
 * TWO INVARIANTS THIS MODULE ENFORCES
 *
 * 1. Components are versioned, never mutated. Editing an intervention creates
 *    a new component row and marks the old one is_current = false, so the
 *    signal definition row is untouched and the full history survives
 *    (spec §4, heuristic_components). Every application log therefore points
 *    at the exact component text the student actually received.
 *
 * 2. Sequences are superseded, never edited. Changing a cohort's sequence
 *    creates a new row and stamps superseded_at on the old one, so a past
 *    session can always be replayed against the methodology that was live at
 *    the time.
 */

export type ComponentType =
  | "signal" | "intervention" | "coaching_move" | "outcome"
  | "module_mapping" | "population_context" | "notes";

export type HeuristicCard = {
  heuristicId: number;
  name: string;
  description: string;
  status: "candidate" | "validated" | "retired";
  populationTags: string[];
  /** Position within the active sequence (1-based). */
  position: number;
  /** Sequence weight; higher means the engine prefers it when several match. */
  weight: number;
  /** Current version of each component, plus the row id for the audit log. */
  components: Partial<Record<ComponentType, { id: number; content: string }>>;
};

export type ResolvedSequence = {
  sequenceId: number;
  /** Where the sequence came from — useful in logs and the admin UI. */
  source: "personal" | "cycle";
  cycleId: number | null;
  cards: HeuristicCard[];
};

/* ── Resolution ─────────────────────────────────────────────────────────── */

/**
 * Finds the sequence governing a student, in the order the spec defines:
 * a graduated student's personal sequence wins, otherwise their cycle's active
 * sequence (spec §4, §6 graduate loop).
 *
 * Returns null when neither exists — a direct student who has not been
 * assigned a cycle, or a cycle with no sequence yet. The engine treats that as
 * "no methodology active" and leaves the conversation alone, which is the
 * correct failure mode: no heuristics is very different from wrong heuristics.
 */
export async function resolveSequenceId(
  studentId: number,
): Promise<{ sequenceId: number; source: "personal" | "cycle"; cycleId: number | null } | null> {
  const [student] = await db
    .select({
      personalSequenceId: students.personalSequenceId,
      cycleId: students.cycleId,
    })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);

  if (!student) return null;

  if (student.personalSequenceId) {
    return {
      sequenceId: student.personalSequenceId,
      source: "personal",
      cycleId: student.cycleId ?? null,
    };
  }

  if (!student.cycleId) return null;

  const [cycle] = await db
    .select({ activeSequenceId: schoolCycles.activeHeuristicSequenceId })
    .from(schoolCycles)
    .where(eq(schoolCycles.id, student.cycleId))
    .limit(1);

  if (!cycle?.activeSequenceId) return null;

  return {
    sequenceId: cycle.activeSequenceId,
    source: "cycle",
    cycleId: student.cycleId,
  };
}

/**
 * Loads a sequence's cards with their current component versions, in order.
 *
 * Retired heuristics are excluded even if still listed in the sequence — a
 * retirement is a decision that the card should stop firing, and relying on
 * someone also remembering to rewrite every sequence would make that decision
 * unreliable. `candidate` cards DO fire: presence in an active sequence is the
 * methodology owner's explicit act, and candidates need live application to
 * ever accumulate the evidence that validates them.
 */
export async function getSequenceCards(sequenceId: number): Promise<HeuristicCard[]> {
  const rows = await db
    .select({
      heuristicId: heuristics.id,
      name: heuristics.name,
      description: heuristics.description,
      status: heuristics.status,
      populationTags: heuristics.populationTags,
      position: heuristicSequenceEntries.position,
      weight: heuristicSequenceEntries.weight,
    })
    .from(heuristicSequenceEntries)
    .innerJoin(heuristics, eq(heuristics.id, heuristicSequenceEntries.heuristicId))
    .where(
      and(
        eq(heuristicSequenceEntries.sequenceId, sequenceId),
        ne(heuristics.status, "retired"),
      ),
    )
    .orderBy(asc(heuristicSequenceEntries.position));

  if (!rows.length) return [];

  const components = await db
    .select({
      id: heuristicComponents.id,
      heuristicId: heuristicComponents.heuristicId,
      componentType: heuristicComponents.componentType,
      content: heuristicComponents.content,
    })
    .from(heuristicComponents)
    .where(
      and(
        inArray(heuristicComponents.heuristicId, rows.map((r) => r.heuristicId)),
        eq(heuristicComponents.isCurrent, true),
      ),
    );

  const byHeuristic = new Map<number, HeuristicCard["components"]>();
  for (const c of components) {
    const bucket = byHeuristic.get(c.heuristicId) ?? {};
    bucket[c.componentType as ComponentType] = { id: c.id, content: c.content };
    byHeuristic.set(c.heuristicId, bucket);
  }

  return rows.map((r) => ({
    heuristicId: r.heuristicId,
    name: r.name,
    description: r.description,
    status: r.status as HeuristicCard["status"],
    populationTags: r.populationTags ?? [],
    position: r.position,
    // numeric() comes back as a string from pg; the engine wants a number.
    weight: Number(r.weight ?? "1.0"),
    components: byHeuristic.get(r.heuristicId) ?? {},
  }));
}

/** Convenience: resolve and load in one call. Null when no methodology applies. */
export async function getActiveSequenceForStudent(
  studentId: number,
): Promise<ResolvedSequence | null> {
  const resolved = await resolveSequenceId(studentId);
  if (!resolved) return null;

  const cards = await getSequenceCards(resolved.sequenceId);
  if (!cards.length) return null;

  return { ...resolved, cards };
}

/* ── Application log ────────────────────────────────────────────────────── */

/**
 * Records that a heuristic fired. This is what makes the system able to answer
 * "why did Wing say that?" — it pins the exact component version used, so the
 * answer stays correct even after the card is later revised.
 */
export async function logApplication(params: {
  studentId: number;
  sessionId: number;
  heuristicId: number;
  heuristicComponentId: number;
  sequenceId: number;
  turnId?: number | null;
  cycleId?: number | null;
  notes?: string | null;
}): Promise<number> {
  const [row] = await db
    .insert(userHeuristicApplications)
    .values({
      studentId: params.studentId,
      sessionId: params.sessionId,
      heuristicId: params.heuristicId,
      heuristicComponentId: params.heuristicComponentId,
      sequenceId: params.sequenceId,
      turnId: params.turnId ?? null,
      cycleId: params.cycleId ?? null,
      notes: params.notes ?? null,
    })
    .returning({ id: userHeuristicApplications.id });
  return row.id;
}

/** Attaches an outcome to a logged application (set by post-session scoring). */
export async function setApplicationOutcome(
  applicationId: number,
  outcomeSignal: "breakthrough" | "positive" | "neutral" | "regression" | "correction",
) {
  await db
    .update(userHeuristicApplications)
    .set({ outcomeSignal })
    .where(eq(userHeuristicApplications.id, applicationId));
}

/** Applications logged for a session, oldest first. */
export async function listApplicationsForSession(sessionId: number) {
  return db
    .select()
    .from(userHeuristicApplications)
    .where(eq(userHeuristicApplications.sessionId, sessionId))
    .orderBy(asc(userHeuristicApplications.appliedAt));
}

/* ── Authoring ──────────────────────────────────────────────────────────── */

export async function listHeuristics(includeRetired = false) {
  const rows = includeRetired
    ? await db.select().from(heuristics).orderBy(asc(heuristics.name))
    : await db.select().from(heuristics).where(ne(heuristics.status, "retired"))
        .orderBy(asc(heuristics.name));
  return rows;
}

export async function getHeuristic(heuristicId: number) {
  const [card] = await db
    .select()
    .from(heuristics)
    .where(eq(heuristics.id, heuristicId))
    .limit(1);
  if (!card) return undefined;

  const components = await db
    .select()
    .from(heuristicComponents)
    .where(eq(heuristicComponents.heuristicId, heuristicId))
    .orderBy(asc(heuristicComponents.componentType), asc(heuristicComponents.versionNumber));

  return { ...card, components };
}

export async function createHeuristic(data: {
  name: string;
  description: string;
  /** Optional. Derived from the name when omitted, then fixed for life. */
  cardCode?: string;
  populationTags?: string[];
  components?: Array<{ componentType: ComponentType; content: string }>;
}) {
  // Any change to which card rows are current invalidates the copy the
  // turn path reads. Cleared up front rather than on the way out so an
  // early return cannot skip it.
  cache.invalidate("cards:");
  // Derived once, at creation, and never recomputed. Deriving on read would
  // mean renaming a card silently repoints every objective referencing it.
  const existing = await db.select({ code: heuristics.cardCode }).from(heuristics);
  const cardCode = uniqueCode(
    data.cardCode?.trim() || codeFromName(data.name),
    new Set(existing.map((c) => c.code)),
  );

  const [card] = await db
    .insert(heuristics)
    .values({
      cardCode,
      name: data.name,
      description: data.description,
      populationTags: data.populationTags ?? [],
      // New cards are always candidates. Promotion to `validated` is a separate,
      // deliberate act once the card has evidence behind it.
      status: "candidate",
    })
    .returning();

  if (data.components?.length) {
    await db.insert(heuristicComponents).values(
      data.components.map((c) => ({
        heuristicId: card.id,
        componentType: c.componentType,
        content: c.content,
        isCurrent: true,
      })),
    );
  }

  return card;
}

/**
 * Revises one component by writing a NEW version — the previous row stays,
 * flagged not-current, and the new row records what it supersedes.
 *
 * This is why application logs remain meaningful: a log from six months ago
 * still points at the text that was actually used, not at today's wording.
 */
export async function reviseComponent(params: {
  heuristicId: number;
  componentType: ComponentType;
  content: string;
}) {
  // Any change to which card rows are current invalidates the copy the
  // turn path reads. Cleared up front rather than on the way out so an
  // early return cannot skip it.
  cache.invalidate("cards:");
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(heuristicComponents)
      .where(
        and(
          eq(heuristicComponents.heuristicId, params.heuristicId),
          eq(heuristicComponents.componentType, params.componentType),
          eq(heuristicComponents.isCurrent, true),
        ),
      )
      .limit(1);

    if (current) {
      await tx
        .update(heuristicComponents)
        .set({ isCurrent: false })
        .where(eq(heuristicComponents.id, current.id));
    }

    const [created] = await tx
      .insert(heuristicComponents)
      .values({
        heuristicId: params.heuristicId,
        componentType: params.componentType,
        content: params.content,
        versionNumber: (current?.versionNumber ?? 0) + 1,
        supersedesComponentId: current?.id ?? null,
        isCurrent: true,
      })
      .returning();

    await tx
      .update(heuristics)
      .set({ modifiedAt: new Date() })
      .where(eq(heuristics.id, params.heuristicId));

    return created;
  });
}

/**
 * Changes a card's lifecycle status.
 *
 * Heuristics are never deleted — a retired card stays as a permanent record so
 * historical applications remain interpretable (spec §4).
 */
export async function setHeuristicStatus(
  heuristicId: number,
  status: "candidate" | "validated" | "retired",
) {
  // Any change to which card rows are current invalidates the copy the
  // turn path reads. Cleared up front rather than on the way out so an
  // early return cannot skip it.
  cache.invalidate("cards:");
  const [row] = await db
    .update(heuristics)
    .set({ status, modifiedAt: new Date() })
    .where(eq(heuristics.id, heuristicId))
    .returning();
  return row;
}

/**
 * Publishes a new sequence for a cycle, superseding the current one.
 *
 * Per spec §2, methodology changes belong in the evaluation window between
 * cohorts — this function does not enforce that, because the caller (the admin
 * UI) is where the window check belongs and an emergency retraction must stay
 * possible. It is recorded honestly either way: the old sequence keeps its
 * rows and gains a superseded_at stamp.
 */
export async function publishCycleSequence(params: {
  cycleId: number;
  entries: Array<{ heuristicId: number; weight?: number }>;
}) {
  return db.transaction(async (tx) => {
    const [cycle] = await tx
      .select({ activeSequenceId: schoolCycles.activeHeuristicSequenceId })
      .from(schoolCycles)
      .where(eq(schoolCycles.id, params.cycleId))
      .limit(1);

    const [previous] = cycle?.activeSequenceId
      ? await tx
          .select({ versionNumber: heuristicSequences.versionNumber })
          .from(heuristicSequences)
          .where(eq(heuristicSequences.id, cycle.activeSequenceId))
          .limit(1)
      : [undefined];

    const now = new Date();

    if (cycle?.activeSequenceId) {
      await tx
        .update(heuristicSequences)
        .set({ supersededAt: now })
        .where(eq(heuristicSequences.id, cycle.activeSequenceId));
    }

    const [sequence] = await tx
      .insert(heuristicSequences)
      .values({
        ownerType: "school_cycle",
        ownerId: params.cycleId,
        versionNumber: (previous?.versionNumber ?? 0) + 1,
        activeFrom: now,
      })
      .returning({ id: heuristicSequences.id });

    if (params.entries.length) {
      await tx.insert(heuristicSequenceEntries).values(
        params.entries.map((e, i) => ({
          sequenceId: sequence.id,
          heuristicId: e.heuristicId,
          position: i + 1,
          weight: String(e.weight ?? 1.0),
        })),
      );
    }

    await tx
      .update(schoolCycles)
      .set({ activeHeuristicSequenceId: sequence.id, updatedAt: now })
      .where(eq(schoolCycles.id, params.cycleId));

    return sequence.id;
  });
}
