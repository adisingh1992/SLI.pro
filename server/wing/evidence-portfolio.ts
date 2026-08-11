import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { evidencePortfolioItems, sessionArtifacts, sessions, students, transcriptTurns, transcripts } from "@shared/wing-schema";
import { log } from "../logger";
import { parseJsonResponse } from "../json-response";
import * as orchestrator from "../orchestrator";
import * as sliStore from "./sli-store";
import { isAiTurn } from "./turn-type";
import {
  NACE_COMPETENCIES,
  emptyCoverage,
  getCompetency,
  renderForPrompt,
  resolveCompetency,
} from "./nace-competencies";

/**
 * The Behavioral Evidence Portfolio (Feature List A4).
 *
 * "Outputs restructured as a Behavioral Evidence Portfolio — structured
 * evidence mapped to NACE competency categories. Each artifact includes:
 * positioning claim, supporting evidence from the student's own stories, and
 * competency category."
 *
 * ── THE EVIDENCE MUST BE THEIRS ──────────────────────────────────────────
 * The spec says "from the student's own stories", and that constraint does all
 * the work here. Evidence is drawn from HUMAN turns only — what the student
 * actually said — never from Wing's replies or from the analysis artifacts,
 * which are Wing's conclusions about them.
 *
 * The distinction is not pedantic. An advisor reading this portfolio is looking
 * at claims a student will repeat in an interview. If the supporting evidence
 * turns out to be something Wing said and the student merely did not contradict,
 * the claim collapses the moment anyone asks a follow-up question. Turn-level
 * provenance is what makes drawing that line possible, and `source_turn_id` on
 * every item is what makes it checkable afterwards.
 *
 * ── AND IT MUST BE ATTRIBUTABLE ──────────────────────────────────────────
 * Every item stores the turn it came from. An item whose evidence cannot be
 * traced to a specific thing the student said is dropped rather than saved with
 * a null source — an unattributable claim is exactly the kind of plausible,
 * confident, unverifiable output that makes a portfolio worse than no
 * portfolio.
 */

export type PortfolioItem = {
  id: number;
  positioningClaim: string;
  evidence: string;
  competencyCategory: string;
  competencyName: string;
  sourceSessionId: number | null;
  sourceTurnId: number | null;
  createdAt: Date;
};

const SYSTEM = `You build Behavioral Evidence Portfolios.

A student has finished positioning sessions with Wing. You are given the things
THEY said, verbatim, with turn ids. Your job is to find the moments that
constitute evidence of a career-readiness competency, and to state the claim
that evidence supports.

THE NACE COMPETENCIES — map only to these:

${renderForPrompt()}

RULES

1. Evidence must be something the student actually said. Quote or closely
   paraphrase THEIR words. Never use an interviewer's framing, and never invent
   detail that would make a weak example sound stronger.

2. Every item must cite the turnId it came from. No turnId, no item.

3. The claim is what the evidence proves, stated plainly and in the first
   person, as the student could say it out loud. Not "demonstrates strong
   leadership skills" — that is a performance review. "I've run a project team
   through a deadline slip and kept the scope intact" is a claim someone can
   act on.

4. Map to a competency using the sample behaviours above, not the competency's
   name. "I kept everyone on track" is Leadership if they planned and drove the
   work, Teamwork if they held up their share of it. If the behaviours do not
   clearly indicate one, skip the item.

5. EQUITY + INCLUSION is about what the student DID — anti-oppressive practice,
   cross-cultural work, removing barriers for others. Never infer it from who
   the student is, what community they belong to, or their demographics. That
   is not evidence of a competency, and treating it as such is offensive.

6. Quality over coverage. Four well-evidenced items beat eight thin ones, and
   you are not trying to hit every competency. A genuine gap is useful
   information for their advisor; a manufactured item is not.

7. If a piece of evidence is weak — vague, unquantified, or something anyone
   could say — leave it out. The portfolio's whole value is that everything in
   it survives a follow-up question.

OUTPUT — JSON only:
{
  "items": [
    {
      "positioningClaim": string,   // first person, specific, one sentence
      "evidence": string,           // what they said that proves it
      "competencyKey": string,      // exactly one of the keys above
      "turnId": number              // the turn this came from
    }
  ]
}

An empty items array is a valid and honest answer.`;

/* ── Gathering the raw material ─────────────────────────────────────────── */

type HumanTurn = { id: number; sessionId: number; content: string };

/**
 * The student's own turns across their completed sessions.
 *
 * Filtered on turn TYPE via isAiTurn, not on provenance_tag. Migrated turns are
 * all stamped provenance_unknown by design, so keying on provenance would treat
 * every migrated session as entirely student-authored — including Wing's
 * questions, which would then be mined as the student's evidence.
 */
async function humanTurnsFor(studentId: number): Promise<HumanTurn[]> {
  const rows = await db
    .select({
      id: transcriptTurns.id,
      sessionId: transcripts.sessionId,
      content: transcriptTurns.content,
      turnType: transcriptTurns.turnType,
    })
    .from(transcriptTurns)
    .innerJoin(transcripts, eq(transcripts.id, transcriptTurns.transcriptId))
    .innerJoin(sessions, eq(sessions.id, transcripts.sessionId))
    .where(eq(sessions.studentId, studentId))
    .orderBy(transcriptTurns.sequencePosition);

  return rows
    .filter((r) => !isAiTurn(r.turnType))
    // Very short turns are "yes", "not really", "ok" — no evidence in them,
    // and including them wastes prompt budget that longer answers need.
    .filter((r) => r.content.trim().length >= 60)
    .map((r) => ({ id: r.id, sessionId: r.sessionId!, content: r.content.trim() }));
}

/* ── Generation ─────────────────────────────────────────────────────────── */

export type BuildResult = {
  created: number;
  skipped: number;
  reasons: string[];
};

/**
 * Builds (or rebuilds) the portfolio for a student.
 *
 * Replaces rather than appends: a rebuild after more sessions should produce
 * the portfolio as it stands, not a pile of near-duplicates from every run.
 * The items are derived data — the turns they cite are the record.
 */
export async function build(userId: number, opts: { replace?: boolean } = {}): Promise<BuildResult> {
  const studentId = await sliStore.studentIdForUser(userId);
  if (!studentId) return { created: 0, skipped: 0, reasons: ["no student record"] };

  const turns = await humanTurnsFor(studentId);
  if (!turns.length) {
    return { created: 0, skipped: 0, reasons: ["no substantive student turns yet"] };
  }

  const activeSli = await sliStore.getActive(userId);

  // Budgeted: the most recent turns carry the most developed thinking, and the
  // whole transcript corpus would not fit.
  const budgeted: HumanTurn[] = [];
  let chars = 0;
  for (const t of [...turns].reverse()) {
    if (chars + t.content.length > 24000) break;
    budgeted.unshift(t);
    chars += t.content.length;
  }

  const transcript = budgeted
    .map((t) => `[turn ${t.id}] ${t.content}`)
    .join("\n\n");

  let parsed: { items?: unknown };
  try {
    const result = await orchestrator.complete({
      // Flagship: this is the artefact an advisor reads and a student repeats
      // in an interview. A cheap mis-mapping is expensive downstream.
      tier: "flagship",
      system: SYSTEM,
      maxTokens: 4000,
      temperature: 0.4,
      messages: [
        {
          role: "user",
          content:
            (activeSli ? `Their positioning statement: "${activeSli.statement}"\n\n` : "") +
            `What they said, in their own words:\n\n${transcript}`,
        },
      ],
    });
    parsed = parseJsonResponse(result.text, "evidence portfolio");
  } catch (err) {
    log(`portfolio build failed for user ${userId}: ${(err as Error).message}`, "portfolio");
    return { created: 0, skipped: 0, reasons: [`generation failed: ${(err as Error).message}`] };
  }

  const validTurnIds = new Set(budgeted.map((t) => t.id));
  const turnSession = new Map(budgeted.map((t) => [t.id, t.sessionId]));

  const reasons: string[] = [];
  const accepted: {
    positioningClaim: string;
    evidence: string;
    competencyCategory: string;
    sourceTurnId: number;
    sourceSessionId: number;
  }[] = [];

  for (const raw of Array.isArray(parsed.items) ? parsed.items : []) {
    const item = raw as Record<string, unknown>;

    const claim = String(item.positioningClaim ?? "").trim();
    const evidence = String(item.evidence ?? "").trim();
    const competency = resolveCompetency(item.competencyKey);
    const turnId = Number(item.turnId);

    if (!claim || !evidence) {
      reasons.push("dropped: empty claim or evidence");
      continue;
    }
    if (!competency) {
      // The competency did not resolve to a real NACE category. Dropped rather
      // than filed under a guess — this label goes into institutional reporting.
      reasons.push(`dropped: unrecognised competency "${String(item.competencyKey)}"`);
      continue;
    }
    if (!Number.isInteger(turnId) || !validTurnIds.has(turnId)) {
      /*
       * The attribution guard, and the one that matters most.
       *
       * A hallucinated or absent turn id means the evidence cannot be traced
       * to anything the student actually said. That is precisely the failure
       * this feature must not have: a confident, plausible, unverifiable claim
       * that collapses the first time an interviewer probes it.
       */
      reasons.push(`dropped: evidence not attributable to a real turn (${item.turnId})`);
      continue;
    }

    accepted.push({
      positioningClaim: claim.slice(0, 1000),
      evidence: evidence.slice(0, 2000),
      competencyCategory: competency,
      sourceTurnId: turnId,
      sourceSessionId: turnSession.get(turnId)!,
    });
  }

  if (opts.replace !== false) {
    await db.delete(evidencePortfolioItems).where(eq(evidencePortfolioItems.studentId, studentId));
  }

  for (const a of accepted) {
    await db.insert(evidencePortfolioItems).values({
      studentId,
      sliId: activeSli?.id ?? null,
      positioningClaim: a.positioningClaim,
      evidence: a.evidence,
      competencyCategory: a.competencyCategory,
      sourceSessionId: a.sourceSessionId,
      sourceTurnId: a.sourceTurnId,
      sourceType: "ai_generated",
    });
  }

  const skipped = reasons.length;
  log(
    `portfolio for user ${userId}: ${accepted.length} item(s), ${skipped} dropped`,
    "portfolio",
  );

  return { created: accepted.length, skipped, reasons };
}

/* ── Reading ────────────────────────────────────────────────────────────── */

export async function get(userId: number): Promise<PortfolioItem[]> {
  const studentId = await sliStore.studentIdForUser(userId);
  if (!studentId) return [];

  const rows = await db
    .select()
    .from(evidencePortfolioItems)
    .where(eq(evidencePortfolioItems.studentId, studentId))
    .orderBy(desc(evidencePortfolioItems.createdAt));

  return rows.map((r) => ({
    id: r.id,
    positioningClaim: r.positioningClaim,
    evidence: r.evidence,
    competencyCategory: r.competencyCategory,
    competencyName: getCompetency(r.competencyCategory)?.name ?? r.competencyCategory,
    sourceSessionId: r.sourceSessionId,
    sourceTurnId: r.sourceTurnId,
    createdAt: r.createdAt,
  }));
}

/**
 * Coverage across all eight competencies, including the empty ones.
 *
 * The zeroes are the point. A student with six items across three competencies
 * has a portfolio; the five categories with nothing in them are what their
 * advisor should spend the meeting on.
 */
export async function coverage(userId: number) {
  const items = await get(userId);
  const counts = emptyCoverage();
  for (const i of items) {
    if (i.competencyCategory in counts) counts[i.competencyCategory] += 1;
  }

  return NACE_COMPETENCIES.map((c) => ({
    key: c.key,
    name: c.name,
    definition: c.definition,
    count: counts[c.key] ?? 0,
  }));
}
