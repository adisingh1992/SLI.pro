/**
 * The module registry — the one place a module has an identity.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * The wing5 prototype carries two module lists that do not reconcile: `MODULES` (12,
 * the composer dropdown) and `EXPLORE_GROUPS` (13, the Explore overlay). Eight names
 * appear in both. Five differ for the same module — "Career Exploration" vs "Explore
 * Career Options", "Writing Coach" vs "Write Something" — and thread titles use a third
 * format again ("Interview prep — Meridian"). There are no ids anywhere; modules are
 * matched by display string.
 *
 * That works in a prototype where nothing is stored. It cannot survive contact with a
 * database: a display string is a thing a copywriter changes, and the day someone fixes
 * "Analyze" to "Analyse" every stored session stops resolving, silently, with no error.
 *
 * So every module has a slug. The slug is what is stored and what routes; the display
 * name is presentation and may change freely.
 *
 * ── WHERE THE NAMES AND GROUPS COME FROM ─────────────────────────────────
 * `Wing_Comprehensive_UX_Recommendation-2.md` §1.2, which is explicit that the
 * user-facing navigation groups by PURPOSE rather than by the technical architecture:
 *
 *   "This naming convention strips jargon ('Foundation 1 — Functional Identity
 *    Mapping' → 'Discover Your Function') while preserving the methodology's logic."
 *
 * The groups below are hers verbatim. Where the prototype's two lists disagreed, hers
 * is the tiebreak — so "Explore Career Options" and "Write Something" win over the
 * dropdown's "Career Exploration" and "Writing Coach".
 *
 * ── AND WHY `status` IS ON THE RECORD RATHER THAN A FILTER ───────────────
 * IG-UX01: never show a locked module. Every module here is offered. But nine of them
 * have no methodology behind them — no heuristic cards, no completion criteria, no
 * session type — and offering a coaching conversation that cannot happen is worse than
 * a padlock, because a padlock at least tells the truth.
 *
 * `status: "live"` means a student can actually work in it. Anything else means the
 * thread opens and Wing says plainly that this is not something it can do yet. That is
 * the only reading of "no locked modules" that does not require inventing a module.
 */

/** Stable identity. Stored, routed, and never shown to a student. */
export type ModuleSlug =
  | "discover_your_function"
  | "prove_your_credibility"
  | "tell_your_stories"
  | "weekly_check_in"
  | "explore_career_options"
  | "analyze_a_job_description"
  | "write_something"
  | "this_weeks_intelligence"
  | "competency_check"
  | "power_and_influence"
  | "interview_prep"
  | "build_your_network"
  | "your_reveal"
  | "refresh_your_positioning"
  | "something_else";

/** Her §1.2 groups, in her order. */
export type ModuleGroup =
  | "Build your positioning"
  | "Explore and evaluate"
  | "Create and publish"
  | "Develop and grow"
  | "Your evolution";

export type ModuleStatus =
  /** A student can work in it today. */
  | "live"
  /** Methodology exists, nothing is wired. The thread opens and says so. */
  | "not_built"
  /** Not a coaching conversation — it opens a screen instead. */
  | "surface";

export type WingModule = {
  slug: ModuleSlug;
  /** What the student reads. Presentation only — never stored, never matched on. */
  name: string;
  /** Her one-line description, from EXPLORE_GROUPS. Empty where she wrote none. */
  desc: string;
  group: ModuleGroup;
  status: ModuleStatus;
  /**
   * The backend session type, where one exists. `null` for everything that is not a
   * Foundation session — including the live ones, because the weekly check-in is a
   * life-log entry and Refresh Your Positioning has its own routes.
   */
  sessionType: "foundation_1" | "foundation_2" | "foundation_3" | null;
  /** Danielle's number, for cross-referencing the compendium. */
  methodology: string;
  /** Where the module lives if it is a screen rather than a conversation. */
  href?: string;
  /** Offered in the composer's module picker. Her "Something else" is, Radar is not. */
  inPicker: boolean;
};

export const WING_MODULES: readonly WingModule[] = [
  {
    slug: "discover_your_function",
    name: "Discover Your Function",
    desc: "Name the work only you do — the thread under everything you've built.",
    group: "Build your positioning",
    status: "live",
    sessionType: "foundation_1",
    methodology: "Foundation 1 — Functional Identity Mapping",
    inPicker: true,
  },
  {
    slug: "prove_your_credibility",
    name: "Prove Your Credibility",
    desc: "Turn what you've done into evidence someone else can repeat.",
    group: "Build your positioning",
    status: "live",
    sessionType: "foundation_2",
    methodology: "Foundation 2 — Credibility Assessment",
    inPicker: true,
  },
  {
    slug: "tell_your_stories",
    name: "Tell Your Stories",
    desc: "Shape the three stories that carry you through any room.",
    group: "Build your positioning",
    status: "live",
    sessionType: "foundation_3",
    methodology: "Foundation 3 — Story Development",
    inPicker: true,
  },
  {
    slug: "explore_career_options",
    name: "Explore Career Options",
    desc: "Pressure-test the paths you're circling before you commit.",
    group: "Explore and evaluate",
    status: "not_built",
    sessionType: null,
    methodology: "Module 4 — Career Exploration",
    inPicker: true,
  },
  {
    slug: "analyze_a_job_description",
    name: "Analyze a Job Description",
    desc: "Read what they're actually asking for, then map yourself against it.",
    group: "Explore and evaluate",
    status: "not_built",
    sessionType: null,
    methodology: "Module 5 — JD Analysis",
    inPicker: true,
  },
  {
    slug: "write_something",
    name: "Write Something",
    desc: "Draft in your voice, not the category's voice.",
    group: "Create and publish",
    status: "not_built",
    sessionType: null,
    methodology: "Module 6 — Writing Coach",
    inPicker: true,
  },
  {
    /*
     * A screen, not a conversation — and currently an empty one. Radar has no
     * substrate: no web-search-capable model call, no search provider, no weekly
     * generation job. Kept in the registry so the gap has a name, and out of the
     * picker so nobody is offered a briefing that does not exist.
     */
    slug: "this_weeks_intelligence",
    name: "This Week's Intelligence",
    desc: "What's moving in your space, filtered to what matters for you.",
    group: "Create and publish",
    status: "not_built",
    sessionType: null,
    methodology: "Module 7 — Wing Radar",
    href: "/radar",
    inPicker: false,
  },
  {
    slug: "power_and_influence",
    name: "Power and Influence",
    desc: "Read the room you're in and where leverage actually sits.",
    group: "Develop and grow",
    status: "not_built",
    sessionType: null,
    methodology: "Module 9 — Power & Influence",
    inPicker: true,
  },
  {
    slug: "competency_check",
    name: "Competency Check",
    desc: "A candid read on the gap between where you are and where you're aiming.",
    group: "Develop and grow",
    status: "not_built",
    sessionType: null,
    methodology: "Module 8 — Competency Intelligence",
    inPicker: true,
  },
  {
    slug: "interview_prep",
    name: "Interview Prep",
    desc: "Rehearse the hard questions with the answers you'd actually give.",
    group: "Develop and grow",
    status: "not_built",
    sessionType: null,
    methodology: "Module 10 — Interview Prep",
    inPicker: true,
  },
  {
    slug: "build_your_network",
    name: "Build Your Network",
    desc: "Fewer, better conversations — and a reason for each one.",
    group: "Develop and grow",
    status: "not_built",
    sessionType: null,
    methodology: "Module 11 — Network Intelligence",
    inPicker: true,
  },
  {
    slug: "your_reveal",
    name: "Your Reveal",
    desc: "What's shifted in how you talk about yourself.",
    group: "Your evolution",
    status: "not_built",
    sessionType: null,
    methodology: "Reveal Cycle",
    inPicker: false,
  },
  {
    /*
     * Live, and the one nobody expected. `/api/positioning-refresh/*` is complete —
     * begin, message, accept, history, reset — and had no student surface at all until
     * this design gave it one, both here and as the dashboard's masthead line.
     */
    slug: "refresh_your_positioning",
    name: "Refresh Your Positioning",
    desc: "Re-anchor the statement as the work changes.",
    group: "Your evolution",
    status: "live",
    sessionType: null,
    methodology: "Positioning Refresh",
    inPicker: true,
  },
  {
    /*
     * Not in her Explore groups — it is a picker affordance, not a module. Kept last
     * and out of Explore for that reason.
     */
    slug: "weekly_check_in",
    name: "Weekly check-in",
    desc: "",
    group: "Your evolution",
    status: "live",
    sessionType: null,
    methodology: "micro-journal / heartbeat prompt",
    inPicker: true,
  },
  {
    /*
     * The routing rules' ambiguous-request case: "Wing asks one clarifying question:
     * 'Sure. Are you thinking about content, career exploration, interview prep, or
     * something else?'"
     */
    slug: "something_else",
    name: "Something else",
    desc: "",
    group: "Your evolution",
    status: "live",
    sessionType: null,
    methodology: "Cross-Module Routing Rules §7",
    inPicker: true,
  },
];

const BY_SLUG = new Map(WING_MODULES.map((m) => [m.slug, m]));

export function moduleFor(slug: string): WingModule | null {
  return BY_SLUG.get(slug as ModuleSlug) ?? null;
}

/** The composer's dropdown, in registry order. */
export const PICKER_MODULES = WING_MODULES.filter((m) => m.inPicker);

/**
 * The Explore overlay, grouped.
 *
 * Built from the registry rather than from a second hand-maintained list, which is the
 * whole point: the prototype's two lists had already drifted apart by five names before
 * anything was wired to either of them.
 */
export const EXPLORE_GROUPS: readonly { group: ModuleGroup; items: WingModule[] }[] = (
  [
    "Build your positioning",
    "Explore and evaluate",
    "Create and publish",
    "Develop and grow",
    "Your evolution",
  ] as const
).map((group) => ({
  group,
  /* `something_else` and `weekly_check_in` are picker affordances, not destinations. */
  items: WING_MODULES.filter(
    (m) => m.group === group && m.slug !== "something_else" && m.slug !== "weekly_check_in",
  ),
}));

/** Foundation session number → slug, for reading existing sessions back. */
export const SLUG_FOR_SESSION_TYPE: Readonly<Record<string, ModuleSlug>> = {
  foundation_1: "discover_your_function",
  foundation_2: "prove_your_credibility",
  foundation_3: "tell_your_stories",
};

/**
 * What Wing says when a student opens a module that has no methodology behind it.
 *
 * Deliberately not a coaching opening. Wing does not have this module's cards, so any
 * question it asked would be improvised — and improvised career coaching from a system
 * that presents itself as methodology-driven is the failure this whole codebase is
 * built to avoid. It says what it can do instead, which is her routing behaviour for an
 * ambiguous request.
 */
export function unavailableOpening(m: WingModule): string {
  return (
    `${m.name} isn't something I can work on with you yet — it's built, but not switched ` +
    `on. What I can do properly right now is your positioning: naming your function, ` +
    `proving your credibility, or shaping your stories. Want to start with one of those?`
  );
}
