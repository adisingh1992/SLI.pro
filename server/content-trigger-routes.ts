import { Express, Request, Response } from "express";
import { db } from "./db";
import { isStudent } from "./admin-guards";
import { log } from "./logger";
import * as artifactStore from "./wing/artifact-store";
import {
  routeContentTrigger,
  requestContentTrigger,
  recordTriggerFired,
  recordTriggerDeclined,
  recordDraftStarted,
  type RouteResult,
} from "./wing/content-trigger-integration";

/**
 * H-627's routing (`content-trigger-integration.ts`) had no route at all
 * before this file — confirmed by grepping the whole repo for
 * `routeContentTrigger`: only its own definition and its own test used it.
 * Every other trigger-shaped feature here (Baby Radar, the life log) has a
 * GET that surfaces what's due and a POST that acts on it; H-620–627 didn't.
 *
 * ── WHY ACCEPTING A SUGGESTION DOESN'T HAND BACK A DRAFT TO PUBLISH ─────────
 * H-615 ("Wing coaches, never authors") is explicit and unambiguous —
 * `wing-master-module-compendium-v2.md`'s own detection_method distinguishes
 * a coaching example or structural suggestion (acceptable) from "a complete
 * ghost-written draft... presented as ready to publish" (not acceptable),
 * with a scripted refusal for "can you just write it for me?" This matters
 * here specifically because the ALREADY-SHIPPED
 * `generateLinkedinContentDrafts` (linkedin-content-routes.ts) does exactly
 * the not-acceptable thing — it asks the model for "two distinct,
 * ready-to-use LinkedIn posts that the client can immediately copy, paste,
 * and publish" and stores the result as a `content_drafts` row. That
 * pre-existing endpoint is a real H-615 violation, flagged here rather than
 * silently fixed — it's shipped, working code outside today's scope, and
 * touching it wasn't asked for. What matters for THIS file: it is not the
 * precedent to copy. Accepting a fired trigger below seeds a `content_drafts`
 * row with a coaching scaffold — the reason the trigger fired, framed as a
 * nudge to write, never finished prose — and the student writes the actual
 * words. `POST /api/linkedin-content-drafts/:draftId/post` already accepts
 * whatever `content` string the caller sends at publish time (not the
 * stored draft row), so nothing about that endpoint needed to change for
 * this to work.
 *
 * ── WHAT "ACCEPT"/"DECLINE" RE-VERIFY, AND WHY ──────────────────────────────
 * Both re-run the real detection server-side rather than trusting the
 * client's `contentType` against whatever the last GET returned — cadence,
 * suppression, or the underlying signal can all have changed in between (a
 * safety hold could start, the cadence window could close), and IG-M6-02's
 * suppression check must never be something a stale client request can talk
 * its way past.
 *
 * ── decline AND draft_started: A REAL GAP THIS FILE CLOSES, NOT JUST WIRES ──
 * `declineStreak()` and `daysSinceLastUserContentAction()` in
 * content-trigger-integration.ts both read `content_activity_log` rows
 * (`trigger_declined`, `draft_started`) that nothing anywhere had ever
 * written — those two halves of H-625's cadence rules (decline-streak
 * extension/pause, content-action suppression) could never have actually
 * fired. `recordTriggerDeclined`/`recordDraftStarted` (added to
 * content-trigger-integration.ts alongside this file) are the missing
 * writers.
 */

const isAuthenticated = isStudent;

async function requireStudent(req: Request, res: Response): Promise<number | null> {
  const userId = (req.user as any)?.id;
  const studentId = userId ? await artifactStore.studentIdForUser(userId) : null;
  if (!studentId) {
    res.status(404).json({ error: "No student record for this account" });
    return null;
  }
  return studentId;
}

/**
 * A coaching nudge, not a draft — the reason a trigger fired, put in front of
 * the student as an invitation to write, never as something to copy. Kept
 * deliberately short and never fabricates specifics beyond what `reason`
 * already names (IG-M6-04: every suggestion traces to a named source; this
 * just rephrases that source, it doesn't add to it).
 */
function coachingPromptFor(
  contentType: "comment" | "post" | "article",
  detection: NonNullable<RouteResult["detection"]>,
): string {
  const opener = {
    comment: "Wing noticed something worth commenting on",
    post: "Wing noticed something worth writing about",
    article: "Wing noticed something that might be bigger than a single post",
  }[contentType];
  return `${opener}: ${detection.reason}. Wing can help you shape it — structure, feedback, an example line — but the words need to be yours. What do you want to say?`;
}

function isContentType(value: unknown): value is "comment" | "post" | "article" {
  return value === "comment" || value === "post" || value === "article";
}

export function registerContentTriggerRoutes(app: Express) {
  /** What's due right now, if anything — no writes. */
  app.get("/api/content-triggers", isAuthenticated, async (req, res, next) => {
    try {
      const studentId = await requireStudent(req, res);
      if (!studentId) return;

      const result = await routeContentTrigger(db as any, studentId);
      res.json({
        fires: result.fires,
        contentType: result.contentType,
        reason: result.reason,
        signal: result.detection?.signal ?? null,
        triggerSource: result.detection?.triggerSource ?? null,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * The student engages with a suggestion Wing surfaced. Records
   * `trigger_fired` and, for post/article, seeds a coaching-scaffold
   * `content_drafts` row (comment has none — H-620's own schema doc comment:
   * comments are one-off responses, never staged drafts).
   */
  app.post("/api/content-triggers/accept", isAuthenticated, async (req, res, next) => {
    try {
      const studentId = await requireStudent(req, res);
      if (!studentId) return;

      const contentType = req.body?.contentType;
      if (!isContentType(contentType)) {
        return res.status(400).json({ error: "contentType must be comment, post, or article" });
      }

      const result = await routeContentTrigger(db as any, studentId);
      if (!result.fires || result.contentType !== contentType || !result.detection) {
        return res.status(409).json({
          error: "That suggestion is no longer current — check GET /api/content-triggers again.",
        });
      }

      await recordTriggerFired(db as any, studentId, contentType, result.detection);

      let draftId: number | null = null;
      const coachingPrompt = coachingPromptFor(contentType, result.detection);
      if (contentType === "post" || contentType === "article") {
        const draft = await artifactStore.createContentDraft({
          userId: req.user!.id,
          draftType: contentType,
          content: {
            kind: "coaching_scaffold",
            coachingPrompt,
            material: { reason: result.detection.reason, triggerSource: result.detection.triggerSource },
          },
        });
        // A freshly-inserted row always has an id; the column type only reads
        // nullable because drizzle's `.returning()` typing doesn't narrow
        // `generatedAlwaysAsIdentity()` the way `id()`'s own `.primaryKey()`
        // intends. Same non-null-assertion convention `req.user!.id` already
        // uses elsewhere in this codebase for a guarantee TS can't see.
        const newDraftId: number = draft.id!;
        await recordDraftStarted(db as any, studentId, contentType, newDraftId);
        draftId = newDraftId;
      }

      log(`content trigger accepted (${contentType}) for student ${studentId}`, "content-triggers");
      res.json({ recorded: true, contentType, draftId, coachingPrompt });
    } catch (error) {
      next(error);
    }
  });

  /** The student turns down a suggestion Wing surfaced. */
  app.post("/api/content-triggers/decline", isAuthenticated, async (req, res, next) => {
    try {
      const studentId = await requireStudent(req, res);
      if (!studentId) return;

      const contentType = req.body?.contentType;
      if (!isContentType(contentType)) {
        return res.status(400).json({ error: "contentType must be comment, post, or article" });
      }

      const result = await routeContentTrigger(db as any, studentId);
      if (!result.fires || result.contentType !== contentType || !result.detection) {
        return res.status(409).json({
          error: "That suggestion is no longer current — check GET /api/content-triggers again.",
        });
      }

      await recordTriggerDeclined(db as any, studentId, contentType, result.detection.triggerSource);

      log(`content trigger declined (${contentType}) for student ${studentId}`, "content-triggers");
      res.json({ recorded: true, contentType });
    } catch (error) {
      next(error);
    }
  });

  /**
   * H-626's explicit-request override: the student asks Wing to help write a
   * post or article regardless of whether anything was surfaced on its own.
   * Not comment — H-620 defines no explicit-ask signal (see
   * `requestContentTrigger`'s own doc comment).
   */
  app.post("/api/content-triggers/request", isAuthenticated, async (req, res, next) => {
    try {
      const studentId = await requireStudent(req, res);
      if (!studentId) return;

      const contentType = req.body?.contentType;
      if (contentType !== "post" && contentType !== "article") {
        return res.status(400).json({
          error: "contentType must be post or article — comment has no explicit-request signal",
        });
      }

      const result = await requestContentTrigger(db as any, studentId, contentType);
      if (!result.fires || !result.detection) {
        return res.status(409).json({ error: result.reason });
      }

      await recordTriggerFired(db as any, studentId, contentType, result.detection);

      const coachingPrompt = coachingPromptFor(contentType, result.detection);
      const draft = await artifactStore.createContentDraft({
        userId: req.user!.id,
        draftType: contentType,
        content: {
          kind: "coaching_scaffold",
          coachingPrompt,
          material: { reason: result.detection.reason, triggerSource: result.detection.triggerSource },
        },
      });
      await recordDraftStarted(db as any, studentId, contentType, draft.id);

      log(`content trigger explicitly requested (${contentType}) for student ${studentId}`, "content-triggers");
      res.json({ recorded: true, contentType, draftId: draft.id, coachingPrompt });
    } catch (error) {
      next(error);
    }
  });
}
