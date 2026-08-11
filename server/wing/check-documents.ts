import "dotenv/config";
import { initScript, type ScriptDb } from "../script-init";

/**
 * Finds documents that exist as rows but not as files.
 *
 * Run:  npm run wing:check-documents
 *
 * ── WHY THIS IS NOT VISIBLE ANYWHERE ELSE ────────────────────────────────
 * `Buffer.from(x, "base64")` returns an empty buffer rather than throwing when
 * given something that is not base64. Until the guard added alongside this
 * script, that meant a malformed upload wrote a perfectly ordinary-looking row
 * — a name, a type, a blob URI — with `size_bytes = 0` and no content behind
 * it. The admin screen listed the document; the download button produced
 * nothing; nobody had a reason to click it.
 *
 * The cost is silent and lands on the student: Wing's session prompt is built
 * from these documents, and A2's whole design is that it reads their resume and
 * LinkedIn export rather than re-asking. A phantom document produces a
 * measurably more generic session with no error anywhere.
 *
 * Read-only. Reports; fixes nothing.
 */

let pool: ScriptDb["pool"];
const q = async (sql: string) => (await pool.query(sql)).rows;

async function main() {
  ({ pool } = await initScript());

  const rows = await q(`
    select d.id,
           d.name,
           d.doc_type::text                  as doc_type,
           d.size_bytes,
           d.extracted_text is null          as no_text,
           coalesce(length(d.extracted_text), 0) as text_len,
           d.uploaded_at,
           u.email
      from wing.documents d
      join wing.students s on s.id = d.student_id
      join wing.users u    on u.id = s.user_id
     order by d.size_bytes asc, d.uploaded_at desc
  `);

  const empty = rows.filter((r: any) => Number(r.size_bytes) < 100);
  const noText = rows.filter(
    (r: any) => Number(r.size_bytes) >= 100 && Number(r.text_len) === 0,
  );

  console.log(`\n${rows.length} document(s) across the cohort\n`);

  if (empty.length === 0) {
    console.log("  \x1b[32m✓\x1b[0m none are empty");
  } else {
    console.log(`  \x1b[31m✗\x1b[0m ${empty.length} document(s) have no content:`);
    for (const r of empty as any[]) {
      console.log(
        `      #${String(r.id).padEnd(5)} ${String(r.doc_type).padEnd(9)} ` +
          `${String(r.size_bytes).padStart(6)}B  ${r.email}  ${r.name}`,
      );
    }
    console.log(
      `\n      These were written before the upload guard existed. The rows are\n` +
        `      the only trace — the blob behind them is empty too, so there is\n` +
        `      nothing to recover. Ask the student to re-upload, then delete the\n` +
        `      row so Wing stops counting a document it cannot read.`,
    );
  }

  /*
   * A file with bytes but no extracted text is a second, quieter failure: the
   * document is stored and downloadable, but the session prompt gets nothing
   * from it, because the prompt is built from `extracted_text` and not from
   * the blob.
   */
  if (noText.length > 0) {
    console.log(
      `\n  \x1b[33m!\x1b[0m ${noText.length} document(s) have a file but no extracted text:`,
    );
    for (const r of noText as any[]) {
      console.log(
        `      #${String(r.id).padEnd(5)} ${String(r.doc_type).padEnd(9)} ` +
          `${Math.round(Number(r.size_bytes) / 1024)}KB  ${r.email}  ${r.name}`,
      );
    }
    console.log(
      `\n      Wing builds session prompts from extracted_text, not from the\n` +
        `      stored file — so these reach the student's record but not their\n` +
        `      session. Worth checking the parse step for the file type.`,
    );
  }

  /* Which students have neither a usable resume nor a usable LinkedIn export. */
  const bare = await q(`
    select u.email,
           count(*) filter (where d.doc_type::text = 'resume'   and d.size_bytes >= 100)::int as resume,
           count(*) filter (where d.doc_type::text = 'linkedin' and d.size_bytes >= 100)::int as linkedin
      from wing.students s
      join wing.users u on u.id = s.user_id
      left join wing.documents d on d.student_id = s.id
     group by u.email
     having count(*) filter (where d.size_bytes >= 100) = 0
     order by u.email
  `);

  if (bare.length > 0) {
    console.log(
      `\n  \x1b[33m!\x1b[0m ${bare.length} student(s) have no readable document at all:`,
    );
    for (const r of bare as any[]) console.log(`      ${r.email}`);
    console.log(
      `\n      Their sessions will be noticeably more generic — Wing has nothing\n` +
        `      to read, so it asks rather than references.`,
    );
  }

  console.log("");
  await pool.end();
}

main().catch((err) => {
  console.error("[check-documents] failed:", err);
  process.exit(1);
});
