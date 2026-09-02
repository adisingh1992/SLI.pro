/**
 * IG-M6-01 / Spec 4 — building the prompt an image model is asked to draw
 * an article's header image from. Pure, no DB, no model call — the same
 * shape as `content-cadence.ts`: everything here is testable by calling it
 * and reading the string back.
 *
 * ── WHY THE TOPIC COMES FROM THE DRAFT TEXT, NOT THE TRIGGER'S OWN REASON ──
 * `content-trigger-detect.ts`'s `detectArticleTrigger` reason strings answer
 * "why is this student eligible for an article now" (3+ posts, comfort,
 * topic depth, a Radar topic, a Module 8 insight) — a mix of eligibility
 * signals, not reliably a topic sentence. IG-IMG-02 requires the image
 * relate to the article's ACTUAL topic, and the most reliable source for
 * that is what the student is actually writing, not why Wing suggested
 * writing something. So the caller (the generate-image route) passes an
 * excerpt of the student's own current draft text, not the trigger reason.
 *
 * ── IG-IMG-01'S CONSTRAINTS, AS NEGATIVE INSTRUCTIONS ─────────────────────
 * The card's own Implementation line says exactly this: "Constraints encoded
 * in the DALL-E prompt as negative instructions. Azure OpenAI content filter
 * provides a second screening layer." The list below is the card's bullet
 * list verbatim, restated as prompt instructions — the content filter is the
 * second layer, handled in `orchestrator.generateImage` (a 400 becomes
 * `ImageGenerationBlockedError`), not duplicated here.
 *
 * ── WHAT ISN'T HERE: AN AUTOMATED RELEVANCE CHECK (IG-IMG-02) ─────────────
 * The card requires the generated image relate to the topic; this file
 * grounds the prompt in the real excerpt so a relevant image is what gets
 * asked for, but nothing here (or anywhere in this pass) verifies the
 * RESULT actually matches — that would need a vision-capable check on the
 * generated image, a second model call this scope doesn't build. IG-IMG-03's
 * own "accept, request changes, or skip" flow is what actually catches an
 * irrelevant image today: a human looks at it. Flagged rather than silently
 * assumed solved.
 */

export interface ArticleImagePromptInput {
  /** The student's own current draft text (or a leading excerpt of it) — the
   *  real topic signal, per the header note above. */
  draftExcerpt: string;
  /** Foundation 1's function, or Q5.5's topic area — `radarEligibility`'s own
   *  `primaryFunction ?? topicArea` fallback. Null when neither exists; the
   *  prompt still works, just with one less grounding detail. */
  functionArea: string | null;
  /** IG-M6-01's own examples for option (b) — "more abstract," "cooler
   *  colors," "focus on the technology angle." Only present on a regenerate
   *  requested after the first image. */
  direction?: string;
}

const MAX_EXCERPT_CHARS = 600;

/** A short, model-facing summary of what the excerpt is about — not a
 *  second model call, just the excerpt itself, trimmed. Good enough to
 *  ground the image prompt; the model reads the excerpt directly rather
 *  than a paraphrase this function would have to invent. */
function excerptFor(draftExcerpt: string): string {
  const trimmed = draftExcerpt.trim();
  if (trimmed.length <= MAX_EXCERPT_CHARS) return trimmed;
  return trimmed.slice(0, MAX_EXCERPT_CHARS).trim() + "…";
}

export function buildArticleImagePrompt(input: ArticleImagePromptInput): string {
  const excerpt = excerptFor(input.draftExcerpt);

  const lines: string[] = [
    "Design a header image for a professional LinkedIn article. The image " +
      "must feel like a professional publication's header — abstract, " +
      "conceptual, or illustrative. Never literal, never stock-photo-like, " +
      "never a rendering of a specific scene from the text below.",
    "",
    `The article is about: ${excerpt}`,
  ];

  if (input.functionArea) {
    lines.push(`The author's professional function area: ${input.functionArea}.`);
  }

  if (input.direction) {
    lines.push(`Requested direction for this version: ${input.direction}.`);
  }

  lines.push(
    "",
    "Required constraints:",
    "- No sexual, suggestive, or phallic imagery",
    "- No pornographic content",
    "- No violent, aggressive, or threatening imagery",
    "- No weapons, blood, or injury",
    "- No real people's faces or likenesses",
    "- No copyrighted characters, logos, or brand imagery",
    "- No political imagery used divisively",
    "- No imagery that could be interpreted as discriminatory",
    "- No literal text, words, or lettering rendered in the image",
    "- Professional aesthetic only — appropriate for LinkedIn",
  );

  return lines.join("\n");
}
