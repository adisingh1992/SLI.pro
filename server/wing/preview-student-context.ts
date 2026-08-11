import "dotenv/config";
import { initScript } from "../script-init";

/**
 * Prints the "what you already know" block for a student (Feature List A2).
 *
 * Run:  npx tsx server/wing/preview-student-context.ts <userId>
 *
 * ── WHY THIS IS WORTH A SCRIPT ───────────────────────────────────────────
 * The bug this context block fixes was invisible for months: the LinkedIn PDF
 * was uploaded, extracted, stored — and silently absent from the prompt, so
 * sessions asked for a headline the database already held. Nothing errored.
 * The only symptom was students saying the questions felt repetitive.
 *
 * A block that is empty, or missing a section, fails exactly the same way. So
 * this prints what Wing will actually be told, and names what is missing and
 * why, rather than leaving it to be inferred from a conversation going wrong.
 *
 * Read-only.
 */

async function main() {
  const userId = parseInt(process.argv[2] ?? "", 10);
  if (Number.isNaN(userId)) {
    console.error("\nUsage: npx tsx server/wing/preview-student-context.ts <wing user id>\n");
    process.exit(1);
  }

  const { pool } = await initScript();
  const docStore = await import("./document-store");
  const intakeStore = await import("./intake-store");
  const { buildStudentContext } = await import("./student-context");

  const documents = await docStore.getDocuments(userId).catch(() => []);
  const intake = await intakeStore.getBrandingIntake(userId).catch(() => undefined);

  console.log(`\n── what this student has uploaded ──`);
  if (!documents.length) {
    console.log("   (nothing)");
  } else {
    for (const d of documents) {
      const text = d.analysisContent?.trim() || d.extractedText?.trim() || "";
      console.log(
        `   ${d.type.padEnd(12)} ${d.name.slice(0, 40).padEnd(42)} ` +
          (text ? `${text.length} chars` : "NO TEXT — extraction produced nothing"),
      );
    }
  }

  const responses = (intake?.responses as Record<string, unknown>) ?? {};
  console.log(`\n── intake fields captured: ${Object.keys(responses).length} ──`);
  if (Object.keys(responses).length) {
    console.log("   " + Object.keys(responses).join(", "));
  }

  const context = await buildStudentContext(userId);

  console.log(`\n── sections in the prompt: ${context.included.join(", ") || "NONE"} ──`);
  console.log(`   ${context.chars} characters\n`);

  for (const expected of ["linkedin", "resume", "intake"]) {
    if (!context.included.includes(expected)) {
      const reason =
        expected === "intake"
          ? "no intake answers stored — has this student completed the intake?"
          : `no ${expected} document with usable text`;
      console.log(`   !! "${expected}" missing — ${reason}`);
    }
  }

  console.log(`\n${"═".repeat(72)}`);
  console.log(context.text || "(empty — Wing will go into the session knowing nothing)");
  console.log(`${"═".repeat(72)}\n`);

  await pool.end();
}

main().catch((e) => {
  console.error("preview failed:", e);
  process.exit(1);
});
