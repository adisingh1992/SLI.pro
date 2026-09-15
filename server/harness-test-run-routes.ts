import { Express } from "express";
import { isPlatformAdmin } from "./admin-guards";
import { getTestRunDetail, initializeTestRun, listRunsForPersona } from "./wing/test-run-store";
import { getPersona } from "./wing/harness-persona-store";
import { CHECKPOINTS, type Checkpoint } from "./wing/checkpoint-store";
import { claimTestRun, isModelTier, requestAbort, runTestRunTurns } from "./wing/test-run-engine";
import { buildRunExport, runExportToCsv } from "./wing/test-run-export";
import { buildCoachingDebrief } from "./wing/coaching-debrief";
import { buildUnfiredCardsReport } from "./wing/unfired-cards-report";
import { buildCardComparisonReport } from "./wing/card-comparison-report";
import type { ModelTier } from "./orchestrator";

/**
 * P3.2 — `POST /api/test/sessions/initialize`, exactly the path
 * `claude/TEST_HARNESS_PLAN_SEP9.md` names. Thin, same shape as every other
 * harness route file: no `./db` import, every write forced through
 * `server/wing/test-run-store.ts` (provisioning) or
 * `server/wing/test-run-engine.ts` (P3.1 — actually driving turns).
 *
 * `POST .../initialize` provisions only — see `test-run-store.ts`'s doc
 * comment for what that deliberately does not do (drive any turns).
 *
 * `POST .../:runId/drive` is what does. It answers as soon as the run is
 * atomically claimed (`claimTestRun`, fast — no model calls) and drives the
 * actual turn loop (`runTestRunTurns`) as a detached background task: a
 * persona/Wing exchange run to completion is real model latency times the
 * run's turn ceiling, which is not a reasonable length for an HTTP request
 * to stay open. `GET .../:runId` is how the caller (the Personas panel's
 * Run button) polls for the result. `POST .../:runId/abort` is the kill
 * switch — stops a running (or not-yet-driven) run without waiting for
 * `turnCeiling`, `tokenBudget` or `maxWallClockSeconds` to catch it on their
 * own (migration 0045 — see `test-run-engine.ts`'s doc comment for all four
 * ways a run ends besides natural completion).
 */

const MIN_TURN_CEILING = 1;
const MAX_TURN_CEILING = 60;
const MIN_TOKEN_BUDGET = 1_000;
const MAX_TOKEN_BUDGET = 2_000_000;
const MIN_WALL_CLOCK_SECONDS = 60;
const MAX_WALL_CLOCK_SECONDS = 3_600;

function isCheckpoint(v: unknown): v is Checkpoint {
  return typeof v === "string" && (CHECKPOINTS as string[]).includes(v);
}

/** Shared by every bounded-integer body field below — same validation shape,
 *  different name and range each time. */
function parseBoundedInt(
  value: unknown,
  min: number,
  max: number,
): { ok: true; value: number } | { ok: false } {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return { ok: false };
  return { ok: true, value: n };
}

export function registerTestRunRoutes(app: Express) {
  app.post("/api/test/sessions/initialize", isPlatformAdmin, async (req, res, next) => {
    try {
      const personaId = Number(req.body?.personaId);
      if (!Number.isInteger(personaId) || personaId <= 0) {
        return res.status(400).json({ error: "personaId is required" });
      }

      const checkpoint = req.body?.checkpoint;
      if (!isCheckpoint(checkpoint)) {
        return res.status(400).json({ error: "checkpoint must be one of: " + CHECKPOINTS.join(", ") });
      }

      let turnCeiling: number | undefined;
      if (req.body?.turnCeiling !== undefined) {
        const parsed = parseBoundedInt(req.body.turnCeiling, MIN_TURN_CEILING, MAX_TURN_CEILING);
        if (!parsed.ok) {
          return res.status(400).json({
            error: `turnCeiling must be an integer between ${MIN_TURN_CEILING} and ${MAX_TURN_CEILING}`,
          });
        }
        turnCeiling = parsed.value;
      }

      // Spend/latency guards (migration 0045) — optional, same "omit for the
      // default" shape as turnCeiling. initializeTestRun's own defaults apply
      // when these are undefined, so a caller that only cares about
      // turnCeiling never has to think about the other two.
      let tokenBudget: number | undefined;
      if (req.body?.tokenBudget !== undefined) {
        const parsed = parseBoundedInt(req.body.tokenBudget, MIN_TOKEN_BUDGET, MAX_TOKEN_BUDGET);
        if (!parsed.ok) {
          return res.status(400).json({
            error: `tokenBudget must be an integer between ${MIN_TOKEN_BUDGET} and ${MAX_TOKEN_BUDGET}`,
          });
        }
        tokenBudget = parsed.value;
      }

      let maxWallClockSeconds: number | undefined;
      if (req.body?.maxWallClockSeconds !== undefined) {
        const parsed = parseBoundedInt(req.body.maxWallClockSeconds, MIN_WALL_CLOCK_SECONDS, MAX_WALL_CLOCK_SECONDS);
        if (!parsed.ok) {
          return res.status(400).json({
            error: `maxWallClockSeconds must be an integer between ${MIN_WALL_CLOCK_SECONDS} and ${MAX_WALL_CLOCK_SECONDS}`,
          });
        }
        maxWallClockSeconds = parsed.value;
      }

      const result = await initializeTestRun(personaId, checkpoint, turnCeiling, tokenBudget, maxWallClockSeconds);

      if (!result.ok) {
        const status = result.error === "persona_not_found" ? 404 : 422;
        return res.status(status).json({ error: result.error, detail: result.detail });
      }

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  /**
   * Claims and starts driving a provisioned run. `modelDeployment` is the
   * PERSONA's tier only — Wing's own reply is always "flagship", inside
   * `test-run-engine.ts`, and is never accepted as a request field. Omitting
   * it keeps the run's existing/default tier (nano), which is how "rerun
   * with a different model" works: change the field, POST again — a fresh
   * run from `.../initialize`, then drive it with the tier that didn't work
   * last time.
   */
  app.post("/api/test/runs/:runId/drive", isPlatformAdmin, async (req, res, next) => {
    try {
      const runId = Number(req.params.runId);
      if (!Number.isInteger(runId) || runId <= 0) {
        return res.status(400).json({ error: "invalid runId" });
      }

      let modelDeployment: ModelTier | undefined;
      if (req.body?.modelDeployment !== undefined) {
        if (!isModelTier(req.body.modelDeployment)) {
          return res.status(400).json({ error: "modelDeployment must be one of: flagship, mid, nano" });
        }
        modelDeployment = req.body.modelDeployment;
      }

      const claim = await claimTestRun(runId, modelDeployment);
      if (!claim.ok) {
        const status = claim.error === "run_not_found" ? 404 : 409;
        return res.status(status).json({ error: claim.error, detail: claim.detail });
      }

      res.status(202).json({ runId, status: "running", modelDeployment: claim.modelDeployment });

      // Detached on purpose — see the file doc comment. Never throws past
      // this point; `runTestRunTurns` marks the run aborted internally on
      // any failure, so there is nothing further to do with a rejection
      // here beyond logging it.
      void runTestRunTurns(claim).catch((error) => {
        console.error(`[test-run-routes] run ${runId} drive task rejected:`, error);
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * The kill switch. Works on a run that's `"running"` or still
   * `"provisioned"` (never driven) — not on one already `"completed"` or
   * `"aborted"`, which `requestAbort`'s own atomic guard refuses. The turn
   * loop (if one is in flight) notices on its next per-turn check; nothing
   * here reaches into it directly.
   */
  app.post("/api/test/runs/:runId/abort", isPlatformAdmin, async (req, res, next) => {
    try {
      const runId = Number(req.params.runId);
      if (!Number.isInteger(runId) || runId <= 0) {
        return res.status(400).json({ error: "invalid runId" });
      }

      const reason = typeof req.body?.reason === "string" && req.body.reason.trim() ? req.body.reason.trim() : undefined;
      const result = reason === undefined ? await requestAbort(runId) : await requestAbort(runId, reason);

      if (!result.ok) {
        const status = result.error === "run_not_found" ? 404 : 409;
        return res.status(status).json({ error: result.error, detail: result.detail });
      }

      res.json({ runId, status: "aborted" });
    } catch (error) {
      next(error);
    }
  });

  /** Polled by the admin panel while a run is in flight. */
  app.get("/api/test/runs/:runId", isPlatformAdmin, async (req, res, next) => {
    try {
      const runId = Number(req.params.runId);
      if (!Number.isInteger(runId) || runId <= 0) {
        return res.status(400).json({ error: "invalid runId" });
      }

      const detail = await getTestRunDetail(runId);
      if (!detail) return res.status(404).json({ error: "run_not_found" });

      res.json(detail);
    } catch (error) {
      next(error);
    }
  });

  /**
   * Aditya, 15 Sep 2026: the Personas panel only ever showed a persona's
   * latest run -- older ones were invisible once a fresh Run replaced them
   * in local state, even though every run stays in the database and
   * `/api/test/runs/:runId` already serves any of them by id. This is the
   * list that lets the panel offer a picker: every run this persona has
   * ever had, so `GET /api/test/runs/:runId` can be called for any of them,
   * not just the newest.
   */
  app.get("/api/test/personas/:personaId/runs", isPlatformAdmin, async (req, res, next) => {
    try {
      const personaId = Number(req.params.personaId);
      if (!Number.isInteger(personaId) || personaId <= 0) {
        return res.status(400).json({ error: "personaId must be a positive integer" });
      }

      const persona = await getPersona(personaId);
      if (!persona) return res.status(404).json({ error: "persona not found" });

      const runs = await listRunsForPersona(personaId);
      res.json({ runs });
    } catch (error) {
      next(error);
    }
  });

  /**
   * P6.1 — the export endpoint. `?format=json` (default) returns the full
   * `RunExport` structure (`test-run-export.ts`); `?format=csv` returns one
   * row per turn, everything that doesn't fit a turn-shaped row (provenance,
   * persona adherence, discrepancies) left to the JSON format — see that
   * file's own doc comment on why. Works on a run at any status, including
   * `aborted` — an aborted run still has turns worth exporting.
   */
  app.get("/api/test/runs/:runId/export", isPlatformAdmin, async (req, res, next) => {
    try {
      const runId = Number(req.params.runId);
      if (!Number.isInteger(runId) || runId <= 0) {
        return res.status(400).json({ error: "invalid runId" });
      }

      const format = req.query.format === "csv" ? "csv" : "json";

      const exportData = await buildRunExport(runId);
      if (!exportData) return res.status(404).json({ error: "run_not_found" });

      if (format === "csv") {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="test-run-${runId}-export.csv"`,
        );
        res.send(runExportToCsv(exportData));
        return;
      }

      res.json(exportData);
    } catch (error) {
      next(error);
    }
  });

  /**
   * Danielle's output-requirements doc, #5 (this session, 15 Sep 2026 —
   * claude/HARNESS_GAP_ANALYSIS_DANIELLE_OUTPUT_REQS_SEP15.md #5): the
   * per-persona, per-module coaching debrief. Pure synthesis over the same
   * export this route's own `/export` endpoint already reads — see
   * `wing/coaching-debrief.ts`'s file header for exactly what each field
   * does and does not claim.
   */
  app.get("/api/test/runs/:runId/debrief", isPlatformAdmin, async (req, res, next) => {
    try {
      const runId = Number(req.params.runId);
      if (!Number.isInteger(runId) || runId <= 0) {
        return res.status(400).json({ error: "invalid runId" });
      }

      const debrief = await buildCoachingDebrief(runId);
      if (!debrief) return res.status(404).json({ error: "run_not_found" });

      res.json(debrief);
    } catch (error) {
      next(error);
    }
  });

  /**
   * P6.2 — the Unfired Cards report. Scope is either every run that shares a
   * published sequence (`?sequenceId=`) or an explicit set of runs
   * (`?runIds=1,2,3`) for a narrower comparison; exactly one is required.
   * `buildUnfiredCardsReport` (`wing/unfired-cards-report.ts`) does the
   * actual assembly — this route only parses the two query shapes and maps
   * its result codes, the same division every other route in this file
   * keeps between "does this input parse" and "what does the store say".
   *
   * 404 means nothing in scope ever ran; 422 means the scope itself doesn't
   * make sense — today that's only `runIds` spanning more than one
   * sequence, where a card's eligibility would no longer mean one thing.
   */
  app.get("/api/test/unfired-cards", isPlatformAdmin, async (req, res, next) => {
    try {
      const runIdsRaw = req.query.runIds;
      const sequenceIdRaw = req.query.sequenceId;

      let scope: { sequenceId: number } | { runIds: number[] };
      if (typeof runIdsRaw === "string" && runIdsRaw.trim()) {
        const ids = runIdsRaw.split(",").map((s) => Number(s.trim()));
        if (!ids.length || ids.some((n) => !Number.isInteger(n) || n <= 0)) {
          return res
            .status(400)
            .json({ error: "runIds must be a comma-separated list of positive integers" });
        }
        scope = { runIds: ids };
      } else if (typeof sequenceIdRaw === "string" && sequenceIdRaw.trim()) {
        const sequenceId = Number(sequenceIdRaw);
        if (!Number.isInteger(sequenceId) || sequenceId <= 0) {
          return res.status(400).json({ error: "sequenceId must be a positive integer" });
        }
        scope = { sequenceId };
      } else {
        return res.status(400).json({ error: "sequenceId or runIds is required" });
      }

      const result = await buildUnfiredCardsReport(scope);
      if (!result.ok) {
        if (result.error === "no_runs_for_scope") {
          return res.status(404).json({ error: result.error });
        }
        return res.status(422).json({ error: result.error, detail: result.detail });
      }

      res.json(result.report);
    } catch (error) {
      next(error);
    }
  });

  /**
   * P6.3 — cross-persona comparison for one card: the same scope as
   * `/unfired-cards` (either `?sequenceId=` or `?runIds=1,2,3`), pivoted to
   * one `heuristicId` so every persona/audience in scope shows side by side
   * rather than summed into one bucket. 404 covers both "nothing in scope
   * ever ran" and "that heuristic id never appeared in any trace in scope"
   * (a typo'd id and an empty run set look the same to the caller: nothing
   * to show); 422 is the same multi-sequence refusal `/unfired-cards` uses.
   */
  app.get("/api/test/card-comparison", isPlatformAdmin, async (req, res, next) => {
    try {
      const heuristicIdRaw = req.query.heuristicId;
      const heuristicId = Number(heuristicIdRaw);
      if (!Number.isInteger(heuristicId) || heuristicId <= 0) {
        return res.status(400).json({ error: "heuristicId must be a positive integer" });
      }

      const runIdsRaw = req.query.runIds;
      const sequenceIdRaw = req.query.sequenceId;

      let scope: { sequenceId: number } | { runIds: number[] };
      if (typeof runIdsRaw === "string" && runIdsRaw.trim()) {
        const ids = runIdsRaw.split(",").map((s) => Number(s.trim()));
        if (!ids.length || ids.some((n) => !Number.isInteger(n) || n <= 0)) {
          return res
            .status(400)
            .json({ error: "runIds must be a comma-separated list of positive integers" });
        }
        scope = { runIds: ids };
      } else if (typeof sequenceIdRaw === "string" && sequenceIdRaw.trim()) {
        const sequenceId = Number(sequenceIdRaw);
        if (!Number.isInteger(sequenceId) || sequenceId <= 0) {
          return res.status(400).json({ error: "sequenceId must be a positive integer" });
        }
        scope = { sequenceId };
      } else {
        return res.status(400).json({ error: "sequenceId or runIds is required" });
      }

      const result = await buildCardComparisonReport(scope, heuristicId);
      if (!result.ok) {
        if (result.error === "no_runs_for_scope" || result.error === "card_not_found_in_scope") {
          return res.status(404).json({ error: result.error });
        }
        return res.status(422).json({ error: result.error, detail: result.detail });
      }

      res.json(result.report);
    } catch (error) {
      next(error);
    }
  });
}
