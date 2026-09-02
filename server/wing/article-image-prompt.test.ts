import assert from "node:assert/strict";
import { buildArticleImagePrompt } from "./article-image-prompt";

/**
 * Tests for the article-header-image prompt builder (IG-M6-01 / Spec 4).
 * Pure module — real execution, no DB, no model call.
 */

let failures = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${(err as Error).message}`);
  }
}

console.log("\narticle-image-prompt\n");

test("grounds the prompt in the draft excerpt, not a generic topic", () => {
  const prompt = buildArticleImagePrompt({
    draftExcerpt: "Supply chain optimization is about to change with AI-driven forecasting.",
    functionArea: null,
  });
  assert.match(prompt, /Supply chain optimization/);
});

test("includes the function area when given, omits the line when null", () => {
  const withFn = buildArticleImagePrompt({
    draftExcerpt: "A piece about product management.",
    functionArea: "Product Management",
  });
  assert.match(withFn, /Product Management/);

  const withoutFn = buildArticleImagePrompt({
    draftExcerpt: "A piece about product management.",
    functionArea: null,
  });
  assert.doesNotMatch(withoutFn, /function area/);
});

test("includes the requested-changes direction only when given", () => {
  const withDirection = buildArticleImagePrompt({
    draftExcerpt: "A piece about design systems.",
    functionArea: null,
    direction: "more abstract, cooler colors",
  });
  assert.match(withDirection, /more abstract, cooler colors/);

  const withoutDirection = buildArticleImagePrompt({
    draftExcerpt: "A piece about design systems.",
    functionArea: null,
  });
  assert.doesNotMatch(withoutDirection, /Requested direction/);
});

test("IG-IMG-01's full constraint list is present, as negative instructions", () => {
  const prompt = buildArticleImagePrompt({
    draftExcerpt: "A piece about negotiation tactics.",
    functionArea: null,
  });
  const required = [
    /sexual, suggestive, or phallic/,
    /pornographic/,
    /violent, aggressive, or threatening/,
    /weapons, blood, or injury/,
    /real people's faces or likenesses/,
    /copyrighted characters, logos, or brand imagery/,
    /political imagery used divisively/,
    /discriminatory/,
    /Professional aesthetic only/,
  ];
  for (const re of required) {
    assert.match(prompt, re, `missing constraint matching ${re}`);
  }
});

test("never literal / never stock-photo instruction is present", () => {
  const prompt = buildArticleImagePrompt({
    draftExcerpt: "A piece about hiring.",
    functionArea: null,
  });
  assert.match(prompt, /Never literal, never stock-photo-like/);
});

test("a very long excerpt is truncated, not sent verbatim", () => {
  const long = "topic ".repeat(300); // well over 600 chars
  const prompt = buildArticleImagePrompt({ draftExcerpt: long, functionArea: null });
  assert.ok(prompt.length < long.length + 500, "prompt should not embed the full 1800+ char excerpt");
  assert.match(prompt, /…/);
});

console.log(failures ? `\n${failures} failure(s)\n` : "\nall passed\n");
process.exitCode = failures ? 1 : 0;
