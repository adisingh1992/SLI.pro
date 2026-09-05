/**
 * The prompt library editor (Feature List B2) — what the editor has to refuse, and the
 * one question it exists to answer.
 *
 * Behavioural, not a static scan, because `prompt-library-edit.ts` is pure: it takes a
 * draft and returns issues and a reachability verdict, with no database anywhere near
 * it. So the rules can be RUN, and a mutation that guts one is a failing assertion
 * rather than a regex that still matches.
 *
 * ── THE FAILURE THIS SUITE IS ABOUT ──────────────────────────────────────
 * A message template is sent because a code path decided to send it, so a bad one is
 * visibly bad the first time it goes out. A library prompt is drawn from a POOL:
 * `selectPrompt` filters candidates and picks among the survivors, so a prompt that
 * fails a filter is not rejected anywhere. It is listed as active, it looks saved, and
 * it never reaches a student — for anybody, with nothing logged.
 *
 * Danielle owns this material and will be editing it without an engineer in the room.
 * "Saved successfully" has to mean "and it can actually be sent", or the editor is worse
 * than the seed script it replaces: the seed script at least fails loudly.
 */
import {
  blocking,
  canonicalCategories,
  placeholdersIn,
  reachability,
  validateOpener,
  validatePrompt,
  CADENCES,
  SIGNAL_CATEGORIES,
  type OpenerDraft,
  type PromptDraft,
} from "./prompt-library-edit";
import { eligible, type Candidate } from "./prompt-selection";
import { METHODOLOGY_POPULATIONS, populationTagsFor } from "./population-tags";
import { renderOpener, type Opener } from "./opener";

let failed = 0;
function check(label: string, ok: boolean, detail: string) {
  if (ok) console.log(`  ok — ${detail}`);
  else {
    failed++;
    console.log(`  FAIL — ${label}: ${detail}`);
  }
}

const prompt = (over: Partial<PromptDraft> = {}): PromptDraft => ({
  promptText: "What surprised you about this week?",
  category: null,
  populationTags: [],
  promptCode: null,
  behavioralSignal: null,
  signalCategory: [],
  evidenceTier: null,
  audienceScope: "universal",
  cadence: "micro_journal",
  deliveryMarker: null,
  library: "approachable",
  eventSensitive: false,
  ...over,
});

const opener = (over: Partial<OpenerDraft> = {}): OpenerDraft => ({
  pool: "casual",
  text: "Hey [Name] — quick one for you.",
  placeholders: ["Name"],
  ...over,
});

const errorsOn = (issues: ReturnType<typeof validatePrompt>, field: string) =>
  issues.filter((i) => i.field === field && i.severity === "error");

console.log("\nthe prompt library editor — saved has to mean sendable\n");

/* ─────────────────────────────────────────────────────────────────────────
 * 1. A well-formed prompt saves, and the baseline is genuinely clean.
 *
 * First, so every later assertion about a specific rejection is known to be about
 * that rule rather than about a fixture that was broken all along.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("A well-formed prompt is accepted and reaches somebody");
{
  const issues = validatePrompt(prompt());
  const reach = reachability(prompt(), true);
  check(
    "baseline",
    !blocking(issues) && reach.reachable && reach.audiences.length > 0,
    !blocking(issues) && reach.reachable
      ? `no blocking issues, ${reach.audiences.length} student shapes can receive it`
      : `blocking=${blocking(issues)} reachable=${reach.reachable}: ${JSON.stringify(issues)}`,
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * 2. THE ONE THAT MATTERS: a prompt nothing can draw is reported unreachable.
 *
 * `eligible()` compares `c.cadence !== ctx.cadence`, and selection only ever asks for
 * one of the three rhythms. A prompt with no cadence therefore matches nothing, ever —
 * and it is the default state of a new row, so it is what you get by filling in the
 * text and saving.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nA prompt with no cadence is reported unreachable, not merely warned about");
{
  const draft = prompt({ cadence: null });
  const reach = reachability(draft, true);
  const issues = validatePrompt(draft);

  const bad: string[] = [];
  if (reach.reachable) bad.push("reachability says it is reachable");
  if (!reach.why.trim()) bad.push("no reason given");
  if (reach.audiences.length) bad.push(`${reach.audiences.length} audiences listed anyway`);
  /*
   * And it must NOT block the save: 28 seeded rows are in this state and blocking would
   * make them uneditable. The verdict is what carries the warning, not a refusal.
   */
  if (blocking(issues)) bad.push("it also blocks the save, which locks the seeded rows");
  if (!issues.some((i) => i.field === "cadence" && i.severity === "warning")) {
    bad.push("no warning on the cadence field");
  }

  check("no cadence", bad.length === 0, bad.length === 0
    ? `unreachable and saveable, with a stated reason`
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 3. And the verdict is the REAL filter's, not a second copy of it.
 *
 * This is the check that stops `reachability` drifting. It builds a candidate from a
 * draft, asks `eligible()` directly for each student shape, and asserts the two agree
 * on every one — so a rule added to `prompt-selection.ts` and not to this module is a
 * failure here rather than a screen confidently reporting the old behaviour.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe reachability verdict agrees with the selection filter it claims to run");
{
  const drafts = [
    prompt(),
    prompt({ populationTags: ["undergraduate"] }),
    prompt({ populationTags: ["executive"] }),
    prompt({ populationTags: ["entrepreneur_fundraising"] }),
    prompt({ cadence: "heartbeat", library: null }),
    prompt({ eventSensitive: true }),
  ];

  const shapes = [
    populationTagsFor(null, null),
    populationTagsFor("undergraduate_or_recent_grad", null),
    populationTagsFor("mid_career_or_senior", null),
    populationTagsFor("early_career", "venture"),
    populationTagsFor("career_break_or_transition", "freelance"),
  ];

  let disagreements = 0;
  let checked = 0;
  for (const draft of drafts) {
    const reach = reachability(draft, true);
    const candidate: Candidate = {
      id: 1,
      active: true,
      populationTags: draft.populationTags,
      cadence: draft.cadence,
      library: draft.library,
      signalCategory: draft.signalCategory,
      eventSensitive: draft.eventSensitive,
    };
    const anyShapeAccepts = shapes.some(
      (tags) =>
        eligible([candidate], {
          studentTags: tags,
          cadence: draft.cadence as any,
          recentPromptIds: [],
          recentCategories: [],
          sentToday: false,
          knownEvents: ["any"],
        }).length > 0,
    );
    checked++;
    /*
     * One direction only: `reachability` scans every shape and this samples five, so
     * "the sample found one" must imply "the full scan found one". The reverse would
     * be a false failure whenever a prompt is reachable only by a shape not sampled.
     */
    if (anyShapeAccepts && !reach.reachable) disagreements++;
  }

  check("agrees with eligible()", disagreements === 0, disagreements === 0
    ? `${checked} drafts, no disagreement with the live filter`
    : `${disagreements} of ${checked} drafts where eligible() accepts and reachability denies`);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 4. A population tag nothing resolves to is refused.
 *
 * `cardAppliesTo` intersects sets, so a tag outside the vocabulary produces an empty
 * intersection — which is indistinguishable from a prompt that legitimately does not
 * apply to this student. The same failure `parse-intake.ts` reports for cards.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nA population tag no student resolves to is refused at save time");
{
  const bad: string[] = [];

  const typo = validatePrompt(prompt({ populationTags: ["undergraduates"] }));
  if (!errorsOn(typo, "populationTags").length) {
    bad.push('"undergraduates" (plural, a real typo) was accepted');
  }

  /* The whole vocabulary passes, so the rule is not just "reject everything". */
  const all = validatePrompt(prompt({ populationTags: Array.from(METHODOLOGY_POPULATIONS) }));
  if (errorsOn(all, "populationTags").length) {
    bad.push("the full methodology vocabulary was rejected");
  }

  /* And an untagged prompt is universal, not empty. */
  const none = reachability(prompt({ populationTags: [] }), true);
  if (!none.reachable) bad.push("an untagged prompt was reported unreachable — untagged is universal");

  check("tags", bad.length === 0, bad.length === 0
    ? "unknown tags refused, the real vocabulary accepted, untagged stays universal"
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 5. Prompt text is sent verbatim, so a placeholder in it is an error.
 *
 * Nothing interpolates prompt text — the opener is the layer that carries placeholders.
 * `[Name]` in a prompt arrives at the student as those six characters.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nA placeholder in prompt text is refused, because nothing would fill it");
{
  const bad: string[] = [];

  for (const text of [
    "Hey [Name], what surprised you this week?",
    "How did {{firstName}} find the week?",
  ]) {
    if (!errorsOn(validatePrompt(prompt({ promptText: text })), "promptText").length) {
      bad.push(`"${text}" was accepted`);
    }
  }

  /*
   * And ordinary prose is not caught. The rule keys on bracket and brace tokens, so a
   * library written in plain sentences — which hers is — passes untouched. Asserted
   * because a rule that fired on any punctuation would be unusable on the real material
   * and the first symptom would be Danielle unable to save a prompt she can read.
   */
  for (const fine of [
    "What did you notice this week about how you decide?",
    "Whose reaction mattered most, and why do you think that was?",
  ]) {
    if (errorsOn(validatePrompt(prompt({ promptText: fine })), "promptText").length) {
      bad.push(`ordinary prose was rejected: "${fine}"`);
    }
  }

  const empty = validatePrompt(prompt({ promptText: "   " }));
  if (!errorsOn(empty, "promptText").length) bad.push("an empty prompt was accepted");

  check("verbatim text", bad.length === 0, bad.length === 0
    ? "both placeholder forms and an empty prompt are refused"
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 6. The opener's declared placeholders must match its text — both directions.
 *
 * `renderOpener` filters on `fillable`, which reads the DECLARED list, then substitutes
 * against the text. The two disagreeing produces either an opener that silently stops
 * being drawn, or one that reaches a student with "[topic]" still in it.
 *
 * Proved by RUNNING the renderer, not by asserting the validator's opinion of it.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nAn opener whose placeholders disagree with its text is refused");
{
  const bad: string[] = [];

  /* Present in the text, not declared: the renderer would ship the brackets. */
  const undeclared = opener({
    pool: "post_response",
    text: "Hey [Name] — remember what you told me about [topic]?",
    placeholders: ["Name"],
  });
  if (!validateOpener(undeclared).some((i) => i.field === "placeholders" && i.severity === "error")) {
    bad.push("an undeclared placeholder was accepted");
  }

  /*
   * And here is what that costs, run rather than described: with only [Name] declared,
   * `fillable` passes on a values map that has no topic, the opener is chosen, and
   * `fill` leaves the token in place.
   */
  const one: Opener = { id: 1, pool: "post_response", text: undeclared.text, placeholders: ["Name"] };
  const shipped = renderOpener(
    [one],
    { daysSinceLastResponse: 1, followingUpOn: "the offer", lastOpenerId: null },
    { Name: "Priya" },
    () => 0,
  );
  if (!shipped || !shipped.text.includes("[topic]")) {
    bad.push(
      "the renderer no longer ships an undeclared placeholder — this check may be " +
        "testing a hazard that no longer exists, and should be re-derived rather than kept",
    );
  }

  /* Declared but absent: the opener quietly leaves the pool. */
  const absent = opener({ text: "Hey [Name] — quick one.", placeholders: ["Name", "topic"] });
  if (!validateOpener(absent).some((i) => i.field === "placeholders" && i.severity === "error")) {
    bad.push("a declared-but-absent placeholder was accepted");
  }
  const ghost: Opener = { id: 2, pool: "casual", text: absent.text, placeholders: ["Name", "topic"] };
  if (renderOpener([ghost], { daysSinceLastResponse: 1, followingUpOn: null, lastOpenerId: null }, { Name: "Priya" }, () => 0) !== null) {
    bad.push("the renderer no longer drops an opener declaring a placeholder it lacks");
  }

  /* And a correct one saves and renders. */
  const good = opener();
  if (blocking(validateOpener(good))) bad.push("a well-formed opener was refused");
  const rendered = renderOpener(
    [{ id: 3, pool: "casual", text: good.text, placeholders: good.placeholders }],
    { daysSinceLastResponse: 1, followingUpOn: null, lastOpenerId: null },
    { Name: "Priya" },
    () => 0,
  );
  if (!rendered || rendered.text.includes("[")) bad.push("a well-formed opener did not render");

  check("opener placeholders", bad.length === 0, bad.length === 0
    ? "both directions refused, and the renderer confirms what each would have cost"
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 7. `placeholdersIn` reads the text the way `fill` writes it.
 *
 * The default declared list comes from this function, so if it disagreed with `fill`'s
 * `[Key]` substitution the editor would helpfully populate a wrong list.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe placeholder reader agrees with the substituter");
{
  const text = "Hey [Name] — about [topic], and [Name] again.";
  const found = placeholdersIn(text);

  let out = text;
  for (const key of found) out = out.split(`[${key}]`).join("X");

  const bad: string[] = [];
  if (JSON.stringify(found) !== JSON.stringify(["Name", "topic"])) {
    bad.push(`read ${JSON.stringify(found)}, expected ["Name","topic"] in order, deduplicated`);
  }
  if (/\[[A-Za-z]/.test(out)) bad.push(`substituting everything it found left ${out}`);

  check("placeholdersIn", bad.length === 0, bad.length === 0
    ? "every token it reports is one `fill` replaces, in order, once each"
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 8. Vocabulary fields are closed, and every legal value is legal.
 *
 * Both halves. A rule that rejects everything passes the first half alone, and the
 * cost of that here is a screen that cannot save a valid prompt.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nEvery vocabulary is closed, and everything inside it is accepted");
{
  const bad: string[] = [];

  const cases: [keyof PromptDraft, readonly unknown[], unknown][] = [
    ["cadence", CADENCES, "weekly"],
    ["library", ["approachable", "reflective"], "serious"],
    ["audienceScope", ["universal", "adapted", "specific"], "everyone"],
    /* A set since 0041, so each legal value is a one-element set and the illegal one is
     * an illegal MEMBER — the field itself no longer has a scalar form to reject. */
    ["signalCategory", [["language"], ["energy"], ["decision"], ["relationship"], ["industry"], ["career"], ["influence"], ["achievement"]], ["vibes"]],
    ["evidenceTier", [1, 2, 3], 4],
  ];

  for (const [field, legal, illegal] of cases) {
    if (!errorsOn(validatePrompt(prompt({ [field]: illegal } as any)), field).length) {
      bad.push(`${field} accepted ${JSON.stringify(illegal)}`);
    }
    for (const value of legal) {
      if (errorsOn(validatePrompt(prompt({ [field]: value } as any)), field).length) {
        bad.push(`${field} rejected ${JSON.stringify(value)}, which is legal`);
      }
    }
    /* Null is legal on every one of these — most of the library is null today. */
    if (errorsOn(validatePrompt(prompt({ [field]: null } as any)), field).length) {
      bad.push(`${field} rejected null, which most of the seeded library holds`);
    }
  }

  const openerPool = validateOpener(opener({ pool: "friendly" }));
  if (!openerPool.some((i) => i.field === "pool" && i.severity === "error")) {
    bad.push("the opener pool accepted a value outside her three");
  }

  check("vocabularies", bad.length === 0, bad.length === 0
    ? `${cases.length} prompt fields plus the opener pool, closed in both directions`
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 9. Signal category is a set, and the set is normalised before it is stored (0041).
 *
 * Canonicalisation is not cosmetic here. Every save on the review screen retires the live
 * row and inserts a successor, and "did this change" is a comparison of these arrays — so
 * if {energy, career} and {career, energy} are different values, ticking two boxes in the
 * other order manufactures a version of a prompt nobody edited.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nSignal category is a normalised set, and every member is checked");
{
  const bad: string[] = [];

  const order = canonicalCategories(["career", "energy"]);
  if (JSON.stringify(order) !== JSON.stringify(canonicalCategories(["energy", "career"]))) {
    bad.push(`order is not canonical: ${JSON.stringify(order)}`);
  }
  if (JSON.stringify(order) !== JSON.stringify(["energy", "career"])) {
    bad.push(`not in her order: ${JSON.stringify(order)} — SIGNAL_CATEGORIES puts energy before career`);
  }
  if (JSON.stringify(canonicalCategories(["energy", "energy"])) !== JSON.stringify(["energy"])) {
    bad.push("duplicates survive canonicalisation");
  }
  if (canonicalCategories([]).length !== 0 || canonicalCategories(null).length !== 0) {
    bad.push("empty and null do not both canonicalise to the empty set");
  }

  /*
   * An unknown value is KEPT by canonicalisation and refused by the validator. Dropping
   * it silently would mean a save succeeded with a category quietly discarded, which is
   * the one outcome worse than refusing.
   */
  if (!canonicalCategories(["vibes"]).includes("vibes")) {
    bad.push("canonicalCategories dropped an unknown value instead of leaving it for the validator");
  }

  /* A legitimate multi-category prompt saves. */
  if (errorsOn(validatePrompt(prompt({ signalCategory: ["energy", "relationship"] })), "signalCategory").length) {
    bad.push("a prompt in two of her eight was refused");
  }

  /* Every member is checked, not just the first — and all bad ones are named at once. */
  const mixed = errorsOn(validatePrompt(prompt({ signalCategory: ["energy", "vibes"] })), "signalCategory");
  if (!mixed.length) bad.push("an unknown category hiding behind a legal one was accepted");

  const twoBad = errorsOn(validatePrompt(prompt({ signalCategory: ["vibes", "mood"] })), "signalCategory");
  if (twoBad.length && !(twoBad[0].message.includes("vibes") && twoBad[0].message.includes("mood"))) {
    bad.push(`only one of two bad categories was reported: ${twoBad[0].message}`);
  }

  /* The whole vocabulary at once is legal — nothing caps how many she may assign. */
  if (errorsOn(validatePrompt(prompt({ signalCategory: [...SIGNAL_CATEGORIES] })), "signalCategory").length) {
    bad.push("all eight at once was refused, and no rule anywhere caps the count");
  }

  check("category set", bad.length === 0, bad.length === 0
    ? "canonical order, deduplicated, every member checked, one to eight all legal"
    : bad.join("; "));
}

console.log(failed === 0 ? "\nall passed\n" : `\n${failed} failed\n`);
if (failed > 0) process.exit(1);
