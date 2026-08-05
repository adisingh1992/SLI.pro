/**
 * Card codes — stable identifiers for heuristic cards. Pure, zero imports.
 *
 * Objectives reference interventions by code, so a code must survive the card
 * being renamed. Names change the moment the methodology owner rewords a card
 * in the editor; a reference keyed on the name breaks silently and renders as
 * nothing, which is the failure mode this whole redesign exists to eliminate.
 */

/**
 * Derives a code from a card name.
 *
 * Only used to propose a code for a NEW card, and to backfill existing ones.
 * Once assigned, a code is never recomputed — that is the entire point. If it
 * were derived on read, renaming a card would silently repoint every objective
 * that referenced it.
 */
export function codeFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return slug || "card";
}

/**
 * Makes a proposed code unique against codes already in use.
 *
 * Suffixes -2, -3 rather than appending a database id, so the code stays
 * readable in an objective definition a human has to review.
 */
export function uniqueCode(proposed: string, taken: ReadonlySet<string>): string {
  if (!taken.has(proposed)) return proposed;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${proposed}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`Cannot allocate a unique card code from "${proposed}"`);
}

/** Suffix separating a population-specific card from its shared base code. */
export const POPULATION_SUFFIX = "__";

/**
 * Resolves the card an objective's intervention refers to.
 *
 * Objectives name a plain code — `multi_function_challenge`. The same beat is
 * usually phrased differently per population, so most cards exist as
 * `multi_function_challenge__mid_career_or_senior`. Rather than force every
 * objective to spell out the suffix (verbose, and easy to get wrong in a way
 * that renders as nothing), resolution prefers the population-specific card and
 * falls back to a shared one.
 *
 * Returns null when neither exists, so the caller can report it. A missing card
 * must never resolve to empty text — that is how an objective silently loses
 * its interventions.
 */
export function resolveCardCode(
  code: string,
  population: string,
  available: ReadonlySet<string>,
): string | null {
  const specific = `${code}${POPULATION_SUFFIX}${population}`;
  if (available.has(specific)) return specific;
  if (available.has(code)) return code;
  return null;
}
