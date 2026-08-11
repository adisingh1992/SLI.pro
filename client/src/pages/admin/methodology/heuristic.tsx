import { Badge } from "@/components/ui/badge";

/**
 * The heuristic card type and its status badge.
 *
 * Lifted out of the cards page because three screens use them and importing a
 * shared type from whichever page happened to declare it first is how a page
 * becomes impossible to delete.
 */

export type Heuristic = {
  id: number;
  name: string;
  description: string;
  status: "candidate" | "validated" | "retired";
  populationTags: string[];
  versionNumber: number;
  modifiedAt: string;
};

/**
 * ── "CANDIDATE" DOES NOT MEAN "DRAFT" ────────────────────────────────────
 * A candidate card in an active sequence fires at students exactly like a
 * validated one. The amber is a note about confidence in the card's coaching
 * value, not a claim that it is inert — and the cards screen says so in a
 * banner, because that misreading would be expensive.
 */
export function StatusBadge({ status }: { status: Heuristic["status"] }) {
  const variants: Record<Heuristic["status"], { className: string; label: string }> = {
    candidate: {
      className: "bg-warn-soft text-warn hover:bg-warn-soft",
      label: "Candidate",
    },
    validated: {
      className: "bg-good-soft text-good hover:bg-good-soft",
      label: "Validated",
    },
    retired: {
      className: "bg-muted text-muted-foreground hover:bg-muted",
      label: "Retired",
    },
  };
  const v = variants[status];
  return <Badge className={v.className}>{v.label}</Badge>;
}
