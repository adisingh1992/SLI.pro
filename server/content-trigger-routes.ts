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
import { radarEligibility } from "./wing/baby-radar";
import { buildArticleImagePrompt } from "./wing/article-image-prompt";
import * as orchestrator from "./orchestrator";
import { ImageGenerationBlockedError } from "./orchestrator";


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
 *
 * ── PHASE 5, ADDED 2 SEP 2026: THE ARTICLE HEADER-IMAGE ROUTE ────────────────
 * `POST .../drafts/:draftId/generate-image` (IG-M6-01 / Spec 4) generates an
 * article header image via MAI-Image-2.5-Flash — Aditya's direction to use
 * that model instead of the spec's own "DALL-E," on the same Azure resource
 * as sol/terra/luna. See that route's own doc comment for why it's the only
 * new endpoint the whole image flow needed (accept/decline/provide-your-own
 * all fall out of the publish endpoint's existing, unmodified `imageBase64`
 * field, shipped the same day this file was).
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

  /**
   * IG-M6-01 (Article Image Generation) — a header image for an article draft
   * already in progress, via MAI-Image-2.5-Flash (`orchestrator.generateImage`;
   * Aditya's 2 Sep 2026 substitution for the spec's own "DALL-E," same Azure
   * resource as sol/terra/luna — see that function's own header for why).
   *
   * ── WHY THIS TAKES `draftText` IN THE REQUEST RATHER THAN READING THE ROW ──
   * `content_drafts.content` only ever holds the coaching-scaffold seed this
   * file writes at accept/request time (H-615 — Wing never stores the
   * student's own prose as a draft the student didn't ask it to save; the
   * text the student is actually writing lives in the client's own state,
   * same as `write-something.tsx`'s `draftText`, until Publish). IG-IMG-02
   * needs the image to relate to the REAL topic, and the real topic is
   * whatever the student has written so far — so the client sends its
   * current textarea contents, and this only ever uses them to build a
   * prompt, never persists them.
   *
   * ── WHY THIS IS THE ONLY NEW ROUTE FOR THE WHOLE IMAGE FLOW ─────────────
   * IG-IMG-03 requires the student's explicit approval before anything
   * publishes with an image attached. That's already enforced structurally:
   * `POST /api/linkedin-content-drafts/:draftId/post` only attaches an image
   * when the request includes `imageBase64` — nothing auto-attaches a
   * generated image. So "accept" is simply the client choosing to send the
   * base64 this route returned at publish time, and "decline" is the client
   * not doing that — no separate accept/decline endpoint needed, and no
   * server-side "approved" state to go stale. "Provide your own image"
   * (option c) is the same `imageBase64` field with bytes from the
   * student's own upload instead of this route — also nothing new. Only
   * generation itself needed a route.
   *
   * ── WHY FAILURE COUNTING LIVES HERE, NOT IN THE ORCHESTRATOR ────────────
   * IG-IMG-01: "After 2 failed generations, Wing offers: 'I'm having trouble
   * generating an image that works for this topic. You can provide your
   * own, or I can try a more abstract approach.'" That count is per-draft
   * state across separate HTTP requests, which `orchestrator.generateImage`
   * (a stateless function) has no way to know about — so it's tracked here,
   * in `content_drafts.content.image.failedAttempts`, via
   * `artifactStore.updateContentDraftContent`. Only a content-filter block
   * counts as "a failed generation" in the card's sense (a misconfigured
   * deployment or a transient 5xx is a different problem and doesn't count,
   * doesn't get shown to the student as "trouble with this topic," and
   * 500s normally via `next(error)`). A successful generation resets the
   * counter — three good images in a row after two earlier misses is not
   * "still in trouble."
   */
  app.post(
    "/api/content-triggers/drafts/:draftId/generate-image",
    isAuthenticated,
    async (req, res, next) => {
      try {
        const studentId = await requireStudent(req, res);
        if (!studentId) return;

        const draftId = parseInt(req.params.draftId, 10);
        if (Number.isNaN(draftId)) {
          return res.status(400).json({ error: "Invalid draft ID" });
        }

        const draftText = typeof req.body?.draftText === "string" ? req.body.draftText.trim() : "";
        if (!draftText) {
          return res.status(400).json({ error: "draftText is required — there is nothing to draw yet" });
        }
        const direction =
          typeof req.body?.direction === "string" && req.body.direction.trim()
            ? req.body.direction.trim()
            : undefined;

        const draft = await artifactStore.getContentDraft(draftId);
        if (!draft || draft.studentId !== studentId) {
          return res.status(403).json({ error: "Not authorized to access this content draft" });
        }
        if (draft.draftType !== "article") {
          return res.status(400).json({
            error: "Header images are for articles (IG-M6-01) — this draft is a " + draft.draftType,
          });
        }

        const existingContent = (draft.content ?? {}) as Record<string, any>;
        const priorAttempts: number = existingContent.image?.failedAttempts ?? 0;

        const eligibility = await radarEligibility(db as any, studentId);
        const functionArea = eligibility.primaryFunction ?? eligibility.topicArea;

        const prompt = buildArticleImagePrompt({ draftExcerpt: draftText, functionArea, direction });

        try {
          const { imageBuffer, model } = await orchestrator.generateImage({ prompt });

          await artifactStore.updateContentDraftContent(draftId, {
            ...existingContent,
            image: { lastPromptUsed: prompt, failedAttempts: 0 },
          });

          log(`article header image generated (model ${model}) for draft ${draftId}`, "content-triggers");
          res.json({
            generated: true,
            imageBase64: imageBuffer.toString("base64"),
            promptUsed: prompt,
          });
        } catch (err) {
          if (err instanceof ImageGenerationBlockedError) {
            const failedAttempts = priorAttempts + 1;
            await artifactStore.updateContentDraftContent(draftId, {
              ...existingContent,
              image: { lastPromptUsed: prompt, failedAttempts },
            });

            log(
              `article header image blocked (attempt ${failedAttempts}) for draft ${draftId}: ${err.message}`,
              "content-triggers",
            );
            return res.json({
              generated: false,
              blocked: true,
              failedAttempts,
              // IG-IMG-01's own scripted line, offered once 2 attempts have failed.
              fallbackMessage:
                failedAttempts >= 2
                  ? "I'm having trouble generating an image that works for this topic. You can provide your own, or I can try a more abstract approach."
                  : null,
            });
          }
          throw err;
        }
      } catch (error) {
        next(error);
      }
    },
  );
}
