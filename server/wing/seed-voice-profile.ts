import { initScript, type ScriptDb } from "../script-init";
import { voiceProfiles, voiceProfileComponents } from "@shared/wing-schema";
import {
  allVoiceComponents,
  VOICE_PROFILE_NAME,
  UNSTATED,
  type VoiceSeedComponent,
} from "./voice-source";

/**
 * Seeds the Voice Guide and the personality directive into `voice_profiles`.
 *
 *     npm run wing:seed-voice
 *
 * ── WHAT THIS WRITES, AND WHAT IT DELIBERATELY DOES NOT ──────────────────
 * It writes one profile as a DRAFT with its components, and it publishes
 * nothing. No cycle is pointed at it. That is not caution for its own sake: this
 * text becomes the opening of every reply Wing composes, and a transcription of
 * two governing documents deserves to be read by the person who wrote them
 * before a student sees its effect. Publishing is two deliberate steps, printed
 * at the end of the run.
 *
 * Re-running is safe and additive: a new version is inserted and the previous one
 * is left exactly as it was, per the retire-never-edit rule the rest of the
 * schema follows. Nothing is updated in place, so a published profile can never
 * change under a cohort mid-cycle.
 */

/*
 * ── WHY ../db IS NOT IMPORTED AT THE TOP OF THIS FILE ────────────────────
 * `server/db.ts` builds its pool at module load and throws if DATABASE_URL is
 * absent, and on this project the URL usually arrives from Key Vault rather than
 * the environment. A static `import { db } from "../db"` is therefore evaluated —
 * and throws — before any code in main() can fetch the secret. That is exactly
 * what happened on the first run of this script: "DATABASE_URL must be set" from
 * db.ts:8, before a line of the seeder ran.
 *
 * `initScript()` hydrates the secret and only then imports the data layer. Every
 * other seed in this directory does it this way; this one did not, and the
 * failure is invisible until it runs, because nothing about the static import is
 * a type error. `voice-store` is imported dynamically below for the same reason —
 * it imports ../db too.
 */
let db: ScriptDb["db"];

function group(components: readonly VoiceSeedComponent[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of components) out[c.componentType] = (out[c.componentType] ?? 0) + 1;
  return out;
}

async function main() {
  const dry = process.argv.indexOf("--dry-run") >= 0;
  const VOICE_COMPONENTS_RESOLVED = allVoiceComponents();

  console.log("\nWing voice profile — seed from the Voice Guide and the personality directive\n");

  const counts = group(VOICE_COMPONENTS_RESOLVED);
  console.log("\n  components to write:");
  for (const type of Object.keys(counts).sort()) {
    console.log(`    ${String(counts[type]).padStart(3)}  ${type}`);
  }
  console.log(`    ${String(VOICE_COMPONENTS_RESOLVED.length).padStart(3)}  total`);

  // Every component must carry a renderable line. A blank one would be dropped
  // silently by the store, and a rule that vanishes quietly is worse than one
  // that fails loudly here.
  const blank = VOICE_COMPONENTS_RESOLVED.filter((c) => !c.key || !c.short.trim() || !c.full.trim());
  if (blank.length) {
    console.error(`\n  ${blank.length} component(s) have no key, short or full text. Nothing written.`);
    process.exit(1);
  }

  const keys = VOICE_COMPONENTS_RESOLVED.map((c) => c.key);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dupes.length) {
    console.error(`\n  duplicate key(s): ${Array.from(new Set(dupes)).join(", ")}. Nothing written.`);
    process.exit(1);
  }

  const long = VOICE_COMPONENTS_RESOLVED.filter((c) => c.short.length > 110);
  if (long.length) {
    console.log(
      `\n  note: ${long.length} short line(s) exceed 110 characters — ` +
        "these go into every turn, so they are worth tightening:",
    );
    for (const c of long) console.log(`    ${c.key} (${c.short.length})`);
  }

  /*
   * The dry run finishes before the database is touched at all, so the
   * transcription can be checked on a laptop with no DATABASE_URL and no vault
   * access. Everything above this line is a property of voice-source.ts.
   */
  if (dry) {
    console.log("\n  --dry-run: nothing written\n");
    return;
  }

  ({ db } = await initScript());
  // Dynamic, because voice-store imports ../db — see the note above.
  const { latestVoiceProfile } = await import("./voice-store");

  const previous = await latestVoiceProfile(VOICE_PROFILE_NAME);
  const version = (previous?.versionNumber ?? 0) + 1;

  if (previous) {
    console.log(
      `  existing: version ${previous.versionNumber} (${previous.status})` +
        ` — this run writes version ${version}, leaving it untouched`,
    );
  }

  const profileId = await db.transaction(async (tx) => {
    const [profile] = await tx
      .insert(voiceProfiles)
      .values({
        name: VOICE_PROFILE_NAME,
        versionNumber: version,
        status: "draft",
        notes:
          "Transcribed from Wing's Voice and Personality Guide (June 2026) and the Wing " +
          "System-Level Personality Directive (August 2026). See server/wing/voice-source.ts, " +
          "which is the reviewed source of these records.",
      })
      .returning({ id: voiceProfiles.id });

    await tx.insert(voiceProfileComponents).values(
      VOICE_COMPONENTS_RESOLVED.map((c) => ({
        voiceProfileId: profile.id,
        componentType: c.componentType as never,
        context: (c.context ?? null) as never,
        content: {
          key: c.key,
          short: c.short,
          full: c.full,
          // Only the register carries one. Absent means the rule is universal.
          ...(c.audience ? { audience: c.audience } : {}),
        },
        versionNumber: 1,
        isCurrent: true,
      })),
    );

    return profile.id;
  });

  console.log(`\n  wrote voice profile #${profileId}, version ${version}, status draft`);

  if (UNSTATED.length) {
    console.log(
      `\n  ${UNSTATED.length} thing(s) the source documents do not state, recorded rather than invented:`,
    );
    for (const u of UNSTATED) console.log(`    - ${u.what}`);
  }

  /*
   * Both steps have a screen now, and it is the right place for them: the
   * transcription should be read against the documents' own wording by whoever
   * wrote them, which is not a thing anybody does from a terminal. The store
   * functions still exist and are what that screen calls.
   */
  console.log(
    "\n  Nothing reaches a student yet. Review it, then two deliberate steps switch it on:\n" +
      "    /admin/methodology/voice  →  Review, then Publish, then give it to a cohort\n" +
      `    (the same two steps in code: publishVoiceProfile(${profileId}), then ` +
      `pointCycleAtVoiceProfile(cycleId, ${profileId}))\n`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
