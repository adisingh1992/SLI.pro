/**
 * Which session a card's sequence entry is scoped to, from its module.
 *
 * ── WHAT THIS DECIDES ────────────────────────────────────────────────────
 * `getSequenceCards` returns the coaching cards scoped to the current session
 * plus the coaching cards scoped to nothing. So this function decides, for every
 * card in the library, which turns it can fire on — and a wrong answer here is
 * not a cosmetic filing error. Scope a Module 9 power card to `null` and Wing
 * offers it during intake; scope every module to one value and the detector
 * chooses between 105 near-neighbour signals on a single turn.
 *
 * ── WHY GATES ARE UNSCOPED AND CARDS ARE NOT ─────────────────────────────
 * A gate never enters the detector catalogue — `card_kind` keeps it out — so
 * its scope costs nothing and its rules are written to apply wherever Wing is
 * speaking. The universal, voice and safety gates are the clearest case: IG-S01
 * is the highest-priority rule in the platform and there is no session in which
 * it should be absent. They are scoped to null and that is the whole point.
 *
 * Coaching cards are the opposite: every one of them is about a particular
 * conversation, and the module is the conversation.
 *
 * ── THE TWO FAMILIES THAT ARE NEITHER ────────────────────────────────────
 * UX and micro-journaling gates are enforced outside the chat turn entirely —
 * one in the rendering layer, one in the prompt scheduler. They are in the
 * library because Danielle asked to see and manage every element, and they are
 * unscoped because a scope would imply the turn path consults them. It does
 * not, and their advisory text says so.
 *
 * Pure. No database, no imports beyond the module vocabulary. Tested directly.
 */

/** Session types an entry may be scoped to, after migration 0050. */
export type SessionScope =
  | "intake"
  | "foundation_1"
  | "foundation_2"
  | "foundation_3"
  | "module_4"
  | "module_5"
  | "module_6"
  | "module_7"
  | "module_8"
  | "module_9"
  | "module_10"
  | "module_11"
  | "module_13"
  | "reveal_cycle";

/**
 * Modules whose cards apply wherever Wing is speaking.
 *
 * Every one of these contains gates only — the library has zero coaching cards
 * filed under any of them — so an unscoped entry here adds nothing to any
 * session's detector load. `assertNoUnscopedCoaching` holds that true.
 */
const UNSCOPED_MODULES = new Set([
  "universal",
  "voice",
  "safety",
  "ux",
  "micro_journaling",
  "image_generation",
  "unknown",
]);

const DIRECT: Readonly<Record<string, SessionScope>> = {
  intake: "intake",
  foundation_1: "foundation_1",
  foundation_2: "foundation_2",
  foundation_3: "foundation_3",
  module_4: "module_4",
  module_5: "module_5",
  module_6: "module_6",
  module_7: "module_7",
  module_8: "module_8",
  module_9: "module_9",
  module_10: "module_10",
  module_11: "module_11",
  module_13: "module_13",
  reveal_cycle: "reveal_cycle",
};

/**
 * Null means "every session", which is correct for a gate and dangerous for a
 * card. The caller is expected to check the second half with
 * `assertNoUnscopedCoaching` rather than trusting this to know a card's kind.
 */
export function sessionScopeFor(module: string): SessionScope | null {
  if (UNSCOPED_MODULES.has(module)) return null;
  const scope = DIRECT[module];
  if (scope) return scope;
  /*
   * An unrecognised module is null — every session — which is the wrong default
   * for anything that turns out to be a coaching card. That is why it is
   * checked rather than trusted: `moduleFromCode` returns "unknown" for a code
   * it cannot place, and a code nobody can place should stop a build, not
   * quietly become universal.
   */
  return null;
}

export type ScopedEntry = {
  cardCode: string;
  cardKind: string;
  module: string;
  scope: SessionScope | null;
};

/**
 * The check that makes the unscoped default safe.
 *
 * Every unscoped entry must be a gate or an exercise. A coaching card with no
 * scope is offered to the detector on every turn of every session, in every
 * module, for the life of the sequence — the exact failure the per-module
 * scopes were added to prevent, arriving through the back door of a module name
 * nobody mapped.
 */
export function unscopedCoaching(entries: readonly ScopedEntry[]): ScopedEntry[] {
  return entries.filter((e) => e.scope === null && e.cardKind === "coaching_card");
}
