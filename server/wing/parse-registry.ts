/**
 * Parses Doc 2's element registry — Appendix B and the Section 1 module table.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * Danielle's 16 September email says to use Doc 2's reconciliation table as
 * "the checklist to verify the parser caught everything". A checklist has to be
 * a list. Appendix B is a table of twenty-eight prose cells naming code RANGES
 * ("H-301–310 (excl 308→007), H-311–314"), and its own per-row counts are
 * hand-maintained — which is the failure mode every other count in this project
 * has already had. So the checklist is derived from her document mechanically
 * rather than transcribed by hand, and the derivation is the thing under test.
 *
 * ── WHAT IT REFUSES TO DO ────────────────────────────────────────────────
 * It does not repair the table. Where a row's stated count disagrees with the
 * number of codes its own cell expands to, both numbers are reported and
 * neither wins. Where a cell names no codes at all — "16 cards + H-900",
 * "3 rules" — the unexpressible fragment is recorded verbatim as a hole rather
 * than being quietly rounded into the total. Where two rows claim the same
 * code, the code is listed once and both claimants are named.
 *
 * That last one is not hypothetical. Added naively Appendix B's rows total 362
 * against a stated 329, and the difference is entirely double-counting: the
 * Content System's seventeen elements appear as their own row and again inside
 * Module 6, the module-resident exercises appear in their module rows and again
 * in the Exercise Library row, H-111 and H-923 appear twice. A seeder driven by
 * the naive sum would try to create the same card twice and a coverage report
 * driven by it would permanently read as incomplete.
 *
 * ── WHAT IT IS NOT ───────────────────────────────────────────────────────
 * It is not a card parser. It produces the set of codes the platform is
 * SUPPOSED to hold, with provenance for each claim. What each card SAYS comes
 * from the module documents, through parse-compendium and its siblings. Keeping
 * the two apart is the whole point: the expected set and the delivered set have
 * to be derivable independently or the comparison proves nothing.
 */

/* ── Types ───────────────────────────────────────────────────────────────── */

/** One row of Appendix B, as written and as expanded. */
export type RegistryRow = {
  /** The "Component" cell, verbatim. Used as the claimant name. */
  component: string;
  /** The "Codes" cell, verbatim. */
  codesCell: string;
  /** The "Count" cell. Null when it is not a bare number. */
  statedCount: number | null;
  /** The "Status" cell, verbatim — BUILT / DELIVERED / DEFERRED / SPECIFIED. */
  status: string;
  /** Codes this row's cell expands to, zero-padded as written, deduplicated. */
  codes: string[];
  /** Fragments of the cell that name no code. Holes, not noise. */
  unexpressed: string[];
  /** Codes the cell explicitly excludes, e.g. "(excl 308→007)". */
  excluded: string[];
  /** 1-based line of the row in the source document. */
  line: number;
};

/** One distinct expected element, with every Appendix B row that claims it. */
export type RegistryElement = {
  code: string;
  claimants: string[];
};

/** One row of the Section 1 module registry, for cross-checking. */
export type ModuleRegistryRow = {
  key: string;
  module: string;
  cards: number | null;
  gates: number | null;
  exercises: number | null;
  total: number | null;
  sepOne: string;
  line: number;
};

export type RegistryParseResult = {
  rows: RegistryRow[];
  /** Distinct codes, sorted. The checklist. */
  elements: RegistryElement[];
  /** Elements claimed by more than one row. */
  duplicates: RegistryElement[];
  /** Appendix B's own TOTAL row, when it states one. */
  statedTotal: number | null;
  /** Sum of the per-row stated counts — the naive 362. */
  summedStatedCounts: number;
  /** Rows whose stated count disagrees with their own expansion. */
  countMismatches: Array<{
    component: string;
    stated: number;
    expanded: number;
    unexpressed: string[];
    line: number;
  }>;
  moduleRegistry: ModuleRegistryRow[];
  /** Everything the parser could not express, in document order. */
  defects: string[];
};

/* ── Cell grammar ────────────────────────────────────────────────────────── */

/**
 * A range: a prefix, a start number, a dash, an optional repeated letter run,
 * an end number. `H-101–110`, `IG-U006–U011`, `IG-S01–S10`, `IG-M6-01–05`.
 *
 * The prefix is lazy so `IG-M6-01–05` does not bind "6" as the start number;
 * the engine backtracks until the separator and the tail both fit, which only
 * happens at `IG-M6-` / `01` / `05`. Zero-padding is taken from the START
 * endpoint, because that is the width the document is writing in.
 */
const RANGE = /^([A-Za-z][A-Za-z0-9-]*?)(\d+)\s*[–—-]\s*([A-Za-z]*)(\d+)$/;

/** A single code: `H-111`, `H-900`, `IG-M6-01`, `EX-1103`. */
const SINGLE = /^([A-Za-z][A-Za-z0-9-]*?)(\d+)$/;

/** `(excl 308→007)` and friends. Captured, then removed before tokenising. */
const EXCLUSION = /\(\s*excl[^)]*\)/gi;

/** Trailing prose on an otherwise-good fragment: `H-412 gate`, `H-701 rewrite`. */
const TRAILING_WORDS = /\s+[a-z][A-Za-z ]*$/;

function stripMarkdown(s: string): string {
  return s.replace(/\*\*/g, "").replace(/`/g, "").replace(/~~/g, "").trim();
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

/**
 * Expands one "Codes" cell.
 *
 * Splits on commas and on `+`, because Appendix B uses both as separators and
 * uses `+` in exactly one place where the left side is not a code at all
 * ("16 cards + H-900"). Returning that left side as an unexpressed fragment is
 * the correct outcome: the Exercise Library's sixteen are real elements whose
 * codes this table never writes down, and inventing them here would put a
 * parser's guess into the checklist the seeder is measured against.
 */
export function expandCodesCell(cell: string): {
  codes: string[];
  unexpressed: string[];
  excluded: string[];
} {
  const codes: string[] = [];
  const unexpressed: string[] = [];
  const excluded: string[] = [];

  const raw = stripMarkdown(cell);
  if (!raw || raw === "—") return { codes, unexpressed, excluded };

  // Pull exclusions out before tokenising; they sit inside a fragment.
  const exclusionNotes: string[] = [];
  const withoutExclusions = raw.replace(EXCLUSION, (m) => {
    exclusionNotes.push(m);
    return " ";
  });

  const fragments = withoutExclusions
    .split(/,|\s\+\s/)
    .map((f) => f.trim())
    .filter(Boolean);

  for (const fragment of fragments) {
    // `H-411–416 exercises` and `H-412 gate` are codes with a note attached.
    const bare = fragment.replace(TRAILING_WORDS, "").trim();

    const range = RANGE.exec(bare);
    if (range) {
      const [, prefix, startDigits, repeatedLetters, endDigits] = range;
      const start = Number(startDigits);
      const end = Number(endDigits);
      // `IG-U006–U011` repeats the letter; anything else is a malformed range.
      const letterOk =
        repeatedLetters === "" || prefix.toUpperCase().endsWith(repeatedLetters.toUpperCase());
      if (letterOk && end >= start && end - start < 500) {
        for (let i = start; i <= end; i++) codes.push(prefix + pad(i, startDigits.length));
        continue;
      }
    }

    const single = SINGLE.exec(bare);
    if (single) {
      codes.push(bare);
      continue;
    }

    unexpressed.push(fragment);
  }

  // Apply the exclusions against what the cell produced, so `excl 308` removes
  // H-308 from `H-301–310` rather than from the whole document.
  for (const note of exclusionNotes) {
    for (const num of note.match(/\d+/g) ?? []) {
      const hit = codes.find((c) => c.endsWith(num) && SINGLE.exec(c)?.[2] === num);
      if (hit) {
        excluded.push(hit);
        codes.splice(codes.indexOf(hit), 1);
      }
    }
  }

  return { codes: Array.from(new Set(codes)), unexpressed, excluded };
}

/* ── Document parsing ────────────────────────────────────────────────────── */

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

const SEPARATOR_ROW = /^\|[\s:|-]+\|$/;

function numberOrNull(cell: string): number | null {
  const m = /^\s*\**\s*(\d+)\s*\**\s*$/.exec(cell);
  return m ? Number(m[1]) : null;
}

export function parseRegistry(text: string): RegistryParseResult {
  const lines = text.split("\n");
  const defects: string[] = [];

  /* ── Appendix B ────────────────────────────────────────────────────────── */

  const appendixStart = lines.findIndex((l) => /^#+\s*APPENDIX B\b/i.test(l.trim()));
  if (appendixStart === -1) {
    defects.push("Appendix B not found — the document's heading has changed.");
  }

  const rows: RegistryRow[] = [];
  let statedTotal: number | null = null;

  if (appendixStart !== -1) {
    for (let i = appendixStart + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^#+\s/.test(line)) break; // next section
      if (!line.trim().startsWith("|")) continue;
      if (SEPARATOR_ROW.test(line.trim())) continue;

      const cells = tableCells(line);
      if (cells.length < 4) continue;

      const component = stripMarkdown(cells[0]);
      if (!component || /^component$/i.test(component)) continue; // header

      const count = numberOrNull(cells[2]);

      if (/^total$/i.test(component)) {
        statedTotal = count;
        continue;
      }

      const { codes, unexpressed, excluded } = expandCodesCell(cells[1]);
      rows.push({
        component,
        codesCell: cells[1].trim(),
        statedCount: count,
        status: stripMarkdown(cells[3] ?? ""),
        codes,
        unexpressed,
        excluded,
        line: i + 1,
      });
    }
  }

  /* ── Distinct elements and who claims them ─────────────────────────────── */

  const claims = new Map<string, string[]>();
  for (const row of rows) {
    for (const code of row.codes) {
      const list = claims.get(code) ?? [];
      list.push(row.component);
      claims.set(code, list);
    }
  }

  const elements: RegistryElement[] = Array.from(claims.entries())
    .map(([code, claimants]) => ({ code, claimants }))
    .sort((a, b) => compareCodes(a.code, b.code));

  const duplicates = elements.filter((e) => e.claimants.length > 1);

  /* ── The two arithmetics, kept separate on purpose ─────────────────────── */

  const summedStatedCounts = rows.reduce((sum, r) => sum + (r.statedCount ?? 0), 0);

  const countMismatches = rows
    .filter((r) => r.statedCount !== null && r.statedCount !== r.codes.length)
    .map((r) => ({
      component: r.component,
      stated: r.statedCount as number,
      expanded: r.codes.length,
      unexpressed: r.unexpressed,
      line: r.line,
    }));

  for (const row of rows) {
    for (const fragment of row.unexpressed) {
      defects.push(
        `Appendix B line ${row.line} · "${row.component}" names no code for "${fragment}" ` +
          `— these elements exist but the table never writes their codes down.`,
      );
    }
  }
  for (const dupe of duplicates) {
    defects.push(
      `${dupe.code} is claimed by ${dupe.claimants.length} rows: ${dupe.claimants.join(" · ")}`,
    );
  }

  /* ── Section 1 module registry, for the cross-check ────────────────────── */

  const moduleRegistry: ModuleRegistryRow[] = [];
  const sectionStart = lines.findIndex((l) => /^#+\s*SECTION 1:\s*MODULE REGISTRY/i.test(l.trim()));
  if (sectionStart !== -1) {
    for (let i = sectionStart + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^#+\s/.test(line)) break;
      if (!line.trim().startsWith("|")) continue;
      if (SEPARATOR_ROW.test(line.trim())) continue;

      const cells = tableCells(line);
      if (cells.length < 9) continue;
      const key = stripMarkdown(cells[0]);
      if (!key || /^#$/.test(key)) continue;

      moduleRegistry.push({
        key,
        module: stripMarkdown(cells[1]),
        cards: numberOrNull(cells[3]),
        gates: numberOrNull(cells[4]),
        exercises: numberOrNull(cells[5]),
        total: numberOrNull(cells[6]),
        sepOne: stripMarkdown(cells[8]),
        line: i + 1,
      });
    }
  } else {
    defects.push("Section 1 module registry not found — the document's heading has changed.");
  }

  return {
    rows,
    elements,
    duplicates,
    statedTotal,
    summedStatedCounts,
    countMismatches,
    moduleRegistry,
    defects,
  };
}

/* ── Ordering ────────────────────────────────────────────────────────────── */

/**
 * Sorts codes by prefix then numerically, so H-9 precedes H-10 and the list
 * reads the way the methodology is written rather than the way ASCII is.
 */
export function compareCodes(a: string, b: string): number {
  const pa = SINGLE.exec(a);
  const pb = SINGLE.exec(b);
  if (!pa || !pb) return a.localeCompare(b);
  if (pa[1] !== pb[1]) return pa[1].localeCompare(pb[1]);
  return Number(pa[2]) - Number(pb[2]);
}

/* ── Codes that exist to hold a number ───────────────────────────────────── */

/**
 * Elements the registry names that no document will ever specify, because the
 * whole point of them is that they are not in use.
 *
 * These are declared rather than derived because they are decisions, not text.
 * A parser cannot find a card that was deliberately not written; it can only
 * report a hole where one should be. Without this table the coverage report
 * would show four permanent unsourced codes and whoever read it would go
 * looking for four documents that do not exist.
 *
 * They still become rows. A retired card that vanishes from the library is a
 * number free to be reused, and reuse is how RT-14's Barnum failure would come
 * back under a different name.
 */
export const RETIRED_CODES: Readonly<Record<string, string>> = {
  "H-033": "RT-14 Clean Slate. Retired v1.7 for a Barnum failure under IG-U006 — the template survived the substitution test, which is exactly what it must not do. Doc 1 strikes it through in the reveal-template inventory.",
  "IG-RC12": "Attachment Pacing. Folded into IG-S03, number retained. Reveal Cycle v4 carries it as an open question; Doc 1 records the resolution. A gate duplicating IG-S03 would fire twice on one signal.",
};

/**
 * Numbers held open for work that is planned and not yet written.
 *
 * Doc 2 §3 lists these under "Intentional gaps", which is the distinction that
 * matters: an intentional gap is not a missing card, and a coverage report that
 * cannot tell the two apart will keep reporting the same two holes forever.
 */
export const RESERVED_CODES: Readonly<Record<string, string>> = {
  "H-706": "Reserved for Module 7 expansion. Doc 2 §3, intentional gaps. Resolved flag 13, 25 August.",
  "H-707": "Reserved for Module 7 expansion. Doc 2 §3, intentional gaps. Resolved flag 13, 25 August.",
};

export const REGISTRY_SOURCE = "methodology/wing-sot-doc2-architecture-governance.md";
