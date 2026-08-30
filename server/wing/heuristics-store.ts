import { and, asc, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { db } from "../db";
import {
  students,
  schoolCycles,
  heuristics,
  heuristicComponents,
  heuristicSequences,
  heuristicSequenceEntries,
  intakeRecords,
  sessions,
  userHeuristicApplications,
  users,
} from "@shared/wing-schema";
import { codeFromName, uniqueCode } from "./card-code";
import { cardAppliesTo, populationTagsFor } from "./population-tags";

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
  | "module_mapping" | "population_context" | "notes"
  // v2 (migration 0019). A v2 card has no `intervention`: that split into
  // `intervention_type` (a column) and `coaching_move`.
  | "detection_method" | "delivery_adaptation" | "failure_path" | "success_criteria";

export type CardKind = "coaching_card" | "integrity_gate" | "exercise";

export type HeuristicCard = {
  heuristicId: number;
  /**
   * The methodology's own identifier — "H-309".
   *
   * Carried into the engine because that is what the methodology, the routing
   * maps and every conversation about a card use, so a log line or a gate
   * exclusion keyed on a numeric id is unreadable.
   */
  cardCode: string;
  name: string;
  description: string;
  status: "candidate" | "validated" | "retired";
  populationTags: string[];
  /**
   * coaching_card fires on the student's turn; integrity_gate fires on Wing's
   * own output and must never enter the detector catalogue; exercise is routed
   * to by explicit reference from another card.
   */
  cardKind: CardKind;
  /** COACH · CHALLENGE · REDIRECT · REFRAME · AFFIRM · META · GATE. Null pre-v2. */
  interventionType: string | null;
  /** Session this entry fires in; null means every session. */
  appliesToSession: string | null;
  /** Position within the active sequence (1-based). */
  position: number;
  /**
   * Sequence weight. Higher wins when several signals fire.
   *
   * This comment used to describe behaviour that did not exist — the column was
   * written by the seeds, editable in the admin UI, and read by nothing. It is
   * true as of T3: `getSequenceCards` orders by weight and the detector prompt
   * states it with an instruction to prefer the higher one. The methodology
   * depends on it: H-309 trust vault protection is weight 2.0 specifically so it
   * pre-empts everything else.
   */
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
export async function getSequenceCards(
  sequenceId: number,
  opts: { kinds?: readonly CardKind[]; sessionType?: string | null } = {},
): Promise<HeuristicCard[]> {
  const rows = await db
    .select({
      heuristicId: heuristics.id,
      cardCode: heuristics.cardCode,
      name: heuristics.name,
      description: heuristics.description,
      status: heuristics.status,
      populationTags: heuristics.populationTags,
      cardKind: heuristics.cardKind,
      interventionType: heuristics.interventionType,
      position: heuristicSequenceEntries.position,
      weight: heuristicSequenceEntries.weight,
      appliesToSession: heuristicSequenceEntries.appliesToSession,
    })
    .from(heuristicSequenceEntries)
    .innerJoin(heuristics, eq(heuristics.id, heuristicSequenceEntries.heuristicId))
    .where(
      and(
        eq(heuristicSequenceEntries.sequenceId, sequenceId),
        ne(heuristics.status, "retired"),
        ...(opts.kinds && opts.kinds.length
          ? [inArray(heuristics.cardKind, opts.kinds as CardKind[])]
          : []),
        /*
         * Session scope (migration 0020). An entry with no session applies
         * everywhere — the universal and voice gates. Omitting sessionType
         * entirely returns the whole sequence, which is what the admin UI wants
         * and what a reviewer inspecting a cycle's methodology needs to see.
         */
        ...(opts.sessionType
          ? [
              or(
                isNull(heuristicSequenceEntries.appliesToSession),
                eq(heuristicSequenceEntries.appliesToSession, opts.sessionType as never),
              )!,
            ]
          : []),
      ),
    )
    // Weight first, position second. Weight is precedence — the methodology sets
    // H-309 to 2.0 so it pre-empts — and position is the sequence's own reading
    // order, which decides ties. Ordering by position alone made weight inert.
    .orderBy(desc(heuristicSequenceEntries.weight), asc(heuristicSequenceEntries.position));

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
    cardCode: r.cardCode,
    name: r.name,
    description: r.description,
    status: r.status as HeuristicCard["status"],
    populationTags: r.populationTags ?? [],
    cardKind: (r.cardKind ?? "coaching_card") as CardKind,
    interventionType: r.interventionType ?? null,
    appliesToSession: r.appliesToSession ?? null,
    position: r.position,
    // numeric() comes back as a string from pg; the engine wants a number.
    weight: Number(r.weight ?? "1.0"),
    components: byHeuristic.get(r.heuristicId) ?? {},
  }));
}

/**
 * The population tags that may apply to a student.
 *
 * `professional_status` is on `users`; `pathway` is on `intake_records`. Both are
 * nullable and a student mid-intake has neither, which resolves to no tags and
 * therefore to no filtering — see `cardAppliesTo`.
 */
export async function populationTagsForStudent(studentId: number): Promise<string[]> {
  const [row] = await db
    .select({
      status: users.professionalStatus,
      pathway: intakeRecords.pathway,
    })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(intakeRecords, eq(intakeRecords.studentId, students.id))
    .where(eq(students.id, studentId))
    .limit(1);

  if (!row) return [];
  return populationTagsFor(row.status as never, row.pathway as never);
}

/**
 * Convenience: resolve and load in one call. Null when no methodology applies.
 *
 * Filters by the student's population, which nothing did before T3 — every card
 * in a sequence entered the detector catalogue for every student regardless of
 * who they were. Only 5 of the 53 Tier 1 cards fire for a single population, so
 * this changes less than it sounds; those five are the ones that were reaching
 * the wrong people. `kinds` defaults to coaching cards only: a gate's signal
 * describes something WING is about to say, so offering it to a detector that
 * matches against the student's words is a category error.
 */
export async function getActiveSequenceForStudent(
  studentId: number,
  opts: { kinds?: readonly CardKind[]; sessionId?: number | null } = {
    kinds: ["coaching_card"],
  },
): Promise<ResolvedSequence | null> {
  const resolved = await resolveSequenceId(studentId);
  if (!resolved) return null;

  /*
   * Scope to the session the student is actually in. Without this every card in
   * the sequence entered the catalogue on every turn, so a Foundation 1 student
   * could have H-201 fire — the Foundation 2 credibility test. The compendium
   * separates its sequence maps by session for exactly this reason.
   *
   * A missing or unknown session leaves the scope unset, which returns the whole
   * sequence rather than nothing: an unscoped catalogue offers a few cards
   * pitched at the wrong session, an empty one silently switches the methodology
   * off. Same fail-open reasoning as an unresolved population.
   */
  let sessionType: string | null = null;
  if (opts.sessionId) {
    const [session] = await db
      .select({ type: sessions.sessionType })
      .from(sessions)
      .where(eq(sessions.id, opts.sessionId))
      .limit(1);
    sessionType = session?.type ?? null;
  }

  const all = await getSequenceCards(resolved.sequenceId, {
    kinds: opts.kinds,
    sessionType,
  });
  if (!all.length) return null;

  const tags = await populationTagsForStudent(studentId);
  const cards = all.filter((c) => cardAppliesTo(c.populationTags, tags));
  if (!cards.length) return null;

  return { ...resolved, cards };
}

/* ── Application log ────────────────────────────────────────────────────── */

/**
 * A gate's row id and current coaching-move component, by card code.
 *
 * Used only on the rare path where a gate actually changes what Wing does, so the
 * query cost is paid when something happens rather than on every turn. Returns
 * null when the gate is not in this sequence — which is the correct answer, not an
 * error: a cohort whose methodology omits H-003 should not have it enforced.
 */
export async function findGateInSequence(
  sequenceId: number,
  cardCode: string,
): Promise<{ heuristicId: number; componentId: number } | null> {
  const [row] = await db
    .select({
      heuristicId: heuristics.id,
      componentId: heuristicComponents.id,
    })
    .from(heuristicSequenceEntries)
    .innerJoin(heuristics, eq(heuristics.id, heuristicSequenceEntries.heuristicId))
    .innerJoin(
      heuristicComponents,
      and(
        eq(heuristicComponents.heuristicId, heuristics.id),
        eq(heuristicComponents.componentType, "coaching_move"),
        eq(heuristicComponents.isCurrent, true),
      ),
    )
    .where(
      and(
        eq(heuristicSequenceEntries.sequenceId, sequenceId),
        eq(heuristics.cardCode, cardCode),
        ne(heuristics.status, "retired"),
      ),
    )
    .limit(1);

  return row ?? null;
}

/**
 * The intervention types of this session's most recent applications, newest first.
 *
 * For H-003, which forbids three consecutive high-intensity interactions. Only
 * the types are returned, not the cards: the gate cares about how hard the last
 * few turns landed, not which rule produced them.
 *
 * Selects from the applications rather than the transcript because a turn where
 * no card fired is LOW by the gate's own list ("general conversation"), so an
 * absent row and a low-intensity row mean the same thing — and reading the
 * applications keeps the query to one join.
 */
export async function recentIntensities(
  sessionId: number,
  limit = 4,
): Promise<Array<string | null>> {
  const rows = await db
    .select({ interventionType: heuristics.interventionType })
    .from(userHeuristicApplications)
    .innerJoin(heuristics, eq(heuristics.id, userHeuristicApplications.heuristicId))
    .where(eq(userHeuristicApplications.sessionId, sessionId))
    .orderBy(desc(userHeuristicApplications.appliedAt))
    .limit(limit);

  return rows.map((r) => r.interventionType ?? null);
}


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
  /*
   * ── THE CARD CACHE, AND WHY THERE IS NO LONGER AN INVALIDATION ───────────
   * Each of the three writers here used to clear the published-cache namespace
   * for cards before doing anything. The only place that ever filled it was
   * `objective-runtime.ts`, retired in Tier 1 part 4 — so the three clears
   * emptied a namespace nothing populated, which `api-contracts` check 12
   * reports as a probable half-finished rename. It was not a rename; the reader
   * is gone, and so are they.
   *
   * The v2 turn path reads cards straight from the database. If a cache is put
   * back in front of them, the clears come back with it — the same check fails
   * in the other direction for a namespace that is filled and never emptied.
   *
   * Written without the call syntax on purpose: check 12 scans raw source, so a
   * comment quoting either call registers as a real one.
   */

  // Derived once, at creation, and never recomputed. Deriving on read would
  // mean renaming a card silently repoints everything referencing it.
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
/**
 * Points a cycle at a sequence that already exists.
 *
 * ── WHY THIS IS SEPARATE FROM `publishCycleSequence` ─────────────────────
 * That function COMPOSES a sequence: it takes a list of entries, writes a new
 * version, and points the cycle at it. There was no way to point a cycle at a
 * version that had already been built — and `wing:build-sequences` builds
 * without publishing on purpose, so the 53-card Foundation sequence could be
 * assembled, inspected, and never switched on. Publishing it through the compose
 * path would have meant re-sending all 53 entries and producing a duplicate
 * version differing from the reviewed one only by id.
 *
 * It is also the rollback: pointing back at the previous version is the fastest
 * way to undo a bad publish, and it is one row.
 *
 * ── THE THREE WRITES, AND WHY THE MIDDLE ONE MATTERS ────────────────────
 * 1. The outgoing sequence gets `superseded_at`, exactly as publishing does.
 * 2. The incoming sequence has `superseded_at` CLEARED. It may well have been
 *    superseded — by a later build, or by the publish that replaced it — and
 *    leaving that set would have the history screen label the live sequence
 *    "Superseded", which is a lie it would repeat on every load. `active_from`
 *    moves to now for the same reason: the column means when this became live.
 * 3. The cycle pointer moves. This is the publication. `resolveSequenceId` reads
 *    nothing else.
 *
 * One transaction, because a pointer moved without the supersession bookkeeping
 * leaves two sequences that both look current.
 */
export async function activateExistingSequence(params: {
  cycleId: number;
  sequenceId: number;
}): Promise<{ previousSequenceId: number | null }> {
  return db.transaction(async (tx) => {
    const [cycle] = await tx
      .select({ activeSequenceId: schoolCycles.activeHeuristicSequenceId })
      .from(schoolCycles)
      .where(eq(schoolCycles.id, params.cycleId))
      .limit(1);

    const previous = cycle?.activeSequenceId ?? null;
    const now = new Date();

    if (previous && previous !== params.sequenceId) {
      await tx
        .update(heuristicSequences)
        .set({ supersededAt: now })
        .where(eq(heuristicSequences.id, previous));
    }

    await tx
      .update(heuristicSequences)
      .set({ supersededAt: null, activeFrom: now })
      .where(eq(heuristicSequences.id, params.sequenceId));

    await tx
      .update(schoolCycles)
      .set({ activeHeuristicSequenceId: params.sequenceId, updatedAt: now })
      .where(eq(schoolCycles.id, params.cycleId));

    return { previousSequenceId: previous };
  });
}

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
