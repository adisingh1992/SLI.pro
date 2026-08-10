import { Express, Request, Response, NextFunction } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "./db";
import { messageTemplates } from "@shared/wing-schema";
import {
  TEMPLATE_CATALOGUE,
  previewWith,
  specFor,
  validateTemplate,
} from "./wing/template-catalogue";
import * as messaging from "./wing/messaging-store";
import { log } from "./logger";

/**
 * Message template editor API (Feature List B3).
 *
 * Wing's voice is governed by a document Danielle owns. Changing a sentence
 * should not require an engineer, a deploy, or a release window — the same
 * principle already applied to heuristics, completion criteria, analysis
 * methodology and objectives.
 *
 * ── RETIRE, NEVER EDIT ───────────────────────────────────────────────────
 * Publishing writes a new version and deactivates the old one; it never
 * mutates a row. `message_events` records which version a student received, so
 * an email sent last month has to stay explicable by the copy that was live
 * when it went out. Editing in place would silently rewrite history and make
 * the audit trail lie.
 *
 * ── VALIDATION IS ADVISORY, NOT A GATE ───────────────────────────────────
 * Errors are reported and publishing is still allowed. The catalogue is
 * hand-maintained and will drift behind the code; a stale entry must not be
 * able to block a copy fix. The one thing that IS refused is an empty body,
 * because that has no defensible reading.
 */

const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated() && req.user?.isAdmin) return next();
  res.status(403).json({ error: "Admin access required" });
};

export function registerTemplateRoutes(app: Express) {
  /**
   * Everything the list screen needs: the catalogue joined to whatever is
   * currently live, including templates that exist in code but have never been
   * seeded — those are the interesting ones, because they send nothing.
   */
  app.get("/api/admin/templates", isAdmin, async (_req, res, next) => {
    try {
      const rows = await db
        .select()
        .from(messageTemplates)
        .where(eq(messageTemplates.active, true));

      const byKey = new Map(rows.map((r) => [`${r.templateKey}:${r.channel}`, r]));

      const templates = TEMPLATE_CATALOGUE.map((spec) => {
        const live = byKey.get(`${spec.templateKey}:email`) ?? null;
        return {
          ...spec,
          channel: "email" as const,
          id: live?.id ?? null,
          version: live?.version ?? null,
          subjectTemplate: live?.subjectTemplate ?? null,
          bodyTemplate: live?.bodyTemplate ?? null,
          // A catalogue entry with nothing live means a send path exists whose
          // template was never seeded — sendTemplated logs "no active template"
          // and delivers nothing. Worth surfacing rather than showing a blank.
          seeded: !!live,
        };
      });

      // Anything live that the catalogue doesn't know about. Not an error —
      // the catalogue is hand-maintained — but it should be visible rather
      // than silently uneditable.
      const uncatalogued = rows
        .filter((r) => !specFor(r.templateKey))
        .map((r) => ({ templateKey: r.templateKey, channel: r.channel, version: r.version }));

      res.json({ templates, uncatalogued });
    } catch (error) {
      next(error);
    }
  });

  /** One template: what's live, plus every retired version. */
  app.get("/api/admin/templates/:templateKey", isAdmin, async (req, res, next) => {
    try {
      const { templateKey } = req.params;

      const versions = await db
        .select()
        .from(messageTemplates)
        .where(
          and(
            eq(messageTemplates.templateKey, templateKey),
            eq(messageTemplates.channel, "email" as any),
          ),
        )
        .orderBy(desc(messageTemplates.version));

      res.json({
        spec: specFor(templateKey),
        live: versions.find((v) => v.active) ?? null,
        versions,
      });
    } catch (error) {
      next(error);
    }
  });

  /** Validation and preview without writing anything. */
  app.post("/api/admin/templates/:templateKey/preview", isAdmin, async (req, res, next) => {
    try {
      const { templateKey } = req.params;
      const { subject, body } = req.body ?? {};

      res.json({
        issues: validateTemplate(templateKey, subject ?? null, String(body ?? "")),
        preview: {
          subject: previewWith(templateKey, String(subject ?? "")),
          body: previewWith(templateKey, String(body ?? "")),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  /** Publishes a new version and retires the current one. */
  app.post("/api/admin/templates/:templateKey", isAdmin, async (req, res, next) => {
    try {
      const { templateKey } = req.params;
      const subject: string | null = req.body?.subject ?? null;
      const body: string = String(req.body?.body ?? "");

      if (!body.trim()) {
        return res.status(400).json({ error: "The body cannot be empty." });
      }

      const [current] = await db
        .select()
        .from(messageTemplates)
        .where(
          and(
            eq(messageTemplates.templateKey, templateKey),
            eq(messageTemplates.channel, "email" as any),
            eq(messageTemplates.active, true),
          ),
        )
        .limit(1);

      if (current && current.bodyTemplate === body && current.subjectTemplate === subject) {
        // No new version for an unchanged save. Version numbers should mean
        // "the copy changed", not "someone opened the editor".
        return res.json({ published: false, reason: "unchanged", version: current.version });
      }

      // The highest version ever used, not the active one — otherwise reverting
      // to v1 and editing would collide with the existing v2 on the unique
      // (key, channel, version) index.
      const [highest] = await db
        .select({ version: messageTemplates.version })
        .from(messageTemplates)
        .where(
          and(
            eq(messageTemplates.templateKey, templateKey),
            eq(messageTemplates.channel, "email" as any),
          ),
        )
        .orderBy(desc(messageTemplates.version))
        .limit(1);

      if (current) {
        await db
          .update(messageTemplates)
          .set({ active: false })
          .where(eq(messageTemplates.id, current.id));
      }

      const [created] = await db
        .insert(messageTemplates)
        .values({
          templateKey,
          channel: "email" as any,
          subjectTemplate: subject,
          bodyTemplate: body,
          version: (highest?.version ?? 0) + 1,
          active: true,
        })
        .returning();

      log(`template ${templateKey} published as v${created.version}`, "templates");
      res.json({ published: true, version: created.version, id: created.id });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Restores an old version by publishing its content as a NEW version.
   *
   * Not by flipping `active` back — that would leave a gap in the version
   * history where the current copy used to be, and a message sent under the
   * newer version would no longer be explicable.
   */
  app.post("/api/admin/templates/:templateKey/revert/:versionId", isAdmin, async (req, res, next) => {
    try {
      const { templateKey } = req.params;
      const versionId = parseInt(req.params.versionId, 10);
      if (Number.isNaN(versionId)) return res.status(400).json({ error: "Invalid version id" });

      const [old] = await db
        .select()
        .from(messageTemplates)
        .where(eq(messageTemplates.id, versionId))
        .limit(1);

      if (!old || old.templateKey !== templateKey) {
        return res.status(404).json({ error: "That version does not belong to this template" });
      }

      const [highest] = await db
        .select({ version: messageTemplates.version })
        .from(messageTemplates)
        .where(
          and(
            eq(messageTemplates.templateKey, templateKey),
            eq(messageTemplates.channel, old.channel),
          ),
        )
        .orderBy(desc(messageTemplates.version))
        .limit(1);

      await db
        .update(messageTemplates)
        .set({ active: false })
        .where(
          and(
            eq(messageTemplates.templateKey, templateKey),
            eq(messageTemplates.channel, old.channel),
            eq(messageTemplates.active, true),
          ),
        );

      const [created] = await db
        .insert(messageTemplates)
        .values({
          templateKey,
          channel: old.channel,
          subjectTemplate: old.subjectTemplate,
          bodyTemplate: old.bodyTemplate,
          version: (highest?.version ?? 0) + 1,
          active: true,
        })
        .returning();

      log(`template ${templateKey} reverted to v${old.version}, published as v${created.version}`, "templates");
      res.json({ published: true, version: created.version, revertedFrom: old.version });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Sends the live template to one address using the catalogue's sample values.
   *
   * The preview shows what the copy says; this shows what actually arrives —
   * subject line rendering, the newline-to-<br> conversion, and how the client
   * displays it. Those are exactly the things a textarea cannot tell you.
   */
  app.post("/api/admin/templates/:templateKey/test-send", isAdmin, async (req, res, next) => {
    try {
      const { templateKey } = req.params;
      const to: string = String(req.body?.to ?? "").trim();

      if (!to || !to.includes("@")) {
        return res.status(400).json({ error: "A recipient email address is required." });
      }

      const spec = specFor(templateKey);
      const vars = Object.fromEntries((spec?.variables ?? []).map((v) => [v.name, v.sample]));

      const result = await messaging.sendTemplated({
        // No studentId: a test send must not appear in a real student's message
        // history, where it would look like something they received and could
        // suppress a genuine send through alreadySent().
        to,
        templateKey,
        vars,
      });

      if (!result.sent) {
        return res.status(502).json({ error: "Not sent", detail: result.reason });
      }

      log(`test send of ${templateKey} to ${to}`, "templates");
      res.json({ sent: true });
    } catch (error) {
      next(error);
    }
  });
}
