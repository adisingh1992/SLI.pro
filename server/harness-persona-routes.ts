import { Express } from "express";
import { isPlatformAdmin } from "./admin-guards";
import {
  activatePersona,
  createPersona,
  deletePersona,
  getPersona,
  listActivatableCycles,
  listPersonas,
  updatePersona,
  validatePersonaForActivation,
  type PersonaInput,
} from "./wing/harness-persona-store";
// Read-only — getLatestRunsForPersonas never writes, so importing it here
// doesn't touch this file's own "never imports ./db" guarantee
// (harness-persona-boundary.test.ts checks that guarantee by name).
import { getLatestRunsForPersonas } from "./wing/test-run-store";
import { PATHWAYS, PROFESSIONAL_STATUSES } from "./wing/parse-persona";
import { PERSONA_TIERS } from "./wing/model-tier";

/**
 * Persona authoring from the Admin panel.
 *
 * ── WHAT THIS IS FOR ──────────────────────────────────────────────────────
 * "Can we give a UI to add personas from the Admin panel itself?" — Aditya,
 * 10 Sep 2026. `methodology/personas/*.md` stays the file-based path; this is
 * the other one, for Danielle. Every write goes through
 * `server/wing/harness-persona-store.ts`, never through this file directly —
 * this file has no import of `./db` at all, which is the guarantee
 * `harness-persona-boundary.test.ts` checks for by name, so every table this
 * surface can touch is auditable from one file.
 *
 * ── WHY THIS IS ITS OWN FILE AND NOT AN ADDITION TO harness-routes.ts ─────
 * `harness-routes.ts` is read-only by construction and `harness-boundary.test.ts`
 * asserts it registers no mutating verb at all. Adding a POST there would mean
 * either breaking that test's premise or carving an exception into it — a
 * read-only file should stay one thing. This file is explicitly the other
 * thing: bounded, but not read-only, and tested to its own, different rule.
 *
 * ── DRAFT → READY → SEEDED, THE SAME SHAPE AS THE CLI ─────────────────────
 * A draft can be incomplete and saved anyway — professional_status and
 * pathway may be blank while Danielle is still writing. Activating (the
 * "Activate" action, not "Save") is what refuses a persona missing either,
 * the same refusal `wing:seed-personas` already makes, and it is what
 * actually creates the account. Editing a seeded persona's identity fields
 * (status/pathway/key) is refused for the same reason
 * `wing:seed-personas`'s own idempotency is: the real account cannot be
 * silently repointed once its transcripts might already be under review.
 */

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function readInput(body: unknown): Partial<PersonaInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: Partial<PersonaInput> = {};
  if (typeof b.personaKey === "string") out.personaKey = b.personaKey.trim();
  if (typeof b.name === "string") out.name = b.name.trim();
  if (b.professionalStatus === null || typeof b.professionalStatus === "string") {
    out.professionalStatus = (b.professionalStatus as never) || null;
  }
  if (b.pathway === null || typeof b.pathway === "string") {
    out.pathway = (b.pathway as never) || null;
  }
  if (b.defaultModelTier === null || typeof b.defaultModelTier === "string") {
    out.defaultModelTier = (b.defaultModelTier as never) || null;
  }
  if (Array.isArray(b.expectedMarkers)) {
    out.expectedMarkers = b.expectedMarkers.filter((m) => typeof m === "string");
  }
  for (const field of [
    "quickReference",
    "readinessByBehavior",
    "interactionPolicy",
    "voiceSample",
    "diamond",
    "coldStartNote",
    "systemPromptSummary",
    "whatThisTests",
  ] as const) {
    if (typeof b[field] === "string") out[field] = b[field] as string;
  }
  return out;
}

export function registerHarnessPersonaRoutes(app: Express) {
  /** The vocabulary the form needs — read from the same constants
   *  parse-persona.ts refuses against, so the two authoring paths can never
   *  quietly drift apart on what a valid value is. `modelTiers` is the same
   *  set `test-run-engine.ts`'s `claimTestRun` validates a persona's default
   *  tier against — "the current list should have the existing deployments"
   *  (Aditya, 11 Sep 2026). */
  app.get("/api/admin/harness/personas/vocabulary", isPlatformAdmin, (_req, res) => {
    res.json({
      professionalStatuses: PROFESSIONAL_STATUSES,
      pathways: PATHWAYS,
      modelTiers: Array.from(PERSONA_TIERS),
    });
  });

  app.get("/api/admin/harness/personas", isPlatformAdmin, async (_req, res, next) => {
    try {
      const personas = await listPersonas();
      // Aditya, 15 Sep 2026: no screen showed a persona's run progress once
      // the page reloaded or was reopened, and no manual way to refresh it.
      // Attached here, not fetched separately per persona, so the list's own
      // load carries it — one query for every persona on the page, not one
      // per row.
      const latestRuns = await getLatestRunsForPersonas(personas.map((p) => p.id));
      res.json({
        personas: personas.map((p) => ({
          ...p,
          latestRun: latestRuns.get(p.id) ?? null,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/harness/personas/cycles", isPlatformAdmin, async (_req, res, next) => {
    try {
      res.json({ cycles: await listActivatableCycles() });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/harness/personas/:id", isPlatformAdmin, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid persona id" });
      const persona = await getPersona(id);
      if (!persona) return res.status(404).json({ error: "Persona not found" });
      res.json({
        persona,
        readyForActivation: validatePersonaForActivation(persona).length === 0,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/harness/personas", isPlatformAdmin, async (req, res, next) => {
    try {
      const input = readInput(req.body);
      if (!input.personaKey || !input.name) {
        return res.status(400).json({ error: "personaKey and name are required" });
      }
      const result = await createPersona(input as PersonaInput);
      if (!result.ok) {
        return res.status(422).json({ error: result.error, detail: result.detail });
      }
      res.status(201).json({ persona: result.persona });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/admin/harness/personas/:id", isPlatformAdmin, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid persona id" });
      const result = await updatePersona(id, readInput(req.body));
      if (!result.ok) {
        const status = result.error === "not_found" ? 404 : 422;
        return res.status(status).json({ error: result.error });
      }
      res.json({ persona: result.persona });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/admin/harness/personas/:id", isPlatformAdmin, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid persona id" });
      const result = await deletePersona(id);
      if (!result.ok) {
        const status = result.error === "not_found" ? 404 : 409;
        return res.status(status).json({ error: result.error });
      }
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  /**
   * Turns a draft into a real test account. Refuses cleanly rather than
   * seeding a broken one — every failure mode here is one this same platform
   * would otherwise discover as a silent, empty selection trace.
   */
  app.post("/api/admin/harness/personas/:id/activate", isPlatformAdmin, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid persona id" });

      const cycleId = parseId(String(req.body?.cycleId ?? ""));
      if (!cycleId) return res.status(400).json({ error: "cycleId is required" });

      const result = await activatePersona(id, cycleId);
      if (!result.ok) {
        const status = result.error === "not_found" || result.error === "cycle_not_found" ? 404 : 422;
        return res.status(status).json(
          "failures" in result
            ? { error: result.error, failures: result.failures }
            : { error: result.error, ...("detail" in result ? { detail: result.detail } : {}) },
        );
      }
      res.json({ persona: result.persona, studentId: result.studentId });
    } catch (error) {
      next(error);
    }
  });
}
