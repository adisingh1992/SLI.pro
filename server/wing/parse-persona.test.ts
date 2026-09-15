import assert from "node:assert/strict";
import {
  PATHWAYS,
  PROFESSIONAL_STATUSES,
  parsePersona,
  personaEmail,
  readFrontmatter,
} from "./parse-persona";

/**
 * Tests for the persona spec parser.
 *
 * The assertions that matter are the refusals. A spec missing its professional
 * status or pathway resolves to no population tags, `cardAppliesTo` intersects
 * to empty for every tagged card, and twenty personas run that way produce an
 * Unfired Cards report in which every audience-specific card looks like dead
 * weight. That is a wrong methodology finding delivered with full confidence,
 * which is worse than a crash — so the parser refuses and these tests pin it.
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

console.log("\nparse-persona\n");

const good = `---
id: example-persona
name: Example Persona
professional_status: mid_career_or_senior
pathway: employment
expected_markers:
  - hedges heavily around accomplishment claims
  - minimises with "just"
---
You are a persona. Stay in character.

Answer in 30–150 words.
`;

const parse = (text: string) => parsePersona(text, "hash-under-test");

/* ── The happy path ───────────────────────────────────────────────────────── */

test("a complete spec parses and resolves population tags", () => {
  const r = parse(good);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.spec.id, "example-persona");
  assert.equal(r.spec.professionalStatus, "mid_career_or_senior");
  assert.equal(r.spec.pathway, "employment");
  assert.ok(r.spec.populationTags.length > 0, "must resolve at least one tag");
  assert.deepEqual(r.spec.expectedMarkers, [
    "hedges heavily around accomplishment claims",
    'minimises with "just"',
  ]);
  assert.equal(r.spec.sourceHash, "hash-under-test");
});

test("the body is kept byte-for-byte, not reflowed", () => {
  const r = parse(good);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(
    r.spec.systemPrompt,
    "You are a persona. Stay in character.\n\nAnswer in 30–150 words.\n",
  );
});

/* ── The refusals that protect a run ─────────────────────────────────────── */

test("a spec with no professional_status is refused, with the reason", () => {
  const r = parse(good.replace("professional_status: mid_career_or_senior\n", ""));
  assert.equal(r.ok, false);
  if (r.ok) return;
  const f = r.failures.find((x) => x.field === "professional_status");
  assert.ok(f, "must name the field");
  assert.match(f!.problem, /cannot be defaulted/);
});

test("a spec with no pathway is refused, and says what it costs", () => {
  const r = parse(good.replace("pathway: employment\n", ""));
  assert.equal(r.ok, false);
  if (r.ok) return;
  const f = r.failures.find((x) => x.field === "pathway");
  assert.ok(f);
  assert.match(f!.problem, /no entrepreneur card can ever fire/);
});

test("both missing produces both failures, not just the first", () => {
  const r = parse(
    good
      .replace("professional_status: mid_career_or_senior\n", "")
      .replace("pathway: employment\n", ""),
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  const fields = r.failures.map((f) => f.field).sort();
  assert.deepEqual(fields, ["pathway", "professional_status"]);
});

test("an invalid professional_status is refused and lists the valid ones", () => {
  const r = parse(good.replace("mid_career_or_senior", "senior_person"));
  assert.equal(r.ok, false);
  if (r.ok) return;
  const f = r.failures.find((x) => x.field === "professional_status")!;
  for (const v of PROFESSIONAL_STATUSES) assert.match(f.problem, new RegExp(v));
});

test("an invalid pathway is refused and lists the valid ones", () => {
  const r = parse(good.replace("pathway: employment", "pathway: contracting"));
  assert.equal(r.ok, false);
  if (r.ok) return;
  const f = r.failures.find((x) => x.field === "pathway")!;
  for (const v of PATHWAYS) assert.match(f.problem, new RegExp(v));
});

test("a file with no frontmatter is refused with instructions", () => {
  const r = parse("You are Tyler. Be terse.");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.failures.length, 1);
  assert.match(r.failures[0].problem, /opens with ---/);
});

test("an empty body is refused — a persona with no character", () => {
  const r = parse(good.slice(0, good.indexOf("You are a persona")));
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.failures.some((f) => f.field === "(body)"));
});

test("a missing id is refused, naming what it is for", () => {
  const r = parse(good.replace("id: example-persona\n", ""));
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.failures.find((f) => f.field === "id")!.problem, /idempotency key/);
});

test("an id that is not a slug is refused", () => {
  for (const bad of ["Tyler Reed", "tyler_reed", "-tyler", "T"]) {
    const r = parse(good.replace("example-persona", bad));
    assert.equal(r.ok, false, `"${bad}" should be refused`);
  }
});

test("a blank expected_markers item is refused, not silently dropped", () => {
  // A blank list item is a typo, and left alone it becomes a ground-truth claim.
  const r = parse(good.replace('  - minimises with "just"', "  - "));
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.failures.some((f) => f.field === "expected_markers"));
});

test("expected_markers is optional — it is Danielle's vocabulary, not required", () => {
  const withoutMarkers = `---
id: plain
name: Plain
professional_status: early_career
pathway: employment
---
Body.
`;
  const r = parse(withoutMarkers);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.spec.expectedMarkers, []);
});

/* ── Every valid combination resolves to real tags ───────────────────────── */

test("all twelve status/pathway combinations resolve to methodology tags", () => {
  /*
   * The parser refuses a combination that resolves to nothing. This asserts no
   * such combination exists today, so the refusal cannot fire on a spec that is
   * actually correct — and it fails if the mapping ever loses a case.
   */
  for (const status of PROFESSIONAL_STATUSES) {
    for (const pathway of PATHWAYS) {
      const r = parse(
        good
          .replace("mid_career_or_senior", status)
          .replace("pathway: employment", `pathway: ${pathway}`),
      );
      assert.equal(r.ok, true, `${status} + ${pathway} was refused`);
      if (r.ok) assert.ok(r.spec.populationTags.length > 0, `${status} + ${pathway}`);
    }
  }
});

/* ── The frontmatter reader ──────────────────────────────────────────────── */

test("quotes are stripped and comments ignored", () => {
  const { scalars } = readFrontmatter(`---
# a comment
id: "quoted-id"
name: 'Single Quoted'
---
body`);
  assert.equal(scalars.id, "quoted-id");
  assert.equal(scalars.name, "Single Quoted");
});

test("CRLF line endings parse — specs may arrive from Word or Windows", () => {
  const r = parse(good.replace(/\n/g, "\r\n"));
  assert.equal(r.ok, true);
});

/* ── The address ────────────────────────────────────────────────────────── */

test("a persona's address is undeliverable by construction", () => {
  /*
   * `engagement.ts`'s send loop does not exclude test accounts — only its
   * prompt-log write is guarded — so a deliverable address would mean a persona
   * receiving real prompt emails. `.invalid` is reserved by RFC 2606 and can
   * never resolve, which fails at the SMTP layer instead of mailing a stranger.
   */
  assert.match(personaEmail("tyler-reed"), /\.invalid$/);
  assert.ok(personaEmail("a") !== personaEmail("b"), "must be per-persona");
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");
