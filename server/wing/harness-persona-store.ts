import { and, count, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "../db";
import {
  advisorAppointments,
  classifierPromptComponents,
  contentActivityLog,
  contentDrafts,
  documents,
  engagementSequenceStates,
  entitlements,
  evidencePortfolioItems,
  freshnessReports,
  gateAuditFindings,
  harnessPersonas,
  heuristics,
  heuristicSequenceEntries,
  heuristicSequences,
  intakeRecords,
  legacyRecords,
  lifeLogEntries,
  linkedinOptimizations,
  messageEvents,
  passwordResets,
  radarSuggestions,
  schoolCycles,
  selfDescriptions,
  sessionArtifacts,
  sessions,
  sliRecords,
  students,
  testRunSessions,
  testRuns,
  transactions,
  transcripts,
  transcriptTurns,
  turnObjectives,
  userChannelPreferences,
  userDeliveryProfiles,
  userHeuristicApplications,
  userHeuristicScores,
  userMemoryEmbeddings,
  users,
} from "@shared/wing-schema";
import { PATHWAYS, PROFESSIONAL_STATUSES, personaEmail } from "./parse-persona";
import { populationTagsFor, type Pathway, type ProfessionalStatus } from "./population-tags";
import { isModelTier } from "./model-tier";
import type { ModelTier } from "../orchestrator";

/**
 * Persona authoring for the Admin panel — the DB-backed twin of
 * `parse-persona.ts` / `seed-personas.ts`.
 *
 * ── WHY THIS EXISTS BESIDE THE FILE-BASED FORMAT, NOT INSTEAD OF IT ───────
 * `methodology/personas/*.md` still works — nothing here changes it. This is
 * for Danielle, who does not have a repo checkout: a draft here, a
 * `wing.harness_personas` row, becomes exactly the account
 * `wing:seed-personas --apply` would have created, by calling the same three
 * inserts (`users`, `students`, `intake_records`) from `activatePersona`
 * below instead of from the CLI script.
 *
 * ── WHY THE CONTENT IS EIGHT FIELDS, NOT ONE BLOB OR A DOCUMENT LINK ──────
 * The first cut had one `specBody` textarea and a `sourceNote` inviting a
 * document link. Aditya's correction, 10 Sep: expose the actual fields
 * Danielle writes, and never depend on parsing a document. `CONTENT_FIELDS`
 * below names the eight sections her own sample document actually contains;
 * `composeSpecPrompt` concatenates whichever are filled, in that fixed
 * order, into the one text a future runner injects — still exactly one
 * verbatim prompt, assembled from labelled fields rather than typed as one.
 *
 * ── WHAT THIS FILE IS ALLOWED TO WRITE ─────────────────────────────────────
 * Two shapes of write, nothing else. Draft authoring touches one table, its
 * own: `harness_personas`. Activation and its exact mirror, purging a seeded
 * persona, touch every table a seeded persona's account can ever have data
 * in: `users`, `students`, `intake_records` (created going forward, by
 * `activatePersona`) and — going backward, by `deletePersona` — everything a
 * session against that account could have generated: `sessions`,
 * `transcripts`, `transcript_turns`, `session_artifacts`, `turn_objectives`,
 * `user_memory_embeddings`, `user_heuristic_applications`,
 * `user_heuristic_scores`, `gate_audit_findings`, `message_events`,
 * `life_log_entries`, `self_descriptions`, `sli_records`,
 * `evidence_portfolio_items`, `linkedin_optimizations`, `content_drafts`,
 * `content_activity_log`, `engagement_sequence_states`,
 * `radar_suggestions`, `freshness_reports`, `documents`,
 * `advisor_appointments`, `user_delivery_profiles`, `legacy_records`,
 * `password_resets`, `user_channel_preferences`, `entitlements`,
 * `transactions`, `test_run_sessions` and `test_runs` (added 2026-09-15 —
 * these are P3 tables, added to the schema after this cascade was first
 * written, and were the exact gap this comment warns about two paragraphs
 * down: not in the list, and not caught until a persona that had actually
 * been run was deleted for the first time), and one UPDATE-only table:
 * `classifier_prompt_components`,
 * whose `source_turn_id` is nulled (never deleted — the row is a training
 * example that outlives the turn it was drawn from, and the classifier
 * prompt it belongs to must keep working) before a purged persona's
 * `transcript_turns` are deleted. (`student_demographics`, `homework_assignments`,
 * `monthly_check_ins` and `coaching_notes` all declare `ON DELETE CASCADE`
 * on `student_id` at the database level, so deleting the `students` row
 * clears them without a statement of their own here.)
 * `harness-persona-boundary.test.ts` asserts this is the exact, closed set —
 * scanning the file for every insert/update/delete target. A table added to
 * `shared/wing-schema.ts` later that carries a `student_id`/`user_id` and
 * isn't in that set is a gap in this list to close, not a green light to
 * reach it some other way.
 *
 * `deletePersona` is the one function that reaches all of them, and only for
 * a persona whose `seeded_student_id` resolves to an `is_test_user = true`
 * account — checked again here, not assumed, because this is the one place
 * in the harness that deletes real rows rather than only ever creating them.
 * `pattern_detection_queue.supporting_turn_ids` is a plain bigint array, not
 * a foreign key, so a purge can leave a stale id sitting in there; that
 * table has no populating pipeline yet (see its own doc comment in
 * `wing-schema.ts`), so this is a known, harmless gap, not an oversight.
 *
 * ── WHY ACTIVATION CHECKS THE CYCLE AGAIN, WHEN THE UI ALREADY WILL ───────
 * `create-sandbox-cycle.ts` and `seed-personas.ts` both check independently
 * that a cycle publishes something before writing under it — "two independent
 * scripts asking the same question rather than one trusting the other's
 * earlier check" (`claude/HARNESS_BUILD_STEP5_SEP10.md`). This is the third
 * independent implementation of that same check, for the same reason: a
 * cycle pointing at nothing, or at a superseded sequence, would seed an
 * account whose every turn produces an empty selection trace — a
 * configuration mistake that reads exactly like a methodology finding.
 */

export type HarnessPersonaRow = typeof harnessPersonas.$inferSelect;

/** The eight sections, and the heading `composeSpecPrompt` gives each one. */
const CONTENT_FIELDS = [
  { key: "quickReference", heading: "Quick Reference" },
  { key: "readinessByBehavior", heading: "Readiness to change — by behavior" },
  { key: "interactionPolicy", heading: "Interaction Policy" },
  { key: "voiceSample", heading: "Voice Sample" },
  { key: "diamond", heading: "Diamond (testable outcome)" },
  { key: "coldStartNote", heading: "The Cold-Start Problem" },
  { key: "systemPromptSummary", heading: "System Prompt Summary" },
  { key: "whatThisTests", heading: "What This Tests" },
] as const;

type ContentKey = (typeof CONTENT_FIELDS)[number]["key"];

export type PersonaInput = {
  personaKey: string;
  name: string;
  professionalStatus?: ProfessionalStatus | null;
  pathway?: Pathway | null;
  /**
   * Which deployment tier plays this persona's side of a test run by
   * default — Danielle's own choice (Aditya, 11 Sep 2026), consulted by
   * `test-run-engine.ts`'s `claimTestRun` before it falls back to the
   * platform-wide default. Never locked, unlike professional status/pathway
   * below: it doesn't change what account exists, only what a future run
   * picks, so it stays editable even after a persona is seeded — "if the
   * results are not satisfactory, Danielle can change the model on the fly
   * and rerun the tests."
   */
  defaultModelTier?: ModelTier | null;
  expectedMarkers?: string[];
  quickReference?: string;
  readinessByBehavior?: string;
  interactionPolicy?: string;
  voiceSample?: string;
  diamond?: string;
  coldStartNote?: string;
  systemPromptSummary?: string;
  whatThisTests?: string;
};

export type PersonaValidationFailure = { field: string; problem: string };

const SLUG = /^[a-z0-9][a-z0-9-]{1,48}$/;

/** Trims and drops blanks — unlike the file parser, there is no ambiguous
 *  bullet syntax here to mistake for "nothing entered", so a blank tag is
 *  just discarded rather than refused. */
function cleanList(items: string[] | undefined): string[] {
  return (items ?? []).map((s) => s.trim()).filter((s) => s.length > 0);
}

function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/);
  return parts.length === 1
    ? { first: parts[0], last: "(persona)" }
    : { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

/**
 * Assembles the eight fields into the one text a runner injects verbatim —
 * whichever sections are filled, in a fixed order, each under its own
 * heading so the seams stay visible rather than dissolving into one blob.
 * A blank section is simply omitted, not padded with an empty heading.
 */
export function composeSpecPrompt(row: Partial<Record<ContentKey, string>>): string {
  return CONTENT_FIELDS.map(({ key, heading }) => {
    const value = (row[key] ?? "").trim();
    return value ? `# ${heading}\n\n${value}` : null;
  })
    .filter((section): section is string => section !== null)
    .join("\n\n");
}

/**
 * The same refusal `parsePersona` makes for the file format — missing or
 * unrecognised `professional_status`/`pathway` resolves to no audience tags,
 * which would make every audience-specific card look like dead weight in the
 * Unfired Cards report (`claude/HARNESS_BUILD_STEP4_SEP9.md` §2). Checked
 * again here because a draft may legitimately have neither filled in yet;
 * this is what gates 'ready' and activation, not what gates saving a draft.
 */
export function validatePersonaForActivation(
  row: { professionalStatus: string | null; pathway: string | null } & Partial<
    Record<ContentKey, string>
  >,
): PersonaValidationFailure[] {
  const failures: PersonaValidationFailure[] = [];
  const status = row.professionalStatus;
  const pathway = row.pathway;

  if (!status) {
    failures.push({
      field: "professionalStatus",
      problem: `missing. One of: ${PROFESSIONAL_STATUSES.join(", ")}`,
    });
  } else if (!PROFESSIONAL_STATUSES.includes(status as ProfessionalStatus)) {
    failures.push({
      field: "professionalStatus",
      problem: `"${status}" is not one of: ${PROFESSIONAL_STATUSES.join(", ")}`,
    });
  }

  if (!pathway) {
    failures.push({
      field: "pathway",
      problem: `missing. One of: ${PATHWAYS.join(", ")}`,
    });
  } else if (!PATHWAYS.includes(pathway as Pathway)) {
    failures.push({
      field: "pathway",
      problem: `"${pathway}" is not one of: ${PATHWAYS.join(", ")}`,
    });
  }

  if (!composeSpecPrompt(row).trim()) {
    failures.push({
      field: "spec content",
      problem:
        "every section is empty. At least one (quick reference, interaction policy, voice " +
        "sample...) has to have something in it — an activated persona with no content " +
        "would run a persona with no character.",
    });
  }

  if (
    status &&
    pathway &&
    PROFESSIONAL_STATUSES.includes(status as ProfessionalStatus) &&
    PATHWAYS.includes(pathway as Pathway)
  ) {
    const tags = populationTagsFor(status as ProfessionalStatus, pathway as Pathway);
    if (!tags.length) {
      failures.push({
        field: "professionalStatus/pathway",
        problem: `"${status}" + "${pathway}" resolves to no population tags`,
      });
    }
  }

  return failures;
}

export async function listPersonas(): Promise<HarnessPersonaRow[]> {
  return db.select().from(harnessPersonas).orderBy(desc(harnessPersonas.updatedAt));
}

export async function getPersona(id: number): Promise<HarnessPersonaRow | null> {
  const [row] = await db.select().from(harnessPersonas).where(eq(harnessPersonas.id, id));
  return row ?? null;
}

export type CreateResult =
  | { ok: true; persona: HarnessPersonaRow }
  | {
      ok: false;
      error: "invalid_key" | "duplicate_key" | "invalid_status" | "invalid_pathway" | "invalid_model_tier";
      detail?: string;
    };

export async function createPersona(input: PersonaInput): Promise<CreateResult> {
  if (!SLUG.test(input.personaKey)) {
    return {
      ok: false,
      error: "invalid_key",
      detail: "lower-case letters, digits and hyphens, 2-49 characters",
    };
  }
  if (input.professionalStatus && !PROFESSIONAL_STATUSES.includes(input.professionalStatus)) {
    return { ok: false, error: "invalid_status" };
  }
  if (input.pathway && !PATHWAYS.includes(input.pathway)) {
    return { ok: false, error: "invalid_pathway" };
  }
  if (input.defaultModelTier != null && !isModelTier(input.defaultModelTier)) {
    return { ok: false, error: "invalid_model_tier" };
  }

  const [clash] = await db
    .select({ id: harnessPersonas.id })
    .from(harnessPersonas)
    .where(eq(harnessPersonas.personaKey, input.personaKey));
  if (clash) return { ok: false, error: "duplicate_key", detail: input.personaKey };

  const [row] = await db
    .insert(harnessPersonas)
    .values({
      personaKey: input.personaKey,
      name: input.name,
      professionalStatus: input.professionalStatus ?? null,
      pathway: input.pathway ?? null,
      defaultModelTier: input.defaultModelTier ?? null,
      expectedMarkers: cleanList(input.expectedMarkers),
      quickReference: input.quickReference ?? "",
      readinessByBehavior: input.readinessByBehavior ?? "",
      interactionPolicy: input.interactionPolicy ?? "",
      voiceSample: input.voiceSample ?? "",
      diamond: input.diamond ?? "",
      coldStartNote: input.coldStartNote ?? "",
      systemPromptSummary: input.systemPromptSummary ?? "",
      whatThisTests: input.whatThisTests ?? "",
      status: "draft",
    })
    .returning();

  return { ok: true, persona: row };
}

export type UpdateResult =
  | { ok: true; persona: HarnessPersonaRow }
  | {
      ok: false;
      error: "not_found" | "seeded_locked" | "invalid_status" | "invalid_pathway" | "invalid_model_tier";
    };

/**
 * Editable at any time: name, expected markers, every content field.
 * Locked once seeded: professional status and pathway — those are already
 * baked into the real `wing.users` row an edit here could no longer reach,
 * so allowing the change would make this screen quietly disagree with the
 * account it created.
 */
export async function updatePersona(
  id: number,
  input: Partial<PersonaInput>,
): Promise<UpdateResult> {
  const existing = await getPersona(id);
  if (!existing) return { ok: false, error: "not_found" };

  const touchesLockedField =
    (input.professionalStatus !== undefined &&
      input.professionalStatus !== existing.professionalStatus) ||
    (input.pathway !== undefined && input.pathway !== existing.pathway);

  if (existing.status === "seeded" && touchesLockedField) {
    return { ok: false, error: "seeded_locked" };
  }
  if (input.professionalStatus && !PROFESSIONAL_STATUSES.includes(input.professionalStatus)) {
    return { ok: false, error: "invalid_status" };
  }
  if (input.pathway && !PATHWAYS.includes(input.pathway)) {
    return { ok: false, error: "invalid_pathway" };
  }
  if (input.defaultModelTier != null && !isModelTier(input.defaultModelTier)) {
    return { ok: false, error: "invalid_model_tier" };
  }

  const contentUpdates: Partial<Record<ContentKey, string>> = {};
  for (const { key } of CONTENT_FIELDS) {
    if (input[key] !== undefined) contentUpdates[key] = input[key] as string;
  }

  const [row] = await db
    .update(harnessPersonas)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(!touchesLockedField && input.professionalStatus !== undefined
        ? { professionalStatus: input.professionalStatus }
        : {}),
      ...(!touchesLockedField && input.pathway !== undefined ? { pathway: input.pathway } : {}),
      // Never locked, even on a seeded persona — see this field's own doc
      // comment on PersonaInput for why: it doesn't change what account
      // exists.
      ...(input.defaultModelTier !== undefined ? { defaultModelTier: input.defaultModelTier } : {}),
      ...(input.expectedMarkers !== undefined
        ? { expectedMarkers: cleanList(input.expectedMarkers) }
        : {}),
      ...contentUpdates,
      updatedAt: new Date(),
    })
    .where(eq(harnessPersonas.id, id))
    .returning();

  return { ok: true, persona: row };
}

export type DeleteResult = { ok: true } | { ok: false; error: "not_found" | "not_test_user" };

/**
 * A draft is discardable — nothing exists behind it but this row. A seeded
 * persona is a real `is_test_user = true` account, so "delete" means
 * something bigger here: every row that account's sessions could have
 * generated, then the account itself, then this row — a complete, one-click
 * clean slate for re-testing the same persona from scratch (Aditya, 10 Sep:
 * "a way to completely clean a particular persona's data").
 *
 * Ordered deepest-first so foreign keys never point at a row that's already
 * gone: turn/transcript/session-level data before the session rows
 * themselves, everything student-scoped before the `students` row, both
 * accounts' tables before the `users` row. `student_demographics`,
 * `homework_assignments`, `monthly_check_ins` and `coaching_notes` aren't
 * listed below because they're declared `ON DELETE CASCADE` on
 * `student_id` — the `students` delete removes them on its own.
 */
export async function deletePersona(id: number): Promise<DeleteResult> {
  const existing = await getPersona(id);
  if (!existing) return { ok: false, error: "not_found" };

  if (existing.status !== "seeded" || !existing.seededStudentId) {
    await db.delete(harnessPersonas).where(eq(harnessPersonas.id, id));
    return { ok: true };
  }

  const studentId = existing.seededStudentId;
  const [account] = await db
    .select({ userId: students.userId, isTestUser: users.isTestUser })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .where(eq(students.id, studentId));

  if (!account) {
    // The seeded account is already gone somehow (hand-cleaned, or a partial
    // purge that failed partway through a previous run) — nothing left to
    // cascade, so just drop the row that's now pointing at nothing.
    await db.delete(harnessPersonas).where(eq(harnessPersonas.id, id));
    return { ok: true };
  }
  if (!account.isTestUser) {
    // Should be unreachable — activatePersona only ever creates
    // is_test_user accounts — but this is the one place in the harness that
    // deletes real data, so it verifies for itself rather than trusting that
    // nothing upstream ever changed.
    return { ok: false, error: "not_test_user" };
  }

  const userId = account.userId;

  await db.transaction(async (tx) => {
    const sessionRows = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.studentId, studentId));
    const sessionIds = sessionRows.map((r) => r.id);

    const transcriptRows = sessionIds.length
      ? await tx.select({ id: transcripts.id }).from(transcripts).where(inArray(transcripts.sessionId, sessionIds))
      : [];
    const transcriptIds = transcriptRows.map((r) => r.id);

    const turnRows = transcriptIds.length
      ? await tx
          .select({ id: transcriptTurns.id })
          .from(transcriptTurns)
          .where(inArray(transcriptTurns.transcriptId, transcriptIds))
      : [];
    const turnIds = turnRows.map((r) => r.id);

    // Deepest first: anything that can name a turn, a transcript or a
    // session, before the turn/transcript/session rows it names.
    await tx.delete(userMemoryEmbeddings).where(eq(userMemoryEmbeddings.studentId, studentId));
    await tx.delete(userHeuristicApplications).where(eq(userHeuristicApplications.studentId, studentId));
    await tx.delete(gateAuditFindings).where(eq(gateAuditFindings.studentId, studentId));
    await tx.delete(evidencePortfolioItems).where(eq(evidencePortfolioItems.studentId, studentId));
    if (sessionIds.length) {
      await tx.delete(turnObjectives).where(inArray(turnObjectives.sessionId, sessionIds));
    }
    if (turnIds.length) {
      // Nulled, not deleted — same rule reset-foundation-sessions.ts follows
      // for this exact table: a classifier prompt's training example
      // outlives the turn it was drawn from, and the published prompt must
      // keep working after the turn it once cited is gone.
      await tx
        .update(classifierPromptComponents)
        .set({ sourceTurnId: null })
        .where(inArray(classifierPromptComponents.sourceTurnId, turnIds));
    }
    if (transcriptIds.length) {
      await tx.delete(transcriptTurns).where(inArray(transcriptTurns.transcriptId, transcriptIds));
    }

    // message_events before life_log_entries: a message event can name the
    // life-log entry it logged.
    await tx.delete(messageEvents).where(eq(messageEvents.studentId, studentId));
    // content_activity_log before content_drafts: it can name the draft.
    await tx.delete(contentActivityLog).where(eq(contentActivityLog.studentId, studentId));
    // linkedin_optimizations and content_drafts before sli_records: both can
    // name an SLI.
    await tx.delete(linkedinOptimizations).where(eq(linkedinOptimizations.studentId, studentId));
    await tx.delete(contentDrafts).where(eq(contentDrafts.studentId, studentId));
    await tx.delete(sliRecords).where(eq(sliRecords.studentId, studentId));
    await tx.delete(lifeLogEntries).where(eq(lifeLogEntries.studentId, studentId));
    await tx.delete(selfDescriptions).where(eq(selfDescriptions.studentId, studentId));
    await tx.delete(intakeRecords).where(eq(intakeRecords.studentId, studentId));

    if (sessionIds.length) {
      await tx.delete(transcripts).where(inArray(transcripts.sessionId, sessionIds));
      await tx.delete(sessionArtifacts).where(inArray(sessionArtifacts.sessionId, sessionIds));
      // Added after the fact (test_runs/test_run_sessions are P3 tables,
      // this cascade predates them) — caught only once a persona that had
      // actually been run was deleted for the first time (2026-09-15):
      // "update or delete on table sessions violates foreign key constraint
      // test_run_sessions_session_id_fk". Must go before the sessions
      // delete below, the same "deepest first" rule every other table here
      // already follows.
      await tx.delete(testRunSessions).where(inArray(testRunSessions.sessionId, sessionIds));
    }
    await tx.delete(sessions).where(eq(sessions.studentId, studentId));

    // Leaves — nothing else in this list points at any of them.
    await tx.delete(engagementSequenceStates).where(eq(engagementSequenceStates.studentId, studentId));
    await tx.delete(radarSuggestions).where(eq(radarSuggestions.studentId, studentId));
    await tx.delete(freshnessReports).where(eq(freshnessReports.studentId, studentId));
    await tx.delete(documents).where(eq(documents.studentId, studentId));
    await tx.delete(advisorAppointments).where(eq(advisorAppointments.studentId, studentId));
    await tx.delete(userDeliveryProfiles).where(eq(userDeliveryProfiles.studentId, studentId));
    await tx.delete(userHeuristicScores).where(eq(userHeuristicScores.studentId, studentId));
    await tx.delete(legacyRecords).where(eq(legacyRecords.studentId, studentId));

    // test_runs.persona_id references harness_personas.id directly (not
    // through students), so it has to go before harness_personas is deleted
    // too, for the same reason test_run_sessions had to go before sessions
    // above — every test_run_sessions row for this persona is already gone
    // by this point (its session_id was always one of sessionIds above).
    await tx.delete(testRuns).where(eq(testRuns.personaId, id));

    // harness_personas itself is a child of students (seeded_student_id) and
    // of school_cycles (seeded_cycle_id) — it has to go before the students
    // delete below, not after, or that delete hits exactly this row's own FK.
    await tx.delete(harnessPersonas).where(eq(harnessPersonas.id, id));

    await tx.delete(students).where(eq(students.id, studentId));

    await tx.delete(passwordResets).where(eq(passwordResets.userId, userId));
    await tx.delete(userChannelPreferences).where(eq(userChannelPreferences.userId, userId));
    await tx.delete(entitlements).where(eq(entitlements.userId, userId));
    await tx.delete(transactions).where(eq(transactions.userId, userId));
    await tx.delete(users).where(eq(users.id, userId));
  });

  return { ok: true };
}

/** One row per activatable cycle, for the picker — publication checked the
 *  same way `wing:census` reports it, just narrowed to a yes/no. */
export async function listActivatableCycles() {
  const rows = await db
    .select({
      id: schoolCycles.id,
      label: schoolCycles.label,
      cycleYear: schoolCycles.cycleYear,
      institutionId: schoolCycles.institutionId,
      sequenceId: schoolCycles.activeHeuristicSequenceId,
    })
    .from(schoolCycles)
    .orderBy(desc(schoolCycles.id));

  const out = [];
  for (const c of rows) {
    let publishable = false;
    if (c.sequenceId) {
      const [seq] = await db
        .select({ supersededAt: heuristicSequences.supersededAt })
        .from(heuristicSequences)
        .where(eq(heuristicSequences.id, c.sequenceId));
      if (seq && !seq.supersededAt) {
        const [{ n }] = await db
          .select({ n: count() })
          .from(heuristicSequenceEntries)
          .innerJoin(heuristics, eq(heuristics.id, heuristicSequenceEntries.heuristicId))
          .where(
            and(
              eq(heuristicSequenceEntries.sequenceId, c.sequenceId),
              eq(heuristics.cardKind, "coaching_card"),
              ne(heuristics.status, "retired"),
            ),
          );
        publishable = Number(n) > 0;
      }
    }
    out.push({ ...c, publishable });
  }
  return out;
}

export type ActivateResult =
  | { ok: true; persona: HarnessPersonaRow; studentId: number }
  | { ok: false; error: "not_found" | "already_seeded"; studentId?: number }
  | { ok: false; error: "invalid"; failures: PersonaValidationFailure[] }
  | { ok: false; error: "cycle_not_found" | "cycle_publishes_nothing" | "sequence_superseded" | "sequence_has_no_coaching_cards" }
  | { ok: false; error: "email_already_exists"; detail: string };

export async function activatePersona(id: number, cycleId: number): Promise<ActivateResult> {
  const existing = await getPersona(id);
  if (!existing) return { ok: false, error: "not_found" };
  if (existing.status === "seeded") {
    return { ok: false, error: "already_seeded", studentId: existing.seededStudentId ?? undefined };
  }

  const failures = validatePersonaForActivation(existing);
  if (failures.length) return { ok: false, error: "invalid", failures };

  const [cycle] = await db
    .select({
      id: schoolCycles.id,
      institutionId: schoolCycles.institutionId,
      sequenceId: schoolCycles.activeHeuristicSequenceId,
    })
    .from(schoolCycles)
    .where(eq(schoolCycles.id, cycleId));
  if (!cycle) return { ok: false, error: "cycle_not_found" };
  if (!cycle.sequenceId) return { ok: false, error: "cycle_publishes_nothing" };

  const [seq] = await db
    .select({ supersededAt: heuristicSequences.supersededAt })
    .from(heuristicSequences)
    .where(eq(heuristicSequences.id, cycle.sequenceId));
  if (!seq || seq.supersededAt) return { ok: false, error: "sequence_superseded" };

  const [{ n: coachingCards }] = await db
    .select({ n: count() })
    .from(heuristicSequenceEntries)
    .innerJoin(heuristics, eq(heuristics.id, heuristicSequenceEntries.heuristicId))
    .where(
      and(
        eq(heuristicSequenceEntries.sequenceId, cycle.sequenceId),
        eq(heuristics.cardKind, "coaching_card"),
        ne(heuristics.status, "retired"),
      ),
    );
  if (Number(coachingCards) === 0) return { ok: false, error: "sequence_has_no_coaching_cards" };

  const email = personaEmail(existing.personaKey);
  const [emailClash] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (emailClash) return { ok: false, error: "email_already_exists", detail: email };

  const { first, last } = splitName(existing.name);

  const result = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email,
        firstName: first,
        lastName: last,
        role: "student",
        professionalStatus: existing.professionalStatus as ProfessionalStatus,
        isTestUser: true,
      })
      .returning();

    const [student] = await tx
      .insert(students)
      .values({
        userId: user.id,
        institutionId: cycle.institutionId,
        cycleId,
        origin: "institutional",
        enrollmentStatus: "active",
      })
      .returning();

    await tx.insert(intakeRecords).values({
      studentId: student.id,
      pathway: existing.pathway as Pathway,
    });

    const [updated] = await tx
      .update(harnessPersonas)
      .set({
        status: "seeded",
        seededStudentId: student.id,
        seededCycleId: cycleId,
        updatedAt: new Date(),
      })
      .where(eq(harnessPersonas.id, id))
      .returning();

    return { studentId: student.id, persona: updated };
  });

  return { ok: true, persona: result.persona, studentId: result.studentId };
}
