/**
 * IG-UX01 — ruling 1. Access does not adapt.
 *
 * Two halves, because the gate can be broken in two unrelated ways:
 *
 *   the rule       → `missingPrerequisites` / `outOfOrderNote` behave, enumerated
 *   the enforcement→ nothing under server/ refuses entry or writes the retired status
 *
 * The second half is a static scan of the source, in the style of `api-contracts.test.ts`,
 * because that is where the violation actually lived. The client never locked anything —
 * `POST /api/foundation-sessions/2/start` answered 403 and the arc was seeded `locked`,
 * so a rebuilt UI would have produced a button that failed. A unit test on a pure module
 * cannot see that, and a type checker never will.
 */
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import {
  FOUNDATION_SEQUENCE,
  enteredOutOfOrder,
  isFoundationNumber,
  missingPrerequisites,
  foundationOpening,
  outOfOrderNote,
  type FoundationNumber,
} from "@shared/session-access";

let failed = 0;
function check(label: string, ok: boolean, detail: string) {
  if (ok) console.log(`  ok — ${detail}`);
  else {
    failed++;
    console.log(`  FAIL — ${label}: ${detail}`);
  }
}

console.log("\nsession access — IG-UX01, ruling 1\n");

/* ─────────────────────────────────────────────────────────────────────────
 * 1. What is missing, over every combination of completed sessions.
 *
 * 3 sessions × 8 completion subsets = 24 cases, so there is no reason to sample.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("Missing prerequisites, enumerated over every completion state");
{
  const subsets: number[][] = [];
  for (let mask = 0; mask < 8; mask++) {
    subsets.push(FOUNDATION_SEQUENCE.filter((_, i) => mask & (1 << i)));
  }

  const bad: string[] = [];
  let n = 0;
  for (const target of FOUNDATION_SEQUENCE) {
    for (const done of subsets) {
      n++;
      const missing = missingPrerequisites(target, done);
      /* Independent restatement: an earlier session, not finished. */
      const expected = FOUNDATION_SEQUENCE.filter((s) => s < target && !done.includes(s));
      if (missing.join(",") !== expected.join(",")) {
        bad.push(`session ${target} with [${done}] → [${missing}], expected [${expected}]`);
      }
      /* A session is never its own prerequisite, and never a later one's. */
      if (missing.some((m) => m >= target)) bad.push(`session ${target} listed ${missing}`);
      if (enteredOutOfOrder(target, done) !== missing.length > 0) {
        bad.push(`session ${target}: enteredOutOfOrder disagrees with missing`);
      }
    }
  }
  check("missing", bad.length === 0, bad.length === 0 ? `${n} cases` : bad.slice(0, 3).join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 2. Session 1 is never out of order.
 *
 * Called out separately because it is the case that decides whether a brand-new student
 * gets an apology in their first message. It has no prerequisites by construction, and
 * her Platform Updates note says the same of intake: "the first experience, and has no
 * prerequisite by definition."
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe first session never apologises for what it does not have");
{
  const bad: string[] = [];
  for (const done of [[], [1], [2], [3], [1, 2], [2, 3], [1, 2, 3]]) {
    if (missingPrerequisites(1, done).length) bad.push(`[${done}] made session 1 out of order`);
    if (outOfOrderNote(1, done) !== null) bad.push(`[${done}] produced a note on session 1`);
  }
  check("first", bad.length === 0, bad.length === 0 ? "no note on session 1, whatever else is done" : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 3. The note names an absence, and never redirects.
 *
 * Her constraint, verbatim: "Foundation sessions are offered as a visible option but
 * never required as a redirect." A sentence ending "do Session 1 first" would be the 403
 * again, in prose — so the wording is asserted, not just its presence.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe note offers the earlier session and never redirects to it");
{
  const bad: string[] = [];
  let produced = 0;

  for (const target of FOUNDATION_SEQUENCE) {
    for (let mask = 0; mask < 8; mask++) {
      const done = FOUNDATION_SEQUENCE.filter((_, i) => mask & (1 << i));
      const note = outOfOrderNote(target, done);
      const missing = missingPrerequisites(target, done);

      if (!missing.length) {
        if (note !== null) bad.push(`session ${target} with [${done}]: note with nothing missing`);
        continue;
      }
      if (note === null) { bad.push(`session ${target} with [${done}]: ${missing.length} missing, no note`); continue; }
      produced++;

      /* Never an instruction to leave. */
      if (/\bfirst\b|\bbefore you\b|\bgo back\b|\bcome back\b|\bneed to\b|\bmust\b|\brequired\b/i.test(note)) {
        bad.push(`session ${target}: note redirects — "${note}"`);
      }
      /* Never framed as the student's failure. */
      if (/\byou (?:have not|haven't|did not|didn't|skipped)\b/i.test(note)) {
        bad.push(`session ${target}: note blames — "${note}"`);
      }
      /* IG-UX03: no completion language in a message every out-of-order student reads. */
      if (/\bcomplete[sd]?\b|\bfinish(?:ed)?\b|\bprogress\b/i.test(note)) {
        bad.push(`session ${target}: completion language — "${note}"`);
      }
      /* It has to say what is absent, or it communicates nothing. */
      if (!/\bdon't have\b|\bdo not have\b/i.test(note)) {
        bad.push(`session ${target}: note names no absence — "${note}"`);
      }
      /* And it has to leave the door open. */
      if (!/\bwhenever you like\b/i.test(note)) {
        bad.push(`session ${target}: note does not offer the earlier session — "${note}"`);
      }
    }
  }
  check("note", bad.length === 0, bad.length === 0 ? `${produced} notes, none of them a redirect` : bad.slice(0, 3).join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 4. Two missing sessions read as one sentence.
 *
 * Session 3 entered first is the case that produced a list, and a list of two absences
 * joined with a comma reads as a checklist — which is the framing IG-UX03 rules out.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nTwo absences join into a sentence, not a list");
{
  const note = outOfOrderNote(3, []);
  const ok =
    !!note &&
    note.includes(" or ") &&
    !note.includes("  ") &&
    (note.match(/\./g) ?? []).length === 2;
  check("joining", ok, ok ? "both absences in one clause, joined with \"or\"" : `got: ${note}`);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 4a. The opening always carries the note when there is one.
 *
 * This is the assertion that replaced a static check. The route no longer assembles the
 * opening, so the only way to lose the note is to break this function — and a mutation
 * that returns `guidance` alone fails here rather than passing a scan for an identifier.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe opening carries the note whenever there is one");
{
  const bad: string[] = [];
  let withNote = 0;
  for (const target of FOUNDATION_SEQUENCE) {
    for (let mask = 0; mask < 8; mask++) {
      const done = FOUNDATION_SEQUENCE.filter((_, i) => mask & (1 << i));
      const note = outOfOrderNote(target, done);

      for (const guidance of ["Let's begin.", "", null]) {
        const opening = foundationOpening(target, done, guidance);

        if (note) {
          withNote++;
          if (!opening.includes(note)) bad.push(`session ${target} [${done}] guidance=${JSON.stringify(guidance)}: note absent`);
        } else if (opening !== (guidance?.trim() ?? "")) {
          bad.push(`session ${target} [${done}]: opening changed with nothing missing`);
        }

        /* The guidance comes first — the note is an aside, not the greeting. */
        if (guidance?.trim() && note && opening.indexOf(guidance.trim()) > opening.indexOf(note)) {
          bad.push(`session ${target}: note precedes the guidance`);
        }
        /* No empty guidance leaving a blank line above the note. */
        if (opening.startsWith("\n") || opening.includes("\n\n\n")) {
          bad.push(`session ${target}: stray blank lines in the opening`);
        }
      }
    }
  }
  check("opening", bad.length === 0, bad.length === 0 ? `${withNote} openings carrying a note, guidance first` : bad.slice(0, 3).join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 5. isFoundationNumber does not admit anything else.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nOnly 1, 2 and 3 are Foundation numbers");
{
  const admits = [0, 1, 2, 3, 4, -1, 1.5, NaN, Infinity].filter((n) => isFoundationNumber(n));
  check("guard", admits.join(",") === "1,2,3", `admits ${admits.join(",") || "nothing"}`);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 6. THE ENFORCEMENT. Nothing under server/ locks a session.
 *
 * This is the half that matters, and the half a rebuilt UI depends on. Three specific
 * things are checked, because three specific things did it:
 *
 *   a. a write of the retired status
 *   b. a refusal on the start path
 *   c. a second copy of the arc initialiser
 *
 * (c) is here because the initialiser WAS duplicated — foundation-sessions-routes.ts and
 * routes.ts each had their own loop, so ruling 1 had to be applied twice or not at all.
 * That is the same shape as the gate renumbering that compiled two conditional gates on
 * every turn. One helper, and a test that fails if a second appears.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nNothing under server/ locks a session");
{
  const root = join(process.cwd(), "server");
  const files: { rel: string; src: string }[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) continue;
      files.push({ rel: full.slice(root.length + 1), src: readFileSync(full, "utf8") });
    }
  };
  if (existsSync(root)) walk(root);

  const bad: string[] = [];
  let saysSomething = false;

  for (const { rel, src } of files) {
    /*
     * Comments are where this decision is explained, so they are not evidence — and
     * neither is a TYPE. `session-store.ts` declares
     *   export type WingSessionStatus = "locked" | "available" | ...
     * which is the enum's shape, not a write of it. Type aliases are stripped from
     * `type X =` to the terminating semicolon; a mutation that adds a real writer
     * immediately after one is still caught, which is how this exclusion was checked.
     */
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      .replace(/\b(?:export\s+)?type\s+\w+(?:<[^>]*>)?\s*=[\s\S]*?;/g, "");

    /*
     * (a) a writer of the retired status.
     *
     * An `exec` loop rather than `matchAll`: tsconfig sets no `target`, so output is ES5
     * and iterating a RegExp iterator is TS2802. Same trap as `check-ux.ts`.
     */
    const writer = /["']locked["']/g;
    for (let m = writer.exec(code); m; m = writer.exec(code)) {
      const line = code.slice(0, m.index).split("\n").length;
      bad.push(`${rel}:${line} writes the retired status 'locked'`);
    }

    // (b) a refusal keyed on session order
    if (/Complete the previous session/i.test(code)) {
      bad.push(`${rel} refuses entry: "Complete the previous session first"`);
    }
    if (/status\s*===\s*["']locked["']/.test(code)) bad.push(`${rel} gates on status === 'locked'`);

    // (c) a second arc initialiser
    if (/ensureSession\(\s*studentId\s*,\s*type\b/.test(code) && !rel.startsWith("wing/session-store")) {
      bad.push(`${rel} seeds the arc itself — call store.ensureFoundationArc instead`);
    }

    if (/foundationOpening\s*\(/.test(code)) saysSomething = true;
  }

  /*
   * (d) the OTHER half of the ruling. "Prerequisites are communicated inside the module,
   * never on the navigation" — so open access alone does not satisfy it. Removing the note
   * from the start route passes every check above and leaves a student entering Foundation
   * 3 first with an opening written for someone who has done 1 and 2, which is the
   * generic-introduction failure IG-UX06 names.
   */
  if (files.length && !saysSomething) {
    bad.push("nothing under server/ calls foundationOpening — access is open but silent");
  }

  check(
    "enforcement",
    files.length > 0 && bad.length === 0,
    files.length === 0
      ? "could not read server/ — this check proved nothing"
      : bad.length === 0
        ? `${files.length} server files, no lock, no refusal, one arc initialiser`
        : bad.slice(0, 4).join("; "),
  );
}

console.log(failed === 0 ? "\nall passed\n" : `\n${failed} failed\n`);
if (failed > 0) process.exit(1);
