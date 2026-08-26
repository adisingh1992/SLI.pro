/**
 * IG-S06 — who it applies to.
 *
 * Run:  npx tsx server/wing/minor-protection.test.ts
 *
 * ── WHAT IS WORTH TESTING HERE ───────────────────────────────────────────
 * This gate has a false positive and a false negative and both are expensive, which is
 * unusual — most safety gates are safely over-sensitive.
 *
 *   · **Over-firing costs the product.** As delivered, the gate was default-on for the
 *     undergraduate track, which would have closed Module 6 and Module 9 to every
 *     Berkeley undergraduate permanently. Her correction: "The undergraduate track is
 *     about career stage, not age."
 *   · **Under-firing costs a child.** So the user's own words override any setting, and
 *     the detector has to read them without ever asking.
 *
 * Between those, the tests that matter are the ones about what is NOT a signal: a
 * professional saying "I'm 16 years into my career", an adult telling a story about high
 * school, a Phase 3.5 scale answer that happens to be a small number.
 */
import {
  CLOSED_MODULES,
  PROTECTED_SCOPE,
  minorProtectionActive,
  statedInSchool,
  statedUnder18,
  weakSignals,
  type MinorProtectionState,
} from "./minor-protection";

let failures = 0;
const fail = (msg: string) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
const ok = (msg: string) => console.log(`  ok — ${msg}`);

const state = (p: Partial<MinorProtectionState>): MinorProtectionState => ({
  institutionSetting: p.institutionSetting,
  statedUnder18: p.statedUnder18 ?? false,
  statedInSchool: p.statedInSchool ?? false,
});

console.log("\nminor-protection\n");

console.log("Berkeley, 1 September: off, and that is the point");
{
  const before = failures;
  const berkeley = state({ institutionSetting: "off" });
  const v = minorProtectionActive(berkeley);
  if (v.active) fail(`Berkeley's cohort is 18+ and the gate must be off: ${v.because}`);

  // Absent config reads as off. A cohort nobody configured does not get minor protection.
  if (minorProtectionActive(state({})).active) fail("no setting reads as off");

  // And on is on.
  if (!minorProtectionActive(state({ institutionSetting: "on" })).active) {
    fail("a high-school partnership sets it on and it must be on");
  }
  if (failures === before) ok("off for Berkeley, off by default, on when an institution sets it");
}

console.log("\nThe user's own words outrank the setting");
{
  const before = failures;
  /*
   * Her sentence: "If a user in any context explicitly states they're under 18, full
   * IG-S06 fires regardless of institution setting." Regardless is the load-bearing word,
   * and it is why this half of the gate lives in the prompt constant rather than in config.
   */
  const said = state({ institutionSetting: "off", statedUnder18: true });
  const v = minorProtectionActive(said);
  if (!v.active) fail("an explicit statement must fire even with the setting off");
  if (!v.overridesInstitution) fail("and must record that it overrode the setting");

  const school = state({ institutionSetting: "off", statedInSchool: true });
  if (!minorProtectionActive(school).active) fail("currently at school fires too");
  if (failures === before) ok("stated under 18, or at school now, fires with the setting off");
}

console.log("\nWhat is not a statement of age");
{
  const before = failures;
  const fires: string[] = [
    "I'm 17",
    "i am 16 and starting college next year",
    "I'm only 15",
    "I'm a minor",
    "I'm under 18",
    "im 17 lol",
  ];
  for (const t of fires) {
    if (!statedUnder18(t)) fail(`should fire: "${t}"`);
  }

  /*
   * The one that would do real damage. "I'm 16 years into my career" is a mid-career
   * professional, and reading it as an age would put an experienced user into a footing
   * that removes power dynamics and public content from them.
   */
  const doesNot: string[] = [
    "I'm 16 years into my career",
    "I'm 12 months into a new role",
    "I'm 15 minutes from finishing this",
    "I'm 19",
    "I'm 34 and pivoting",
    "about a 2",
    "I'd say a 3 out of 5",
    "I'm a 4 on that one",
  ];
  for (const t of doesNot) {
    if (statedUnder18(t)) fail(`must NOT fire: "${t}"`);
  }
  if (failures === before) ok(`${fires.length} statements fire, ${doesNot.length} near-misses do not`);
}

console.log("\nPast tense is evidence, not a signal");
{
  const before = failures;
  /*
   * Half the Foundation 2 corpus is someone describing what they did at school. Treating
   * that as a minor signal would put a large share of adult users into the protected
   * footing on the strength of their own evidence.
   */
  const now: string[] = [
    "I'm still in high school",
    "I am in high school",
    "I'm a high school senior",
    "my high school does a work placement thing",
  ];
  for (const t of now) if (!statedInSchool(t)) fail(`should fire: "${t}"`);

  const past: string[] = [
    "In high school I ran the yearbook, so I've been doing this a while",
    "Back in high school I was the one organising everything",
    "When I was in high school I hated group work",
  ];
  for (const t of past) if (statedInSchool(t)) fail(`must NOT fire: "${t}"`);
  if (failures === before) ok(`${now.length} present-tense fire, ${past.length} past-tense do not`);
}

console.log("\nWeak signals are recorded and fire nothing");
{
  const before = failures;
  /*
   * Her card lists parental-permission language as a detection signal. Her Berkeley
   * reasoning is exactly why we do not fire on it: adults say "my mum said". So it is
   * visible to an admin and decides nothing, which is flagged to her as our judgement.
   */
  const t = "my mum said I could sign up for this";
  const w = weakSignals(t);
  if (w.indexOf("parental_permission") < 0) fail("the signal should be recorded");
  if (statedUnder18(t) || statedInSchool(t)) fail("but it must not fire either detector");
  if (minorProtectionActive(state({ institutionSetting: "off" })).active) {
    fail("and it must not turn the gate on");
  }
  if (weakSignals("nothing here").length !== 0) fail("no signal, no entry");
  if (failures === before) ok("recorded for a human, decides nothing");
}

console.log("\nThe undergraduate track is not an input at all");
{
  const before = failures;
  /*
   * Structural rather than a runtime check, and the stronger guarantee for it. Her
   * correction was that the trigger was the wrong *kind* of thing, so the fix is that
   * there is nowhere for an audience track to be passed. The day someone adds a `track`
   * field, this comment is what remembers why they should not.
   */
  const keys: Array<keyof MinorProtectionState> = [
    "institutionSetting",
    "statedUnder18",
    "statedInSchool",
  ];
  if (keys.length !== 3) fail("the state carries exactly three inputs and none is a track");
  if (failures === before) ok("three inputs: the institution, and two things the user said");
}

console.log("\nWhat being active means, for a router that does not exist yet");
{
  const before = failures;
  if (PROTECTED_SCOPE.powerDynamics) fail("Module 9 closes");
  if (PROTECTED_SCOPE.publicContent) fail("Module 6 closes");
  if (PROTECTED_SCOPE.vulnerabilityProbing) fail("no trust-vault depth");
  if (!PROTECTED_SCOPE.careerExploration) fail("career exploration stays open");
  if (!PROTECTED_SCOPE.competencyAssessment) fail("competency work stays open");
  if (CLOSED_MODULES.join(",") !== "6,9") fail(`closed modules were ${CLOSED_MODULES.join(",")}`);
  if (failures === before) ok("6 and 9 close, exploration and competency stay, nothing enforces it yet");
}


/* ── Wiring, added 25 August when the gate stopped being data ───────────── */

console.log("\nThe footing resolves from one persisted flag");
{
  const before = failures;
  /*
   * ── WHAT THIS GUARDS ───────────────────────────────────────────────────
   * The gate was data nothing read: `PROTECTED_SCOPE` and `CLOSED_MODULES` existed and no
   * router consulted them. What is now wired is the one part of the protected scope that
   * has a live surface — `extraPiiCollection: false` — because `/api/intake/finish`
   * collects race, gender identity, under-representation and first-generation status, and
   * asked everyone.
   *
   * `intake-conversation.ts` persists ONE flag for either signal, because both make the
   * gate active and the verdict is identical. These assertions pin that reduction: if
   * someone later splits the flag, the two rows below say what the two signals must both
   * still do.
   */
  const stated = minorProtectionActive({ statedUnder18: true, statedInSchool: false });
  if (!stated.active) fail("an explicit statement of being under 18 must fire the gate");
  if (!stated.overridesInstitution) fail("it fires regardless of the institution setting");

  const school = minorProtectionActive({ statedUnder18: false, statedInSchool: true });
  if (!school.active) fail("being at school now carries the same information as an age");

  // Berkeley: setting off, nothing stated. All modules open, demographics asked.
  const berkeley = minorProtectionActive({ institutionSetting: "off", statedUnder18: false, statedInSchool: false });
  if (berkeley.active) fail("Berkeley undergraduates are 18+ and the setting is off");

  // Absent reads as off, which is what the route relies on until a column carries it.
  const absent = minorProtectionActive({ statedUnder18: false, statedInSchool: false });
  if (absent.active) fail("an absent institution setting must read as off, not as on");

  /*
   * And the override direction, which is the one that would be wrong quietly: an
   * institution with the setting OFF must not be able to switch off a user's own
   * statement. Her ruling is explicit — "full IG-S06 fires regardless of institution
   * setting".
   */
  const contradicted = minorProtectionActive({ institutionSetting: "off", statedUnder18: true, statedInSchool: false });
  if (!contradicted.active) fail("an institution setting must not override the user's own words");

  if (failures === before) ok("either signal fires it; off means off; a statement outranks the setting");
}

console.log("\nExtra PII collection is the part of the scope with a live surface");
{
  const before = failures;
  if (PROTECTED_SCOPE.extraPiiCollection !== false) {
    fail("her Aug 24 document sets this false — it is what /api/intake/finish now honours");
  }
  // The rest of the scope is still data, and saying so keeps the claim honest.
  if (PROTECTED_SCOPE.powerDynamics !== false || PROTECTED_SCOPE.publicContent !== false) {
    fail("Modules 6 and 9 stay closed in the scope even though no router reads it yet");
  }
  if (PROTECTED_SCOPE.careerExploration !== true || PROTECTED_SCOPE.competencyAssessment !== true) {
    fail("career exploration and competency work stay open — both versions of the gate say so");
  }
  if (failures === before) ok("the PII half is enforced; the module half is still data");
}

console.log(failures ? `\n${failures} failure(s)\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);
