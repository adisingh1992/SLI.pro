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

/**
 * How the chat surface opens and handles a turn for this registry entry.
 *
 * `status` answers whether the capability is available; it does not answer how to run
 * it. Keeping that second decision explicit prevents a live, non-Foundation affordance
 * from falling through the Foundation-only send path merely because it has no
 * `sessionType` — the exact failure that left "Something else" as a blank thread.
 */
export type ModuleBehavior =
  | "foundation"
  | "positioning_refresh"
  | "weekly_check_in"
  | "router"
  | "unavailable"
  | "surface";

export type WingModule = {
  slug: ModuleSlug;
  /** What the student reads. Presentation only — never stored, never matched on. */
  name: string;
  /** Her one-line description, from EXPLORE_GROUPS. Empty where she wrote none. */
  desc: string;
  group: ModuleGroup;
  status: ModuleStatus;
  behavior: ModuleBehavior;
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
    behavior: "foundation",
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
    behavior: "foundation",
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
    behavior: "foundation",
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
    behavior: "unavailable",
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
    behavior: "unavailable",
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
    behavior: "unavailable",
    sessionType: null,
    methodology: "Module 6 — Writing Coach",
    inPicker: true,
  },
  {
    /*
     * A screen, not a conversation. Full Module 7 Wing Radar (web-search-based,
     * real headlines) still has no substrate — no web-search-capable model
     * call, no search provider. What's live is Baby Radar (H-701): a smaller
     * weekly job that suggests 3-5 topic areas from the student's own
     * positioning, no search involved. Kept out of the picker — it's a
     * passive weekly surface, not something a student opens a conversation
     * to start.
     */
    slug: "this_weeks_intelligence",
    name: "This Week's Intelligence",
    desc: "What's moving in your space, filtered to what matters for you.",
    group: "Create and publish",
    status: "live",
    behavior: "surface",
    sessionType: null,
    methodology: "Module 7 — Wing Radar (Baby Radar, H-701)",
    href: "/radar",
    inPicker: false,
  },
  {
    slug: "power_and_influence",
    name: "Power and Influence",
    desc: "Read the room you're in and where leverage actually sits.",
    group: "Develop and grow",
    status: "not_built",
    behavior: "unavailable",
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
    behavior: "unavailable",
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
    behavior: "unavailable",
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
    behavior: "unavailable",
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
    behavior: "unavailable",
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
    behavior: "positioning_refresh",
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
    behavior: "weekly_check_in",
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
    behavior: "router",
    sessionType: null,
    methodology: "Cross-Module Routing Rules §7",
    inPicker: true,
  },
];

const BY_SLUG = new Map(WING_MODULES.map((m) => [m.slug, m]));

export function moduleFor(slug: string): WingModule | null {
  return BY_SLUG.get(slug as ModuleSlug) ?? null;
}

/**
 * The one question Cross-Module Routing Rules §7 requires for an ambiguous request.
 * It is deterministic methodology copy, not model-generated coaching.
 */
export const ROUTER_OPENING =
  "Sure. Are you thinking about content, career exploration, interview prep, or something else?";

/**
 * Resolve a specific answer to the router's single clarifying question.
 *
 * This is deliberately conservative. The router may recognise ordinary names and close
 * synonyms for modules, but it must never guess a coaching destination from vague text.
 * The first matching rule wins, so narrow intents (a job description or an interview)
 * precede broad ones (career exploration or positioning).
 */
export function moduleForRoutingRequest(request: string): WingModule | null {
  const text = request
    .toLocaleLowerCase("en")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return null;

  const rules: readonly { slug: ModuleSlug; patterns: readonly RegExp[] }[] = [
    {
      slug: "analyze_a_job_description",
      patterns: [
        /\bjob description\b/,
        /\bjob posting\b/,
        /\bjob advert(?:isement)?\b/,
        /\bjd analysis\b/,
        /\banaly[sz]e (?:a |the |this )?(?:role|job)\b/,
      ],
    },
    {
      slug: "interview_prep",
      patterns: [/\binterview(?:ing|s)?\b/, /\bmock interview\b/, /\binterview prep(?:aration)?\b/],
    },
    {
      slug: "write_something",
      patterns: [
        /\bcontent\b/,
        /\bwriting\b/,
        /\bwrite (?:a |an |my )?(?:post|article|bio|draft)\b/,
        /\b(?:linkedin|social) post\b/,
        /\bdraft(?:ing)?\b/,
      ],
    },
    {
      slug: "refresh_your_positioning",
      patterns: [
        /\bpositioning\b/,
        /\bpositioning statement\b/,
        /\brefresh (?:my )?(?:statement|sli)\b/,
        /\b(?:update|revise|rework) (?:my )?(?:statement|sli)\b/,
      ],
    },
    {
      slug: "power_and_influence",
      patterns: [
        /\bpower(?: dynamics)?\b/,
        /\binfluence\b/,
        /\bstakeholder(?:s)?\b/,
        /\boffice politics\b/,
      ],
    },
    {
      slug: "competency_check",
      patterns: [
        /\bcompetenc(?:y|ies)\b/,
        /\bskill(?:s)? gap(?:s)?\b/,
        /\bmy skills\b/,
        /\bdevelopment gap(?:s)?\b/,
      ],
    },
    {
      slug: "build_your_network",
      patterns: [
        /\bnetwork(?:ing)?\b/,
        /\bprofessional relationships?\b/,
        /\boutreach\b/,
        /\bpeople to contact\b/,
      ],
    },
    {
      slug: "tell_your_stories",
      patterns: [
        /\bstor(?:y|ies|ytelling)\b/,
        /\bcareer narrative\b/,
        /\bexperience narrative\b/,
      ],
    },
    {
      slug: "prove_your_credibility",
      patterns: [
        /\bcredibility\b/,
        /\bachievement(?:s)?\b/,
        /\baccomplishment(?:s)?\b/,
        /\bproof (?:of|that)\b/,
        /\bevidence of (?:my |the )?(?:work|impact|skills?)\b/,
      ],
    },
    {
      slug: "weekly_check_in",
      patterns: [
        /\bweekly check[ -]?in\b/,
        /\bcheck[ -]?in\b/,
        /\blife log\b/,
        /\blog (?:an? |my )?(?:update|milestone|event)\b/,
        /\bwhat(?:'s| is) been happening\b/,
      ],
    },
    {
      slug: "discover_your_function",
      patterns: [
        /\bfunctional identity\b/,
        /\bmy function\b/,
        /\bwhat i (?:actually )?do\b/,
        /\bdescribe (?:myself|what i do)\b/,
        /\bprofessional identity\b/,
      ],
    },
    {
      slug: "explore_career_options",
      patterns: [
        /\bcareer (?:exploration|options?|paths?|direction|change|pivot)\b/,
        /\bexplore (?:a |my )?(?:career|role|roles|options?)\b/,
        /\bwhat (?:career|role|job) (?:should|could) i\b/,
        /\bnext (?:career )?(?:move|role|job)\b/,
      ],
    },
  ];

  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(text))) return moduleFor(rule.slug);
  }

  return null;
}

/** The explicit second "something else" enters scoped free-chat mode. */
export function isFreeChatConfirmation(request: string): boolean {
  return request
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[.!?,;:]+$/g, "")
    .trim() === "something else";
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
