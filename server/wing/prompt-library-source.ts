/**
 * Her prompt library, as rows.
 *
 * Pure. Turns `ParsedPrompt`s into what `wing.prompt_library` holds, and decides nothing
 * that her documents do not state.
 *
 * ── WHAT THE DOCUMENTS ACTUALLY SUPPLY ───────────────────────────────────
 * Two files, and they are not the same shape:
 *
 *   `wing-approachable-microjournal-library.md` — 220 prompts in three sections, every
 *   one carrying a `*Signal:*` line. No delivery markers: her Event Sensitivity Rule sits
 *   in the preamble and the prompts were written to comply with it, so none of the 220
 *   names a conference, an interview or a career fair. That is a finding, not an absence.
 *
 *   `wing-heartbeat-and-population-prompts.md` — 48 heartbeat prompts (8 per track ×
 *   6 tracks) with no signals, and 27 new-population prompts that carry BOTH a signal and
 *   an inline delivery marker. Those markers are the only statement anywhere of which
 *   prompts are event-sensitive and which belong to a monthly rhythm.
 *
 * ── THE THREE THINGS THIS FILE REFUSES TO DECIDE ─────────────────────────
 * 1. `signalCategory`. Her eight categories govern Gate 2, and not one prompt carries one.
 *    The `*Signal:*` lines are analysis ("tacit knowledge. Intuitive expertise that exists
 *    beyond explicit instruction.") and the block headings mix theme with style — "The
 *    Playful Ones" is not one of her eight. Every row is seeded with the empty set — the
 *    column has held a set since 0041, and empty is how it spells "none assigned".
 *
 * 2. `evidenceTier`. Proposed by `wing:tag-prompts` for her to correct, and null until she
 *    does, exactly as in `prompt_log`.
 *
 * 3. Anything her marker does not say. `reveal-trigger` and `monthly calibration` are
 *    delivery modes, not cadences, so they get a null cadence and keep their marker
 *    verbatim rather than being pushed into the nearest-looking rhythm.
 */
import type { ParsedPrompt } from "./prompt-tiers";

/** The three rhythms her documents name. Anything else keeps its marker and no cadence. */
export type Cadence = "micro_journal" | "heartbeat" | "synthesis_cycle";

/** Her three sections in the micro-journal library. */
export type AudienceScope = "universal" | "adapted" | "specific";

/** Her rotation weighting is "roughly 2:1 approachable-to-serious in any given week". */
export type LibraryPool = "approachable" | "reflective";

export type PromptRow = {
  promptCode: string;
  promptText: string;
  behavioralSignal: string | null;
  /** Always empty on seed. Hers to assign — see above. */
  signalCategory: readonly never[];
  /** Always null on seed. Proposed separately for her review. */
  evidenceTier: null;
  audienceScope: AudienceScope | null;
  cadence: Cadence | null;
  library: LibraryPool | null;
  eventSensitive: boolean;
  populationTags: string[];
  /** Her marker, verbatim, so a reviewer can check the derivation against the document. */
  deliveryMarker: string | null;
  sourceDocument: string;
  sourceBlock: string;
  sourceLine: number;
};

/**
 * The audience each of her headings names.
 *
 * Keyed on the heading text she wrote, not on a fuzzy match, because a heading that stops
 * matching should surface as an unmapped row rather than quietly resolve to the wrong
 * population. The values are the platform's tags — the ones `population-tags.ts` resolves
 * a real student to — so a mapping error here is a prompt sent to the wrong person.
 *
 * ── THE FOUNDER STAGES ARE TAGGED, AND CANNOT BE TARGETED ────────────────
 * Her Sections 2 and 3 separate Early Stage, Fundraising and Scaling, so the rows carry
 * `entrepreneur_early` / `entrepreneur_fundraising` / `entrepreneur_scaling` — the tags
 * her headings name.
 *
 * Today that buys nothing, and the reason is worth stating rather than discovering.
 * `populationTagsFor` derives tags from (status, pathway), and BOTH `venture` and
 * `freelance` emit all four entrepreneur tags at once, because a pathway does not know a
 * stage. So every founder matches every founder prompt: a seed-stage founder is eligible
 * for "What's one thing an investor pushed back on this week?" and a fundraising founder
 * for the scaling set.
 *
 * The precise tags go in anyway. They are what her document says, they cost nothing, and
 * the day something captures founder stage they start discriminating without a re-seed.
 * What is missing is the capture, not the tag — and that is a question for her, not a
 * mapping to fudge here.
 *
 * A first draft collapsed all three to `entrepreneur` on the belief that the sub-tags were
 * unmapped. They are not: `parse-compendium` records that the sub-tags are absent from the
 * COMPENDIUM's cards, which is a different statement about a different corpus.
 */
const AUDIENCE: Readonly<Record<string, readonly string[]>> = {
  // Micro-journal, Sections 2 and 3 (### blocks)
  "Undergraduate (10)": ["undergraduate"],
  "Early Career (10)": ["early_career"],
  "Mid-Career (10)": ["mid_career"],
  "Executive (10)": ["executive"],
  "Entrepreneur — Early Stage (10)": ["entrepreneur_early"],
  "Entrepreneur — Fundraising (10)": ["entrepreneur_fundraising"],
  "Entrepreneur — Scaling (10)": ["entrepreneur_scaling"],
  "Undergraduate-Only (15)": ["undergraduate"],
  "Early Career-Only (15)": ["early_career"],
  "Mid-Career-Only (15)": ["mid_career"],
  "Executive-Only (15)": ["executive"],
  "Entrepreneur (Fundraising)-Only (10)": ["entrepreneur_fundraising"],
  "Entrepreneur (Scaling)-Only (10)": ["entrepreneur_scaling"],

  // Heartbeat file, Sections 4 and 5 (## sections)
  Undergraduate: ["undergraduate"],
  "Early Career": ["early_career"],
  "Mid-Career": ["mid_career"],
  Executive: ["executive"],
  Entrepreneur: ["entrepreneur"],
  "Career Returner": ["career_returner"],
  "Entrepreneur (Fundraising) — 10 prompts": ["entrepreneur_fundraising"],
  "Entrepreneur (Scaling) — 10 prompts": ["entrepreneur_scaling"],
  "Executive — 8 prompts": ["executive"],
};

/** Which of her three sections a micro-journal prompt sits in. */
export function audienceScopeOf(p: ParsedPrompt): AudienceScope | null {
  if (p.section.indexOf("SECTION 1") === 0) return "universal";
  if (p.section.indexOf("SECTION 2") === 0) return "adapted";
  if (p.section.indexOf("SECTION 3") === 0) return "specific";
  return null;
}

/**
 * Cadence and event-sensitivity, read off her marker.
 *
 * The marker is prose she wrote by hand, so it varies — `heartbeat`, `heartbeat —
 * requires event-sensitivity flag`, `heartbeat — paired with "no one sees this but you"
 * framing`. The rule is therefore what the marker STARTS with plus whether it mentions
 * the flag, rather than an exact-match table that four of her seven wordings would miss.
 *
 * `reveal-trigger` and `monthly calibration` return a null cadence on purpose: they are
 * delivery modes, and her Section 5 preamble only assigns rhythms to the other two.
 */
export function fromMarker(marker: string | null): { cadence: Cadence | null; eventSensitive: boolean } {
  if (!marker) return { cadence: null, eventSensitive: false };
  const m = marker.toLowerCase();
  const eventSensitive = m.indexOf("event-sensitivity") >= 0;

  if (m.indexOf("heartbeat") === 0) return { cadence: "heartbeat", eventSensitive };
  if (m.indexOf("synthesis-cycle") === 0) return { cadence: "synthesis_cycle", eventSensitive };
  return { cadence: null, eventSensitive };
}

/**
 * The block a row is filed under, and the half of its identity that makes the code unique.
 *
 * Her heartbeat prompts are numbered 1 to 8 within each track, so the id repeats six
 * times over. The micro-journal library puts its audience at `###` and the heartbeat file
 * puts it at `##`, so neither field alone is the answer — `block || section` is.
 */
export function blockOf(p: ParsedPrompt): string {
  return p.block || p.section || p.h1;
}

/**
 * One row per prompt.
 *
 * `document` is the filename, kept so a re-seed diffs against the file rather than
 * against memory, and so the two libraries can be told apart in a query.
 */
export function toRow(p: ParsedPrompt, document: string): PromptRow {
  const block = blockOf(p);
  const scope = audienceScopeOf(p);
  const marker = fromMarker(p.deliveryMarker);

  const isMicroJournal = scope !== null;
  const tags = AUDIENCE[block] ?? [];

  return {
    promptCode: p.id,
    promptText: p.text,
    behavioralSignal: p.signal,
    signalCategory: [],
    evidenceTier: null,
    audienceScope: scope,
    /*
     * A micro-journal prompt has no marker and takes the library's own cadence. Everything
     * in the heartbeat file takes its cadence from its marker, and Section 4 has none —
     * so Section 4 falls back to `heartbeat`, which is what its own h1 heading says it is.
     */
    cadence: isMicroJournal
      ? "micro_journal"
      : (marker.cadence ?? (p.h1.indexOf("SECTION 4") === 0 ? "heartbeat" : null)),
    /*
     * Only the micro-journal library is the "approachable" pool her 2:1 weighting names.
     * The heartbeat prompts are a different rhythm, not the other side of that ratio, so
     * they take no pool rather than being guessed into one.
     */
    library: isMicroJournal ? "approachable" : null,
    eventSensitive: marker.eventSensitive,
    /*
     * Section 1 is universal by her own heading — "Work for all 7 audiences" — and its
     * nine blocks are simply absent from AUDIENCE, so they resolve to no tags and reach
     * everyone.
     *
     * A `UNIVERSAL_BLOCKS.has(block) ? [] : tags` guard stood here and was removed: a
     * mutation deleting it changed nothing, because those blocks were never in the table
     * to begin with. A redundant guard is worse than none — a mutation test cannot tell it
     * from its absence, so it reads as a protection that is not there.
     */
    populationTags: [...tags],
    deliveryMarker: p.deliveryMarker,
    sourceDocument: document,
    sourceBlock: block,
    sourceLine: p.line,
  };
}

/**
 * Rows that need a person before they are seeded.
 *
 * A prompt whose block resolves to no audience is not a row to write with an empty tag
 * list: an untagged prompt is UNIVERSAL by `population-tags.ts`'s fail-open rule, so a
 * heading this file failed to recognise would silently broadcast an executive-only prompt
 * to undergraduates. Reported instead.
 */
export function unmappedBlocks(rows: readonly PromptRow[]): string[] {
  const bad = new Set<string>();
  for (const r of rows) {
    if (r.audienceScope === "universal") continue;
    if (!r.populationTags.length) bad.add(r.sourceBlock);
  }
  /* Array.from, not spread: tsconfig sets no `target`, so it defaults to ES5 and
     spreading a Set is TS2802 — the same trap population-tags.ts already carries a note
     about. */
  return Array.from(bad).sort();
}


/* ── The opener pool ──────────────────────────────────────────────────────── */

/** Her three pools, from the "Universal Openers" section. */
export type OpenerPool = "casual" | "warm_return" | "post_response";

export type OpenerRow = {
  pool: OpenerPool;
  text: string;
  /** Every `[Placeholder]` her line interpolates, in order of appearance. */
  placeholders: string[];
  sourceLine: number;
};

/**
 * Her pool headings, keyed on the words that identify them rather than on the whole line.
 *
 * The headings carry their own conditions — "Warm-return openers (for users who haven't
 * responded in 5+ days)", "Post-response openers (when Wing is following up on a theme)" —
 * so an exact match would break the moment she reworded a parenthetical. The distinguishing
 * word is what is matched.
 */
const OPENER_POOLS: ReadonlyArray<[RegExp, OpenerPool]> = [
  [/warm-return/i, "warm_return"],
  [/post-response/i, "post_response"],
  [/casual/i, "casual"],
];

const OPENER_HEADING = /^\*\*(.+?)\*\*:?\s*$/;
/** Her bullet is a WHITE CIRCLE, not a dash. */
const OPENER_LINE = /^○\s*["“](.+?)["”]\s*$/;
const PLACEHOLDER = /\[([^\]]+)\]/g;

/**
 * The opener pool, from the micro-journal library's own section.
 *
 * Stops at the first `##` after the openers, because the prompt sections below use the same
 * quoted form and would otherwise be read as openers. Her openers are the only `○ "…"`
 * lines in the file, but relying on that would make the parse depend on a bullet character
 * rather than on where she put the section.
 */
export function parseOpeners(text: string): OpenerRow[] {
  const lines = text.split("\n");
  const out: OpenerRow[] = [];
  let pool: OpenerPool | null = null;
  let inSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.indexOf("## ") === 0) {
      if (/universal openers/i.test(line)) {
        inSection = true;
        pool = null;
        continue;
      }
      if (inSection) break;
      continue;
    }
    if (!inSection) continue;

    const h = line.match(OPENER_HEADING);
    if (h) {
      const found = OPENER_POOLS.find(([re]) => re.test(h[1]));
      /*
       * An unrecognised bold heading CLEARS the pool rather than leaving the previous one
       * in place. A new pool she adds would otherwise have its openers filed under
       * whichever pool happened to precede it — the failure that reads as working.
       */
      pool = found ? found[1] : null;
      continue;
    }

    const m = line.match(OPENER_LINE);
    if (!m || !pool) continue;

    const body = m[1];
    const placeholders: string[] = [];
    PLACEHOLDER.lastIndex = 0;
    for (let g = PLACEHOLDER.exec(body); g; g = PLACEHOLDER.exec(body)) placeholders.push(g[1]);

    out.push({ pool, text: body, placeholders, sourceLine: i + 1 });
  }

  return out;
}

/**
 * Openers under a heading this file did not recognise.
 *
 * Reported rather than dropped, for the same reason as `unmappedBlocks`: a pool she adds
 * should surface as a decision, not vanish. Counted by comparing what the section holds
 * against what was filed.
 */
export function unpooledOpeners(text: string): number {
  const lines = text.split("\n");
  let inSection = false;
  let total = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.indexOf("## ") === 0) {
      if (/universal openers/i.test(line)) { inSection = true; continue; }
      if (inSection) break;
      continue;
    }
    if (inSection && OPENER_LINE.test(line)) total++;
  }
  return total - parseOpeners(lines.join("\n")).length;
}
