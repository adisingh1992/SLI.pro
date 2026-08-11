import { Express, Request, Response, NextFunction } from 'express';
import { IStorage } from './storage';
import { generateSLIs } from './sli';
import * as orchestrator from "./orchestrator";
import * as sliStore from "./wing/sli-store";
import * as profileStore from "./wing/profile-store";
import * as identity from "./wing/identity-store";
import { parseJsonResponse } from "./json-response";
import { log } from "./logger";
import { isAdmin } from "./admin-guards";

/**
 * SLI routes — running natively on the Wing schema.
 *
 * The MVP packed three candidates into one row and mutated it in place for
 * selection and refinement. Wing stores one row per SLI with lineage, so:
 *
 *   - generation      creates three `candidate` rows
 *   - selection       marks one `active` and supersedes the rest
 *   - a custom SLI    is its own row, tagged human_originated
 *   - a refinement    is a NEW row whose parent is superseded, never overwritten
 *
 * Nothing is destroyed: a previous SLI becomes part of the longitudinal record,
 * which is what the career-evolution re-entry pathway depends on (spec §12).
 *
 * API (new model): SLIs are returned as an array of records rather than a
 * single row with title1/statement1/…
 */

export function registerSliRoutes(app: Express, storage: IStorage) {
  const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
    if (req.isAuthenticated() && req.user) return next();
    res.status(401).json({ message: "Unauthorized" });
  };

  /** Confirms the SLI belongs to the caller (student-id comparison). */
  async function assertOwnership(sliId: number, userId: number) {
    const sli = await sliStore.getById(sliId);
    if (!sli) return { error: 404 as const, sli: null };
    const studentId = await sliStore.studentIdForUser(userId);
    if (sli.studentId !== studentId) return { error: 403 as const, sli: null };
    return { error: null, sli };
  }

  /* ── Admin ───────────────────────────────────────────────────────────── */

  /** Generates three candidates for a user. */
  app.post("/api/admin/users/:userId/slis/generate", isAdmin, async (req, res, next) => {
    try {
      const userId = parseInt(req.params.userId);

      const user = await identity.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const userProfile = await profileStore.getUserProfile(userId);
      if (!userProfile) return res.status(404).json({ message: "User profile not found" });

      const generated = await generateSLIs(userProfile);
      if (!generated) return res.status(500).json({ message: "Failed to generate SLIs" });

      // Three candidate rows rather than one packed row.
      const candidates = await sliStore.createCandidates(userId, generated as any);
      res.status(201).json(candidates);
    } catch (error) {
      console.error('Error generating SLIs:', error);
      next(error);
    }
  });

  app.get("/api/admin/users/:userId/slis", isAdmin, async (req, res, next) => {
    try {
      const userId = parseInt(req.params.userId);
      const user = await identity.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      res.json(await sliStore.listByUser(userId));
    } catch (error) {
      console.error('Error getting SLIs:', error);
      next(error);
    }
  });

  app.get("/api/admin/slis/:id", isAdmin, async (req, res, next) => {
    try {
      const sli = await sliStore.getById(parseInt(req.params.id));
      if (!sli) return res.status(404).json({ message: "SLI not found" });
      res.json(sli);
    } catch (error) {
      console.error('Error getting SLI:', error);
      next(error);
    }
  });

  /** Admin activation of a specific SLI. */
  app.patch("/api/admin/slis/:id", isAdmin, async (req, res, next) => {
    try {
      const sliId = parseInt(req.params.id);
      const existing = await sliStore.getById(sliId);
      if (!existing) return res.status(404).json({ message: "SLI not found" });

      if (req.body?.status === "active" || req.body?.activate === true) {
        return res.json(await sliStore.markActive(sliId));
      }
      res.status(400).json({
        message: "Only activation is supported; refinements create a new record",
      });
    } catch (error) {
      console.error('Error updating SLI:', error);
      next(error);
    }
  });

  /** Candidates only — selected/superseded records are retained forever. */
  app.delete("/api/admin/slis/:id", isAdmin, async (req, res, next) => {
    try {
      await sliStore.deleteCandidate(parseInt(req.params.id));
      res.status(204).send();
    } catch (error: any) {
      if (String(error?.message).includes("Only candidate")) {
        return res.status(400).json({ message: error.message });
      }
      console.error('Error deleting SLI:', error);
      next(error);
    }
  });

  /* ── Student ─────────────────────────────────────────────────────────── */

  /** The SLI currently in force. */
  app.get("/api/user/sli", isAuthenticated, async (req, res, next) => {
    try {
      const active = await sliStore.getActive(req.user!.id);
      if (!active) return res.status(404).json({ message: "No selected SLI found" });
      res.json(active);
    } catch (error) {
      console.error('Error getting user SLI:', error);
      next(error);
    }
  });

  /** Every SLI for the student — candidates, active and superseded history. */
  app.get("/api/user/slis", isAuthenticated, async (req, res, next) => {
    try {
      const slis = await sliStore.listByUser(req.user!.id);
      if (!slis.length) return res.status(404).json({ message: "No SLIs found" });
      res.json(slis);
    } catch (error) {
      console.error('Error getting user SLIs:', error);
      next(error);
    }
  });

  /**
   * Selects an SLI, or creates a custom one.
   * Body: { activate: true } | { customStatement: "...", title?: "..." }
   */
  app.patch("/api/user/slis/:id", isAuthenticated, async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const { customStatement, title } = req.body ?? {};

      if (customStatement) {
        // A student-authored SLI is its own record, tagged human_originated.
        const custom = await sliStore.createCustom(userId, {
          title,
          statement: customStatement,
        });
        return res.json(custom);
      }

      const sliId = parseInt(req.params.id);
      const { error } = await assertOwnership(sliId, userId);
      if (error === 404) return res.status(404).json({ message: "SLI not found" });
      if (error === 403) {
        return res.status(403).json({ message: "You don't have permission to update this SLI" });
      }

      res.json(await sliStore.markActive(sliId));
    } catch (error) {
      console.error('Error updating user SLI:', error);
      next(error);
    }
  });

  /**
   * Refines an SLI. Creates a NEW record descending from the parent; the
   * parent is superseded but retained.
   */
  app.post("/api/user/sli/refine", isAuthenticated, async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const { sliId, feedback } = req.body ?? {};

      if (!sliId) return res.status(400).json({ message: "SLI ID is required" });
      if (!feedback || !String(feedback).trim()) {
        return res.status(400).json({ message: "Feedback is required to refine your SLI" });
      }

      const { error, sli } = await assertOwnership(parseInt(sliId), userId);
      if (error === 404) return res.status(404).json({ message: "SLI not found" });
      if (error === 403) {
        return res.status(403).json({ message: "You don't have permission to update this SLI" });
      }

      if (sli!.refinementCount >= sliStore.MAX_REFINEMENTS) {
        return res.status(400).json({
          message: `You've reached the maximum number of refinements (${sliStore.MAX_REFINEMENTS}) for this SLI`,
        });
      }

      // Sibling candidates give the model the alternatives that were considered.
      const all = await sliStore.listByUser(userId);
      const alternatives = all
        .filter((s) => s.id !== sli!.id && s.source === "generated")
        .map((s, i) => `Option ${i + 1}: ${s.statement}`)
        .join("\n");

      /*
       * JSON, not prose headings.
       *
       * This previously asked for three named headings and recovered them with
       *   response.split(/Refined SLI|Refinement Rationale|Implementation Guidance/g)
       * which fails in three separate ways, none of which raise an error:
       *
       *   1. The model writes those exact phrases inside the prose — "this
       *      refined SLI positions you as…" — and every occurrence creates a
       *      spurious section, shifting rationale and guidance onto the wrong
       *      text.
       *   2. The alternation does not preserve order, so sections[1] is
       *      "whatever followed the first heading", not necessarily the SLI.
       *   3. When "Final SLI Statement:" did not match, the fallback assigned
       *      the ENTIRE section as the statement — so a student's SLI silently
       *      became three paragraphs including a heading.
       *
       * All three produce a plausible non-empty result, which is why this was
       * reported as "refinement is broken" rather than as an error. Structured
       * output removes the parsing step instead of hardening it.
       */
      const systemPrompt = `You are a professional branding expert for SLI.pro, helping a client refine their chosen Single Lasting Impression (SLI) based on their feedback. Use the original SLI options and the client's specific feedback to create an optimized version that precisely meets their needs.

Respond with ONLY a JSON object, no prose before or after, in exactly this shape:

{
  "statement": string,   // The refined SLI: ONE complete sentence, nothing else. No label, no quotes, no heading.
  "rationale": string,   // 2-3 paragraphs explaining what changed and why it strengthens the positioning.
  "implementationGuidance": string  // Practical guidance for using this SLI across their professional presence.
}

"statement" must be the sentence on its own. If it contains a newline, a colon-prefixed label, or more than one sentence, it is wrong.`;

      const userPrompt = `Here were the SLI options generated for me:
${alternatives || "(no alternative options recorded)"}

I have selected this SLI: "${sli!.statement}"

Here is my feedback on how I would like to refine it:
${feedback}

Please provide a refined SLI statement, rationale, and implementation guidance based on this feedback.`;

      // SLI refinement is quality-critical -> flagship tier.
      const { text: response } = await orchestrator.complete({
        tier: "flagship",
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        maxTokens: 2500,
        temperature: 0.7,
      });

      let parsed: {
        statement?: string;
        rationale?: string;
        implementationGuidance?: string;
      };
      try {
        parsed = parseJsonResponse(response, "SLI refinement");
      } catch (err) {
        log(`SLI refinement parse failed: ${(err as Error).message}`, "sli");
        return res.status(502).json({
          message: "Wing couldn't produce a refined SLI just now. Try again in a moment.",
        });
      }

      const refinedStatement = String(parsed.statement ?? "").trim();

      // Guards on the value, not just its presence. The old code's failure was
      // never an empty string — it was a long, structured, entirely wrong one,
      // which passed a truthiness check and went straight into the database as
      // the student's positioning statement.
      if (!refinedStatement) {
        return res.status(502).json({
          message: "Wing couldn't produce a refined SLI just now. Try again in a moment.",
        });
      }
      if (refinedStatement.length > 400 || refinedStatement.includes("\n")) {
        log(
          `SLI refinement rejected: statement was ${refinedStatement.length} chars` +
            `${refinedStatement.includes("\n") ? " and multi-line" : ""}`,
          "sli",
        );
        return res.status(502).json({
          message: "Wing returned something that doesn't look like an SLI. Try rewording your feedback.",
        });
      }

      const refinementRationale = String(parsed.rationale ?? "").trim();
      const implementationGuidance = String(parsed.implementationGuidance ?? "").trim();

      const refined = await sliStore.refine(sli!.id, {
        statement: refinedStatement,
        rationale: refinementRationale,
        implementationGuidance,
        title: sli!.title,
      });

      res.json({
        ...refined,
        refinementResponse: {
          refinedSliText: refinedStatement,
          refinementRationale,
          implementationGuidance,
        },
      });
    } catch (error) {
      console.error('Error refining SLI:', error);
      next(error);
    }
  });
}
