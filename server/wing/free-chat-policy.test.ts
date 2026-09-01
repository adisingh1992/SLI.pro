import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FREE_CHAT_CLASSIFIER_SYSTEM,
  FREE_CHAT_REPLY_CONTRACT,
  FREE_CHAT_SCOPE_CATEGORIES,
  isAnalysisEligible,
  mayGenerateReply,
  parseFreeChatReply,
  parseFreeChatScope,
  refusalFor,
} from "./free-chat-policy";

let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok — ${name}`);
  } catch (error) {
    failed++;
    console.error(`  FAIL — ${name}: ${(error as Error).message}`);
  }
}

console.log("\nscoped free chat — policy, persistence and analysis boundary\n");

test("the classifier vocabulary is closed and every category is documented", () => {
  assert.equal(FREE_CHAT_SCOPE_CATEGORIES.length, 9);
  for (const category of FREE_CHAT_SCOPE_CATEGORIES) {
    assert.match(FREE_CHAT_CLASSIFIER_SYSTEM, new RegExp(`- ${category}:`));
    assert.equal(parseFreeChatScope({ category, confidence: 0.9 }).category, category);
  }
});

test("malformed, invented and low-confidence classifications fail closed", () => {
  for (const raw of [
    null,
    {},
    { category: "general_chat", confidence: 1 },
    { category: "career", confidence: "1" },
    { category: "career", confidence: 0.54 },
  ]) {
    assert.equal(parseFreeChatScope(raw).category, "classification_error");
  }
});

test("only scoped career material can enter longitudinal analysis", () => {
  assert.equal(isAnalysisEligible("career"), true);
  assert.equal(isAnalysisEligible("career_adjacent"), true);
  for (const category of [
    "crisis", "harm", "abuse", "sexual", "off_topic", "nonsense",
    "prompt_injection", "classification_error",
  ] as const) {
    assert.equal(isAnalysisEligible(category), false, category);
  }
});

test("only in-scope and crisis messages reach a generative reply", () => {
  assert.equal(mayGenerateReply("career"), true);
  assert.equal(mayGenerateReply("career_adjacent"), true);
  assert.equal(mayGenerateReply("crisis"), true);
  for (const category of ["harm", "abuse", "sexual", "off_topic", "nonsense", "prompt_injection"] as const) {
    assert.equal(mayGenerateReply(category), false, category);
    assert.ok(refusalFor(category).length > 40, category);
  }
});

test("reply flags use strict booleans and safety implies distress", () => {
  assert.deepEqual(parseFreeChatReply({ reply: "  Here. ", distress: false, safetyHold: false }), {
    reply: "Here.", distress: false, safetyHold: false,
  });
  assert.deepEqual(parseFreeChatReply({ reply: "Here.", distress: false, safetyHold: true }), {
    reply: "Here.", distress: true, safetyHold: true,
  });
  assert.equal(parseFreeChatReply({ reply: "Here.", safetyHold: "true" }).safetyHold, false);
  assert.match(FREE_CHAT_REPLY_CONTRACT, /JSON and nothing else/);
});

test("the store uses ongoing engagement, provenance, safety and the analysis filter", () => {
  const store = readFileSync("server/wing/free-chat-store.ts", "utf8");
  assert.match(store, /SESSION_TYPE = "ongoing_engagement"/);
  assert.match(store, /recordHumanTurn\(/);
  assert.match(store, /recordAiTurn\(/);
  assert.match(store, /analysisEligible: eligible/);
  assert.match(store, /turn\.analysisEligible \|\| turn\.id === humanTurn\.id/);
  assert.match(store, /excludeTurnFromAnalysis\(/);
  assert.match(store, /compileSafety\(\)/);
  assert.match(store, /openHold\(/);
  assert.match(store, /engine\.loadTurnGates/);
  assert.match(store, /voice\.voiceSectionFor/);
});

test("routes are student-only, bounded and per-user rate limited", () => {
  const routes = readFileSync("server/free-chat-routes.ts", "utf8");
  assert.match(routes, /isStudent/);
  assert.match(routes, /rateLimitByUser/);
  assert.match(routes, /content\.length > 6000/);
  assert.match(routes, /\/api\/wing\/free-chat\/message/);
  const root = readFileSync("server/routes.ts", "utf8");
  assert.match(root, /registerFreeChatRoutes\(app\)/);
});

test("migration and human-memory read agree on analysis eligibility", () => {
  const migration = readFileSync("migrations/0036_transcript_analysis_scope.sql", "utf8");
  const provenance = readFileSync("server/wing/provenance.ts", "utf8");
  assert.match(migration, /analysis_eligible/);
  assert.match(migration, /analysis_exclusion_reason/);
  assert.match(provenance, /eq\(transcriptTurns\.analysisEligible, true\)/);
});

test("excluded turns stay out of every longitudinal analysis path", () => {
  for (const file of [
    "server/wing/classifier-training.ts",
    "server/wing/classify-backlog.ts",
    "server/wing/classifier.ts",
    "server/wing/evidence-portfolio.ts",
    "server/wing/scoring.ts",
    "server/wing/tagging-store.ts",
  ]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /analysisEligible/, file);
  }
});

console.log(failed ? `\n${failed} failed\n` : "\nall passed\n");
if (failed) process.exit(1);
