import { eq } from "drizzle-orm";
import { initScript, type ScriptDb } from "../script-init";
import { gateAuditFindings, heuristics } from "@shared/wing-schema";
import { CORRECTIONS, renameForCode } from "./parse-compendium";

/**
 * Applies the approved card-code corrections to already-seeded cards.
 *
 *     npm run wing:apply-corrections            report only
 *     npm run wing:apply-corrections -- --apply write
 *
 * ── WHY A RENAME AND NOT A RE-SEED ───────────────────────────────────────
 * The 53 Tier 1 cards are seeded, sequence version 5 is built from their ids, and
 * SLI.pro Direct 2026 points at it. A re-seed would mint new rows with new ids,
 * which orphans the sequence, forces a rebuild, and forces a second publish with a
 * second mid-cycle override — all to change five strings.
 *
 * `card_code` is a column, not an identity. Renaming it in place leaves every id,
 * every sequence entry and the cycle pointer exactly as they are. Nothing needs
 * republishing and no student's methodology changes: the same cards fire, under the
 * numbers Danielle approved on 18 August.
 *
 * ── WHY THE CODE IS ALSO IN THE NAME ─────────────────────────────────────
 * The methodology writes the code into the card's name — "H-308 Wing chunked
 * messaging" — and the name is what the admin surface shows. Renaming the code and
 * leaving the name would put a retired number back in front of the person reading
 * the card, which is most of what the renumbering was for.
 *
 * ── WHY IT LOOKS UNDER MORE THAN ONE CODE ────────────────────────────────
 * A card can be renumbered twice. The Module 11 universal trio was, on 18 August:
 * to IG-U006–IG-U008 in the morning, then to IG-U012–IG-U014 in the afternoon when
 * her research-derived gates claimed the first block. After the morning run the
 * rows answer to IG-U006, not to the IG-U03 the document still shows — so a lookup
 * on `from` alone finds nothing and this script reports "not seeded" about a card
 * that is seeded, published, and live for a cohort. That is the worst possible
 * failure here: a clean run and a database that no longer matches the parser.
 *
 * So each correction may list the codes it has already been applied under, and the
 * lookup walks them. Whichever code the row actually holds is the one renamed away
 * from, including in the card's name.
 *
 * ── WHY THE FINDINGS ARE UPDATED TOO ─────────────────────────────────────
 * `gate_audit_findings.card_code` is denormalised on purpose, so a tuning query
 * reads in the methodology's own vocabulary. A finding recorded against IG-U04 is a
 * finding about the rule now called IG-U007 — it is the same rule, and leaving the
 * old string there would orphan the row from the rule list it exists to tune.
 */

let db: ScriptDb["db"];

/** Seeded rows holding a given card code. Typed by inference, not by hand. */
async function rowsForCode(code: string) {
  return db
    .select({ id: heuristics.id, name: heuristics.name, cardCode: heuristics.cardCode })
    .from(heuristics)
    .where(eq(heuristics.cardCode, code));
}

async function main() {
  const apply = process.argv.indexOf("--apply") >= 0;

  console.log("\nCard-code corrections — Danielle's ruling of 18 August 2026\n");

  ({ db } = await initScript());

  const recodes = CORRECTIONS.filter((c) => c.kind === "recode");
  const retypes = CORRECTIONS.filter((c) => c.kind === "interventionType");

  let renamed = 0;
  let retyped = 0;
  let findings = 0;
  let skipped = 0;

  for (const c of recodes) {
    if (c.kind !== "recode") continue;

    // Newest correction first: the document's code, then any code an earlier
    // correction already moved this card to.
    const candidates = [c.from].concat(c.supersededFrom ? c.supersededFrom.slice() : []);
    let held: string | null = null;
    let rows: Awaited<ReturnType<typeof rowsForCode>> = [];
    for (const code of candidates) {
      rows = await rowsForCode(code);
      if (rows.length) {
        held = code;
        break;
      }
    }

    if (!held) {
      /*
       * Two very different situations, and they used to print the same line.
       * "Already at the target" means this correction has run; "not seeded" means
       * the card is Tier 2 and only the 53 Tier 1 specs are in the database. A
       * report that cannot tell them apart is a report that hides a failed rename.
       */
      const done = await rowsForCode(c.to);
      console.log(
        done.length
          ? `  ${c.from} → ${c.to}   already ${c.to}, nothing to do`
          : `  ${c.from} → ${c.to}   not seeded, nothing to rename`,
      );
      continue;
    }
    if (held !== c.from) {
      console.log(`  ${c.from} → ${c.to}   seeded as ${held} by an earlier correction`);
    }

    /*
     * Refuse rather than create the collision we are removing. Nothing in
     * CORRECTIONS targets an occupied code today, and the one instruction that
     * would — H-411's gate to H-412, where H-412 is the Odyssey exercise — is
     * deliberately absent for exactly this reason.
     */
    const occupied = await db
      .select({ id: heuristics.id })
      .from(heuristics)
      .where(eq(heuristics.cardCode, c.to));
    if (occupied.length) {
      console.log(
        `  ${c.from} → ${c.to}   REFUSED: ${c.to} is already held by heuristic #${occupied[0].id}`,
      );
      skipped++;
      continue;
    }

    for (const row of rows) {
      const name = renameForCode(row.name, held, c.to);
      console.log(`  ${c.from} → ${c.to}   #${row.id}  ${name}`);
      if (apply) {
        await db
          .update(heuristics)
          .set({ cardCode: c.to, name })
          .where(eq(heuristics.id, row.id));
      }
      renamed++;
    }

    const stale = await db
      .select({ id: gateAuditFindings.id })
      .from(gateAuditFindings)
      .where(eq(gateAuditFindings.cardCode, held));
    if (stale.length) {
      console.log(`                   ${stale.length} audit finding(s) carry the old code`);
      if (apply) {
        await db
          .update(gateAuditFindings)
          .set({ cardCode: c.to })
          .where(eq(gateAuditFindings.cardCode, held));
      }
      findings += stale.length;
    }
  }

  for (const c of retypes) {
    if (c.kind !== "interventionType") continue;

    const rows = await db
      .select({ id: heuristics.id, interventionType: heuristics.interventionType })
      .from(heuristics)
      .where(eq(heuristics.cardCode, c.code));

    if (!rows.length) {
      console.log(`  ${c.code} intervention type → ${c.to}   not seeded`);
      continue;
    }
    for (const row of rows) {
      console.log(
        `  ${c.code} intervention type ${row.interventionType ?? "none"} → ${c.to}   #${row.id}`,
      );
      if (apply) {
        await db
          .update(heuristics)
          .set({ interventionType: c.to as never })
          .where(eq(heuristics.id, row.id));
      }
      retyped++;
    }
  }

  console.log(
    `\n  ${renamed} card(s) renamed, ${retyped} intervention type(s) corrected, ` +
      `${findings} finding(s) recoded${skipped ? `, ${skipped} refused` : ""}`,
  );

  if (!apply) {
    console.log("\n  Report only. Re-run with --apply to write.\n");
    return;
  }

  console.log(
    "\n  Done. No republish needed: ids, sequence entries and the cycle pointer are\n" +
      "  untouched, so the same cards stay live under their new numbers.\n",
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
