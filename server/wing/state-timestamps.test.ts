import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

console.log("\nWing state lifecycle timestamps\n");

const migration = readFileSync("migrations/0037_wing_state_timestamps.sql", "utf8");
const migrationCode = migration.replace(/--.*$/gm, "");
const schema = readFileSync("shared/wing-schema.ts", "utf8");
const messaging = readFileSync("server/wing/messaging-store.ts", "utf8");

test("the migration is Wing-only", () => {
  assert.doesNotMatch(migrationCode, /[".]public[".]/i);
  assert.match(migrationCode, /"wing"\."user_channel_preferences"/);
  assert.match(migrationCode, /"wing"\."engagement_sequence_states"/);
});

test("preference creation is backfilled from the owning Wing user", () => {
  assert.match(migrationCode, /ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone/);
  assert.match(migrationCode, /FROM "wing"\."users"/);
  assert.match(migrationCode, /"user"\."created_at"/);
  assert.match(migrationCode, /ALTER COLUMN "created_at" SET NOT NULL/);
});

test("sequence updates use activity evidence, never the future scheduler cursor", () => {
  assert.match(migrationCode, /latest_sequence_event/);
  assert.match(migrationCode, /FROM "wing"\."message_events"/);
  assert.match(migrationCode, /state\."started_at"/);
  assert.match(migrationCode, /state\."completed_at"/);
  assert.doesNotMatch(migrationCode, /next_run_at/);
  assert.match(migrationCode, /ALTER COLUMN "updated_at" SET NOT NULL/);
});

test("the Drizzle schema exposes both lifecycle fields", () => {
  const preferences = schema.slice(
    schema.indexOf("export const userChannelPreferences"),
    schema.indexOf("export const institutions"),
  );
  const sequences = schema.slice(
    schema.indexOf("export const engagementSequenceStates"),
    schema.indexOf("export const messageEvents"),
  );
  assert.match(preferences, /createdAt: tsNow\("created_at"\)/);
  assert.match(sequences, /updatedAt: tsNow\("updated_at"\)/);
});

test("advancing a sequence maintains updated_at with the same clock value", () => {
  const advance = messaging.slice(
    messaging.indexOf("export async function advanceSequence"),
    messaging.indexOf("export async function dueSequences"),
  );
  assert.match(advance, /const now = new Date\(\)/);
  assert.match(advance, /completedAt: params\.done \? now : null/);
  assert.match(advance, /updatedAt: now/);
});

console.log(failed ? `\n${failed} failed\n` : "\nall passed\n");
if (failed) process.exit(1);
