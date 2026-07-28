import * as identity from "./identity-store";
import * as docStore from "./document-store";
import * as sliStore from "./sli-store";
import * as intakeStore from "./intake-store";
import * as artifactStore from "./artifact-store";
import * as sessionStore from "./session-store";

/**
 * The composed user profile, assembled from wing sources.
 *
 * The MVP's `storage.getUserProfile()` returned a user row joined with
 * experiences, education, skills, languages, documents, SLIs, questionnaire
 * and coaching notes. After the migration those pieces live in different
 * places — and several (experiences/education/skills/languages/coaching notes)
 * have no live Tier 1 surface at all and are archived into `legacy_records`
 * (spec §14), with the LinkedIn upload becoming the profile source instead.
 *
 * This keeps the same aggregate shape so prompt-building code that reads
 * `profile.documents` / `profile.slis` / `profile.questionnaire` continues to
 * work, while the retired collections come back empty rather than being
 * silently wrong.
 */
export async function getUserProfile(wingUserId: number) {
  const user = await identity.getUser(wingUserId);
  if (!user) return undefined;

  const [documents, slis, questionnaire, brandingIntake, freshnessReports, foundationSessions] =
    await Promise.all([
      docStore.getDocuments(wingUserId),
      sliStore.listByUser(wingUserId),
      intakeStore.getQuestionnaire(wingUserId),
      intakeStore.getBrandingIntake(wingUserId),
      artifactStore.getFreshnessReports(wingUserId),
      // Outcomes fold in as `completionData`, the shape SLI generation expects.
      sessionStore.getFoundationSessionsForUser({ id: wingUserId }),
    ]);

  return {
    ...user,
    documents,
    slis,
    questionnaire,
    brandingIntake,
    freshnessReports,
    foundationSessions,

    // Archived to legacy_records — no live Tier 1 surface (spec §14).
    // Returned empty so callers behave predictably rather than crashing.
    experiences: [] as any[],
    education: [] as any[],
    skills: [] as any[],
    languages: [] as any[],
    coachingNotes: [] as any[],
    monthlyCheckIns: [] as any[],
    homeworkAssignments: [] as any[],
    conversations: [] as any[],
    conversationSummaries: [] as any[],
  };
}

export type WingUserProfile = NonNullable<
  Awaited<ReturnType<typeof getUserProfile>>
>;
