/**
 * What `/api/admin/users/:id` actually returns.
 *
 * Written against the endpoint's allowlist in server/routes.ts rather than
 * against a Drizzle table type. The six pages this replaced each declared their
 * own shape — `UserProfileWithoutPassword`, `UserWithoutPassword`,
 * `UserDetails` — all three derived from `public.users`, which is not the table
 * this endpoint reads any more. They agreed with each other and disagreed with
 * the server.
 *
 * Everything nested is optional and defensively typed. These records are years
 * old in places and were migrated between two schemas; a field being absent is
 * normal, not exceptional, and a panel that assumes otherwise crashes on the
 * one student who predates it.
 */

export type StudentDocument = {
  id: number;
  name: string;
  docType: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  uploadedAt?: string | null;
};

export type StudentSli = {
  id: number;
  statement?: string | null;
  status?: string | null;
  version?: number | null;
  source?: string | null;
  refinementCount?: number | null;
  createdAt?: string | null;
};

export type FoundationSession = {
  id: number;
  sessionType?: string | null;
  sessionNumber?: number | null;
  status?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
};

export type StudentRecord = {
  id: number;
  /**
   * `students.id` — separate from `id` above (`users.id`). Needed by any
   * student-scoped harness route, e.g. the allow-manual-checkpoints toggle
   * (`POST /api/admin/harness/checkpoints/:studentId/allow-manual`). `null`
   * for a user with no `students` row.
   */
  studentId?: number | null;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber?: string | null;
  role?: string | null;
  isAdmin?: boolean;
  isTestUser?: boolean;
  /**
   * Lets this account use checkpoint-store.ts's applyCheckpoint on itself
   * without being flagged isTestUser (which would exclude its real coaching
   * data from the behavioral corpus). See migration 0047 and
   * claude/HARNESS_GAP_ANALYSIS_SEP15.md §1a.
   */
  allowManualCheckpoints?: boolean;
  status?: string | null;
  linkedinConnected?: boolean;
  professionalStatus?: string | null;
  discoverySource?: string | null;
  timezone?: string | null;
  createdAt?: string | null;
  lastLoginAt?: string | null;

  /*
   * ── WHAT THIS ENDPOINT DELIBERATELY DOES NOT RETURN ────────────────────
   * `slis` and `freshnessReports` used to be here and were never read — the
   * Positioning tab queries `/slis` itself, and freshness reports have no
   * surface on this screen. Documents arrive without `extractedText` or
   * `analysis`, and sessions without their artifacts.
   *
   * That was not tidying. Those four things were the whole payload: a resume
   * and a LinkedIn export in full text, plus an artifact jsonb per completed
   * session, serialised on every page load to render a filename and a status
   * badge. If a panel ever needs one of them, it should fetch it — putting it
   * back here makes every tab pay for it.
   */
  documents?: StudentDocument[] | null;
  questionnaire?: Record<string, unknown> | null;
  brandingIntake?: Record<string, unknown> | null;
  foundationSessions?: FoundationSession[] | null;
};

export type CoachingNote = {
  id: number;
  content?: string | null;
  note?: string | null;
  createdAt?: string | null;
  authorName?: string | null;
};

export type HomeworkAssignment = {
  id: number;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  dueDate?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
};
