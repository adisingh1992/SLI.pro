/**
 * Reconciling a model's rewritten positioning claims with the ones it was given.
 *
 * Pure — the only import is the checker.
 *
 * ── WHY THIS IS ITS OWN MODULE, AND WHY IT TAKES STRINGS ─────────────────
 * The portfolio's attribution guard is the one its own comment calls the one
 * that matters most: an item whose evidence cannot be traced to a real turn is
 * dropped rather than saved. A rewrite pass is where that guard is easiest to
 * walk around — the model is handed claims and asked for claims back, and a
 * reconciler holding the full accepted record could read a `turnId` out of the
 * response and re-attribute an item during what is advertised as a wording fix.
 *
 * So this takes `readonly string[]` and returns `string[]`. Not as a convention:
 * it cannot re-attribute anything, because it has never been told what any claim
 * is attributed to. The guarantee is in the signature rather than in a reviewer
 * remembering to look.
 *
 * The same reason it lives outside `evidence-portfolio.ts`, which opens a
 * database connection at import and so can only ever be scanned, not run.
 */
import { checkAuthenticity, type Finding } from "./authenticity";

/** A claim that tripped the standard, and what tripped it. */
export type FlaggedClaim = {
  /** Position in the array the caller passed. This is the only handle the model gets. */
  index: number;
  findings: Finding[];
};

/** Longest claim stored, matching the column's own truncation in the portfolio. */
export const MAX_CLAIM = 1000;

/**
 * Which claims break the standard.
 *
 * Counted findings, never `report.passes`. At the length of one sentence a
 * single banned word scores 88 and passes — see `SHORT_TEXT_RULES`, which is the
 * list of rules that can fire on a sentence at all.
 */
export function flagClaims(claims: readonly string[]): FlaggedClaim[] {
  const flagged: FlaggedClaim[] = [];
  claims.forEach((claim, index) => {
    const findings = checkAuthenticity(claim).findings;
    if (findings.length > 0) flagged.push({ index, findings });
  });
  return flagged;
}

/** The flagged claims, with their findings, as the model is shown them. */
export function renderFlagged(claims: readonly string[], flagged: readonly FlaggedClaim[]): string {
  return flagged
    .map(
      (f) =>
        `[${f.index}] ${claims[f.index]}\n` +
        f.findings.map((x) => `      "${x.found}" — ${x.note}`).join("\n"),
    )
    .join("\n\n");
}

export type RewriteOutcome = {
  claims: string[];
  rewritten: number;
};

/**
 * Applies the model's rewrites, and refuses the ones that are not improvements.
 *
 * Three refusals, each for a failure seen in the equivalent LinkedIn path or
 * anticipated from it:
 *
 *   an index nobody flagged   a clean claim is not up for revision, and an index
 *                             the model invented is not a claim at all
 *   an empty rewrite          silence is not a fix
 *   no fewer findings         a rewrite that scores the same or worse is a
 *                             regression, and taking it would make the check
 *                             actively harmful
 *
 * Everything else is returned exactly as it came in. A claim that could not be
 * cleaned survives with its wording intact rather than being dropped — dropping
 * would spend a student's real, attributable evidence to punish a word choice,
 * and the reader is shown the findings either way.
 */
export function applyRewrites(
  claims: readonly string[],
  flagged: readonly FlaggedClaim[],
  raw: unknown,
): RewriteOutcome {
  const out = [...claims];
  let rewritten = 0;

  /*
   * The map is keyed only on indices this pass flagged, so it is both the
   * lookup and the permission. An index outside it never reaches `out`.
   */
  const permitted = new Map(flagged.map((f) => [f.index, f.findings.length]));

  for (const row of Array.isArray(raw) ? raw : []) {
    const item = row as Record<string, unknown>;
    const index = Number(item.index);

    const before = permitted.get(index);
    if (before === undefined) continue;

    const claim = String(item.positioningClaim ?? "").trim();
    if (!claim) continue;

    const after = checkAuthenticity(claim).findings.length;
    if (after >= before) continue;

    out[index] = claim.slice(0, MAX_CLAIM);
    rewritten++;
    /*
     * Spent. The model returning the same index twice must not be able to
     * overwrite an accepted rewrite with a second, worse one — `before` would
     * still be the ORIGINAL count, so a rewrite dirtier than the one already
     * taken would compare favourably against it and replace it.
     */
    permitted.delete(index);
  }

  return { claims: out, rewritten };
}
