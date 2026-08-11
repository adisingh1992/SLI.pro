import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { sessions, students, users, transcripts, transcriptTurns } from "@shared/wing-schema";
import { renderForAnalysis, type Criterion } from "./completion-criteria-store";
import {
  renderForAnalysis as renderMethodology,
  type MethodologySection,
} from "./analysis-methodology-store";
import { log } from "../logger";

/**
 * Replay testing — the regression test that makes editing criteria safe.
 *
 * Heuristic cards are safe to edit because the sequence gate, the evaluation
 * window and scoring all constrain them. Completion criteria have no such
 * guard: change them and every future session is judged differently, with
 * nothing in between to catch a mistake. Prose cannot be unit-tested.
 *
 * But it CAN be replayed. Sessions that already completed are labelled data:
 * a human ended them, and they were judged complete under the criteria of the
 * day. Run a draft against those transcripts and the question "did my edit
 * break anything?" becomes answerable.
 *
 * WHAT A RESULT MEANS
 *  - `stillCompletes`  — the edit is compatible with sessions that worked.
 *  - `wouldNowFail`    — the edit is STRICTER. Real sessions that finished
 *                        would not under the new rules. Usually a mistake;
 *                        occasionally the point, if the bar was too low.
 *  - `wouldNowPass`    — a session that never completed now would. Often the
 *                        goal when fixing an unreachable criterion.
 *
 * COST AND HONESTY
 * One mid-tier call per session replayed, so it is a button rather than
 * something that runs on save. And it only proves compatibility with sessions
 * you HAVE — it cannot tell you how the edit affects conversations that have
 * not happened yet.
 */

export type ReplayCase = {
  sessionId: number;
  studentName: string;
  isTestUser: boolean;
  actualStatus: string;
  actuallyCompleted: boolean;
  wouldComplete: boolean;
  verdict: "stillCompletes" | "wouldNowFail" | "wouldNowPass" | "stillIncomplete";
  reasoning?: string;
};

export type ReplayResult = {
  populationTag: string;
  sessionType: string;
  replayed: number;
  stillCompletes: number;
  wouldNowFail: number;
  wouldNowPass: number;
  cases: ReplayCase[];
  note?: string;
};

/** professionalStatus values that resolve to a given prompt set. */
function statusesFor(populationTag: string): string[] {
  if (populationTag === "undergraduate_or_recent_grad") return ["undergraduate_or_recent_grad"];
  if (populationTag === "early_career") return ["early_career"];
  // getPromptSet defaults everything else to mid-career, including
  // career_break_or_transition and NULL. Replay must match that or it would
  // test a population the criteria never apply to.
  return ["mid_career_or_senior", "career_break_or_transition"];
}

/**
 * Runs draft criteria against past sessions of this population and type.
 *
 * Only sessions with a real transcript are replayed; an empty one tells you
 * nothing and still costs a model call.
 */
export async function replay(params: {
  populationTag: string;
  sessionType: string;
  /** Draft criteria. Omit to replay published criteria unchanged. */
  criteria?: Criterion[];
  /**
   * Draft methodology sections. Omit to replay published methodology unchanged.
   *
   * Foundation Sessions only — `checkModuleCompletion` takes no methodology
   * parameter because module analysis prompts have not been parameterised for
   * it. Passing sections with a module session type is rejected by the route
   * rather than silently ignored here, since a replay that quietly tests
   * nothing is worse than one that refuses.
   */
  sections?: MethodologySection[];
  limit?: number;
}): Promise<ReplayResult> {
  const limit = Math.min(params.limit ?? 10, 25);
  const statuses = statusesFor(params.populationTag);

  const candidates = await db
    .select({
      sessionId: sessions.id,
      status: sessions.status,
      studentId: sessions.studentId,
      legacyUserId: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      isTestUser: users.isTestUser,
      professionalStatus: users.professionalStatus,
    })
    .from(sessions)
    .innerJoin(students, eq(students.id, sessions.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .innerJoin(transcripts, eq(transcripts.sessionId, sessions.id))
    .where(
      and(
        eq(sessions.sessionType, params.sessionType as any),
        inArray(sessions.status, ["completed", "ended_early"] as any),
      ),
    )
    .orderBy(desc(sessions.completedAt))
    .limit(limit * 3);

  // Match the population the way getPromptSet does, including its NULL default.
  const matching = candidates.filter((c) =>
    c.professionalStatus
      ? statuses.includes(c.professionalStatus)
      : params.populationTag === "mid_career_or_senior",
  );

  if (!matching.length) {
    return {
      populationTag: params.populationTag,
      sessionType: params.sessionType,
      replayed: 0,
      stillCompletes: 0,
      wouldNowFail: 0,
      wouldNowPass: 0,
      cases: [],
      note:
        "No past sessions of this type for this population. There is nothing " +
        "to replay against, so this edit is unverified — not safe, just untested.",
    };
  }

  // undefined means "use whatever is published", which is what lets a
  // methodology replay leave criteria alone and vice versa.
  const rendered = params.criteria ? renderForAnalysis(params.criteria) : undefined;
  const renderedMethodology = params.sections
    ? renderMethodology(params.sections)
    : undefined;
  const sessionStore = await import("./session-store");

  // Foundation Sessions and Enhancement Modules have separate completion
  // functions with different signatures. Replay dispatches to whichever one
  // actually judges this type, so the test matches production.
  const isModule = params.sessionType.startsWith("enhancement_");
  const moduleCode = isModule
    ? params.sessionType.replace("enhancement_", "").toUpperCase()
    : null;
  const sessionNumber = isModule
    ? 0
    : Number(params.sessionType.replace("foundation_", ""));

  const foundationRoutes = isModule ? null : await import("../foundation-sessions-routes");
  const moduleRoutes = isModule ? await import("../enhancement-modules-routes") : null;
  const cases: ReplayCase[] = [];

  for (const candidate of matching.slice(0, limit)) {
    try {
      const messages = await sessionStore.getTurnsAsMessages(candidate.sessionId);
      if (messages.length < 2) continue;

      // The REAL completion path, with the draft criteria substituted. A
      // separate implementation would drift and reassure about the wrong code.
      const result = isModule
        ? await moduleRoutes!.checkModuleCompletion(
            candidate.legacyUserId,
            moduleCode!,
            messages,
            candidate.professionalStatus,
            rendered,
          )
        : await foundationRoutes!.checkSessionCompletion(
            candidate.legacyUserId,
            candidate.studentId,
            sessionNumber,
            messages,
            candidate.professionalStatus,
            rendered,
            renderedMethodology,
          );

      const actuallyCompleted = candidate.status === "completed";
      const wouldComplete = result.shouldComplete;

      cases.push({
        sessionId: candidate.sessionId,
        studentName: `${candidate.firstName} ${candidate.lastName}`,
        isTestUser: candidate.isTestUser,
        actualStatus: candidate.status,
        actuallyCompleted,
        wouldComplete,
        verdict:
          actuallyCompleted && wouldComplete
            ? "stillCompletes"
            : actuallyCompleted && !wouldComplete
              ? "wouldNowFail"
              : !actuallyCompleted && wouldComplete
                ? "wouldNowPass"
                : "stillIncomplete",
        reasoning: result.completionData?.reasoning,
      });
    } catch (err) {
      log(
        `replay failed for session ${candidate.sessionId}: ${(err as Error).message}`,
        "criteria",
      );
    }
  }

  return {
    populationTag: params.populationTag,
    sessionType: params.sessionType,
    replayed: cases.length,
    stillCompletes: cases.filter((c) => c.verdict === "stillCompletes").length,
    wouldNowFail: cases.filter((c) => c.verdict === "wouldNowFail").length,
    wouldNowPass: cases.filter((c) => c.verdict === "wouldNowPass").length,
    cases,
  };
}
