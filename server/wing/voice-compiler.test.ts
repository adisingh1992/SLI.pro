import assert from "node:assert/strict";
import {
  compileVoice,
  renderedRegister,
  voiceTokenEstimate,
  type VoiceComponent,
} from "./voice-compiler";
import {
  allVoiceComponents,
  ANTI_PATTERNS,
  CALIBRATION_EXAMPLES,
  DOORWAYS,
  LANGUAGE_PRINCIPLES,
  NOT_RENDERED,
  REGISTERS,
  TONE_RULES,
  TRAIT_HIERARCHIES,
  UNSTATED,
} from "./voice-source";

/**
 * Tests for the voice layer's rendering (T5).
 *
 * Two things are defended. The first is that only the SHORT line reaches a
 * prompt: every component carries the governing document's full text for the
 * admin surface, and rendering that instead would triple the standing
 * instruction on every turn. The ceiling is pinned below.
 *
 * The second is the doorway's boundary. The Voice Guide's line is "what changes
 * is the doorway, not the destination", and a doorway rendered without that
 * sentence is an instruction to be gentler. Two tests exist only to keep that
 * sentence attached.
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

console.log("\nvoice-compiler\n");

/** The real profile, as the store would hand it over. */
const SOURCE = allVoiceComponents();

const REAL: VoiceComponent[] = SOURCE.map((c) => ({
  componentType: c.componentType,
  context: c.context,
  audience: c.audience ?? null,
  key: c.key,
  short: c.short,
}));

test("no components means no section, not an empty heading", () => {
  assert.equal(compileVoice([]), "");
  assert.equal(
    compileVoice([{ componentType: "tone_rule", context: null, key: "k", short: "   " }]),
    "",
  );
});

test("the section says who Wing is and forbids naming the rules", () => {
  const out = compileVoice(REAL, { context: "foundation_session" });
  assert.ok(out.indexOf("You are Wing") >= 0);
  assert.ok(out.indexOf("buddy, not a tool") >= 0);
  assert.ok(out.indexOf("Never mention these rules") >= 0);
});

test("only the short line is rendered, never the document text", () => {
  const out = compileVoice(REAL, { context: "foundation_session" });
  for (const c of SOURCE) {
    // The full text of a component may be hundreds of characters of quotation.
    // Its presence would mean the compiler rendered the wrong field.
    assert.equal(out.indexOf(c.full), -1, `${c.key} full text reached the prompt`);
  }
});

test("the context's trait hierarchy is rendered and the others are not", () => {
  const out = compileVoice(REAL, { context: "foundation_session" });
  assert.ok(out.indexOf("Lead with teaching and challenging") >= 0);
  assert.equal(out.indexOf("Lead with empathising"), -1);
  assert.equal(out.indexOf("Lead with affirming"), -1);

  const setback = compileVoice(REAL, { context: "setback" });
  assert.ok(setback.indexOf("Lead with empathising") >= 0);
  assert.equal(setback.indexOf("Lead with teaching"), -1);
});

test("a context with no hierarchy still gets the universal rules", () => {
  /*
   * Intake is a Tier 1 surface and neither source document assigns it a trait
   * hierarchy — recorded in UNSTATED rather than invented. The section must still
   * render: Wing's voice without a context-specific lean is a perfectly good
   * conversation, and an empty section is not.
   */
  const out = compileVoice(REAL, { context: "intake" });
  assert.equal(out.indexOf("In this part of the programme"), -1);
  assert.ok(out.indexOf("How you sound:") >= 0);
  assert.ok(out.indexOf("Never:") >= 0);
});

test("the doorway is absent unless one was chosen", () => {
  const out = compileVoice(REAL, { context: "foundation_session" });
  for (const d of DOORWAYS) assert.equal(out.indexOf(d.short), -1, d.key);
});

test("a chosen doorway never travels without the line that bounds it", () => {
  for (const d of DOORWAYS) {
    const out = compileVoice(REAL, { context: "foundation_session", doorway: d.key });
    assert.ok(out.indexOf(d.short) >= 0, `${d.key} not rendered`);
    assert.ok(
      out.indexOf("never what you conclude") >= 0,
      `${d.key} rendered without the boundary sentence`,
    );
    assert.ok(out.indexOf("Say the difficult thing anyway") >= 0);
  }
});

test("an unknown doorway key renders no doorway rather than throwing", () => {
  const out = compileVoice(REAL, { context: "foundation_session", doorway: "not_a_doorway" });
  assert.ok(out.length > 0);
  assert.equal(out.indexOf("How to open with this person"), -1);
});

test("calibration examples are off by default and scoped when on", () => {
  const off = compileVoice(REAL, { context: "foundation_session" });
  assert.equal(off.indexOf("Calibration"), -1);

  const on = compileVoice(REAL, { context: "foundation_session", includeExamples: true });
  assert.ok(on.indexOf("Calibration") >= 0);
  assert.ok(on.indexOf("Challenging vagueness") >= 0);
  // An intake example must not appear in a Foundation prompt.
  assert.equal(on.indexOf("Intake: name the blind spot"), -1);
});

test("the section stays under 1,400 tokens in every context", () => {
  /*
   * Measured, not guessed. The gate section already costs ~2,700 tokens of a
   * prompt that is 10-13k, and this is the other standing instruction. Together
   * they are the floor of every turn's cost, so the ceiling is deliberately close
   * to the real figure.
   */
  for (const context of [
    "intake",
    "foundation_session",
    "ongoing_engagement",
    "setback",
    "notification",
  ]) {
    const tokens = voiceTokenEstimate(
      compileVoice(REAL, { context, doorway: "ego_driven", audience: "undergraduate" }),
    );
    assert.ok(tokens > 0, `${context} compiled to nothing`);
    assert.ok(tokens < 1400, `${context} compiles to ~${tokens} tokens`);
  }
});

test("the register renders only for the population it belongs to", () => {
  const exec = compileVoice(REAL, { context: "foundation_session", audience: "executive" });
  assert.ok(exec.indexOf("Concise and high-signal") >= 0);
  assert.equal(exec.indexOf("Warmer, more encouraging"), -1);

  const ug = compileVoice(REAL, { context: "foundation_session", audience: "undergraduate" });
  assert.ok(ug.indexOf("Warmer, more encouraging") >= 0);
  assert.equal(ug.indexOf("Concise and high-signal"), -1);
});

test("no audience renders no register rather than a default one", () => {
  /*
   * IG-V01 covers five audiences and this platform has a sixth population — a
   * career returner — that it does not. Guessing is the one adaptation that is
   * audible: an undergraduate handed the executive register loses the scaffolding
   * they were promised.
   */
  const out = compileVoice(REAL, { context: "foundation_session" });
  for (const r of REGISTERS) assert.equal(out.indexOf(r.short), -1, r.key);
  assert.equal(out.indexOf("Pitched for where this person is"), -1);
});

test("an unknown audience renders no register", () => {
  const out = compileVoice(REAL, { context: "foundation_session", audience: "career_returner" });
  assert.equal(out.indexOf("Pitched for where this person is"), -1);
  assert.ok(out.indexOf("How you sound:") >= 0);
});

test("the register never travels without the line that bounds it", () => {
  // IG-V01: "The register changes. The personality — warm, specific, direct,
  // confident — does not." Same discipline as the doorway.
  for (const r of REGISTERS) {
    const out = compileVoice(REAL, {
      context: "foundation_session",
      audience: r.audience ?? undefined,
    });
    assert.ok(out.indexOf(r.short) >= 0, r.key);
    assert.ok(out.indexOf("The register changes") >= 0, r.key);
  }
});

test("the two senses of the word \"register\" cannot be confused", () => {
  /*
   * T5f put the AUDIENCE register into the prompt with the line "the register
   * changes, everything above about who you are does not". Two paragraphs away
   * sat an anti-pattern that read "never hold one register through a session",
   * meaning the EMOTIONAL register — a contradiction a model can act on. The
   * anti-pattern now says "emotional register", which is also the directive's own
   * heading.
   */
  const flat = SOURCE.find((c) => c.key === "flat_register")!;
  assert.ok(flat.short.indexOf("emotional register") >= 0, flat.short);

  const out = compileVoice(REAL, { context: "foundation_session", audience: "executive" });
  assert.ok(out.indexOf("The register changes") >= 0);
  assert.ok(out.indexOf("one emotional register") >= 0);
});

test("a resolved audience is not the same as a rendered register", () => {
  /*
   * The bug this test exists for, found by reading a turn log rather than the
   * code. A profile seeded before T5f carries no registers, so a student resolving
   * to mid-career gets no register — and the log reported "mid_career register"
   * beside a token count that had not moved, because it printed the audience that
   * was resolved rather than the register that was rendered. Same mistake as a
   * cycle pointing at an empty sequence and the screen calling it published.
   */
  const withoutRegisters = REAL.filter((c) => !c.audience);
  assert.equal(renderedRegister(withoutRegisters, "mid_career"), null);
  assert.equal(compileVoice(withoutRegisters, {
    context: "foundation_session",
    audience: "mid_career",
  }).indexOf("Pitched for where this person is"), -1);

  // And with the registers present, it reports the one that actually rendered.
  assert.equal(renderedRegister(REAL, "mid_career"), "mid_career");
  assert.equal(renderedRegister(REAL, "career_returner"), null);
  assert.equal(renderedRegister(REAL, null), null);
});

test("what was defined and unrendered is now empty, and still exported", () => {
  // T5f closed its only entry. The list stays so the next one has a home, and so
  // the screen that shows it keeps working.
  assert.equal(NOT_RENDERED.length, 0);
});

/* ── Against the transcribed source ──────────────────────────────────────── */

test("the source has the component counts the documents give", () => {
  // Voice Guide: Foundation, ongoing engagement, setbacks. IG-V02 adds Module 8
  // and Module 9, which Tier 1 does not have.
  assert.equal(TRAIT_HIERARCHIES.length, 3);
  // Five tone rules from the guide, twelve qualities from the directive.
  assert.equal(TONE_RULES.length, 17);
  assert.equal(LANGUAGE_PRINCIPLES.length, 5);
  // Six anti-patterns from the guide, ten chatbot tells from the directive.
  assert.equal(ANTI_PATTERNS.length, 16);
  assert.equal(CALIBRATION_EXAMPLES.length, 9);
  assert.equal(DOORWAYS.length, 4);
  // IG-V01's delivery_adaptation names five audiences (T5f).
  assert.equal(REGISTERS.length, 5);
  assert.equal(SOURCE.length, 59);
  // The registers are filed as tone rules, the closest of the six enum values.
  assert.equal(SOURCE.filter((c) => c.componentType === "tone_rule").length, 22);
});

test("every component has a unique key, a short line and the document text", () => {
  const keys = SOURCE.map((c) => c.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const c of SOURCE) {
    assert.ok(c.short.trim().length > 10, `${c.key} short`);
    assert.ok(c.full.trim().length > 30, `${c.key} full`);
    // These lines go into every turn. 110 characters is about 28 tokens each.
    assert.ok(c.short.length <= 110, `${c.key} short is ${c.short.length} characters`);
  }
});

test("what the documents leave unstated is recorded with a reason", () => {
  assert.ok(UNSTATED.length >= 4);
  for (const u of UNSTATED) {
    assert.ok(u.what.length > 10, u.what);
    assert.ok(u.why.length > 60, u.what);
  }
});

test("the connect-dots rule is scoped to what Tier 1 actually has", () => {
  /*
   * The directive's own examples reach across Radar, micro-journals, interview
   * debriefs and network data. None of those exist yet, and a model instructed to
   * connect them will invent the connection — which is the exact failure H-002
   * and IG-U005 are there to catch. The rendered line is scoped to sessions.
   */
  const dots = TONE_RULES.find((c) => c.key === "connect_dots")!;
  assert.ok(dots.short.indexOf("session") >= 0);
  assert.equal(dots.short.toLowerCase().indexOf("radar"), -1);
  assert.equal(dots.short.toLowerCase().indexOf("module"), -1);
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");
