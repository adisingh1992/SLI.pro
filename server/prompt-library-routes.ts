import { Express, Request, Response } from "express";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import { promptLibrary, promptOpeners } from "@shared/wing-schema";
import {
  blocking,
  placeholdersIn,
  reachability,
  validateOpener,
  validatePrompt,
  AUDIENCE_SCOPES,
  CADENCES,
  EVIDENCE_TIERS,
  LIBRARIES,
  OPENER_POOLS,
  SIGNAL_CATEGORIES,
  STUDENT_SHAPES,
  type OpenerDraft,
  type PromptDraft,
} from "./wing/prompt-library-edit";
import { METHODOLOGY_POPULATIONS } from "./wing/population-tags";
import { renderOpener, type Opener } from "./wing/opener";
import { log } from "./logger";
import { isAdmin } from "./admin-guards";

/**
 * The prompt library editor API (Feature List B2).
 *
 * "Prompt library configurable without code changes."
 *
 * Until now the only way to change a prompt was to edit `seed-microjournal-prompts.ts`
 * and re-run the seeder, which is a deploy. Danielle owns this material — the
 * micro-journal library, the heartbeat tracks and the opener pool are all hers — and the
 * same argument that gave her the heuristics, the completion criteria, the analysis
 * methodology and the message templates applies here.
 *
 * ── RETIRE AND SUPERSEDE, NEVER UPDATE ───────────────────────────────────
 * The same rule as `template-routes.ts`, for a sharper reason. A message template is
 * versioned by key and `message_events` records the version. A prompt is a ROW, and
 * `life_log_entries.prompt_id` is a foreign key to it — so a student's entry is stored
 * as an answer to that row. Editing it in place re-files every past answer under a
 * question that was never asked.
 *
 * So an edit deactivates the old row and inserts a successor carrying `supersedes_id`.
 * The selection path already reads `active = true`, so the retired row leaves the pool
 * at once and the old foreign keys still resolve to the words that were sent.
 *
 * ── AND SAVING TELLS YOU WHETHER IT CAN EVER BE SENT ─────────────────────
 * This is the part a template editor does not need. A prompt enters a pool and is drawn
 * from it, so a prompt that fails a selection filter is not rejected anywhere — it
 * simply never comes up, for anybody, with nothing logged. Every write and the preview
 * return `reachability`, which runs the real `eligible()` against every population a
 * student can resolve to and says who could receive this.
 *
 * ── WHAT REFUSES A SAVE ──────────────────────────────────────────────────
 * Only `prompt-library-edit.ts`'s errors: empty text, a value outside a fixed
 * vocabulary, a population tag nothing resolves to, an opener that would send a literal
 * `[Name]`. Warnings — a null cadence, a null signal category, an event-sensitive prompt
 * — are returned and the save proceeds, because most of the seeded library is
 * legitimately in those states and an editor that refused them is an editor she could
 * not use on her own material.
 */

/* ── Reading a draft off the request ──────────────────────────────────── */

const str = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
};

const strArray = (v: unknown): string[] =>
  Array.isArray(v)
    ? Array.from(new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean)))
    : [];

function promptDraftFrom(body: any): PromptDraft {
  const tier = Number(body?.evidenceTier);
  return {
    promptText: String(body?.promptText ?? "").trim(),
    category: str(body?.category),
    populationTags: strArray(body?.populationTags),
    promptCode: str(body?.promptCode),
    behavioralSignal: str(body?.behavioralSignal),
    signalCategory: str(body?.signalCategory),
    evidenceTier: Number.isFinite(tier) && tier > 0 ? tier : null,
    audienceScope: str(body?.audienceScope),
    cadence: str(body?.cadence),
    deliveryMarker: str(body?.deliveryMarker),
    library: str(body?.library),
    eventSensitive: body?.eventSensitive === true,
  };
}

/**
 * Who gets credit for a tier or a category on a successor row.
 *
 * A person typed or selected this value into the editor, so a changed field is
 * `'danielle'` provenance from here on — the review screen exists so an admin's read of a
 * proposal counts as the review, not as another proposal layered on top of the last one.
 * An unchanged field carries its provenance forward unexamined: opening the editor and
 * saving without touching the tier is not the same act as looking at the tier and
 * agreeing with it, and this file cannot tell those apart, so it does not claim to.
 */
function humanProvenance(
  changed: boolean,
  carryBecause: string | null,
  carrySource: string | null,
): { because: string | null; source: string | null } {
  return changed ? { because: null, source: "danielle" } : { because: carryBecause, source: carrySource };
}

function openerDraftFrom(body: any): OpenerDraft {
  const text = String(body?.text ?? "").trim();
  return {
    pool: String(body?.pool ?? "").trim(),
    text,
    /*
     * Declared placeholders default to the ones actually in the text.
     *
     * The two lists disagreeing is the defect `validateOpener` exists to catch, and the
     * commonest way to produce it is a UI that edits the text and forgets the list.
     * Deriving the default means the honest answer is what you get unless you
     * deliberately say otherwise — and if you do say otherwise and are wrong, the
     * validator still refuses.
     */
    placeholders: body?.placeholders === undefined ? placeholdersIn(text) : strArray(body?.placeholders),
  };
}

/* ── Routes ───────────────────────────────────────────────────────────── */

export function registerPromptLibraryRoutes(app: Express) {
  /**
   * The vocabularies, so the editor's dropdowns come from the same constants the
   * validator enforces.
   *
   * Served rather than duplicated in the client on purpose: a hand-copied list is how a
   * screen ends up offering an option the server rejects, or — worse — omitting one and
   * quietly making part of the library uneditable.
   */
  app.get("/api/admin/prompt-library/vocabulary", isAdmin, (_req: Request, res: Response) => {
    res.json({
      signalCategories: SIGNAL_CATEGORIES,
      cadences: CADENCES,
      libraries: LIBRARIES,
      audienceScopes: AUDIENCE_SCOPES,
      evidenceTiers: EVIDENCE_TIERS,
      populationTags: METHODOLOGY_POPULATIONS,
      openerPools: OPENER_POOLS,
      studentShapes: STUDENT_SHAPES,
    });
  });

  /**
   * The list screen: every live prompt, plus the counts that say whether the library is
   * in a state the selection engine can work with.
   *
   * The counts are the point. A cadence with no prompts is a rhythm that sends nothing,
   * and today that is true of two of the three — which is invisible on a screen that
   * only lists rows.
   */
  app.get("/api/admin/prompt-library", isAdmin, async (req: Request, res: Response) => {
    try {
      const includeRetired = req.query.retired === "true";

      const rows = await db
        .select()
        .from(promptLibrary)
        .where(includeRetired ? sql`true` : eq(promptLibrary.active, true))
        .orderBy(
          asc(promptLibrary.cadence),
          asc(promptLibrary.audienceScope),
          asc(promptLibrary.id),
        );

      const live = rows.filter((r) => r.active);

      const tally = (pick: (r: (typeof rows)[number]) => string | null) => {
        const out: Record<string, number> = {};
        for (const r of live) out[pick(r) ?? "(none)"] = (out[pick(r) ?? "(none)"] ?? 0) + 1;
        return out;
      };

      res.json({
        prompts: rows,
        counts: {
          live: live.length,
          retired: rows.length - live.length,
          byCadence: tally((r) => r.cadence),
          byLibrary: tally((r) => r.library),
          byAudienceScope: tally((r) => r.audienceScope),
          bySignalCategory: tally((r) => r.signalCategory),
          /*
           * The one that is a problem rather than a statistic. A live prompt with no
           * cadence is in no pool; `reachability` says so per prompt, and this says how
           * many of them there are without opening each one.
           */
          liveButUnreachable: live.filter((r) => !r.cadence).length,
          eventSensitive: live.filter((r) => r.eventSensitive).length,
          /*
           * The review queue. 'rule_engine' and 'claude_review' are proposals —
           * see migration 0039 — not a person's answer, so a row carrying either
           * source (or a tier/category with no source at all, from before this pass
           * existed) still needs a look. 'danielle' means the review screen itself
           * produced the value, which is the one state that does not need a second
           * look for the same reason.
           */
          tierBySource: tally((r) => (r.evidenceTier === null ? null : r.evidenceTierSource)),
          categoryBySource: tally((r) => (r.signalCategory === null ? null : r.signalCategorySource)),
          needsReview: live.filter(
            (r) =>
              (r.evidenceTier !== null && r.evidenceTierSource !== "danielle") ||
              (r.signalCategory !== null && r.signalCategorySource !== "danielle"),
          ).length,
        },
      });
    } catch (err) {
      log(`prompt library list failed: ${(err as Error).message}`, "prompts");
      res.status(500).json({ error: "Failed to read the prompt library" });
    }
  });

  /** One prompt, its reachability, and everything it was edited from. */
  app.get("/api/admin/prompt-library/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid prompt id" });

      const [row] = await db.select().from(promptLibrary).where(eq(promptLibrary.id, id)).limit(1);
      if (!row) return res.status(404).json({ error: "No such prompt" });

      /*
       * The ancestry, walked rather than joined. A prompt edited four times is four rows
       * in a chain and the depth is not known in advance; a bounded walk is honest about
       * that where a single join would silently show one generation.
       */
      const lineage: typeof row[] = [];
      let cursor: number | null = (row as any).supersedesId ?? null;
      for (let i = 0; i < 50 && cursor !== null; i++) {
        const [prev] = await db
          .select()
          .from(promptLibrary)
          .where(eq(promptLibrary.id, cursor))
          .limit(1);
        if (!prev) break;
        lineage.push(prev);
        cursor = (prev as any).supersedesId ?? null;
      }

      const draft = promptDraftFrom(row);
      res.json({
        prompt: row,
        lineage,
        issues: validatePrompt(draft),
        reachability: reachability(draft, row.active),
      });
    } catch (err) {
      log(`prompt read failed: ${(err as Error).message}`, "prompts");
      res.status(500).json({ error: "Failed to read the prompt" });
    }
  });

  /**
   * Validation and reachability with nothing written.
   *
   * The preview a prompt needs is not "what does it look like" — it is one sentence and
   * you can read it. It is "would this ever be sent, and to whom", which is the thing
   * you cannot see by looking.
   */
  app.post("/api/admin/prompt-library/preview", isAdmin, (req: Request, res: Response) => {
    const draft = promptDraftFrom(req.body);
    res.json({
      issues: validatePrompt(draft),
      reachability: reachability(draft, true),
    });
  });

  /** A new prompt. */
  app.post("/api/admin/prompt-library", isAdmin, async (req: Request, res: Response) => {
    try {
      const draft = promptDraftFrom(req.body);
      const issues = validatePrompt(draft);
      if (blocking(issues)) return res.status(400).json({ error: "Not saved", issues });

      const [created] = await db
        .insert(promptLibrary)
        .values({
          promptText: draft.promptText,
          category: (draft.category ?? null) as any,
          populationTags: draft.populationTags as string[],
          promptCode: draft.promptCode,
          behavioralSignal: draft.behavioralSignal,
          signalCategory: draft.signalCategory,
          evidenceTier: draft.evidenceTier,
          /*
           * A value entered through this screen is a person's decision, not a proposal —
           * see `humanProvenance` above. Null when the field was left empty, exactly like
           * every other optional column here.
           */
          evidenceTierSource: draft.evidenceTier === null ? null : "danielle",
          signalCategorySource: draft.signalCategory === null ? null : "danielle",
          audienceScope: draft.audienceScope,
          cadence: draft.cadence,
          deliveryMarker: draft.deliveryMarker,
          library: draft.library,
          eventSensitive: draft.eventSensitive,
          sourceDocument: "admin editor",
          active: true,
        } as any)
        .returning();

      log(`prompt ${created.id} created`, "prompts");
      res.json({ prompt: created, issues, reachability: reachability(draft, true) });
    } catch (err) {
      log(`prompt create failed: ${(err as Error).message}`, "prompts");
      res.status(500).json({ error: "Failed to save the prompt" });
    }
  });

  /**
   * An edit: retire the old row, insert its successor.
   *
   * Never an UPDATE. See the header — `life_log_entries.prompt_id` points at the row a
   * student answered, and the entry only means anything alongside the question that was
   * actually asked.
   */
  app.post("/api/admin/prompt-library/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid prompt id" });

      const [current] = await db
        .select()
        .from(promptLibrary)
        .where(eq(promptLibrary.id, id))
        .limit(1);
      if (!current) return res.status(404).json({ error: "No such prompt" });
      if (!current.active) {
        return res.status(409).json({
          error:
            "That prompt is already retired. Edit the live one, or revert to this " +
            "version — either way the successor is a new row.",
        });
      }

      const draft = promptDraftFrom(req.body);
      const issues = validatePrompt(draft);
      if (blocking(issues)) return res.status(400).json({ error: "Not saved", issues });

      const before = promptDraftFrom(current);
      if (JSON.stringify(before) === JSON.stringify(draft)) {
        /*
         * No successor for an unchanged save. A lineage should mean "the prompt changed",
         * not "somebody opened the editor" — the same rule the template editor applies to
         * version numbers, and here it also keeps the ancestry walk short.
         */
        return res.json({ published: false, reason: "unchanged", prompt: current, issues });
      }

      const tierProvenance = humanProvenance(
        draft.evidenceTier !== current.evidenceTier,
        current.evidenceTierBecause,
        current.evidenceTierSource,
      );
      const categoryProvenance = humanProvenance(
        draft.signalCategory !== current.signalCategory,
        current.signalCategoryBecause,
        current.signalCategorySource,
      );

      const [created] = await db.transaction(async (tx) => {
        await tx
          .update(promptLibrary)
          .set({ active: false, updatedAt: new Date() })
          .where(eq(promptLibrary.id, current.id));

        return await tx
          .insert(promptLibrary)
          .values({
            promptText: draft.promptText,
            category: (draft.category ?? null) as any,
            populationTags: draft.populationTags as string[],
            promptCode: draft.promptCode,
            behavioralSignal: draft.behavioralSignal,
            signalCategory: draft.signalCategory,
            evidenceTier: draft.evidenceTier,
            evidenceTierBecause: tierProvenance.because,
            evidenceTierSource: tierProvenance.source,
            signalCategoryBecause: categoryProvenance.because,
            signalCategorySource: categoryProvenance.source,
            audienceScope: draft.audienceScope,
            cadence: draft.cadence,
            deliveryMarker: draft.deliveryMarker,
            library: draft.library,
            eventSensitive: draft.eventSensitive,
            sourceDocument: current.sourceDocument,
            sourceBlock: current.sourceBlock,
            sourceLine: current.sourceLine,
            supersedesId: current.id,
            active: true,
          } as any)
          .returning();
      });

      /*
       * One transaction, and this is the reason.
       *
       * Retiring outside it and failing on the insert would leave the prompt retired with
       * no successor — silently one prompt smaller, for everybody, with the editor
       * showing an error about a save that did in fact change something. Inserting first
       * and failing on the retire is worse: two live rows with the same prompt_code,
       * which the partial unique index refuses, so the whole edit fails on the second
       * statement anyway.
       */

      log(`prompt ${current.id} superseded by ${created.id}`, "prompts");
      res.json({
        published: true,
        prompt: created,
        retired: current.id,
        issues,
        reachability: reachability(draft, true),
      });
    } catch (err) {
      log(`prompt edit failed: ${(err as Error).message}`, "prompts");
      res.status(500).json({ error: "Failed to save the prompt" });
    }
  });

  /**
   * Retire a prompt with no successor.
   *
   * Not a delete. The row is a foreign key target for every entry written in answer to
   * it, and DELETE would either fail on the constraint or — worse, if somebody later
   * relaxed it — orphan the entries. Retiring takes it out of the pool, which is the
   * whole of what "remove this prompt" can safely mean.
   */
  app.post("/api/admin/prompt-library/:id/retire", isAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid prompt id" });

      const [updated] = await db
        .update(promptLibrary)
        .set({ active: false, updatedAt: new Date() })
        .where(and(eq(promptLibrary.id, id), eq(promptLibrary.active, true)))
        .returning();

      if (!updated) return res.status(404).json({ error: "No live prompt with that id" });

      log(`prompt ${id} retired`, "prompts");
      res.json({ retired: id });
    } catch (err) {
      log(`prompt retire failed: ${(err as Error).message}`, "prompts");
      res.status(500).json({ error: "Failed to retire the prompt" });
    }
  });

  /**
   * Restore a retired prompt by publishing its content as a new live row.
   *
   * Not by flipping `active` back. The entries written against the row that is currently
   * live would then sit beside a row marked retired that they answer, and the two live
   * rows would race the partial unique index. Republishing keeps the chain linear:
   * every row is either live or was superseded by exactly one thing.
   */
  app.post(
    "/api/admin/prompt-library/:id/restore",
    isAdmin,
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid prompt id" });

        const [old] = await db
          .select()
          .from(promptLibrary)
          .where(eq(promptLibrary.id, id))
          .limit(1);
        if (!old) return res.status(404).json({ error: "No such prompt" });
        if (old.active) return res.status(409).json({ error: "That prompt is already live" });

        const draft = promptDraftFrom(old);

        const [created] = await db.transaction(async (tx) => {
          /*
           * Retire whatever currently occupies this prompt's code, if anything does.
           * Without it the restore would produce two live rows sharing a prompt_code and
           * the partial unique index would refuse the insert — correctly, but with an
           * error nobody could act on.
           */
          if (old.promptCode) {
            await tx
              .update(promptLibrary)
              .set({ active: false, updatedAt: new Date() })
              .where(
                and(
                  eq(promptLibrary.active, true),
                  eq(promptLibrary.promptCode, old.promptCode),
                  old.sourceBlock
                    ? eq(promptLibrary.sourceBlock, old.sourceBlock)
                    : isNull(promptLibrary.sourceBlock),
                ),
              );
          }

          return await tx
            .insert(promptLibrary)
            .values({
              promptText: old.promptText,
              category: old.category as any,
              populationTags: old.populationTags,
              promptCode: old.promptCode,
              behavioralSignal: old.behavioralSignal,
              signalCategory: old.signalCategory,
              evidenceTier: old.evidenceTier,
              audienceScope: old.audienceScope,
              cadence: old.cadence,
              deliveryMarker: old.deliveryMarker,
              library: old.library,
              eventSensitive: old.eventSensitive,
              sourceDocument: old.sourceDocument,
              sourceBlock: old.sourceBlock,
              sourceLine: old.sourceLine,
              supersedesId: old.id,
              active: true,
            } as any)
            .returning();
        });

        log(`prompt ${old.id} restored as ${created.id}`, "prompts");
        res.json({ published: true, prompt: created, restoredFrom: old.id, reachability: reachability(draft, true) });
      } catch (err) {
        log(`prompt restore failed: ${(err as Error).message}`, "prompts");
        res.status(500).json({ error: "Failed to restore the prompt" });
      }
    },
  );

  /* ── Openers ────────────────────────────────────────────────────────── */

  /**
   * The opener pool, with per-pool counts.
   *
   * The counts matter more here than in the library. `renderOpener` returns null when a
   * pool has nothing usable and the caller sends the prompt with no greeting at all — so
   * a pool that has been emptied by edits degrades quietly rather than failing.
   */
  app.get("/api/admin/prompt-openers", isAdmin, async (req: Request, res: Response) => {
    try {
      const includeRetired = req.query.retired === "true";
      const rows = await db
        .select()
        .from(promptOpeners)
        .where(includeRetired ? sql`true` : eq(promptOpeners.active, true))
        .orderBy(asc(promptOpeners.pool), desc(promptOpeners.id));

      const live = rows.filter((r) => r.active);
      const byPool: Record<string, number> = {};
      for (const pool of OPENER_POOLS) byPool[pool] = live.filter((r) => r.pool === pool).length;

      res.json({
        openers: rows,
        counts: { live: live.length, retired: rows.length - live.length, byPool },
        /*
         * An empty pool is not a statistic, it is a silent degradation: a student in that
         * state gets the prompt with no greeting and nothing says why.
         */
        emptyPools: OPENER_POOLS.filter((p) => byPool[p] === 0),
      });
    } catch (err) {
      log(`opener list failed: ${(err as Error).message}`, "prompts");
      res.status(500).json({ error: "Failed to read the opener pool" });
    }
  });

  /**
   * Validate an opener and render it the way a student would see it.
   *
   * Rendered through the real `renderOpener`, against a single-opener pool — so a draft
   * that the renderer would refuse comes back as `rendered: null` rather than as a
   * string this route built itself and the send path would never produce.
   */
  app.post("/api/admin/prompt-openers/preview", isAdmin, (req: Request, res: Response) => {
    const draft = openerDraftFrom(req.body);
    const issues = validateOpener(draft);

    const values: Record<string, string> = { Name: "Priya", topic: "the internship offer" };
    const one: Opener = { id: 0, pool: draft.pool, text: draft.text, placeholders: draft.placeholders };
    const rendered = renderOpener(
      [one],
      {
        daysSinceLastResponse: draft.pool === "warm_return" ? 7 : 1,
        followingUpOn: draft.pool === "post_response" ? "the internship offer" : null,
        lastOpenerId: null,
      },
      values,
      () => 0,
    );

    res.json({ issues, rendered: rendered?.text ?? null, sampleValues: values });
  });

  /** A new opener. */
  app.post("/api/admin/prompt-openers", isAdmin, async (req: Request, res: Response) => {
    try {
      const draft = openerDraftFrom(req.body);
      const issues = validateOpener(draft);
      if (blocking(issues)) return res.status(400).json({ error: "Not saved", issues });

      const [created] = await db
        .insert(promptOpeners)
        .values({
          pool: draft.pool,
          text: draft.text,
          placeholders: draft.placeholders as string[],
          active: true,
        })
        .returning();

      log(`opener ${created.id} created in ${draft.pool}`, "prompts");
      res.json({ opener: created, issues });
    } catch (err) {
      log(`opener create failed: ${(err as Error).message}`, "prompts");
      res.status(500).json({ error: "Failed to save the opener" });
    }
  });

  /** An edit: retire and supersede, for the same reason as a prompt. */
  app.post("/api/admin/prompt-openers/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid opener id" });

      const [current] = await db
        .select()
        .from(promptOpeners)
        .where(eq(promptOpeners.id, id))
        .limit(1);
      if (!current) return res.status(404).json({ error: "No such opener" });
      if (!current.active) return res.status(409).json({ error: "That opener is already retired" });

      const draft = openerDraftFrom(req.body);
      const issues = validateOpener(draft);
      if (blocking(issues)) return res.status(400).json({ error: "Not saved", issues });

      if (
        current.pool === draft.pool &&
        current.text === draft.text &&
        JSON.stringify(current.placeholders) === JSON.stringify(draft.placeholders)
      ) {
        return res.json({ published: false, reason: "unchanged", opener: current, issues });
      }

      const [created] = await db.transaction(async (tx) => {
        await tx
          .update(promptOpeners)
          .set({ active: false, updatedAt: new Date() })
          .where(eq(promptOpeners.id, current.id));

        return await tx
          .insert(promptOpeners)
          .values({
            pool: draft.pool,
            text: draft.text,
            placeholders: draft.placeholders as string[],
            supersedesId: current.id,
            active: true,
          } as any)
          .returning();
      });

      log(`opener ${current.id} superseded by ${created.id}`, "prompts");
      res.json({ published: true, opener: created, retired: current.id, issues });
    } catch (err) {
      log(`opener edit failed: ${(err as Error).message}`, "prompts");
      res.status(500).json({ error: "Failed to save the opener" });
    }
  });

  /**
   * Retire an opener — refused when it is the last live one in its pool.
   *
   * This is the one place the editor says no to something that is not malformed. An
   * empty pool does not error anywhere: `renderOpener` returns null and the caller sends
   * the prompt with no greeting, so the failure is a slightly colder message rather than
   * an exception, and nobody finds out. The pools are preconditions — a warm-return
   * greeting cannot be substituted from the casual pool without telling a student who
   * has been away for a week that nothing was noticed.
   */
  app.post("/api/admin/prompt-openers/:id/retire", isAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid opener id" });

      const [current] = await db
        .select()
        .from(promptOpeners)
        .where(eq(promptOpeners.id, id))
        .limit(1);
      if (!current || !current.active) {
        return res.status(404).json({ error: "No live opener with that id" });
      }

      const siblings = await db
        .select({ id: promptOpeners.id })
        .from(promptOpeners)
        .where(and(eq(promptOpeners.active, true), eq(promptOpeners.pool, current.pool)));

      if (siblings.length <= 1) {
        return res.status(409).json({
          error:
            `This is the last live opener in the ${current.pool} pool. Retiring it would ` +
            `leave that pool empty, and an empty pool sends the prompt with no greeting ` +
            `rather than raising anything. Add a replacement first.`,
        });
      }

      await db
        .update(promptOpeners)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(promptOpeners.id, id));

      log(`opener ${id} retired from ${current.pool}`, "prompts");
      res.json({ retired: id });
    } catch (err) {
      log(`opener retire failed: ${(err as Error).message}`, "prompts");
      res.status(500).json({ error: "Failed to retire the opener" });
    }
  });
}
