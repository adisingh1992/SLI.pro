import { Express, Request, Response, NextFunction } from "express";
import * as store from "./wing/life-log-store";
import { log } from "./logger";
import { isStudent } from "./admin-guards";

/**
 * Life log API (Feature List B2).
 *
 * Student-facing, unlike most of what has been built recently — so the auth
 * guard is `isAuthenticated`, and every route resolves the student id from the
 * session rather than trusting one in the request. A life log keyed on a
 * client-supplied id would let any logged-in student read any other's entries,
 * and these are the most personal records in the system.
 */

// `isStudent` also refuses a signed-in admin, who has no `wing_students` row
// for `requireStudent` below to resolve — see admin-guards.ts. Aliased so
// nothing below needed to change.
const isAuthenticated = isStudent;

/** Session user → wing student. 404 rather than 500 when there is no student row. */
async function requireStudent(req: Request, res: Response): Promise<number | null> {
  const userId = (req.user as any)?.id;
  const studentId = userId ? await store.studentIdForUser(userId) : null;
  if (!studentId) {
    res.status(404).json({ error: "No student record for this account" });
    return null;
  }
  return studentId;
}

export function registerLifeLogRoutes(app: Express) {
  /** Entries plus the prompt to show, in one call — the page needs both. */
  app.get("/api/life-log", isAuthenticated, async (req, res, next) => {
    try {
      const studentId = await requireStudent(req, res);
      if (!studentId) return;

      const [entries, prompt, summary] = await Promise.all([
        store.listEntries(studentId),
        store.promptFor(studentId),
        store.summary(studentId),
      ]);

      res.json({ entries, prompt, summary });
    } catch (error) {
      next(error);
    }
  });

  /** A different prompt, without writing anything — the "show me another" link. */
  app.get("/api/life-log/prompt", isAuthenticated, async (req, res, next) => {
    try {
      const studentId = await requireStudent(req, res);
      if (!studentId) return;

      /*
       * `category` used to be read off the query string and passed through. It was the
       * legacy seven-value field, which Danielle's library does not use, so it could
       * only ever narrow the pool to nothing. Selection is now by audience and cadence
       * — see `promptFor`. A client still sending the parameter gets a prompt instead
       * of null, which is the direction this change goes in.
       */
      res.json({ prompt: await store.promptFor(studentId) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/life-log", isAuthenticated, async (req, res, next) => {
    try {
      const studentId = await requireStudent(req, res);
      if (!studentId) return;

      const entryText = String(req.body?.entryText ?? "").trim();
      if (!entryText) {
        return res.status(400).json({ error: "An entry needs some text." });
      }
      // A generous ceiling rather than a tight one. The spec wants a sentence,
      // but someone who has just had a big week should not lose the end of what
      // they wrote to a limit nobody warned them about.
      if (entryText.length > 20000) {
        return res.status(400).json({ error: "That's longer than the log can take — try splitting it." });
      }

      const entryType = req.body?.entryType === "personal" ? "personal" : "career";
      const promptId = Number.isInteger(req.body?.promptId) ? req.body.promptId : null;

      const entry = await store.createEntry({ studentId, entryText, entryType, promptId });

      log(`life log entry ${entry.id} for student ${studentId}`, "lifelog");
      res.status(201).json(entry);
    } catch (error) {
      next(error);
    }
  });

  /**
   * Retry Wing's reply for an entry that has none.
   *
   * Exists because the entry is saved even when the model call fails — the
   * student's words are never lost to an unavailable LLM — which means some
   * entries legitimately have no response and need a way to get one.
   */
  app.post("/api/life-log/:id/response", isAuthenticated, async (req, res, next) => {
    try {
      const studentId = await requireStudent(req, res);
      if (!studentId) return;

      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid entry id" });

      // Ownership is checked by listing this student's entries rather than
      // trusting the id: without it, any signed-in student could trigger
      // generation against another student's entry and read the result.
      const owned = (await store.listEntries(studentId, 500)).some((e) => e.id === id);
      if (!owned) return res.status(404).json({ error: "Entry not found" });

      const ok = await store.backfillResponse(id);
      if (!ok) return res.status(409).json({ error: "Nothing to generate, or generation failed." });

      res.json({ generated: true });
    } catch (error) {
      next(error);
    }
  });
}
