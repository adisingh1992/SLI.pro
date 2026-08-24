import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DRAFT_PATH_GATES,
  GATE_PRECONDITIONS,
  RESTATES,
  cardLabel,
  redactCardCodes,
  redactedFrom,
  NO_TIER1_SURFACE,
  compileGates,
  excludedGates,
  turnPathGates,
  type GateCard,
} from "./gate-compiler";
import { isTier1, parseCompendium } from "./parse-compendium";
import { INTAKE_SOURCE, parseIntake } from "./parse-intake";
import { RESEARCH_GATES_SOURCE, parseResearchGates } from "./parse-research-gates";

/**
 * Tests for gate compilation (methodology v2, T4).
 *
 * Two things are being defended. The first is leakage: no card code and no card
 * name may reach the prompt, because IG-U005 forbids internal methodology
 * vocabulary in user-facing output and IG-V01 forbids anything that sounds like a
 * system — and a phrase in context is a phrase the model can repeat.
 *
 * The second is size. This section goes into EVERY turn of an already-large
 * prompt, so its token cost is pinned. If a revision doubles it, that should be
 * a decision somebody makes, not something discovered from a latency graph.
 */

let failures = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${(err as Error).message}`);
  }
}

console.log("\ngate-compiler\n");

const gate = (over: Partial<GateCard> = {}): GateCard => ({
  cardCode: "H-001",
  name: "H-001 Pattern vs. Instance Enforcement",
  coachingMove: "Never call something a pattern on fewer than three instances.",
  failurePath: "Downgrade the claim to a single observation.",
  appliesToSession: null,
  ...over,
});

test("no rules means no section, not an empty heading", () => {
  // An empty "rules you must follow" heading reads to a model as though the
  // rules were withheld.
  assert.equal(compileGates([]), "");
  assert.equal(compileGates([gate({ coachingMove: null })]), "");
  assert.equal(compileGates([gate({ coachingMove: "   " })]), "");
});

test("the rule text is rendered", () => {
  const out = compileGates([gate()]);
  assert.ok(out.indexOf("Never call something a pattern") >= 0);
});

test("no card code reaches the prompt", () => {
  const out = compileGates([
    gate({ cardCode: "H-109", name: "H-109 Never Assign a Function" }),
    gate({ cardCode: "IG-U005", name: "IG-U005 Internal methodology language" }),
  ]);
  assert.equal(out.indexOf("H-109"), -1);
  assert.equal(out.indexOf("IG-U005"), -1);
});

test("no card name reaches the prompt", () => {
  const out = compileGates([gate({ name: "H-001 Pattern vs. Instance Enforcement" })]);
  assert.equal(out.indexOf("Pattern vs. Instance Enforcement"), -1);
});

test("the prompt says the rules govern Wing's own output", () => {
  // The single most consequential sentence here. A gate handed to the model as if
  // it described the student turns the rule inside out.
  const out = compileGates([gate()]);
  assert.ok(out.indexOf("what YOU say") >= 0);
  assert.ok(out.indexOf("Never mention them") >= 0);
});

test("session-scoped and universal rules are separated and numbered once", () => {
  const out = compileGates([
    gate({ cardCode: "H-001" }),
    gate({ cardCode: "H-002", coachingMove: "Cite the source of any prior-session reference." }),
    gate({
      cardCode: "H-109",
      coachingMove: "Never declare the student's function for them.",
      appliesToSession: "foundation_1",
    }),
  ]);
  assert.ok(out.indexOf("Always:") >= 0);
  assert.ok(out.indexOf("In this part of the programme:") >= 0);
  // Numbering continues across the two groups rather than restarting, so "rule 3"
  // is unambiguous.
  assert.ok(out.indexOf("3. Never declare the student's function") >= 0);
});

test("failure paths are omitted by default and included on request", () => {
  const without = compileGates([gate()]);
  assert.equal(without.indexOf("Downgrade the claim"), -1);
  const with_ = compileGates([gate()], { includeFailurePath: true });
  assert.ok(with_.indexOf("Downgrade the claim") >= 0);
});

test("draft-path gates are excluded from the turn prompt", () => {
  // IG-V04, IG-V05 and IG-V07 act on a composed artefact, not a streamed turn.
  // authenticity.ts already runs there.
  const gates = DRAFT_PATH_GATES.map((cardCode) => gate({ cardCode }));
  assert.deepEqual(turnPathGates(gates), []);
  assert.equal(compileGates(gates), "");
});

test("a gate with no Tier 1 surface is excluded, and says why", () => {
  const gates = [gate({ cardCode: "H-005" }), gate({ cardCode: "H-001" })];
  assert.deepEqual(turnPathGates(gates).map((g) => g.cardCode), ["H-001"]);
  assert.deepEqual(excludedGates(gates), [
    { cardCode: "H-005", reason: "every stated surface is a Tier 2 module" },
  ]);
});

test("an unlisted gate is INCLUDED by default", () => {
  // The safe direction. A gate Danielle adds later reaches the prompt rather
  // than being silently dropped, which is what you want from a rule about what
  // Wing must never do.
  assert.equal(turnPathGates([gate({ cardCode: "H-999" })]).length, 1);
  assert.equal(NO_TIER1_SURFACE.indexOf("H-999"), -1);
});


/* ── Preconditions ───────────────────────────────────────────────────────── */

test("a precondition gate is dropped when its condition is absent", () => {
  const gates = [
    gate({ cardCode: "IG-U012", coachingMove: "Confirm what you found in the file." }),
    gate({ cardCode: "IG-U014", coachingMove: "Lead with curiosity, not disappointment." }),
    gate({ cardCode: "H-001" }),
  ];
  const none = { hasUploadedDocument: false, openTasks: 0 };
  assert.deepEqual(turnPathGates(gates, none).map((g) => g.cardCode), ["H-001"]);
  assert.equal(compileGates(gates, { conditions: none }).indexOf("Confirm what you found"), -1);
  assert.equal(compileGates(gates, { conditions: none }).indexOf("Lead with curiosity"), -1);
});

test("a precondition gate is kept when its condition holds", () => {
  const gates = [
    gate({ cardCode: "IG-U012", coachingMove: "Confirm what you found in the file." }),
    gate({ cardCode: "IG-U014", coachingMove: "Lead with curiosity, not disappointment." }),
  ];
  const both = { hasUploadedDocument: true, openTasks: 2 };
  assert.deepEqual(turnPathGates(gates, both).map((g) => g.cardCode), ["IG-U012", "IG-U014"]);
  assert.ok(compileGates(gates, { conditions: both }).indexOf("Confirm what you found") >= 0);
});

test("an unsupplied condition counts as satisfied", () => {
  /*
   * The safe direction, and the reason every existing caller is unaffected. Not
   * knowing whether the student uploaded anything must never be the reason a rule
   * about handling their data goes missing.
   */
  const gates = [gate({ cardCode: "IG-U012" }), gate({ cardCode: "IG-U014" })];
  assert.equal(turnPathGates(gates).length, 2);
  assert.equal(turnPathGates(gates, {}).length, 2);
  assert.equal(turnPathGates(gates, { openTasks: 0 }).length, 1);
});

test("an unmet precondition is reported with the reason", () => {
  const gates = [gate({ cardCode: "IG-U014" })];
  assert.deepEqual(excludedGates(gates, { openTasks: 0 }), [
    { cardCode: "IG-U014", reason: "the student has no unanswered tasks to follow up on" },
  ]);
});

test("every precondition quotes the detection method it came from", () => {
  const codes = Object.keys(GATE_PRECONDITIONS);
  assert.deepEqual(codes.sort(), ["IG-U012", "IG-U014"]);
  for (const code of codes) {
    assert.ok(GATE_PRECONDITIONS[code].source.indexOf("Fires") >= 0, code);
    assert.ok(GATE_PRECONDITIONS[code].reason.length > 20, code);
  }
});

/* ── Against the real methodology ────────────────────────────────────────── */

const parsed = parseCompendium(
  readFileSync("methodology/wing-master-module-compendium-v2.md", "utf8"),
);
const tier1Gates: GateCard[] = parsed.cards
  .filter(isTier1)
  .filter((c) => c.cardKind === "integrity_gate")
  .map((c) => ({
    cardCode: c.cardCode,
    name: c.name,
    coachingMove: c.components.coaching_move ?? null,
    failurePath: c.components.failure_path ?? null,
    appliesToSession:
      c.module === "foundation_1" || c.module === "foundation_2" || c.module === "foundation_3"
        ? c.module
        : null,
  }));

test("24 Tier 1 gates, of which 20 reach a conversational turn", () => {
  assert.equal(tier1Gates.length, 24);
  assert.equal(turnPathGates(tier1Gates).length, 20);
  assert.equal(excludedGates(tier1Gates).length, 4);
});

test("two of the 20 are conditional, so a quiet turn compiles 18", () => {
  // No upload in context and no outstanding task is the ordinary case, and it is
  // 18 rules rather than 20 — about 250 tokens, and two rules the model cannot
  // act on out of the way.
  const quiet = { hasUploadedDocument: false, openTasks: 0 };
  assert.equal(turnPathGates(tier1Gates, quiet).length, 18);
  const reasons = excludedGates(tier1Gates, quiet).map((e) => e.cardCode);
  assert.ok(reasons.indexOf("IG-U012") >= 0);
  assert.ok(reasons.indexOf("IG-U014") >= 0);
});

test("the compiled section stays under 3,200 tokens for every session", () => {
  /*
   * Measured, not guessed: this goes into every turn of a prompt that is already
   * 10-13k tokens, so it is a latency and cost decision as much as a methodology
   * one. All 24 gates with failure paths was ~5,000 tokens; the two exclusions and
   * dropping failure paths bring it to ~2,700-2,900.
   *
   * The ceiling is deliberately close to the real figure. A revision that pushes
   * past it should be a decision somebody takes.
   */
  const universal = tier1Gates.filter((g) => g.appliesToSession === null);
  for (const session of ["foundation_1", "foundation_2", "foundation_3"]) {
    const set = universal.concat(
      tier1Gates.filter((g) => g.appliesToSession === session),
    );
    const compiled = compileGates(set);
    const tokens = Math.round(compiled.length / 4);
    assert.ok(tokens > 0, `${session} compiled to nothing`);
    assert.ok(tokens < 3200, `${session} compiles to ~${tokens} tokens`);
  }
});

test("a citation inside rule text is redacted, not passed through", () => {
  // Danielle's rule text cites other cards as editorial asides. The instruction
  // survives without the code; the code cannot survive into the prompt.
  assert.equal(
    redactCardCodes("The elimination exercise (H-103) produces candidates."),
    "The elimination exercise (another of these rules) produces candidates.",
  );
  assert.equal(redactCardCodes("no codes here").indexOf("another of these rules"), -1);
});

test("the two real gates that cite others are reported", () => {
  // Reported rather than silently rewritten, so the source can be tidied. If
  // Danielle removes the asides this drops to an empty list and the test says so.
  assert.deepEqual(redactedFrom(tier1Gates), [
    { cardCode: "H-109", cited: ["H-103"] },
    { cardCode: "IG-U013", cited: ["H-001", "H-807"] },
  ]);
});

test("every rule in the real compiled section is unattributed", () => {
  // The leakage check, run against the actual methodology rather than fixtures.
  const compiled = compileGates(tier1Gates);
  for (const g of tier1Gates) {
    assert.equal(
      compiled.indexOf(g.cardCode),
      -1,
      `${g.cardCode} appears in the compiled prompt`,
    );
  }
});

/* ── The published set, across all three documents ───────────────────────── */

/** The design ceiling for the gate section, per turn. Unchanged since it was set. */
const GATE_SECTION_CEILING = 3200;

/**
 * What each session's gate section measures today, worst case.
 *
 * A ratchet, exactly like TYPECHECK_BASELINE: the test fails when a figure grows,
 * and when one shrinks the baseline comes down with the change that shrank it. Set
 * on 18 August, when the intake module and six new universal gates took every
 * session past the ceiling.
 */
const GATE_SECTION_BASELINE: Readonly<Record<string, number>> = {
  // 4248 under intake v1.1. v1.7's copy corrections moved it by a single token,
  // which is the baseline moving with the change that moved it — the case a ratchet
  // is for. Recorded in WING_DECISIONS.md as the contract here requires.
  intake: 4249,
  foundation_1: 3481,
  foundation_2: 3541,
  foundation_3: 3460,
};

function publishedGates(): GateCard[] {
  const intake = parseIntake(readFileSync(INTAKE_SOURCE, "utf8"));
  const research = parseResearchGates(readFileSync(RESEARCH_GATES_SOURCE, "utf8"));
  const scopeOf = (m: string): string | null =>
    ["intake", "foundation_1", "foundation_2", "foundation_3"].indexOf(m) >= 0 ? m : null;

  const out: GateCard[] = tier1Gates.slice();
  for (const c of intake.cards) {
    if (c.cardKind !== "integrity_gate") continue;
    out.push({
      cardCode: c.cardCode,
      name: c.name,
      coachingMove: c.components.coaching_move ?? null,
      failurePath: c.components.failure_path ?? null,
      appliesToSession: "intake",
    });
  }
  for (const g of intake.gates) {
    out.push({
      cardCode: g.cardCode,
      name: `${g.cardCode} ${g.name}`,
      coachingMove: g.rule,
      failurePath: null,
      appliesToSession: "intake",
    });
  }
  for (const g of research.universalGates) {
    out.push({
      cardCode: g.cardCode,
      name: `${g.cardCode} ${g.name}`,
      coachingMove: g.rule,
      failurePath: null,
      appliesToSession: null,
    });
  }
  for (const c of research.moduleGates) {
    if (!isTier1(c) || c.cardKind !== "integrity_gate") continue;
    out.push({
      cardCode: c.cardCode,
      name: c.name,
      coachingMove: c.components.coaching_move ?? null,
      failurePath: c.components.failure_path ?? null,
      appliesToSession: scopeOf(c.module),
    });
  }
  return out;
}

const published = publishedGates();

test("the four intake restatements match what her titles say", () => {
  /*
   * RESTATES is a constant because the runtime builds gates from database rows,
   * which carry no such field. This is the check that it says what she wrote.
   */
  const intake = parseIntake(readFileSync(INTAKE_SOURCE, "utf8"));
  const fromDocument: Record<string, string> = {};
  for (const g of intake.gates) if (g.restates) fromDocument[g.cardCode] = g.restates;
  assert.deepEqual(fromDocument, RESTATES as Record<string, string>);
});

test("a universal gate is dropped where its session-specific wording applies", () => {
  /*
   * Both wordings in one prompt states the same rule twice in different words, and
   * costs 403 tokens at intake to do it. The concrete wording wins where it exists;
   * in a Foundation turn the restatement is not visible and the universal gate
   * renders normally.
   */
  const atIntake = published.filter(
    (g) => g.appliesToSession === null || g.appliesToSession === "intake",
  );
  const rendered = turnPathGates(atIntake).map((g) => g.cardCode);
  for (const restatement of Object.keys(RESTATES)) {
    assert.ok(rendered.indexOf(restatement) >= 0, `${restatement} should render at intake`);
    assert.equal(
      rendered.indexOf(RESTATES[restatement]),
      -1,
      `${RESTATES[restatement]} should be dropped at intake`,
    );
  }

  const atFoundation1 = published.filter(
    (g) => g.appliesToSession === null || g.appliesToSession === "foundation_1",
  );
  const f1 = turnPathGates(atFoundation1).map((g) => g.cardCode);
  for (const key of Object.keys(RESTATES)) {
    assert.ok(f1.indexOf(RESTATES[key]) >= 0, `${RESTATES[key]} should render in Foundation 1`);
  }
});

test("the published gate section is over the ceiling, and no worse than the baseline", () => {
  /*
   * The number that would have been discovered at the first real turn after
   * publishing. The compendium's own set is under 3,200 — the test above still
   * asserts that — and the 18 August documents add six universal gates and 19
   * intake gates on top, which takes every session past it.
   *
   * Recorded as a ratchet rather than a raised ceiling, because raising it would be
   * answering a methodology question with a constant. What the numbers say is that
   * eight rules are 41% of the intake section and the longest run to 250 tokens
   * each — IG-V02, H-004, IG-U013, H-019 — and a rule a model must hold for a whole
   * turn wants to be one or two sentences. Shortening those is hers to do: a
   * compiler that truncated her words would be editing the methodology somewhere
   * nobody would ever see the edit.
   *
   * The quiet-turn figures are the ordinary case and are asserted separately. The
   * two conditional gates drop, worth ~390 tokens, which brings all three
   * Foundation sessions back under the ceiling. Intake stays over it either way.
   */
  assert.equal(GATE_SECTION_CEILING, 3200);

  for (const session of Object.keys(GATE_SECTION_BASELINE)) {
    const set = published.filter(
      (g) => g.appliesToSession === null || g.appliesToSession === session,
    );
    const worst = Math.round(compileGates(set).length / 4);
    assert.ok(worst > 0, `${session} compiled to nothing`);
    assert.ok(
      worst <= GATE_SECTION_BASELINE[session],
      `${session} grew to ~${worst} tokens, above its baseline of ` +
        `${GATE_SECTION_BASELINE[session]}. Shorten a rule or narrow a scope — do not ` +
        "raise the baseline without a decision recorded in WING_DECISIONS.md.",
    );
  }

  const quiet = { hasUploadedDocument: false, openTasks: 0 };
  for (const session of ["foundation_1", "foundation_2", "foundation_3"]) {
    const set = published.filter(
      (g) => g.appliesToSession === null || g.appliesToSession === session,
    );
    const tokens = Math.round(compileGates(set, { conditions: quiet }).length / 4);
    assert.ok(
      tokens < GATE_SECTION_CEILING,
      `${session} is ~${tokens} tokens even on a quiet turn, over the ceiling`,
    );
  }

  const intakeSet = published.filter(
    (g) => g.appliesToSession === null || g.appliesToSession === "intake",
  );
  const intakeQuiet = Math.round(compileGates(intakeSet, { conditions: quiet }).length / 4);
  assert.ok(intakeQuiet > GATE_SECTION_CEILING, "intake is expected to be over the ceiling");
  assert.ok(intakeQuiet <= 3900, `intake grew to ~${intakeQuiet} on a quiet turn`);
});

test("cardLabel keeps the human part of a name and drops the identifiers", () => {
  /*
   * `buildGuidance` puts the matched card's NAME into a system prompt. Every one of
   * the 46 Tier 1 coaching card names starts with its code, and the intake cards
   * carry two — so the coaching path was leaking "H-308" into prompts through a
   * field nobody had thought of as rule text.
   *
   * Redacting a name would be worse than the leak: "another of these rules Wing
   * chunked messaging" is not an improvement. Stripping leaves what was always
   * meant for a human reader.
   */
  assert.equal(cardLabel("H-308 Wing chunked messaging"), "Wing chunked messaging");
  assert.equal(cardLabel("H-020 RT-01 Title/Function Split"), "Title/Function Split");
  assert.equal(
    cardLabel("IG-INT01 Never make the user feel assessed"),
    "Never make the user feel assessed",
  );
  assert.equal(cardLabel("H-019.5 Reveal template selection"), "Reveal template selection");
  assert.equal(
    cardLabel("IG-U012 User-Uploaded Data Handling Gate"),
    "User-Uploaded Data Handling Gate",
  );
  // Nothing to strip, nothing lost.
  assert.equal(cardLabel("Wing chunked messaging"), "Wing chunked messaging");
  // A name that is only its code returns itself rather than an empty label.
  assert.equal(cardLabel("H-308"), "H-308");
});

test("the five citations the widened pattern caught are redacted", () => {
  /*
   * Measured, not imagined. IG-INT04's rule names the four safety gates and
   * H-019.5's coaching move cites IG-INT06. The pattern was `(?:V|UX|MJ|U)?` with
   * two-to-four digits, so `IG-S01` and `IG-INT06` both sailed through it and would
   * have reached a student as written.
   */
  for (const code of ["IG-S01", "IG-S02", "IG-S07", "IG-S09", "IG-INT06"]) {
    const out = redactCardCodes(`Per ${code}, Wing defers.`);
    assert.equal(out.indexOf(code), -1, `${code} survived redaction`);
    assert.ok(out.indexOf("another of these rules") >= 0);
  }
  assert.equal(redactCardCodes("It must fire before H-019.5.").indexOf("H-019"), -1);
  assert.equal(redactCardCodes("direct RT-04 trigger").indexOf("RT-04"), -1);
});

test("nothing bound for a prompt leaks a code, across all three documents", () => {
  /*
   * The whole-corpus version of the two above, because a redaction pattern is only
   * as good as the text it has actually seen. Every field that reaches a system
   * prompt — a gate's rule and failure path, a coaching card's move and adaptation,
   * and every card's name — filtered the way its own path filters it.
   *
   * If this fails, a document has introduced an identifier family the pattern does
   * not know about, and the fix is the pattern, not the document.
   */
  const intake = parseIntake(readFileSync(INTAKE_SOURCE, "utf8"));
  const research = parseResearchGates(readFileSync(RESEARCH_GATES_SOURCE, "utf8"));

  const CODE_SHAPED = /\b(?:H|IG|EX|RT)-(?:V|UX|MJ|U|S|INT)?\d{1,4}(?:\.\d)?\b/;
  const leaks: string[] = [];

  function check(code: string, field: string, text: string | null | undefined): void {
    if (!text) return;
    if (CODE_SHAPED.test(redactCardCodes(text))) leaks.push(`${code} ${field}`);
  }

  function checkCard(c: {
    cardCode: string;
    name: string;
    components: { coaching_move?: string; delivery_adaptation?: string; failure_path?: string };
  }): void {
    check(c.cardCode, "name", cardLabel(c.name));
    check(c.cardCode, "coaching_move", c.components.coaching_move);
    check(c.cardCode, "delivery_adaptation", c.components.delivery_adaptation);
    check(c.cardCode, "failure_path", c.components.failure_path);
  }

  for (const g of intake.gates) check(g.cardCode, "rule", g.rule);
  for (const g of research.universalGates) check(g.cardCode, "rule", g.rule);
  for (const c of intake.cards) checkCard(c);
  for (const c of research.moduleGates) checkCard(c);
  for (const c of parsed.cards.filter(isTier1)) checkCard(c);

  assert.deepEqual(leaks, []);
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");
