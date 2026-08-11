import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Static guards on two mistakes this codebase has made repeatedly.
 *
 * Neither is the kind of bug a type checker catches, because both produce
 * perfectly well-typed code that does the wrong thing. Both were found by a
 * person noticing something looked odd on screen, which is not a strategy.
 *
 * Run as part of `npm test`.
 */

const SERVER = join(process.cwd(), "server");

function serverFiles(): { path: string; name: string; src: string }[] {
  return readdirSync(SERVER)
    .filter((f) => f.endsWith(".ts"))
    .map((name) => {
      const path = join(SERVER, name);
      return { path, name, src: readFileSync(path, "utf8") };
    });
}

let failures = 0;
const fail = (msg: string) => {
  console.error(`  ✗ ${msg}`);
  failures++;
};

/* ── 1 · No denylist serialisation of a user ──────────────────────────────
 *
 * `const { passwordHash, ...rest } = user; res.json(rest)` looks safe and is
 * not: it ships `linkedinAccessToken` and `linkedinRefreshToken` to the
 * browser, because a denylist only excludes what somebody remembered. This
 * shipped three times — on `/api/user`, on `/api/admin/users/:id`, and on the
 * whole-cohort list, where it exposed every student's OAuth credentials in one
 * response.
 *
 * The rule: if you drop `passwordHash` by destructuring, you must drop the
 * tokens in the same statement.
 */
console.log("\nNo user object is serialised by denylist");
for (const { name, src } of serverFiles()) {
  const pattern = /const\s*\{\s*passwordHash\s*,\s*\.\.\.(\w+)\s*\}\s*=/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(src))) {
    const line = src.slice(0, m.index).split("\n").length;
    fail(
      `${name}:${line} spreads a user after removing only passwordHash — ` +
        `linkedinAccessToken/linkedinRefreshToken travel with '${m[1]}'. ` +
        `Name the fields you intend to send instead.`,
    );
  }
}
if (!failures) console.log("  ok");

/* ── 2 · No user id crosses the schema boundary ───────────────────────────
 *
 * `public.users.id` and `wing.users.id` number the same people differently —
 * the identity migration assigned fresh serials and kept no mapping. An
 * endpoint that lists ids from one table while its neighbour resolves the
 * other silently returns a different person, and every derived field is
 * computed from that third party's data.
 *
 * That is exactly what the admin student list did until it was found by
 * clicking a row and getting somebody else. Nothing raised: both ids exist,
 * both resolve to a real human, every row looks plausible.
 *
 * `storage` is the legacy accessor. Route files must not read users from it.
 */
console.log("\nNo route reads users from the legacy accessor");
const before = failures;
for (const { name, src } of serverFiles()) {
  if (name === "database-storage.ts" || name === "storage.ts") continue;

  for (const call of ["storage.getAllUsers(", "storage.getNonAdminUsers(", "storage.getUser("]) {
    let from = 0;
    for (;;) {
      const at = src.indexOf(call, from);
      if (at < 0) break;
      from = at + 1;

      // Ignore mentions inside comments — these files explain the rule at length.
      const lineStart = src.lastIndexOf("\n", at) + 1;
      const linePrefix = src.slice(lineStart, at).trimStart();
      if (linePrefix.startsWith("*") || linePrefix.startsWith("//")) continue;

      const line = src.slice(0, at).split("\n").length;
      fail(
        `${name}:${line} calls ${call}) — that reads public.users and returns ` +
          `legacy ids. Use identity.listUsers()/getUser(), which every other ` +
          `endpoint resolves against.`,
      );
    }
  }
}
if (failures === before) console.log("  ok");

/* ── 3 · The funnel labels agree across the boundary ──────────────────────
 *
 * `cohort-summary.ts` emits stage names as SQL string literals; the students
 * screen turns them into a step number by `FUNNEL.indexOf(...)`. When the
 * lookup misses, `stepOf()` returns 0 — so a renamed or mistyped label does
 * not throw, does not warn, and does not show a blank. It shows the student as
 * "Registered" with an empty progress bar, which looks exactly like a student
 * who has genuinely done nothing.
 *
 * That is the failure mode this project keeps meeting: a plausible wrong answer
 * from a lookup that quietly missed. There is no type across a SQL/TSX
 * boundary, so this compares the two lists directly.
 */
console.log("\nFunnel labels match between the query and the screen");
{
  const before3 = failures;
  const sql = readFileSync(join(SERVER, "wing", "cohort-summary.ts"), "utf8");
  const emitted = new Set([
    ...Array.from(sql.matchAll(/then\s+'([^']+)'/g), (m) => m[1]),
    "Registered",
  ]);

  const screen = readFileSync(
    join(process.cwd(), "client", "src", "pages", "admin", "students-page.tsx"),
    "utf8",
  );
  const block = screen.slice(screen.indexOf("const FUNNEL = ["));
  const funnel = new Set(
    Array.from(block.slice(0, block.indexOf("];")).matchAll(/"([^"]+)"/g), (m) => m[1]),
  );

  for (const label of Array.from(emitted)) {
    if (!funnel.has(label)) {
      fail(`cohort-summary emits "${label}", which FUNNEL does not contain — renders as step 0`);
    }
  }
  for (const label of Array.from(funnel)) {
    if (!emitted.has(label)) {
      fail(`FUNNEL lists "${label}", which the query never emits — an unreachable stage`);
    }
  }

  // The screen also renders a short label per stage; a missing one falls back
  // to the full sentence and blows the column width out.
  const shortBlock = screen.slice(screen.indexOf("const SHORT: Record<string, string> = {"));
  const short = new Set(
    Array.from(shortBlock.slice(0, shortBlock.indexOf("};")).matchAll(/"([^"]+)":/g), (m) => m[1]),
  );
  for (const label of Array.from(funnel)) {
    if (!short.has(label)) fail(`no short label for "${label}"`);
  }

  if (failures === before3) console.log(`  ok — ${funnel.size} stages`);
}

/* ── 4 · The admin record query stays lean ────────────────────────────────
 *
 * `wing.documents.extracted_text` holds the full text of a resume and a
 * LinkedIn PDF export — tens to hundreds of kilobytes per row. A bare
 * `.select()` picks it up silently, and the code reads identically whether the
 * table has four small columns or one enormous one. That is what made the admin
 * student record screen slow: megabytes serialised to render a filename.
 *
 * This guards the one query that serves that screen. Other callers of the
 * documents table genuinely need the text — the session prompt builder, for
 * one — so this is deliberately not a global ban.
 */
console.log("\nAdmin student record query selects explicit columns");
{
  const before4 = failures;

  /*
   * Comments stripped first. This file documents at length exactly which
   * columns it is avoiding and why — so a check that greps the raw text flags
   * the explanation of the rule as a violation of it. That is not a hypothetical:
   * it is what happened on the first run.
   */
  const src = readFileSync(join(SERVER, "wing", "student-record.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  if (/\.select\(\s*\)/.test(src)) {
    fail(
      "student-record.ts uses a bare .select() — that pulls documents.extracted_text " +
        "and the analysis jsonb into a payload that renders a filename.",
    );
  }
  for (const column of ["extractedText", "analysis"]) {
    if (src.includes(column)) {
      fail(`student-record.ts references \`${column}\`, which this screen never renders`);
    }
  }
  if (failures === before4) console.log("  ok");
}

/* ── 5 · Demographic answers are withheld from institution admins ─────────
 *
 * `RESTRICTED_INTAKE_KEYS` is a hand-maintained list, and the intake schema it
 * has to cover lives in another file, in another language, owned by whoever is
 * editing the questionnaire. Adding "Disability status" to the Demographics
 * section is a one-line change that would ship that answer to every Berkeley
 * and Vanderbilt admin, with nothing anywhere to say so.
 *
 * A list that must stay in sync with a list somebody else edits is not a
 * control unless something checks it.
 */
console.log("\nDemographic intake keys are withheld from institution admins");
{
  const before5 = failures;
  const record = readFileSync(join(SERVER, "wing", "student-record.ts"), "utf8");

  const declared = record.slice(record.indexOf("const RESTRICTED_INTAKE_KEYS = ["));
  const restricted = new Set(
    Array.from(declared.slice(0, declared.indexOf("];")).matchAll(/"([a-z_]+)"/g), (m) => m[1]),
  );

  const schema = readFileSync(
    join(process.cwd(), "client", "src", "lib", "intake-admin-schema.ts"),
    "utf8",
  );

  const sensitive = new Set<string>();
  // Every key any platform files under Demographics.
  for (const block of schema.matchAll(/name: "Demographics",\s*questions: \[([\s\S]*?)\]/g)) {
    for (const k of block[1].matchAll(/key: "([a-z_]+)"/g)) sensitive.add(k[1]);
  }
  // Plus first-generation status, which is filed under a different heading on
  // two of the three platforms — gating by section name alone would leak it.
  for (const k of schema.matchAll(/key: "(first_generation[a-z_]*)"/g)) sensitive.add(k[1]);

  for (const key of Array.from(sensitive)) {
    if (!restricted.has(key)) {
      fail(
        `intake key "${key}" is demographic but is not in RESTRICTED_INTAKE_KEYS — ` +
          `it would be sent to institution admins`,
      );
    }
  }

  if (failures === before5) console.log(`  ok — ${sensitive.size} key(s) withheld`);
}

/* ── 6 · Every migration is in drizzle's journal ──────────────────────────
 *
 * `npm run db:migrate` — what the deployment pipeline runs inside the VNet —
 * does not apply the `migrations/*.sql` files. It applies whatever
 * `migrations/meta/_journal.json` lists. A hand-written `.sql` file with no
 * journal entry is not "pending"; it is invisible, and the migrator reports
 * success having done nothing.
 *
 * That is how six migrations came to exist in the repo, be listed in
 * `db:wing-ddl`, be applied to stage by hand, and never once be applied by the
 * pipeline. Anyone reading the folder would reasonably conclude the deploy
 * covers them.
 *
 * The reverse — a journal entry whose file is gone — is worse: drizzle throws
 * on a missing file, so the deploy breaks rather than lying.
 */
console.log("\nEvery migration file is in drizzle's journal");
{
  const before6 = failures;
  const dir = join(process.cwd(), "migrations");

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.replace(/\.sql$/, ""))
    .sort();

  const journal = JSON.parse(
    readFileSync(join(dir, "meta", "_journal.json"), "utf8"),
  ) as { entries: { tag: string }[] };
  const tags = new Set(journal.entries.map((e) => e.tag));

  for (const file of files) {
    if (!tags.has(file)) {
      fail(
        `${file}.sql is not in meta/_journal.json — the deployment pipeline ` +
          `will never apply it, and will report success anyway`,
      );
    }
  }
  for (const tag of Array.from(tags)) {
    if (!files.includes(tag)) {
      fail(`_journal.json lists "${tag}" but no such .sql file exists — db:migrate will throw`);
    }
  }

  if (failures === before6) console.log(`  ok — ${files.length} migration(s)`);
}

/* ── Result ──────────────────────────────────────────────────────────── */
if (failures) {
  console.error(`\n${failures} contract violation(s)\n`);
  process.exit(1);
}
console.log("\nall passed\n");
