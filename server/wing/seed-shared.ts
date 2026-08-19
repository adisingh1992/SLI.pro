/**
 * What the seeders for the 18 August documents share.
 *
 * ── WHY THIS IS NOT A REFACTOR OF seed-compendium.ts ─────────────────────
 * `seed-compendium.ts` holds its own copy of the component→column map and its
 * own notes builder, and it stays that way. It has already run against the live
 * database and I cannot execute it from here to prove a refactor kept its
 * behaviour, so rewriting a working seeder to save eight lines would be trading
 * a real risk for a cosmetic gain.
 *
 * The copies must not drift, so `api-contracts.test.ts` compares them as text
 * and fails if the six mapped component names ever differ. That is the guard a
 * shared module would have given us, without the risk.
 */

import { COMPONENT_KEYS, moduleFromCode, type ComponentKey, type ParsedCard } from "./parse-compendium";
import { INTAKE_SOURCE, type ParsedIntakeGate } from "./parse-intake";
import {
  RESEARCH_GATES_SOURCE,
  UNIVERSAL_GATE_GAPS,
  type ResearchGate,
} from "./parse-research-gates";

/**
 * v2 component → `heuristic_component_type`. Six of the seven map by name.
 *
 * `intervention_type` is absent deliberately: it is the column
 * `heuristics.intervention_type`, not a component row. Writing the classifier
 * into a component would put "Intervention to apply: META (system rule)" in
 * reach of a prompt, which is what IG-U005 exists to stop.
 */
export const COMPONENT_COLUMN: Partial<Record<ComponentKey, string>> = {
  signal: "signal",
  detection_method: "detection_method",
  coaching_move: "coaching_move",
  delivery_adaptation: "delivery_adaptation",
  success_criteria: "success_criteria",
  failure_path: "failure_path",
};

/** Everything an insert needs, with no drizzle types so this file stays pure. */
export type SeedCard = {
  cardCode: string;
  name: string;
  description: string;
  populationTags: string[];
  components: Partial<Record<ComponentKey, string>>;
  moduleMapping: string | null;
  cardKind: string;
  /** Null when the document does not state one. Never guessed. */
  interventionType: string | null;
  notes: string;
};

export type SeedRows = {
  heuristic: {
    cardCode: string;
    name: string;
    description: string;
    populationTags: string[];
    status: string;
    interventionType: string | null;
    cardKind: string;
  };
  components: Array<{ componentType: string; content: string }>;
};

/** The rows one card becomes. Plain data, so a seeder only does the inserting. */
export function seedRows(card: SeedCard): SeedRows {
  const components: Array<{ componentType: string; content: string }> = [];

  for (const key of COMPONENT_KEYS) {
    const column = COMPONENT_COLUMN[key];
    const content = card.components[key];
    if (column && content) components.push({ componentType: column, content });
  }
  if (card.moduleMapping) {
    components.push({ componentType: "module_mapping", content: card.moduleMapping });
  }
  components.push({ componentType: "notes", content: card.notes });

  return {
    heuristic: {
      cardCode: card.cardCode,
      name: card.name,
      description: card.description,
      populationTags: card.populationTags,
      /*
       * Candidate, always. These cards are meant to replace live methodology, and
       * seeding and switching over must not be the same button — the precedent
       * `seed-compendium.ts` set, and it matters more here because the intake
       * module replaces an assessment students are using today.
       */
      status: "candidate",
      interventionType: card.interventionType,
      cardKind: card.cardKind,
    },
    components,
  };
}

/**
 * The provenance block every seeded card carries, in the same shape the
 * compendium seeder writes so all cards read alike in the admin editor.
 *
 * `absent` is the part worth having. Several of these cards arrive with one
 * component out of seven, and a reviewer opening a gate with an empty signal row
 * should see that the DOCUMENT is silent rather than wonder whether the seed
 * dropped it. Silence that looks like a bug gets fixed by guessing.
 */
export function provenance(opts: {
  source: string;
  line: number;
  module: string;
  cardKind: string;
  interventionTypeVerbatim: string | null;
  weight: number | null;
  populationTags: readonly string[];
  documentNotes?: string | null;
  absent?: readonly string[];
  extra?: readonly string[];
}): string {
  const lines: string[] = [];
  if (opts.documentNotes) lines.push(opts.documentNotes, "");

  lines.push(
    "── from the source document ──",
    `Source: ${opts.source}, line ${opts.line}`,
    `Module: ${opts.module}    Kind: ${opts.cardKind}`,
    `intervention_type (verbatim): ${opts.interventionTypeVerbatim || "(none stated)"}`,
    opts.weight === null
      ? "Sequence weight: NOT STATED in the source. Defaults to 1.0 when this card " +
        "enters a sequence — a weight is a decision about precedence and 1.0 is a " +
        "guess, so it is flagged rather than assumed."
      : `Sequence weight: ${opts.weight.toFixed(1)}`,
    opts.populationTags.length
      ? `Population tags: ${opts.populationTags.join(", ")}`
      : "Population: untagged — applies to everyone.",
  );

  if (opts.absent && opts.absent.length) {
    lines.push(
      "",
      "Components the source does not supply: " + opts.absent.join(", ") + ".",
      "Empty because the document is silent, not because the seed failed. Filling " +
        "them in would be a methodology decision taken by an engineer.",
    );
  }

  if (opts.extra && opts.extra.length) lines.push("", ...opts.extra);

  lines.push(
    "",
    "Seeded from the source document, not transcribed by hand. Edit freely here — " +
      "but a re-run of the seed will not overwrite an existing card, so an edit " +
      "here and a change in the document will diverge. Change the document and " +
      "re-seed if the source is wrong.",
  );

  return lines.join("\n");
}

/* ── Document → row mappings ──────────────────────────────────────────────
 *
 * Here rather than in the seeders because this is the part worth testing and the
 * seeders cannot be run without a database and a Key Vault secret. A mapping that
 * only executes against production is a mapping nobody has checked.
 */

/** A parsed card, ready to insert. */
export function intakeCardToSeed(card: ParsedCard): SeedCard {
  const absent = COMPONENT_KEYS.filter((k) => !card.components[k]);
  return {
    cardCode: card.cardCode,
    name: card.name,
    // Every intake card has a description line, unlike the compendium's gates.
    description: card.description || card.name,
    populationTags: card.populationTags.slice(),
    components: card.components,
    moduleMapping: card.moduleMapping,
    cardKind: card.cardKind,
    interventionType: card.interventionType,
    notes: provenance({
      source: INTAKE_SOURCE,
      line: card.line,
      module: card.module,
      cardKind: card.cardKind,
      interventionTypeVerbatim: (card.components.intervention_type ?? "").replace(/\*/g, "").trim(),
      weight: card.weight,
      populationTags: card.populationTags,
      documentNotes: card.notes,
      absent: absent.map(String),
    }),
  };
}

/** An intake integrity gate: a rule, and six components the document omits. */
export function intakeGateToSeed(gate: ParsedIntakeGate): SeedCard {
  const extra: string[] = [`gate_type: ${gate.gateType}`];
  if (gate.restates) {
    extra.push(
      `Restates ${gate.restates} for intake. The platform-wide gate is the one to ` +
        "change if the rule changes; this is its intake wording. Compiling both into " +
        "one prompt states the same rule twice in different words, which is how a " +
        "model learns a rule is negotiable.",
    );
  }
  return {
    cardCode: gate.cardCode,
    // The gate's title describes it accurately and inventing a description would
    // be worse. Same reasoning the compendium seeder gives for its 20 gates.
    name: `${gate.cardCode} ${gate.name}`,
    description: gate.name,
    populationTags: [],
    components: { coaching_move: gate.rule },
    moduleMapping: "Intake — all phases",
    cardKind: "integrity_gate",
    interventionType: null,
    notes: provenance({
      source: INTAKE_SOURCE,
      line: gate.line,
      module: moduleFromCode(gate.cardCode),
      cardKind: "integrity_gate",
      interventionTypeVerbatim: null,
      weight: null,
      populationTags: [],
      absent: [
        "signal",
        "detection_method",
        "intervention_type",
        "delivery_adaptation",
        "success_criteria",
        "failure_path",
      ],
      extra,
    }),
  };
}

/** Part A's notes as one field, or her statement that none are needed. */
function deliveryAdaptation(gate: ResearchGate): string | undefined {
  if (gate.audienceNotes.length) {
    return gate.audienceNotes.map((n) => `${n.label}: ${n.text}`).join("\n");
  }
  return gate.audienceStatement ?? undefined;
}

/** A universal gate: the rule, the audience adaptation, and everything else in notes. */
export function universalGateToSeed(gate: ResearchGate): SeedCard {
  const enforces = gate.fields.filter((f) => f.label === "What it enforces")[0];
  const unmapped = gate.fields.filter(
    (f) => f.label !== gate.ruleLabel && f.label !== "What it enforces",
  );

  return {
    cardCode: gate.cardCode,
    name: `${gate.cardCode} ${gate.name}`,
    description: enforces ? enforces.text : gate.name,
    // Untagged: universal means every population, and she tags none of them.
    populationTags: [],
    components: {
      coaching_move: gate.rule,
      delivery_adaptation: deliveryAdaptation(gate),
    },
    moduleMapping: "Universal — every module, every session",
    cardKind: "integrity_gate",
    interventionType: null,
    notes: provenance({
      source: RESEARCH_GATES_SOURCE,
      line: gate.line,
      module: "universal",
      cardKind: "integrity_gate",
      interventionTypeVerbatim: null,
      weight: null,
      populationTags: [],
      absent: UNIVERSAL_GATE_GAPS.map(String),
      extra: [
        `The rule above is the document's "${gate.ruleLabel}" paragraph — the one ` +
          "mapping this seed makes, because a gate's coaching_move is what Wing must " +
          "do and that paragraph says what Wing must do and nothing else.",
        "",
        "── the rest of the document's entry, verbatim ──",
      ].concat(unmapped.map((f) => `${f.label}: ${f.text}`)),
    }),
  };
}

/** A Part B module gate: a complete seven-component card already. */
export function moduleGateToSeed(card: ParsedCard): SeedCard {
  const absent = COMPONENT_KEYS.filter((k) => !card.components[k]);
  return {
    cardCode: card.cardCode,
    name: card.name,
    /*
     * Part B gives a heading and a table, with no description line. The heading
     * describes the gate accurately — "Kegan-Stage-Aware Function Introduction" —
     * so reusing it invents nothing. Same reasoning the compendium seeder gives
     * for its 20 undescribed gates.
     */
    description: card.description || card.name,
    populationTags: [],
    components: card.components,
    moduleMapping: card.module,
    cardKind: card.cardKind,
    interventionType: card.interventionType,
    notes: provenance({
      source: RESEARCH_GATES_SOURCE,
      line: card.line,
      module: card.module,
      cardKind: card.cardKind,
      interventionTypeVerbatim: (card.components.intervention_type ?? "").replace(/\*/g, "").trim(),
      weight: card.weight,
      populationTags: [],
      absent: absent.map(String),
      extra:
        card.cardKind === "coaching_card"
          ? [
              "Filed under \"Module-Specific Gates\" in the document but declares COACH " +
                "and detects on the student's turn, so it is seeded as a coaching card. " +
                "The section title is not a property of the card. Worth confirming with " +
                "her, since it decides whether this may enter the detector catalogue.",
            ]
          : [],
    }),
  };
}
