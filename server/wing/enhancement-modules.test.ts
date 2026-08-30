/**
 * The Enhancement Modules (Feature List A3) — the four rules that were true of the
 * spec and false of the code.
 *
 * A static scan, in the style of `session-access` and `soft-check-in`, because every
 * file involved opens a database connection at import and a unit test against mocked
 * drizzle would prove the mocks.
 *
 * ── WHAT LINKS THE FOUR ──────────────────────────────────────────────────
 * A3 removed an ordering: "students can complete them in any order or skip entirely",
 * and "Wing must have full context from all completed Foundation Sessions AND any
 * previously completed Enhancement Modules". Access was made free. What nobody
 * revisited was the CONTEXT, which was three hand-written branches — B reads A, C
 * reads A and B, and A reads nothing — so the removed ordering survived in the one
 * place that decides what Wing knows. A student who did C, then B, then A opened
 * Module A on a blank sheet, which is precisely the isolation the requirement names.
 *
 * Two of the four are the same shape one level down: a session or module that ended
 * EARLY has written a real artifact, and three readers filtered on
 * `status === "completed"` and dropped it. The fourth is an argument order that
 * typechecked and made an admin screen report on the wrong thing entirely.
 *
 * None of them raised an error. That is why they are pinned here.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

let failed = 0;
function check(label: string, ok: boolean, detail: string) {
  if (ok) console.log(`  ok — ${detail}`);
  else {
    failed++;
    console.log(`  FAIL — ${label}: ${detail}`);
  }
}

const root = process.cwd();
const read = (rel: string): string | null => {
  const p = join(root, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};
const decomment = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const ROUTES = "server/enhancement-modules-routes.ts";
const STORE = "server/wing/enhancement-store.ts";
const REPLAY = "server/wing/criteria-replay.ts";

console.log("\nthe Enhancement Modules — any order, and an exit you can come back through\n");

/* ─────────────────────────────────────────────────────────────────────────
 * 1. Context comes from every other module, whatever order they were done in.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("Each module reads every other one, not the ones before it");
{
  const src = read(ROUTES);
  const bad: string[] = [];

  if (!src) bad.push(`${ROUTES} not found — this check proved nothing`);
  else {
    const code = decomment(src);

    /*
     * Both context builders, matched on their DEFINITIONS and on what they are built
     * from — not on the name appearing somewhere. The conversation path is what a
     * student meets; the analysis path decides whether the module is finished. They
     * carried the same bug in two copies, which is how one of them gets fixed alone.
     */
    if (!/async function formatPreviousModulesAnalysisContext\(/.test(code)) {
      bad.push("the analysis prompt's context builder is gone");
    }
    if (!/const previousSummaries = otherModules/.test(code)) {
      bad.push("the conversation prompt no longer builds its summaries from the module list");
    }

    /*
     * And both admit an early exit. The exit writes a real `module_outcome`
     * artifact, so a filter on `completed` alone silently treats a student who
     * stopped at a natural point as having done nothing — which is the same defect
     * as the chain, one level down, and it would survive fixing the chain alone.
     */
    const admitsEarly = (
      code.match(/status === ["'`]completed["'`] \|\| m\.status === ["'`]ended_early["'`]/g) ?? []
    ).length;
    if (admitsEarly < 2) {
      bad.push(
        `${admitsEarly} of 2 context builders admit an ended-early module — the other ` +
          `drops an outcome that was written`,
      );
    }

    /*
     * The tell is a single-module fetch keyed on a literal. `getEnhancementModule(
     * userId, "A")` is how a hand-written chain is written and it cannot express
     * "every other one".
     */
    const hardCoded = Array.from(
      code.matchAll(/getEnhancementModule\(\s*userId\s*,\s*["'`]([ABC])["'`]/g),
    ).map((m) => m[1]);
    if (hardCoded.length) {
      bad.push(
        `the context still fetches module ${Array.from(new Set(hardCoded)).join(", ")} by ` +
          `name — a chain, not "any order"`,
      );
    }

    /* And the plural read is what replaced it. */
    const plural = (code.match(/getEnhancementModulesForUser\(/g) ?? []).length;
    if (plural < 4) {
      bad.push(`only ${plural} call(s) to getEnhancementModulesForUser — both builders need one`);
    }
  }

  check("any order", bad.length === 0, bad.length === 0
    ? "both context builders read every other module by list, none by name"
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 2. An early exit seals the transcript, the way Foundation's does.
 *
 * `completeSession` is the only thing that calls `completeTranscript`. Reaching it
 * only on "completed" left every abandoned module's transcript open, and left
 * `completed_at` NULL so the admin export rendered a blank date.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nEnding early seals the transcript and still records how it ended");
{
  const src = read(STORE);
  const bad: string[] = [];

  if (!src) bad.push(`${STORE} not found`);
  else {
    const code = decomment(src);
    const seal = code.indexOf("completeSession(moduleId)");
    if (seal < 0) bad.push("the store never seals a module");
    else {
      /* The branch that reaches the seal must admit both end states. */
      const guard = code.slice(Math.max(0, seal - 400), seal);
      if (!/ended_early/.test(guard)) {
        bad.push("only a completed module is sealed — an early exit leaves the transcript open");
      }
    }

    /* And the distinct end state survives the seal. */
    if (!/updateSessionStatus\(\s*moduleId\s*,\s*["'`]ended_early["'`]/.test(code)) {
      bad.push("nothing records ended_early after sealing, so it reads as a normal completion");
    }
  }

  check("sealed", bad.length === 0, bad.length === 0
    ? "ended_early seals like a completion and is then recorded as itself"
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 3. And the student can come back through it.
 *
 * `/start` promoted only `available`, so a stopped module stayed at `ended_early`,
 * `/start` returned success, and the stream route refused every message. "Exit at any
 * natural stopping point" was a one-way door.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nA module that was left can be picked up again");
{
  const src = read(ROUTES);
  const bad: string[] = [];

  if (!src) bad.push(`${ROUTES} not found`);
  else {
    const code = decomment(src);

    /*
     * Anchored on the branch that promotes an EXISTING module, not on the first
     * `in_progress` in the file — the one above it creates a module and is a
     * different decision. An earlier version of this check found that one and
     * reported a fix that was already in place, which is its own kind of wrong.
     */
    const branch = code.match(/\}\s*else if \(module\.status === [^)]*\)/);
    if (!branch) bad.push("the /start route no longer branches on an existing module's status");
    else if (!/ended_early/.test(branch[0])) {
      bad.push(`only \`${branch[0].replace(/\s+/g, " ")}\` is promoted — an early exit cannot be resumed`);
    }

    /*
     * The stream route's own precondition, quoted so the two halves stay in
     * agreement: if it ever stops admitting in_progress, the resume above is moot.
     */
    if (!/module\.status !== ["'`]in_progress["'`]/.test(code)) {
      bad.push("the stream route no longer keys on in_progress — check 3 may be testing nothing");
    }
  }

  check("resumable", bad.length === 0, bad.length === 0
    ? "ended_early is promoted back to in_progress, which is what the stream route admits"
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 4. A Foundation session that ended early still counts.
 *
 * The Foundation early-exit route writes the artifact BEFORE recording the end state,
 * so the work exists. Filtering on "completed" threw it away for exactly the students
 * whose continuity matters most.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nFoundation work done before an early exit reaches the modules");
{
  const src = read(ROUTES);
  const bad: string[] = [];

  if (!src) bad.push(`${ROUTES} not found`);
  else {
    const code = decomment(src);

    /*
     * Every status filter over rows in this file, checked as a set. A bare
     * `!== "completed"` is the bug; the fix names both.
     */
    const bare = Array.from(
      code.matchAll(/row\.status\s*!==\s*["'`]completed["'`]\s*\)/g),
    ).length;
    if (bare) bad.push(`${bare} filter(s) still drop an ended-early Foundation session`);

    if (!/row\.status !== ["'`]completed["'`] && row\.status !== ["'`]ended_early["'`]/.test(code)) {
      bad.push("no filter admits ended_early — the artifact is written and never read");
    }
  }

  check("early exits count", bad.length === 0, bad.length === 0
    ? "the foundation outcome reader admits both end states"
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 5. The criteria replay evaluates the draft it says it is evaluating.
 *
 * `checkModuleCompletion(userId, moduleCode, messages, userProfile,
 * professionalStatus?, criteriaOverride?)` was called with five arguments, so the
 * rendered draft landed in `professionalStatus` and `criteriaOverride` was undefined.
 * The replay silently scored the PUBLISHED criteria and resolved every candidate to
 * mid-career, and the admin screen reported it as a test of the draft.
 *
 * Both misplaced parameters are loosely typed, so nothing complained.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe replay passes the draft where the draft is read");
{
  const replay = read(REPLAY);
  const routes = read(ROUTES);
  const bad: string[] = [];

  if (!replay) bad.push(`${REPLAY} not found`);
  if (!routes) bad.push(`${ROUTES} not found`);

  if (replay && routes) {
    /* The signature, read rather than assumed. */
    const sig = decomment(routes).match(
      /export async function checkModuleCompletion\(([\s\S]*?)\)\s*:/,
    );
    if (!sig) bad.push("checkModuleCompletion's signature could not be read");
    else {
      const params = sig[1]
        .split(",")
        .map((p) => p.split(":")[0].trim().replace("?", ""))
        .filter(Boolean);
      const overrideAt = params.indexOf("criteriaOverride");
      if (overrideAt < 0) bad.push("checkModuleCompletion no longer takes a criteriaOverride");
      else {
        const call = decomment(replay).match(
          /checkModuleCompletion\(([\s\S]*?)\n\s*\)/,
        );
        if (!call) bad.push("the replay's call to checkModuleCompletion could not be read");
        else {
          const args = call[1].split(",").map((a) => a.trim()).filter(Boolean);
          if (args.length !== params.length) {
            bad.push(
              `the replay passes ${args.length} argument(s) to a ${params.length}-parameter ` +
                `function — the draft criteria land in the wrong slot`,
            );
          } else if (!/rendered/.test(args[overrideAt] ?? "")) {
            bad.push(
              `the rendered draft is not in the criteriaOverride position ` +
                `(found "${args[overrideAt]}") — the replay would score the published criteria`,
            );
          }
        }
      }
    }
  }

  check("replay", bad.length === 0, bad.length === 0
    ? "the rendered draft arrives in criteriaOverride, at the arity the signature declares"
    : bad.join("; "));
}

console.log(failed === 0 ? "\nall passed\n" : `\n${failed} failed\n`);
if (failed > 0) process.exit(1);
