/**
 * Who owns which universal gate numbers — her allocation rule of 25 August.
 *
 * Pure. No imports, no database.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────
 * The Module 11 universal trio has been renumbered three times in eight days. IG-U03–05
 * became IG-U006–008 on the morning of 18 August, IG-U012–014 the same afternoon when her
 * research-derived gates claimed IG-U006–011, and IG-U018–020 on 25 August when the
 * platform-wide gates published on the 19th turned out to claim IG-U012–014 as well.
 *
 * The second collision was the same mistake as the first, found the same way: by someone
 * reading two documents side by side and noticing. Her fix is an allocation rule, and
 * hers ends with the sentence that matters — "I own all numbering."
 *
 * So this is not a policy we invented. It is her rule, written down where a test can read
 * it, so the fourth collision fails a build instead of being discovered in a database.
 *
 * ── WHAT A VIOLATION ACTUALLY COSTS ──────────────────────────────────────
 * Not a clash of labels. The second move exposed the real failure: a row renamed once no
 * longer answers to the code the document shows, so a correction keyed on the old code
 * finds nothing and reports "not seeded, nothing to rename" — a clean run, and a database
 * quietly disagreeing with the parser. Numbering collisions here are silent.
 */

export type BandOwner =
  | "research_derived_universal"
  | "platform_wide"
  | "module_11"
  | "unallocated";

export type Band = {
  from: number;
  to: number;
  owner: BandOwner;
  /** Her words for what lives here. */
  what: string;
};

/**
 * Her blocks, verbatim from the 25 August ruling:
 *
 *   "IG-U006–011 reserved for universal research-derived gates. IG-U012–017 for
 *   platform-wide gates (Reveal-promoted + new). IG-U018–020 for Module 11. Future
 *   universal gates start at IG-U021. I own all numbering."
 *
 * IG-U001–005 are deliberately absent. They are the pre-renumbering codes — IG-U03, U04
 * and U05 were the Module 11 trio's original numbers and are retired rather than
 * reassigned, which is the same treatment H-014 and H-021 got.
 */
export const BANDS: readonly Band[] = [
  {
    from: 6,
    to: 11,
    owner: "research_derived_universal",
    what: "universal research-derived gates",
  },
  {
    from: 12,
    to: 17,
    owner: "platform_wide",
    what: "platform-wide gates, Reveal-promoted and new",
  },
  { from: 18, to: 20, owner: "module_11", what: "Module 11" },
];

/** "Future universal gates start at IG-U021." */
export const NEXT_FREE = 21;

/** Retired, not reassigned. The trio's original numbers. */
export const RETIRED: readonly string[] = ["IG-U03", "IG-U04", "IG-U05"];

const CODE = /^IG-U0*(\d{1,3})$/;

/** The number in an IG-U code, or null if it is not one. */
export function numberOf(code: string): number | null {
  const m = code.trim().match(CODE);
  return m ? parseInt(m[1], 10) : null;
}

export function bandFor(code: string): Band | null {
  const n = numberOf(code);
  if (n === null) return null;
  for (const b of BANDS) if (n >= b.from && n <= b.to) return b;
  return null;
}

export type Violation = {
  code: string;
  problem: string;
};

/**
 * Codes that sit outside their owner's block, or in no block at all.
 *
 * `assignments` maps a code to who is using it. A code used by two owners is the case
 * this exists for, and it shows up as a violation against whichever of them does not own
 * the band.
 */
export function allocationViolations(
  assignments: ReadonlyArray<{ code: string; owner: BandOwner }>,
): Violation[] {
  const out: Violation[] = [];
  const seen = new Map<string, BandOwner>();

  for (const a of assignments) {
    const n = numberOf(a.code);
    if (n === null) continue; // not an IG-U code; nothing here governs it

    const prior = seen.get(a.code);
    if (prior !== undefined && prior !== a.owner) {
      out.push({
        code: a.code,
        problem: `claimed by both ${prior} and ${a.owner} — this is the collision that has now happened twice`,
      });
    }
    seen.set(a.code, a.owner);

    const band = bandFor(a.code);
    if (!band) {
      out.push({
        code: a.code,
        problem:
          n >= NEXT_FREE
            ? `above the allocated range; future gates start at IG-U0${NEXT_FREE} and she assigns them`
            : "below IG-U006, where the retired pre-renumbering codes live",
      });
      continue;
    }
    if (band.owner !== a.owner) {
      out.push({
        code: a.code,
        problem: `used by ${a.owner} but IG-U0${band.from} to IG-U0${band.to} belongs to ${band.owner} (${band.what})`,
      });
    }
  }

  return out;
}

/** Whether the blocks tile without overlap or gap, which is a property of her rule. */
export function bandsAreCoherent(): { ok: boolean; why: string } {
  for (let i = 1; i < BANDS.length; i++) {
    const prev = BANDS[i - 1];
    const b = BANDS[i];
    if (b.from !== prev.to + 1) {
      return { ok: false, why: `gap or overlap between IG-U0${prev.to} and IG-U0${b.from}` };
    }
  }
  const last = BANDS[BANDS.length - 1];
  if (last.to + 1 !== NEXT_FREE) {
    return { ok: false, why: `NEXT_FREE is ${NEXT_FREE} but the last block ends at ${last.to}` };
  }
  return { ok: true, why: `IG-U0${BANDS[0].from} to IG-U0${last.to}, then ${NEXT_FREE}` };
}
