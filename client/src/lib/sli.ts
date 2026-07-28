/**
 * Wing SLI helpers.
 *
 * The API returns one row per SLI — candidate, custom, refined or refresh —
 * each with a status, rather than the MVP's single row of
 * title1/statement1/…/selectedSliIndex/refinedSliText.
 *
 * These helpers keep the "which SLI is in force?" question in one place so the
 * pages don't each re-derive it.
 */

export type SliRecord = {
  id: number;
  title: string;
  statement: string;
  rationale: string | null;
  implementationGuidance: string | null;
  source: "generated" | "custom" | "refined" | "refresh";
  status: "candidate" | "selected" | "active" | "superseded";
  parentSliId: number | null;
  refinementCount: number;
  createdAt: string;
};

/** The SLI currently in force: prefers `active`, falls back to `selected`. */
export function getActiveSli(slis: unknown): SliRecord | null {
  if (!Array.isArray(slis)) return null;
  const rows = slis as SliRecord[];
  return (
    rows.find((s) => s?.status === "active") ??
    rows.find((s) => s?.status === "selected") ??
    null
  );
}

/** Plain text of the SLI in force, or null. */
export function getSliStatement(slis: unknown): string | null {
  return getActiveSli(slis)?.statement ?? null;
}

/** True once the student has chosen an SLI (as opposed to only candidates). */
export function hasSelectedSli(slis: unknown): boolean {
  return getActiveSli(slis) !== null;
}

/** True when the SLI in force came from a refinement pass. */
export function hasRefinedSli(slis: unknown): boolean {
  const active = getActiveSli(slis);
  return active?.source === "refined" || (active?.refinementCount ?? 0) > 0;
}

/** Generated options still awaiting a choice. */
export function getCandidates(slis: unknown): SliRecord[] {
  if (!Array.isArray(slis)) return [];
  return (slis as SliRecord[]).filter((s) => s?.status === "candidate");
}
