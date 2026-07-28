import "dotenv/config";
import { asc, eq, sql } from "drizzle-orm";
import { db, pool } from "../db";
import * as legacy from "@shared/schema";
import * as wing from "@shared/wing-schema";
import * as blob from "../blob-storage";
import * as commerce from "./commerce-store";

/**
 * Data migration: public (MVP) -> wing
 *
 * Run:  npm run wing:migrate-data          (after wing:migrate-identity)
 *       npm run wing:migrate-data -- --dry-run
 *
 * Implements the source→target mapping in spec §14. Three rules govern legacy
 * conversational data and are non-negotiable:
 *
 *  1. Transcripts import with status `migrated_provenance_unknown`, and EVERY
 *     turn is tagged `provenance_unknown` — we cannot know retrospectively
 *     whether a turn was volunteered or elicited.
 *  2. That corpus is held separately from clean post-migration data and feeds
 *     pattern analysis only, until reviewed.
 *  3. The strongest 10–15 sessions are later hand-tagged at turn level
 *     (classification_status = hand_tagged) to seed the classifier and provide
 *     a validation gold standard. That is a METHODOLOGY task, not part of this
 *     script.
 *
 * Idempotent: every domain skips rows already migrated, so re-running is safe.
 * Users must already exist in wing (run wing:migrate-identity first).
 */

const DRY_RUN = process.argv.includes("--dry-run");

type Summary = Record<string, { migrated: number; skipped: number; failed: number }>;
const summary: Summary = {};

function track(domain: string, key: "migrated" | "skipped" | "failed") {
  summary[domain] ??= { migrated: 0, skipped: 0, failed: 0 };
  summary[domain][key]++;
}

/** legacy user id -> wing user id, matched on lowercased email. */
async function buildUserMap(): Promise<Map<number, number>> {
  const legacyUsers = await db.select().from(legacy.users);
  const wingUsers = await db.select().from(wing.users);

  const byEmail = new Map(wingUsers.map((u) => [u.email.toLowerCase(), u.id]));
  const map = new Map<number, number>();

  for (const u of legacyUsers) {
    const wingId = byEmail.get((u.username ?? "").toLowerCase());
    if (wingId) map.set(u.id, wingId);
    else console.warn(`[map] no wing user for legacy #${u.id} (${u.username})`);
  }
  return map;
}

/** wing user id -> student id. */
async function buildStudentMap(): Promise<Map<number, number>> {
  const rows = await db.select().from(wing.students);
  return new Map(rows.map((s) => [s.userId, s.id]));
}

/* ── Intake (questionnaires + branding_intakes -> intake_records) ───────── */

async function migrateIntake(students: Map<number, number>, users: Map<number, number>) {
  const questionnaires = await db.select().from(legacy.questionnaires);
  const intakes = await db.select().from(legacy.brandingIntakes);

  // Both collapse into ONE row per student, namespaced inside
  // structured_responses (spec §12).
  const byStudent = new Map<number, { questionnaire?: any; brandingIntake?: any; completed: boolean }>();

  for (const q of questionnaires) {
    const studentId = students.get(users.get(q.userId)!);
    if (!studentId) continue;
    const entry = byStudent.get(studentId) ?? { completed: false };
    entry.questionnaire = {
      industry: q.industry, background: q.background, goals: q.goals,
      aspirations: q.aspirations, challenges: q.challenges,
      interests: q.interests, timeframe: q.timeframe,
      rawAnswers: q.rawAnswers, isDraft: q.isDraft ?? false,
    };
    byStudent.set(studentId, entry);
  }

  for (const i of intakes) {
    const studentId = students.get(users.get(i.userId)!);
    if (!studentId) continue;
    const entry = byStudent.get(studentId) ?? { completed: false };
    entry.brandingIntake = {
      platform: i.platform,
      currentStage: i.currentStage,
      responses: i.responses ?? {},
      marketingOptIn: i.marketingOptIn ?? false,
    };
    entry.completed = i.completed ?? false;
    byStudent.set(studentId, entry);
  }

  for (const [studentId, entry] of Array.from(byStudent.entries())) {
    const [existing] = await db
      .select({ id: wing.intakeRecords.id })
      .from(wing.intakeRecords)
      .where(eq(wing.intakeRecords.studentId, studentId))
      .limit(1);

    const values = {
      studentId,
      structuredResponses: {
        questionnaire: entry.questionnaire,
        brandingIntake: entry.brandingIntake,
      } as any,
      completed: entry.completed,
    };

    if (DRY_RUN) { track("intake", existing ? "skipped" : "migrated"); continue; }

    if (existing) {
      await db.update(wing.intakeRecords).set(values).where(eq(wing.intakeRecords.id, existing.id));
      track("intake", "skipped");
    } else {
      await db.insert(wing.intakeRecords).values(values);
      track("intake", "migrated");
    }
  }
}

/* ── Documents (base64 -> Blob) ─────────────────────────────────────────── */

async function migrateDocuments(students: Map<number, number>, users: Map<number, number>) {
  const docs = await db.select().from(legacy.documents);

  for (const doc of docs) {
    const studentId = students.get(users.get(doc.userId)!);
    if (!studentId) { track("documents", "failed"); continue; }

    const [existing] = await db
      .select({ id: wing.documents.id })
      .from(wing.documents)
      .where(sql`${wing.documents.studentId} = ${studentId} AND ${wing.documents.name} = ${doc.fileName}`)
      .limit(1);
    if (existing) { track("documents", "skipped"); continue; }

    const base64 = doc.fileData ?? (doc as any).blobKey ?? null;
    if (!base64) { track("documents", "failed"); continue; }

    if (DRY_RUN) { track("documents", "migrated"); continue; }

    try {
      // Inline base64 is decoded and uploaded to Blob; it does not carry
      // forward into the database (spec §3).
      const blobUri = (doc as any).blobKey
        ? (doc as any).blobKey
        : await blob.uploadBase64(blob.CONTAINERS.documents, base64, {
            fileName: doc.fileName,
            contentType: "application/pdf",
            prefix: `student-${studentId}`,
          });

      const docType = ["resume", "linkedin", "essay", "assessment", "certificate"]
        .includes((doc.type ?? "").toLowerCase())
        ? (doc.type as any)
        : "other";

      await db.insert(wing.documents).values({
        studentId,
        name: doc.fileName,
        docType,
        blobUri,
        mimeType: "application/pdf",
        sizeBytes: Buffer.from(base64, "base64").length,
        analysis: doc.analysisContent ? ({ text: doc.analysisContent } as any) : null,
        uploadedAt: doc.uploadedAt ?? new Date(),
      });
      track("documents", "migrated");
    } catch (err) {
      console.error(`[documents] failed for '${doc.fileName}':`, err);
      track("documents", "failed");
    }
  }
}

/* ── Conversations -> sessions + transcripts + turns ────────────────────── */

/**
 * Imports a message list as a transcript. EVERY turn is tagged
 * provenance_unknown regardless of role — the corpus is unreliable by
 * definition, and pretending otherwise would poison the behavioural data.
 */
async function importTranscript(
  sessionId: number,
  messages: Array<{ role: string; content: string; createdAt?: Date | null }>,
) {
  const [transcript] = await db
    .insert(wing.transcripts)
    .values({ sessionId, status: "migrated_provenance_unknown" })
    .returning({ id: wing.transcripts.id });

  let position = 0;
  for (const msg of messages) {
    position++;
    await db.insert(wing.transcriptTurns).values({
      transcriptId: transcript.id,
      sequencePosition: position,
      // Turn type is a best guess from the role; provenance is explicitly
      // unknown, which is what downstream consumers filter on.
      turnType: msg.role === "assistant" ? "ai_prompt" : "human_spontaneous",
      content: msg.content,
      provenanceTag: "provenance_unknown",
      channel: "legacy_import",
      classificationStatus: "provisional",
      createdAt: msg.createdAt ?? new Date(),
    });
  }
  return position;
}

async function migrateSessions(students: Map<number, number>, users: Map<number, number>) {
  // Foundation sessions
  const foundation = await db.select().from(legacy.foundationSessions);
  for (const fs of foundation) {
    const studentId = students.get(users.get(fs.userId)!);
    if (!studentId) { track("sessions", "failed"); continue; }

    const sessionType = `foundation_${fs.sessionNumber}` as any;
    const [existing] = await db
      .select({ id: wing.sessions.id })
      .from(wing.sessions)
      .where(sql`${wing.sessions.studentId} = ${studentId} AND ${wing.sessions.sessionType} = ${sessionType}`)
      .limit(1);
    if (existing) { track("sessions", "skipped"); continue; }
    if (DRY_RUN) { track("sessions", "migrated"); continue; }

    const [session] = await db.insert(wing.sessions).values({
      studentId,
      sessionType,
      status: (fs.status ?? "available") as any,
      startedAt: fs.startedAt ?? null,
      completedAt: fs.completedAt ?? null,
      timerElapsedSeconds: fs.timerElapsed ?? 0,
      createdAt: fs.createdAt ?? new Date(),
    }).returning({ id: wing.sessions.id });

    const messages = await db
      .select()
      .from(legacy.foundationSessionMessages)
      .where(eq(legacy.foundationSessionMessages.sessionId, fs.id))
      .orderBy(asc(legacy.foundationSessionMessages.createdAt));

    await importTranscript(session.id, messages);

    // completionData becomes a typed artifact (spec §14).
    if (fs.completionData) {
      const artifactType =
        fs.sessionNumber === 1 ? "functional_identity"
        : fs.sessionNumber === 2 ? "credibility_assessment"
        : "signature_story";
      await db.insert(wing.sessionArtifacts).values({
        sessionId: session.id,
        artifactType: artifactType as any,
        content: fs.completionData as any,
        sourceType: "ai_generated",
      });
    }
    track("sessions", "migrated");
  }

  // Enhancement modules
  const modules = await db.select().from(legacy.enhancementModules);
  for (const m of modules) {
    const studentId = students.get(users.get(m.userId)!);
    if (!studentId) { track("sessions", "failed"); continue; }

    const sessionType = `enhancement_${(m.moduleCode ?? "a").toLowerCase()}` as any;
    const [existing] = await db
      .select({ id: wing.sessions.id })
      .from(wing.sessions)
      .where(sql`${wing.sessions.studentId} = ${studentId} AND ${wing.sessions.sessionType} = ${sessionType}`)
      .limit(1);
    if (existing) { track("sessions", "skipped"); continue; }
    if (DRY_RUN) { track("sessions", "migrated"); continue; }

    const [session] = await db.insert(wing.sessions).values({
      studentId,
      sessionType,
      status: (m.status ?? "available") as any,
      startedAt: m.startedAt ?? null,
      completedAt: m.completedAt ?? null,
      timerElapsedSeconds: m.timerElapsed ?? 0,
      createdAt: m.createdAt ?? new Date(),
    }).returning({ id: wing.sessions.id });

    const messages = await db
      .select()
      .from(legacy.enhancementModuleMessages)
      .where(eq(legacy.enhancementModuleMessages.moduleId, m.id))
      .orderBy(asc(legacy.enhancementModuleMessages.createdAt));

    await importTranscript(session.id, messages);

    if (m.completionData) {
      await db.insert(wing.sessionArtifacts).values({
        sessionId: session.id,
        artifactType: "module_outcome",
        content: m.completionData as any,
        sourceType: "ai_generated",
      });
    }
    track("sessions", "migrated");
  }

  // Free-form conversations -> ongoing_engagement
  const conversations = await db.select().from(legacy.conversations);
  for (const c of conversations) {
    const studentId = students.get(users.get(c.userId)!);
    if (!studentId) { track("conversations", "failed"); continue; }
    if (DRY_RUN) { track("conversations", "migrated"); continue; }

    const [session] = await db.insert(wing.sessions).values({
      studentId,
      sessionType: "ongoing_engagement",
      status: "completed",
      createdAt: c.createdAt ?? new Date(),
    }).returning({ id: wing.sessions.id });

    const messages = await db
      .select()
      .from(legacy.messages)
      .where(eq(legacy.messages.conversationId, c.id))
      .orderBy(asc(legacy.messages.createdAt));

    await importTranscript(session.id, messages);
    track("conversations", "migrated");
  }
}

/* ── SLIs: one packed row -> individual records ─────────────────────────── */

async function migrateSlis(students: Map<number, number>, users: Map<number, number>) {
  const rows = await db.select().from(legacy.slis);

  for (const sli of rows) {
    const studentId = students.get(users.get(sli.userId)!);
    if (!studentId) { track("slis", "failed"); continue; }

    const [existing] = await db
      .select({ id: wing.sliRecords.id })
      .from(wing.sliRecords)
      .where(eq(wing.sliRecords.studentId, studentId))
      .limit(1);
    if (existing) { track("slis", "skipped"); continue; }
    if (DRY_RUN) { track("slis", "migrated"); continue; }

    // Three candidates become three rows; the selected one becomes active.
    const created: number[] = [];
    for (const n of [1, 2, 3]) {
      const title = (sli as any)[`title${n}`];
      const statement = (sli as any)[`statement${n}`];
      if (!title || !statement) continue;

      const [row] = await db.insert(wing.sliRecords).values({
        studentId,
        title,
        statement,
        rationale: (sli as any)[`rationale${n}`] ?? null,
        source: "generated",
        status: sli.selectedSliIndex === n ? "selected" : "candidate",
        createdAt: sli.createdAt ?? new Date(),
        sourceType: "ai_generated",
      }).returning({ id: wing.sliRecords.id });
      if (sli.selectedSliIndex === n) created.push(row.id);
    }

    // A custom statement is human-originated and its own record.
    if (sli.customSliText) {
      const [row] = await db.insert(wing.sliRecords).values({
        studentId,
        title: "Custom SLI",
        statement: sli.customSliText,
        source: "custom",
        status: "selected",
        sourceType: "human_originated",
        createdAt: sli.createdAt ?? new Date(),
      }).returning({ id: wing.sliRecords.id });
      created.push(row.id);
    }

    // A refinement descends from the selected parent, which is superseded.
    if (sli.refinedSliText) {
      const parentId = created[created.length - 1] ?? null;
      if (parentId) {
        await db.update(wing.sliRecords)
          .set({ status: "superseded", supersededAt: new Date() })
          .where(eq(wing.sliRecords.id, parentId));
      }
      await db.insert(wing.sliRecords).values({
        studentId,
        title: "Refined SLI",
        statement: sli.refinedSliText,
        rationale: sli.refinementRationale ?? null,
        implementationGuidance: sli.implementationGuidance ?? null,
        source: "refined",
        status: "active",
        parentSliId: parentId,
        refinementCount: sli.refinementCount ?? 1,
        activatedAt: sli.refinedAt ?? new Date(),
        sourceType: "ai_generated",
        createdAt: sli.refinedAt ?? sli.createdAt ?? new Date(),
      });
    } else if (created.length) {
      await db.update(wing.sliRecords)
        .set({ status: "active", activatedAt: new Date() })
        .where(eq(wing.sliRecords.id, created[created.length - 1]));
    }

    track("slis", "migrated");
  }
}

/* ── Positioning artifacts ──────────────────────────────────────────────── */

async function migrateArtifacts(students: Map<number, number>, users: Map<number, number>) {
  for (const r of await db.select().from(legacy.freshnessReports)) {
    const studentId = students.get(users.get(r.userId)!);
    if (!studentId) continue;
    if (DRY_RUN) { track("freshness_reports", "migrated"); continue; }
    await db.insert(wing.freshnessReports).values({
      studentId,
      questionnaireAnalysis: r.questionnaireAnalysis as any,
      resumeAnalysis: r.resumeAnalysis as any,
      linkedinAnalysis: r.linkedinAnalysis as any,
      additionalDocumentsAnalysis: r.additionalDocumentsAnalysis as any,
      finalSynthesis: r.finalSynthesis as any,
      sourceType: "ai_generated",
      createdAt: r.createdAt ?? new Date(),
    });
    track("freshness_reports", "migrated");
  }

  for (const o of await db.select().from(legacy.linkedinOptimizations)) {
    const studentId = students.get(users.get(o.userId)!);
    if (!studentId) continue;
    if (DRY_RUN) { track("linkedin_optimizations", "migrated"); continue; }
    // Legacy sections are preserved inside the holistic review (spec §12).
    await db.insert(wing.linkedinOptimizations).values({
      studentId,
      holisticReview: {
        alignmentAssessment: o.alignmentAssessment,
        headlineOptimization: o.headlineOptimization,
        aboutSection: o.aboutSection,
        profileEnhancements: o.profileEnhancements,
        contentStrategy: o.contentStrategy,
        implementationPriorities: o.implementationPriorities,
      } as any,
      sourceType: "ai_generated",
      createdAt: o.createdAt ?? new Date(),
    });
    track("linkedin_optimizations", "migrated");
  }

  for (const d of await db.select().from(legacy.linkedinContentDrafts)) {
    const studentId = students.get(users.get(d.userId)!);
    if (!studentId) continue;
    if (DRY_RUN) { track("content_drafts", "migrated"); continue; }
    // Two posts in one row become two rows (spec §12).
    for (const [type, content] of [
      [d.post1Type, d.post1Content],
      [d.post2Type, d.post2Content],
    ] as const) {
      if (!content) continue;
      await db.insert(wing.contentDrafts).values({
        studentId,
        draftType: "post",
        content: { postType: type, ...(content as object) } as any,
        sourceType: "ai_generated",
        createdAt: d.createdAt ?? new Date(),
      });
    }
    track("content_drafts", "migrated");
  }
}

/* ── Commerce: subscription columns -> entitlements ─────────────────────── */

async function migrateCommerce(users: Map<number, number>) {
  await commerce.ensureDefaultPlans();
  const legacyUsers = await db.select().from(legacy.users);

  for (const u of legacyUsers) {
    const wingUserId = users.get(u.id);
    if (!wingUserId) continue;

    const tier = u.subscriptionTier;
    if (!tier || tier === "free") { track("entitlements", "skipped"); continue; }
    if (DRY_RUN) { track("entitlements", "migrated"); continue; }

    const existing = await commerce.getActiveEntitlement(wingUserId);
    if (existing) { track("entitlements", "skipped"); continue; }

    await commerce.grantEntitlement({
      userId: wingUserId,
      planCode: tier,
      source: "purchase",
      stripeCustomerId: u.stripeCustomerId ?? null,
      stripeSubscriptionId: u.stripeSubscriptionId ?? null,
      expiresAt: u.subscriptionExpiresAt ?? null,
    });
    track("entitlements", "migrated");
  }
}

/* ── Archive: content with no live Tier 1 surface ───────────────────────── */

async function archiveLegacyRecords(students: Map<number, number>, users: Map<number, number>) {
  const archive = async (
    recordType: string,
    rows: Array<{ userId: number; createdAt?: Date | null; [k: string]: any }>,
  ) => {
    for (const row of rows) {
      const studentId = students.get(users.get(row.userId)!);
      if (!studentId) continue;
      if (DRY_RUN) { track("legacy_records", "migrated"); continue; }
      await db.insert(wing.legacyRecords).values({
        studentId,
        recordType,
        payload: row as any,
        originalCreatedAt: row.createdAt ?? null,
      });
      track("legacy_records", "migrated");
    }
  };

  // Nothing is dropped; nothing pollutes the live tables (spec §13, §14).
  await archive("monthly_check_in", await db.select().from(legacy.monthlyCheckIns));
  await archive("coaching_note", await db.select().from(legacy.coachingNotes));
  await archive("homework_assignment", await db.select().from(legacy.homeworkAssignments));
  await archive("conversation_summary", await db.select().from(legacy.conversationSummaries));

  // Structured profile sub-records: the LinkedIn upload is the profile source
  // now (feature list A2), so these archive verbatim.
  await archive("profile_subrecord_experience", await db.select().from(legacy.experiences));
  await archive("profile_subrecord_education", await db.select().from(legacy.education));
  await archive("profile_subrecord_skill", await db.select().from(legacy.skills));
  await archive("profile_subrecord_language", await db.select().from(legacy.languages));
}

/* ── Main ───────────────────────────────────────────────────────────────── */

async function main() {
  console.log(`\n=== public -> wing data migration ${DRY_RUN ? "(DRY RUN)" : ""} ===\n`);

  const users = await buildUserMap();
  const students = await buildStudentMap();
  console.log(`[map] ${users.size} user(s) mapped, ${students.size} student(s)\n`);

  if (!users.size) {
    console.error("No users mapped — run `npm run wing:migrate-identity` first.");
    await pool.end();
    process.exit(1);
  }

  await migrateIntake(students, users);
  await migrateDocuments(students, users);
  await migrateSessions(students, users);
  await migrateSlis(students, users);
  await migrateArtifacts(students, users);
  await migrateCommerce(users);
  await archiveLegacyRecords(students, users);

  console.log("\n=== summary ===");
  for (const [domain, counts] of Object.entries(summary)) {
    console.log(
      `  ${domain.padEnd(24)} migrated ${counts.migrated}, skipped ${counts.skipped}, failed ${counts.failed}`,
    );
  }
  if (DRY_RUN) console.log("\n(dry run — nothing was written)");

  await pool.end();
}

main().catch((err) => {
  console.error("[migrate-data] failed:", err);
  process.exit(1);
});
