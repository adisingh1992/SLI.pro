import { moduleFromCode } from "./parse-compendium";
import { SAFETY_GATES_WITHOUT_SOURCE, deriveSafetyGates } from "./derive-safety-gates";
import { RESERVED_CODES, RETIRED_CODES } from "./parse-registry";

/**
 * What the admin panel must say about a card before anyone edits it.
 *
 * ── WHY THIS IS COMPUTED AND NOT STORED ──────────────────────────────────
 * Every one of these facts is already written into the card's notes at seed
 * time, and the notes are the right place for a reader. They are the wrong
 * place for the UI: a banner driven by matching strings in a free-text field
 * breaks the moment someone edits the field, and the whole point of this step
 * is that Danielle can now edit fields. So the panel derives the advisory from
 * the same declared tables the seeder used — the safety constants, the
 * known-absent list, the retired and reserved registries — and an edit to the
 * notes can never silently remove a warning.
 *
 * ── THE FOUR THINGS A CARD CAN BE ────────────────────────────────────────
 *   code_enforced    One of the seven safety rules that live in
 *                    safety-rules.ts. The row is a copy for reading. Editing it
 *                    changes the library record and nothing Wing does.
 *   text_unavailable IG-S04, IG-S05, IG-S10. Doc 2 §5 lists them, no document
 *                    we hold states them. The row is a placeholder.
 *   retired          The card was withdrawn and its number kept so it cannot be
 *                    reused. RT-14's Barnum failure is why that matters.
 *   reserved         The number is held for planned work and was never a card.
 *
 * Precedence is the order above, and it only ever matters for one row at a
 * time — no code is in two of these sets — but it is fixed rather than
 * incidental so the banner cannot change when a table is reordered.
 *
 * Pure. No database, no imports from the server. Tested directly.
 */

export type AdvisoryKind = "code_enforced" | "text_unavailable" | "retired" | "reserved";

export type Advisory = {
  kind: AdvisoryKind;
  /** One line, shown as the banner's heading. */
  title: string;
  /** What the person needs to know before they edit. */
  body: string;
};

const SAFETY_CODES = new Set(deriveSafetyGates().map((g) => g.cardCode));

export function advisoryFor(cardCode: string): Advisory | null {
  if (SAFETY_CODES.has(cardCode)) {
    return {
      kind: "code_enforced",
      title: "Enforced in the system prompt, not from this row",
      body:
        "This safety rule is a constant in server/wing/safety-rules.ts and reaches students " +
        "from there. Editing this card changes the library record only — it does not change " +
        "what Wing does. Per Danielle, 18 August: these are system prompt rules for the first " +
        "release, not cards in the card editor. To change the behaviour, change the constant " +
        "and ship it.",
    };
  }

  const absent = SAFETY_GATES_WITHOUT_SOURCE[cardCode];
  if (absent) {
    return {
      kind: "text_unavailable",
      title: `No text available for ${absent.name}`,
      body:
        absent.why +
        " This row is a placeholder so the gate is visible and its absence is obvious. It " +
        "carries no rule, so nothing can compile or fire it.",
    };
  }

  const retired = RETIRED_CODES[cardCode];
  if (retired) {
    return {
      kind: "retired",
      title: "Retired — the number is kept so it cannot be reused",
      body:
        retired +
        " A code that vanishes from the library is a code free to be reused, and reuse is how " +
        "a withdrawn rule comes back under a new name.",
    };
  }

  const reserved = RESERVED_CODES[cardCode];
  if (reserved) {
    return {
      kind: "reserved",
      title: "Reserved — held for planned work, never a card",
      body:
        reserved +
        " Stored with status `retired` because that is the only inert status this schema has. " +
        "Reserved is not retired.",
    };
  }

  return null;
}

export type CardAnnotation = {
  /** Derived from the code — the panel groups by this. */
  module: string;
  advisory: Advisory | null;
};

export function annotate(cardCode: string | null | undefined): CardAnnotation {
  if (!cardCode) return { module: "unknown", advisory: null };
  return { module: moduleFromCode(cardCode), advisory: advisoryFor(cardCode) };
}

/**
 * How a card code sorts in a list a human reads.
 *
 * `ORDER BY name` puts H-1301 between H-130 and H-131 and scatters the reveal
 * templates through the alphabet. A methodology owner looking for H-209 expects
 * it after H-208, so the list sorts by prefix then by number.
 */
export function compareCardCodes(a: string, b: string): number {
  const parse = (code: string) => {
    const m = /^([A-Za-z][A-Za-z0-9-]*?)(\d+)(?:\.(\d+))?$/.exec(code);
    return m
      ? { prefix: m[1], n: Number(m[2]), minor: m[3] ? Number(m[3]) : 0 }
      : { prefix: code, n: Number.MAX_SAFE_INTEGER, minor: 0 };
  };
  const pa = parse(a);
  const pb = parse(b);
  if (pa.prefix !== pb.prefix) return pa.prefix.localeCompare(pb.prefix);
  if (pa.n !== pb.n) return pa.n - pb.n;
  return pa.minor - pb.minor;
}
