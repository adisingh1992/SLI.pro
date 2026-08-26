/**
 * Approved changes to her methodology that are not yet in her documents.
 *
 * Pure. Reads nothing, writes nothing; a table and the functions that check it.
 *
 * ── WHY A LAYER AND NOT AN EDIT ──────────────────────────────────────────
 * The rule this project already runs on: "Corrections live beside the source, never
 * inside it. The compendium stays exactly as delivered and approved changes are an
 * explicit table, each quoting the email that authorises it. Editing the committed
 * document would be quicker and would destroy the one property that makes it useful —
 * that it is the file she sent."
 *
 * `parse-compendium.ts` already has that table for two kinds of change: a card's code,
 * and its intervention type. Neither can express the change she actually sends most
 * often, which is new wording for one component of one card.
 *
 * ── WHY IT IS FIND-AND-REPLACE AND NOT A WHOLE COMPONENT ─────────────────
 * Because most of the queue is a single word. There are 196 population claims in the
 * corpus and by her own gate's permitted alternatives, 82 are a word that can simply be
 * deleted and 49 are a swap for language IG-RC13 already allows. Expressing those as
 * whole-component replacements would mean restating hundreds of lines of her copy to
 * change one adverb, and every restatement is a chance to drift a word without anyone
 * noticing. A find-and-replace shows exactly what changed.
 *
 * ── THE PROPERTY THAT MAKES IT SAFE ──────────────────────────────────────
 * **Every `find` must match exactly once.** Zero matches means the patch is stale — she
 * reissued the document with the change already made — and the entry has to be deleted.
 * More than one match means it is ambiguous and would change text nobody reviewed.
 *
 * Both are loud. This project has been bitten once already by the quiet version: a
 * correction keyed on a code that had been renamed found nothing and printed "not
 * seeded, nothing to rename" — a clean run, and a database quietly disagreeing with the
 * parser. A patch that silently does nothing is worse than no patch.
 *
 * ── WHAT THIS DOES NOT DO YET ────────────────────────────────────────────
 * No parser consults it. Wiring it in changes parsed bodies and therefore body hashes,
 * which is what the seeders use to detect a revision — a real blast radius that wants a
 * run against the database rather than a green unit test. The table and its verification
 * come first so the entries are reviewable and provably live; the wiring is its own step.
 */
import type { ComponentKey } from "./parse-compendium";

/** The seven-component card body a `newCard` patch supplies. */
export type CardBody = Record<ComponentKey, string>;

export type Patch =
  /** New wording for part of one component of one card. */
  | {
      kind: "component";
      /** Filename under `methodology/`, so a patch is checked against the right document. */
      document: string;
      code: string;
      component: ComponentKey;
      /** Must appear exactly once in that component. */
      find: string;
      /** Empty string deletes. */
      replace: string;
      why: string;
    }
  /** A card she has sent that is not in any document yet. */
  | {
      kind: "newCard";
      /** Where it will live when she reissues. Checked for absence, not presence. */
      document: string;
      code: string;
      name: string;
      module: string;
      body: CardBody;
      /**
       * Set when the code is already occupied and her version governs anyway.
       *
       * Two effects, deliberately from one flag: the document's card of this code is
       * dropped (`supersededDocumentCards`), and the entry is verified by the occupant
       * still being THERE rather than by the code being free. A supersession whose
       * occupant has vanished is stale — she reissued — and must be re-read, not applied.
       */
      supersedes?: {
        /** What the document currently holds under this code. */
        occupantIs: string;
        /** Where the occupant's protection lands once it is superseded. */
        carriedForwardBy: string;
        /** True when the occupant is a published card, which changes how it is replaced. */
        occupantIsLive: boolean;
      };
      why: string;
    };

const V18 = "wing-intake-heuristic-cards-v1.8.md";

export const PATCHES: readonly Patch[] = [
  /* ── RT-06, the corrected copy she sent on 25 August ─────────────────── */
  {
    kind: "component",
    document: V18,
    code: "H-025",
    component: "coaching_move",
    find:
      "GAP: 'But you said \"[their exact minimizing language].\" Your words made it sound " +
      "small. I don't think it is.'",
    replace:
      "GAP: 'You told people you're \"[Q5 exact words],\" but the thing you're actually good " +
      "at is \"[Q6 exact words].\" Those are telling two different stories.'",
    why:
      "Danielle, 25 August: \"The underselling pattern lives in the gap between Q5 (how they " +
      "present) and Q6 (what they're actually good at), not in Q6 alone… The coaching_move " +
      "should cross-reference both questions: 'You told people you're [Q5 words],' but the " +
      "thing you're actually good at is '[Q6 exact words].' Those are telling two different " +
      "stories.'\" This is what took RT-06 off the disabled list: v3.3's IG-INT12 forbids " +
      "resting an inference on one self-assessment, and the card as delivered inferred from " +
      "Q6 alone.",
  },
  {
    kind: "component",
    document: V18,
    code: "H-025",
    component: "coaching_move",
    find:
      "Q9: 'If someone who worked with you closely heard you describe that skill the way you " +
      "just did, would they agree with the \"[exact minimizing word]\" framing — or would they " +
      "push back?'",
    replace: "Q9: 'What makes you describe yourself smaller than your evidence?'",
    why:
      "Danielle, 25 August: \"The Q9 follow-up: 'What makes you describe yourself smaller " +
      "than your evidence?'\" Her replacement is shorter and asks the user for the cause " +
      "rather than for a prediction about a third party — which the old one did, and which " +
      "is a Tier 3 construction by her own evidence grading.",
  },
  {
    kind: "component",
    document: V18,
    code: "H-025",
    component: "delivery_adaptation",
    find:
      " Mid-career: Less common but when it fires, often gendered. Wing does NOT use " +
      "demographic signals to select templates but notes frequency pattern.",
    replace: "",
    why:
      "Danielle, 24 August, instructing the cut: the note is a frequency claim about a " +
      "population Wing has no data on, which is what IG-RC13 bans. Her ruling of 25 August " +
      "settles where the concern does belong — \"IG-S10 finds its home when the user enters " +
      "Module 6. Not in intake\" — so removing it from an intake card leaves nothing " +
      "unprotected. The whole Mid-career clause goes: with the frequency note removed it has " +
      "no adaptation left to state.",
  },

  /* ── H-209, which exists only in her email ───────────────────────────── */
  {
    kind: "newCard",
    document: "wing-master-module-compendium-v2.md",
    code: "H-209",
    name: "H-209 Aspiration ≠ Evidence",
    module: "foundation_2",
    body: {
      signal:
        "User states a positioning goal as if it were established fact (\"I'm a strategy " +
        "person\") without corresponding evidence from their career history.",
      detection_method:
        "Cross-data comparison — self-description language vs. evidence inventory.",
      intervention_type: "CALIBRATE",
      coaching_move:
        "Wing separates the aspiration from the evidence without invalidating either. \"You " +
        "want to be known for strategy — that's the goal. Let's see what evidence you have " +
        "for it. If the evidence points somewhere else, that doesn't mean strategy is wrong. " +
        "It means we need to build the evidence base.\"",
      delivery_adaptation:
        "External-frame users need the aspiration validated before the evidence gap is " +
        "surfaced. Internal-frame users can hear the gap directly.",
      success_criteria:
        "User engages with the evidence question rather than defending the aspiration.",
      failure_path:
        "If user insists — \"I hear you. Let's look at the evidence together and see what it " +
        "says. You might be right and we just need to document it.\"",
    },
    supersedes: {
      occupantIs:
        "Compendium v2, line 381: \"H-209 — Never Conflate Aspiration with Evidence\". META, a " +
        "system rule. Signal: \"Wing is about to treat a user's stated aspiration or desire as " +
        "credibility evidence.\" Detection: content analysis on Wing's OWN output. It policed " +
        "Wing; hers coaches the user. Same principle, same number, two different cards.",
      carriedForwardBy:
        "The output-check half does not go missing. IG-S08 — added to the safety compile on 25 " +
        "August at her instruction — is unconditional in every prompt and says \"never invent " +
        "evidence… do not embellish, upgrade or reframe what someone has done beyond what their " +
        "own words support\". That is a stronger home than a card behind a sequence pointer: a " +
        "prompt constant cannot be switched off by a missing pointer. What her version changes " +
        "is the intervention type, META to CALIBRATE, so the same principle arrives as a " +
        "coaching move rather than a pre-output filter. Worth her knowing it reads that way.",
      occupantIsLive: true,
    },
    why:
      "Sent in full by Danielle on 25 August, in answer to our third request for it, after we " +
      "reported it missing. It was not missing: we asked three times for a card we already " +
      "had under that number, which is on us. Applied under the standing authority order — " +
      "her later word supersedes the document — on Aditya's instruction to take the latest " +
      "version. She also settled that H-209 is a different gate from H-210, which arrived " +
      "instead of it twice: \"H-210 (ice bucket sequencing) is about delivering a gap with the " +
      "redirect in the same breath. H-209 is the Foundation 2 principle that aspiration is not " +
      "evidence.\"\n\n" +
      "TWO THINGS SHE SHOULD SEE. First, the Reveal Cycle cites H-209 for \"hypothetical " +
      "prompts elicit aspiration; H-209 prohibits conflating aspiration with evidence\", which " +
      "reads like the META gate it is replacing rather than a coaching card — so she may want " +
      "both to exist under two numbers. Second, the occupant is LIVE: H-209 is inside Tier 1 " +
      "scope, among the 53 cards in sequence version 5 that SLI.pro Direct 2026 points at. " +
      "Replacing it is a body change to a published card, so it goes through the component " +
      "versioning path — appended, never mutated, so an application logged last week still " +
      "points at the wording that was actually used — and never through a re-seed.",
  },
];

/* ── Applying ───────────────────────────────────────────────────────────── */

/** The patched text for one component, and whether anything changed. */
export function patchComponent(
  documentOrPath: string,
  code: string,
  component: ComponentKey,
  text: string,
): { text: string; applied: number } {
  const document = basename(documentOrPath);
  let out = text;
  let applied = 0;
  for (const p of PATCHES) {
    if (p.kind !== "component") continue;
    if (p.document !== document || p.code !== code || p.component !== component) continue;
    if (out.indexOf(p.find) < 0) continue;
    out = out.split(p.find).join(p.replace);
    applied++;
  }
  return { text: out, applied };
}

/** Cards she has sent that no document carries yet. */
export function newCards(): Array<Extract<Patch, { kind: "newCard" }>> {
  const out: Array<Extract<Patch, { kind: "newCard" }>> = [];
  for (const p of PATCHES) if (p.kind === "newCard") out.push(p);
  return out;
}

/**
 * Codes whose version in the document must be dropped, because her card replaces it.
 *
 * Without this the pipeline produces two cards under one code — the document's and hers —
 * which is the collision this layer exists to resolve rather than duplicate.
 */
export function supersededDocumentCards(): Array<{ document: string; code: string }> {
  const out: Array<{ document: string; code: string }> = [];
  for (const p of PATCHES) {
    if (p.kind === "newCard" && p.supersedes) out.push({ document: p.document, code: p.code });
  }
  return out;
}

/** Supersessions of a card that is already published. These need the versioning path. */
export function liveSupersessions(): Array<Extract<Patch, { kind: "newCard" }>> {
  const out: Array<Extract<Patch, { kind: "newCard" }>> = [];
  for (const p of PATCHES) {
    if (p.kind === "newCard" && p.supersedes?.occupantIsLive) out.push(p);
  }
  return out;
}

/* ── The one call a seeder makes ─────────────────────────────────────────── */

/**
 * The least a card has to be for this layer to act on it.
 *
 * Structural rather than `ParsedCard`, because three parsers produce three shapes and this
 * needs all of them. The generic keeps whatever else the caller's card carries — line
 * numbers, weight, heading — so nothing is lost passing through.
 */
export type PatchableCard = {
  cardCode: string;
  components: Partial<Record<ComponentKey, string>>;
};

export type PatchReport = {
  /** Component patches that changed text, as `H-025.coaching_move`. */
  changed: string[];
  /** Document cards dropped because her version replaces them. */
  dropped: string[];
  /** Codes added from this table because no document carries them. */
  added: string[];
  /**
   * Entries for this document that matched nothing.
   *
   * The whole point of returning this. A patch that silently does nothing is the failure
   * this project has already been bitten by — a rename keyed on a stale code printed
   * "nothing to rename" and exited clean. A caller that ignores this field is choosing to,
   * rather than not being told.
   */
  inert: string[];
};

/**
 * Her approved changes applied to one document's parsed cards, in one pass.
 *
 * Three things happen, and they have to happen together or the result is worse than not
 * patching at all:
 *
 * 1. Component patches rewrite text in place.
 * 2. A superseded card is DROPPED — without this the set carries both the document's H-209
 *    and hers under one code, which is the collision this layer exists to resolve.
 * 3. Cards she has sent that the document does not carry are appended.
 *
 * Order matters for 2 and 3: the drop runs before the add, so the added card is the only
 * one left under that code.
 *
 * **What this does not do.** It does not decide how the rows reach the database. A
 * superseded card whose occupant is published is a body change to live methodology and
 * goes through the component-versioning path, appended never mutated — `liveSupersessions`
 * is what tells a seeder that, and this function will not stop a caller re-seeding.
 */
export function patchDocument<T extends PatchableCard>(
  documentOrPath: string,
  cards: readonly T[],
): { cards: Array<T | (PatchableCard & { patched: true })>; report: PatchReport } {
  /*
   * Callers hold the document as a path — `INTAKE_SOURCE` is
   * "methodology/wing-intake-heuristic-cards-v1.8.md" — while the table keys on the bare
   * filename. Comparing the two as given matches nothing and reports nothing, which is the
   * silent-no-op failure this whole file is built to refuse. So the comparison is on the
   * basename, and either form is accepted.
   */
  const document = basename(documentOrPath);
  const changed: string[] = [];
  const dropped: string[] = [];
  const added: string[] = [];
  const matched = new Set<number>();

  const superseded = new Set(
    supersededDocumentCards()
      .filter((d) => d.document === document)
      .map((d) => d.code),
  );

  const out: Array<T | (PatchableCard & { patched: true })> = [];

  for (const card of cards) {
    if (superseded.has(card.cardCode)) {
      dropped.push(card.cardCode);
      continue;
    }

    const components: Partial<Record<ComponentKey, string>> = { ...card.components };
    let touched = false;

    for (let i = 0; i < PATCHES.length; i++) {
      const p = PATCHES[i];
      if (p.kind !== "component") continue;
      if (p.document !== document || p.code !== card.cardCode) continue;
      const text = components[p.component];
      if (text === undefined || text.indexOf(p.find) < 0) continue;
      components[p.component] = text.split(p.find).join(p.replace);
      changed.push(`${p.code}.${p.component}`);
      matched.add(i);
      touched = true;
    }

    out.push(touched ? { ...card, components } : card);
  }

  for (let i = 0; i < PATCHES.length; i++) {
    const p = PATCHES[i];
    if (p.kind !== "newCard" || p.document !== document) continue;
    /*
     * A supersession only adds if it actually removed something. If the occupant was not
     * in the set, this entry believes it is replacing a card that is not here — adding it
     * anyway is how one code ends up with two bodies from two sources.
     */
    if (p.supersedes && dropped.indexOf(p.code) < 0) continue;
    out.push({ cardCode: p.code, components: { ...p.body }, patched: true });
    added.push(p.code);
    matched.add(i);
  }

  const inert: string[] = [];
  for (let i = 0; i < PATCHES.length; i++) {
    const p = PATCHES[i];
    if (p.document !== document || matched.has(i)) continue;
    inert.push(
      p.kind === "component"
        ? `${p.code}.${p.component} — its find string matched nothing`
        : `${p.code} — ${p.supersedes ? "supersedes a card this document did not carry" : "already in the document"}`,
    );
  }

  return { cards: out, report: { changed, dropped, added, inert } };
}

/* ── Verifying ──────────────────────────────────────────────────────────── */

export type Finding = {
  code: string;
  document: string;
  /** `ok` is the only state that does not need a person. */
  state: "ok" | "stale" | "ambiguous" | "document_missing" | "card_missing" | "already_present";
  detail: string;
};

/**
 * Checks every patch against the documents as they actually are.
 *
 * `components` answers "what does this card's component say in this document" and is
 * supplied by the caller, because the three parsers in this codebase disagree about
 * nothing except how to find a card, and this file should not become a fourth.
 */
export function verifyPatches(
  documents: ReadonlyMap<string, string>,
  components: (document: string, code: string, component: ComponentKey) => string | null,
): Finding[] {
  const out: Finding[] = [];

  for (const p of PATCHES) {
    if (!documents.has(p.document)) {
      out.push({
        code: p.code,
        document: p.document,
        state: "document_missing",
        detail: "the document this patch targets is not on disk",
      });
      continue;
    }

    if (p.kind === "newCard") {
      const present = components(p.document, p.code, "coaching_move");

      /*
       * A supersession is verified the other way round: the occupant has to still be
       * there. If it has gone — she reissued the document — then what this replaces no
       * longer exists, and applying it blind would add a card while believing it replaced
       * one. Stale, and re-read rather than re-run.
       */
      if (p.supersedes) {
        out.push(
          present !== null
            ? {
                code: p.code,
                document: p.document,
                state: "ok",
                detail: `supersedes the document's card, which is still there${p.supersedes.occupantIsLive ? " and is published" : ""}`,
              }
            : {
                code: p.code,
                document: p.document,
                state: "stale",
                detail:
                  "this supersedes a card the document no longer has — re-read both versions " +
                  "before applying, because it would now add rather than replace",
              },
        );
        continue;
      }

      /*
       * Inverted on purpose. An unblocked new card is verified by being ABSENT: the day she
       * reissues the document with it in, the entry is redundant and has to go, or the card
       * gets seeded twice from two sources that will drift apart.
       */
      out.push(
        present === null
          ? {
              code: p.code,
              document: p.document,
              state: "ok",
              detail: "not in the document yet, so the card here is the only copy",
            }
          : {
              code: p.code,
              document: p.document,
              state: "already_present",
              detail: "the document now carries this card — delete this entry before it is seeded twice",
            },
      );
      continue;
    }

    const text = components(p.document, p.code, p.component);
    if (text === null) {
      out.push({
        code: p.code,
        document: p.document,
        state: "card_missing",
        detail: `no ${p.component} for ${p.code} in this document`,
      });
      continue;
    }

    const count = occurrences(text, p.find);
    if (count === 0) {
      out.push({
        code: p.code,
        document: p.document,
        state: "stale",
        detail:
          `the text this patch replaces is not in ${p.component} any more — either she has ` +
          "reissued the document with the change made, in which case delete this entry, or " +
          "the wording moved and the patch needs rewriting",
      });
      continue;
    }
    if (count > 1) {
      out.push({
        code: p.code,
        document: p.document,
        state: "ambiguous",
        detail: `matches ${count} times in ${p.component}; it must match exactly once`,
      });
      continue;
    }
    out.push({
      code: p.code,
      document: p.document,
      state: "ok",
      detail: `one match in ${p.component}, ${p.replace ? "replaced" : "deleted"}`,
    });
  }

  return out;
}

/**
 * The filename part of a path, with no `node:path` import so this file stays pure.
 *
 * Both separators, because the patch table is keyed on filenames and a caller on Windows
 * would otherwise match nothing and be told nothing.
 */
function basename(p: string): string {
  const cut = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return cut < 0 ? p : p.slice(cut + 1);
}

function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i >= 0) {
    n++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}
