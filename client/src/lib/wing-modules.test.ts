/**
 * The module registry — that it covers the methodology, and that "live" means live.
 *
 * Behavioural. `wing-modules.ts` is pure data plus three lookups, so every rule below is
 * run rather than described.
 *
 * ── THE TWO FAILURES THIS IS FOR ─────────────────────────────────────────
 * 1. A module quietly goes missing. The wing5 prototype shipped two module lists that
 *    had already drifted five names apart before anything was wired to either — the
 *    composer dropdown said "Career Exploration", the Explore overlay said "Explore
 *    Career Options", and nothing in the code could tell they were the same module.
 *    Both lists are now derived from one registry, and this asserts the registry covers
 *    Danielle's §1.2 navigation exactly.
 *
 * 2. A module is marked `live` without being wired. That is this codebase's recurring
 *    defect in its purest form — a surface claiming something is in force when the thing
 *    it names is absent — and here it reaches a student directly: they pick a module,
 *    Wing opens a thread, and there is no methodology behind it. `status: "live"` has to
 *    mean a real backend path exists, so check 4 goes and looks.
 */
import {
  EXPLORE_GROUPS,
  PICKER_MODULES,
  ROUTER_OPENING,
  SLUG_FOR_SESSION_TYPE,
  WING_MODULES,
  isFreeChatConfirmation,
  moduleFor,
  moduleForRoutingRequest,
  unavailableOpening,
  type ModuleSlug,
} from "./wing-modules";

let failed = 0;
function check(label: string, ok: boolean, detail: string) {
  if (ok) console.log(`  ok — ${detail}`);
  else {
    failed++;
    console.log(`  FAIL — ${label}: ${detail}`);
  }
}

console.log("\nthe module registry — one identity per module, and live means live\n");

/* ─────────────────────────────────────────────────────────────────────────
 * 1. Every slug is unique, resolvable, and named.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("Every module has one identity");
{
  const bad: string[] = [];
  const seen = new Set<string>();

  for (const m of WING_MODULES) {
    if (seen.has(m.slug)) bad.push(`${m.slug} appears twice`);
    seen.add(m.slug);
    if (!m.name.trim()) bad.push(`${m.slug} has no display name`);
    if (!m.methodology.trim()) bad.push(`${m.slug} names no methodology`);
    if (moduleFor(m.slug) !== m) bad.push(`moduleFor("${m.slug}") does not resolve to it`);
  }

  /* And a slug nobody defined resolves to null rather than to something plausible. */
  if (moduleFor("interview-prep") !== null) {
    bad.push('moduleFor("interview-prep") resolved — hyphens are not the slug format');
  }
  if (moduleFor("") !== null) bad.push('moduleFor("") resolved');

  check("identity", bad.length === 0, bad.length === 0
    ? `${WING_MODULES.length} modules, each with a unique slug that resolves`
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 2. The registry covers Danielle's §1.2 navigation, exactly.
 *
 * Quoted from `Wing_Comprehensive_UX_Recommendation-2.md` §1.2 — "Module Grouping for
 * Navigation". Both directions: nothing of hers is missing, and nothing has been
 * invented that she did not list.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe registry is Danielle's §1.2 navigation, both directions");
{
  const HER_NAV: Record<string, string[]> = {
    "Build your positioning": [
      "Discover Your Function",
      "Prove Your Credibility",
      "Tell Your Stories",
    ],
    "Explore and evaluate": ["Explore Career Options", "Analyze a Job Description"],
    "Create and publish": ["Write Something", "This Week's Intelligence"],
    "Develop and grow": [
      "Power and Influence",
      "Competency Check",
      "Interview Prep",
      "Build Your Network",
    ],
    "Your evolution": ["Your Reveal", "Refresh Your Positioning"],
  };

  const bad: string[] = [];
  const byGroup = new Map(EXPLORE_GROUPS.map((g) => [g.group as string, g.items.map((i) => i.name)]));

  for (const [group, names] of Object.entries(HER_NAV)) {
    const got = byGroup.get(group);
    if (!got) {
      bad.push(`group "${group}" is missing from Explore`);
      continue;
    }
    for (const name of names) {
      if (!got.includes(name)) bad.push(`"${name}" is missing from "${group}"`);
    }
    for (const name of got) {
      if (!names.includes(name)) bad.push(`"${name}" is in "${group}" and not in her §1.2`);
    }
  }

  check("her navigation", bad.length === 0, bad.length === 0
    ? `${Object.values(HER_NAV).flat().length} modules across her 5 groups, no additions`
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 3. Every name the prototype used is accounted for.
 *
 * The prototype's two lists are the thing being replaced, so the replacement has to
 * cover both — including the five names that differ between them. A rename is fine; a
 * disappearance is not, and a disappearance is exactly what a display-string match
 * produces silently.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nEvery module the prototype offered still exists");
{
  /** `MODULES` — the composer dropdown, verbatim. */
  const PROTOTYPE_PICKER = [
    "Weekly check-in", "Discover Your Function", "Prove Your Credibility",
    "Tell Your Stories", "Career Exploration", "Analyze a Job Description",
    "Interview Prep", "Writing Coach", "Power and Influence", "Competency Check",
    "Build Your Network", "Something else",
  ];

  /** The five the prototype named differently between its own two lists. */
  const RENAMED: Record<string, ModuleSlug> = {
    "Career Exploration": "explore_career_options",
    "Writing Coach": "write_something",
  };

  const bad: string[] = [];
  const byName = new Map(WING_MODULES.map((m) => [m.name, m]));

  for (const name of PROTOTYPE_PICKER) {
    const direct = byName.get(name);
    const renamed = RENAMED[name] ? moduleFor(RENAMED[name]) : null;
    if (!direct && !renamed) {
      bad.push(`"${name}" was in the prototype's picker and is in neither the registry nor the rename table`);
    }
  }

  /* And the picker still offers all of them. */
  const pickerNames = PICKER_MODULES.map((m) => m.name);
  for (const name of PROTOTYPE_PICKER) {
    const resolved = byName.get(name) ?? (RENAMED[name] ? moduleFor(RENAMED[name]) : null);
    if (resolved && !pickerNames.includes(resolved.name)) {
      bad.push(`"${resolved.name}" dropped out of the picker`);
    }
  }

  check("prototype coverage", bad.length === 0, bad.length === 0
    ? `all ${PROTOTYPE_PICKER.length} prototype modules resolve, ${RENAMED ? Object.keys(RENAMED).length : 0} via rename`
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 4. THE ONE THAT MATTERS: "live" means there is something behind it.
 *
 * A student picking a live module must reach a real conversation. The three Foundation
 * modules have a session type; the other three live ones are live for a specific,
 * stated reason and this check names each. Anything else claiming to be live is a
 * module about to improvise career coaching.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nEvery live module has a backend path, and every path is claimed once");
{
  const bad: string[] = [];

  /**
   * The live modules that are NOT Foundation sessions, each with the endpoint that
   * makes it live. Written out rather than inferred, so adding a fourth means writing
   * down what backs it.
   */
  const LIVE_WITHOUT_SESSION: Record<string, string> = {
    refresh_your_positioning: "/api/positioning-refresh/*",
    weekly_check_in: "/api/life-log + /api/life-log/prompt",
    something_else: "routing — asks once; explicit confirmation enters ongoing engagement",
    this_weeks_intelligence: "GET /api/radar-suggestions + POST /api/radar-suggestions/:id/engage",
  };

  const sessionTypes = new Set<string>();

  for (const m of WING_MODULES) {
    if (m.status === "live") {
      if (!m.sessionType && !LIVE_WITHOUT_SESSION[m.slug]) {
        bad.push(
          `${m.slug} is marked live with no session type and no entry in ` +
            `LIVE_WITHOUT_SESSION — nothing is behind it`,
        );
      }
    } else if (m.sessionType) {
      bad.push(`${m.slug} is not live but claims session type ${m.sessionType}`);
    }

    if (m.sessionType) {
      if (sessionTypes.has(m.sessionType)) {
        bad.push(`${m.sessionType} is claimed by more than one module`);
      }
      sessionTypes.add(m.sessionType);
      /* And the reverse lookup agrees, so reading a session back finds this module. */
      if (SLUG_FOR_SESSION_TYPE[m.sessionType] !== m.slug) {
        bad.push(
          `SLUG_FOR_SESSION_TYPE[${m.sessionType}] is ` +
            `${SLUG_FOR_SESSION_TYPE[m.sessionType]}, not ${m.slug} — a stored session ` +
            `would resolve to the wrong module`,
        );
      }
    }
  }

  /* All three Foundation sessions are claimed. A missing one is a module nobody can reach. */
  for (const t of ["foundation_1", "foundation_2", "foundation_3"]) {
    if (!sessionTypes.has(t)) bad.push(`${t} is claimed by no module`);
  }

  /* And nothing in the reverse map points at a slug that is gone. */
  for (const [type, slug] of Object.entries(SLUG_FOR_SESSION_TYPE)) {
    if (!moduleFor(slug)) bad.push(`SLUG_FOR_SESSION_TYPE[${type}] points at unknown slug ${slug}`);
  }

  check("live means live", bad.length === 0, bad.length === 0
    ? `${WING_MODULES.filter((m) => m.status === "live").length} live modules, each backed; ` +
        `3 Foundation types claimed once each and reversible`
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 5. "Something else" is a router, not an empty live module.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nSomething else asks once, routes specific requests, and starts no session");
{
  const bad: string[] = [];
  const router = moduleFor("something_else");

  if (!router) bad.push("something_else does not resolve");
  else {
    if (router.behavior !== "router") bad.push(`behavior is ${router.behavior}, not router`);
    if (router.sessionType !== null) bad.push(`router claims session ${router.sessionType}`);
  }

  if (!/content.*career exploration.*interview prep.*something else/i.test(ROUTER_OPENING)) {
    bad.push("opening is not the one clarifying question from routing rule 7");
  }

  const cases: readonly [string, ModuleSlug][] = [
    ["I have an interview next week", "interview_prep"],
    ["Can you help me analyse this job description?", "analyze_a_job_description"],
    ["I want to write a LinkedIn post", "write_something"],
    ["Let's explore career options", "explore_career_options"],
    ["I need to refresh my positioning", "refresh_your_positioning"],
    ["Help me work through stakeholder influence", "power_and_influence"],
    ["I want to understand my skill gaps", "competency_check"],
    ["I need to build my network", "build_your_network"],
    ["Let's shape my career stories", "tell_your_stories"],
    ["I want stronger evidence of my impact", "prove_your_credibility"],
    ["I want to log a milestone", "weekly_check_in"],
    ["Help me describe what I do", "discover_your_function"],
  ];

  for (const [request, expected] of cases) {
    const actual = moduleForRoutingRequest(request)?.slug ?? null;
    if (actual !== expected) bad.push(`"${request}" routed to ${actual}, expected ${expected}`);
  }

  for (const vague of ["Something different", "I don't know", "Can we just talk?"]) {
    const resolved = moduleForRoutingRequest(vague);
    if (resolved) bad.push(`vague request "${vague}" guessed ${resolved.slug}`);
  }

  for (const confirmation of ["Something else", "something else.", "  SOMETHING ELSE!  "]) {
    if (!isFreeChatConfirmation(confirmation)) {
      bad.push(`"${confirmation}" did not activate scoped free chat`);
    }
  }
  for (const notConfirmation of ["something else about interviews", "anything else", "else"]) {
    if (isFreeChatConfirmation(notConfirmation)) {
      bad.push(`"${notConfirmation}" incorrectly activated scoped free chat`);
    }
  }

  check("router behavior", bad.length === 0, bad.length === 0
    ? `${cases.length} specific intents route; an explicit second Something else enters scoped free chat`
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 6. A module with nothing behind it says so, and does not improvise.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nAn unbuilt module opens with an honest sentence, not a coaching question");
{
  const bad: string[] = [];
  const unbuilt = WING_MODULES.filter((m) => m.status === "not_built");

  if (!unbuilt.length) bad.push("no unbuilt modules — this check is testing nothing");

  for (const m of unbuilt) {
    const text = unavailableOpening(m);
    if (!text.includes(m.name)) bad.push(`${m.slug}'s opening does not name the module`);
    /*
     * It must point at something real. An apology that leaves the student with nowhere
     * to go is the same dead end as a padlock, just politer.
     */
    if (!/positioning/i.test(text)) {
      bad.push(`${m.slug}'s opening offers no alternative`);
    }
    /* And it must not ask a coaching question it has no cards to follow up on. */
    if (/\btell me about\b|\bwalk me through\b|\bdescribe\b/i.test(text)) {
      bad.push(`${m.slug}'s opening asks a coaching question for a module with no methodology`);
    }
  }

  check("honest opening", bad.length === 0, bad.length === 0
    ? `${unbuilt.length} unbuilt modules, each naming itself and offering a live one instead`
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 7. Explore and the picker are both derived, and neither drops a destination.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nExplore and the picker are two views of one registry");
{
  const bad: string[] = [];

  const AFFORDANCES = new Set<string>(["something_else", "weekly_check_in"]);
  const exploreSlugs = new Set(EXPLORE_GROUPS.flatMap((g) => g.items.map((i) => i.slug)));

  for (const m of WING_MODULES) {
    if (AFFORDANCES.has(m.slug)) {
      if (exploreSlugs.has(m.slug)) bad.push(`${m.slug} is a picker affordance and should not be a destination in Explore`);
    } else if (!exploreSlugs.has(m.slug)) {
      bad.push(`${m.slug} is in the registry and reachable from nowhere in Explore`);
    }
  }

  /* Every Explore item carries the description a student reads on hover. */
  for (const g of EXPLORE_GROUPS) {
    for (const item of g.items) {
      if (!item.desc.trim()) bad.push(`${item.slug} is in Explore with no description`);
    }
  }

  /* A module out of the picker is a deliberate act — Radar and the Reveal, and no others. */
  const notInPicker = WING_MODULES.filter((m) => !m.inPicker).map((m) => m.slug).sort();
  const EXPECTED_OUT = ["this_weeks_intelligence", "your_reveal"];
  if (JSON.stringify(notInPicker) !== JSON.stringify(EXPECTED_OUT)) {
    bad.push(
      `modules held out of the picker are [${notInPicker.join(", ")}], expected ` +
        `[${EXPECTED_OUT.join(", ")}] — Radar has no substrate and the Reveal fires on ` +
        `its own cadence; anything else being held out needs a reason`,
    );
  }

  check("two views", bad.length === 0, bad.length === 0
    ? `${exploreSlugs.size} destinations in Explore, ${PICKER_MODULES.length} in the picker, no orphans`
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 8. The slug set is frozen.
 *
 * ── WHY A LITERAL LIST AND NOT A DERIVED RULE ────────────────────────────
 * This check was added because a mutation got past checks 1-6: renaming one module's
 * slug while leaving its display name alone. Every other check passed — check 2 compares
 * NAMES against Danielle's navigation, check 4 only inspects live modules, and check 6
 * reads Explore membership by slug, so it agreed with itself.
 *
 * That is the worst possible thing to miss here. A slug is the stored identity: it is
 * written into `sessions`, it is what a thread resolves through, and changing one
 * orphans every conversation a student has already had, with no error and no visible
 * symptom until somebody opens an old thread and it is empty.
 *
 * So the set is written out longhand. Adding a module means adding a line here, which is
 * the intended friction — a new slug is cheap and a changed slug is a migration.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe slug set is frozen — a changed slug is a migration, not an edit");
{
  const FROZEN: ModuleSlug[] = [
    "analyze_a_job_description",
    "build_your_network",
    "competency_check",
    "discover_your_function",
    "explore_career_options",
    "interview_prep",
    "power_and_influence",
    "prove_your_credibility",
    "refresh_your_positioning",
    "something_else",
    "tell_your_stories",
    "this_weeks_intelligence",
    "weekly_check_in",
    "write_something",
    "your_reveal",
  ];

  const actual = WING_MODULES.map((m) => m.slug).sort();
  const expected = [...FROZEN].sort();

  const added = actual.filter((s) => !expected.includes(s));
  const gone = expected.filter((s) => !actual.includes(s));

  const bad: string[] = [];
  if (gone.length) {
    bad.push(
      `${gone.join(", ")} no longer exist. If a module was renamed, the SLUG must stay ` +
        `— every stored session resolves through it. Change the display name instead.`,
    );
  }
  if (added.length) {
    bad.push(`${added.join(", ")} are new — add them to FROZEN deliberately`);
  }

  check("frozen slugs", bad.length === 0, bad.length === 0
    ? `${actual.length} slugs, unchanged`
    : bad.join("; "));
}

console.log(failed === 0 ? "\nall passed\n" : `\n${failed} failed\n`);
if (failed > 0) process.exit(1);
