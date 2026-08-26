/**
 * `replaceable` — the rule that decides whether a seeded component may be overwritten.
 *
 * Run:  npx tsx server/wing/revision-safety.test.ts
 *
 * ── WHY THIS IS WORTH A SUITE OF ITS OWN ─────────────────────────────────
 * It is the only thing standing between a document revision and silently destroying
 * Danielle's own edits in the admin editor. A seed prints what it wrote and not what it
 * replaced, so getting this wrong produces no error, no diff, and no way to find out.
 *
 * It also had to change for v1.8, from "matches the one prior version" to "matches any
 * released version", and that change is the kind that looks harmless. The seed run that
 * should have written these rows threw at card 2 of 42, so the database may hold rows from
 * v1.1 or v1.7 or both. A rule that accepted only the newest prior would call every row
 * from the other version hand-edited and skip all of it.
 */
import { replaceable } from "./seed-shared";

let failures = 0;
const fail = (msg: string) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
const ok = (msg: string) => console.log(`  ok — ${msg}`);

const V17 = "methodology/wing-intake-heuristic-cards-v1.7.md";
const V11 = "methodology/wing-intake-heuristic-cards-v1.1.md";

console.log("\nreplaceable\n");

console.log("A row matching any released version may be replaced, and says which");
{
  const before = failures;
  const accepted = [
    { source: V17, content: "what v1.7 produced" },
    { source: V11, content: "what v1.1 produced" },
  ];

  const newest = replaceable("what v1.7 produced", accepted);
  if (!newest.untouched) fail("a row matching the newest prior is untouched");
  if (newest.matched !== V17) fail(`matched ${newest.matched}, expected v1.7`);

  /*
   * The case the v1.8 move exists for. Before this rule accepted more than one version,
   * this row would have been reported as edited by hand and skipped.
   */
  const older = replaceable("what v1.1 produced", accepted);
  if (!older.untouched) fail("a row matching an OLDER prior is untouched too");
  if (older.matched !== V11) fail(`matched ${older.matched}, expected v1.1`);

  if (failures === before) ok("both versions accepted, and the report can name which one");
}

console.log("\nA hand edit is never overwritten");
{
  const before = failures;
  const accepted = [{ source: V17, content: "her original wording" }];

  const edited = replaceable("her original wording, with a fix she made", accepted);
  if (edited.untouched) fail("an edited row must not be replaceable");
  if (edited.matched !== null) fail("nothing matched, so nothing should be named");

  // Whitespace is not a licence. Byte-identical means byte-identical.
  if (replaceable("her original wording ", accepted).untouched) {
    fail("a trailing space is still a difference; a fuzzy match here is a data loss bug");
  }
  if (replaceable("", accepted).untouched) fail("emptied by hand is still a hand edit");
  if (failures === before) ok("altered, padded and emptied rows are all left alone");
}

console.log("\nAbsence means untouched only when no version had the component");
{
  const before = failures;
  /*
   * A component no released version carried cannot have been edited, so a new component
   * is free to be added.
   */
  if (!replaceable(undefined, []).untouched) {
    fail("a component no prior version had is a new one, and may be written");
  }
  if (replaceable(undefined, []).matched !== null) fail("there was no version to match");

  /*
   * The inverse, which is the subtle half. A component a version DID carry and which is
   * now gone was deleted by someone. Treating that as untouched would re-add a row a
   * human removed on purpose, which is the same data loss in the other direction.
   */
  if (replaceable(undefined, [{ source: V17, content: "the wording she deleted" }]).untouched) {
    fail("a deleted component is an edit, not an absence");
  }
  if (failures === before) ok("a new component writes; a deleted one is respected");
}

console.log("\nDuplicate content across versions does not confuse the report");
{
  const before = failures;
  /*
   * Most components did not change between v1.7 and v1.8, so identical content under two
   * sources is the common case rather than an edge one. Newest-first order is what makes
   * the attribution useful: the row is reported as the most recent version it could have
   * come from.
   */
  const accepted = [
    { source: V17, content: "unchanged between versions" },
    { source: V11, content: "unchanged between versions" },
  ];
  const v = replaceable("unchanged between versions", accepted);
  if (!v.untouched) fail("identical content across versions is still untouched");
  if (v.matched !== V17) fail(`attributed to ${v.matched}; newest first is the useful answer`);
  if (failures === before) ok("identical content attributes to the newest version that has it");
}

console.log(failures ? `\n${failures} failure(s)\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);
