/**
 * The prompt log, as the life-log path writes it.
 *
 * Run:  npx tsx server/wing/prompt-log-store.test.ts
 *
 * ── WHAT IS WORTH TESTING HERE ───────────────────────────────────────────
 * `reveal-evidence.ts` proves the classifications. This proves the three things that only
 * exist once a database is in front of them:
 *
 *   1. **A response finds the delivery it actually answers.** Matching on "the newest
 *      unanswered row" instead of "the newest unanswered row FOR THIS PROMPT" files a
 *      student's words under the wrong question, and the tier and category attached to a
 *      quote are what Gate 2 counts.
 *   2. **Neither write may throw.** One is inside the path that asks a student a
 *      question; the other is inside the path that saves what they wrote. A log about
 *      someone's words must never be the reason those words are lost.
 *   3. **A library category is mapped or null, never guessed.** Gate 2 needs three
 *      DISTINCT categories, so a plausible wrong mapping either manufactures distinctness
 *      or collapses it.
 */
import { logDelivery, logResponse, signalCategoryFor } from "./prompt-log-store";

let failures = 0;
const fail = (msg: string) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
const ok = (msg: string) => console.log(`  ok — ${msg}`);

/** Records every statement so the test can read what would have hit the database. */
function recordingDb(rowsFor: (n: number) => Record<string, unknown>[] = () => []) {
  const seen: string[] = [];
  let n = 0;
  return {
    seen,
    execute: async (q: unknown) => {
      n++;
      seen.push(JSON.stringify(q));
      return { rows: rowsFor(n) };
    },
  };
}

console.log("\nprompt-log-store\n");

console.log("A response closes the delivery for ITS OWN prompt");
{
  const before = failures;
  const db = recordingDb((n) => (n === 1 ? [{ id: 7 }] : []));
  await logResponse(db, {
    studentId: 42,
    promptId: 99,
    channel: "micro_journal",
    text: "I ran the retro on Tuesday and it went better than I expected.",
  });

  const update = db.seen[0] ?? "";
  if (update.indexOf("prompt_id") < 0) {
    fail("the match must be per-prompt; without it a student's words land on another question");
  }
  if (update.indexOf("responded_at") < 0) {
    fail("the update should only consider deliveries that are still open");
  }
  if (db.seen.length !== 1) {
    fail(`the update matched, so nothing should be inserted; ${db.seen.length} statements ran`);
  }
  if (failures === before) ok("an answered delivery is closed, not duplicated");
}

console.log("\nAn unprompted entry is still recorded, not dropped");
{
  const before = failures;
  // No open delivery: the UPDATE matches nothing, so the answer becomes its own row.
  const db = recordingDb(() => []);
  await logResponse(db, {
    studentId: 42,
    promptId: null,
    channel: "micro_journal",
    text: "Wrote the whole positioning draft this morning.",
  });
  if (db.seen.length !== 2) {
    fail(`expected an update then an insert, got ${db.seen.length} statements`);
  }
  if ((db.seen[1] ?? "").indexOf("INSERT") < 0) fail("the fallback must insert the answer");
  if (failures === before) ok("an orphan row beats a lost answer");
}

console.log("\nNeither write can break the path it sits in");
{
  const before = failures;
  const broken = {
    execute: async () => {
      throw new Error("relation \"wing.prompt_log\" does not exist");
    },
  };

  /*
   * `logDelivery` runs inside "show this student a prompt". If it threw, one broken
   * insert would silently stop them being asked anything.
   */
  const id = await logDelivery(broken, {
    studentId: 42,
    promptId: 99,
    channel: "micro_journal",
    signalCategory: "career",
    tier: null,
  });
  if (id !== null) fail("a failed delivery insert should report null, not an id");

  /*
   * `logResponse` runs inside "save what the student wrote". If it threw, the entry
   * would be lost to protect the log about the entry.
   */
  let threw = false;
  try {
    await logResponse(broken, {
      studentId: 42,
      promptId: 99,
      channel: "micro_journal",
      text: "something they said",
    });
  } catch {
    threw = true;
  }
  if (threw) fail("logResponse must never throw — the caller is mid-save of the entry");

  // A healthy insert still returns its id, so this is not "returns null always".
  const good = await logDelivery(recordingDb(() => [{ id: 12 }]), {
    studentId: 42,
    promptId: 99,
    channel: "micro_journal",
    signalCategory: "career",
    tier: null,
  });
  if (good !== 12) fail(`a healthy insert should return its id, got ${good}`);
  if (failures === before) ok("both writes fail quietly; a healthy one still returns its id");
}

console.log("\nA category is mapped or null, never guessed");
{
  const before = failures;
  for (const c of ["career", "energy", "influence", "achievement"]) {
    if (signalCategoryFor(c) !== c) fail(`${c} is one of her eight and should map to itself`);
  }
  if (signalCategoryFor("CAREER") !== "career") fail("the map should not be case-sensitive");

  /*
   * The important half. `prompt_category` predates her vocabulary, so a value that is not
   * one of hers must record null — Gate 2 counts DISTINCT categories, and a plausible
   * wrong mapping either invents distinctness or destroys it.
   */
  for (const c of ["reflection", "weekend", "milestone", "", null, undefined]) {
    if (signalCategoryFor(c as string) !== null) fail(`${c} is not one of her eight`);
  }
  if (failures === before) ok("her eight map through; everything else records null");
}

console.log(failures ? `\n${failures} failure(s)\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);
