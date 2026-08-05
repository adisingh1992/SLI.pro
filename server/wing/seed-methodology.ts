import "dotenv/config";
import { and, eq, isNull, sql } from "drizzle-orm";
import { initScript, type ScriptDb } from "../script-init";
import {
  institutions,
  schoolCycles,
  students,
  heuristics,
  heuristicComponents,
  heuristicSequences,
  heuristicSequenceEntries,
} from "@shared/wing-schema";
import { codeFromName, uniqueCode } from "./card-code";

/**
 * Seeds the minimum methodology the engine needs in order to resolve anything.
 *
 * Run:  npm run wing:seed-methodology
 *       npm run wing:seed-methodology -- --dry-run
 *
 * Idempotent: every step looks for its row first, so re-running is safe.
 *
 * ─── WHY THERE IS A SYNTHETIC INSTITUTION ───────────────────────────────────
 *
 * bootstrap.ts design note 1 says, correctly, that fabricating a placeholder
 * institution pollutes institutional reporting. That still holds — but the
 * engine resolves a student's heuristic sequence via
 * school_cycles.active_heuristic_sequence_id, and the spec only provides two
 * owners for a sequence: a school cycle, or a graduated student's personal
 * sequence. Every current user is `origin = 'direct'` with a NULL cycle, so
 * without a cycle the engine resolves nothing for the entire live population.
 *
 * The resolution keeps both properties:
 *   - a synthetic institution and an annual cycle give direct students real
 *     sequence governance, including evaluation windows, so B2C methodology
 *     evolves cohort-to-cohort exactly like an institutional cohort;
 *   - students.origin stays 'direct' and students.institution_id stays NULL,
 *     so any report that joins students → institutions still excludes them.
 *     Only cycle_id is set, which is all the engine reads.
 *
 * Reports must therefore filter on students.origin, never on "has an
 * institution". That is the honest key anyway.
 *
 * ─── WHY THE CARDS ARE `candidate` ──────────────────────────────────────────
 *
 * H-014 and H-021 below are SCAFFOLDING. They were written from the worked
 * example in spec §5 so the engine can be demonstrated end to end; they are
 * NOT validated SLI.pro methodology and no one on the methodology side has
 * reviewed them. They are inserted with status 'candidate' and say so in their
 * notes component. Danielle and Sam author the real cards through the
 * authoring API; when they do, these should be retired, not edited.
 */

const DRY_RUN = process.argv.includes("--dry-run");

const DIRECT_INSTITUTION = "SLI.pro Direct";

type ComponentSeed = {
  componentType:
    | "signal" | "intervention" | "coaching_move" | "outcome"
    | "module_mapping" | "population_context" | "notes";
  content: string;
};

type CardSeed = {
  name: string;
  description: string;
  populationTags: string[];
  components: ComponentSeed[];
};

const CANDIDATE_NOTE =
  "CANDIDATE SCAFFOLDING — authored from the worked example in the Wing Data " +
  "Architecture spec §5 to exercise the engine, not reviewed by the methodology " +
  "owner. Retire this card when the real one is authored; do not edit it into " +
  "the real one, so the version history stays honest about its provenance.";

const CARDS: CardSeed[] = [
  {
    name: "H-014 Role sprawl",
    description:
      "The student is carrying more target roles than they can credibly " +
      "position for, and has no stated basis for choosing between them.",
    populationTags: ["early_career", "cross_functional"],
    components: [
      {
        componentType: "signal",
        content:
          "Student names four or more distinct target roles without an ordering " +
          "or a stated basis for choosing between them; or re-opens the full set " +
          "of options each time they are asked to narrow.",
      },
      {
        componentType: "intervention",
        content:
          "Ask for a single forced choice under a hypothetical constraint — " +
          "\"if you had to bet on one today, which one?\" — and then ask what " +
          "choosing it costs them.",
      },
      {
        componentType: "coaching_move",
        content:
          "Do not resolve the sprawl on the student's behalf. Name the pattern " +
          "once, ask the forced-choice question, and hold the silence. The value " +
          "is in them making the choice, not in hearing which one you would pick.",
      },
      {
        componentType: "outcome",
        content:
          "Student names one role and articulates the tradeoff they feel in " +
          "choosing it. Naming the cost matters more than the choice itself.",
      },
      {
        componentType: "module_mapping",
        content: "Foundation Session 1; Enhancement Module A (positioning).",
      },
      {
        componentType: "population_context",
        content:
          "Common in early-career operators and people whose work has been " +
          "cross-functional by default. Rarer in students already established " +
          "inside a named function.",
      },
      { componentType: "notes", content: CANDIDATE_NOTE },
    ],
  },
  {
    name: "H-021 Dual-domain credibility",
    description:
      "The student's credibility rests in two domains, and a single-narrative " +
      "framing forces them to subordinate one.",
    populationTags: ["academic_to_practice", "senior_transition"],
    components: [
      {
        componentType: "signal",
        content:
          "Student corrects or qualifies Wing's framing in order to restore a " +
          "second domain of credibility — typically \"that's not quite it, I'm " +
          "also…\" — after a summary that collapsed them into one identity.",
      },
      {
        componentType: "intervention",
        content:
          "Reflect both domains back explicitly, then ask which one the audience " +
          "they care about will evaluate first. Position on that one; carry the " +
          "other as evidence rather than as a second headline.",
      },
      {
        componentType: "coaching_move",
        content:
          "Treat the correction as the highest-value signal in the session, not " +
          "as friction to smooth over. Adopt the student's framing verbatim in " +
          "the next turn so they can hear it reflected accurately.",
      },
      {
        componentType: "outcome",
        content:
          "Student states a positioning line that carries both domains without " +
          "subordinating either into a footnote.",
      },
      {
        componentType: "module_mapping",
        content: "Foundation Session 2; SLI generation.",
      },
      {
        componentType: "population_context",
        content:
          "Academics moving into practice, clinicians moving into industry, " +
          "operator-founders, and anyone whose seniority came from two tracks.",
      },
      { componentType: "notes", content: CANDIDATE_NOTE },
    ],
  },
];

async function seedInstitutionAndCycle() {
  const year = new Date().getUTCFullYear();

  let [institution] = await db
    .select()
    .from(institutions)
    .where(eq(institutions.name, DIRECT_INSTITUTION))
    .limit(1);

  if (!institution) {
    if (DRY_RUN) {
      console.log(`[seed] would create institution '${DIRECT_INSTITUTION}'`);
    } else {
      [institution] = await db
        .insert(institutions)
        .values({
          name: DIRECT_INSTITUTION,
          country: "US",
          // Tagged so it is identifiable as non-institutional at a glance.
          populationTags: ["direct", "b2c"],
          status: "active",
        })
        .returning();
      console.log(`[seed] institution '${DIRECT_INSTITUTION}' #${institution.id}`);
    }
  } else {
    console.log(`[seed] institution '${DIRECT_INSTITUTION}' #${institution.id} exists`);
  }
  if (!institution) return null;

  let [cycle] = await db
    .select()
    .from(schoolCycles)
    .where(
      and(
        eq(schoolCycles.institutionId, institution.id),
        eq(schoolCycles.cycleYear, year),
      ),
    )
    .limit(1);

  if (!cycle) {
    if (DRY_RUN) {
      console.log(`[seed] would create cycle 'Direct ${year}'`);
      return null;
    }
    [cycle] = await db
      .insert(schoolCycles)
      .values({
        institutionId: institution.id,
        cycleYear: year,
        label: `Direct ${year}`,
        cohortStartDate: `${year}-01-01`,
        cohortEndDate: `${year}-12-31`,
        // The evaluation window is the last month of the year: methodology
        // changes for direct students land between cohorts, same as for a
        // school. No active student is affected mid-cycle.
        evaluationWindowStart: `${year}-12-01`,
        evaluationWindowEnd: `${year}-12-31`,
        status: "active",
      })
      .returning();
    console.log(`[seed] cycle 'Direct ${year}' #${cycle.id}`);
  } else {
    console.log(`[seed] cycle 'Direct ${year}' #${cycle.id} exists`);
  }

  return cycle;
}

/** Inserts a card and its components if absent; returns the heuristic id. */
async function seedCard(card: CardSeed): Promise<number | null> {
  const [existing] = await db
    .select({ id: heuristics.id })
    .from(heuristics)
    .where(eq(heuristics.name, card.name))
    .limit(1);

  if (existing) {
    console.log(`[seed] heuristic '${card.name}' #${existing.id} exists`);
    return existing.id;
  }
  if (DRY_RUN) {
    console.log(`[seed] would create heuristic '${card.name}' + ${card.components.length} components`);
    return null;
  }

  // Read fresh each time: seedCard is called per card, and a code allocated by
  // the previous call must be visible to this one or two cards whose names
  // slug identically would collide on the unique index.
  const taken = new Set(
    (await db.select({ code: heuristics.cardCode }).from(heuristics)).map((r) => r.code),
  );

  const [created] = await db
    .insert(heuristics)
    .values({
      cardCode: uniqueCode(codeFromName(card.name), taken),
      name: card.name,
      description: card.description,
      populationTags: card.populationTags,
      // Scaffolding is never 'validated'. Only the methodology owner promotes.
      status: "candidate",
    })
    .returning({ id: heuristics.id });

  await db.insert(heuristicComponents).values(
    card.components.map((c) => ({
      heuristicId: created.id,
      componentType: c.componentType,
      content: c.content,
      isCurrent: true,
    })),
  );

  console.log(`[seed] heuristic '${card.name}' #${created.id} + ${card.components.length} components`);
  return created.id;
}

/** Creates the cycle's active sequence if it has none. */
async function seedSequence(cycleId: number, heuristicIds: number[]) {
  const [cycle] = await db
    .select({ activeSequenceId: schoolCycles.activeHeuristicSequenceId })
    .from(schoolCycles)
    .where(eq(schoolCycles.id, cycleId))
    .limit(1);

  if (cycle?.activeSequenceId) {
    console.log(`[seed] cycle already has sequence #${cycle.activeSequenceId}`);
    return cycle.activeSequenceId;
  }
  if (DRY_RUN) {
    console.log(`[seed] would create sequence with ${heuristicIds.length} entries`);
    return null;
  }

  const [sequence] = await db
    .insert(heuristicSequences)
    .values({
      ownerType: "school_cycle",
      ownerId: cycleId,
      activeFrom: new Date(),
    })
    .returning({ id: heuristicSequences.id });

  await db.insert(heuristicSequenceEntries).values(
    heuristicIds.map((heuristicId, i) => ({
      sequenceId: sequence.id,
      heuristicId,
      position: i + 1,
      weight: "1.0",
    })),
  );

  await db
    .update(schoolCycles)
    .set({ activeHeuristicSequenceId: sequence.id, updatedAt: new Date() })
    .where(eq(schoolCycles.id, cycleId));

  console.log(`[seed] sequence #${sequence.id} with ${heuristicIds.length} entries`);
  return sequence.id;
}

/**
 * Points existing direct students at the cycle.
 *
 * institution_id is deliberately left NULL — see the header. Only cycle_id is
 * set, which is the single field the engine needs to resolve a sequence.
 */
async function backfillDirectStudents(cycleId: number) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(students)
    .where(and(eq(students.origin, "direct"), isNull(students.cycleId)));

  if (!count) {
    console.log("[seed] no direct students need a cycle");
    return;
  }
  if (DRY_RUN) {
    console.log(`[seed] would assign cycle #${cycleId} to ${count} direct student(s)`);
    return;
  }

  await db
    .update(students)
    .set({ cycleId, updatedAt: new Date() })
    .where(and(eq(students.origin, "direct"), isNull(students.cycleId)));

  console.log(`[seed] assigned cycle #${cycleId} to ${count} direct student(s)`);
}

// Assigned by initScript() before any query runs. ../db builds its pool at
// module load, so it must not be imported until DATABASE_URL is present.
let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

async function main() {
  ({ db, pool } = await initScript());
  console.log(DRY_RUN ? "[seed] DRY RUN — no writes\n" : "[seed] seeding methodology\n");

  const cycle = await seedInstitutionAndCycle();

  const heuristicIds: number[] = [];
  for (const card of CARDS) {
    const id = await seedCard(card);
    if (id) heuristicIds.push(id);
  }

  if (cycle && heuristicIds.length) {
    await seedSequence(cycle.id, heuristicIds);
    await backfillDirectStudents(cycle.id);
  }

  console.log("\n[seed] done");
  await pool.end();
}

main().catch(async (err) => {
  console.error("[seed] failed:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
