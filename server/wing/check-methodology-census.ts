import "dotenv/config";
import { sql } from "drizzle-orm";
import { type ScriptDb } from "../script-init";
import { startScript } from "./script-start";
import { SEQUENCE_HARD_LIMIT, SEQUENCE_SOFT_LIMIT } from "./sequence-limits";

/**
 * `npm run wing:census`
 *
 * What methodology is actually published, per cycle, measured against the
 * database rather than quoted from a document.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * Four numbers have been in circulation and none of them can be reconciled
 * from the documents. Danielle's 4 September pre-read says Berkeley's live
 * sequence is V4 with 53 cards and that V6 has 103. The build documents the 53
 * as 22 coaching + 24 gates + 7 exercises. `WING_DECISIONS.md` records a
 * 104-entry Tier 1 set the builder composes but deliberately does not publish,
 * and separately that Berkeley and Vanderbilt have a voice profile and **no
 * sequence at all**. My own 5 September answer said I could find no V6 and no
 * 103-card sequence in the code and would not guess.
 *
 * That is not a documentation annoyance. It is the denominator of the whole
 * Unfired Cards report: a count of cards that never fired, taken against the
 * wrong sequence, is worse than no count — it would send Danielle to rewrite
 * cards that were never deployed.
 *
 * ── WHAT IT MEASURES, AND WHAT THE NUMBERS MEAN ──────────────────────────
 * Publication in this platform is a POINTER, not a state on the sequence:
 * `school_cycles.active_heuristic_sequence_id`. A sequence can be fully built,
 * versioned and correct and govern nobody, because `wing:build-sequences`
 * deliberately does not move that pointer. So this script reports the two
 * separately and never conflates them:
 *
 *   LIVE      a sequence some cycle's pointer names, and its composition
 *   BUILT     every other non-superseded sequence — real, and reaching nobody
 *
 * Composition is split by `card_kind`, because the sequence limits count only
 * coaching cards: gates fire on Wing's output and never enter the detector, so
 * "103 cards" and "detector load 103" are different claims and only the second
 * one is bounded. Peak detector load per session is what the limits actually
 * measure (SOFT ${SEQUENCE_SOFT_LIMIT}, HARD ${SEQUENCE_HARD_LIMIT}), and an
 * unscoped sequence peaks at its own total — which is the case that makes an
 * innocent-looking number refuse to activate.
 *
 * Read-only. Writes nothing, publishes nothing, moves no pointer.
 */

let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

type Row = Record<string, unknown>;

async function rows(q: unknown): Promise<Row[]> {
  const r = await db.execute(q as never);
  return (r as unknown as { rows: Row[] }).rows ?? [];
}

const n = (v: unknown) => Number(v ?? 0);
const s = (v: unknown) => (v === null || v === undefined ? "—" : String(v));

const heading = (t: string) => console.log(`\n\x1b[1m${t}\x1b[0m`);

async function main() {
  ({ db, pool } = await startScript());

  /* ── 1 · cycles and what they point at ─────────────────────────────────── */

  heading("Cycles, and the sequence each one points at");

  const cycles = await rows(sql`
    SELECT c."id"            AS cycle_id,
           i."name"          AS institution,
           c."label"         AS label,
           c."cycle_year"    AS cycle_year,
           c."status"        AS status,
           c."active_heuristic_sequence_id" AS sequence_id,
           q."version_number" AS version_number,
           q."superseded_at"  AS superseded_at,
           c."voice_profile_id" AS voice_profile_id,
           (SELECT count(*) FROM "wing"."students" st WHERE st."cycle_id" = c."id") AS students
      FROM "wing"."school_cycles" c
      JOIN "wing"."institutions" i ON i."id" = c."institution_id"
      LEFT JOIN "wing"."heuristic_sequences" q ON q."id" = c."active_heuristic_sequence_id"
     ORDER BY i."name", c."cycle_year", c."id"
  `);

  if (!cycles.length) console.log("  no cycles");

  const liveSequenceIds = new Set<number>();
  for (const c of cycles) {
    const seq = c.sequence_id === null ? null : n(c.sequence_id);
    if (seq !== null) liveSequenceIds.add(seq);

    const name = `${s(c.institution)}${c.label ? ` / ${s(c.label)}` : ""} ${s(c.cycle_year)}`;
    console.log(
      `  cycle ${String(n(c.cycle_id)).padEnd(4)} ${name.padEnd(38)} ` +
        `students ${String(n(c.students)).padStart(4)}  ` +
        (seq === null
          ? "\x1b[33mNO SEQUENCE — no cards, no gates\x1b[0m"
          : `sequence ${seq} v${s(c.version_number)}`) +
        (c.voice_profile_id === null ? "  \x1b[33mno voice profile\x1b[0m" : ""),
    );

    /*
     * A pointer at a superseded sequence is the one state nobody would think to
     * look for and it is publishable today: superseding writes `superseded_at`
     * on the row and does not touch any cycle pointing at it.
     */
    if (seq !== null && c.superseded_at !== null) {
      console.log(
        `       \x1b[31m✗ this cycle points at a SUPERSEDED sequence ` +
          `(superseded ${s(c.superseded_at)})\x1b[0m`,
      );
    }
  }

  /* ── 2 · composition of every sequence ─────────────────────────────────── */

  heading("Every sequence, by composition");

  const seqs = await rows(sql`
    SELECT q."id"              AS sequence_id,
           q."owner_type"      AS owner_type,
           q."owner_id"        AS owner_id,
           q."version_number"  AS version_number,
           q."superseded_at"   AS superseded_at,
           count(e."id")                                                   AS entries,
           count(*) FILTER (WHERE h."card_kind" = 'coaching_card')         AS coaching,
           count(*) FILTER (WHERE h."card_kind" = 'integrity_gate')        AS gates,
           count(*) FILTER (WHERE h."card_kind" = 'exercise')              AS exercises,
           count(*) FILTER (WHERE h."card_kind" IS NULL)                   AS kindless,
           count(*) FILTER (WHERE h."status" = 'candidate')                AS candidates,
           count(*) FILTER (WHERE h."status" = 'retired')                  AS retired,
           count(*) FILTER (WHERE e."applies_to_session" IS NULL)          AS unscoped
      FROM "wing"."heuristic_sequences" q
      LEFT JOIN "wing"."heuristic_sequence_entries" e ON e."sequence_id" = q."id"
      LEFT JOIN "wing"."heuristics" h ON h."id" = e."heuristic_id"
     GROUP BY q."id", q."owner_type", q."owner_id", q."version_number", q."superseded_at"
     ORDER BY q."id"
  `);

  if (!seqs.length) console.log("  no sequences exist");

  for (const q of seqs) {
    const id = n(q.sequence_id);
    const live = liveSequenceIds.has(id);
    const state = live
      ? "\x1b[32mLIVE\x1b[0m "
      : q.superseded_at !== null
        ? "superseded"
        : "\x1b[33mbuilt, reaching nobody\x1b[0m";

    console.log(
      `\n  sequence ${id} v${s(q.version_number)} · ${s(q.owner_type)} ${s(q.owner_id)} · ${state}`,
    );
    console.log(
      `    ${n(q.entries)} entries = ${n(q.coaching)} coaching + ${n(q.gates)} gates + ` +
        `${n(q.exercises)} exercises` +
        (n(q.kindless) ? ` + \x1b[33m${n(q.kindless)} with no card_kind\x1b[0m` : ""),
    );
    if (n(q.retired)) {
      console.log(`    \x1b[31m✗ ${n(q.retired)} entry(ies) point at a RETIRED card\x1b[0m`);
    }
    if (n(q.candidates)) {
      /*
       * Not an error. Candidate is the seeded-but-unvalidated state, and the
       * whole intake module sits there by design. It matters only because a
       * reviewer reading "53 cards" may assume all 53 are validated.
       */
      console.log(`    ${n(q.candidates)} entry(ies) point at a candidate card`);
    }
    if (n(q.entries) && n(q.unscoped) === n(q.entries)) {
      console.log(
        `    \x1b[33m! every entry is unscoped — peak detector load equals the total\x1b[0m`,
      );
    }

    /* Peak detector load, the number the limits actually measure. */
    const load = await rows(sql`
      SELECT coalesce(e."applies_to_session"::text, '(every session)') AS session,
             count(*) AS n
        FROM "wing"."heuristic_sequence_entries" e
        JOIN "wing"."heuristics" h ON h."id" = e."heuristic_id"
       WHERE e."sequence_id" = ${id}
         AND h."card_kind" = 'coaching_card'
         AND h."status" <> 'retired'
       GROUP BY 1
       ORDER BY n DESC
    `);

    if (!load.length) {
      console.log("    detector load: none — no coaching cards in this sequence");
    } else {
      const universal = n(load.find((r) => r.session === "(every session)")?.n);
      const scoped = load.filter((r) => r.session !== "(every session)");
      /*
       * A universal entry fires in every session, so it adds to each session's
       * load rather than forming a bucket of its own. A sequence with only
       * universal entries peaks at that number.
       */
      const peaks = scoped.length
        ? scoped.map((r) => ({ session: s(r.session), load: n(r.n) + universal }))
        : [{ session: "(every session)", load: universal }];
      peaks.sort((a, b) => b.load - a.load);

      console.log(
        `    detector load per session: ` +
          peaks.map((p) => `${p.session} ${p.load}`).join(", "),
      );

      const peak = peaks[0];
      const verdict =
        peak.load > SEQUENCE_HARD_LIMIT
          ? `\x1b[31m✗ peak ${peak.load} EXCEEDS the hard limit ${SEQUENCE_HARD_LIMIT}\x1b[0m`
          : peak.load > SEQUENCE_SOFT_LIMIT
            ? `\x1b[33m! peak ${peak.load} is over the soft limit ${SEQUENCE_SOFT_LIMIT}\x1b[0m`
            : `\x1b[32m✓ peak ${peak.load}, within ${SEQUENCE_SOFT_LIMIT}\x1b[0m`;
      console.log(`    ${verdict} (${peak.session})`);
    }

    /*
     * A coaching card the detector will NEVER offer, even though `wing:census`
     * up to this point would call it live and correctly composed. `engine.ts`'s
     * `detectSignal` filters its candidates to `c.components.signal` before it
     * ever calls the model — a card with no CURRENT `signal` component (never
     * written one, or the current row got superseded without a replacement)
     * silently never reaches the detector's catalogue. That failure is
     * invisible everywhere else: the sequence still "has" the card, the trace
     * would show it dropped at a stage this script has no name for, and
     * nothing logs it, because engine.ts has nothing to log — the card was
     * never a candidate in the first place. If EVERY coaching card in the
     * live sequence is missing one, no session governed by it will ever fire
     * anything, on any turn, regardless of what a student or persona says.
     */
    if (live) {
      const signalCoverage = await rows(sql`
        SELECT count(*) FILTER (
                 WHERE h."card_kind" = 'coaching_card' AND h."status" <> 'retired'
               ) AS coaching_cards,
               count(*) FILTER (
                 WHERE h."card_kind" = 'coaching_card' AND h."status" <> 'retired'
                   AND EXISTS (
                     SELECT 1 FROM "wing"."heuristic_components" sc
                      WHERE sc."heuristic_id" = h."id"
                        AND sc."component_type" = 'signal'
                        AND sc."is_current" = true
                   )
               ) AS with_signal
          FROM "wing"."heuristic_sequence_entries" e
          JOIN "wing"."heuristics" h ON h."id" = e."heuristic_id"
         WHERE e."sequence_id" = ${id}
      `);
      const coachingCards = n(signalCoverage[0]?.coaching_cards);
      const withSignal = n(signalCoverage[0]?.with_signal);
      if (coachingCards > 0 && withSignal === 0) {
        console.log(
          `    \x1b[31m✗ 0 of ${coachingCards} coaching cards have a current 'signal' ` +
            `component — the detector's candidate list is empty every turn, so NOTHING can\n` +
            `      ever fire for anyone this sequence governs, whatever a student or persona ` +
            `says\x1b[0m`,
        );
      } else if (coachingCards > 0 && withSignal < coachingCards) {
        console.log(
          `    \x1b[33m! only ${withSignal} of ${coachingCards} coaching cards have a ` +
            `current 'signal' component — the rest can never fire\x1b[0m`,
        );
      } else if (coachingCards > 0) {
        console.log(`    ✓ all ${coachingCards} coaching cards have a current 'signal' component`);
      }
    }
  }

  /* ── 3 · the library behind the sequences ──────────────────────────────── */

  heading("The card library");

  const lib = await rows(sql`
    SELECT coalesce("card_kind"::text, '(none)') AS kind,
           "status"::text                        AS status,
           count(*)                              AS n
      FROM "wing"."heuristics"
     GROUP BY 1, 2
     ORDER BY 1, 2
  `);
  for (const r of lib) {
    console.log(`  ${s(r.kind).padEnd(16)} ${s(r.status).padEnd(11)} ${n(r.n)}`);
  }

  const orphans = await rows(sql`
    SELECT count(*) AS n
      FROM "wing"."heuristics" h
     WHERE h."status" <> 'retired'
       AND NOT EXISTS (
         SELECT 1 FROM "wing"."heuristic_sequence_entries" e WHERE e."heuristic_id" = h."id"
       )
  `);
  console.log(
    `\n  ${n(orphans[0]?.n)} non-retired card(s) are in NO sequence at all — ` +
      `seeded and reaching nobody.`,
  );

  /* ── 4 · the sentence to quote ─────────────────────────────────────────── */

  heading("What can honestly be said");

  const liveList = seqs.filter((q) => liveSequenceIds.has(n(q.sequence_id)));
  if (!liveList.length) {
    console.log(
      "  No cycle points at any sequence. No student is receiving any card or any\n" +
        "  gate today, whatever the library contains. Any 'live sequence' number\n" +
        "  quoted from a document is describing something built, not something live.",
    );
  } else {
    for (const q of liveList) {
      console.log(
        `  Sequence ${n(q.sequence_id)} (v${s(q.version_number)}) is live: ` +
          `${n(q.entries)} entries — ${n(q.coaching)} coaching, ${n(q.gates)} gates, ` +
          `${n(q.exercises)} exercises.`,
      );
    }
  }
  console.log(
    `\n  Anything not listed as LIVE above is built and governs nobody. Publication\n` +
      `  is a pointer on the cycle, and the sequence builder does not move it.\n`,
  );

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await pool?.end();
  } catch {
    /* exiting anyway */
  }
  process.exit(1);
});
