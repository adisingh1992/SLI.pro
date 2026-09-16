import { Badge } from "@/components/ui/badge";

/**
 * The heuristic card type and its status badge.
 *
 * Lifted out of the cards page because three screens use them and importing a
 * shared type from whichever page happened to declare it first is how a page
 * becomes impossible to delete.
 */

export type AdvisoryKind = "code_enforced" | "text_unavailable" | "retired" | "reserved";

/**
 * What the panel must say before anyone edits this card.
 *
 * Computed by the server from the declared registries — the safety constants,
 * the known-absent list, the retired and reserved tables — and never from the
 * card's notes, which are editable. A warning a user can delete by tidying a
 * text field is not a warning.
 */
export type Advisory = {
  kind: AdvisoryKind;
  title: string;
  body: string;
};

export type Heuristic = {
  id: number;
  name: string;
  description: string;
  status: "candidate" | "validated" | "retired";
  populationTags: string[];
  versionNumber: number;
  modifiedAt: string;
  /** The methodology's own identifier — "H-309". Present on v2 cards. */
  cardCode?: string;
  /** v2 (migration 0019). Absent on cards created before it. */
  cardKind?: "coaching_card" | "integrity_gate" | "exercise";
  interventionType?:
    | "COACH" | "CHALLENGE" | "REDIRECT" | "REFRAME" | "AFFIRM" | "META" | "GATE"
    // Intake brought ELICIT and OBSERVE (migration 0022); Module 13 and the
    // Reveal Cycle brought EDUCATE and SAFETY_OVERRIDE (migration 0049).
    | "ELICIT" | "OBSERVE" | "EDUCATE" | "SAFETY_OVERRIDE"
    | null;
  /** Derived from the code by the server. Never stored. */
  module?: string;
  advisory?: Advisory | null;
  /** How many of the six specification components are present. List only. */
  specComponentCount?: number;
};

/** The six components that make a card's specification. */
export const SPEC_COMPONENT_TOTAL = 6;

/** Module identifiers in the order a student meets them, for grouping. */
export const MODULE_ORDER = [
  "universal", "safety", "voice", "intake",
  "foundation_1", "foundation_2", "foundation_3",
  "module_4", "module_5", "module_6", "image_generation", "module_7",
  "module_8", "module_9", "module_10", "module_11", "module_13",
  "reveal_cycle", "ux", "micro_journaling", "unknown",
];

export function moduleLabel(module: string | undefined): string {
  if (!module) return "Unfiled";
  const named: Record<string, string> = {
    universal: "Universal",
    safety: "Safety gates",
    voice: "Voice & tone",
    intake: "Intake",
    foundation_1: "Foundation 1 — Functional Identity",
    foundation_2: "Foundation 2 — Credibility",
    foundation_3: "Foundation 3 — Story Development",
    module_4: "Module 4 — Career Exploration",
    module_5: "Module 5 — JD Analysis",
    module_6: "Module 6 — Writing Coach",
    image_generation: "Image generation",
    module_7: "Module 7 — Wing Radar",
    module_8: "Module 8 — Competency Intelligence",
    module_9: "Module 9 — Power & Influence",
    module_10: "Module 10 — Interview Prep",
    module_11: "Module 11 — Network Intelligence",
    module_13: "Module 13 — AI-Mediated Market",
    reveal_cycle: "Reveal Cycle",
    ux: "UX gates",
    micro_journaling: "Micro-journaling gates",
    unknown: "Unfiled",
  };
  return named[module] ?? module.replace(/_/g, " ");
}

/**
 * What the completeness column says, and why it is never a bare number.
 *
 * 84 of the 325 cards are compendium gates whose document gives them a title
 * and a component table and no description; 12 are rule-only gates the
 * methodology explicitly never wrote a full spec for; 3 are placeholders for
 * text nobody has sent us; 5 are numbers being held. A bare "1/6" would present
 * every one of those as broken, and someone would go and "fix" a document that
 * is doing exactly what it meant to.
 */
export function completeness(h: Heuristic): { label: string; muted: boolean } {
  const n = h.specComponentCount ?? 0;

  if (h.advisory?.kind === "text_unavailable") return { label: "0/6 · placeholder", muted: true };
  if (h.advisory?.kind === "retired" || h.advisory?.kind === "reserved") {
    return { label: "0/6 · number held", muted: true };
  }
  if (h.advisory?.kind === "code_enforced") return { label: `${n}/6 · in code`, muted: true };

  if (n >= SPEC_COMPONENT_TOTAL) return { label: `${n}/6`, muted: false };
  if (n === 1) return { label: "1/6 · rule only", muted: true };
  if (n === 0) return { label: "0/6 · no spec", muted: true };
  return { label: `${n}/6`, muted: true };
}

export function kindLabel(kind: Heuristic["cardKind"]): string {
  if (kind === "integrity_gate") return "Gate";
  if (kind === "exercise") return "Exercise";
  return "Card";
}

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
