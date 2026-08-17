import { Express } from "express";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { gateAuditFindings, heuristics, sessions } from "@shared/wing-schema";
import { AUDIT_RULES, NOT_AUDITABLE } from "./wing/gate-audit";
import { isPlatformAdmin } from "./admin-guards";
import { log } from "./logger";

/**
 * The gate integrity surface — what the audit found, and what it cannot see.
 *
 * ── WHY THIS SCREEN EXISTS ───────────────────────────────────────────────
 * Twenty-four of the 53 Tier 1 cards are integrity gates, and thirteen of them
 * ask for "content analysis on Wing's own output before delivery". The turn path
 * streams, so the decision taken was measure-then-enforce: compile the rules into
 * the prompt, audit the delivered reply, record what held and what did not. That
 * decision is only worth anything if somebody can read the result — otherwise
 * `gate_audit_findings` accumulates rows nobody sees and "measure" quietly means
 * "ignore".
 *
 * It is also the answer to Danielle's ask about routing: "this is how I'll tune
 * the triggers over time — by seeing which fire, which get accepted, and which
 * consistently get declined, which means the trigger is wrong, not the user."
 * A rejected finding is evidence about the PATTERN, not about Wing. Without the
 * review state a false positive and a real breach are the same row.
 *
 * ── PLATFORM STAFF ONLY, FOR TWO SEPARATE REASONS ────────────────────────
 * The first is the ordinary one: this is the methodology engine, which is the
 * `isPlatformAdmin` boundary as set out in admin-guards.ts.
 *
 * The second is specific. `excerpt` is a window of Wing's own reply and will
 * often quote the student back to themselves, so it carries the sensitivity of
 * `transcript_turns.content`. It cannot be institution-scoped into usefulness
 * either: tuning a rule means looking across every student it fired on, so a
 * per-cohort view would answer a different question. Staff only, and the
 * responses carry no name, no email and no free-text profile field — a student
 * id and a session id, which are enough to reach the transcript through the
 * screens that already guard it.
 */

/**
 * The three states a reviewer can set.
 *
 * `pattern_status` also has `authored`, which means "a human wrote this pattern
 * deliberately" and belongs to the tagging surface it was built for. Offering it
 * here would let a reviewer mark a finding in a state no query in this file
 * understands. Setting a finding back to `pending_review` is allowed on purpose:
 * a reviewer who accepts the wrong row needs an undo, and deletion would destroy
 * the evidence.
 */
const REVIEW_STATES = ["pending_review", "accepted", "rejected"] as const;
type ReviewState = (typeof REVIEW_STATES)[number];

const MAX_PAGE = 200;

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function registerGateAuditRoutes(app: Express) {
  /**
   * The tuning query, one row per gate.
   *
   * Every gate the audit CAN check appears, including those with no findings at
   * all — a gate with a zero is the good case and the most important thing on the
   * screen. Building the list from the findings table alone would show only the
   * gates being broken, and a screen that lists nothing when everything is fine
   * is indistinguishable from a screen that is not wired up.
   *
   * `notAuditable` ships in the same response for the same reason: "no
   * violations" must never be read as "every gate held". Five gates cannot be
   * judged from the reply text at all, and the screen has to say so.
   */
  app.get("/api/admin/gate-audit/summary", isPlatformAdmin, async (_req, res, next) => {
    try {
      const rows = await db
        .select({
          cardCode: gateAuditFindings.cardCode,
          status: gateAuditFindings.status,
          n: count(),
          /*
           * Formatted in SQL rather than handed over as a timestamp. The driver
           * returns a Date for timestamptz, so `sql<string>` would have been a
           * lie the type checker could not catch, and the tally below compares
           * these values with `>` to keep the latest one — a comparison that is
           * only reliable on a fixed-offset string. ISO-in-UTC is both sortable
           * as text and what the client's `new Date(...)` expects.
           */
          latestAt: sql<string | null>`to_char(max(${gateAuditFindings.detectedAt}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
        })
        .from(gateAuditFindings)
        .groupBy(gateAuditFindings.cardCode, gateAuditFindings.status);

      type Tally = {
        cardCode: string;
        mode: string | null;
        what: string | null;
        source: string | null;
        total: number;
        pendingReview: number;
        accepted: number;
        rejected: number;
        latestAt: string | null;
      };

      const byCode = new Map<string, Tally>();
      const blank = (cardCode: string): Tally => {
        const rule = AUDIT_RULES.find((r) => r.cardCode === cardCode);
        return {
          cardCode,
          mode: rule?.mode ?? null,
          what: rule?.what ?? null,
          source: rule?.source ?? null,
          total: 0,
          pendingReview: 0,
          accepted: 0,
          rejected: 0,
          latestAt: null,
        };
      };

      // Every checkable gate first, so a gate with no findings still has a row.
      for (const rule of AUDIT_RULES) byCode.set(rule.cardCode, blank(rule.cardCode));

      const totals = { findings: 0, pendingReview: 0, accepted: 0, rejected: 0 };

      for (const row of rows) {
        // A finding whose gate has since been removed from AUDIT_RULES still
        // happened, and hiding it would quietly shrink the evidence.
        const tally = byCode.get(row.cardCode) ?? blank(row.cardCode);
        byCode.set(row.cardCode, tally);

        const n = Number(row.n);
        tally.total += n;
        if (row.status === "pending_review") tally.pendingReview += n;
        else if (row.status === "accepted") tally.accepted += n;
        else if (row.status === "rejected") tally.rejected += n;

        if (row.latestAt && (!tally.latestAt || row.latestAt > tally.latestAt)) {
          tally.latestAt = row.latestAt;
        }

        totals.findings += n;
        if (row.status === "pending_review") totals.pendingReview += n;
        else if (row.status === "accepted") totals.accepted += n;
        else if (row.status === "rejected") totals.rejected += n;
      }

      const gates = Array.from(byCode.values()).sort(
        (a, b) => b.pendingReview - a.pendingReview || b.total - a.total ||
          a.cardCode.localeCompare(b.cardCode),
      );

      res.json({
        totals,
        gates,
        notAuditable: NOT_AUDITABLE.map((g) => ({ cardCode: g.cardCode, reason: g.reason })),
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * The review queue. Newest first, because a pattern that has just started
   * firing is the one worth looking at.
   */
  app.get("/api/admin/gate-audit/findings", isPlatformAdmin, async (req, res, next) => {
    try {
      const cardCode = typeof req.query.cardCode === "string" ? req.query.cardCode.trim() : "";
      const status = typeof req.query.status === "string" ? req.query.status.trim() : "";

      if (status && REVIEW_STATES.indexOf(status as ReviewState) < 0) {
        return res.status(400).json({
          error: `status must be one of ${REVIEW_STATES.join(", ")}`,
        });
      }

      const limit = Math.min(MAX_PAGE, Math.max(1, Number(req.query.limit) || 50));
      const offset = Math.max(0, Number(req.query.offset) || 0);

      const filters = [];
      if (cardCode) filters.push(eq(gateAuditFindings.cardCode, cardCode));
      if (status) filters.push(eq(gateAuditFindings.status, status as ReviewState));
      const where = filters.length ? and(...filters) : undefined;

      const [rows, [totalRow]] = await Promise.all([
        db
          .select({
            id: gateAuditFindings.id,
            cardCode: gateAuditFindings.cardCode,
            cardName: heuristics.name,
            heuristicId: gateAuditFindings.heuristicId,
            mode: gateAuditFindings.mode,
            matched: gateAuditFindings.matched,
            excerpt: gateAuditFindings.excerpt,
            status: gateAuditFindings.status,
            detectedAt: gateAuditFindings.detectedAt,
            // Enough to reach the transcript through the screens that already
            // guard it, and nothing that identifies the person here.
            studentId: gateAuditFindings.studentId,
            sessionId: gateAuditFindings.sessionId,
            sessionType: sessions.sessionType,
            turnId: gateAuditFindings.turnId,
          })
          .from(gateAuditFindings)
          .innerJoin(heuristics, eq(heuristics.id, gateAuditFindings.heuristicId))
          .innerJoin(sessions, eq(sessions.id, gateAuditFindings.sessionId))
          .where(where)
          .orderBy(desc(gateAuditFindings.detectedAt), desc(gateAuditFindings.id))
          .limit(limit)
          .offset(offset),
        db.select({ n: count() }).from(gateAuditFindings).where(where),
      ]);

      res.json({ findings: rows, total: Number(totalRow?.n ?? 0), limit, offset });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Records a review decision.
   *
   * What "accepted" and "rejected" mean is worth being explicit about, because
   * the intuitive reading is backwards. Accepted means *the finding is real* —
   * Wing broke the rule. Rejected means *the pattern was wrong* — Wing behaved
   * correctly and the regex is too broad. So a gate with a high rejection rate is
   * a fault in this repository, not in the methodology and not in the coaching.
   */
  app.patch("/api/admin/gate-audit/findings/:id", isPlatformAdmin, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid finding id" });

      const { status } = req.body ?? {};
      if (REVIEW_STATES.indexOf(status) < 0) {
        return res.status(400).json({
          error: `status must be one of ${REVIEW_STATES.join(", ")}`,
        });
      }

      const [updated] = await db
        .update(gateAuditFindings)
        .set({ status })
        .where(eq(gateAuditFindings.id, id))
        .returning({
          id: gateAuditFindings.id,
          cardCode: gateAuditFindings.cardCode,
          status: gateAuditFindings.status,
        });

      if (!updated) return res.status(404).json({ error: "Finding not found" });

      log(
        `gate finding #${id} (${updated.cardCode}) -> ${status} by user ${req.user!.id}`,
        "methodology",
      );
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });
}
