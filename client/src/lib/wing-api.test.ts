/**
 * The student data layer — the turn mapping, and the stream reader.
 *
 * Behavioural, and it drives the real `streamTurn` against a real `ReadableStream`
 * rather than testing a description of it.
 *
 * ── THE TWO THINGS WORTH PINNING ─────────────────────────────────────────
 * 1. **Speaker comes from `turn_type`, never `provenance_tag`.** Every turn migrated
 *    from the Replit corpus is stamped `provenance_unknown` by design, so a mapping that
 *    keys on provenance renders Wing's own questions as the student's words — for every
 *    migrated student, in an interface whose whole claim is that it remembers what they
 *    said. It typechecks and it looks plausible on a fresh account.
 *
 * 2. **The stream's chunk boundaries.** SSE frames arrive split across network chunks
 *    whenever a reply is longer than a buffer, which is most of them. A reader that
 *    drops the partial tail loses text out of the middle of Wing's reply and reports
 *    nothing — the student just reads a sentence with a hole in it. Checks 4 and 5 feed
 *    the reader deliberately hostile splits.
 */
import {
  loadThreadMessages,
  localId,
  streamTurn,
  toneFor,
  turnToMsg,
  whenLabel,
  type StreamEvent,
  type Turn,
} from "./wing-api";

let failed = 0;
function check(label: string, ok: boolean, detail: string) {
  if (ok) console.log(`  ok — ${detail}`);
  else {
    failed++;
    console.log(`  FAIL — ${label}: ${detail}`);
  }
}

const turn = (over: Partial<Turn> = {}): Turn => ({
  id: 1,
  position: 1,
  turnType: "ai_prompt",
  provenanceTag: "provenance_unknown",
  content: "What surprised you this week?",
  signalDetected: false,
  createdAt: new Date().toISOString(),
  ...over,
});

console.log("\nthe student data layer — who said it, and did all of it arrive\n");

/* ─────────────────────────────────────────────────────────────────────────
 * 1. Speaker comes from turn_type. Provenance is not consulted.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("Speaker comes from turn_type, whatever the provenance tag says");
{
  const bad: string[] = [];

  const wing = turnToMsg(turn({ turnType: "ai_prompt" }));
  if (wing.role !== "wing") bad.push(`ai_prompt rendered as ${wing.role}`);

  const adapted = turnToMsg(turn({ turnType: "ai_adapted" }));
  if (adapted.role !== "wing") bad.push(`ai_adapted rendered as ${adapted.role}`);

  for (const t of ["human_elicited_response", "human_spontaneous", "human_correction"]) {
    const m = turnToMsg(turn({ turnType: t }));
    if (m.role !== "user") bad.push(`${t} rendered as ${m.role}`);
  }

  /*
   * The migrated corpus, which is the case that matters: every turn carries
   * `provenance_unknown`, and both speakers must still come out right.
   */
  const migratedWing = turnToMsg(turn({ turnType: "ai_prompt", provenanceTag: "provenance_unknown" }));
  const migratedUser = turnToMsg(turn({ turnType: "human_spontaneous", provenanceTag: "provenance_unknown" }));
  if (migratedWing.role !== "wing" || migratedUser.role !== "user") {
    bad.push("a migrated transcript does not separate the speakers");
  }

  /*
   * And provenance genuinely does not move the answer. Same turn type, every
   * provenance value: the role must not change.
   */
  const roles = new Set(
    ["provenance_unknown", "human_verified", "ai_generated", "mixed"].map(
      (p) => turnToMsg(turn({ turnType: "ai_prompt", provenanceTag: p })).role,
    ),
  );
  if (roles.size !== 1) bad.push("provenance changed the speaker — it must not be read at all");

  /* An unknown turn type falls to the student, which is the safe direction: it
     attributes Wing's words to nobody rather than the student's words to Wing. */
  const unknown = turnToMsg(turn({ turnType: "some_future_type" }));
  if (unknown.role !== "user") bad.push("an unknown turn type did not fall back to the student");

  check("speaker", bad.length === 0, bad.length === 0
    ? "6 turn types plus 4 provenance values, speaker unchanged by provenance"
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 2. A signalled turn becomes an insight card, and only Wing's can.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nA signalled Wing turn is an insight; a signalled student turn is not");
{
  const bad: string[] = [];

  const insight = turnToMsg(turn({ turnType: "ai_prompt", signalDetected: true }));
  if (insight.role !== "insight") bad.push(`a signalled Wing turn rendered as ${insight.role}`);

  /*
   * The student's own turns carry signalDetected too — it marks where the signal was
   * found, not who spoke. Rendering one as "Wing noticed something" would put the
   * student's words in Wing's mouth on a card that says Wing wrote it.
   */
  const theirs = turnToMsg(turn({ turnType: "human_spontaneous", signalDetected: true }));
  if (theirs.role !== "user") bad.push(`a signalled student turn rendered as ${theirs.role}`);

  check("insight", bad.length === 0, bad.length === 0
    ? "the card is reachable only from Wing's own turns"
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 3. Tone is assigned, and every Wing message has one.
 *
 * The heuristic itself is provisional — see the note on `toneFor`. What is pinned is
 * that the field is always populated, because the bubble reads it.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nEvery Wing message carries a tone");
{
  const bad: string[] = [];

  for (const text of [
    "What surprised you this week?",
    "Let's start with the part you keep coming back to.",
    "That's the second time you've described adoption as the real work.",
    "",
  ]) {
    const m = turnToMsg(turn({ content: text }));
    if (m.role === "wing" && m.tone !== "observing" && m.tone !== "proposing") {
      bad.push(`"${text.slice(0, 24)}" produced tone ${String((m as { tone?: string }).tone)}`);
    }
  }

  if (toneFor("What surprised you?") !== "proposing") bad.push("a question is not proposing");
  if (toneFor("I noticed something in how you said that.") !== "observing") {
    bad.push("a statement is not observing");
  }

  check("tone", bad.length === 0, bad.length === 0
    ? "questions and imperatives propose, statements observe, and the field is never empty"
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 4. THE ONE THAT MATTERS: the stream reader keeps partial frames.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe stream reader loses nothing to a chunk boundary");
{
  const frames = [
    { type: "chunk", content: "The thread under " },
    { type: "chunk", content: "everything you've built " },
    { type: "chunk", content: "is adoption, not architecture." },
    { type: "session_completed", artifactType: "functional_identity", content: { x: 1 }, transition: "Next: your credibility." },
    { type: "done" },
  ];
  const wire = frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join("");

  /** Feeds `wire` through a ReadableStream cut at the given byte offsets. */
  async function collect(cuts: number[]): Promise<StreamEvent[]> {
    const pieces: string[] = [];
    let last = 0;
    for (const c of cuts) {
      pieces.push(wire.slice(last, c));
      last = c;
    }
    pieces.push(wire.slice(last));

    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        for (const p of pieces) if (p) controller.enqueue(encoder.encode(p));
        controller.close();
      },
    });

    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(body, { status: 200 })) as typeof globalThis.fetch;

    const got: StreamEvent[] = [];
    try {
      await streamTurn(1, "hello", (e) => got.push(e));
    } finally {
      globalThis.fetch = original;
    }
    return got;
  }

  const bad: string[] = [];

  /* Whole, as a baseline — so a later failure is about splitting and not about parsing. */
  const whole = await collect([]);
  if (whole.length !== frames.length) {
    bad.push(`unsplit stream produced ${whole.length} events, expected ${frames.length}`);
  }

  /*
   * Then split at every single byte offset. One of these lands between the two newlines
   * that terminate a frame, which is the exact case a reader that discards its buffer
   * remainder gets wrong.
   */
  let worstMissing = 0;
  for (let i = 1; i < wire.length; i++) {
    const got = await collect([i]);
    if (got.length !== frames.length) {
      worstMissing = Math.max(worstMissing, frames.length - got.length);
      if (bad.length < 3) {
        bad.push(`split at byte ${i} produced ${got.length} of ${frames.length} events`);
      }
    }
  }
  if (worstMissing) bad.push(`worst case lost ${worstMissing} event(s)`);

  /* And the text arrives whole, in order. */
  const text = whole
    .filter((e): e is Extract<StreamEvent, { type: "chunk" }> => e.type === "chunk")
    .map((e) => e.content)
    .join("");
  if (text !== "The thread under everything you've built is adoption, not architecture.") {
    bad.push(`reassembled text was "${text}"`);
  }

  check("stream", bad.length === 0, bad.length === 0
    ? `${wire.length - 1} single-byte split points, every frame delivered intact`
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 5. A malformed frame is dropped, and the rest of the reply still arrives.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nOne bad frame does not take the reply with it");
{
  const wire =
    `data: ${JSON.stringify({ type: "chunk", content: "before " })}\n\n` +
    `data: {not json at all\n\n` +
    `data: ${JSON.stringify({ type: "chunk", content: "after" })}\n\n` +
    `data: ${JSON.stringify({ type: "done" })}\n\n`;

  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(new Blob([wire]).stream(), { status: 200 })) as typeof globalThis.fetch;

  const got: StreamEvent[] = [];
  try {
    await streamTurn(1, "hello", (e) => got.push(e));
  } finally {
    globalThis.fetch = original;
  }

  const text = got
    .filter((e): e is Extract<StreamEvent, { type: "chunk" }> => e.type === "chunk")
    .map((e) => e.content)
    .join("");

  const bad: string[] = [];
  if (text !== "before after") bad.push(`text after the bad frame was "${text}"`);
  if (!got.some((e) => e.type === "done")) bad.push("the done event never arrived");

  check("resilience", bad.length === 0, bad.length === 0
    ? "the unparseable frame is skipped and everything after it still arrives"
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 6. A failed request reports an error rather than resolving silently.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nA refused stream says so");
{
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("nope", { status: 500 })) as typeof globalThis.fetch;

  const got: StreamEvent[] = [];
  try {
    await streamTurn(1, "hello", (e) => got.push(e));
  } finally {
    globalThis.fetch = original;
  }

  check("failure", got.length === 1 && got[0]!.type === "error",
    got.length === 1 && got[0]!.type === "error"
      ? "a 500 produces one error event, not a silent resolve"
      : `produced ${JSON.stringify(got)}`);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 7. Timestamps become labels, and ids do not collide.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nDisplay strings are derived, not stored");
{
  const bad: string[] = [];
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

  const cases: [string, string][] = [
    [ago(30_000), "Just now"],
    [ago(20 * 60_000), "20 minutes ago"],
    [ago(3 * 3_600_000), "3 hours ago"],
    [ago(26 * 3_600_000), "Yesterday"],
    [ago(4 * 86_400_000), "4 days ago"],
    [ago(9 * 86_400_000), "Last week"],
  ];
  for (const [iso, want] of cases) {
    const got = whenLabel(iso);
    if (got !== want) bad.push(`${want} → "${got}"`);
  }

  /* An absent or unparseable timestamp yields "", never "Invalid Date". */
  if (whenLabel("") !== "") bad.push(`empty timestamp → "${whenLabel("")}"`);
  if (whenLabel("not a date") !== "") bad.push(`garbage timestamp → "${whenLabel("not a date")}"`);

  /*
   * Local ids are unique within a tick. The prototype's generator was a module-level
   * counter that reset to 0 on every reload, so two messages in one thread could share
   * an id and React would reuse the wrong DOM node.
   */
  const ids = new Set(Array.from({ length: 500 }, () => localId()));
  if (ids.size !== 500) bad.push(`localId collided: ${500 - ids.size} duplicates in 500`);

  check("display", bad.length === 0, bad.length === 0
    ? `${cases.length} relative labels, invalid input yields "", 500 unique local ids`
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 8. A module with no session type loads no messages rather than guessing one.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nA module with no session behind it fetches nothing");
{
  let called = false;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    called = true;
    return new Response("{}", { status: 200 });
  }) as typeof globalThis.fetch;

  let msgs: unknown[] = [];
  try {
    msgs = await loadThreadMessages({
      id: "interview_prep",
      title: "Interview Prep",
      when: "",
      module: {
        slug: "interview_prep",
        name: "Interview Prep",
        desc: "",
        group: "Develop and grow",
        status: "not_built",
        sessionType: null,
        methodology: "Module 10",
        inPicker: true,
      },
      session: null,
      messages: [],
    });
  } finally {
    globalThis.fetch = original;
  }

  check("no session", !called && msgs.length === 0,
    !called && msgs.length === 0
      ? "no request issued, no messages invented"
      : `called=${called}, ${msgs.length} messages`);
}

console.log(failed === 0 ? "\nall passed\n" : `\n${failed} failed\n`);
if (failed > 0) process.exit(1);
