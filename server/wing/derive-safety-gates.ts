import { SAFETY_RULES } from "./safety-rules";
import { moduleFromCode } from "./parse-compendium";

/**
 * Derives library rows for the safety gates from `safety-rules.ts`.
 *
 * ── WHY THE CODE IS THE SOURCE HERE, AND NOWHERE ELSE ────────────────────
 * Every other element in the library is derived from a document, because a
 * document is what the methodology owner writes. These seven are the exception
 * on Danielle's own instruction, quoted verbatim in safety-rules.ts:
 *
 *   "For the first release, I don't want these as heuristic cards in the card
 *    editor. I want them as system prompt rules — they go directly into the
 *    prompt alongside the Voice and Personality Guide."
 *
 * And on Aditya's ruling that her email of 18 August supersedes compendium v3
 * where the two differ. So the constants in that file ARE the current text of
 * these gates: there is no document that states them more recently, and a row
 * derived from anything else would be a row that disagrees with what actually
 * reaches students.
 *
 * ── WHAT THESE ROWS ARE FOR, AND WHAT THEY CANNOT DO ─────────────────────
 * Danielle asked to see and manage every element in the Methodology panel.
 * These rows deliver the seeing. They cannot deliver the managing, and the
 * notes field says so in the row itself rather than in a design document
 * nobody opens: editing one of these rows changes a database row and changes
 * nothing about Wing's behaviour, because `compileSafety()` reads the module,
 * not the table. A panel that silently accepted an edit to a crisis-detection
 * rule and shipped none of it would be worse than a panel that never showed
 * the rule at all.
 *
 * The reason the rules are constants is itself a safety property, restated
 * here so nobody "fixes" this later by moving them into the table: the voice
 * profile and the integrity gates both render nothing when no cohort points at
 * them, and both are correct to. Safety must not have that property. There is
 * no configuration under which these are absent.
 *
 * ── THE THREE THAT ARE NOT HERE ──────────────────────────────────────────
 * Doc 2 §5 lists ten safety gates. Seven are in the system prompt and derive
 * here. IG-S04 (Obsessive Engagement Detection), IG-S05 (Power Coaching Scope
 * Limitation, Module 9 only) and IG-S10 (Backlash-Aware Coaching) are
 * card-library gates that Doc 2 marks DELIVERED, and their text exists only in
 * Wing_Safety_Architecture.md — which is not in this repo and not in the
 * project. They are declared below as known-absent so the coverage report names
 * them and their reason, rather than leaving three silent holes in a checklist
 * whose whole purpose is to have none.
 */

export type DerivedGate = {
  cardCode: string;
  /** `IG-S01 Crisis language — stop coaching, direct to support`. */
  name: string;
  /** The short form, from `what`. */
  description: string;
  /** The gate's enforceable text, verbatim from the constant. */
  rule: string;
  /** Where the constant says the rule came from. */
  provenance: string;
  /** What the row can and cannot do, written into the row. */
  enforcement: string;
  module: string;
};

/**
 * The marker every derived safety row carries.
 *
 * Written once, here, so the admin panel and the seeder cannot drift into two
 * different wordings of the same warning.
 */
export const CODE_ENFORCED_NOTE =
  "Enforced in the system prompt from server/wing/safety-rules.ts, not from this row. " +
  "Editing this card changes the library record only — it does not change what Wing does. " +
  "Per Danielle, 18 August: these are system prompt rules for the first release, not cards " +
  "in the card editor. To change the behaviour, change the constant and ship it.";

/**
 * Codes Doc 2 §5 lists that no document or constant in this repo supplies.
 *
 * The name is Doc 2's own, and it is the ONLY thing we know about these three.
 * They seed as placeholder rows carrying the name and this reason and nothing
 * else — no rule, no components — so the panel shows all ten safety gates and
 * shows plainly which three it cannot state. A placeholder with no text cannot
 * compile into a prompt, and none of them is in a sequence, so the row is inert
 * in every direction that matters.
 */
export const SAFETY_GATES_WITHOUT_SOURCE: Readonly<
  Record<string, { name: string; why: string }>
> = {
  "IG-S04": {
    name: "Obsessive Engagement Detection",
    why:
      "Card-library gate, priority 1.5, marked DELIVERED in Doc 2 §5. Its text exists only " +
      "in Wing_Safety_Architecture.md, which this repo does not hold and the project does " +
      "not carry. Nothing here can state what this gate does.",
  },
  "IG-S05": {
    name: "Power Coaching Scope Limitation",
    why:
      "Card-library gate, priority 1.5, Module 9 only, marked DELIVERED in Doc 2 §5. Its " +
      "text exists only in Wing_Safety_Architecture.md, which this repo does not hold and " +
      "the project does not carry.",
  },
  "IG-S10": {
    name: "Backlash-Aware Coaching",
    why:
      "Card-library gate, priority 1.5, marked DELIVERED in Doc 2 §5. Not active during " +
      "intake; fires in M6/M9/M10 visibility coaching, and Doc 2 requires a tactic menu for " +
      "all assertiveness coaching. Its text exists only in Wing_Safety_Architecture.md, " +
      "which this repo does not hold and the project does not carry.",
  },
};

export function deriveSafetyGates(): DerivedGate[] {
  return SAFETY_RULES.map((r) => ({
    cardCode: r.code,
    name: `${r.code} ${r.what}`,
    description: r.what,
    rule: r.rule,
    provenance: r.source,
    enforcement: CODE_ENFORCED_NOTE,
    module: moduleFromCode(r.code),
  }));
}
