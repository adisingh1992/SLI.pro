/**
 * The Reveal Cycle, wired — the orchestrator `reveal-gates.ts` says is missing.
 *
 * ── WHAT THIS FILE IS AND IS NOT ──────────────────────────────────────────
 * It calls, in order, four modules that were each already built and tested in
 * isolation: `safety-hold-store.ts` for the crisis-hold input Gate 1 needs,
 * `prompt-log-store.ts` for the evidence Gate 2 needs, `reveal-gates.ts` for the three
 * gates themselves, and — only on a fire — `audience-track.ts` / `reveal-facts.ts` /
 * `reveal-select.ts` to decide which of the 14 templates, if any, the fire produces.
 *
 * It does NOT compose or send a message. A "fire" outcome records which template was
 * selected (or that none was, the protected null Reveal) and stops there. Turning a
 * selected template into real sent text — quoting the student's own words, following
 * the template's `revealDirective` — is separate, later work with its own open design
 * questions; this file's job ends at the decision.
 *
 * It does NOT implement escalation (Gate 3's "3+ contradicting channels" path).
 * Detecting a contradiction needs to compare converging evidence against the stored
 * SLI, which is a real piece of methodology work on its own; this pass only wires the
 * cadence path (day 30, defer in 7-day increments, route to H-RC10 at day 60). Every
 * fire this file produces is `kind: "cadence"`.
 *
 * ── THE ONE INTERPRETIVE CHOICE THIS FILE MAKES, FLAGGED THE WAY THIS CODEBASE FLAGS
 *    THOSE ───────────────────────────────────────────────────────────────
 * Gate 1's `daysSinceLastReveal` and Gate 3's `dayInCycle` are different questions
 * about the same reference point: Gate 1 asks whether the last Reveal (if any) cleared
 * the 14-day floor, and treats "no previous Reveal" as trivially clearing it. Gate 3
 * needs an actual day count to know whether day 30 has arrived, even for a student who
 * has never had a Reveal — v4 doesn't state what a first-ever cycle counts from. The
 * only point that makes sense is Foundation 1's completion: the earliest moment Gate 1
 * could ever pass is also the earliest moment evidence worth reading starts
 * accumulating. So `cycleOriginAt` is the last fired Reveal, or — for a student who has
 * never had one — the timestamp their active SLI was created. This is our reading, not
 * a quotation; `suppression.ts`'s `hasReturned` flags an analogous choice the same way.
 */
import { db } from "../db";
import { log } from "../logger";
import { gate1, gate2, gate3, type GateVerdict } from "./reveal-gates";
import { daysSinceCrisisFlag } from "./suppression";
import { loadHoldState } from "./safety-hold-store";
import { evidenceSince } from "./prompt-log-store";
import * as cycleStore from "./reveal-cycle-store";
import { getActive as getActiveSli } from "./sli-store";
import { getBrandingIntake } from "./intake-store";
import { detectTrack, type Answers } from "./audience-track";
import { revealFacts } from "./reveal-facts";
import { selectReveal } from "./reveal-select";

const DAY = 24 * 60 * 60 * 1000;

export type CycleOutcome =
  | { action: "wait"; why: string }
  | {
      action: "fire";
      kind: "cadence" | "escalation";
      templateCode: string | null;
      templateBand: number | null;
      why: string;
    }
  | { action: "defer"; nextCheckDay: number; why: string }
  | { action: "route"; routedTo: "H-RC10"; why: string };

/**
 * Evaluates one student's Reveal Cycle right now. Writes a row for fire/defer/route,
 * writes nothing for wait — see migration 0038's header for why.
 *
 * Safe to call more than once for the same student in the same hour: a `wait` writes
 * nothing, and `dayInCycle` is recomputed from real timestamps each time rather than
 * carried in memory, so a second call in the same run (or the next hourly run) reaches
 * the same answer rather than double-firing.
 */
export async function evaluateRevealCycle(
  studentId: number,
  now: number = Date.now(),
): Promise<CycleOutcome> {
  const userId = await cycleStore.userIdFor(db as any, studentId);
  if (userId === null) {
    return { action: "wait", why: `no user found for student ${studentId}` };
  }

  /*
   * Foundation1Complete: "A stored SLI must exist for behavior to be read against" —
   * reveal-gates.ts's own detail string for this condition is "stored SLI exists" /
   * "no stored SLI — nothing to read behaviour against", which is exactly what
   * `getActive` answers.
   */
  const activeSli = await getActiveSli(userId);
  if (!activeSli) {
    return { action: "wait", why: "no stored SLI — nothing to read behaviour against" };
  }

  const firedAt = await cycleStore.lastFiredAt(db as any, studentId);
  const cycleOriginAt = firedAt ?? new Date(activeSli.createdAt).getTime();

  const holdState = await loadHoldState(db as any, studentId);
  const crisisDays = daysSinceCrisisFlag(holdState, now);

  const daysSinceLastReveal = firedAt === null ? null : Math.floor((now - firedAt) / DAY);
  const dayInCycle = Math.floor((now - cycleOriginAt) / DAY);

  const g1 = gate1({
    foundation1Complete: true,
    daysSinceLastReveal,
    daysSinceCrisisFlag: crisisDays,
  });

  if (!g1.passed) {
    // The common case for most students most hours. Not recorded — recomputable for
    // free from sli_records and this table's own fire rows, and logging it would bury
    // the rows anyone actually wants to read under one row per student per run.
    return { action: "wait", why: `eligibility floor not met: ${g1.failed.join(", ")}` };
  }

  // Gate 2's "measured since the last Reveal" reads the same origin Gate 3's cadence
  // does. Correctly empty on an unpopulated prompt library — see evidenceSince's own
  // header for why that is today's honest answer, not a bug in this call.
  const evidence = await evidenceSince(db as any, studentId, cycleOriginAt);
  const g2 = gate2(evidence, now);

  // No escalation input this pass — see file header. Only the cadence path can fire.
  const outcome = gate3({ dayInCycle, gate1: g1, gate2: g2 });

  if (outcome.action === "wait") return outcome;

  if (outcome.action === "defer") {
    await cycleStore.recordOutcome(db as any, {
      studentId,
      dayInCycle,
      gate1: g1,
      gate2: g2,
      why: outcome.why,
      action: "defer",
      nextCheckDay: outcome.nextCheckDay,
    });
    return outcome;
  }

  if (outcome.action === "route") {
    await cycleStore.recordOutcome(db as any, {
      studentId,
      dayInCycle,
      gate1: g1,
      gate2: g2,
      why: outcome.why,
      action: "route",
      routedTo: outcome.to,
    });
    return { action: "route", routedTo: outcome.to, why: outcome.why };
  }

  // fire — decide which template, if any, without composing or sending anything.
  const { templateCode, templateBand, selectionWhy } = await pickTemplate(userId);
  const why = `${outcome.why}; selection: ${selectionWhy}`;

  await cycleStore.recordOutcome(db as any, {
    studentId,
    dayInCycle,
    gate1: g1,
    gate2: g2,
    why,
    action: "fire",
    kind: outcome.kind,
    templateCode,
    templateBand,
  });

  return { action: "fire", kind: outcome.kind, templateCode, templateBand, why };
}

async function pickTemplate(
  userId: number,
): Promise<{ templateCode: string | null; templateBand: number | null; selectionWhy: string }> {
  /*
   * The same read `intake-conversation.ts`'s `chooseReveal` uses for the early-insight
   * moment during intake — `_track_answers` is the Q1–Q7 text filed by question code as
   * the student answers, kept alongside the rest of the captured intake fields. Reused
   * rather than re-derived so the two callers cannot quietly disagree about what a
   * student answered.
   */
  const responses = (await getBrandingIntake(userId))?.responses ?? {};
  const answers = ((responses as Record<string, unknown>)._track_answers ?? {}) as Answers;

  if (!Object.keys(answers).length) {
    return {
      templateCode: null,
      templateBand: null,
      selectionWhy: "no Q-numbered intake answers on record to select a template from",
    };
  }

  const track = detectTrack(answers).track;
  const facts = revealFacts(answers, track);
  const selection = selectReveal(facts);

  if (selection.outcome === "fire") {
    return {
      templateCode: selection.template.code,
      templateBand: selection.template.band,
      selectionWhy: selection.because,
    };
  }
  return { templateCode: null, templateBand: null, selectionWhy: selection.because };
}

/**
 * Recent Reveal Cycle history for one student, newest first -- the admin/harness
 * read surface `reveal-cycle-store.ts`'s own `historyFor` doc comment already
 * anticipated but nothing ever called outside this file. Thin passthrough so
 * callers (route files) never need `../db` or `reveal-cycle-store.ts`
 * themselves -- same shape as everything else this file already wraps.
 */
export async function revealCycleHistory(
  studentId: number,
  limit = 20,
): Promise<Record<string, unknown>[]> {
  return cycleStore.historyFor(db as any, studentId, limit);
}

export type RunResult = {
  evaluated: number;
  fired: number;
  deferred: number;
  routed: number;
  failed: number;
};

/**
 * Runs every eligible student's cycle once. Meant for the hourly `run-sequences.ts`
 * job, same shape as `soft-check-in.ts`'s `runDueSoftCheckIns` — per-student try/catch
 * so one broken row cannot cost everybody else their evaluation, failures collected and
 * thrown at the end so the runner records a failed execution rather than a silent one.
 */
export async function runDueRevealCycles(now: number = Date.now()): Promise<RunResult> {
  const result: RunResult = { evaluated: 0, fired: 0, deferred: 0, routed: 0, failed: 0 };

  const studentIds = await cycleStore.eligibleStudentIds(db as any);

  for (const studentId of studentIds) {
    try {
      const outcome = await evaluateRevealCycle(studentId, now);
      result.evaluated++;
      if (outcome.action === "fire") {
        result.fired++;
        log(
          `reveal cycle fired for student ${studentId}: ${outcome.templateCode ?? "null reveal"}`,
          "reveal-cycle",
        );
      } else if (outcome.action === "defer") {
        result.deferred++;
      } else if (outcome.action === "route") {
        result.routed++;
      }
    } catch (err) {
      result.failed++;
      log(`reveal cycle failed for student ${studentId}: ${(err as Error).message}`, "reveal-cycle");
    }
  }

  if (result.failed) {
    throw new Error(
      `${result.failed} of ${studentIds.length} reveal cycle evaluation(s) failed — see the reveal-cycle log`,
    );
  }

  return result;
}
