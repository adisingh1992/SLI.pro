import { readFileSync } from "node:fs";
import {
  COMPONENT_KEYS,
  moduleFromCode,
  parseCompendium,
  type ComponentKey,
  type ParsedCard,
} from "./parse-compendium";
import { INTAKE_SOURCE, MODULE13_SOURCE, parseIntake } from "./parse-intake";
import { RESEARCH_GATES_SOURCE, parseResearchGates } from "./parse-research-gates";
import { parseContentSystem } from "./parse-content-system";
import { REVEAL_CYCLE_SOURCE, parseRevealCycle } from "./parse-reveal-cycle";
import { PLATFORM_UPDATES_SOURCE, parsePlatformUpdates } from "./parse-platform-updates";
import {
  UX_ADDENDUM_SOURCE,
  UX_RECOMMENDATION_SOURCE,
  parseUxGates,
  type MicroJournalGate,
} from "./parse-ux-gates";
import { SAFETY_GATES_WITHOUT_SOURCE, deriveSafetyGates } from "./derive-safety-gates";
import {
  REGISTRY_SOURCE,
  RESERVED_CODES,
  RETIRED_CODES,
  compareCodes,
  parseRegistry,
} from "./parse-registry";
import {
  intakeCardToSeed,
  intakeGateToSeed,
  moduleGateToSeed,
  provenance,
  universalGateToSeed,
  type SeedCard,
} from "./seed-shared";
import type { ComponentCard } from "./parse-component-cards";

/**
 * Every element of the library, as rows, from every source — and nothing else.
 *
 * ── WHY THIS IS PURE AND SEPARATE FROM THE SEEDER ────────────────────────
 * seed-shared.ts states the reason and it applies here with more force: "this is
 * the part worth testing and the seeders cannot be run without a database and a
 * Key Vault secret. A mapping that only executes against production is a mapping
 * nobody has checked." This module reads documents and returns rows. It opens no
 * connection, writes nothing, and can be run and asserted on a laptop with no
 * access to anything.
 *
 * The seeder's whole job then becomes: call this, and insert what it returns.
 *
 * ── PRECEDENCE BETWEEN SOURCES ───────────────────────────────────────────
 * Several codes appear in more than one document. The order below is deliberate
 * and matches the coverage report's: a module document beats the master
 * compendium for the same code, because it is newer. H-701 is the case that
 * matters — the compendium's "Radar weekly brief generation" and the content
 * system's "Baby Radar Topic Suggestion" share a number, and the 1 September
 * rewrite is the one that ships.
 *
 * ── WHAT DOES NOT COME BACK ──────────────────────────────────────────────
 * Nothing is invented. A code the registry expects that no document supplies is
 * absent from `elements` and present in `unsourced`, and the caller decides what
 * that means. A seeder that quietly filled a hole would produce a library that
 * looks complete and is not.
 */

export type ElementStatus = "candidate" | "retired";

export type LibraryElement = {
  seed: SeedCard;
  /**
   * Everything lands `candidate` except the codes that exist to hold a number.
   *
   * `retired` is the only inert status this schema has, and both retired and
   * reserved codes need to be inert and present: a number that vanishes from
   * the library is a number free to be reused, and reuse is how RT-14's Barnum
   * failure comes back under a different name. The distinction between "retired"
   * and "reserved" therefore lives in the notes, not the status column — flagged
   * here because it is a real loss of fidelity and Danielle may want a fourth
   * enum value rather than a sentence.
   */
  status: ElementStatus;
  /** Which document or module supplied it, for the report. */
  source: string;
};

export type CollectResult = {
  /** One element per distinct code, sorted. */
  elements: LibraryElement[];
  /** code → source, for the coverage report. */
  bySource: Map<string, string[]>;
  /** Expected by the registry, supplied by nothing. */
  unsourced: string[];
  /** Supplied here, never named by the registry. */
  surplus: string[];
  /** Verbatim intervention_type tokens that are not enum values. */
  normalisedTypes: Array<{ cardCode: string; from: string; to: string }>;
  /**
   * Codes whose source states no description, so the name is reused as one.
   *
   * seed-compendium.ts set this precedent and its reasoning holds for every
   * source here: the compendium gives the `name:` / `description:` metadata
   * line to coaching cards only, and a gate block opens straight into its
   * component table. `description` is NOT NULL, and a gate's title — "Trust
   * Vault Protection", "Never Assign a Function" — describes it accurately,
   * so reusing it invents nothing. Counted and reported rather than done
   * quietly, because 84 is a lot of rows to silently reshape.
   */
  descriptionFromName: string[];
};

/* ── intervention_type normalisation ─────────────────────────────────────── */

/**
 * The one token in the corpus whose text is not a legal enum value.
 *
 * Declared rather than computed, so a second one cannot slip through as a
 * silent lowercase-and-underscore. Migration 0049 adds the target value; the
 * card's notes keep the document's own spelling.
 */
const TYPE_NORMALISATION: Readonly<Record<string, string>> = {
  "SAFETY OVERRIDE": "SAFETY_OVERRIDE",
};

const ENUM_TYPES = new Set([
  "COACH", "CHALLENGE", "REDIRECT", "REFRAME", "AFFIRM", "META", "GATE",
  "ELICIT", "OBSERVE", "EDUCATE", "SAFETY_OVERRIDE",
]);

function normaliseType(
  cardCode: string,
  raw: string | null,
  log: CollectResult["normalisedTypes"],
): string | null {
  if (!raw) return null;
  const mapped = TYPE_NORMALISATION[raw];
  if (mapped) {
    log.push({ cardCode, from: raw, to: mapped });
    return mapped;
  }
  if (!ENUM_TYPES.has(raw)) {
    throw new Error(
      `${cardCode} declares intervention_type "${raw}", which is not an enum value and ` +
        `has no entry in TYPE_NORMALISATION. Add a migration and an entry — do not ` +
        `fold it into an existing value, which would file it as something it is not.`,
    );
  }
  return raw;
}

/* ── Mappings the shared module does not already have ────────────────────── */

/** A compendium card. seed-compendium.ts maps these inline; this is the same shape. */
function compendiumCardToSeed(card: ParsedCard, source: string): SeedCard {
  const absent = COMPONENT_KEYS.filter((k) => !card.components[k]);
  return {
    cardCode: card.cardCode,
    name: card.name,
    description: card.description,
    populationTags: card.populationTags,
    components: card.components,
    moduleMapping: card.moduleMapping,
    cardKind: card.cardKind,
    interventionType: card.interventionType,
    notes: provenance({
      source,
      line: card.line,
      module: card.module,
      cardKind: card.cardKind,
      interventionTypeVerbatim: card.interventionType,
      weight: card.weight,
      populationTags: card.populationTags,
      documentNotes: card.notes,
      absent,
    }),
  };
}

/** A card written as a heading plus the component table, with no preamble. */
function componentCardToSeed(card: ComponentCard, source: string): SeedCard {
  const absent = COMPONENT_KEYS.filter((k) => !card.components[k]);
  return {
    cardCode: card.cardCode,
    name: card.name,
    description: card.description,
    populationTags: [],
    components: card.components,
    moduleMapping: card.moduleMapping,
    cardKind: card.cardKind,
    interventionType: card.interventionType,
    notes: provenance({
      source,
      line: card.line,
      module: card.module,
      cardKind: card.cardKind,
      interventionTypeVerbatim: card.interventionType,
      weight: card.weight,
      populationTags: [],
      absent,
      extra: [
        "This document states no description and no population tags. The description " +
          "above is the card's own heading, and untagged means it applies to everyone. " +
          "Both are the document's silence, not the seed's.",
      ],
    }),
  };
}

/** A gate that arrived as a rule and nothing else. */
function ruleOnlyToSeed(opts: {
  cardCode: string;
  name: string;
  description: string;
  rule: string;
  source: string;
  line: number;
  module: string;
  extra?: string[];
}): SeedCard {
  const absent = COMPONENT_KEYS.filter((k) => k !== "coaching_move");
  return {
    cardCode: opts.cardCode,
    name: opts.name,
    description: opts.description,
    populationTags: [],
    components: { coaching_move: opts.rule },
    moduleMapping: null,
    cardKind: "integrity_gate",
    interventionType: null,
    notes: provenance({
      source: opts.source,
      line: opts.line,
      module: opts.module,
      cardKind: "integrity_gate",
      interventionTypeVerbatim: null,
      weight: null,
      populationTags: [],
      absent,
      extra: opts.extra,
    }),
  };
}

/** A code the methodology keeps so nobody reuses the number. */
function heldCodeToSeed(cardCode: string, why: string, kind: "retired" | "reserved"): SeedCard {
  return {
    cardCode,
    name: cardCode,
    description:
      kind === "retired"
        ? "Retired. The number is kept so it cannot be reused."
        : "Reserved. The number is held for planned work and is not in use.",
    populationTags: [],
    components: {},
    moduleMapping: null,
    cardKind: "integrity_gate",
    interventionType: null,
    notes: [
      `── ${kind.toUpperCase()} ──`,
      why,
      "",
      "This row carries no components because there is no card here. It exists so the " +
        "number stays occupied: a code that vanishes from the library is a code free to " +
        "be reused, and reuse is how a retired rule comes back under a new name.",
      kind === "reserved"
        ? "Stored with status `retired` because that is the only inert status this schema " +
          "has. Reserved is not retired — this row is a placeholder for planned work, not " +
          "a withdrawn rule. If the distinction needs to survive in the column rather than " +
          "in this note, it is a one-line migration."
        : "",
      "",
      `Declared in parse-registry.ts from ${REGISTRY_SOURCE} and Doc 1, not parsed from a card.`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/* ── Collection ──────────────────────────────────────────────────────────── */

export function collectLibrary(): CollectResult {
  const registry = parseRegistry(readFileSync(REGISTRY_SOURCE, "utf8"));

  const compendiumSource = "methodology/wing-master-module-compendium-v2.md";
  const contentSource = "methodology/wing-content-system-v1.md";

  const compendium = parseCompendium(readFileSync(compendiumSource, "utf8"));
  const intake = parseIntake(readFileSync(INTAKE_SOURCE, "utf8"));
  const module13 = parseIntake(readFileSync(MODULE13_SOURCE, "utf8"), {
    expectedModule: "module_13",
  });
  const reveal = parseRevealCycle(readFileSync(REVEAL_CYCLE_SOURCE, "utf8"));
  const platform = parsePlatformUpdates(readFileSync(PLATFORM_UPDATES_SOURCE, "utf8"));
  const research = parseResearchGates(readFileSync(RESEARCH_GATES_SOURCE, "utf8"));
  const content = parseContentSystem(readFileSync(contentSource, "utf8"));
  const ux = parseUxGates(
    readFileSync(UX_RECOMMENDATION_SOURCE, "utf8"),
    readFileSync(UX_ADDENDUM_SOURCE, "utf8"),
  );
  const safety = deriveSafetyGates();

  const normalisedTypes: CollectResult["normalisedTypes"] = [];
  const descriptionFromName: string[] = [];
  const elements = new Map<string, LibraryElement>();
  const bySource = new Map<string, string[]>();

  /** First writer wins. The order below IS the precedence. */
  function add(seed: SeedCard, source: string, status: ElementStatus = "candidate") {
    if (elements.has(seed.cardCode)) return;
    seed.interventionType = normaliseType(seed.cardCode, seed.interventionType, normalisedTypes);
    // Centrally, so no individual mapping can forget it and hand the seeder a
    // row that fails a NOT NULL constraint after the purge has already run.
    if (!seed.description.trim()) {
      seed.description = seed.name;
      descriptionFromName.push(seed.cardCode);
    }
    elements.set(seed.cardCode, { seed, status, source });
    (bySource.get(source) ?? bySource.set(source, []).get(source)!).push(seed.cardCode);
  }

  // 1 · The held codes go first: a declared decision outranks any document that
  //     still carries the withdrawn text.
  for (const [code, why] of Object.entries(RETIRED_CODES)) {
    add(heldCodeToSeed(code, why, "retired"), "declared · retired", "retired");
  }
  for (const [code, why] of Object.entries(RESERVED_CODES)) {
    add(heldCodeToSeed(code, why, "reserved"), "declared · reserved", "retired");
  }

  // 2 · Module documents, newest first.
  for (const c of intake.cards) add(intakeCardToSeed(c), "intake v1.8");
  for (const g of intake.gates) add(intakeGateToSeed(g), "intake v1.8");

  for (const c of module13.cards) add(intakeCardToSeed(c, MODULE13_SOURCE), "module 13 v1.2");
  for (const g of module13.gates) add(intakeGateToSeed(g, MODULE13_SOURCE), "module 13 v1.2");

  for (const c of reveal.cards) add(componentCardToSeed(c, REVEAL_CYCLE_SOURCE), "reveal cycle v4");
  for (const code of reveal.specified) {
    if (elements.has(code)) continue;
    add(
      heldCodeToSeed(
        code,
        "Named in Reveal Cycle v4 with no component table. IG-RC11 is a standing rule that " +
          "does not fire at runtime; IG-RC12 is the open question Doc 1 records as folded " +
          "into IG-S03.",
        "retired",
      ),
      "reveal cycle v4 (code only)",
      "retired",
    );
  }

  for (const g of platform.gates) {
    add(
      ruleOnlyToSeed({
        cardCode: g.cardCode,
        name: `${g.cardCode} ${g.name}`,
        description: g.name,
        rule: g.rule,
        source: PLATFORM_UPDATES_SOURCE,
        line: g.line,
        module: g.module,
        extra: [
          g.scope ? `Scope: ${g.scope}` : "",
          g.provenance ? `Provenance: ${g.provenance}` : "",
          "Written as an engineering memo, not as a card. The rule is the gate.",
        ].filter(Boolean),
      }),
      "platform updates",
    );
  }

  for (const g of research.universalGates) add(universalGateToSeed(g), "research-derived gates");
  for (const g of research.moduleGates) add(moduleGateToSeed(g), "research-derived gates");

  for (const c of content.cards) {
    add(
      compendiumCardToSeed(
        { ...c, weight: null, module: moduleFromCode(c.cardCode), heading: "", bodyHash: "", interventionType: firstToken(c.components.intervention_type), cardKind: "coaching_card" } as ParsedCard,
        contentSource,
      ),
      "content system v1",
    );
  }
  for (const g of content.gates) {
    add(
      ruleOnlyToSeed({
        cardCode: g.cardCode,
        name: `${g.cardCode} ${g.name}`,
        description: g.name,
        rule: g.rule,
        source: contentSource,
        line: g.line,
        module: moduleFromCode(g.cardCode),
        extra: [g.gateType ? `gate_type: ${g.gateType}` : ""].filter(Boolean),
      }),
      "content system v1",
    );
  }

  for (const g of safety) {
    add(
      ruleOnlyToSeed({
        cardCode: g.cardCode,
        name: g.name,
        description: g.description,
        rule: g.rule,
        source: "server/wing/safety-rules.ts",
        line: 0,
        module: g.module,
        extra: [g.enforcement, "", `Provenance: ${g.provenance}`],
      }),
      "safety-rules.ts (code)",
    );
  }

  for (const c of ux.uxGates.cards) {
    add(componentCardToSeed(c, UX_RECOMMENDATION_SOURCE), "UX recommendation pt 8");
  }
  for (const g of ux.mjGates) add(mjGateToSeed(g), "UX addendum (rule only)");

  // 3 · The master compendium last: every code above that also appears there is
  //     governed by the newer document.
  for (const c of compendium.cards) {
    add(compendiumCardToSeed(c, compendiumSource), "compendium v2");
  }

  const expected = new Set(registry.elements.map((e) => e.code));
  const have = new Set(elements.keys());

  return {
    elements: Array.from(elements.values()).sort((a, b) =>
      compareCodes(a.seed.cardCode, b.seed.cardCode),
    ),
    bySource,
    unsourced: Array.from(expected).filter((c) => !have.has(c)).sort(compareCodes),
    surplus: Array.from(have).filter((c) => !expected.has(c)).sort(compareCodes),
    normalisedTypes,
    descriptionFromName,
  };
}

function firstToken(raw: string | undefined): string | null {
  return raw ? raw.split("(")[0].trim() : null;
}

function mjGateToSeed(g: MicroJournalGate): SeedCard {
  return ruleOnlyToSeed({
    cardCode: g.cardCode,
    name: g.name,
    description: g.rule.slice(0, 120),
    rule: g.rule,
    source: UX_ADDENDUM_SOURCE,
    line: g.line,
    module: g.module,
    extra: [
      `Promoted from ${g.source} of the UX Addendum.`,
      "This gate has no name in any document — the table gives a code, a rule and a " +
        "section. `name` is the bare code rather than a summary of the rule, because a " +
        "parser that writes titles is a parser that authors methodology. Naming it is " +
        "an edit for the methodology owner.",
      "Doc 3: \"Summaries are canonical. Full 7-component specs were never produced.\" " +
        "Doc 2 Appendix C files the expansion as Priority 3.",
    ],
  });
}
