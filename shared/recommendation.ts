/**
 * IG-UX02 — one recommendation, not a menu.
 *
 * Pure. Imports only the session-duration table from `transitions`.
 *
 * ── HER GATE, QUOTED ─────────────────────────────────────────────────────
 * "Wing recommends ONE action at a time. Not 'here are your options.' One action with one
 * reason tied to the user's current state. 'Recommended: Write Something. Why: Your last
 * post was three weeks ago and you had a strong Radar reaction this week about [topic].
 * ~15 minutes.' The user can always browse the module library for other options. But the
 * dashboard recommendation is Wing's opinion — one thing, clearly stated. Menus create
 * decision paralysis. Recommendations create momentum."
 *
 * Success: "Dashboard always shows exactly one recommended next action. The recommendation
 * changes based on Wing's accumulated context. The same recommendation never appears twice
 * in a row."
 *
 * Failure path: "If Wing can't determine a strong recommendation → default to the next
 * module in the natural sequence… Never display 'no recommendation.'"
 *
 * ── WHERE THE MENU ACTUALLY IS ───────────────────────────────────────────
 * `new-dashboard.tsx` is phase-gated: during intake, documents and the Foundation
 * Sessions it already shows one thing at a time. It becomes a menu in the LAST phase —
 * six tool cards side by side, which is where a student who has just finished Foundation
 * 3 arrives with nothing telling them which one matters. So this gate's real work is
 * there, and the cards stay, because she says they should: "the user can always browse
 * the module library for other options."
 *
 * ── THE ORDER IS THE APP'S, NOT AN OPINION ───────────────────────────────
 * "Default to the next module in the natural sequence" means the sequence the product
 * actually enforces, not a plausible-looking one. Read off `getCurrentPhase` and the
 * sidebar `locked` conditions:
 *
 *   intake → BOTH documents → session 1 → 2 → 3 → tools
 *   and inside tools: the SLI needs options a coach generated; LinkedIn and Strategic
 *   Content need the SLI chosen AND a Brand Intelligence Report to exist.
 *
 * A first draft of this file ordered documents AFTER the Foundation sessions. It would
 * have recommended "Build Foundation 1" to a student whose sessions are locked behind an
 * unuploaded resume — a recommendation pointing at a disabled button, which is worse than
 * no recommendation because it reads as a broken product rather than a missing step.
 *
 * The fix is NOT the ordering. Reordering the table back was tried as a mutation and
 * changed nothing, because each rule's own `eligible` carries the gate — which is where it
 * has to be, since ordering only protects a state that some earlier rule happens to claim.
 * So every `eligible` below is the negation of a real lock in the client, and the test
 * checks that independently: it restates the sidebar's `locked` expressions and asserts
 * that no recommendation ever points at a screen those expressions close. Four rules were
 * missing a gate when that test was first run.
 *
 * ── WHY THE COACHING CALL IS LAST AND NOT FIRST ──────────────────────────
 * It is the only tool with no prerequisite beyond finishing Foundation, so it is what
 * keeps "never display 'no recommendation'" true for the genuinely reachable state where
 * a student has finished everything they can and the coach has not generated their SLI
 * options yet. Last rather than first because sending someone to a 30-minute call before
 * their Brand Intelligence Report exists wastes the call.
 *
 * ── ONE CONFLICT IN HER OWN CARD, FLAGGED NOT RESOLVED ───────────────────
 * "The same recommendation never appears twice in a row" and "default to the next module
 * in the natural sequence" cannot both hold on a linear path. If a student has not started
 * Foundation 1, the honest recommendation tomorrow is still Foundation 1 — and rotating to
 * something else to satisfy no-repeat would send them away from the one thing they should
 * do.
 *
 * Read as written, no-repeat does real harm during onboarding. Read in context, it is
 * about the post-Foundation state her example describes, where several actions are
 * genuinely eligible and always naming the same one makes Wing look stuck.
 *
 * So no-repeat applies **only when more than one action is eligible**. On the linear path
 * exactly one is, and it repeats until it is done. Raised with her rather than decided
 * quietly, because the two readings produce a different product.
 *
 * ── DURATIONS ARE QUOTED, NOT ESTIMATED ──────────────────────────────────
 * `minutes` is null wherever the product has never stated a duration. Her format has
 * three parts and this drops one, which is a real cost — but the alternative is Wing
 * telling a student the Brand Intelligence Report takes "about 5 minutes" on no evidence,
 * and an invented number is a claim. Five of the eleven actions quote a figure the product
 * already shows; the other six carry null and are on the list for her. The test pins both
 * counts, so adding a rule with an invented duration fails rather than passing quietly.
 */
import { SESSION_MINUTES } from "./transitions";

/**
 * Everything the rule reads. All of it already exists on the dashboard — see
 * `useDashboardStatus`, `latestFreshnessReport`, `hasSliSelected`, `homeworkData`.
 */
export type RecommendationState = {
  intakeComplete: boolean;
  hasResume: boolean;
  hasLinkedIn: boolean;
  /** Completed Foundation sessions, 0 to 3. */
  foundationSessionsBuilt: number;
  /** A Brand Intelligence Report exists. Gates LinkedIn and Strategic Content. */
  hasBrandReport: boolean;
  /** The coach has generated SLI options. Without this the SLI card is locked. */
  sliOptionsReady: boolean;
  sliChosen: boolean;
  linkedinOptimised: boolean;
  /** Assigned questions with no answer yet. */
  openHomework: number;
};

/**
 * The sidebar labels, which are also `handleNavItemClick`'s dispatch keys.
 *
 * The recommendation carries a label rather than an href because navigation is not
 * uniform — a Foundation session runs a start mutation before it navigates, the SLI
 * branches on whether one is already selected, and the coaching call opens Calendly. All
 * of that already exists in one dispatcher, and duplicating it here is how the two drift.
 */
export type NavLabel =
  | "Professional Branding Assessment"
  | "Document Vault"
  | "Functional Identity Mapping"
  | "Professional Credibility Assessment"
  | "Positioning Story Development"
  | "Assigned Homework"
  | "Brand Intelligence Report"
  | "Single Lasting Impression"
  | "LinkedIn Optimization"
  | "Strategic Content"
  | "Schedule Coaching Call";

export type Recommendation = {
  /** Stable key, for the no-repeat check and for analytics. Never shown. */
  key: string;
  /** The action, as Wing's opinion. Her format: "Recommended: Write Something." */
  action: string;
  /** ONE reason, tied to this student's state. Never generic. */
  why: string;
  /** Her third element. Null only where the product has never stated a duration. */
  minutes: string | null;
  /** Where the action goes, via the dashboard's existing dispatcher. */
  navLabel: NavLabel;
};

/**
 * The natural sequence, in order. First eligible wins.
 *
 * Ordered rather than scored, because her failure path asks for exactly this and a scoring
 * function would need weights nobody has ruled on. Every `why` names something true about
 * this student rather than describing the feature.
 */
const RULES: ReadonlyArray<{
  key: string;
  eligible: (s: RecommendationState) => boolean;
  build: (s: RecommendationState) => Omit<Recommendation, "key">;
}> = [
  {
    key: "intake",
    eligible: (s) => !s.intakeComplete,
    build: () => ({
      action: "Talk to Wing",
      why: "Wing does not know anything about you yet, and everything else reads from this.",
      // The dashboard's own DirectiveCard: "Duration: 5 Minutes".
      minutes: "about 5 minutes",
      navLabel: "Professional Branding Assessment",
    }),
  },
  {
    key: "documents",
    eligible: (s) => s.intakeComplete && (!s.hasResume || !s.hasLinkedIn),
    build: (s) => ({
      action: s.hasResume ? "Add your LinkedIn profile" : "Add your resume",
      why: s.hasResume
        ? "Wing has your resume. Your LinkedIn is the other half of the record, and your sessions stay locked until both are in."
        : "Your sessions read against the written record, not just what you told Wing — and they stay locked until it is there.",
      minutes: null,
      navLabel: "Document Vault",
    }),
  },
  {
    key: "foundation_1",
    eligible: (s) => s.intakeComplete && s.hasResume && s.hasLinkedIn && s.foundationSessionsBuilt === 0,
    build: () => ({
      action: "Build Foundation 1",
      why: "You have told Wing where you are. This is where it works out which single function you are credible in.",
      minutes: SESSION_MINUTES[1],
      navLabel: "Functional Identity Mapping",
    }),
  },
  {
    key: "foundation_2",
    eligible: (s) => s.hasResume && s.hasLinkedIn && s.foundationSessionsBuilt === 1,
    build: () => ({
      action: "Build Foundation 2",
      why: "Your function is mapped. This is the evidence that makes it a claim rather than an assertion.",
      minutes: SESSION_MINUTES[2],
      navLabel: "Professional Credibility Assessment",
    }),
  },
  {
    key: "foundation_3",
    eligible: (s) => s.hasResume && s.hasLinkedIn && s.foundationSessionsBuilt === 2,
    build: () => ({
      action: "Build Foundation 3",
      why: "You have the function and the evidence. This turns them into the stories that prove it.",
      minutes: SESSION_MINUTES[3],
      navLabel: "Positioning Story Development",
    }),
  },
  {
    key: "homework",
    eligible: (s) => s.foundationSessionsBuilt >= 3 && s.openHomework > 0,
    build: (s) => ({
      action: s.openHomework === 1 ? "Answer the question Wing left you" : "Answer the questions Wing left you",
      why:
        s.openHomework === 1
          ? "There is one unanswered question from a session, and Wing reads your answer into everything after it."
          : `There are ${s.openHomework} unanswered questions from your sessions, and Wing reads your answers into everything after them.`,
      minutes: null,
      navLabel: "Assigned Homework",
    }),
  },
  {
    key: "brand_report",
    eligible: (s) => s.foundationSessionsBuilt >= 3 && !s.hasBrandReport,
    build: () => ({
      action: "Generate your Brand Intelligence Report",
      why: "Your foundation is built. This is where Wing checks it against how you currently read online — and your LinkedIn work waits on it.",
      minutes: null,
      navLabel: "Brand Intelligence Report",
    }),
  },
  {
    key: "sli",
    eligible: (s) => s.foundationSessionsBuilt >= 3 && s.sliOptionsReady && !s.sliChosen,
    build: () => ({
      action: "Choose your Single Lasting Impression",
      why: "Your options are ready. Your three sessions point somewhere specific and this is where you decide what it is.",
      minutes: null,
      navLabel: "Single Lasting Impression",
    }),
  },
  {
    key: "linkedin",
    eligible: (s) =>
      s.foundationSessionsBuilt >= 3 && s.hasResume && s.hasLinkedIn &&
      s.sliChosen && s.hasBrandReport && !s.linkedinOptimised,
    build: () => ({
      action: "Align your LinkedIn with your positioning",
      why: "You have chosen your impression. Your profile is still the old one.",
      minutes: null,
      navLabel: "LinkedIn Optimization",
    }),
  },
  {
    key: "content",
    eligible: (s) =>
      s.foundationSessionsBuilt >= 3 && s.hasResume && s.hasLinkedIn &&
      s.sliChosen && s.hasBrandReport,
    build: () => ({
      action: "Write something",
      why: "Your positioning only becomes visible when other people read it.",
      minutes: null,
      navLabel: "Strategic Content",
    }),
  },
  {
    key: "coaching_call",
    eligible: (s) => s.foundationSessionsBuilt >= 3,
    build: () => ({
      action: "Book your coaching call",
      why: "Your foundation is built and a person can push on it in a way Wing cannot.",
      // The tool card's own copy: "Book your 30-minute session".
      minutes: "30 minutes",
      navLabel: "Schedule Coaching Call",
    }),
  },
];

/**
 * Every action this student could reasonably be pointed at, in her natural order.
 *
 * Exposed because the no-repeat rule needs to know whether there is a second choice at
 * all. It is not a menu — nothing renders this.
 */
export function eligibleActions(state: RecommendationState): Recommendation[] {
  const out: Recommendation[] = [];
  for (const r of RULES) {
    if (!r.eligible(state)) continue;
    out.push({ key: r.key, ...r.build(state) });
  }
  return out;
}

/**
 * The one recommendation. Never null.
 *
 * `lastKey` is the previous recommendation, and it is skipped **only when there is
 * something else eligible**. See the conflict noted at the top of this file: on the linear
 * path there is exactly one right answer and repeating it is correct.
 */
export function recommend(
  state: RecommendationState,
  lastKey?: string | null,
): Recommendation {
  const eligible = eligibleActions(state);

  if (!eligible.length) {
    /*
     * Her failure path, literally: "Never display 'no recommendation'."
     *
     * **Provably unreachable, and kept anyway.** The exhaustive test enumerates every
     * reachable state and each has at least one eligible action: `coaching_call` covers
     * everything past Foundation 3, and one of intake / documents / foundation_N covers
     * everything before it. So this is not a live branch.
     *
     * It stays because the guarantee it encodes is hers and the rule table will change:
     * the day someone adds a condition to `coaching_call`, this is what keeps the promise
     * rather than returning undefined into a dashboard.
     */
    return {
      key: "coaching_call",
      action: "Book your coaching call",
      why: "A person can push on your positioning in a way Wing cannot.",
      minutes: "30 minutes",
      navLabel: "Schedule Coaching Call",
    };
  }

  /*
   * No explicit "only rotate when there is a choice" condition, because the search already
   * behaves that way and a redundant guard is worse than none: a mutation test cannot tell
   * it from its absence, so it reads as a protection that is not there.
   *
   * With one eligible action and that action as `lastKey`, the search finds nothing and the
   * line below returns it — correct on the linear path. With several, it finds a different
   * one. Same rule, no dead condition.
   */
  if (lastKey) {
    const different = eligible.find((r) => r.key !== lastKey);
    if (different) return different;
  }
  return eligible[0];
}
