import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Static guards on the mistakes this codebase has made repeatedly.
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

/* ── 7 · Migrations from 0008 on are safe to replay ───────────────────────
 *
 * `db:migrate` (drizzle, in the pipeline) and `db:wing-ddl` (psql, by hand)
 * have both been used against the same databases, and drizzle only skips what
 * its own tracking table records. A migration applied by one path is
 * indistinguishable from a pending one to the other — so every migration has
 * to survive being run a second time.
 *
 * 0008 is the boundary: it is where the two paths first diverged on stage, and
 * everything from there has been rewritten with guards. 0000–0007 predate the
 * convention, are recorded in drizzle's table, and are deliberately left alone
 * — editing them would change their hashes and make drizzle re-run them.
 *
 * Guarding DDL is the easy half. `UPDATE` in a migration is the half that
 * matters: 0010's backfill would have recomputed every `card_code` from the
 * name, discarding deduplication suffixes and breaking a UNIQUE constraint that
 * had been fine for months. Re-runnable is not the same as harmless.
 */
console.log("\nMigrations from 0008 are safe to replay");
{
  const before7 = failures;
  const dir = join(process.cwd(), "migrations");

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && f >= "0008")
    .sort();

  for (const file of files) {
    // Comments explain the rule at length; they must not be read as code.
    const code = readFileSync(join(dir, file), "utf8").replace(/--.*$/gm, "");

    /*
     * CREATE TYPE is counted separately from the rest.
     *
     * Postgres has no `CREATE TYPE IF NOT EXISTS`, so the only way to make one
     * replayable is the `DO $$ ... EXCEPTION WHEN duplicate_object` block that
     * drizzle-kit itself emits — the same idiom this check already credits for
     * ADD CONSTRAINT below. Lumping it into the IF NOT EXISTS tally made the
     * arithmetic accidental: 0019 passed only because its two ADD COLUMN IF NOT
     * EXISTS clauses happened to cover its two DO-guarded CREATE TYPEs, and 0021
     * failed while being demonstrably replay-safe.
     */
    const creates = (code.match(/\bcreate (table|index|unique index)\b/gi) ?? []).length;
    const guards = (code.match(/if not exists/gi) ?? []).length;
    if (creates > guards) {
      fail(`${file}: ${creates} CREATE(s) but only ${guards} IF NOT EXISTS — fails on replay`);
    }

    const constraints = (code.match(/add constraint/gi) ?? []).length;
    const createTypes = (code.match(/\bcreate type\b/gi) ?? []).length;
    const handled = (code.match(/duplicate_object/gi) ?? []).length;
    if (createTypes + constraints > handled) {
      fail(
        `${file}: ${createTypes} CREATE TYPE and ${constraints} ADD CONSTRAINT but only ` +
          `${handled} EXCEPTION WHEN duplicate_object block(s) — Postgres has neither ` +
          `CREATE TYPE IF NOT EXISTS nor ADD CONSTRAINT IF NOT EXISTS, so each needs one`,
      );
    }

    // An UPDATE outside a conditional guard will re-run against live data.
    const updates = (code.match(/^\s*update\s/gim) ?? []).length;
    const conditional = /\bif exists\b/i.test(code) || /\bAND\s+s\."?onboarding/i.test(code);
    if (updates > 0 && !conditional) {
      fail(
        `${file}: has ${updates} UPDATE(s) with no conditional guard — a replay would ` +
          `overwrite current data with whatever the migration originally wrote`,
      );
    }
  }

  if (failures === before7) console.log(`  ok — ${files.length} migration(s) checked`);
}

/* ── 8 · The chat stream's event names match on both sides ────────────────
 *
 * The Foundation Session turn is an SSE stream, and its event vocabulary is a
 * contract expressed as string literals in two files that never see each other.
 * Nothing type-checks it, nothing fails when it drifts, and the failure is not
 * an error — it is a branch that quietly never runs.
 *
 * It had drifted. The client listened for `user_message` and `complete`; the
 * server sent `turn_complete`, `done` and `session_completed`. So the handler
 * that refetched the session after a turn never fired, which meant Wing's reply
 * was never written into the rendered message list — it lived only in React
 * state, and the next turn's `setStreamingResponse('')` erased it.
 *
 * That is the whole of the "text disappears" report: not a rendering bug, a
 * refetch that was wired to an event nobody was sending.
 */
console.log("\nChat stream events match between server and client");
{
  const before8 = failures;

  const server = readFileSync(join(SERVER, "foundation-sessions-routes.ts"), "utf8");
  const client = readFileSync(
    join(process.cwd(), "client", "src", "pages", "foundation-session-chat.tsx"),
    "utf8",
  );

  const emitted = new Set(
    Array.from(server.matchAll(/type:\s*"([a-z_]+)"/g), (m) => m[1]),
  );
  const handled = new Set(
    Array.from(client.matchAll(/event\.type === '([a-z_]+)'/g), (m) => m[1]),
  );

  // A handled event the server never sends is dead code that looks alive —
  // and is exactly how this broke.
  for (const name of Array.from(handled)) {
    if (!emitted.has(name)) {
      fail(`the chat client handles "${name}", which the server never emits`);
    }
  }

  // `done` needs no branch: the client stops when the body ends. Everything
  // else carries information the UI has to act on.
  for (const name of Array.from(emitted)) {
    if (name === "done") continue;
    if (!handled.has(name)) {
      fail(`the server emits "${name}", which the chat client ignores`);
    }
  }

  if (failures === before8) {
    console.log(`  ok — ${emitted.size} event(s) emitted, ${handled.size} handled`);
  }
}

/* ── 9 · Azure OpenAI is the only model provider ──────────────────────────
 *
 * A second provider lived in the orchestrator through the Replit migration so
 * the MVP's prompts could be re-tuned without the app going dark in between.
 * Its models are no longer available to this project, and the path is gone.
 *
 * ── WHAT THIS ACTUALLY GUARDS ────────────────────────────────────────────
 * Not "don't call Anthropic" — nobody is going to do that deliberately. The
 * failure mode was the *fallback*: `activeProvider()` returned the second
 * provider whenever AZURE_OPENAI_ENDPOINT was unset, so a config mistake did
 * not fail. It routed elsewhere, hit a missing key, and surfaced as an
 * authentication error several layers from the variable that was actually
 * wrong. A provider that only runs when configuration is broken is worse than
 * no provider, because it converts a loud failure into a quiet one.
 *
 * So the rule is: exactly one provider, and a missing endpoint is an error.
 * Any reintroduction — an SDK import, or a read of a credential that no longer
 * has a home — fails the build here rather than being discovered in a log.
 */
console.log("\nAzure OpenAI is the only model provider");
{
  const before9 = failures;

  const FORBIDDEN = [
    { re: /@anthropic-ai\/sdk/, what: "an Anthropic SDK import" },
    { re: /\bANTHROPIC_[A-Z_]+/, what: "an ANTHROPIC_* environment variable" },
    { re: /\bCLAUDE_MODEL\b/, what: "the legacy CLAUDE_MODEL variable" },
    { re: /\bLLM_PROVIDER\b/, what: "LLM_PROVIDER (there is only one provider)" },
  ];

  // Walk server/ recursively — the orchestrator is a subdirectory, and the
  // first version of this check only looked at the top level, which would have
  // missed the exact file it exists to watch.
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      return e.isFile() && p.endsWith(".ts") ? [p] : [];
    });

  for (const path of walk(SERVER)) {
    // This file names the strings it forbids, so it would flag itself.
    if (path.endsWith("api-contracts.test.ts")) continue;
    const src = readFileSync(path, "utf8");
    for (const { re, what } of FORBIDDEN) {
      if (re.test(src)) {
        fail(`${path.replace(process.cwd() + "/", "")} contains ${what}`);
      }
    }
  }

  // The dependency too — an unused SDK in package.json is a package that gets
  // installed, audited and shipped in the image for no reason.
  const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const name of ["@anthropic-ai/sdk", "anthropic"]) {
    if (deps[name]) fail(`package.json still depends on '${name}'`);
  }

  if (failures === before9) {
    console.log("  ok — Azure OpenAI is the only provider, in code and in deps");
  }
}

/* ── 10 · No side effect inside a React state updater ─────────────────────
 *
 * `setPending(p => { if (...) throw new Error(...); return p; })` reads as
 * ordinary control flow and is not. The `setPending` call returns normally;
 * React invokes the updater later, during its render phase. So the throw does
 * not land in the surrounding `try/catch` — it surfaces as a render error, and
 * React's response to an unhandled render error is to unmount the entire tree.
 *
 * The visible result was a blank page, twenty minutes into a Foundation
 * Session, from a line written to *improve* error handling. StrictMode
 * double-invokes updaters in development, so it also fired twice.
 *
 * The rule is the React one, and it is absolute: an updater must be pure. It
 * may compute the next state from the previous state and nothing else — no
 * throwing, no fetching, no other setState, no logging that matters.
 *
 * This scans for a `throw` between `setX(` and the end of its arrow body. It
 * is a shallow check by construction; the point is to catch the shape that has
 * already cost a session, not to be a linter.
 */
console.log("\nNo throw inside a React state updater");
{
  const before10 = failures;

  const walkClient = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return walkClient(p);
      return e.isFile() && (p.endsWith(".tsx") || p.endsWith(".ts")) ? [p] : [];
    });

  // `setFoo((x) => { ... })` — the block-bodied updater form, which is the only
  // one that can contain a statement like `throw`.
  const updater = /\bset[A-Z]\w*\(\s*\(?[^)]*\)?\s*(?::[^=]+)?=>\s*\{/g;

  for (const path of walkClient(join(process.cwd(), "client", "src"))) {
    const src = readFileSync(path, "utf8");
    let m: RegExpExecArray | null;
    while ((m = updater.exec(src))) {
      // Walk to the matching brace so nested objects don't end the body early.
      let depth = 1;
      let i = m.index + m[0].length;
      for (; i < src.length && depth > 0; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") depth--;
      }
      const body = src.slice(m.index + m[0].length, i);
      if (/\bthrow\b/.test(body)) {
        const line = src.slice(0, m.index).split("\n").length;
        fail(
          `${path.replace(process.cwd() + "/", "")}:${line} throws inside a ` +
            `state updater — it will escape the surrounding try/catch and ` +
            `unmount the tree. Throw in the async function instead.`,
        );
      }
    }
  }

  if (failures === before10) console.log("  ok");
}

/* ── 11 · Every cached namespace has someone who clears it ────────────────
 *
 * The turn path now caches published criteria, methodology, objective sets and
 * intervention cards for sixty seconds. That is a deliberate trade — those
 * rows are immutable once published, so a cached copy can be stale but not
 * wrong — and it removed most of the seven seconds of prompt assembly.
 *
 * The way it goes bad is not subtle and is entirely predictable: someone adds
 * `cache.cached("templates:…")` on a new read, ships it, and never adds the
 * matching `invalidate`. Editing the thing in the admin UI then appears to do
 * nothing. It works after a minute, or after a redeploy, or on a colleague's
 * machine — which is the worst possible signature, because it trains people to
 * distrust the editor rather than look for a cache.
 *
 * So every namespace that is read must be cleared by someone.
 *
 * ── COMMENTS ARE NOT CALLS ───────────────────────────────────────────────
 * Read as code, not as prose. This block used to scan raw source, so the two
 * sentences above — which quote both calls to explain the rule — counted as a
 * real read and a real clear of a "templates:" namespace nothing has. Harmless
 * there, and not harmless in general: retiring the objective renderer left
 * three clears of "cards:" with no reader, and a comment in the file explaining
 * why would have registered as the missing reader and hidden the finding.
 *
 * The same rule the migration checks already follow, in their words: a CREATE
 * in a comment is not a statement, and an IF NOT EXISTS in a comment is not a
 * guard.
 */
console.log("\nEvery cached namespace is invalidated somewhere");
{
  const before11 = failures;

  const walkServer = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return walkServer(p);
      return e.isFile() && p.endsWith(".ts") ? [p] : [];
    });

  const readNamespaces = new Map<string, string>(); // prefix -> where
  const clearedNamespaces = new Set<string>();

  for (const path of walkServer(SERVER)) {
    if (path.endsWith("api-contracts.test.ts")) continue;
    if (path.endsWith("published-cache.ts")) continue; // the module itself
    if (path.endsWith("published-cache.test.ts")) continue; // exercises both sides

    // Local, like every other block's copy: each check is a scope of its own so
    // a later one cannot quietly depend on an earlier one's helpers.
    const src = readFileSync(path, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    for (const m of Array.from(src.matchAll(/cache\.cached\(\s*[`"']([a-z_]+):/g))) {
      if (!readNamespaces.has(m[1])) {
        readNamespaces.set(m[1], path.replace(process.cwd() + "/", ""));
      }
    }
    for (const m of Array.from(src.matchAll(/cache\.invalidate\(\s*[`"']([a-z_]+):/g))) {
      clearedNamespaces.add(m[1]);
    }
  }

  for (const [ns, where] of Array.from(readNamespaces)) {
    if (!clearedNamespaces.has(ns)) {
      fail(
        `"${ns}:" is cached (${where}) but nothing calls ` +
          `cache.invalidate("${ns}:") — an edit to it will appear to do nothing ` +
          `for up to a minute, and only on the replica that served the write.`,
      );
    }
  }

  // The reverse is harmless (clearing a namespace nobody reads) but is usually
  // a rename that only got done on one side, so it is worth saying.
  for (const ns of Array.from(clearedNamespaces)) {
    if (!readNamespaces.has(ns)) {
      fail(`cache.invalidate("${ns}:") clears a namespace nothing reads — a stale name?`);
    }
  }

  if (failures === before11) {
    console.log(`  ok — ${readNamespaces.size} namespace(s), all cleared`);
  }
}

/* ── 12 · The WebSocket upgrade path agrees, and is not exclusive ─────────
 *
 * Two separate contracts, both broken at once, both silent.
 *
 * (a) The path the server accepts and the path the browser dials are string
 *     literals in two files. Same shape as the SSE event names in check 8:
 *     change one and voice transcription stops working with no error anywhere,
 *     because a rejected upgrade is not an exception.
 *
 * (b) `upgrade` is an event, not a router — Node delivers it to every
 *     listener. The voice handler used to `socket.destroy()` anything that was
 *     not its own path, which assumed it was the only WebSocket on the server.
 *     In development it is not: Vite's HMR socket shares the port. That
 *     `else` branch severed the HMR handshake, Vite read the closed socket as
 *     "server connection lost", reloaded the page, and reconnected — an
 *     infinite reload loop that made the app unusable.
 *
 * The rule: handle your path, return on everything else.
 */
console.log("\nWebSocket upgrade path agrees and is not exclusive");
{
  const before12 = failures;

  const handler = readFileSync(
    join(SERVER, "realtime", "websocket-handler.ts"),
    "utf8",
  );
  const client = readFileSync(
    join(process.cwd(), "client", "src", "hooks", "use-voice-recording.tsx"),
    "utf8",
  );

  const serverPaths = new Set(
    Array.from(handler.matchAll(/pathname === ['"]([^'"]+)['"]/g), (m) => m[1]),
  );
  const clientPaths = new Set(
    Array.from(client.matchAll(/\$\{window\.location\.host\}(\/[a-z/]+)/g), (m) => m[1]),
  );

  for (const p of Array.from(clientPaths)) {
    if (!serverPaths.has(p)) {
      fail(`the voice client dials "${p}", which the upgrade handler does not accept`);
    }
  }
  if (serverPaths.size === 0 || clientPaths.size === 0) {
    fail("could not find the WebSocket path on one side — this check has gone stale");
  }

  /*
   * Strip comments before looking for the destroy: this handler now explains
   * the rule at length, and the explanation contains the code it forbids.
   * Check 4 hit exactly this and it is an easy mistake to repeat.
   */
  const code = handler
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  if (/\belse\s*\{[^}]*socket\.destroy\(\)/.test(code)) {
    fail(
      "the upgrade handler destroys sockets on paths it does not own — that " +
        "kills Vite's HMR socket, which shares this server in development, and " +
        "produces an infinite reload loop. Return instead.",
    );
  }

  if (failures === before12) {
    console.log(`  ok — ${Array.from(serverPaths).join(", ")}, non-owned upgrades untouched`);
  }
}

/* ── 13 · Audio never leaves the Azure boundary ───────────────────────────
 *
 * Voice dictation used to fall back to OpenAI's API directly whenever the
 * Azure transcription deployment was missing or returned an error. The flag
 * that controlled it, `TRANSCRIBE_FALLBACK_TO_OPENAI`, was opt-OUT — so the
 * default was to send a student's recorded voice to a third party outside the
 * tenancy, and a configuration mistake did not fail. It quietly changed where
 * the audio went.
 *
 * ── WHY THIS ONE GETS A TEST OF ITS OWN ──────────────────────────────────
 * Check 9 already forbids a second *model* provider, and this would arguably
 * fall under it. It is separated because the failure is a different kind:
 * that one is about consistency, this one is about a promise made to
 * institutions. Voice is the most identifying content the product handles —
 * not a record of what a student said, but their actual voice — and "where
 * does the audio go" is a question Berkeley and Vanderbilt will ask in
 * procurement. A named check answers it.
 *
 * `AzureOpenAI` is imported from the `openai` package and is fine; it is the
 * default export — a plain OpenAI client — that talks to api.openai.com.
 */
console.log("\nAudio cannot leave the Azure boundary");
{
  const before13 = failures;

  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      return e.isFile() && p.endsWith(".ts") ? [p] : [];
    });

  const FORBIDDEN = [
    { re: /\bnew OpenAI\s*\(/, what: "a direct OpenAI client (`new OpenAI(...)`)" },
    { re: /\bOPENAI_API_KEY\b/, what: "OPENAI_API_KEY" },
    { re: /\bTRANSCRIBE_FALLBACK_TO_OPENAI\b/, what: "the removed transcription fallback flag" },
    { re: /api\.openai\.com/, what: "a hardcoded api.openai.com URL" },
    // `import OpenAI from "openai"` is the plain client. The named
    // `{ AzureOpenAI }` import is the one we want and must still pass.
    { re: /import\s+OpenAI\s+from\s+["']openai["']/, what: "the default (non-Azure) OpenAI import" },
    { re: /import\(\s*["']openai["']\s*\)/, what: "a dynamic import of the OpenAI SDK" },
  ];

  for (const path of walk(SERVER)) {
    if (path.endsWith("api-contracts.test.ts")) continue;
    // Strip comments: this codebase explains its rules at length, and check 4
    // has already been caught flagging the explanation of a rule as a breach
    // of it.
    const src = readFileSync(path, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    for (const { re, what } of FORBIDDEN) {
      if (re.test(src)) {
        fail(
          `${path.replace(process.cwd() + "/", "")} contains ${what} — ` +
            `audio and prompts must stay inside the Azure tenancy.`,
        );
      }
    }
  }

  // And the transcription path must actually be reachable: a deployment name
  // with no client to send it to is the same outage as no deployment at all.
  const orch = readFileSync(join(SERVER, "orchestrator", "index.ts"), "utf8");
  for (const needed of [
    "AZURE_OPENAI_DEPLOYMENT_WHISPER",
    "AZURE_OPENAI_ENDPOINT_ALT",
    "AZURE_OPENAI_KEY_ALT",
  ]) {
    if (!orch.includes(needed)) {
      fail(`the orchestrator never reads ${needed} — transcription cannot reach its resource`);
    }
  }

  if (failures === before13) {
    console.log("  ok — transcription is Azure-only, on the ALT resource");
  }
}

/* ── 14 · Exactly one React Query client ──────────────────────────────────
 *
 * There were two, in `lib/query-client.ts` and `lib/queryClient.ts` — one
 * hyphen apart, each exporting a `queryClient` and an `apiRequest` with
 * different signatures. App.tsx handed the provider the first one; 46 files
 * imported the second and called `invalidateQueries` on it. Those calls did not
 * throw. They resolved successfully against a cache with no observers.
 *
 * Nothing reports this. The mutation succeeds, the server is correct, the toast
 * fires, and the screen keeps showing the old value until a manual reload. It
 * cost us the entire admin methodology UI appearing not to save, and an SLI
 * refinement flow that resubmitted its pre-refinement row every time — which in
 * turn meant the three-refinement cap counted to one forever.
 *
 * A provider mismatch is invisible to the type checker and to every test that
 * does not render the real tree, so the only cheap guard is arithmetic: one
 * instance, or fail.
 */
console.log("\nExactly one React Query client is constructed");
{
  const before14 = failures;
  const root = join(process.cwd(), "client", "src");

  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
    });

  // Comments stripped first, as in check 13: both client modules now *describe*
  // this rule at length, and the description contains the literal being
  // searched for. Scanning raw source flags the explanation as the breach.
  const stripped = (p: string) =>
    readFileSync(p, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

  const built = walk(root).filter((p) => /\bnew QueryClient\s*\(/.test(stripped(p)));

  if (built.length !== 1) {
    fail(
      `${built.length} file(s) construct a QueryClient — expected exactly 1: ` +
        built.map((p) => p.replace(root + "/", "")).join(", "),
    );
  }

  // And the provider must be handed that instance, not a locally built one.
  const app = stripped(join(root, "App.tsx"));
  if (!/QueryClientProvider\s+client=\{queryClient\}/.test(app)) {
    fail("App.tsx does not pass the imported `queryClient` to QueryClientProvider");
  }

  if (failures === before14) {
    console.log(`  ok — one client, in ${built[0]?.replace(root + "/", "")}`);
  }
}

/* ── 15 · Admin guards are not aliased ────────────────────────────────────
 *
 * Five route files opened with `import { isPlatformAdmin as isAdmin }`. Every
 * route in them then read `isAdmin`, so 28 routes that were correctly locked to
 * SLIpro staff looked — to a reader, to a reviewer, and to every grep anyone
 * ran while auditing this — exactly like the routes that are open to any
 * administrator.
 *
 * That cost real time: an audit of who can reach what has to resolve each file's
 * import before it can classify a single route, and an audit that needs a
 * footnote to be correct is one that will eventually be read without it. The
 * inverse alias is the dangerous version — `import { isAdmin as isPlatformAdmin }`
 * would read as locked while being open — and nothing distinguishes the two at
 * the call site.
 *
 * Guards are named what they are. If a file wants the platform-staff guard, it
 * imports `isPlatformAdmin` and says so on every route.
 */
console.log("\nAdmin guards are imported under their own names");
{
  const before15 = failures;

  for (const { name, src } of serverFiles()) {
    if (name === "admin-guards.ts") continue;

    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const imports = code.match(/import\s*\{[^}]*\}\s*from\s*["']\.\/admin-guards["']/g) ?? [];

    for (const imp of imports) {
      for (const m of imp.matchAll(/\b(is[A-Za-z]+)\s+as\s+(\w+)/g)) {
        fail(
          `${name} imports \`${m[1]}\` as \`${m[2]}\` — a renamed guard hides ` +
            `which routes it protects. Import it under its own name.`,
        );
      }
    }
  }

  if (failures === before15) console.log("  ok — no renamed guards");
}

/* ── 16 · Cohort-admin routes that read student data are scoped ────────────
 *
 * `isAdmin` admits both admin roles, and until scoping existed every route
 * behind it served the whole platform: `/api/admin/metrics/export` took
 * `institutionId` from the query string without comparing it to the caller, and
 * an absent one meant every student. Harmless while every administrator is
 * SLIpro staff — nothing creates an `institution_admin` today — and not
 * harmless the moment a partner account exists.
 *
 * This check covers the routes scoped so far. It is deliberately an allowlist of
 * DONE work rather than an inventory of every admin route: the rest of the
 * cohort-admin surface (advisor, homework, portfolio, SLI, calendar, template)
 * is still unscoped, and a check that enumerated it would have to encode the
 * whole list to say anything, which is a second place to keep in sync with the
 * routes. What this catches is the regression that actually threatens: one of
 * these handlers losing its scope call while keeping its `isAdmin` guard.
 *
 * When the remaining routes are scoped, extend SCOPED and delete this note.
 */
console.log("\nScoped admin routes still resolve their scope");
{
  const before16 = failures;

  const SCOPED: { file: string; helper: RegExp; routes: string[] }[] = [
    {
      file: "metrics-routes.ts",
      helper: /resolveInstitutionFilter|requireScope/,
      routes: ["/api/admin/metrics", "/api/admin/metrics/export", "/api/admin/metrics/options"],
    },
    {
      file: "routes.ts",
      helper: /requireScope/,
      routes: [
        "/api/admin/users",
        "/api/admin/users/count",
        "/api/admin/users/:id",
        "/api/admin/users/:userId/coaching-notes",
        "/api/admin/users/:userId/foundation-sessions",
        "/api/admin/users/:userId/foundation-sessions/:sessionNumber/messages",
        "/api/admin/users/:userId/enhancement-modules/:moduleCode/messages",
      ],
    },
  ];

  for (const { file, helper, routes } of SCOPED) {
    const src = readFileSync(join(SERVER, file), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    if (!helper.test(code)) {
      fail(`${file} no longer calls a scope helper — every route in it reads the whole platform`);
      continue;
    }

    for (const route of routes) {
      // The route must still exist, and must still sit behind `isAdmin` — a
      // silent change to `isPlatformAdmin` is safe, so it is not a failure, but
      // the path vanishing means this list has gone stale.
      const registered = new RegExp(
        `["']${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']\\s*,\\s*is(Admin|PlatformAdmin)`,
      );
      if (!registered.test(code)) {
        fail(`${file}: ${route} is no longer registered with an admin guard — this list is stale`);
      }
    }
  }

  // The legacy Excel exports build their own joins and none filters by
  // institution, so they are closed to partner administrators until each is
  // narrowed. If one is reopened to `isAdmin`, it must be scoped first.
  {
    const code = readFileSync(join(SERVER, "routes.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    for (const m of code.matchAll(/["'](\/api\/admin\/export\/[^"']+)["']\s*,\s*(is\w+)/g)) {
      if (m[2] !== "isPlatformAdmin") {
        fail(
          `${m[1]} is guarded by \`${m[2]}\` — these exports are unscoped, so they ` +
            `must stay platform-staff-only until their queries filter by institution`,
        );
      }
    }
  }

  if (failures === before16) console.log("  ok — scoped routes intact, exports closed");
}

/* ── 17 · The LinkedIn route persists everything it generates ──────────────
 *
 * `generateLinkedInOptimization` returns seven fields. The route passed six of
 * them to `createLinkedinOptimization` and dropped `holisticReview` — the field
 * its own prompt calls "THE PRODUCT", and the entire point of A4's "holistic,
 * integrated view of the full profile … not as disconnected pieces".
 *
 * Nothing caught it, and nothing could have:
 *
 *   - `createLinkedinOptimization`'s parameter is `{ userId, sliId?,
 *     [section: string]: unknown }`, so it accepts any set of keys. Passing six
 *     of seven is not a type error. Passing none would not be either.
 *   - the store puts whatever it receives into the single `holistic_review`
 *     jsonb column, so on read the client found a populated object under that
 *     name whose every expected field was undefined. The page opened its panel
 *     and filled none of it. A missing field looked like an empty one.
 *
 * That is the shape of bug this file exists for: a generator and its caller
 * drifting apart with no compiler error and no visible failure. So the keys are
 * compared directly.
 */
console.log("\nThe LinkedIn optimization route persists every generated field");
{
  const before17 = failures;

  // Comments stripped, as in checks 13 and 14. The route now explains at length
  // what the removed fallback did, quoting it — and the explanation of a rule
  // must not be read as a breach of it.
  const decomment = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  const gen = decomment(readFileSync(join(SERVER, "linkedin-optimization.ts"), "utf8"));
  const route = decomment(
    readFileSync(join(SERVER, "linkedin-optimization-routes.ts"), "utf8"),
  );

  // Top-level keys of the inline `Promise<{ ... }>` return type. Nested fields
  // are indented four spaces; the ones that matter here sit at two.
  const start = gen.indexOf("): Promise<{");
  const end = gen.indexOf("\n}>", start);
  if (start === -1 || end === -1) {
    fail("could not find generateLinkedInOptimization's return type — this check has gone stale");
  } else {
    const declared = Array.from(
      gen.slice(start, end).matchAll(/^ {2}(\w+)\??:/gm),
      (m) => m[1],
    );

    // The keys actually handed to the store.
    const callStart = route.indexOf("createLinkedinOptimization({");
    const callEnd = route.indexOf("});", callStart);
    if (callStart === -1 || callEnd === -1) {
      fail("could not find the createLinkedinOptimization call — this check has gone stale");
    } else {
      const passed = new Set(
        Array.from(route.slice(callStart, callEnd).matchAll(/(\w+)\s*:/g), (m) => m[1]),
      );

      for (const key of declared) {
        if (!passed.has(key)) {
          fail(
            `generateLinkedInOptimization returns \`${key}\` but the route never passes it ` +
              `to createLinkedinOptimization — it is generated, paid for, and discarded`,
          );
        }
      }

      if (declared.length === 0) fail("parsed zero declared fields — the anchor has moved");
      if (failures === before17) console.log(`  ok — all ${declared.length} field(s) persisted`);
    }
  }

  // And no fabricated fallback. A model failure must fail the request, not
  // persist invented advice under a student's name at HTTP 201.
  for (const marker of ["mock response", "Full-Stack Developer |", "fallback template"]) {
    if (route.includes(marker)) {
      fail(
        `linkedin-optimization-routes.ts contains "${marker}" — the hardcoded fallback ` +
          `saved invented recommendations as a student's own, tagged ai_generated`,
      );
    }
  }
}

/* ── 18 · Every test suite is actually run ─────────────────────────────────
 *
 * Two lists have to agree and nothing made them: the `*.test.ts` files on disk,
 * and the ones `npm test` names. A suite that exists and is not in the script is
 * not "not yet wired up" — it is a passing test in everybody's mental model that
 * has never executed.
 *
 * The pipeline had the same problem one level up. It ran three suites by name
 * while `npm test` ran ten, so seven were unenforced in CI — including this
 * file, the one that gates credential shapes, migration-journal drift and the
 * single-provider rule. The pipeline now runs `npm test`, which makes this check
 * the thing that keeps `npm test` honest.
 *
 * Known and deliberate: the script chains with `&&`, so a failure in an early
 * suite hides the rest. Fail-fast is acceptable for a gate; just be aware that
 * one red suite does not mean only one is red.
 */
console.log("\nEvery test suite is in the npm test script");
{
  const before18 = failures;

  const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
  const script: string = pkg.scripts?.test ?? "";

  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      return e.name.endsWith(".test.ts") ? [p] : [];
    });

  const onDisk = walk(SERVER)
    .map((p) => p.replace(process.cwd() + "/", ""))
    .sort();

  for (const file of onDisk) {
    if (!script.includes(file)) {
      fail(`${file} exists but \`npm test\` does not run it — it has never executed in CI`);
    }
  }

  // And the reverse: a named suite that no longer exists makes `npm test` fail
  // with a module-not-found rather than a test failure, which reads as a broken
  // repo instead of a stale script.
  for (const m of script.matchAll(/(server\/[\w/.-]+\.test\.ts)/g)) {
    if (!onDisk.includes(m[1])) {
      fail(`\`npm test\` runs ${m[1]}, which does not exist`);
    }
  }

  if (failures === before18) console.log(`  ok — ${onDisk.length} suite(s), all run`);
}

/* -- 19 . Every client admin API call reaches a real route -----------------
 *
 * `heuristic-detail-page.tsx` called `/api/admin/methodology/cards/:id`. No
 * server route registers that path. The page rendered "Card not found." for
 * every card and read as a data problem.
 *
 * What made it invisible: `/api/admin/methodology/:populationTag/:sessionType`
 * matched the URL first, with populationTag="cards" and sessionType=<the id>,
 * so the request got a 400 from an unrelated handler rather than a 404 from a
 * missing one. Meanwhile the cards LIST worked, because it calls a different
 * endpoint -- so the feature looked half-broken rather than unwired.
 *
 * Third bug of this shape here. The two QueryClients made invalidation silently
 * no-op; five route files imported `isPlatformAdmin as isAdmin`, so 28 locked
 * routes read as open. Each time the surface existed and the wiring was wrong,
 * and no type checker can see it because a URL is just a string.
 *
 * The rule: every `/api/admin/...` literal in the client must match a path some
 * server file registers. Concatenated paths are not checked; the literal case is
 * the one that has bitten us.
 *
 * A known blind spot, verified by reintroducing the bug: the base path
 * `/api/admin/methodology/cards/:id` is NOT flagged, because it genuinely matches
 * `/api/admin/methodology/:populationTag/:sessionType` — two segments, two
 * params. That collision is precisely why the bug was invisible to begin with,
 * and no purely structural check can see through it. What saves the build is that
 * the three deeper paths (`/performance`, `/components/:type`, `/status`) have no
 * such twin and do fail. One violation is enough; this check does not need to
 * find every instance, only to stop a whole screen shipping unwired.
 */
console.log("\nEvery client admin API call reaches a real route");
{
  const before19 = failures;
  const CLIENT = join(process.cwd(), "client", "src");

  function clientFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...clientFiles(full));
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  /** `${...}` becomes `:param`, query string dropped, trailing slash trimmed. */
  function normalise(path: string): string {
    return path.replace(/\$\{[^}]*\}/g, ":param").split("?")[0].replace(/\/+$/, "");
  }

  const registered: string[] = [];
  for (const f of serverFiles()) {
    const re = /app\.(?:get|post|put|patch|delete)\(\s*["\'`](\/api\/[^"\'`]+)["\'`]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(f.src))) registered.push(normalise(m[1]));
  }

  /** A server pattern matches when every segment matches or is a `:param`. */
  function isRegistered(clientPath: string): boolean {
    const want = clientPath.split("/");
    return registered.some((route) => {
      const have = route.split("/");
      if (have.length !== want.length) return false;
      return have.every((seg, i) => seg.startsWith(":") || seg === want[i]);
    });
  }

  /*
   * Comments are stripped before matching. The first run of this check failed on
   * the comment that explains the bug, because it quotes `/api/admin/...` as
   * prose. Checks 13, 14 and 17 learned the same lesson: a static guard that
   * reads its own documentation as evidence is a guard that punishes writing any.
   */
  const decomment = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  const seen: Record<string, boolean> = {};
  for (const file of clientFiles(CLIENT)) {
    const src = decomment(readFileSync(file, "utf8"));
    const re = /["\'`](\/api\/admin\/[^"\'`\s]*)["\'`]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const path = normalise(m[1]);
      if (!path || path === "/api/admin") continue;
      const key = path + " " + file;
      if (seen[key]) continue;
      seen[key] = true;
      if (!isRegistered(path)) {
        fail(
          file.replace(process.cwd() + "/", "") + " calls " + path +
            ", which no server route registers",
        );
      }
    }
  }

  if (failures === before19) {
    console.log("  ok - " + registered.length + " server route(s), every client admin call resolves");
  }
}

/* ── 20 · A standalone script hydrates the secret before the data layer ────
 *
 * `server/db.ts` builds its pool at module load and throws when DATABASE_URL is
 * absent, and on this project that value usually arrives from Key Vault rather
 * than the environment. So a script that names the data layer in its import list
 * is evaluated — and throws — before any code in its own main() can fetch the
 * secret. `script-init.ts` exists for exactly this, and says so at length:
 * hydrate first, then import.
 *
 * `wing:seed-voice` shipped with the wrong pattern and failed on its first run
 * with "DATABASE_URL must be set" from db.ts, before one line of the seeder ran.
 * Nothing could have caught it earlier: the import is correct TypeScript, the
 * script typechecks, and the only symptom is a stack trace on a machine where the
 * secret is not in the environment. Which is every developer machine here.
 *
 * The transitive case is checked one level deep, because that is how the same bug
 * arrived twice in one file: the seeder also imported a store, and the store
 * imports the data layer, so removing the direct import was not enough. One level
 * is not proof — a store importing a store would slip through — but it covers the
 * shape that actually happens, and a full module graph walk is a lot of machinery
 * for a rule with a two-line fix.
 */
console.log("\nStandalone scripts hydrate DATABASE_URL before importing the data layer");
{
  const before20 = failures;

  const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
  const scripts: Record<string, string> = pkg.scripts ?? {};

  const decomment = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  // An import STATEMENT naming db from a relative path. Anchored to the start of
  // a line and terminated by a semicolon on purpose: prose about this rule quotes
  // the statement, and three earlier checks here learned that a guard which reads
  // its own documentation as evidence punishes writing any.
  const IMPORTS_DB = /^import\s+[^;]*\bdb\b[^;]*from\s+"(?:\.\.?\/)+db";/m;

  let checked = 0;

  for (const name of Object.keys(scripts)) {
    const cmd = scripts[name];
    const m = /tsx\s+(server\/[^\s]+\.ts)/.exec(cmd);
    if (!m) continue;

    const entry = m[1];
    let src: string;
    try {
      src = decomment(readFileSync(join(process.cwd(), entry), "utf8"));
    } catch {
      fail(`npm script "${name}" runs ${entry}, which does not exist`);
      continue;
    }
    checked++;

    if (IMPORTS_DB.test(src)) {
      fail(
        `${entry} (npm run ${name}) imports the data layer at the top level — it will ` +
          `throw "DATABASE_URL must be set" before main() runs. Use initScript().`,
      );
      continue;
    }

    const dir = entry.slice(0, entry.lastIndexOf("/"));
    for (const rel of Array.from(src.matchAll(/from\s+"(\.[^"]+)"/g))) {
      const target = join(process.cwd(), dir, rel[1] + ".ts");
      let dep: string;
      try {
        dep = decomment(readFileSync(target, "utf8"));
      } catch {
        continue;
      }
      if (IMPORTS_DB.test(dep)) {
        fail(
          `${entry} (npm run ${name}) statically imports "${rel[1]}", which imports the ` +
            `data layer — so the pool is built before initScript() can fetch the secret. ` +
            `Import it dynamically after initScript() returns.`,
        );
      }
    }
  }

  if (failures === before20) console.log(`  ok — ${checked} script(s), all hydrate first`);
}

/* ── 21 · The two component→column maps agree ──────────────────────────────
 *
 * `seed-compendium.ts` and `seed-shared.ts` each hold a map from the seven v2
 * component keys to `heuristic_component_type`. There are two copies on purpose:
 * the compendium seeder has already run against the live database and cannot be
 * executed from a developer machine to prove a refactor preserved its behaviour,
 * so it was left alone rather than rewritten to save eight lines.
 *
 * That trade only holds while the copies agree. If one gains a mapping the other
 * lacks, the same component lands in a different column depending on which
 * document a card came from — and nothing would surface it: both seeds succeed,
 * both report the row counts they wrote, and a prompt quietly loses a component
 * for one half of the methodology.
 *
 * Compared as text rather than by importing either module, because importing
 * `seed-compendium.ts` runs it: its `main()` is called at module scope.
 */
console.log("\nBoth seeders map components to the same columns");
{
  const before21 = failures;

  const MAP = /COMPONENT_COLUMN[^=]*=\s*\{([\s\S]*?)\n\};/;
  // Local, like every other block's copy: each check is a scope of its own so a
  // later one cannot quietly depend on an earlier one's helpers.
  const decomment = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  function mappings(file: string): string[] {
    const src = decomment(readFileSync(join(process.cwd(), "server/wing", file), "utf8"));
    const block = MAP.exec(src);
    if (!block) {
      fail(`${file} has no COMPONENT_COLUMN map — check 21 cannot compare what it cannot find`);
      return [];
    }
    return Array.from(block[1].matchAll(/(\w+)\s*:\s*"([^"]+)"/g))
      .map((m) => `${m[1]} → ${m[2]}`)
      .sort();
  }

  const compendium = mappings("seed-compendium.ts");
  const shared = mappings("seed-shared.ts");

  if (compendium.length && shared.length) {
    if (compendium.join(", ") !== shared.join(", ")) {
      fail(
        "seed-compendium.ts and seed-shared.ts disagree about component columns.\n" +
          `    seed-compendium: ${compendium.join(", ")}\n` +
          `    seed-shared:     ${shared.join(", ")}`,
      );
    }
    // Six of the seven. intervention_type is a column on `heuristics`, not a row —
    // writing the classifier into a component would put "Intervention to apply:
    // META (system rule)" within reach of a prompt, which IG-U005 forbids.
    if (compendium.length !== 6) {
      fail(`expected 6 mapped components, seed-compendium.ts maps ${compendium.length}`);
    }
    if (compendium.join(", ").indexOf("intervention_type") >= 0) {
      fail("intervention_type is mapped to a component row — it is a column on heuristics");
    }
  }

  if (failures === before21) {
    console.log(`  ok — ${compendium.length} component(s), both seeders agree`);
  }
}

/* ── 22 · The self-description table holds the user's words and nobody else's ──
 *
 * Danielle, 19 August: "These records are the user's words only. Wing's responses
 * are in the conversation transcript. Storing Wing's coaching language in the same
 * table as the user's self-descriptions would contaminate the baseline."
 *
 * That is not a rule a type can express — both are strings — and it is exactly the
 * kind of rule that survives review and then dies in a refactor, because passing
 * `reply` instead of `text` is a one-word change that looks like a tidy-up.
 *
 * The baseline it would contaminate cannot be rebuilt: intake is the only time Wing
 * sees a user describe themselves before Wing has taught them any language for it.
 * So the call is pinned by shape — one caller, the user's message, nothing else.
 */
console.log("\nSelf-description capture stores the user's words only");
{
  const before22 = failures;

  const decomment = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  // Its own local walk: each check in this file is a scope of its own, so a later
  // one cannot quietly depend on an earlier one's helpers.
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      return e.isFile() && p.endsWith(".ts") ? [p] : [];
    });

  const callers: string[] = [];
  for (const file of walk(SERVER)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    if (file.indexOf("self-description-store.ts") >= 0) continue;
    const src = decomment(readFileSync(file, "utf8"));
    if (src.indexOf("captureSelfDescription") >= 0) callers.push(file);
  }

  if (callers.length !== 1) {
    fail(
      `expected exactly one caller of captureSelfDescription, found ${callers.length}: ` +
        callers.join(", ") +
        ". Every new caller has to be read against the user's-words-only rule.",
    );
  } else {
    const src = decomment(readFileSync(callers[0], "utf8"));
    const call = /captureSelfDescription\(\{([\s\S]*?)\}\)/.exec(src);
    if (!call) {
      fail(`${callers[0]} names captureSelfDescription but the call could not be read`);
    } else {
      const body = call[1];
      const userText = /userText:\s*([A-Za-z_$][\w$.]*)/.exec(body);
      if (!userText) {
        fail("the capture call does not pass userText as a plain variable");
      } else if (userText[1] !== "text") {
        fail(
          `the capture call passes userText: ${userText[1]}. The only correct value is ` +
            "`text`, the user's message on this turn. Wing's reply must never reach " +
            "this table.",
        );
      }
      if (/userText:\s*reply\b/.test(body) || /verbatim[^:]*:\s*reply\b/.test(body)) {
        fail("the capture call passes Wing's reply as the user's words");
      }
    }
  }

  if (failures === before22) {
    console.log(`  ok — one caller, passing the user's own message`);
  }
}

/* ── 23 · A student never asserts their own completion ────────────────────
 *
 * Two routes had the same shape. `PATCH /api/foundation-sessions/:n` took
 * `{ status }` and wrote it; `PATCH /api/enhancement-modules/:code` took
 * `updateEnhancementModuleSchema`, which is the insert schema `.partial()`, so it
 * took `status`, `completedAt` AND `completionData`. Both sat behind
 * `isAuthenticated` and both resolved the record from `req.user` — so neither was
 * a route into anyone else's data. Each was a route into your own outcome.
 *
 * Completion is earned on the turn path. `checkSessionCompletion` and
 * `checkModuleCompletion` read the whole transcript, and only where they agree
 * does the server write the artifact and complete the session. The two always
 * travel together, in that order. Through either PATCH, one request marked the
 * work done with no transcript behind it — and on the module route the client
 * could supply the artifact too, which is the thing an advisor reads as the
 * student's work.
 *
 * The foundation route is gone; nothing called it. The module route is the timer
 * and nothing else, which is all any client has ever sent it.
 *
 * SCOPE. This is the trust boundary where a student's own request reaches a
 * session's completion state, and it is these two files. It is deliberately NOT a
 * blanket rule: `PATCH /api/admin/heuristics/:id/status` legitimately takes a
 * status from a body — admin-only, and a card's status rather than a student's —
 * and `enhancement-store` dispatches on a status its server-side callers give it.
 * A rule wide enough to cover those would have to carve them out, and a check
 * with carve-outs is a check nobody trusts.
 */
console.log("\nNo student route accepts its own completion");
{
  const before23 = failures;

  // Local, like every other block's copy: each check is a scope of its own so a
  // later one cannot quietly depend on an earlier one's helpers.
  const strip = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  /* The two files where a student's own request reaches a session record. */
  const STUDENT_SESSION_ROUTES = [
    "foundation-sessions-routes.ts",
    "enhancement-modules-routes.ts",
  ];

  /*
   * Everything a student's request is allowed to say about their own session:
   * what they typed, and how long they have been sitting there. Every other
   * property of a session — whether it started, whether it finished, what it
   * produced — is the server's to decide, from the transcript.
   *
   * A whitelist rather than a blacklist of the dangerous fields, because the
   * module route's bug was precisely that its field list came from
   * `insertEnhancementModuleSchema.partial()` and therefore grew, silently, every
   * time the table did. Naming what is allowed is the only version of this rule
   * that does not need updating when someone adds a column.
   */
  const ALLOWED_BODY_FIELDS = new Set([
    "content",
    "role",
    "timerElapsed",
    "timerElapsedSeconds",
  ]);

  /* Writers that take a payload. `completeSession` takes only an id, and both
   * files call it on paths the server decides. */
  const WRITERS = ["updateSessionStatus", "updateEnhancementModule"];

  let reads = 0;
  let writes = 0;

  for (const file of STUDENT_SESSION_ROUTES) {
    const path = join(SERVER, file);
    if (!existsSync(path)) {
      fail(`${file} not found — check 23 proved nothing for it`);
      continue;
    }
    const src = strip(readFileSync(path, "utf8"));

    /*
     * A — every field taken from the body is named, and named here.
     *
     * Three shapes, because the bug used the third: destructured straight off
     * `req.body`, read as `req.body.x`, or parsed into a variable that is then
     * read field by field. An earlier version of this check looked only for
     * `status` near `req.body` on one line, and a mutation that parsed the body
     * into `updateData` and read `updateData.status` two lines later walked past
     * it.
     */
    const fields = new Set<string>();

    for (const m of Array.from(src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*[^;\n]*\breq\.body\b/g))) {
      for (const raw of m[1].split(",")) {
        const name = raw.split(":")[0].trim();
        if (name) fields.add(name);
      }
    }
    for (const m of Array.from(src.matchAll(/\breq\.body\.(\w+)/g))) fields.add(m[1]);

    /* Variables assigned from the body, and every field later read off them. */
    const bodyVars = new Set(
      Array.from(src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*[^;\n]*\breq\.body\b/g)).map(
        (m) => m[1],
      ),
    );
    for (const v of Array.from(bodyVars)) {
      for (const m of Array.from(src.matchAll(new RegExp(`\\b${v}\\.(\\w+)`, "g")))) {
        fields.add(m[1]);
      }
    }

    for (const f of Array.from(fields)) {
      reads++;
      if (!ALLOWED_BODY_FIELDS.has(f)) {
        fail(
          `${file} takes "${f}" from the request body. A student's request may say ` +
            `what they typed and how long they have been there; whether the session ` +
            `is finished, and what it produced, is decided from the transcript and ` +
            `written with its artifact`,
        );
      }
    }

    /*
     * B — and nothing is written from a variable.
     *
     * A parsed body passed wholesale reads every field without naming one, which
     * is how the module route wrote `status` and `completionData` while appearing
     * to be about the timer.
     */
    for (const writer of WRITERS) {
      for (const m of Array.from(src.matchAll(new RegExp(`${writer}\\(\\s*([^;]*?)\\)`, "gs")))) {
        const args = m[1];
        const comma = args.indexOf(",");
        if (comma < 0) continue;
        const payload = args.slice(comma + 1).trim();
        writes++;
        if (!/^["'`]/.test(payload) && !payload.startsWith("{")) {
          fail(
            `${file}: ${writer}(..., ${payload.split("\n")[0].slice(0, 40)}) — the ` +
              `payload must be a literal at the call site, so what a request can ` +
              `write is visible here rather than in a schema somewhere else`,
          );
        }
      }
    }
  }

  if (!reads) fail("no request-body reads found in the student routes — check 23A proved nothing");
  if (!writes) fail("no session-state writes found in the student routes — check 23B proved nothing");

  if (failures === before23) {
    console.log(
      `  ok — ${reads} body field(s), all of them the student's own words or their ` +
        `timer; ${writes} literal session write(s)`,
    );
  }
}

/* ── 24 · Nobody reads an SLI status that no row holds ────────────────────
 *
 * Every insert of `status: "selected"` in `sli-store.ts` is followed on the next
 * line by `markActive`, which sets `"active"`. So no row is ever left at
 * `"selected"`, and a reader that filters on it alone finds nothing — for every
 * student, silently, with no error anywhere.
 *
 * Five did. The advisor snapshot had no SLI headline; the cohort dashboard
 * reported zero students with a completed SLI, which is the number a career
 * centre defends its budget with; the CSV column was false for everyone; the
 * Session 3 completion email shipped an empty statement; and Wing's life-log
 * reply could not see the SLI it exists to connect entries to. Each read looked
 * right on its own, and no type could tell them apart — the column is an enum and
 * `"selected"` is a member of it.
 *
 * `LIVE_SLI_STATUSES` is the ranking `getActive` has always used, exported so it
 * is stated once. The rule is that nothing filters on one status by hand.
 */
console.log("\nNo reader filters SLIs on a single status");
{
  const before24 = failures;

  // Local, like every other block's copy: each check is a scope of its own so a
  // later one cannot quietly depend on an earlier one's helpers.
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      return e.isFile() && p.endsWith(".ts") ? [p] : [];
    });
  const strip = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  const STORE = "server/wing/sli-store.ts";
  let readers = 0;

  for (const path of walk(SERVER)) {
    if (path.endsWith(".test.ts")) continue;
    const rel = path.replace(process.cwd() + "/", "");
    const src = strip(readFileSync(path, "utf8"));

    /*
     * `sli-store.ts` is exempt: it is where the statuses are written, where the
     * ranking is defined, and where `markActive` has to name them one at a time.
     */
    if (rel === STORE) continue;

    /* Drizzle form: eq(sliRecords.status, "selected") */
    for (const m of Array.from(src.matchAll(/eq\(\s*sliRecords\.status\s*,\s*["'`](\w+)["'`]/g))) {
      readers++;
      fail(
        `${rel}: filters SLIs on status "${m[1]}" alone. Use LIVE_SLI_STATUSES from ` +
          `sli-store — every "selected" row is set to "active" on the next line, so ` +
          `this matches nothing`,
      );
    }

    /* Raw SQL form, in the CSV export and anywhere else that reaches for it. */
    for (const m of Array.from(src.matchAll(/sli_records[\s\S]{0,200}?status::text\s*=\s*'(\w+)'/g))) {
      readers++;
      fail(
        `${rel}: raw SQL filters sli_records on status = '${m[1]}' alone — same trap. ` +
          `Use \`status::text in ('active', 'selected')\``,
      );
    }
  }

  /* The constant has to exist for the rule to have somewhere to point. */
  const store = readFileSync(join(process.cwd(), STORE), "utf8");
  if (!/export const LIVE_SLI_STATUSES\s*=/.test(store)) {
    fail("sli-store.ts no longer exports LIVE_SLI_STATUSES — check 24 has nothing to recommend");
  }

  if (failures === before24) {
    console.log(`  ok — no single-status SLI filter outside ${STORE}`);
  }
}


/* ── 25 · Nothing reads the legacy conversation tables ────────────────────
 *
 * Post-cutover every turn is written to `wing.transcript_turns`. The four
 * `public` tables that used to hold conversations —  foundation_sessions,
 * foundation_session_messages, enhancement_modules, enhancement_module_messages —
 * are frozen: the migrator copied them across and nothing has appended a row since.
 *
 * A reader still pointed at them does not fail. It returns nothing, and "nothing"
 * is a shape this product produces legitimately all the time. The admin transcript
 * export sat like that: it queried the legacy pair, found no rows for anybody, and
 * rendered a workbook containing one sheet reading "No transcripts found" — which
 * is exactly what it would render for a cohort that genuinely had not started. The
 * sibling export directly above it had been repointed at the wing store and this
 * one was missed, so the two sat in the same file disagreeing about where
 * conversations live.
 *
 * The rule is the whole-tree one, because the next reader will be written in a
 * file that does not exist yet: only the legacy storage layer and the migrator may
 * name these tables.
 */
console.log("\nNothing outside the legacy layer reads the frozen conversation tables");
{
  const before25 = failures;

  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      return e.isFile() && p.endsWith(".ts") ? [p] : [];
    });

  const FROZEN = [
    "foundationSessions",
    "foundationSessionMessages",
    "enhancementModules",
    "enhancementModuleMessages",
  ];

  /*
   * `storage.ts` and `database-storage.ts` ARE the legacy layer — the interface the
   * MVP was written against, kept so the migrator and the old admin screens still
   * compile. `migrate-data.ts` is the thing that reads them on purpose, once.
   */
  const ALLOWED = new Set([
    "server/storage.ts",
    "server/database-storage.ts",
    "server/wing/migrate-data.ts",
  ]);

  for (const path of walk(SERVER)) {
    const rel = path.slice(process.cwd().length + 1).replace(/\\/g, "/");
    if (ALLOWED.has(rel) || rel.endsWith(".test.ts")) continue;

    /* Comments discuss these names on purpose — check 12's lesson. */
    const code = readFileSync(path, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    /*
     * Matched on the IMPORT, not on the identifier.
     *
     * A bare `\bfoundationSessions\b` scan reports three files that have nothing to
     * do with the table: `sli.ts` names a local parameter that way, and
     * `profile-store.ts` and `student-record.ts` both return a `foundationSessions`
     * PROPERTY built from the wing tables. A rule that cries wolf on the correct
     * code gets an exception added to it, and the exception is where the next real
     * one hides. You cannot query a drizzle table you did not import, so the import
     * is both the narrower test and the complete one.
     */
    const LEGACY_MODULE = /["'`](?:@shared\/schema|\.\.?(?:\/\.\.)*\/shared\/schema)["'`]/;
    const imports = Array.from(
      code.matchAll(/import\s+([\s\S]*?)\s+from\s+(["'`][^"'`]+["'`])/g),
    ).filter((m) => LEGACY_MODULE.test(m[2]));

    for (const imp of imports) {
      const clause = imp[1];

      /* `import * as legacy from "@shared/schema"` — then `legacy.foundationSessions`. */
      const ns = clause.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)$/);
      for (const table of FROZEN) {
        const named = new RegExp(`[{,]\\s*${table}\\s*[,}]`).test(clause);
        const viaNs = ns ? new RegExp(`\\b${ns[1]}\\.${table}\\b`).test(code) : false;
        if (named || viaNs) {
          fail(
            `${rel} imports \`${table}\` from the legacy schema — nothing has written ` +
              `that table since the cutover, so whatever it reads is empty. Go through ` +
              `the wing stores.`,
          );
        }
      }
    }
  }

  /*
   * And the replacement has a caller.
   *
   * This is the other half and it is not decoration: a bulk reader that nothing
   * imports is the exact shape of every dead surface this suite has had to pin —
   * present, correct, and not in the path. Without this, deleting the export's call
   * site would leave check 25 passing on a route that renders nothing at all.
   */
  const storeSrc = existsSync(join(SERVER, "wing/session-store.ts"))
    ? readFileSync(join(SERVER, "wing/session-store.ts"), "utf8")
    : "";
  if (!/export async function turnsForExport\(/.test(storeSrc)) {
    fail("session-store.ts no longer exports turnsForExport — the export has no bulk reader");
  } else {
    const callers = walk(SERVER).filter((path) => {
      const rel = path.slice(process.cwd().length + 1).replace(/\\/g, "/");
      if (rel === "server/wing/session-store.ts" || rel.endsWith(".test.ts")) return false;
      const code = readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      return /\bturnsForExport\(/.test(code);
    });
    if (!callers.length) {
      fail("turnsForExport has no caller — the transcript export is reading nothing");
    }
  }

  if (failures === before25) {
    console.log("  ok — the frozen tables are named only by the legacy layer, and the wing reader is wired");
  }
}

/* ── 26 · One writer into the evidence portfolio, and it checks the claim ──
 *
 * `evidence_portfolio_items` holds positioning claims shown to the student as
 * things they can say about themselves. A4 is the reason `authenticity.ts` exists:
 * a claim that overstates what the transcript supports is worse than no claim,
 * because the student takes it into an interview.
 *
 * There were two writers. `wing/evidence-portfolio.ts` ran every claim through the
 * authenticity rules; `wing/artifact-store.ts` had a second `addEvidenceItem` that
 * inserted whatever it was handed. Nothing called the second one, which is the only
 * reason it never mattered — and an unchecked insert with a friendlier signature is
 * precisely what somebody reaches for when the checked path looks like work. A row
 * that entered through it would have rendered in the portfolio UI indistinguishably
 * from one that had passed.
 *
 * So: exactly one writer, and it is the one that imports the checker.
 */
console.log("\nOne writer into the evidence portfolio, and it runs the authenticity check");
{
  const before26 = failures;

  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      return e.isFile() && p.endsWith(".ts") ? [p] : [];
    });

  const writers: string[] = [];
  for (const path of walk(SERVER)) {
    const rel = path.slice(process.cwd().length + 1).replace(/\\/g, "/");
    if (rel.endsWith(".test.ts")) continue;
    const code = readFileSync(path, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    if (/\.insert\(\s*evidencePortfolioItems\s*\)/.test(code)) writers.push(rel);
  }

  const CHECKED = "server/wing/evidence-portfolio.ts";
  if (writers.length !== 1 || writers[0] !== CHECKED) {
    fail(
      `evidence_portfolio_items is written by [${writers.join(", ") || "nothing"}] — ` +
        `it must be written only by ${CHECKED}, which is the path that runs the claim ` +
        `through authenticity.ts first`,
    );
  } else {
    /*
     * And the one writer still checks. Read from the source rather than trusted,
     * because "the only writer" is worth nothing if that writer stopped checking.
     */
    const src = readFileSync(join(process.cwd(), CHECKED), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    if (!/from ["'`]\.\/authenticity["'`]/.test(src)) {
      fail(`${CHECKED} no longer imports authenticity.ts — the only writer stopped checking`);
    } else if (!/checkAuthenticity\(/.test(src) && !/applyRewrites\(/.test(src)) {
      fail(`${CHECKED} imports authenticity.ts but calls nothing from it`);
    }
  }

  if (failures === before26) {
    console.log(`  ok — ${CHECKED} is the only writer and it runs the check`);
  }
}

/* ── 27 · Nothing that builds a prompt reads the demographic block ────────
 *
 * The registration form collects age, gender and race/ethnicity under one sentence:
 *
 *     "Collected for [Institution] reporting. Does not affect your Wing experience."
 *
 * That is a promise about where the data goes, and it is the kind of promise that decays
 * silently. Nobody would deliberately put a student's ethnicity into a coaching prompt.
 * What happens instead is that somebody needs their age for a perfectly good reason,
 * imports the store, and six months later a context builder spreads the whole row into a
 * system message — and the only thing that ever said otherwise was a comment.
 *
 * The schema puts the promise in reach of a checker: the data is its own table rather
 * than columns on `students`, so keeping it out of prompts is a question about which
 * files import ONE module. That question is asked here.
 *
 * `demographics-store.ts` is the only permitted accessor, and only `auth.ts` may call it —
 * the registration write. A reporting screen, when one exists, gets added to the
 * allowlist deliberately, which is the point.
 */
console.log("\nThe demographic block stays out of everything that builds a prompt");
{
  const before27 = failures;

  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      return e.isFile() && p.endsWith(".ts") ? [p] : [];
    });

  const STORE = "server/wing/demographics-store.ts";
  const TABLE = "studentDemographics";

  /* Who may reach the data at all. */
  const ALLOWED_IMPORTERS = new Set(["server/auth.ts"]);

  if (!existsSync(join(process.cwd(), STORE))) {
    fail(`${STORE} is missing — check 27 is guarding nothing`);
  } else {
    for (const path of walk(SERVER)) {
      const rel = path.slice(process.cwd().length + 1).replace(/\\/g, "/");
      if (rel === STORE || rel.endsWith(".test.ts")) continue;

      const code = readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

      /*
       * Two ways in, and both are checked: importing the store, or going around it
       * straight to the drizzle table. The second is the one a hurry produces.
       */
      const importsStore = /from\s+["'`][^"'`]*demographics-store["'`]/.test(code);
      const namesTable = new RegExp(`\\b${TABLE}\\b`).test(code);

      if (importsStore && !ALLOWED_IMPORTERS.has(rel)) {
        fail(
          `${rel} imports demographics-store. The signup form promises this data does not ` +
            `affect the Wing experience; only ${Array.from(ALLOWED_IMPORTERS).join(", ")} ` +
            `may read it. If this is a reporting surface, add it to ALLOWED_IMPORTERS ` +
            `deliberately.`,
        );
      }
      if (namesTable) {
        fail(
          `${rel} names \`${TABLE}\` directly, going around ${STORE}. The single-accessor ` +
            `rule is what makes the promise checkable — query through the store.`,
        );
      }
    }

    /*
     * And the store does not grow a prompt-shaped reader.
     *
     * `saveDemographics` writes and `demographicsForReporting` is named for its only
     * legitimate caller. A third export returning this data under a neutral name — `get`,
     * `forStudent`, `load` — is precisely what a context builder would reach for, so the
     * export surface is pinned rather than left to review.
     */
    const storeSrc = readFileSync(join(process.cwd(), STORE), "utf8");
    const exported = Array.from(
      storeSrc.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g),
    ).map((m) => m[1]);
    const EXPECTED = ["saveDemographics", "demographicsForReporting"];
    const extra = exported.filter((n) => !EXPECTED.includes(n));
    if (extra.length) {
      fail(
        `${STORE} exports ${extra.join(", ")} beyond ${EXPECTED.join(" and ")}. Every ` +
          `export here is a way this data reaches somewhere — add it to EXPECTED only ` +
          `once you have decided it is not a prompt.`,
      );
    }
    for (const want of EXPECTED) {
      if (!exported.includes(want)) fail(`${STORE} no longer exports ${want}`);
    }
  }

  if (failures === before27) {
    console.log("  ok — one accessor, one caller, and no prompt builder touches it");
  }
}

/* ── Result ──────────────────────────────────────────────────────────── */
if (failures) {
  console.error(`\n${failures} contract violation(s)\n`);
  process.exit(1);
}
console.log("\nall passed\n");
