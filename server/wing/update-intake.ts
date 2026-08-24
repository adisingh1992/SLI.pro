import { readFileSync } from "node:fs";
import { and, eq, inArray } from "drizzle-orm";
import { initScript, type ScriptDb } from "../script-init";
import { heuristicComponents, heuristics } from "@shared/wing-schema";
import {
  INTAKE_SOURCE,
  PRIOR_INTAKE_SOURCE,
  parseIntake,
  type IntakeParseResult,
} from "./parse-intake";
import { intakeCardToSeed, intakeGateToSeed, seedRows, type SeedCard } from "./seed-shared";

/**
 * Moves the seeded intake cards from v1.1 to v1.7.
 *
 *     npm run wing:update-intake            report only
 *     npm run wing:update-intake -- --apply write
 *
 * ── WHY THE SEEDER CANNOT DO THIS ────────────────────────────────────────
 * `wing:seed-intake` is idempotent by `card_code` and never overwrites, and that
 * is deliberate: the admin editor exists so Danielle can revise a card, and a
 * re-seed that clobbered her edit would be the worst kind of data loss — silent,
 * and disguised as routine.
 *
 * A document revision is a different case. Seventeen of the 28 card bodies changed
 * between v1.1 and v1.7, and two of those changes matter beyond copy:
 *
 *   H-025 (RT-06) as seeded still lists "people tell me I'm good at" as minimizing
 *   language. That is culturally normative modesty, and IG-S09 forbids treating it
 *   as a deficiency. v1.7 says explicitly: do not fire RT-06 on collective
 *   attribution.
 *
 *   H-028 (RT-09) as seeded carries a placeholder asking for a paraphrase where
 *   every other template demands the user's exact words. IG-INT10 and IG-INT12
 *   would reject the output at runtime, so career returners would get silence from
 *   a card that looks functional.
 *
 * ── HOW IT AVOIDS CLOBBERING A HAND EDIT ─────────────────────────────────
 * It parses BOTH versions. A component is only replaced when what the database
 * currently holds is byte-identical to what v1.1 produced — proof that nobody has
 * touched it. Anything else is reported and left alone: already at v1.7 (a re-run),
 * or edited by hand, which is hers to reconcile and not a script's business.
 *
 * ── WHY A NEW COMPONENT VERSION AND NOT AN UPDATE ────────────────────────
 * `heuristic_components` is versioned: the old row stays, flagged not-current, and
 * the new row records what it supersedes. An application logged last week still
 * points at the wording that was actually used. That machinery already exists in
 * `heuristics-store.reviseComponent`, so this uses it rather than writing SQL.
 *
 * ── H-033 IS RETIRED, NOT DELETED ────────────────────────────────────────
 * RT-14 is gone from v1.7. A card is never deleted — a retired row stays as a
 * permanent record so historical applications remain interpretable, and
 * `getSequenceCards` already skips retired cards, so retiring is sufficient to
 * take it out of every catalogue.
 */

const APPLY = process.argv.indexOf("--apply") >= 0;

let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

/** v2 component key → `heuristic_component_type`, plus the two synthetic rows. */
type ComponentRow = { componentType: string; content: string };

function rowsFor(seed: SeedCard): ComponentRow[] {
  return seedRows(seed).components;
}

/**
 * Every element of a parse, mapped to the rows a seed would write.
 *
 * `source` matters. The prior side has to reproduce what was ACTUALLY seeded, which
 * cited v1.1 in its provenance block — so mapping it with the current constant
 * would make all 41 notes rows differ from what is stored, and every one of them
 * would be reported as edited by hand.
 */
function seedsOf(parsed: IntakeParseResult, source: string): Map<string, SeedCard> {
  const out = new Map<string, SeedCard>();
  for (const c of parsed.cards) out.set(c.cardCode, intakeCardToSeed(c, source));
  for (const g of parsed.gates) out.set(g.cardCode, intakeGateToSeed(g, source));
  return out;
}

async function main() {
  ({ db, pool } = await initScript());
  // After initScript, so the pool is built from the hydrated secret.
  const store = await import("./heuristics-store");

  const current = parseIntake(readFileSync(INTAKE_SOURCE, "utf8"));
  const prior = parseIntake(readFileSync(PRIOR_INTAKE_SOURCE, "utf8"));

  if (current.cards.length !== 28 || current.gates.length !== 13) {
    throw new Error(
      `Expected 28 cards and 13 gates in v1.7, parsed ${current.cards.length} and ` +
        `${current.gates.length}.`,
    );
  }

  const now = seedsOf(current, INTAKE_SOURCE);
  const was = seedsOf(prior, PRIOR_INTAKE_SOURCE);

  console.log(
    `\n${APPLY ? "Updating" : "Report only"}: ${PRIOR_INTAKE_SOURCE}\n` +
      `                → ${INTAKE_SOURCE}\n`,
  );

  /* ── What the database holds today ────────────────────────────────────── */
  const codes = Array.from(new Set(Array.from(now.keys()).concat(Array.from(was.keys()))));
  const seeded = await db
    .select({ id: heuristics.id, cardCode: heuristics.cardCode, status: heuristics.status })
    .from(heuristics)
    .where(inArray(heuristics.cardCode, codes));
  const idByCode = new Map(seeded.map((r) => [r.cardCode, r.id]));
  const statusByCode = new Map(seeded.map((r) => [r.cardCode, r.status as string]));

  if (!seeded.length) {
    console.log("  Nothing is seeded. Run wing:seed-intake instead.\n");
    await pool.end();
    return;
  }

  let replaced = 0;
  let alreadyCurrent = 0;
  let handEdited = 0;
  let notSeeded = 0;
  const handEditedDetail: string[] = [];
  /*
   * Notes-only revisions are separated from content in the report. A card's
   * provenance block cites the document and line it came from, so every one of them
   * changes when the document does — and a reviewer who cannot tell "her wording
   * changed" from "the citation now points at v1.7" will read neither.
   */
  const reCited: string[] = [];

  for (const code of Array.from(now.keys())) {
    const id = idByCode.get(code);
    if (id === undefined) {
      notSeeded++;
      console.log(`  ${code.padEnd(9)} not seeded — wing:seed-intake will add it`);
      continue;
    }

    const target = rowsFor(now.get(code)!);
    const before = was.has(code) ? rowsFor(was.get(code)!) : [];
    const beforeByType = new Map(before.map((r) => [r.componentType, r.content]));

    const stored = await db
      .select({
        componentType: heuristicComponents.componentType,
        content: heuristicComponents.content,
      })
      .from(heuristicComponents)
      .where(
        and(
          eq(heuristicComponents.heuristicId, id),
          eq(heuristicComponents.isCurrent, true),
        ),
      );
    const storedByType = new Map(stored.map((r) => [r.componentType as string, r.content]));

    for (const row of target) {
      const held = storedByType.get(row.componentType);
      if (held === row.content) {
        alreadyCurrent++;
        continue;
      }
      /*
       * The whole safety property of this script. A component is replaced only
       * when what is stored is exactly what v1.1 produced. `undefined` counts as
       * untouched too: a component the old version did not have cannot have been
       * edited.
       */
      const wasValue = beforeByType.get(row.componentType);
      const untouched = held === wasValue || (held === undefined && wasValue === undefined);
      if (!untouched) {
        handEdited++;
        handEditedDetail.push(`${code} ${row.componentType}`);
        continue;
      }

      if (row.componentType === "notes") reCited.push(code);
      else console.log(`  ${code.padEnd(9)} ${row.componentType}`);
      if (APPLY) {
        await store.reviseComponent({
          heuristicId: id,
          componentType: row.componentType as never,
          content: row.content,
        });
      }
      replaced++;
    }
  }

  /* ── Cards v1.7 dropped ───────────────────────────────────────────────── */
  const dropped = Array.from(was.keys()).filter((code) => !now.has(code));
  for (const code of dropped) {
    const id = idByCode.get(code);
    if (id === undefined) continue;
    if (statusByCode.get(code) === "retired") {
      console.log(`  ${code.padEnd(9)} already retired`);
      continue;
    }
    console.log(`  ${code.padEnd(9)} RETIRE — dropped from v1.7`);
    if (APPLY) await store.setHeuristicStatus(id, "retired");
  }

  console.log(
    `\n  ${replaced} component(s) ${APPLY ? "revised" : "would be revised"}, ` +
      `${alreadyCurrent} already at v1.7, ${dropped.length} card(s) retired` +
      `${notSeeded ? `, ${notSeeded} not seeded` : ""}.`,
  );

  if (reCited.length) {
    console.log(
      `\n  ${reCited.length} provenance block(s) re-cited to v1.7 — no methodology change:\n` +
        `    ${reCited.join(", ")}\n` +
        "  Each one names the document and line a reviewer should check the card\n" +
        "  against, and v1.1 is discarded. Leaving them would point at a dead source.",
    );
  }

  if (handEdited) {
    console.log(
      `\n  ${handEdited} component(s) match NEITHER version and were left alone:\n` +
        `    ${handEditedDetail.join(", ")}\n` +
        "  Those have been edited since seeding. Reconcile them in the admin editor\n" +
        "  against v1.7 — a script cannot know whether the edit or the document is\n" +
        "  the intended text.",
    );
  }

  console.log(
    "\n  Component versions are appended, not overwritten: the previous rows stay,\n" +
      "  flagged not-current, so an application logged last week still points at the\n" +
      "  wording that was actually used.\n",
  );

  if (!APPLY) console.log("  Re-run with --apply to write.\n");

  await pool.end();
}

main().catch(async (err) => {
  console.error("\n[update-intake] failed:", (err as Error).message);
  await pool?.end().catch(() => {});
  process.exit(1);
});
