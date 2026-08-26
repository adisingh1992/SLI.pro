/**
 * The IG-UX03 scanner, tested in both directions.
 *
 * Run:  npx tsx server/wing/check-ux.test.ts
 *
 * ── WHY BOTH DIRECTIONS MATTER EQUALLY ───────────────────────────────────
 * A checker that misses violations is useless. A checker that reports noise is worse than
 * useless, because it gets ignored and then the real findings are ignored with it — and
 * this one started out reporting two Tailwind column widths as "percentage progress".
 *
 * So every rule has a case that must fire and a near-miss that must not. The near-misses
 * are the ones taken from real lines in this codebase: `completedAt`, `session_completed`,
 * `w-[72%]`.
 */
import { looksLikeClassList, scanFile } from "./check-ux";

let failures = 0;
const fail = (msg: string) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
const ok = (msg: string) => console.log(`  ok — ${msg}`);
const scan = (src: string, path = "client/src/x.tsx") => scanFile(path, src);

console.log("\ncheck-ux — IG-UX03\n");

console.log("Her vocabulary is caught");
{
  const before = failures;
  const cases: Array<[string, string]> = [
    ["completion language", `<p>Session Completed!</p>`],
    ["X-of-Y counter", `<span>3/11 modules built</span>`],
    ["percentage", `<p>You are 60% through Foundation</p>`],
    ["checkmark glyph", `<p>Foundation 1 ✓</p>`],
    /*
     * The icon, which the first version of this rule missed. `<CheckCircle />` renders a
     * tick and reads as "done" exactly as ✓ does, and it was sitting beside the only
     * sentence on the page that said "this one's done" — the card's visual and verbal
     * signals together, and the scan saw one of them.
     */
    ["checkmark icon", `<CheckCircle className="h-4 w-4" />`],
    ["progress bar", `<Progress value={50} />`],
  ];
  for (const [what, src] of cases) {
    if (!scan(src).length) fail(`${what} was not caught: ${src}`);
  }
  if (failures === before) ok(`${cases.length} shapes from her card, all caught`);
}

console.log("\nThe things that would make it noise are not");
{
  const before = failures;
  const quiet: Array<[string, string]> = [
    // Identifiers and column names. A student never reads these.
    ["a column name", `const completedAt = row.completedAt;`],
    ["an event type", `if (event.type === "session_completed") {`],
    ["a status check", `if (session.status === 'completed' && !allowContinue) {`],
    // Real lines from foundation-session-chat.tsx that are layout, not progress.
    ["a Tailwind width", `<div className="w-full min-w-0 lg:w-[72%]">`],
    ["a Tailwind sidebar", `<aside className="hidden w-[28%] min-w-[17rem] shrink-0 lg:block">`],
    // Comments, including this file's own quotations of her card.
    ["a comment", `  // the session is complete here`],
    ["a block comment", ` * Detect: completion/task-list language or visual indicators.`],
  ];
  for (const [what, src] of quiet) {
    const f = scan(src);
    if (f.length) fail(`${what} was reported: ${src} → ${f[0].what}`);
  }
  if (failures === before) ok(`${quiet.length} near-misses, none reported`);
}

console.log("\nThe admin surfaces are exempt, because her failure path says so");
{
  const before = failures;
  /*
   * "If institutional partners require completion tracking for their reporting → keep it
   * in the institutional admin dashboard (career center view), not in the user-facing
   * experience. The user sees 'built.' The career center sees 'completed.'"
   *
   * So a counter on the admin dashboard is the RESOLUTION of this gate, not a breach of
   * it. Flagging it would push someone to break her rule in order to satisfy the checker.
   */
  const src = `<p>3/11 completed</p>`;
  if (scan(src, "client/src/pages/admin/cohort.tsx").length) {
    fail("an admin surface must be exempt — that is where completion tracking belongs");
  }
  if (!scan(src, "client/src/pages/home-page.tsx").length) {
    fail("the same text on a student surface must still be reported");
  }
  if (failures === before) ok("exempt for the career centre, reported for the student");
}

console.log("\nThe class-list detector separates markup from prose");
{
  const before = failures;
  for (const c of [
    "flex items-start gap-2 text-[14px] text-ink-soft",
    "w-full min-w-0 lg:w-[72%]",
    "mt-0.5 h-4 w-4 shrink-0 text-good",
  ]) {
    if (!looksLikeClassList(c)) fail(`not recognised as markup: ${c}`);
  }
  for (const p of [
    "Everything from this session is saved",
    "Here's what you built",
    "You are 60% through Foundation",
  ]) {
    if (looksLikeClassList(p)) fail(`prose treated as markup: ${p}`);
  }
  if (failures === before) ok("class lists skipped, sentences kept");
}

console.log("\nThe three false-positive classes the first real run produced");
{
  const before = failures;
  /*
   * ── WHY THESE ARE PINNED ───────────────────────────────────────────────
   * The first run against the whole client returned 169 findings, and about a fifth were
   * noise of three specific kinds. Each is here because a checker that reports noise gets
   * ignored, and then the real findings are ignored with it.
   */

  // 1. Twenty findings on one page, every one a teal swatch.
  for (const css of [
    `style={{ background: "hsl(167, 40%, 35%)" }}`,
    `const c = "hsla(167, 40%, 90%, 0.5)";`,
    `border: "1px solid rgba(0, 0, 0, 50%)"`,
  ]) {
    const f = scan(css);
    if (f.length) fail(`a CSS colour was read as progress: ${css} → ${f[0].what}`);
  }
  // But a real percentage in prose still reports.
  if (!scan(`<p>You are 60% through Foundation</p>`).length) {
    fail("a percentage a student reads is still a progress indicator");
  }

  // 2. Four findings on the carousel primitive; centring maths, not counters.
  for (const cls of [
    `<div className="-left-12 top-1/2 -translate-y-1/2" />`,
    `<div className="-bottom-12 left-1/2 -translate-x-1/2 rotate-90" />`,
    `<div className="w-1/3 h-1/2" />`,
  ]) {
    const f = scan(cls);
    if (f.length) fail(`a fractional utility was read as an X-of-Y counter: ${cls}`);
  }
  // A real counter still reports — and this one is her own example.
  if (!scan(`<span>3/11 modules</span>`).length) fail("3/11 is exactly her example");

  // 3. The unstyled primitives: a tick in a checkbox means "selected", not "done".
  for (const path of [
    "client/src/components/ui/checkbox.tsx",
    "client/src/components/ui/select.tsx",
    "client/src/components/ui/dropdown-menu.tsx",
  ]) {
    if (scan(`<Check className="h-4 w-4" />`, path).length) {
      fail(`${path} is a primitive — a tick there is a selection affordance`);
    }
  }
  /*
   * And the half that keeps the exemption honest: exempting the DEFINITIONS must not
   * exempt their USE. A progress bar on a report page is what the gate is about.
   */
  if (!scan(`<Progress value={freshnessScore} className="h-2" />`, "client/src/pages/report.tsx").length) {
    fail("a Progress bar on a student-facing page must still be reported");
  }

  if (failures === before) ok("colours, fractional utilities and primitives quiet; the real shapes still fire");
}

console.log(failures ? `\n${failures} failure(s)\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);
