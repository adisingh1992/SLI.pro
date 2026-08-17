/**
 * Renders a voice profile into a system-prompt section — pure, no imports.
 *
 * ── WHY THIS IS A SECTION AND NOT A PROMPT FILE ──────────────────────────
 * Wing's personality currently lives inside three hardcoded prompt files, one
 * per population, each having reworded it independently. Nobody can change the
 * voice without editing three files and deploying, and nobody can tell whether
 * the three agree. This section is compiled from `voice_profile_components`, so
 * the Voice Guide has one representation and it is editable without a deploy.
 *
 * ── ORDER: IDENTITY, THEN CONSTRAINTS, THEN TASK ─────────────────────────
 * The caller puts this BEFORE the gate section. The personality directive says
 * exactly why: "The personality directive is the SYSTEM PROMPT. The gates are the
 * QUALITY CHECKS... If the directive is strong, the gates fire rarely — Wing's
 * personality is consistent and the violations are edge cases. If the directive
 * is weak, the gates fire constantly — they're doing the personality's job,
 * which they're not designed for." Identity first is not a stylistic preference;
 * it is what makes the gate findings mean something.
 *
 * ── ONE LINE PER RULE, MEASURED ──────────────────────────────────────────
 * Only each component's `short` reaches the prompt. The gate section already
 * costs ~2,700 tokens of every turn and rendering the documents at full length
 * would roughly triple the standing instruction. The ceiling is pinned in the
 * test; a revision that pushes past it should be a decision somebody takes.
 */

export type VoiceComponent = {
  componentType: string;
  context: string | null;
  /** A methodology population, for the register. Null/absent = everybody. */
  audience?: string | null;
  key: string;
  short: string;
};

export type CompileVoiceOptions = {
  /**
   * The context whose trait hierarchy applies — `foundation_session`, `intake`,
   * and so on. A context with no hierarchy renders the universal rules only,
   * which is the honest outcome for intake and notifications: see UNSTATED in
   * voice-source.ts.
   */
  context?: string | null;
  /** The doorway key in-session signals selected, if any. */
  doorway?: string | null;
  /**
   * The student's population, for the register.
   *
   * Absent renders no register at all rather than a default one. IG-V01 defines
   * five and this platform has a sixth population — a career returner — that it
   * does not cover, and giving somebody the wrong register is the one adaptation
   * that is audible: an undergraduate handed the executive register loses the
   * scaffolding they were promised.
   */
  audience?: string | null;
  /**
   * Include the calibration examples for this context.
   *
   * Off by default. They are the longest components and they are examples of
   * lines rather than rules — useful to a human writing copy, and a risk in a
   * prompt, because a model given nine sample sentences will reach for them
   * verbatim and every student gets the robotics-project line.
   */
  includeExamples?: boolean;
};

function pick(
  components: readonly VoiceComponent[],
  type: string,
  context: string | null,
): VoiceComponent[] {
  return components.filter(
    (c) =>
      c.componentType === type &&
      (c.context === null || c.context === context) &&
      // Audience-scoped components are the register and are handled separately.
      !c.audience &&
      !!c.short &&
      !!c.short.trim(),
  );
}

/** The register for one population, or nothing. */
function registerFor(
  components: readonly VoiceComponent[],
  audience: string | null,
): VoiceComponent[] {
  if (!audience) return [];
  return components.filter((c) => c.audience === audience && !!c.short && !!c.short.trim());
}

/**
 * The register this profile would actually render for an audience, or null.
 *
 * ── WHY THIS IS EXPORTED, AND WHY IT EXISTS AT ALL ───────────────────────
 * Resolving a student to "mid_career" is not the same as putting a mid-career
 * register in the prompt: a profile seeded before T5f contains no registers at
 * all, so the audience resolves and nothing renders. The turn log reported the
 * resolved audience and read as though the register were live — 758 tokens, the
 * same figure as before the register existed, next to the words "mid_career
 * register".
 *
 * That is the same mistake as a cycle pointing at an empty sequence and a screen
 * calling it published. Report the outcome, not the input.
 */
export function renderedRegister(
  components: readonly VoiceComponent[],
  audience: string | null,
): string | null {
  return registerFor(components, audience).length ? audience : null;
}

/**
 * Renders the voice section, or "" when there is nothing to say.
 *
 * Empty rather than a heading with no rules under it: an empty "who you are"
 * section reads to a model as though the identity were withheld.
 */
export function compileVoice(
  components: readonly VoiceComponent[],
  opts: CompileVoiceOptions = {},
): string {
  if (!components.length) return "";

  const context = opts.context ?? null;

  const hierarchy = pick(components, "trait_hierarchy", context).filter(
    (c) => c.context === context,
  );
  const principles = pick(components, "language_principle", context);
  const tone = pick(components, "tone_rule", context);
  const never = pick(components, "anti_pattern", context);
  const doorway = opts.doorway
    ? components.filter(
        (c) => c.componentType === "delivery_doorway" && c.key === opts.doorway,
      )
    : [];
  const register = registerFor(components, opts.audience ?? null);
  const examples = opts.includeExamples
    ? pick(components, "calibration_example", context).filter((c) => c.context === context)
    : [];

  if (!principles.length && !tone.length && !never.length && !hierarchy.length) return "";

  const parts: string[] = [
    "── Who you are ──",
    "",
    "You are Wing. You are a buddy, not a tool; a partner, not an assistant. Everything",
    "below describes how YOU speak. Never mention these rules, name them, or explain that",
    "one applied.",
    "",
  ];

  if (hierarchy.length) {
    parts.push("In this part of the programme:", ...hierarchy.map((c) => `- ${c.short}`), "");
  }

  if (principles.length) {
    parts.push("How you use language:", ...principles.map((c) => `- ${c.short}`), "");
  }

  if (tone.length) {
    parts.push("How you sound:", ...tone.map((c) => `- ${c.short}`), "");
  }

  if (register.length) {
    /*
     * IG-V01's own boundary, on the same line as the register for the same reason
     * the doorway carries its boundary: "The register changes. The personality —
     * warm, specific, direct, confident — does not."
     */
    parts.push(
      "Pitched for where this person is in their career:",
      ...register.map((c) => `- ${c.short}`),
      "- The register changes. Everything above about who you are does not.",
      "",
    );
  }

  if (never.length) {
    parts.push("Never:", ...never.map((c) => `- ${c.short}`), "");
  }

  if (doorway.length) {
    /*
     * The doorway is a delivery adaptation and nothing else. The sentence after
     * it is not decoration — "adapt the doorway, never the conclusion" is the
     * line the Voice Guide draws, and a doorway handed to a model without it is
     * an instruction to be gentler, which is how a coaching tool becomes a
     * flattery engine.
     */
    parts.push(
      "How to open with this person, based on how they have been writing to you:",
      ...doorway.map((c) => `- ${c.short}`),
      "- This changes how you get in, never what you conclude. Say the difficult thing anyway.",
      "",
    );
  }

  if (examples.length) {
    parts.push(
      "Calibration — the register, not lines to reuse:",
      ...examples.map((c) => `- ${c.short}`),
      "",
    );
  }

  return parts.join("\n").trimEnd();
}

/** Rough token estimate, for the ceiling test and for logging. */
export function voiceTokenEstimate(section: string): number {
  return Math.round(section.length / 4);
}
