import { readFileSync, readdirSync } from "fs";
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

    const creates = (code.match(/\bcreate (table|index|unique index|type)\b/gi) ?? []).length;
    const guards = (code.match(/if not exists/gi) ?? []).length;
    if (creates > guards) {
      fail(`${file}: ${creates} CREATE(s) but only ${guards} IF NOT EXISTS — fails on replay`);
    }

    const constraints = (code.match(/add constraint/gi) ?? []).length;
    const handled = (code.match(/duplicate_object/gi) ?? []).length;
    if (constraints > handled) {
      fail(
        `${file}: ADD CONSTRAINT without an EXCEPTION WHEN duplicate_object block — ` +
          `Postgres has no ADD CONSTRAINT IF NOT EXISTS`,
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
    const src = readFileSync(path, "utf8");

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

/* ── Result ──────────────────────────────────────────────────────────── */
if (failures) {
  console.error(`\n${failures} contract violation(s)\n`);
  process.exit(1);
}
console.log("\nall passed\n");
