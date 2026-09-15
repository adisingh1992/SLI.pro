import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { documents, intakeRecords, sessions, students } from "@shared/wing-schema";

/**
 * Everything the admin student record screen renders — and nothing else.
 *
 * ── WHY NOT `getUserProfile()` ───────────────────────────────────────────
 * That function assembles six collections in parallel and is the right shape
 * for the student's own dashboard, which uses all of them. The admin record
 * screen uses three, and the three it skips are the expensive ones:
 *
 *   documents          `.select()` returns EVERY column, including
 *                      `extracted_text` — the full text of a resume and a
 *                      LinkedIn PDF export, tens to hundreds of kilobytes each
 *                      — plus the `analysis` jsonb. The screen renders a
 *                      filename, a type and a date.
 *
 *   foundationSessions issues a further `getArtifact()` query per COMPLETED
 *                      session and embeds each artifact's `content` jsonb. The
 *                      screen uses `status` to label a picker button.
 *
 *   slis, freshness    fetched in full and never read at all. The Positioning
 *                      tab queries `/slis` itself; freshness reports have no
 *                      surface on this screen.
 *
 * So the endpoint was serialising megabytes of extracted document text and
 * session artifacts to render a header, a list of filenames, and the intake
 * answers. Nothing was slow in the sense of a bad query plan — it was slow
 * because of how much came back.
 *
 * ── EXPLICIT COLUMNS, NOT `.select()` ────────────────────────────────────
 * Every field below is named. `.select()` on a table with a large text column
 * is the trap this is avoiding, and it is invisible in review: the code looks
 * identical whether the table has four small columns or one enormous one.
 */

export type StudentRecordData = {
  /**
   * `students.id` — distinct from the `users.id` this endpoint is keyed by.
   * Exposed so the admin UI can address student-scoped routes (e.g.
   * `checkpoint-store.ts`'s `applyCheckpoint`/`setAllowManualCheckpoints`,
   * both keyed by `students.id`, not `users.id`) without a second round trip.
   * `null` only for a user with no `students` row at all.
   */
  studentId: number | null;
  documents: {
    id: number;
    name: string;
    docType: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: Date | null;
  }[];
  brandingIntake: {
    platform: string | null;
    currentStage: number;
    responses: Record<string, unknown>;
    completed: boolean;
    marketingOptIn: boolean;
    createdAt: Date | null;
  } | null;
  questionnaire: Record<string, unknown> | null;
  foundationSessions: {
    id: number;
    sessionType: string;
    sessionNumber: number | null;
    status: string;
    startedAt: Date | null;
    completedAt: Date | null;
  }[];
};

const FOUNDATION_NUMBER: Record<string, number> = {
  foundation_1: 1,
  foundation_2: 2,
  foundation_3: 3,
};

/**
 * Intake keys withheld from institution admins.
 *
 * ── STRIPPED ON THE SERVER, NOT JUST HIDDEN ──────────────────────────────
 * The record screen filters the Demographics section out of the rendered
 * intake, which is enough to stop someone reading it by accident. It is not
 * enough to stop someone reading it: the response is in the browser's network
 * tab and in the query cache either way. For race, gender, first-generation
 * status and immigrant background, "hidden in the UI" is not a meaningful
 * distinction from "sent".
 *
 * Keys rather than section names, because first-generation status is filed
 * under "Professional Path" and "Student Experience" depending on the intake
 * platform — gating by heading would leak it on two of the three.
 *
 * SLIpro platform staff still receive it; institutions get the aggregate
 * through the cohort exports, which is what the reporting obligation needs.
 */
const RESTRICTED_INTAKE_KEYS = [
  "race_ethnicity",
  "race_ethnicity_other",
  "gender_identity",
  "gender_identity_other",
  "identity_representation",
  "first_generation",
  "first_generation_student",
  "first_generation_grad",
];

export async function studentRecord(
  userId: number,
  /**
   * Whether the caller is SLIpro platform staff. Defaults to false so a new
   * call site withholds by default rather than exposing by default.
   */
  opts: { includeRestricted?: boolean } = {},
): Promise<StudentRecordData> {
  const [student] = await db
    .select({ id: students.id })
    .from(students)
    .where(eq(students.userId, userId))
    .limit(1);

  if (!student) {
    return {
      studentId: null,
      documents: [],
      brandingIntake: null,
      questionnaire: null,
      foundationSessions: [],
    };
  }

  /*
   * Three small queries in parallel rather than one joined statement.
   *
   * A join across documents, sessions and the intake record would multiply
   * rows — a student with four documents and six sessions produces twenty-four
   * rows of mostly-repeated jsonb, which is slower than three round trips and
   * considerably harder to read back. The intake record is 1:1 with the
   * student, so it cannot be batched into either of the others usefully.
   */
  const [docs, intake, sessionRows] = await Promise.all([
    db
      .select({
        id: documents.id,
        name: documents.name,
        docType: documents.docType,
        mimeType: documents.mimeType,
        sizeBytes: documents.sizeBytes,
        uploadedAt: documents.uploadedAt,
      })
      // Deliberately omits `extractedText` and `analysis`. The single-document
      // endpoint hydrates content when somebody actually opens one.
      .from(documents)
      .where(eq(documents.studentId, student.id))
      .orderBy(desc(documents.uploadedAt)),

    db
      .select({
        structuredResponses: intakeRecords.structuredResponses,
        completed: intakeRecords.completed,
        createdAt: intakeRecords.createdAt,
      })
      .from(intakeRecords)
      .where(eq(intakeRecords.studentId, student.id))
      .limit(1),

    db
      .select({
        id: sessions.id,
        sessionType: sessions.sessionType,
        status: sessions.status,
        startedAt: sessions.startedAt,
        completedAt: sessions.completedAt,
      })
      // No artifact join: the picker needs a status, not a transcript. The
      // Sessions tab fetches a transcript only for the one you click.
      .from(sessions)
      .where(
        and(
          eq(sessions.studentId, student.id),
          inArray(sessions.sessionType, [
            "foundation_1",
            "foundation_2",
            "foundation_3",
            "enhancement_a",
            "enhancement_b",
            "enhancement_c",
          ] as any),
        ),
      ),
  ]);

  const structured = (intake[0]?.structuredResponses ?? {}) as Record<string, any>;
  const branding = structured.brandingIntake;

  return {
    studentId: student.id,
    documents: docs as StudentRecordData["documents"],

    brandingIntake: branding
      ? {
          platform: branding.platform ?? null,
          currentStage: branding.currentStage ?? 1,
          responses: opts.includeRestricted
            ? (branding.responses ?? {})
            : withoutRestricted(branding.responses ?? {}),
          completed: intake[0]?.completed ?? false,
          marketingOptIn: branding.marketingOptIn ?? false,
          createdAt: intake[0]?.createdAt ?? null,
        }
      : null,

    // The screen reads this as a flat answers object keyed by question.
    questionnaire: structured.questionnaire
      ? ((structured.questionnaire.rawAnswers ?? structured.questionnaire) as Record<
          string,
          unknown
        >)
      : null,

    foundationSessions: sessionRows.map((r) => ({
      ...r,
      sessionNumber: FOUNDATION_NUMBER[r.sessionType as string] ?? null,
    })) as StudentRecordData["foundationSessions"],
  };
}

function withoutRestricted(responses: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(responses)) {
    if (!RESTRICTED_INTAKE_KEYS.includes(key)) out[key] = value;
  }
  return out;
}
