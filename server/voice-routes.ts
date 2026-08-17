import { Express } from "express";
import { count, desc, eq } from "drizzle-orm";
import { db } from "./db";
import {
  institutions,
  schoolCycles,
  voiceProfiles,
  voiceProfileComponents,
} from "@shared/wing-schema";
import * as voiceStore from "./wing/voice-store";
import { evaluationWindowState } from "./wing/evaluation-window";
import { NOT_RENDERED, UNSTATED } from "./wing/voice-source";
import { isPlatformAdmin } from "./admin-guards";
import { log } from "./logger";

/**
 * The voice surface — reviewing a transcription of the Voice Guide, and switching
 * it on.
 *
 * ── WHY THIS NEEDS A SCREEN AT ALL ───────────────────────────────────────
 * `wing:seed-voice` writes 54 records transcribed from two governing documents
 * that Danielle wrote. Publishing them was two function calls in a store, which
 * means the only way to switch Wing's voice on was for an engineer to run code —
 * and the only way to check the transcription was to read a TypeScript file.
 * Both of those are the wrong person doing the wrong job. The author of the voice
 * should be able to read what the platform believes her voice is, and say yes.
 *
 * ── THE SAME TWO SWITCHES, AND THE SAME WINDOW GATE ──────────────────────
 * A profile has to be `published` and a cycle has to point at it. And pointing a
 * cycle at one is gated by the evaluation window exactly as publishing a
 * heuristic sequence is: this text is the opening of every reply Wing composes,
 * so changing it under students who are partway through a cycle is the same kind
 * of change the window exists to prevent. Override needs a written reason and it
 * is logged.
 *
 * PLATFORM STAFF ONLY. This is the methodology engine, and the content is
 * editorial rather than student data — no scoping question arises.
 */

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

type StoredContent = { key?: unknown; short?: unknown; full?: unknown };

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function registerVoiceRoutes(app: Express) {
  /**
   * Every voice profile, with what points at it.
   *
   * `cycles` is the part that matters: a profile's status says whether it COULD
   * be live and the pointer says whether it IS. Showing status alone reproduced
   * the confusion the integrity screen had to fix for sequences, where a
   * published-but-unpointed version read as in force.
   */
  app.get("/api/admin/voice-profiles", isPlatformAdmin, async (_req, res, next) => {
    try {
      const profiles = await db
        .select({
          id: voiceProfiles.id,
          name: voiceProfiles.name,
          versionNumber: voiceProfiles.versionNumber,
          status: voiceProfiles.status,
          notes: voiceProfiles.notes,
          createdAt: voiceProfiles.createdAt,
          publishedAt: voiceProfiles.publishedAt,
          supersededAt: voiceProfiles.supersededAt,
        })
        .from(voiceProfiles)
        .orderBy(desc(voiceProfiles.versionNumber));

      const counts = await db
        .select({
          voiceProfileId: voiceProfileComponents.voiceProfileId,
          n: count(),
        })
        .from(voiceProfileComponents)
        .where(eq(voiceProfileComponents.isCurrent, true))
        .groupBy(voiceProfileComponents.voiceProfileId);

      const byProfile = new Map(counts.map((c) => [c.voiceProfileId, Number(c.n)]));

      const pointers = await db
        .select({
          cycleId: schoolCycles.id,
          label: schoolCycles.label,
          cycleYear: schoolCycles.cycleYear,
          voiceProfileId: schoolCycles.voiceProfileId,
          institutionName: institutions.name,
        })
        .from(schoolCycles)
        .innerJoin(institutions, eq(institutions.id, schoolCycles.institutionId));

      res.json({
        profiles: profiles.map((p) => ({
          ...p,
          componentCount: byProfile.get(p.id) ?? 0,
          cycles: pointers
            .filter((c) => c.voiceProfileId === p.id)
            .map((c) => ({
              cycleId: c.cycleId,
              label: c.label ?? String(c.cycleYear),
              institutionName: c.institutionName,
            })),
        })),
        cycles: pointers.map((c) => ({
          cycleId: c.cycleId,
          label: c.label ?? String(c.cycleYear),
          institutionName: c.institutionName,
          voiceProfileId: c.voiceProfileId,
        })),
        /*
         * What the two source documents do not state, carried from
         * voice-source.ts rather than restated here. These are questions for the
         * author of the documents, and a review screen that hid them would be
         * asking her to approve a transcription without showing her its holes.
         */
        unstated: UNSTATED.map((u) => ({ what: u.what, why: u.why })),
        /*
         * Instructions that exist in the methodology and reach no model. Kept
         * separate from `unstated` because the fix is ours, not the author's.
         */
        notRendered: NOT_RENDERED.map((u) => ({ what: u.what, why: u.why })),
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * One profile's components, in full.
   *
   * `full` is the governing document's own wording and `short` is the line that
   * actually reaches a prompt. Both are returned, because the review question is
   * precisely whether the second is a fair reduction of the first.
   */
  app.get("/api/admin/voice-profiles/:id", isPlatformAdmin, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid voice profile id" });

      const [profile] = await db
        .select()
        .from(voiceProfiles)
        .where(eq(voiceProfiles.id, id))
        .limit(1);
      if (!profile) return res.status(404).json({ error: "Voice profile not found" });

      const rows = await db
        .select({
          id: voiceProfileComponents.id,
          componentType: voiceProfileComponents.componentType,
          context: voiceProfileComponents.context,
          content: voiceProfileComponents.content,
          isCurrent: voiceProfileComponents.isCurrent,
        })
        .from(voiceProfileComponents)
        .where(eq(voiceProfileComponents.voiceProfileId, id))
        .orderBy(voiceProfileComponents.id);

      const components = rows.map((r) => {
        const content = (r.content ?? {}) as StoredContent;
        return {
          id: r.id,
          componentType: r.componentType,
          context: r.context,
          isCurrent: r.isCurrent,
          key: str(content.key),
          short: str(content.short),
          full: str(content.full),
        };
      });

      res.json({ profile, components });
    } catch (error) {
      next(error);
    }
  });

  /** Draft → published. Does not put it in front of anybody by itself. */
  app.post("/api/admin/voice-profiles/:id/publish", isPlatformAdmin, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid voice profile id" });

      const [profile] = await db
        .select({
          id: voiceProfiles.id,
          status: voiceProfiles.status,
          versionNumber: voiceProfiles.versionNumber,
        })
        .from(voiceProfiles)
        .where(eq(voiceProfiles.id, id))
        .limit(1);
      if (!profile) return res.status(404).json({ error: "Voice profile not found" });

      if (profile.status === "published") {
        return res.status(409).json({ error: `Version ${profile.versionNumber} is already published` });
      }
      if (profile.status === "retired") {
        return res.status(409).json({
          error: `Version ${profile.versionNumber} is retired`,
          remedy: "Seed a new version rather than reviving a retired one.",
        });
      }

      const [{ n }] = await db
        .select({ n: count() })
        .from(voiceProfileComponents)
        .where(eq(voiceProfileComponents.voiceProfileId, id));

      // An empty profile compiles to nothing, so publishing one is the voice
      // equivalent of pointing a cycle at an empty sequence: it reads as done and
      // changes nothing.
      if (!Number(n)) {
        return res.status(409).json({
          error: `Version ${profile.versionNumber} has no components`,
          detail: "It would compile to an empty section, which renders as no voice at all.",
        });
      }

      const ok = await voiceStore.publishVoiceProfile(id);
      if (!ok) return res.status(404).json({ error: "Voice profile not found" });

      log(`voice profile #${id} published by user ${req.user!.id}`, "voice");
      res.json({ id, status: "published" });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Points a cycle at a voice profile, or clears the pointer.
   *
   * Clearing is allowed and is the rollback: the cohort returns to the voice the
   * prompt files carry, which is what every student has today.
   */
  app.put("/api/admin/cycles/:id/voice-profile", isPlatformAdmin, async (req, res, next) => {
    try {
      const cycleId = parseId(req.params.id);
      if (!cycleId) return res.status(400).json({ error: "Invalid cycle id" });

      const { profileId, force, reason } = req.body ?? {};
      const target =
        profileId === null || profileId === undefined ? null : Number(profileId);
      if (target !== null && (!Number.isInteger(target) || target < 1)) {
        return res.status(400).json({ error: "profileId must be a positive integer or null" });
      }

      const [cycle] = await db
        .select()
        .from(schoolCycles)
        .where(eq(schoolCycles.id, cycleId))
        .limit(1);
      if (!cycle) return res.status(404).json({ error: "Cycle not found" });

      if (target !== null) {
        const [profile] = await db
          .select({
            id: voiceProfiles.id,
            status: voiceProfiles.status,
            versionNumber: voiceProfiles.versionNumber,
            supersededAt: voiceProfiles.supersededAt,
          })
          .from(voiceProfiles)
          .where(eq(voiceProfiles.id, target))
          .limit(1);
        if (!profile) return res.status(404).json({ error: "Voice profile not found" });

        /*
         * Refused rather than allowed-and-inert. The store only renders a
         * published profile, so pointing a cycle at a draft would leave a screen
         * showing a cohort with a voice profile and an engine rendering none —
         * the same trap as the empty published sequence, and it took a screenshot
         * to find that one.
         */
        if (profile.status !== "published") {
          return res.status(409).json({
            error: `Version ${profile.versionNumber} is a ${profile.status}`,
            detail:
              "Only a published profile is read at turn time, so this pointer would have no effect.",
            remedy: "Publish the profile first, then point the cycle at it.",
          });
        }
        if (profile.supersededAt) {
          return res.status(409).json({
            error: `Version ${profile.versionNumber} has been superseded`,
            remedy: "Point the cycle at the current published version.",
          });
        }
      }

      const window = evaluationWindowState(cycle as any);
      if (!window.open && force !== true) {
        return res.status(409).json({
          error: "Methodology changes belong in the evaluation window",
          detail: window.reason,
          remedy:
            "Wing's voice is the opening of every reply, so changing it mid-cycle changes the " +
            "programme under students who are partway through. To override, resend with " +
            "force: true and a reason.",
        });
      }
      if (!window.open && force === true) {
        if (typeof reason !== "string" || reason.trim().length < 10) {
          return res.status(400).json({
            error: "An override requires a reason of at least 10 characters",
          });
        }
        log(
          `MID-CYCLE OVERRIDE: cycle ${cycleId} voice profile -> ${target ?? "none"} by user ` +
            `${req.user!.id} outside the evaluation window. Reason: ${reason.trim()}`,
          "voice",
        );
      }

      const ok = await voiceStore.pointCycleAtVoiceProfile(cycleId, target);
      if (!ok) return res.status(404).json({ error: "Cycle not found" });

      log(
        `cycle ${cycleId} voice profile -> ${target ?? "none"} by user ${req.user!.id}`,
        "voice",
      );
      res.json({ cycleId, voiceProfileId: target });
    } catch (error) {
      next(error);
    }
  });
}
