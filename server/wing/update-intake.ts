import { readFileSync } from "node:fs";
import { and, eq, inArray } from "drizzle-orm";
import { initScript, type ScriptDb } from "../script-init";
import { heuristicComponents, heuristics } from "@shared/wing-schema";
import { INTAKE_SOURCE, PRIOR_INTAKE_SOURCES, parseIntake } from "./parse-intake";
import { replaceable, seedRows, seedsOf, type SeedCard } from "./seed-shared";

/**
 * Moves the seeded intake cards up to the current intake document.
 *
 *     npm run wing:update-intake            report only
 *     npm run wing:update-intake -- --apply write
 *
 * The source and the versions it accepts are `INTAKE_SOURCE` and
 * `PRIOR_INTAKE_SOURCES` in `parse-intake.ts`. As of 25 August that is v1.8, accepting
 * rows from v1.7 or v1.1.
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
 * It parses EVERY released version. A component is only replaced when what the database
 * currently holds is byte-identical to what one of them produced — proof that a seed wrote
 * it and not a person. Anything else is reported and left alone: already current (a
 * re-run), or edited by hand, which is hers to reconcile and not a script's business. The
 * rule is `replaceable()` in `seed-shared.ts`, pure and tested, because it is the one
 * thing here that must not be wrong and a seeder is the worst place to exercise it.
 *
 * Accepting ANY released version rather than the newest is not tidiness. The seed run that
 * should have written these rows threw at card 2 of 42 on the ELICIT enum, so the database
 * may hold rows from one version or two, and nobody can tell from here which. Comparing
 * against a single prior would report every row from the other version as hand-edited: a
 * run that refuses safely, looks like a disaster, and costs a day. The report says which
 * version each row matched instead.
 *
 * ── WHY A NEW COMPONENT VERSION AND NOT AN UPDATE ────────────────────────
 * `heuristic_components` is versioned: the old row stays, flagged not-current, and
 * the new row records what it supersedes. An application logged last week still
 * points at the wording that was actually used. That machinery already exists in
 * `heuristics-store.reviseComponent`, so this uses it rather than writing SQL.
 *
 * ── H-033 IS RETIRED, NOT DELETED ────────────────────────────────────────
 * RT-14 is gone from v1.7 and v1.8. A card is never deleted — a retired row stays as a
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

async function main() {
  ({ db, pool } = await initScript());
  // After initScript, so the pool is built from the hydrated secret.
  const store = await import("./heuristics-store");

  const current = parseIntake(readFileSync(INTAKE_SOURCE, "utf8"));

  if (current.cards.length !== 28 || current.gates.length !== 13) {
    throw new Error(
      `Expected 28 cards and 13 gates in ${INTAKE_SOURCE}, parsed ` +
        `${current.cards.length} and ${current.gates.length}.`,
    );
  }

  /*
   * Her approved corrections go on the CURRENT side only. The prior side has to reproduce
   * what a past seed actually wrote, and no past seed applied a patch that did not exist
   * yet — patch both and every correction reads as already applied and is never written.
   */
  const now = seedsOf(current, INTAKE_SOURCE, "apply-approved-corrections");
  /*
   * One `was` map per released version, newest first, each mapped with ITS OWN source
   * path. The provenance block cites the document a card came from, so a row seeded from
   * v1.7 and compared only against v1.1 differs in its notes for a reason that has nothing
   * to do with anyone editing it: all 41 would be reported as hand-edited and skipped.
   *
   * Which version the rows actually came from is not knowable from here — the seed run
   * that was supposed to write them threw at card 2 of 42 on the ELICIT enum, so the
   * database may hold one card or forty-one. Reporting the version each row matched is the
   * honest alternative to picking one and being wrong about the rest.
   */
  const priors = PRIOR_INTAKE_SOURCES.map((source) => ({
    source,
    was: seedsOf(parseIntake(readFileSync(source, "utf8")), source, "as-delivered"),
  }));

  console.log(
    `\n${APPLY ? "Updating" : "Report only"}: → ${INTAKE_SOURCE}\n` +
      `  accepting rows that match any of: ${PRIOR_INTAKE_SOURCES.join(", ")}\n`,
  );

  /* ── What the database holds today ────────────────────────────────────── */
  const codes = Array.from(
    new Set(
      Array.from(now.keys()).concat(...priors.map((p) => Array.from(p.was.keys()))),
    ),
  );
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
  /**
   * How many components matched each released version.
   *
   * The only evidence available about what the database was actually seeded from, and it
   * is worth printing: a mixture across two versions means a partial run, which is exactly
   * what the ELICIT failure produced and exactly what nobody could see afterwards.
   */
  const matchedVersion: Record<string, number> = {};

  for (const code of Array.from(now.keys())) {
    const id = idByCode.get(code);
    if (id === undefined) {
      notSeeded++;
      console.log(`  ${code.padEnd(9)} not seeded — wing:seed-intake will add it`);
      continue;
    }

    const target = rowsFor(now.get(code)!);
    /*
     * The accepted prior values for each component, one per released version. A row
     * matching any of them was written by a seed and not by a person.
     */
    const acceptedByType = new Map<string, Array<{ source: string; content: string }>>();
    for (const p of priors) {
      if (!p.was.has(code)) continue;
      for (const r of rowsFor(p.was.get(code)!)) {
        const list = acceptedByType.get(r.componentType) ?? [];
        list.push({ source: p.source, content: r.content });
        acceptedByType.set(r.componentType, list);
      }
    }

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
      const verdict = replaceable(held, acceptedByType.get(row.componentType) ?? []);
      if (!verdict.untouched) {
        handEdited++;
        handEditedDetail.push(`${code} ${row.componentType}`);
        continue;
      }
      if (verdict.matched) {
        matchedVersion[verdict.matched] = (matchedVersion[verdict.matched] ?? 0) + 1;
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

  /* ── Cards the current version dropped ────────────────────────────────── */
  const everPresent = new Set<string>();
  for (const p of priors) for (const code of Array.from(p.was.keys())) everPresent.add(code);
  const dropped = Array.from(everPresent).filter((code) => !now.has(code));
  for (const code of dropped) {
    const id = idByCode.get(code);
    if (id === undefined) continue;
    if (statusByCode.get(code) === "retired") {
      console.log(`  ${code.padEnd(9)} already retired`);
      continue;
    }
    console.log(`  ${code.padEnd(9)} RETIRE — not in ${INTAKE_SOURCE}`);
    if (APPLY) await store.setHeuristicStatus(id, "retired");
  }

  console.log(
    `\n  ${replaced} component(s) ${APPLY ? "revised" : "would be revised"}, ` +
      `${alreadyCurrent} already current, ${dropped.length} card(s) retired` +
      `${notSeeded ? `, ${notSeeded} not seeded` : ""}.`,
  );

  if (reCited.length) {
    console.log(
      `\n  ${reCited.length} provenance block(s) re-cited — no methodology change:\n` +
        `    ${reCited.join(", ")}\n` +
        "  Each one names the document and line a reviewer should check the card\n" +
        "  against, and the prior versions are discarded. Leaving them would point at\n" +
        "  a dead source.",
    );
  }

  const matchedEntries = Object.keys(matchedVersion);
  if (matchedEntries.length) {
    console.log(
      "\n  What the database was actually seeded from, by component match:\n" +
        matchedEntries.map((k) => `    ${matchedVersion[k]} × ${k}`).join("\n") +
        (matchedEntries.length > 1
          ? "\n  More than one version matched, so the rows came from a partial run. That is\n" +
            "  what the ELICIT enum failure produced, and it was invisible afterwards."
          : ""),
    );
  }

  if (handEdited) {
    console.log(
      `\n  ${handEdited} component(s) match NO released version and were left alone:\n` +
        `    ${handEditedDetail.join(", ")}\n` +
        "  Those have been edited since seeding. Reconcile them in the admin editor\n" +
        `  against ${INTAKE_SOURCE} — a script cannot know whether the edit or the\n` +
        "  document is the intended text.",
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
