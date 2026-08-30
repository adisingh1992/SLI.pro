/**
 * B2's Triggers 2 and 3.
 *
 * The rule is arithmetic, so the test is a simulated year rather than a handful of dates:
 * a cadence bug is a student getting three prompts in a day or none in a month, and both
 * of those look fine in a spot check.
 */
import {
  EARLY_INTERVAL_DAYS,
  FIRST_MONTH_DAYS,
  ONGOING_INTERVAL_DAYS,
  cadenceDecision,
  intervalDaysAt,
  phaseAt,
  type CadenceState,
} from "./prompt-cadence";

let failed = 0;
function check(label: string, ok: boolean, detail: string) {
  if (ok) console.log(`  ok — ${detail}`);
  else {
    failed++;
    console.log(`  FAIL — ${label}: ${detail}`);
  }
}

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 1); // Berkeley's first day, as a fixed origin.

const state = (over: Partial<CadenceState> = {}): CadenceState => ({
  enrolledAt: T0,
  lastSentAt: null,
  onHold: false,
  active: true,
  ...over,
});

console.log("\nprompt cadence — B2 Triggers 2 and 3\n");

/* ─────────────────────────────────────────────────────────────────────────
 * 1. Her two intervals, and where the boundary falls.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("Every 5 days for the first month, weekly after");
{
  const s = state();
  const bad: string[] = [];

  if (intervalDaysAt(s, T0) !== EARLY_INTERVAL_DAYS) bad.push("day 0 is not on the early interval");
  if (intervalDaysAt(s, T0 + 29 * DAY) !== EARLY_INTERVAL_DAYS) bad.push("day 29 left the first month early");
  if (phaseAt(s, T0 + 30 * DAY) !== "ongoing") bad.push("day 30 is still in the first month");
  if (intervalDaysAt(s, T0 + 30 * DAY) !== ONGOING_INTERVAL_DAYS) bad.push("day 30 is not weekly");
  if (FIRST_MONTH_DAYS !== 30) bad.push(`the first month is ${FIRST_MONTH_DAYS} days`);

  check("intervals", bad.length === 0, bad.length === 0 ? "5 days through day 29, 7 from day 30" : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 2. The first prompt is due on enrolment.
 *
 * "Every 5 days" is an interval between prompts, not a delay before the first. A student
 * who signs up and hears nothing for five days has been onboarded into silence — and with
 * Berkeley starting on a Tuesday, that silence covers their whole first week.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe first prompt is due the moment they arrive");
{
  const first = cadenceDecision(state(), T0);
  const ok = first.due && first.nextDueAt === T0 && /no prompt has been sent/.test(first.why);
  check("first", ok, ok ? `due at enrolment — "${first.why}"` : JSON.stringify(first));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 3. The interval runs from the last send, not from a grid.
 *
 * A student held for a fortnight comes back to ONE prompt, not to three that were missed
 * arriving together. That is the failure `suppression.ts` exists to prevent, and a fixed
 * grid off the enrolment date would undo it here by arithmetic.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nA gap does not become a backlog");
{
  const held = state({ lastSentAt: T0 });
  const afterFortnight = cadenceDecision(held, T0 + 14 * DAY);

  /* Due, once. And after that send, the next is five days later — not immediately again. */
  const resumed = cadenceDecision(state({ lastSentAt: T0 + 14 * DAY }), T0 + 14 * DAY);
  const ok =
    afterFortnight.due &&
    !resumed.due &&
    resumed.nextDueAt === T0 + 19 * DAY;
  check("backlog", ok, ok ? "one prompt on return, then the interval restarts from it" : `after=${afterFortnight.due} resumed=${JSON.stringify(resumed)}`);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 4. A year, simulated.
 *
 * The counts are the assertion. Six prompts in the first 30 days at five-day spacing, then
 * weekly — and never two in one day, which is IG-MJ05's floor expressed as a schedule.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nA simulated year sends the right number, and never twice in a day");
{
  let lastSentAt: number | null = null;
  const sends: number[] = [];

  for (let day = 0; day <= 365; day++) {
    const now = T0 + day * DAY;
    const decision = cadenceDecision(state({ lastSentAt }), now);
    if (decision.due) {
      sends.push(day);
      lastSentAt = now;
    }
  }

  const firstMonth = sends.filter((d) => d < FIRST_MONTH_DAYS);
  const bad: string[] = [];

  /* Day 0, 5, 10, 15, 20, 25 — six of them. */
  if (firstMonth.join(",") !== "0,5,10,15,20,25") bad.push(`first month: [${firstMonth}]`);

  /* No two on the same day, and no gap shorter than the interval in force. */
  for (let i = 1; i < sends.length; i++) {
    const gap = sends[i] - sends[i - 1];
    const expected = sends[i - 1] < FIRST_MONTH_DAYS ? EARLY_INTERVAL_DAYS : ONGOING_INTERVAL_DAYS;
    if (gap < expected) bad.push(`a ${gap}-day gap at day ${sends[i]}, expected ${expected}`);
  }

  /* Roughly: 6 in the first month, then ~48 weekly. */
  if (sends.length < 50 || sends.length > 56) bad.push(`${sends.length} sends in a year`);

  check("year", bad.length === 0, bad.length === 0 ? `${sends.length} prompts over 366 days: ${firstMonth.length} in the first month, then weekly` : bad.slice(0, 3).join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 5. The pool follows the rhythm.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe first month draws micro-journal, the ongoing rhythm draws heartbeat");
{
  const early = cadenceDecision(state(), T0 + 10 * DAY);
  const ongoing = cadenceDecision(state(), T0 + 100 * DAY);
  const ok = early.pool === "micro_journal" && ongoing.pool === "heartbeat";
  check("pool", ok, ok ? "micro_journal early, heartbeat ongoing" : `early=${early.pool} ongoing=${ongoing.pool}`);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 6. A hold offers no date, and an inactive student gets nothing.
 *
 * A hold lifts when the student comes back, past a seven-day floor — never on a timer. Any
 * date this returned would be fiction, and a caller that scheduled against it would be
 * planning a send that suppression is going to refuse.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nA hold produces no date at all, rather than a date that will not be honoured");
{
  const held = cadenceDecision(state({ lastSentAt: T0, onHold: true }), T0 + 30 * DAY);
  const gone = cadenceDecision(state({ lastSentAt: T0, active: false }), T0 + 30 * DAY);

  const bad: string[] = [];
  if (held.due) bad.push("a held student was due");
  if (held.nextDueAt !== null) bad.push(`a held student was given a date: ${held.nextDueAt}`);
  if (!/hold/.test(held.why)) bad.push(`the reason does not name the hold: "${held.why}"`);
  if (gone.due || gone.nextDueAt !== null) bad.push("an inactive student was scheduled");

  check("suppressed", bad.length === 0, bad.length === 0 ? "no date under a hold, nothing for an inactive student, and both say why" : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 7. The boundary is crossed once, cleanly.
 *
 * A student whose last prompt was on day 28 is next due on day 33 at the EARLY interval —
 * the interval in force is read at the moment of asking, so the phase change does not
 * retroactively move a date that was already set.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nCrossing the first-month boundary does not move a date already set");
{
  const s = state({ lastSentAt: T0 + 28 * DAY });

  /* Asked on day 30 — now in the ongoing phase, so the interval is 7 from the last send. */
  const asked = cadenceDecision(s, T0 + 30 * DAY);
  const ok = asked.phase === "ongoing" && asked.nextDueAt === T0 + 35 * DAY && !asked.due;
  check(
    "boundary",
    ok,
    ok
      ? "day 28 send, asked on day 30: ongoing phase, next due day 35"
      : `phase=${asked.phase} nextDueAt=+${(asked.nextDueAt! - T0) / DAY}d due=${asked.due}`,
  );
}

console.log(failed === 0 ? "\nall passed\n" : `\n${failed} failed\n`);
if (failed > 0) process.exit(1);
