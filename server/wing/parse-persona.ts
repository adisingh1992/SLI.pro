import {
  METHODOLOGY_POPULATIONS,
  populationTagsFor,
  type Pathway,
  type ProfessionalStatus,
} from "./population-tags";

/**
 * Persona specification parser.
 *
 * ── WHY A SPEC NEEDS A PROFESSIONAL STATUS AND A PATHWAY, OR IT IS REFUSED ──
 * This is the one piece of the harness where a missing field silently
 * invalidates a whole run, so it fails loudly at parse time instead.
 *
 * Audience tags are not stored. `populationTagsForStudent` derives them at read
 * time from `users.professional_status` (four values) and
 * `intake_records.pathway` (three), mapped onto the methodology's eleven-value
 * vocabulary — there is no `audience_track` column. And `cardAppliesTo`
 * intersects the card's tags with the student's, so a persona seeded with
 * neither field resolves to NO tags.
 *
 * No tags does not mean "no audience-specific cards fire". It means the
 * intersection is empty for every tagged card, and an empty intersection is
 * indistinguishable from a card that legitimately does not apply to this
 * person. Twenty personas run that way would produce a clean-looking Unfired
 * Cards report in which every audience-specific card appears as dead weight —
 * and Danielle would rewrite cards that were working, on evidence that was
 * never gathered.
 *
 * ── WHY THE BODY IS KEPT VERBATIM ────────────────────────────────────────
 * Everything below the frontmatter is the persona's simulation prompt —
 * backstory, the interaction policies, hedging rules, response length. Sam's
 * Interface 3 requires it be injected verbatim, and Danielle's fidelity
 * concern is precisely about whether a model holds it. So this parser reads the
 * frontmatter and does not touch a character of the body. It does not
 * summarise, reflow or validate it: a parser that edited a persona would be
 * changing the experiment.
 *
 * ── WHY THIS FILE IS PURE ────────────────────────────────────────────────
 * Same reason as `seed-shared.ts`: a seeder needs a database and a Key Vault
 * secret, so without this split the only environment that ever exercises the
 * mapping is production.
 */

/** The four values `users.professional_status` accepts. */
export const PROFESSIONAL_STATUSES: readonly ProfessionalStatus[] = [
  "undergraduate_or_recent_grad",
  "early_career",
  "mid_career_or_senior",
  "career_break_or_transition",
];

/** The three values `intake_records.pathway` accepts. */
export const PATHWAYS: readonly Pathway[] = ["employment", "venture", "freelance"];

export type PersonaSpec = {
  /** Stable slug. The seeder's idempotency key, and what a finding cites. */
  id: string;
  name: string;
  professionalStatus: ProfessionalStatus;
  pathway: Pathway;
  /** Resolved from the two above, so a reviewer sees what the engine will see. */
  populationTags: string[];
  /**
   * Markers the persona is written to exhibit, for the harness's own
   * ground-truth comparison. Free-form on purpose: Danielle names the
   * behaviour, and the runner only counts what it can count deterministically.
   */
  expectedMarkers: string[];
  /** Everything below the frontmatter, byte-for-byte. */
  systemPrompt: string;
  /** sha256 of the whole file, so a finding can name the exact version. */
  sourceHash: string;
};

export type ParseFailure = { field: string; problem: string };

export type ParseResult =
  | { ok: true; spec: PersonaSpec }
  | { ok: false; failures: ParseFailure[] };

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * A deliberately small frontmatter reader: `key: value` and `key:` followed by
 * `- item` lines. Not YAML.
 *
 * Depending on a YAML parser for six keys would add a dependency to a build
 * that has none for this, and would accept anchors, nesting and type coercion
 * that this format has no meaning for. Anything it cannot read is reported as a
 * failure rather than skipped.
 */
export function readFrontmatter(text: string): {
  scalars: Record<string, string>;
  lists: Record<string, string[]>;
  body: string;
  found: boolean;
} {
  const m = FRONTMATTER.exec(text);
  if (!m) return { scalars: {}, lists: {}, body: text, found: false };

  const scalars: Record<string, string> = {};
  const lists: Record<string, string[]> = {};
  let currentList: string | null = null;

  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;

    /*
     * `-\s*` and not `-\s+`: a bare "-" is a blank list item, and it has to
     * arrive here as an empty string so `parsePersona` can refuse it. Requiring
     * whitespace after the hyphen made the line match nothing and be skipped,
     * so a typo'd marker vanished silently — found by the test that asserts it
     * is refused.
     */
    const item = /^\s*-\s*(.*)$/.exec(line);
    if (item && currentList) {
      lists[currentList].push(strip(item[1]));
      continue;
    }

    const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (!kv) continue;

    const [, key, value] = kv;
    if (value.trim() === "") {
      currentList = key;
      lists[key] = lists[key] ?? [];
    } else {
      currentList = null;
      scalars[key] = strip(value);
    }
  }

  return { scalars, lists, body: text.slice(m[0].length), found: true };
}

function strip(v: string): string {
  const t = v.trim();
  return /^".*"$/.test(t) || /^'.*'$/.test(t) ? t.slice(1, -1) : t;
}

/**
 * Parses one spec. `hash` is passed in rather than computed, so this file needs
 * no crypto import and stays runnable anywhere.
 */
export function parsePersona(text: string, hash: string): ParseResult {
  const { scalars, lists, body, found } = readFrontmatter(text);
  const failures: ParseFailure[] = [];

  if (!found) {
    return {
      ok: false,
      failures: [
        {
          field: "(file)",
          problem:
            "no frontmatter block. A spec opens with --- , the keys id, name, " +
            "professional_status and pathway, then --- , then the persona prompt.",
        },
      ],
    };
  }

  const id = scalars.id ?? "";
  if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(id)) {
    failures.push({
      field: "id",
      problem: id
        ? `"${id}" is not a slug (lower-case letters, digits and hyphens)`
        : "missing. This is the seeder's idempotency key and what a finding cites.",
    });
  }

  const name = scalars.name ?? "";
  if (!name) failures.push({ field: "name", problem: "missing" });

  const status = scalars.professional_status ?? "";
  if (!status) {
    failures.push({
      field: "professional_status",
      problem:
        "missing, and it cannot be defaulted. It selects the whole prompt strategy " +
        `through getPromptSet and is half of the audience tags. One of: ${PROFESSIONAL_STATUSES.join(", ")}`,
    });
  } else if (!PROFESSIONAL_STATUSES.includes(status as ProfessionalStatus)) {
    failures.push({
      field: "professional_status",
      problem: `"${status}" is not one of: ${PROFESSIONAL_STATUSES.join(", ")}`,
    });
  }

  const pathway = scalars.pathway ?? "";
  if (!pathway) {
    failures.push({
      field: "pathway",
      problem:
        "missing, and it cannot be defaulted. It is the other half of the audience " +
        `tags — without it no entrepreneur card can ever fire. One of: ${PATHWAYS.join(", ")}`,
    });
  } else if (!PATHWAYS.includes(pathway as Pathway)) {
    failures.push({
      field: "pathway",
      problem: `"${pathway}" is not one of: ${PATHWAYS.join(", ")}`,
    });
  }

  if (!body.trim()) {
    failures.push({
      field: "(body)",
      problem:
        "empty. The body is the persona's simulation prompt and is injected verbatim; " +
        "a spec with no body would run a persona with no character.",
    });
  }

  /*
   * Declared markers are checked against nothing — they are Danielle's
   * vocabulary, not ours, and the runner counts only what it can count
   * deterministically. What IS checked is that a marker is not empty, because a
   * blank list item is a typo that would otherwise become a ground-truth claim.
   */
  const expectedMarkers = (lists.expected_markers ?? []).filter((m) => m.length > 0);
  if ((lists.expected_markers ?? []).length !== expectedMarkers.length) {
    failures.push({ field: "expected_markers", problem: "contains a blank item" });
  }

  if (failures.length) return { ok: false, failures };

  const tags = populationTagsFor(status as ProfessionalStatus, pathway as Pathway);

  /*
   * A resolvable status and pathway that still produce no tags would defeat the
   * point of requiring them. It cannot happen with the current mapping, and
   * this is here so that it cannot start happening quietly if the mapping
   * changes.
   */
  if (!tags.length) {
    return {
      ok: false,
      failures: [
        {
          field: "professional_status/pathway",
          problem:
            `"${status}" + "${pathway}" resolves to no population tags, so no ` +
            "audience-specific card could fire for this persona",
        },
      ],
    };
  }

  const unknown = tags.filter(
    (t) => !(METHODOLOGY_POPULATIONS as readonly string[]).includes(t),
  );
  if (unknown.length) {
    return {
      ok: false,
      failures: [
        {
          field: "professional_status/pathway",
          problem: `resolves to tag(s) the methodology does not use: ${unknown.join(", ")}`,
        },
      ],
    };
  }

  return {
    ok: true,
    spec: {
      id,
      name,
      professionalStatus: status as ProfessionalStatus,
      pathway: pathway as Pathway,
      populationTags: [...tags],
      expectedMarkers,
      systemPrompt: body,
      sourceHash: hash,
    },
  };
}

/**
 * A persona's email address.
 *
 * `.invalid` is reserved by RFC 2606 and can never resolve, which is the point:
 * `engagement.ts`'s send loop does not exclude test accounts — only its
 * prompt-log write is guarded — so a persona with a deliverable address would
 * receive real prompt emails. Making the address undeliverable by construction
 * is a stronger guarantee than remembering to filter a send loop, and it fails
 * at the SMTP layer rather than silently mailing a stranger if a typo ever put
 * a real domain here.
 */
export function personaEmail(id: string): string {
  return `persona+${id}@sli-harness.invalid`;
}
