/**
 * Editing the prompt library — B2's "prompt library configurable without code changes".
 *
 * Pure. The database work is in `prompt-library-routes.ts`; everything that decides
 * whether a prompt is well-formed, and whether it can ever actually be sent, lives here
 * so it can be run rather than reasoned about.
 *
 * ── WHY THIS IS MORE THAN A FORM VALIDATOR ───────────────────────────────
 * The message-template editor could get away with "is the body empty". A template is
 * sent because a code path decided to send it, so a saved template with odd fields is
 * visibly wrong the first time it goes out.
 *
 * A library prompt is different: it enters a POOL and is drawn from it. `selectPrompt`
 * filters candidates and picks among the survivors, so a prompt that fails a filter is
 * not rejected anywhere — it simply never comes up. Danielle would write it, save it,
 * see it listed as active, and it would never reach a student. Nothing would log
 * anything, because from selection's point of view nothing happened.
 *
 * `reachability()` exists for exactly that. It runs the real `eligible()` — not a
 * description of it — against every population a real student can resolve to, and
 * reports who could receive this prompt. When the answer is nobody, it says so at save
 * time, which is the only moment anybody is looking.
 *
 * ── WHAT BLOCKS AND WHAT MERELY WARNS ────────────────────────────────────
 * Errors are the ones with no defensible reading: empty text, a value outside a fixed
 * vocabulary, an opener that would send a literal `[Name]` to a student.
 *
 * Everything else warns and saves. The library carries analytical prose Danielle is
 * still working through — most rows legitimately have a null signal category and a null
 * tier — and an editor that refused to save an incomplete row would be an editor she
 * could not use on the material she actually has.
 *
 * The one uncomfortable case is a null cadence, which makes a prompt unreachable
 * (`eligible` compares cadence to the rhythm being sent, and null equals nothing). It
 * warns rather than blocks, because 28 pre-existing rows are in that state and blocking
 * would make them uneditable — but `reachability` reports it as unreachable, in the same
 * breath, so it cannot be saved without being told.
 */
import { eligible, type Candidate, type SelectionContext } from "./prompt-selection";
import {
  populationTagsFor,
  METHODOLOGY_POPULATIONS,
  type Pathway,
  type ProfessionalStatus,
} from "./population-tags";

/* ── The vocabularies ─────────────────────────────────────────────────── */

/** Her eight. `prompt_log.signal_category` and Gate 2 both count these. */
export const SIGNAL_CATEGORIES = [
  "language", "energy", "decision", "relationship",
  "industry", "career", "influence", "achievement",
] as const;

/**
 * A prompt's categories in her order, deduplicated — the one spelling of a given set.
 *
 * Every write goes through this, so "did the category change" and "is this save a no-op"
 * can both be plain equality checks. Without it `{energy, career}` and `{career, energy}`
 * are different strings, and the edit route would retire a live row and insert a
 * successor because somebody clicked two checkboxes in the other order.
 *
 * Unknown values are kept rather than dropped, because dropping them here would mean
 * `validatePrompt` never sees the ninth category somebody tried to write and the save
 * would succeed with it silently discarded. It is the validator's job to refuse them.
 */
export function canonicalCategories(values: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const known: string[] = [];
  const unknown: string[] = [];
  for (const v of values ?? []) {
    const t = (v ?? "").trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    ((SIGNAL_CATEGORIES as readonly string[]).includes(t) ? known : unknown).push(t);
  }
  known.sort(
    (a, b) =>
      (SIGNAL_CATEGORIES as readonly string[]).indexOf(a) -
      (SIGNAL_CATEGORIES as readonly string[]).indexOf(b),
  );
  return [...known, ...unknown];
}

/** The three rhythms. A prompt with no cadence is drawn by nothing. */
export const CADENCES = ["micro_journal", "heartbeat", "synthesis_cycle"] as const;

/** Her 2:1 pools. Null is legitimate — heartbeat prompts belong to neither. */
export const LIBRARIES = ["approachable", "reflective"] as const;

/** Her three sections. */
export const AUDIENCE_SCOPES = ["universal", "adapted", "specific"] as const;

/** Preconditions, not flavours — see `opener.ts`. */
export const OPENER_POOLS = ["casual", "warm_return", "post_response"] as const;

export const EVIDENCE_TIERS = [1, 2, 3] as const;

/* ── What the editor edits ────────────────────────────────────────────── */

export type PromptDraft = {
  promptText: string;
  category: string | null;
  populationTags: readonly string[];
  promptCode: string | null;
  behavioralSignal: string | null;
  /** Zero or more of her eight, in her order — see `canonicalCategories`. */
  signalCategory: readonly string[];
  evidenceTier: number | null;
  audienceScope: string | null;
  cadence: string | null;
  deliveryMarker: string | null;
  library: string | null;
  eventSensitive: boolean;
};

export type OpenerDraft = {
  pool: string;
  text: string;
  placeholders: readonly string[];
};

export type Issue = {
  field: string;
  severity: "error" | "warning";
  message: string;
};

/** Longest prompt stored. Her longest is well under this; the cap is against paste accidents. */
export const MAX_PROMPT_CHARS = 2_000;
export const MAX_OPENER_CHARS = 400;

const inVocab = (v: string | null, vocab: readonly string[]) => v === null || vocab.includes(v);

/* ── Prompts ──────────────────────────────────────────────────────────── */

export function validatePrompt(draft: PromptDraft): Issue[] {
  const issues: Issue[] = [];
  const err = (field: string, message: string) =>
    issues.push({ field, severity: "error", message });
  const warn = (field: string, message: string) =>
    issues.push({ field, severity: "warning", message });

  const text = (draft.promptText ?? "").trim();
  if (!text) err("promptText", "A prompt with no text has nothing to ask.");
  if (text.length > MAX_PROMPT_CHARS) {
    err("promptText", `${text.length} characters; the limit is ${MAX_PROMPT_CHARS}.`);
  }

  /*
   * Prompt text is sent verbatim — it is not a template, and nothing interpolates it.
   * So a `[Name]` or `{{firstName}}` in a prompt arrives at the student as those exact
   * characters. Openers are the layer that carries placeholders; this is where somebody
   * reasonably assumes prompts do too.
   */
  const placeholderish = text.match(/\[[A-Za-z][\w ]{0,30}\]|\{\{\s*\w+\s*\}\}/g);
  if (placeholderish) {
    err(
      "promptText",
      `Prompt text is sent as written — nothing fills it in, so ${placeholderish[0]} ` +
        `would reach the student exactly like that. Placeholders belong in the opener.`,
    );
  }

  /*
   * Elementwise, and reported all at once. A prompt carries a set since 0041, and a
   * validator that stopped at the first bad element would make fixing three typos three
   * round trips.
   */
  const badCategories = (draft.signalCategory ?? []).filter(
    (c) => !(SIGNAL_CATEGORIES as readonly string[]).includes(c),
  );
  if (badCategories.length) {
    err(
      "signalCategory",
      `${badCategories.map((c) => `"${c}"`).join(", ")} ` +
        `${badCategories.length > 1 ? "are not" : "is not"} one of the eight: ` +
        `${SIGNAL_CATEGORIES.join(", ")}.`,
    );
  }
  if (!inVocab(draft.cadence, CADENCES as unknown as string[])) {
    err("cadence", `"${draft.cadence}" is not one of: ${CADENCES.join(", ")}.`);
  }
  if (!inVocab(draft.library, LIBRARIES as unknown as string[])) {
    err("library", `"${draft.library}" is not one of: ${LIBRARIES.join(", ")}.`);
  }
  if (!inVocab(draft.audienceScope, AUDIENCE_SCOPES as unknown as string[])) {
    err("audienceScope", `"${draft.audienceScope}" is not one of: ${AUDIENCE_SCOPES.join(", ")}.`);
  }
  if (
    draft.evidenceTier !== null &&
    !(EVIDENCE_TIERS as unknown as number[]).includes(draft.evidenceTier)
  ) {
    err("evidenceTier", `The tier must be 1, 2 or 3 — or empty until she assigns it.`);
  }

  /*
   * A tag outside the vocabulary intersects nothing, and an empty intersection is
   * indistinguishable from a prompt that legitimately does not apply to this student.
   * This is the same failure `parse-intake.ts` reports for cards, one table over.
   */
  const unknown = (draft.populationTags ?? []).filter(
    (t) => !(METHODOLOGY_POPULATIONS as unknown as string[]).includes(t),
  );
  if (unknown.length) {
    err(
      "populationTags",
      `${unknown.join(", ")} — no student ever resolves to that tag, so this prompt ` +
        `would match nobody. Known tags: ${METHODOLOGY_POPULATIONS.join(", ")}.`,
    );
  }

  if (draft.cadence === null) {
    warn(
      "cadence",
      "With no cadence this prompt is in no rhythm's pool, so it will never be selected. " +
        "Saving is allowed because the library's older rows are in this state.",
    );
  }

  if (draft.audienceScope === "universal" && (draft.populationTags ?? []).length) {
    warn(
      "populationTags",
      "Marked universal but carrying population tags — the tags win, and this reaches " +
        "only the tagged populations.",
    );
  }
  if (draft.audienceScope === "specific" && !(draft.populationTags ?? []).length) {
    warn(
      "populationTags",
      "Marked specific with no tags — an untagged prompt is universal, so this reaches " +
        "everyone.",
    );
  }

  if (draft.eventSensitive) {
    warn(
      "eventSensitive",
      "Event-sensitive prompts are only eligible once Wing knows the student mentioned " +
        "the event, which nothing currently supplies — so this will not be sent yet.",
    );
  }

  return issues;
}

/* ── Reachability ─────────────────────────────────────────────────────── */

/**
 * Every (status, pathway) combination a real student can be in, resolved to tags.
 *
 * Built from `populationTagsFor` rather than from `METHODOLOGY_POPULATIONS` directly,
 * because those are two different questions. The tag list is the vocabulary the
 * methodology writes on cards; this is what the platform can actually produce from the
 * data it holds. `entrepreneur_fundraising` is in the vocabulary; if no status and
 * pathway resolves to it, a prompt tagged only with it reaches nobody, and that is worth
 * being told at save time rather than discovering in a month of silence.
 */
export const STUDENT_SHAPES: ReadonlyArray<{
  status: ProfessionalStatus | null;
  pathway: Pathway | null;
  tags: readonly string[];
}> = (() => {
  const statuses: (ProfessionalStatus | null)[] = [
    null,
    "undergraduate_or_recent_grad",
    "early_career",
    "mid_career_or_senior",
    "career_break_or_transition",
  ];
  const pathways: (Pathway | null)[] = [null, "employment", "venture", "freelance"];
  const out: { status: ProfessionalStatus | null; pathway: Pathway | null; tags: string[] }[] = [];
  for (const status of statuses) {
    for (const pathway of pathways) {
      out.push({ status, pathway, tags: populationTagsFor(status, pathway) });
    }
  }
  return out;
})();

export type Reach = {
  /** True when at least one student shape, in this prompt's own cadence, could draw it. */
  reachable: boolean;
  /** Which (status, pathway) pairs could receive it, as readable labels. */
  audiences: string[];
  /** Stated when `reachable` is false. Always names the filter that emptied the pool. */
  why: string;
};

const label = (s: ProfessionalStatus | null, p: Pathway | null) =>
  `${s ?? "status unknown"} / ${p ?? "no pathway"}`;

/**
 * Whether this prompt can ever be selected, and by whom.
 *
 * Runs the real `eligible()` — the same function the send path calls — against a
 * one-candidate pool for each student shape. Not a reimplementation of its rules: a
 * second copy of the filter would agree with the first exactly until somebody changed
 * one, and then this screen would confidently report the old behaviour.
 *
 * The context is the most FAVOURABLE one: nothing sent recently, nothing sent today,
 * and every event known. So an unreachable verdict means unreachable under any
 * circumstances, not merely "not right now" — which is what makes it worth blocking on.
 */
export function reachability(draft: PromptDraft, active = true): Reach {
  if (!active) {
    return { reachable: false, audiences: [], why: "This prompt is retired." };
  }
  if (draft.cadence === null || !(CADENCES as unknown as string[]).includes(draft.cadence)) {
    return {
      reachable: false,
      audiences: [],
      why:
        "No cadence. Selection asks for one rhythm at a time and compares it to this " +
        "field, so a prompt outside all three is never in any pool.",
    };
  }

  const candidate: Candidate = {
    id: 1,
    active: true,
    populationTags: draft.populationTags ?? [],
    cadence: draft.cadence,
    library: draft.library,
    signalCategory: draft.signalCategory ?? [],
    eventSensitive: draft.eventSensitive,
  };

  const audiences: string[] = [];
  for (const shape of STUDENT_SHAPES) {
    const ctx: SelectionContext = {
      studentTags: shape.tags,
      cadence: draft.cadence as SelectionContext["cadence"],
      recentPromptIds: [],
      recentCategories: [],
      sentToday: false,
      /*
       * A non-empty list, so event-sensitivity is tested as "could this ever be sent"
       * rather than "would it be sent to a student Wing knows nothing about". The
       * validator warns separately that nothing populates this yet.
       */
      knownEvents: ["any"],
    };
    if (eligible([candidate], ctx).length) audiences.push(label(shape.status, shape.pathway));
  }

  if (!audiences.length) {
    return {
      reachable: false,
      audiences: [],
      why:
        `No student shape matches ${JSON.stringify(draft.populationTags ?? [])}. ` +
        `Population tags intersect the tags a student resolves to, and nothing resolves ` +
        `to these.`,
    };
  }

  return {
    reachable: true,
    audiences,
    why: `${audiences.length} of ${STUDENT_SHAPES.length} student shapes can receive it.`,
  };
}

/* ── Openers ──────────────────────────────────────────────────────────── */

/** Every `[Token]` the text actually contains, in order, deduplicated. */
export function placeholdersIn(text: string): string[] {
  const out: string[] = [];
  const RE = /\[([A-Za-z][\w ]{0,30})\]/g;
  for (let m = RE.exec(text ?? ""); m !== null; m = RE.exec(text ?? "")) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/**
 * An opener is well-formed when its declared placeholders are exactly the ones in its
 * text.
 *
 * ── AND BOTH DIRECTIONS ARE REAL BUGS, IN OPPOSITE WAYS ──────────────────
 * `renderOpener` filters on `fillable`, which reads the DECLARED list, and then
 * substitutes against the text. So the two lists disagreeing produces:
 *
 *   declared but absent   the opener is filtered out whenever that value is missing,
 *                         for a placeholder it does not have. It quietly stops being
 *                         drawn and the pool shrinks by one with nothing said.
 *
 *   present but undeclared  `fillable` returns true, the opener is chosen, `fill` has
 *                         no value for the token, and a student receives a message
 *                         reading "remember what you told me about [topic]?".
 *
 * The second is the one that reaches a person, so both are errors.
 */
export function validateOpener(draft: OpenerDraft): Issue[] {
  const issues: Issue[] = [];
  const err = (field: string, message: string) =>
    issues.push({ field, severity: "error", message });
  const warn = (field: string, message: string) =>
    issues.push({ field, severity: "warning", message });

  const text = (draft.text ?? "").trim();
  if (!text) err("text", "An opener with no text is not a greeting.");
  if (text.length > MAX_OPENER_CHARS) {
    err("text", `${text.length} characters; the limit is ${MAX_OPENER_CHARS}.`);
  }
  if (!(OPENER_POOLS as unknown as string[]).includes(draft.pool)) {
    err("pool", `"${draft.pool}" is not one of: ${OPENER_POOLS.join(", ")}.`);
  }

  const found = placeholdersIn(text);
  const declared = Array.from(new Set(draft.placeholders ?? []));

  const undeclared = found.filter((p) => !declared.includes(p));
  if (undeclared.length) {
    err(
      "placeholders",
      `The text contains [${undeclared.join("], [")}] but does not declare ` +
        `${undeclared.length > 1 ? "them" : "it"}. The renderer only checks declared ` +
        `placeholders, so this opener would be sent with the brackets still in it.`,
    );
  }

  const absent = declared.filter((p) => !found.includes(p));
  if (absent.length) {
    err(
      "placeholders",
      `[${absent.join("], [")}] ${absent.length > 1 ? "are" : "is"} declared but not in ` +
        `the text. The renderer would skip this opener whenever that value is missing, ` +
        `for a placeholder it does not use.`,
    );
  }

  /*
   * Every one of her fourteen openers uses the student's name, and the opener REPLACES
   * the greeting rather than sitting above one. An opener with no name reads as an
   * abrupt start rather than a greeting — worth flagging, not worth refusing.
   */
  if (!found.includes("Name")) {
    warn(
      "text",
      "No [Name]. The opener replaces the greeting rather than following one, so this " +
        "prompt would begin without addressing the student.",
    );
  }

  return issues;
}

/** Convenience for the routes: does anything here refuse the save? */
export const blocking = (issues: readonly Issue[]) => issues.some((i) => i.severity === "error");
