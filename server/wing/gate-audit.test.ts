import assert from "node:assert/strict";
import {
  AUDIT_RULES,
  NOT_AUDITABLE,
  auditCoverage,
  auditReply,
} from "./gate-audit";
import { CORRECTIONS } from "./parse-compendium";
import { RETIRED } from "./gate-allocation";

/**
 * Tests for the gate audit (methodology v2, T4b).
 *
 * The failure mode worth defending against is not a missed violation — it is a
 * FALSE one. This audit produces the evidence that decides whether a gate earns
 * hard pre-delivery blocking, and blocking the turn path is expensive. An audit
 * that cries wolf gets ignored, and then the one real finding is ignored with it.
 *
 * So most of what follows checks that correct behaviour does NOT trigger: the
 * student's own aspirational phrasing, a properly cited cross-session reference,
 * ordinary English containing the word "card".
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

console.log("\ngate-audit\n");

/** Every gate this audit knows how to check. */
const ALL = AUDIT_RULES.map((r) => r.cardCode);

const codes = (reply: string) => auditReply(reply, ALL).map((f) => f.cardCode);

test("a clean reply produces nothing", () => {
  assert.deepEqual(
    codes(
      "That's a lot of ground. Which of those three would you bet on today, and " +
        "what does choosing it cost you?",
    ),
    [],
  );
});

test("an empty reply produces nothing", () => {
  assert.deepEqual(auditReply("", ALL), []);
  assert.deepEqual(auditReply("   \n ", ALL), []);
});

/* ── Real breaches ───────────────────────────────────────────────────────── */

test("H-001 catches pattern language", () => {
  assert.ok(codes("You always wait for someone else to go first.").indexOf("H-001") >= 0);
  assert.ok(codes("You tend to defer in those rooms.").indexOf("H-001") >= 0);
});

test("H-004 catches comparison to other students", () => {
  assert.ok(codes("Most people at your level struggle with this.").indexOf("H-004") >= 0);
  assert.ok(codes("Compared to other executives I've worked with, you're direct.").indexOf("H-004") >= 0);
});

test("H-109 catches a function declared for the student", () => {
  assert.ok(codes("Your function is Marketing.").indexOf("H-109") >= 0);
  assert.ok(codes("Your primary function is Operations, based on those stories.").indexOf("H-109") >= 0);
});

test("H-208 catches credibility inferred from a title or employer", () => {
  assert.ok(codes("As a Director, you clearly have leadership experience.").indexOf("H-208") >= 0);
  assert.ok(codes("Having worked at Google, your technical credibility is settled.").indexOf("H-208") >= 0);
  assert.ok(codes("With your MBA, you have business acumen.").indexOf("H-208") >= 0);
});

test("H-208 does not fire on ordinary \"as a result\" prose", () => {
  // The reason there are two patterns: requiring neither an intensifier nor a
  // capitalised title would flag this, which is not a credibility claim at all.
  assert.deepEqual(codes("As a result, you have three options to weigh."), []);
});

test("H-209 catches aspiration treated as evidence", () => {
  assert.ok(
    codes("You clearly have product management skills.").indexOf("H-209") >= 0,
  );
});

test("no audit rule is keyed on a code that has been renumbered", () => {
  /*
   * ── THE SECOND FILE THIS BUG WAS IN ────────────────────────────────────
   * `AUDIT_RULES` was keyed on IG-U012, IG-U013 and IG-U014 — the Module 11 trio's
   * numbers before her allocation rule of 25 August moved them to IG-U018–IG-U020. Every
   * one of those references went stale the moment `wing:apply-corrections` renamed the
   * rows, and none of them errored.
   *
   * Two different failures come out of that, and the second is the worse one:
   *
   * 1. `auditCoverage` compares the live card codes against this table, so IG-U019 and
   *    IG-U020 would report as UNCHECKED — two gates with working deterministic detectors
   *    presented as having none. This module's own header says the failure mode worth
   *    defending against is a gate that looks covered and is not; this is that, inverted,
   *    and inverted is still wrong.
   * 2. The patterns still match, so a real violation is still detected — and then filed
   *    against a card code that no longer exists. Her platform-wide document reassigns
   *    IG-U012–IG-U017, so once those gates seed, a finding about behavioural disclosure
   *    would be labelled with Role-Aware Summarization's number. A mislabelled safety
   *    finding is worse than a missing one.
   *
   * `CORRECTIONS` is the authoritative record of every rename, so the check needs no
   * document parsing: a code that appears as a rename's source, at any point in its
   * chain, must not be a key here. That covers H-308 → H-007 as well, which this table
   * has already had to follow once.
   */
  const renamed = new Map<string, string>();
  for (const c of CORRECTIONS) {
    if (c.kind !== "recode") continue;
    renamed.set(c.from, c.to);
    for (const old of c.supersededFrom ?? []) renamed.set(old, c.to);
  }

  const keys = AUDIT_RULES.map((r) => r.cardCode).concat(
    NOT_AUDITABLE.map((n) => n.cardCode),
  );
  for (const code of keys) {
    assert.equal(
      renamed.get(code),
      undefined,
      `${code} was renumbered to ${renamed.get(code)}. A stale key here makes ` +
        "auditCoverage report the gate as unchecked, and files any finding against a " +
        "code that no longer exists.",
    );
    assert.equal(
      RETIRED.indexOf(code) >= 0,
      false,
      `${code} is a retired code and belongs to no card.`,
    );
  }
});

test("IG-U005 catches internal methodology vocabulary", () => {
  assert.ok(codes("This heuristic fires when you hedge.").indexOf("IG-U005") >= 0);
  assert.ok(codes("The coaching move here is to hold the silence.").indexOf("IG-U005") >= 0);
  assert.ok(codes("Your population tag is early career.").indexOf("IG-U005") >= 0);
});

test("IG-V01 catches the corporate and hedging registers", () => {
  assert.ok(codes("We are pleased to inform you that Session 2 is open.").indexOf("IG-V01") >= 0);
  assert.ok(codes("You might want to consider updating your headline.").indexOf("IG-V01") >= 0);
  assert.ok(codes("Keep networking and work on your personal brand.").indexOf("IG-V01") >= 0);
});

test("IG-V03 catches prescriptive framing", () => {
  assert.ok(codes("You should lead with the outcome.").indexOf("IG-V03") >= 0);
  assert.ok(codes("You need to rewrite that headline.").indexOf("IG-V03") >= 0);
});

test("IG-U019 catches an undisclosed behavioural characterisation", () => {
  // IG-U04, then IG-U007, then IG-U013. The Module 11 trio was renumbered three times on
  // 18 August; the second move made room for her research-derived gates.
  assert.ok(codes("You tend to avoid conflict in those meetings.").indexOf("IG-U019") >= 0);
  assert.ok(codes("Your networking style is transactional.").indexOf("IG-U019") >= 0);
});

test("IG-U020 catches accountability framing in a task follow-up", () => {
  // IG-U05, then IG-U008, then IG-U014, now IG-U020. Her allocation rule of 25 August.
  assert.ok(codes("You didn't do the tasks I assigned last week.").indexOf("IG-U020") >= 0);
  assert.ok(codes("You still haven't sent those messages.").indexOf("IG-U020") >= 0);
  assert.ok(codes("You've completed 1 of 3 tasks so far.").indexOf("IG-U020") >= 0);
  assert.ok(codes("I'm disappointed — this was what you said you'd do.").indexOf("IG-U020") >= 0);
});

test("IG-U020 does not fire on the follow-up the gate asks for", () => {
  /*
   * The gate's own wording: "How did those tasks go?" not "You didn't do the
   * tasks I assigned." Both halves are in its text, so a rule derived from it
   * that flagged the first half would be flagging the methodology's own example
   * of correct behaviour.
   */
  assert.deepEqual(codes("How did those tasks go?"), []);
  assert.deepEqual(
    codes("Life happens. Are those still the right tasks, or has something changed?"),
    [],
  );
  assert.deepEqual(codes("You committed to reaching out to three people — how did that land?"), []);
});

/* ── The traps ───────────────────────────────────────────────────────────── */

test("the STUDENT's aspirational phrasing is not a Wing breach", () => {
  /*
   * H-209 quotes "I want to be a product manager" in its detection method as the
   * aspirational INPUT. The breach is Wing affirming a skill on the strength of
   * it. Matching the student's phrase against Wing's reply would flag the correct
   * behaviour — asking for evidence — as a violation.
   */
  assert.deepEqual(
    codes("You said you want to be a product manager. What have you shipped that shows it?"),
    [],
  );
  assert.deepEqual(codes("You told me you're passionate about operations. Say more."), []);
});

test("H-002 is review, not violation, and only where a reference is made", () => {
  // The phrase means the provenance rule now applies. It is not itself a breach —
  // recording it as one would make every legitimate callback a violation, and
  // H-303 is a Foundation 3 card whose entire job is calling back to Session 2.
  const found = auditReply(
    "In your Foundation session you said 'I suggested we might restructure'. That word — suggested — is doing a lot of work.",
    ALL,
  );
  const h002 = found.filter((f) => f.cardCode === "H-002");
  assert.equal(h002.length, 1);
  assert.equal(h002[0].mode, "review");
  const rule = AUDIT_RULES.find((r) => r.cardCode === "H-002")!;
  assert.equal(rule.mode, "review");
});

test("ordinary English is not internal vocabulary", () => {
  /*
   * IG-U005 also lists the bare words "gate" and "card". They are deliberately
   * not matched: a credit card and a boarding gate are ordinary English, and
   * flagging them would bury every real finding. Documented in the rule.
   */
  assert.deepEqual(codes("Put it on a card and bring it to the meeting."), []);
  assert.deepEqual(codes("They met him at the gate."), []);
});

test("every rule is anchored on word boundaries", () => {
  // "you should" inside "as you shouldered" is not a prescriptive framing.
  assert.deepEqual(codes("The way you shouldered that project says something."), []);
});

/* ── Scope and coverage ──────────────────────────────────────────────────── */

test("only gates active in this session are checked", () => {
  // A Foundation 1 reply must never be audited against a Foundation 2 rule.
  const reply = "As a Director, you clearly have leadership experience.";
  assert.deepEqual(auditReply(reply, ["H-001", "H-109"]), []);
  assert.equal(auditReply(reply, ["H-208"]).length, 1);
});

test("one finding per gate, not one per phrase", () => {
  // The question is whether a gate held. Ten findings from one paragraph would
  // drown the answer.
  const reply = "You always do this. You tend to defer. Your pattern is deference.";
  assert.equal(auditReply(reply, ["H-001"]).length, 1);
});

test("a finding carries an excerpt a reviewer can judge from", () => {
  const [f] = auditReply(
    "I've been looking at everything so far and your function is Marketing, which explains the pattern.",
    ["H-109"],
  );
  assert.equal(f.matched.toLowerCase(), "your function is");
  assert.ok(f.excerpt.indexOf("Marketing") >= 0);
  assert.ok(f.excerpt.length < 220);
  assert.equal(f.excerpt.indexOf("\n"), -1);
});

test("coverage separates what was checked from what was not", () => {
  // A report saying "no violations" must not be read as "every gate held".
  const { checked, unchecked } = auditCoverage(["H-001", "H-310", "IG-V01", "IG-U003"]);
  assert.deepEqual(checked, ["H-001", "IG-V01"]);
  assert.deepEqual(unchecked, ["H-310", "IG-U003"]);
});

test("the unauditable gates are named with a reason", () => {
  assert.deepEqual(
    NOT_AUDITABLE.map((g) => g.cardCode).sort(),
    ["H-007", "H-110", "H-310", "IG-U003", "IG-U018", "IG-V02"],
  );
  for (const g of NOT_AUDITABLE) assert.ok(g.reason.length > 30, g.cardCode);
});

test("no rule is listed as both auditable and not", () => {
  for (const g of NOT_AUDITABLE) {
    assert.equal(AUDIT_RULES.findIndex((r) => r.cardCode === g.cardCode), -1, g.cardCode);
  }
});

test("every rule cites the methodology text it came from", () => {
  // Traceability. A regex nobody can trace back to a rule is a regex nobody will
  // dare change.
  for (const r of AUDIT_RULES) {
    assert.ok(r.source.length > 20, `${r.cardCode} has no source`);
    assert.ok(r.patterns.length > 0, `${r.cardCode} has no patterns`);
    assert.ok(r.what.length > 20, `${r.cardCode} has no description`);
  }
});

test("no pattern is global, so exec stays stateless", () => {
  // A /g regex reused across calls carries lastIndex between them and starts
  // silently missing matches on every second reply.
  for (const r of AUDIT_RULES) {
    for (const p of r.patterns) assert.equal(p.global, false, `${r.cardCode}: ${p}`);
  }
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");
