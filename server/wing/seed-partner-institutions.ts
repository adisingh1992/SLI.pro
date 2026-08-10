import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { initScript, type ScriptDb } from "../script-init";
import { institutions, schoolCycles } from "@shared/wing-schema";

/**
 * Seeds the two August partner institutions and their cohorts.
 *
 * Run:  npm run wing:seed-partners
 *       npm run wing:seed-partners -- --dry-run
 *
 * ── WHY THIS IS NEEDED FOR B1 ────────────────────────────────────────────
 * `advisors.institution_id` is NOT NULL. Until these rows exist there is
 * nowhere to file a Berkeley or Vanderbilt advisor, so the advisor snapshot
 * cannot be used by either partner — the feature is complete and unusable at
 * the same time. This was invisible because "SLI.pro Direct" exists and makes
 * the advisor form look functional.
 *
 * ── WHY A CYCLE, NOT JUST AN INSTITUTION ─────────────────────────────────
 * The cycle is the governance point: methodology, classifier and voice
 * versions publish against it, and the spec's rule is that nothing changes
 * mid-cohort. A student attached to an institution with no cycle has no
 * evaluation window, so a methodology change would reach them mid-stream —
 * exactly what the architecture is built to prevent.
 *
 * ── THE DATES ARE PLACEHOLDERS AND SAY SO ────────────────────────────────
 * Real academic calendars come from Danielle. A US academic year runs roughly
 * August to May, and the evaluation window sits in the summer gap between
 * cohorts. These are honest defaults, not researched facts; the script prints
 * them so nobody mistakes them for confirmed dates.
 *
 * Idempotent: re-running reports what exists and changes nothing.
 */

const DRY_RUN = process.argv.includes("--dry-run");

type PartnerSeed = {
  name: string;
  populationTags: string[];
  /** Academic year the August 2026 cohort belongs to. */
  cycleYear: number;
  label: string;
  cohortStartDate: string;
  cohortEndDate: string;
  evaluationWindowStart: string;
  evaluationWindowEnd: string;
};

const PARTNERS: PartnerSeed[] = [
  {
    name: "University of California, Berkeley",
    // Both partners run undergraduate and recent-grad populations. The tag
    // drives which objective content a session renders, so an empty array here
    // would silently hand every student the wrong population's material.
    populationTags: ["undergraduate_or_recent_grad", "early_career"],
    cycleYear: 2026,
    label: "Berkeley AY 2026–27",
    cohortStartDate: "2026-08-17",
    cohortEndDate: "2027-05-14",
    evaluationWindowStart: "2027-05-15",
    evaluationWindowEnd: "2027-08-16",
  },
  {
    name: "Vanderbilt University",
    populationTags: ["undergraduate_or_recent_grad", "early_career"],
    cycleYear: 2026,
    label: "Vanderbilt AY 2026–27",
    cohortStartDate: "2026-08-19",
    cohortEndDate: "2027-05-07",
    evaluationWindowStart: "2027-05-08",
    evaluationWindowEnd: "2027-08-18",
  },
];

let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

async function seedPartner(p: PartnerSeed) {
  let [institution] = await db
    .select()
    .from(institutions)
    .where(eq(institutions.name, p.name))
    .limit(1);

  if (!institution) {
    if (DRY_RUN) {
      console.log(`  would create institution '${p.name}'`);
    } else {
      [institution] = await db
        .insert(institutions)
        .values({
          name: p.name,
          country: "US",
          populationTags: p.populationTags,
          status: "active",
        })
        .returning();
      console.log(`  institution '${p.name}' #${institution.id} created`);
    }
  } else {
    console.log(`  institution '${p.name}' #${institution.id} exists`);
  }
  if (!institution) return;

  const [cycle] = await db
    .select()
    .from(schoolCycles)
    .where(
      and(
        eq(schoolCycles.institutionId, institution.id),
        eq(schoolCycles.cycleYear, p.cycleYear),
      ),
    )
    .limit(1);

  if (cycle) {
    console.log(`  cycle '${p.label}' #${cycle.id} exists`);
    return;
  }

  if (DRY_RUN) {
    console.log(`  would create cycle '${p.label}' (${p.cohortStartDate} → ${p.cohortEndDate})`);
    return;
  }

  const [created] = await db
    .insert(schoolCycles)
    .values({
      institutionId: institution.id,
      cycleYear: p.cycleYear,
      label: p.label,
      cohortStartDate: p.cohortStartDate,
      cohortEndDate: p.cohortEndDate,
      evaluationWindowStart: p.evaluationWindowStart,
      evaluationWindowEnd: p.evaluationWindowEnd,
      status: "active",
    })
    .returning();

  console.log(`  cycle '${p.label}' #${created.id} created`);
}

async function main() {
  ({ db, pool } = await initScript());
  console.log(`\n[partners] seeding${DRY_RUN ? " (DRY RUN)" : ""}\n`);

  for (const p of PARTNERS) {
    console.log(p.name);
    await seedPartner(p);
    console.log("");
  }

  console.log(
    `[partners] Cohort dates are PLACEHOLDERS — a plausible US academic year,\n` +
      `[partners] not confirmed calendars. Danielle has the real ones. They are\n` +
      `[partners] editable without touching students: the cycle governs when a\n` +
      `[partners] methodology change publishes, not who is enrolled.\n`,
  );

  await pool.end();
}

main().catch((err) => {
  console.error("[partners] failed:", err);
  process.exit(1);
});
