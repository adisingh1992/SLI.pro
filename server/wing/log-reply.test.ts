/**
 * IG-MJ04, and the safety block that was missing from the surface it governs.
 *
 * Two halves again, for the same reason as IG-UX01: the rule can be right and the path
 * can still be wrong. The pure half checks the judgement and what follows from it; the
 * static half checks that `life-log-store` actually compiles the safety rules and actually
 * withholds the cadence reset, because a version that computed the actions and ignored
 * them would pass everything else here.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  IG_MJ04_REGISTER,
  LOG_REPLY_CONTRACT,
  parseLogReply,
  postEntryActions,
} from "./log-reply";

let failed = 0;
function check(label: string, ok: boolean, detail: string) {
  if (ok) console.log(`  ok — ${detail}`);
  else {
    failed++;
    console.log(`  FAIL — ${label}: ${detail}`);
  }
}

console.log("\nlife log replies — IG-MJ04, and IG-S01 on a surface that had neither\n");

/* ─────────────────────────────────────────────────────────────────────────
 * 1. The model's answer is read strictly.
 *
 * `reportsCrisis` exists in `safety-hold-store` because `if (parsed.safetyHold)` opens a
 * hold on the string "false". The same trap applies on the way in, one layer earlier, and
 * a permissive parse here would make that guard irrelevant.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("Only a real boolean true sets a flag");
{
  const bad: string[] = [];
  for (const value of ["false", "true", 1, 0, "yes", "", null, undefined, {}, []]) {
    const got = parseLogReply({ reply: "ok", safetyHold: value, distress: value });
    if (got.safetyHold !== false) bad.push(`safetyHold: ${JSON.stringify(value)} → true`);
    if (got.distress !== false) bad.push(`distress: ${JSON.stringify(value)} → true`);
  }
  const real = parseLogReply({ reply: "ok", safetyHold: true, distress: true });
  if (!real.safetyHold || !real.distress) bad.push("a real true was not read");

  check("strict", bad.length === 0, bad.length === 0 ? "10 near-miss values rejected, a real true accepted" : bad.slice(0, 3).join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 2. A crisis is always distress. The bands nest.
 *
 * The reverse does not hold, and that is the point of having two: a hard week is IG-MJ04's
 * band and not IG-S01's. Collapsing them would suppress a fortnight of contact over a bad
 * week; separating them without nesting would let a crisis reply carry the ordinary
 * register.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nA safety hold implies distress, but distress does not imply a hold");
{
  const crisis = parseLogReply({ reply: "x", safetyHold: true, distress: false });
  const hard = parseLogReply({ reply: "x", safetyHold: false, distress: true });
  const ok = crisis.distress === true && hard.safetyHold === false && hard.distress === true;
  check("nesting", ok, ok ? "crisis is distress; distress alone opens nothing" : `crisis=${JSON.stringify(crisis)} hard=${JSON.stringify(hard)}`);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 3. Malformed output claims nothing.
 *
 * No reply, no flags. Not because that is safe — a missed crisis is the expensive error —
 * but because nothing was judged, so nothing may be asserted. Raising a hold on
 * unparseable JSON would mean a fortnight of silence from Wing because a model returned
 * a fenced object.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nUnparseable output judges nothing, rather than guessing either way");
{
  const bad: string[] = [];
  for (const raw of [null, undefined, "", "not json", 42, [], { nothing: true }]) {
    const got = parseLogReply(raw);
    if (got.reply !== "") bad.push(`${JSON.stringify(raw)} produced a reply`);
    if (got.safetyHold || got.distress) bad.push(`${JSON.stringify(raw)} set a flag`);
  }
  check("malformed", bad.length === 0, bad.length === 0 ? "7 malformed shapes: no reply, no flags" : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 4. What follows from each band.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nDistress withholds the module, the cadence and the follow-up");
{
  const ordinary = postEntryActions({ reply: "x", safetyHold: false, distress: false });
  const distress = postEntryActions({ reply: "x", safetyHold: false, distress: true });
  const crisis = postEntryActions({ reply: "x", safetyHold: true, distress: true });

  const bad: string[] = [];
  /* Her three prohibitions, on the band she wrote them for. */
  if (distress.mayRecommendModule) bad.push("distress may recommend a module");
  if (distress.mayRaiseCadence) bad.push("distress may raise the cadence");
  if (distress.mayFollowUpNow) bad.push("distress may follow up now");
  if (distress.openHold) bad.push("distress alone opened a hold");

  /* IG-S01's band does everything distress does, and opens a hold. */
  if (!crisis.openHold) bad.push("a crisis opened no hold");
  if (crisis.mayRecommendModule || crisis.mayRaiseCadence || crisis.mayFollowUpNow) {
    bad.push("a crisis permitted something distress forbids");
  }

  /* An ordinary entry is still never where a module is recommended — IG-MJ01. */
  if (ordinary.mayRecommendModule) bad.push("an ordinary entry may recommend a module");
  if (!ordinary.mayRaiseCadence) bad.push("an ordinary entry cannot reset dormancy");

  /* Every branch says why, so the log line is diagnosable. */
  for (const [name, a] of [["ordinary", ordinary], ["distress", distress], ["crisis", crisis]] as const) {
    if (!a.why.trim()) bad.push(`${name}: no reason given`);
  }

  check("actions", bad.length === 0, bad.length === 0 ? "module never, cadence and follow-up only on an ordinary entry" : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 5. The register tells the model her rule, and not its opposite.
 *
 * The instruction is the whole mechanism for "a single validating message" — there is no
 * classifier behind it — so its content is asserted rather than assumed.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe distress register carries her prohibitions");
{
  const text = `${IG_MJ04_REGISTER}\n${LOG_REPLY_CONTRACT}`;
  const bad: string[] = [];

  /* Her four elements. */
  if (!/acute stress, fear, despair/i.test(text)) bad.push("her definition of the band is missing");
  if (!/do not suggest a module/i.test(text)) bad.push("the module prohibition is missing");
  if (!/check in more often|write again sooner/i.test(text)) bad.push("the cadence prohibition is missing");
  if (!/next scheduled prompt|next scheduled cycle|let the next scheduled/i.test(text)) bad.push("\"wait for the next cycle\" is missing");
  if (!/silver lining/i.test(text)) bad.push("the silver-lining prohibition is missing");

  /* And the safetyHold wording intake already uses, so the two surfaces share a test. */
  if (!/scope, not intensity/i.test(text)) bad.push("the IG-S01 test is not restated");
  if (!/hopelessness, identity collapse, isolation/i.test(text)) bad.push("IG-S01's band is not described");

  /* Never a resource Wing invented. */
  if (/\b(?:\d{3}[- ]?\d{3,4}|hotline|helpline|crisis line|samaritans|988)\b/i.test(text)) {
    bad.push("the register names a specific service — Wing must not invent one");
  }

  check("register", bad.length === 0, bad.length === 0 ? "both bands defined, four prohibitions stated, no invented service" : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 6. THE PATH. The safety rules are compiled, and the cadence is actually withheld.
 *
 * This is the half that matters. `RESPONSE_SYSTEM` carried voice, register and a NEVER
 * list and no safety rules at all, while `compileSafety()` was compiled into intake and
 * into every Foundation turn. Nothing in the pure module above would have noticed.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe life log path compiles the safety rules and withholds the cadence");
{
  const path = join(process.cwd(), "server", "wing", "life-log-store.ts");
  const bad: string[] = [];

  if (!existsSync(path)) {
    check("path", false, "life-log-store.ts not found — this check proved nothing");
  } else {
    const src = readFileSync(path, "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    /*
     * Checked INSIDE the template literal, not anywhere in the file.
     *
     * The first version tested the whole source for the identifiers, and a mutation that
     * removed `${IG_MJ04_REGISTER}` from the prompt passed — because the import still
     * named it. Proving a name appears is not proving it is used, which is the same
     * weakness that let a computed-then-dropped value through on IG-UX01.
     */
    const start = code.indexOf("const RESPONSE_SYSTEM = ");
    const end = code.indexOf("`;", start);
    const prompt = start >= 0 && end > start ? code.slice(start, end) : "";

    if (!prompt) bad.push("could not find the RESPONSE_SYSTEM template");
    if (!/compileSafety\(\)/.test(prompt)) {
      bad.push("the reply system prompt does not compile the safety rules");
    }
    if (!/IG_MJ04_REGISTER/.test(prompt) || !/LOG_REPLY_CONTRACT/.test(prompt)) {
      bad.push("the distress register or the contract is not in the prompt");
    }
    /*
     * The cadence reset must sit behind the decision. An unguarded `resetDormancy` is the
     * escalation her rule forbids: a re-engaged student is one the sequences may chase, so
     * a hard week would answer itself with more contact from Wing.
     */
    const reset = code.indexOf("resetDormancy");
    const guard = code.indexOf("mayRaiseCadence");
    if (reset < 0) bad.push("resetDormancy is gone — the ordinary path lost its dormancy reset");
    else if (guard < 0 || guard > reset) bad.push("resetDormancy is not behind the IG-MJ04 decision");

    /*
     * The hold must be decided by `postEntryActions`, not by reading the flag at the call
     * site. Both call sites go through it, so the rule lives in one tested place — and a
     * `reportsCrisis` call here would be the redundant guard this file removed.
     */
    if (!/openHold\(/.test(code)) bad.push("nothing opens a safety hold on this surface");
    /* An exec loop, not matchAll: no `target` means ES5, and a RegExp iterator is TS2802. */
    const holdGuard = /if \(([^)]*)\)\s*\{[^}]*openHold\(/g;
    for (let m = holdGuard.exec(code); m; m = holdGuard.exec(code)) {
      if (m[1].indexOf("openHold") < 0 || m[1].indexOf("judged.safetyHold") >= 0) {
        bad.push(`a hold is opened on \`${m[1].trim()}\` rather than on the decision`);
      }
    }

    check(
      "path",
      bad.length === 0,
      bad.length === 0 ? "safety compiled, register present, cadence behind the guard, hold opened strictly" : bad.join("; "),
    );
  }
}

console.log(failed === 0 ? "\nall passed\n" : `\n${failed} failed\n`);
if (failed > 0) process.exit(1);
