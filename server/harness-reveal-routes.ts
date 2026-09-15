import { Express } from "express";
import { isPlatformAdmin } from "./admin-guards";
import { getPersona } from "./wing/harness-persona-store";
import { evaluateRevealCycle, revealCycleHistory } from "./wing/reveal-cycle";

/**
 * Danielle's "output requirements" doc, #11 (Reveal Cycle evaluation): "what
 * did Reveal Cycle produce about this persona, does it pass the substitution
 * (Barnum) test, does it align with methodology predictions, what's missed
 * or unexpected." The gate logic that answers the Barnum-test half is
 * already written and unit-tested (reveal-gates.ts); this file is the
 * missing surface that makes any of it reachable from the harness at all --
 * see claude/HARNESS_GAP_ANALYSIS_DANIELLE_OUTPUT_REQS_SEP15.md section 11.
 *
 * Same shape as every other harness route file: thin, isPlatformAdmin-
 * guarded, and every read or write forced through a wing/*.ts module --
 * this file never imports ./db itself. Scoped by personaId, not studentId
 * directly, so the caller (the Personas panel) never needs to know a
 * persona's underlying student id to use it.
 *
 * evaluateRevealCycle is real production logic (reveal-cycle.ts), not a
 * harness-only simulation -- running it against a seeded persona is exactly
 * what the hourly runDueRevealCycles job would eventually do for that
 * account on its own, just on demand rather than waiting on real calendar
 * days. Safe to call: is_test_user already excludes the persona's account
 * from every real aggregate and from Reveal Cycle's own eligibility scan
 * outside this on-demand path, and evaluateRevealCycle's own doc comment
 * notes it's safe to call more than once for the same student -- a "wait"
 * writes nothing, and every other outcome recomputes from real timestamps
 * rather than assuming it hasn't been called before.
 */
export function registerHarnessRevealRoutes(app: Express) {
  app.get(
    "/api/test/personas/:personaId/reveal-cycle",
    isPlatformAdmin,
    async (req, res, next) => {
      try {
        const personaId = Number(req.params.personaId);
        if (!Number.isInteger(personaId)) {
          return res.status(400).json({ error: "personaId must be an integer" });
        }
        const persona = await getPersona(personaId);
        if (!persona) return res.status(404).json({ error: "persona not found" });
        if (!persona.seededStudentId) {
          return res.status(404).json({ error: "persona has not been activated -- no student to evaluate" });
        }
        const history = await revealCycleHistory(persona.seededStudentId);
        res.json({ studentId: persona.seededStudentId, history });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/test/personas/:personaId/reveal-cycle/evaluate",
    isPlatformAdmin,
    async (req, res, next) => {
      try {
        const personaId = Number(req.params.personaId);
        if (!Number.isInteger(personaId)) {
          return res.status(400).json({ error: "personaId must be an integer" });
        }
        const persona = await getPersona(personaId);
        if (!persona) return res.status(404).json({ error: "persona not found" });
        if (!persona.seededStudentId) {
          return res.status(404).json({ error: "persona has not been activated -- no student to evaluate" });
        }
        const outcome = await evaluateRevealCycle(persona.seededStudentId);
        res.json({ studentId: persona.seededStudentId, outcome });
      } catch (error) {
        next(error);
      }
    },
  );
}
