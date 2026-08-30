/**
 * IG-UX05 — the three-part transition.
 *
 * Run:  npx tsx server/wing/transitions.test.ts
 *
 * ── WHAT IS WORTH TESTING HERE ───────────────────────────────────────────
 * Her failure path is unusually specific about the cost of each missing part: "the user
 * feels either unacknowledged (no accomplishment), lost (no connection), or uncertain (no
 * time estimate). All three reduce continuation rate."
 *
 * So each element gets its own assertion, and the ORDER gets one too — "these three
 * elements, in this order, produce the satisfaction-clarity-motivation sequence" makes the
 * sequence part of the rule rather than a formatting preference.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  FOUNDATION_TRANSITIONS,
  renderTransition,
  transitionParts,
  type TransitionTrack,
} from "@shared/transitions";

let failures = 0;
const fail = (msg: string) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
const ok = (msg: string) => console.log(`  ok — ${msg}`);

console.log("\ntransitions — IG-UX05\n");

console.log("Every Foundation transition has all three elements");
{
  const before = failures;
  const outcomes: Record<1 | 2 | 3, string> = {
    1: "Marketing",
    2: "Tier 2",
    3: "the operator who makes launches land",
  };
  for (const n of [1, 2, 3] as const) {
    const text = renderTransition(FOUNDATION_TRANSITIONS[n], outcomes[n]);
    const p = transitionParts(text);
    if (!p.hasAccomplishment) fail(`Session ${n}: no specific accomplishment — "${text}"`);
    if (!p.hasConnection) fail(`Session ${n}: no connection to the macro goal`);
    if (!p.hasTimeEstimate && !p.timeEstimateNotApplicable) {
      fail(`Session ${n}: no time estimate, and it is not the final transition`);
    }
  }
  /*
   * Session 3 is the one legitimate absence — there is no fourth session, so a time
   * estimate would have to be invented. Pinned so "all three always" does not quietly
   * become "all three except where someone forgot".
   */
  if (FOUNDATION_TRANSITIONS[3].nextStep !== null) {
    fail("Session 3 has no next step; a time estimate there would be invented");
  }
  for (const n of [1, 2] as const) {
    if (FOUNDATION_TRANSITIONS[n].nextStep === null) {
      fail(`Session ${n} has a next step and must estimate it`);
    }
  }
  if (failures === before) ok("three of three, with the final transition's absence deliberate");
}

console.log("\nThe acknowledgment names the output, not the effort");
{
  const before = failures;
  /*
   * Her card rules this out by name: "specific and concrete, not 'great session.' Name
   * the output: 'Your primary function is Marketing.'"
   */
  const named = renderTransition(FOUNDATION_TRANSITIONS[1], "Marketing");
  if (named.indexOf("Marketing") < 0) fail("the function the student resolved to must appear");
  if (!transitionParts("Great session! Keep going.").hasAccomplishment === false) {
    fail("praise-only must not count as an acknowledgment");
  }
  if (transitionParts("Great session. That's the anchor. About 8 minutes.").hasAccomplishment) {
    fail("'Great session' is the exact phrase her card excludes");
  }

  /*
   * And the fallback when the value is genuinely unknown — a session that ended without
   * producing one. It must still be an accomplishment sentence rather than praise, because
   * the alternative is Wing congratulating someone on nothing.
   */
  const noValue = renderTransition(FOUNDATION_TRANSITIONS[1], null);
  if (!transitionParts(noValue).hasAccomplishment) {
    fail("with no value known it must still name what was produced, not praise the effort");
  }
  if (noValue.indexOf("null") >= 0 || noValue.indexOf("undefined") >= 0) {
    fail("a missing value must never render as a literal");
  }
  if (failures === before) ok("the value appears; praise alone does not qualify");
}

console.log("\nThe order is the mechanism");
{
  const before = failures;
  const text = renderTransition(FOUNDATION_TRANSITIONS[1], "Marketing");
  const ack = text.indexOf("Marketing");
  const conn = text.indexOf("anchor");
  const time = text.indexOf("minutes");
  if (!(ack < conn && conn < time)) {
    fail(`accomplishment → connection → time estimate, got positions ${ack}/${conn}/${time}`);
  }
  /*
   * Why it matters, and why this is not a style assertion: time first reads as a schedule,
   * connection first reads as a lecture. Her sequence is satisfaction, then clarity, then
   * motivation, and it only works in that order.
   */
  if (failures === before) ok("satisfaction, clarity, motivation — in that order");
}

console.log("\nHer two audience adaptations change the register, not the content");
{
  const before = failures;
  const tracks: TransitionTrack[] = ["undergraduate", "executive", "default"];
  for (const track of tracks) {
    const text = renderTransition(FOUNDATION_TRANSITIONS[1], "Marketing", track);
    const p = transitionParts(text);
    if (!p.hasAccomplishment || !p.hasConnection || !p.hasTimeEstimate) {
      fail(`${track} lost an element — an adaptation must not drop one`);
    }
    if (text.indexOf("Marketing") < 0) fail(`${track} lost the named output`);
  }

  // "Slightly warmer acknowledgment" for undergraduates; "minimal" for executives.
  const under = renderTransition(FOUNDATION_TRANSITIONS[1], "Marketing", "undergraduate");
  const exec = renderTransition(FOUNDATION_TRANSITIONS[1], "Marketing", "executive");
  if (under.length <= exec.length) fail("the undergraduate register should be the warmer one");
  if (exec !== renderTransition(FOUNDATION_TRANSITIONS[1], "Marketing", "default")) {
    fail("executive is the minimal form, which is the neutral one plus nothing");
  }
  if (failures === before) ok("all three registers keep all three elements");
}

console.log("\nEach part closes itself, so nothing runs together");
{
  const before = failures;
  /*
   * Every accomplishment interpolates a value the student produced, and those values carry
   * no punctuation of their own. Session 3 rendered "…makes launches land That's the
   * foundation built" — two sentences joined at the exact moment the message tells someone
   * they finished.
   *
   * Checked on the PARTS, not by parsing the prose. A regex over the rendered string
   * cannot tell a run-on from a capitalised value mid-sentence: "Your primary function is
   * Marketing" matches lower-case-then-capital and is perfectly correct. The parts are
   * where the property actually lives — `renderTransition` joins them with a space, so
   * each one has to end closed.
   */
  const values: Record<1 | 2 | 3, string> = {
    1: "Marketing",
    2: "Tier 2",
    3: "the operator who makes launches land",
  };
  for (const n of [1, 2, 3] as const) {
    const t = FOUNDATION_TRANSITIONS[n];
    for (const [what, text] of [
      ["accomplishment", t.accomplishment(values[n])],
      ["accomplishment (no value)", t.accomplishment(null)],
      ["connection", t.connection],
    ] as const) {
      if (!/[.!?]$/.test(text.trim())) {
        fail(`Session ${n} ${what} does not close its sentence: "${text}"`);
      }
    }
  }

  // A value that already ends in punctuation must not gain a second one.
  if (FOUNDATION_TRANSITIONS[3].accomplishment("we ship on time.").indexOf("..") >= 0) {
    fail("a value ending in a full stop must not get another");
  }
  // And the rendered whole never contains a doubled stop either.
  for (const n of [1, 2, 3] as const) {
    if (renderTransition(FOUNDATION_TRANSITIONS[n], values[n]).indexOf("..") >= 0) {
      fail(`Session ${n} renders a doubled full stop`);
    }
  }
  if (failures === before) ok("every part ends closed; values are punctuated exactly once");
}

/* ─────────────────────────────────────────────────────────────────────────
 * And something sends it.
 *
 * Everything above was true and green while this module had no importer at all.
 * A2 asks for "contextual micro-copy at every transition", the transitions were
 * written, and the `session_completed` event carried the artifact and nothing else —
 * so the student reached the end of a session and was told nothing about what came
 * next, by code that tested clean.
 *
 * The render is server-side deliberately: it quotes the session's own outcome, so a
 * client assembling it would need the artifact's field names, and the copy would then
 * depend on two files agreeing about a JSON shape.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe server renders it into the completion event");
{
  const before = failures;
  const rel = "server/foundation-sessions-routes.ts";
  const path = join(process.cwd(), rel);

  if (!existsSync(path)) {
    fail(`${rel} not found — this block proved nothing`);
  } else {
    const code = readFileSync(path, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    if (!/renderTransition\(/.test(code)) {
      fail("nothing calls renderTransition — the transitions are unreachable again");
    }

    /*
     * Narrowed to the event payload. An import that never reaches the client is an
     * identifier appearing in a file, which is what this block exists to tell apart
     * from a delivered feature.
     */
    const at = code.indexOf('type: "session_completed"');
    if (at < 0) fail("the session_completed event is gone");
    else {
      const payload = code.slice(at, code.indexOf("}", code.indexOf("})", at)));
      if (!/transition:/.test(payload)) {
        fail("session_completed carries no transition — the student is told nothing about what is next");
      }
    }

    /*
     * Session 3's outcome is null on purpose, and this is a whitelist rather than a
     * test for the shape of the branch that makes it so.
     *
     * Its artifact holds a signature story, a methodology and content angles, and no
     * positioning claim — so feeding it `signatureStory.title` would render "Your
     * positioning claim: <a story title>" at the moment the student finishes. The
     * fields the acknowledgment may read are named here; anything else, in any
     * session, is a new claim about what an artifact contains.
     */
    const fn = code.slice(code.indexOf("function transitionFor("));
    const body = fn.slice(0, fn.indexOf("\nfunction "));
    /*
     * An exec loop rather than `matchAll`: the tsconfig sets no `target`, so it
     * defaults to ES5 and the iterator comes back untyped. The same reason
     * `population-tags.ts` uses `Array.from` instead of a spread.
     */
    const fields = new Set<string>();
    const FIELD = /completionData\??\.(\w+)/g;
    for (let m = FIELD.exec(body); m !== null; m = FIELD.exec(body)) fields.add(m[1]);
    const allowed = new Set(["primaryFunction", "credibilityTier"]);
    for (const f of Array.from(fields)) {
      if (!allowed.has(f)) {
        fail(
          `the transition reads completionData.${f} — only primaryFunction (S1) and ` +
            `credibilityTier (S2) are outcomes an artifact actually carries`,
        );
      }
    }
    /*
     * And both are read. A whitelist alone permits the empty set, which renders every
     * session on its fallback — "Your primary function is mapped." for a student whose
     * primary function Wing has just written down. The acknowledgment has to name the
     * output, and the outputs are these two.
     */
    for (const f of Array.from(allowed)) {
      if (!fields.has(f)) {
        fail(`the transition no longer reads completionData.${f} — that session falls back to a generic line`);
      }
    }
  }

  if (failures === before) {
    ok("renderTransition reaches the session_completed payload, and session 3 stays on its fallback");
  }
}

console.log(failures ? `\n${failures} failure(s)\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);
