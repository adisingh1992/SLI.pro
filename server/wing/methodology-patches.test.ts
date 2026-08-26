/**
 * The approved-change layer, checked against the documents as they actually are.
 *
 * Run:  npx tsx server/wing/methodology-patches.test.ts
 *
 * ── WHAT IS WORTH TESTING HERE ───────────────────────────────────────────
 * One thing, mostly: **a patch that silently does nothing.**
 *
 * This project has already been bitten by that exact shape. A correction keyed on a card
 * code that had been renamed found no row, printed "not seeded, nothing to rename", exited
 * clean, and left the database disagreeing with the parser. The run looked successful.
 *
 * A stale find-string is the same failure with a worse blast radius: the patch reports
 * nothing, her approved wording never reaches a student, and the only evidence is copy
 * that quietly still says the old thing. So every entry is matched against the real file,
 * and zero matches or two matches are both failures.
 *
 * The other half is the inversion for a card she has sent that no document carries. A plain
 * one is verified by being ABSENT: the day she reissues the document with it in, the entry
 * is redundant, and an entry that outlives its document seeds the card twice from two
 * copies that then drift. A superseding one is verified the opposite way — by its occupant
 * still being THERE, so the supersession cannot quietly outlive the card it replaces.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  PATCHES,
  liveSupersessions,
  newCards,
  patchComponent,
  patchDocument,
  supersededDocumentCards,
  verifyPatches,
} from "./methodology-patches";
import type { ComponentKey } from "./parse-compendium";

let failures = 0;
const fail = (msg: string) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
const ok = (msg: string) => console.log(`  ok — ${msg}`);

const DIR = join(process.cwd(), "methodology");

/*
 * A component reader that works on all three of her document shapes, because the patch
 * table spans them. Cards open with a bare code line or a markdown heading; components are
 * table rows numbered `| 4. coaching_move |` in the intake and Module 13 sets and bolded
 * `| **4\. coaching\_move** |` in the compendium. Both dialects, or this test would
 * silently find nothing and report every patch as card_missing.
 */
function readComponent(document: string, code: string, component: ComponentKey): string | null {
  const path = join(DIR, document);
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, "utf8").split("\n");

  let inCard = false;
  for (const raw of lines) {
    const line = raw.trim();

    const opens =
      line === code ||
      line.indexOf(`${code} `) === 0 ||
      line.indexOf(`## ${code}`) === 0 ||
      line.indexOf(`### ${code}`) === 0;
    if (opens) {
      inCard = true;
      continue;
    }
    // Another card's code line closes this one.
    if (inCard && /^(?:#{2,3}\s+)?(?:H|IG|EX)-[A-Z]*[\d.]+\b/.test(line) && line.indexOf(code) < 0) {
      inCard = false;
    }
    if (!inCard) continue;

    const cells = line.split("|");
    if (cells.length < 3) continue;
    const key = cells[1].replace(/\*\*/g, "").replace(/\\/g, "").replace(/^\s*\d\.\s*/, "").trim();
    if (key === component) return cells.slice(2).join("|").replace(/\s*\|\s*$/, "").trim();
  }
  return null;
}

/** A card shape wide enough for the pipeline tests: any component, plus a field it ignores. */
type Card = {
  cardCode: string;
  components: Partial<Record<ComponentKey, string>>;
  weight?: number;
};

console.log("\nmethodology-patches\n");

console.log("Every patch matches its document exactly once");
{
  const before = failures;
  const documents = new Map<string, string>();
  for (const p of PATCHES) {
    const path = join(DIR, p.document);
    if (existsSync(path)) documents.set(p.document, readFileSync(path, "utf8"));
  }

  const findings = verifyPatches(documents, readComponent);
  for (const f of findings) {
    if (f.state !== "ok") fail(`${f.code} in ${f.document}: ${f.state} — ${f.detail}`);
  }
  if (findings.length !== PATCHES.length) {
    fail(`${findings.length} findings for ${PATCHES.length} patches`);
  }
  if (failures === before) ok(`${findings.length} patches, every one live against the real file`);
}

console.log("\nRT-06's new copy cross-references both questions");
{
  const before = failures;
  const V18 = "wing-intake-heuristic-cards-v1.8.md";
  const original = readComponent(V18, "H-025", "coaching_move");
  if (!original) {
    fail("H-025's coaching_move not found, so nothing below means anything");
  } else {
    const { text, applied } = patchComponent(V18, "H-025", "coaching_move", original);
    if (applied !== 2) fail(`expected 2 patches on this component, applied ${applied}`);

    // The card as delivered inferred from Q6 alone, which is what IG-INT12 forbids.
    if (original.indexOf("Q5") >= 0) fail("the original already referenced Q5 — check the premise");
    if (text.indexOf("[Q5 exact words]") < 0) fail("the patched copy must quote Q5");
    if (text.indexOf("[Q6 exact words]") < 0) fail("and Q6");
    if (text.indexOf("telling two different stories") < 0) fail("her phrasing, verbatim");

    // Her Q9 replaces the old one rather than joining it.
    if (text.indexOf("What makes you describe yourself smaller than your evidence?") < 0) {
      fail("her Q9 is missing");
    }
    if (text.indexOf("would they push back?") >= 0) fail("the old Q9 is still there");

    // Nothing else in the component moved.
    if (text.indexOf("COMPETENCE:") < 0 || text.indexOf("FIXABLE:") < 0) {
      fail("the untouched clauses should survive the patch");
    }
    if (failures === before) ok("Q5 and Q6 both quoted, her Q9 in, the old one out");
  }
}

console.log("\nThe gendered-frequency note is gone, and only that");
{
  const before = failures;
  const V18 = "wing-intake-heuristic-cards-v1.8.md";
  const original = readComponent(V18, "H-025", "delivery_adaptation");
  if (!original) {
    fail("H-025's delivery_adaptation not found");
  } else {
    const { text } = patchComponent(V18, "H-025", "delivery_adaptation", original);
    if (text.indexOf("often gendered") >= 0) fail("the note she asked us to cut is still there");
    if (text.indexOf("demographic signals") >= 0) fail("its second sentence went with it");

    /*
     * The adaptations either side must survive. A deletion that took the neighbouring
     * clause with it would remove coaching for two tracks and look like a tidy diff.
     */
    if (text.indexOf("Career returner:") < 0) fail("the career-returner adaptation was collateral");
    if (text.indexOf("Executive:") < 0) fail("the executive adaptation was collateral");
    if (text.indexOf("Undergraduate:") < 0) fail("the undergraduate adaptation was collateral");
    if (failures === before) ok("two sentences removed, the four other tracks untouched");
  }
}

console.log("\nH-209 supersedes the card we already had");
{
  const before = failures;
  /*
   * ── THE FINDING THIS SUITE PRODUCED ON ITS FIRST REAL RUN ──────────────
   * We reported H-209 missing three times and she wrote it out in full. It was not
   * missing. Compendium v2 has carried "H-209 — Never Conflate Aspiration with Evidence"
   * since before this session, and it is a DIFFERENT card: META, a system rule policing
   * Wing's own output, where hers is CALIBRATE and coaches the user.
   *
   * Same principle, same number, two cards — the IG-U003 / IG-U03 shape again. It was held
   * as blocked until Aditya ruled: take the latest version she provided. So hers governs
   * under the standing authority order, and what gets verified is no longer a block but a
   * replacement — which has two parts that must both hold, or the pipeline emits two cards
   * under one code.
   */
  const h209 = newCards().find((c) => c.code === "H-209");
  if (!h209) fail("H-209 should be seedable now that hers governs");
  if (h209 && !h209.supersedes) {
    fail("H-209 replaces an occupant, so it must say what it replaces");
  }
  if (h209?.supersedes && h209.supersedes.occupantIs.indexOf("META") < 0) {
    fail("the supersession should name the difference, not just assert one");
  }
  /*
   * The occupant's job cannot simply vanish. It was a pre-output filter on Wing's own
   * copy; hers is a coaching move on the user's. The entry has to say where that half
   * lands, and IG-S08 in the safety compile is the answer, so the reference is pinned.
   */
  if (h209?.supersedes && h209.supersedes.carriedForwardBy.indexOf("IG-S08") < 0) {
    fail("a superseded output-check must name where its protection now lives");
  }

  /*
   * Part one of the replacement: the document's copy is dropped. Without this the parser
   * yields the compendium's META card AND hers under H-209, which is worse than either.
   */
  const dropped = supersededDocumentCards();
  if (!dropped.some((d) => d.code === "H-209" && d.document === "wing-master-module-compendium-v2.md")) {
    fail("the compendium's H-209 must be dropped, or two cards ship under one code");
  }

  /*
   * Part two: the occupant is PUBLISHED. H-209 is in Tier 1 scope, one of the 53 cards in
   * sequence version 5 that SLI.pro Direct 2026 points at. That makes this a body change
   * to a live card, which goes through component versioning — appended, never mutated, so
   * an application logged last week still points at the wording actually used — and never
   * through a re-seed. This flag is what the seeder reads to know that.
   */
  if (!liveSupersessions().some((c) => c.code === "H-209")) {
    fail("H-209's occupant is live; the swap must be flagged for the versioning path");
  }
  if (h209?.supersedes && h209.supersedes.occupantIsLive !== true) {
    fail("occupantIsLive false would send a published card through a re-seed");
  }

  if (h209) {
    // All seven components, because a card missing one cannot be seeded.
    const keys: ComponentKey[] = [
      "signal",
      "detection_method",
      "intervention_type",
      "coaching_move",
      "delivery_adaptation",
      "success_criteria",
      "failure_path",
    ];
    for (const k of keys) {
      if (!h209.body[k] || !h209.body[k].trim()) fail(`H-209 has no ${k}`);
    }
    if (h209.body.intervention_type !== "CALIBRATE") {
      fail(`intervention type is ${h209.body.intervention_type}, she said CALIBRATE`);
    }
    if (h209.module !== "foundation_2") fail("H-209 is a Foundation 2 card");

    /*
     * It arrived instead of H-210 twice, so the distinction is worth pinning: H-210 is
     * about delivering a gap with the redirect in the same breath; H-209 is that
     * aspiration is not evidence.
     */
    if (h209.body.signal.indexOf("without corresponding evidence") < 0) {
      fail("the signal should be the aspiration-without-evidence one, not the ice bucket");
    }
    if (h209.body.coaching_move.indexOf("that doesn't mean strategy is wrong") < 0) {
      fail("her coaching move keeps the aspiration valid, which is the whole design");
    }
    /*
     * And the occupant is real, checked rather than asserted in a comment. A supersession
     * is only a supersession while there is something to supersede: if she reissues the
     * compendium without this card, the entry silently starts ADDING a card while the
     * reason for it says "replaces". That is the moment to re-read both, not to re-run.
     */
    const occupant = readComponent("wing-master-module-compendium-v2.md", "H-209", "coaching_move");
    if (occupant === null) {
      fail("nothing occupies H-209 now — this entry adds rather than replaces; re-read both");
    }
    if (occupant && occupant.indexOf("Aspiration is not evidence") < 0) {
      fail("the occupant should be the compendium's META gate; check which card this is");
    }
    if (occupant && h209.body.intervention_type === "META") {
      fail("if hers is also META then they may be the same card after all — re-read both");
    }
    if (failures === before) {
      ok("seven components, CALIBRATE, Foundation 2, superseding a live occupant that is still there");
    }
  }
}

console.log("\nOne pass over a document patches, drops and adds");
{
  const before = failures;
  /*
   * The pipeline, on the real v1.8 card rather than a fixture — because the thing that
   * breaks is a find string drifting away from her wording, and a fixture cannot drift.
   */
  const V18 = "wing-intake-heuristic-cards-v1.8.md";
  const keys: ComponentKey[] = [
    "signal",
    "detection_method",
    "intervention_type",
    "coaching_move",
    "delivery_adaptation",
    "success_criteria",
    "failure_path",
  ];
  const components: Partial<Record<ComponentKey, string>> = {};
  for (const k of keys) {
    const v = readComponent(V18, "H-025", k);
    if (v !== null) components[k] = v;
  }

  const other: Card = { cardCode: "H-024", components: { coaching_move: "untouched" }, weight: 1.5 };
  const { cards, report } = patchDocument(V18, [
    { cardCode: "H-025", components, weight: 2 } as Card,
    other,
  ]);

  if (cards.length !== 2) fail(`v1.8 has no new cards, so 2 in should be 2 out, got ${cards.length}`);
  if (report.dropped.length || report.added.length) {
    fail("nothing is superseded or added in v1.8; only text changes");
  }
  if (report.inert.length) fail(`inert entries against the real document: ${report.inert.join("; ")}`);
  if (report.changed.length !== 3) {
    fail(`3 component patches target H-025, report says ${report.changed.length}`);
  }

  const patched = cards.find((c) => c.cardCode === "H-025");
  if (!patched) {
    fail("H-025 went missing from the pipeline");
  } else {
    if ((patched.components.coaching_move ?? "").indexOf("[Q5 exact words]") < 0) {
      fail("the pipeline did not apply the Q5 cross-reference");
    }
    if ((patched.components.delivery_adaptation ?? "").indexOf("often gendered") >= 0) {
      fail("the pipeline did not apply the deletion");
    }
    // Everything the patches do not name survives, including fields this layer never reads.
    /*
     * The union is the point, not friction to cast away: an ADDED card has no weight, no
     * line and no heading, because it was never in the document. A caller has to narrow,
     * which is how it finds out that hers arrived without the fields a parsed card has.
     */
    if (!("weight" in patched) || patched.weight !== 2) {
      fail("the card's other fields were dropped");
    }
    if ((patched.components.signal ?? "") !== (components.signal ?? "")) {
      fail("an unpatched component was rewritten");
    }
  }

  /*
   * A card with no patches must come back as the SAME object, not a copy. Cheap to get
   * wrong by spreading unconditionally, and a copy is how a caller holding a reference
   * quietly stops seeing the version that gets seeded.
   */
  if (cards.find((c) => c.cardCode === "H-024") !== other) {
    fail("an unpatched card should pass through untouched, not be rebuilt");
  }

  if (failures === before) ok("3 components rewritten, the other card and every other field intact");
}

console.log("\nThe supersession drops before it adds, and never adds alone");
{
  const before = failures;
  const V2 = "wing-master-module-compendium-v2.md";

  // The occupant present: exactly one H-209 comes out, and it is hers.
  const swapped = patchDocument<Card>(V2, [
    { cardCode: "H-208", components: { coaching_move: "untouched" } },
    { cardCode: "H-209", components: { coaching_move: "Aspiration is not evidence." } },
  ]);
  const h209s = swapped.cards.filter((c) => c.cardCode === "H-209");
  if (h209s.length !== 1) fail(`${h209s.length} cards under H-209; one code, one body`);
  if (h209s[0] && h209s[0].components.intervention_type !== "CALIBRATE") {
    fail("the surviving H-209 should be hers, which is CALIBRATE");
  }
  if (swapped.report.dropped.join(",") !== "H-209") fail("the document's H-209 must be dropped");
  if (swapped.report.added.join(",") !== "H-209") fail("hers must be added");
  if (swapped.report.inert.length) fail(`inert: ${swapped.report.inert.join("; ")}`);
  if (swapped.cards.length !== 2) fail("a swap replaces, so the count does not move");

  /*
   * The occupant absent — she reissues without it — must NOT quietly add. An entry that
   * says "supersedes" and then adds is a card appearing from nowhere, and the report has
   * to say so rather than the set silently growing.
   */
  const absent = patchDocument<Card>(V2, [{ cardCode: "H-208", components: {} }]);
  if (absent.cards.some((c) => c.cardCode === "H-209")) {
    fail("nothing was replaced, so nothing should have been added");
  }
  if (!absent.report.inert.some((s) => s.indexOf("H-209") === 0)) {
    fail("an entry that replaced nothing must be reported inert, not skipped");
  }

  // And a document this table says nothing about is returned exactly as given.
  const untouched = patchDocument<Card>("wing-research-derived-gates.md", [
    { cardCode: "IG-U006", components: { coaching_move: "x" } },
  ]);
  if (untouched.report.changed.length || untouched.report.inert.length) {
    fail("a document with no patches should report nothing at all");
  }

  /*
   * A path must work as well as a filename. Every real caller holds the document as
   * `methodology/wing-…-v1.8.md`, because that is what `INTAKE_SOURCE` is, and comparing
   * that against the table's bare filename matches nothing and reports nothing. That is
   * the silent no-op this file exists to refuse, arriving through the front door.
   */
  const viaPath = patchDocument<Card>("methodology/wing-master-module-compendium-v2.md", [
    { cardCode: "H-209", components: { coaching_move: "Aspiration is not evidence." } },
  ]);
  if (viaPath.report.dropped.join(",") !== "H-209" || viaPath.report.added.join(",") !== "H-209") {
    fail("a path-shaped document name must match the table, or every caller silently no-ops");
  }

  if (failures === before) ok("one body under one code, and a replacement that replaced nothing is loud");
}

console.log("\nA stale or ambiguous patch fails loudly");
{
  const before = failures;
  /*
   * The detector, tested on text rather than on the table, because the table is meant to
   * be clean. These are the two states that must never pass silently.
   */
  const docs = new Map<string, string>([["fake.md", "x"]]);

  const stale = verifyPatches(docs, () => "text that does not contain the find string");
  const staleStates = stale.map((f) => f.state);
  if (staleStates.indexOf("stale") < 0 && staleStates.indexOf("document_missing") < 0) {
    fail("a find string that appears nowhere must report stale");
  }

  const doubled = verifyPatches(
    new Map([["wing-intake-heuristic-cards-v1.8.md", "x"]]),
    (_d, _c, comp) =>
      comp === "coaching_move"
        ? "GAP: 'But you said \"[their exact minimizing language].\" Your words made it sound small. I don't think it is.' " +
          "GAP: 'But you said \"[their exact minimizing language].\" Your words made it sound small. I don't think it is.'"
        : "nothing",
  );
  if (!doubled.some((f) => f.state === "ambiguous")) {
    fail("two matches must report ambiguous, not pick one");
  }

  // A missing document is its own state, not a silent skip.
  if (!verifyPatches(new Map(), () => null).every((f) => f.state === "document_missing")) {
    fail("no documents at all should report document_missing for every patch");
  }
  if (failures === before) ok("stale, ambiguous and missing-document all reported distinctly");
}

console.log("\nEvery patch says who authorised it");
{
  const before = failures;
  for (const p of PATCHES) {
    if (p.why.indexOf("Danielle") < 0 && p.why.indexOf("her ") < 0) {
      fail(`${p.code}: the reason does not name a source`);
    }
    if (p.why.length < 120) fail(`${p.code}: the reason is too thin to review`);
    if (p.kind === "component" && p.find === p.replace) fail(`${p.code}: a no-op patch`);
  }
  if (failures === before) ok(`all ${PATCHES.length} carry a quoted authorisation`);
}

console.log(failures ? `\n${failures} failure(s)\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);
