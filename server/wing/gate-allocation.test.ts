/**
 * Her gate allocation rule.
 *
 * Run:  npx tsx server/wing/gate-allocation.test.ts
 *
 * ── WHAT IS WORTH TESTING HERE ───────────────────────────────────────────
 * The Module 11 trio has been renumbered three times in eight days, and both collisions
 * were found the same way — a person reading two documents side by side. Neither was
 * found by anything running.
 *
 * That is what makes this worth a suite. A numbering collision does not throw: a row
 * renamed once stops answering to the code the document shows, so the corrections script
 * finds nothing, prints "not seeded, nothing to rename", exits clean, and leaves the
 * database disagreeing with the parser. The failure is a successful-looking run.
 *
 * So the tests are about the detector working, not about the current state being tidy.
 */
import {
  BANDS,
  NEXT_FREE,
  RETIRED,
  allocationViolations,
  bandFor,
  bandsAreCoherent,
  numberOf,
} from "./gate-allocation";
import { CORRECTIONS } from "./parse-compendium";

let failures = 0;
const fail = (msg: string) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
const ok = (msg: string) => console.log(`  ok — ${msg}`);

console.log("\ngate-allocation\n");

console.log("Her blocks, as she wrote them");
{
  const before = failures;
  const c = bandsAreCoherent();
  if (!c.ok) fail(`the blocks do not tile: ${c.why}`);

  const expect: Array<[string, string]> = [
    ["IG-U006", "research_derived_universal"],
    ["IG-U011", "research_derived_universal"],
    ["IG-U012", "platform_wide"],
    ["IG-U017", "platform_wide"],
    ["IG-U018", "module_11"],
    ["IG-U020", "module_11"],
  ];
  for (const e of expect) {
    const b = bandFor(e[0]);
    if (b?.owner !== e[1]) fail(`${e[0]} → ${b?.owner ?? "no band"}, expected ${e[1]}`);
  }
  if (bandFor(`IG-U0${NEXT_FREE}`) !== null) {
    fail("IG-U021 is not allocated yet — she assigns it");
  }
  if (NEXT_FREE !== 21) fail(`"Future universal gates start at IG-U021", found ${NEXT_FREE}`);
  if (failures === before) ok(`${BANDS.length} blocks, ${c.why}`);
}

console.log("\nThe collision that happened twice is detectable");
{
  const before = failures;
  /*
   * The exact state of 25 August: the Module 11 trio sitting on IG-U012–014 while her
   * platform-wide document assigns those same three numbers to Evidence Grade, Role-Aware
   * Summarization and Evidence Over Self-Rating. Nothing errored. It was noticed.
   */
  const collided = allocationViolations([
    { code: "IG-U012", owner: "platform_wide" },
    { code: "IG-U013", owner: "platform_wide" },
    { code: "IG-U014", owner: "platform_wide" },
    { code: "IG-U012", owner: "module_11" },
    { code: "IG-U013", owner: "module_11" },
    { code: "IG-U014", owner: "module_11" },
  ]);
  if (collided.length < 3) {
    fail(`the double-claim produced ${collided.length} violations, expected at least 3`);
  }
  let named = 0;
  for (const v of collided) if (v.problem.indexOf("claimed by both") >= 0) named++;
  if (named !== 3) fail(`${named} of 3 collisions named as a double claim`);

  // And the resolved state is clean.
  const resolved = allocationViolations([
    { code: "IG-U012", owner: "platform_wide" },
    { code: "IG-U013", owner: "platform_wide" },
    { code: "IG-U014", owner: "platform_wide" },
    { code: "IG-U018", owner: "module_11" },
    { code: "IG-U019", owner: "module_11" },
    { code: "IG-U020", owner: "module_11" },
    { code: "IG-U006", owner: "research_derived_universal" },
    { code: "IG-U011", owner: "research_derived_universal" },
  ]);
  if (resolved.length !== 0) {
    fail(`her allocation should be clean, got: ${resolved.map((v) => v.code).join(", ")}`);
  }
  if (failures === before) ok("the 25 August state reports 3 collisions; her allocation reports none");
}

console.log("\nA gate in the wrong block is caught even with no double claim");
{
  const before = failures;
  // Module 11 reaching into the platform block, which is how the last two moves started.
  const wrong = allocationViolations([{ code: "IG-U015", owner: "module_11" }]);
  if (wrong.length !== 1) fail(`expected 1 violation, got ${wrong.length}`);
  if (wrong[0] && wrong[0].problem.indexOf("platform_wide") < 0) {
    fail("the violation should name who does own the block");
  }

  // Above the range: she assigns those, we do not.
  const above = allocationViolations([{ code: "IG-U025", owner: "module_11" }]);
  if (above.length !== 1 || (above[0] && above[0].problem.indexOf("she assigns") < 0)) {
    fail("a code above the allocated range should point at her, not guess an owner");
  }

  // Retired codes are below the range and stay retired.
  for (const r of RETIRED) {
    if (numberOf(r) === null) fail(`${r} should still parse as an IG-U code`);
    if (bandFor(r) !== null) fail(`${r} is retired and belongs to no block`);
  }

  // Anything that is not an IG-U code is not governed here.
  if (allocationViolations([{ code: "H-019.5", owner: "module_11" }]).length !== 0) {
    fail("H codes are not this rule's business");
  }
  if (numberOf("IG-INT06") !== null) fail("IG-INT codes are a different family");
  if (numberOf("IG-S06") !== null) fail("IG-S codes are a different family");

  if (failures === before) ok("wrong block, above range, retired and other families all handled");
}

console.log("\nThe corrections table agrees with her allocation");
{
  const before = failures;
  /*
   * The point of connecting these two: the allocation rule is only worth anything if the
   * thing that actually renames rows obeys it. So the recodes are read out of the
   * corrections table rather than restated here.
   */
  const trio = ["IG-U03", "IG-U04", "IG-U05"];
  const targets: string[] = [];
  for (const c of CORRECTIONS) {
    if (c.kind !== "recode") continue;
    if (trio.indexOf(c.from) < 0) continue;
    targets.push(c.to);
    const b = bandFor(c.to);
    if (b?.owner !== "module_11") {
      fail(`${c.from} → ${c.to} lands in ${b?.owner ?? "no block"}, not Module 11's`);
    }
    /*
     * Most recent first, and it has to include the code the rows answer to today. Without
     * IG-U012 in this list the script looks for IG-U03, finds nothing, and reports a
     * clean run while the database keeps the old number.
     */
    const sf = c.supersededFrom ?? [];
    if (sf.length < 2) fail(`${c.from} has ${sf.length} superseded code(s); it has moved twice`);
    if (sf[0] !== undefined && bandFor(sf[0])?.owner !== "platform_wide") {
      fail(`${c.from}'s most recent superseded code should be the platform-band one it held`);
    }
  }
  if (targets.length !== 3) fail(`found ${targets.length} of the 3 Module 11 recodes`);
  if (targets.sort().join(",") !== "IG-U018,IG-U019,IG-U020") {
    fail(`the trio targets ${targets.join(",")}`);
  }
  if (failures === before) ok(`${targets.length} recodes → ${targets.join(", ")}, superseded chains intact`);
}

console.log(failures ? `\n${failures} failure(s)\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);
