import {
  eligibleActions,
  type NavLabel,
  type Recommendation,
  type RecommendationState,
} from "@shared/recommendation";
import type { ModuleSlug } from "./wing-modules";

/**
 * Where a recommendation goes, now that the screens it named are gone.
 *
 * ── THE PROBLEM THIS SOLVES ──────────────────────────────────────────────
 * `shared/recommendation.ts` is IG-UX02's one-recommendation rule — eleven ordered rules
 * enumerated over 1,536 states — and it has never had an importer. This is it.
 *
 * But its `NavLabel` union is eleven *old* screen names, and the new student surface has
 * seven screens. Six of the eleven point at pages that no longer exist: the Brand
 * Intelligence Report, the SLI selection flow, LinkedIn Optimization, Strategic Content
 * and Assigned Homework were all archived with the old UI.
 *
 * Calling `recommend()` and rendering whatever comes back would therefore produce, for a
 * real and common state, a card reading "Recommended: Optimise your LinkedIn profile"
 * with a button that goes nowhere. Which is the same defect in a new place: a surface
 * asserting an action the thing behind it cannot perform.
 *
 * ── SO THE FILTER IS ON REACHABILITY, NOT ON PREFERENCE ──────────────────
 * `eligibleActions` returns every rule that fires, in her priority order. This walks that
 * list and takes the first one a student can actually get to. It does not reorder, skip
 * for taste, or invent a destination — if a rule fires and its screen exists, it wins,
 * exactly as she ordered it.
 *
 * The mapping is exhaustive over `NavLabel` rather than a lookup with a default, so
 * adding a twelfth label is a type error here instead of a silently unreachable
 * recommendation.
 */

export type RecommendationTarget =
  | { kind: "module"; slug: ModuleSlug }
  | { kind: "route"; href: string }
  | { kind: "external"; href: string }
  | { kind: "gone" };

/**
 * Danielle's own scheduling link. This is a placeholder reconnect, not a
 * decision about where coaching booking should ultimately live — the button
 * pointed at `/settings` (nothing there could book a call) since the old
 * `new-dashboard.tsx` page was retired; that page still had this exact URL
 * wired to `window.open`, so it's restored as-is. Revisit when there's a
 * real in-app booking surface.
 */
const COACHING_CALENDLY_URL = "https://calendly.com/dcara-sli/haas";

export function targetFor(label: NavLabel): RecommendationTarget {
  switch (label) {
    case "Functional Identity Mapping":
      return { kind: "module", slug: "discover_your_function" };
    case "Professional Credibility Assessment":
      return { kind: "module", slug: "prove_your_credibility" };
    case "Positioning Story Development":
      return { kind: "module", slug: "tell_your_stories" };
    case "Document Vault":
      return { kind: "route", href: "/files" };
    case "Professional Branding Assessment":
      /* A1 replaced the form-based intake with Wing's conversation; both paths still map. */
      return { kind: "route", href: "/intake" };
    case "Schedule Coaching Call":
      return { kind: "external", href: COACHING_CALENDLY_URL };

    /*
     * Archived with the old student UI. Their rules still fire — the state they read is
     * real — so they are skipped rather than deleted, and they come back the day the
     * screen does.
     */
    case "Brand Intelligence Report":
    case "Single Lasting Impression":
    case "LinkedIn Optimization":
    case "Strategic Content":
    case "Assigned Homework":
      return { kind: "gone" };
  }
}

/**
 * The one recommendation a student can act on, or null.
 *
 * Null is a real outcome and the caller must render something for it. Her failure path
 * says "never display 'no recommendation'", and the dashboard honours that with a line
 * about the positioning work — which is always reachable — rather than an empty card.
 */
export function reachableRecommendation(
  state: RecommendationState,
): { rec: Recommendation; target: RecommendationTarget } | null {
  for (const rec of eligibleActions(state)) {
    const target = targetFor(rec.navLabel);
    if (target.kind !== "gone") return { rec, target };
  }
  return null;
}

export function hrefFor(target: RecommendationTarget): string {
  return target.kind === "module"
    ? `/chat/${target.slug}`
    : target.kind === "route" || target.kind === "external"
      ? target.href
      : "/";
}

/**
 * `external` targets leave the app (Danielle's Calendly, today) and must not go
 * through wouter's `<Link>` — it intercepts clicks for client-side routing, which
 * for an absolute URL means trying to push it onto the SPA's own history instead
 * of letting the browser navigate. Callers should render a plain `<a target="_blank">`
 * when this is true.
 */
export function isExternalTarget(target: RecommendationTarget): boolean {
  return target.kind === "external";
}
