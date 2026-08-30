/**
 * Tier 1 part 4 — the objective renderer is gone, and stays gone.
 *
 * A retirement is a claim about ABSENCE, which is the one kind of claim no
 * ordinary test makes. Every other suite here asserts that something works; this
 * one asserts that eight modules, two npm scripts, an admin screen, an
 * environment variable and a live prompt branch are not there — and that the two
 * tables they wrote to still ARE, because the convention is retire rows, never
 * drop tables.
 *
 * Why it is worth a suite of its own. A partial retirement is the worst of the
 * three states: the renderer's own gate was `OBJECTIVE_RENDERER_POPULATIONS`, an
 * allowlist that was never set, so for its whole life the code read as a live A/B
 * experiment and behaved as dead weight. That is precisely the failure shape this
 * codebase keeps finding — a surface claiming something is in force when the
 * thing it names is absent — and half-deleting it would reproduce it exactly:
 * an editor that saves, a table that accepts writes, and nothing downstream.
 *
 * The deletions this checks for are `git rm`s, not edits. If this suite fails
 * with "still on disk", the file removal has not been committed yet.
 */
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

let failed = 0;
function check(label: string, ok: boolean, detail: string) {
  if (ok) console.log(`  ok — ${detail}`);
  else {
    failed++;
    console.log(`  FAIL — ${label}: ${detail}`);
  }
}

const root = process.cwd();
const read = (rel: string): string | null => {
  const p = join(root, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};
const decomment = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });

console.log("\nthe objective renderer, retired\n");

/* ─────────────────────────────────────────────────────────────────────────
 * 1. The modules are gone.
 * ───────────────────────────────────────────────────────────────────────── */
const RETIRED_FILES = [
  "server/wing/objective-runtime.ts",
  "server/wing/objectives-store.ts",
  "server/wing/objective-rules.ts",
  "server/wing/objective-rules.test.ts",
  "server/wing/prompt-renderer.ts",
  "server/wing/seed-objectives.ts",
  "server/wing/preview-objective-prompt.ts",
  "server/objectives-routes.ts",
  "client/src/pages/admin/methodology/objectives-panel.tsx",
];

console.log("The retired modules are off disk");
{
  const present = RETIRED_FILES.filter((f) => existsSync(join(root, f)));
  check("removed", present.length === 0, present.length === 0
    ? `${RETIRED_FILES.length} module(s) removed`
    : `still on disk (git rm not committed?): ${present.join(", ")}`);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 2. And nothing still reaches for them.
 *
 * The deletion and the dereferencing are separate mistakes. A stale import of a
 * deleted module is a build failure, which is loud — but a stale *string*
 * (`npm run wing:seed-objectives` in a UI hint, an env var in a pipeline) is
 * silent, and those are what this looks for.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nNothing imports, runs or configures what was removed");
{
  const NAMES = [
    "objective-runtime",
    "objectives-store",
    "objective-rules",
    "prompt-renderer",
    "seed-objectives",
    "preview-objective-prompt",
    "objectives-routes",
    "objectives-panel",
    "OBJECTIVE_RENDERER_POPULATIONS",
    "registerObjectiveRoutes",
    "wing:preview-prompt",
  ];

  const bad: string[] = [];
  const sources = [
    ...walk(join(root, "server")),
    ...walk(join(root, "shared")),
    ...(existsSync(join(root, "client", "src")) ? walk(join(root, "client", "src")) : []),
  ].filter((p) => !p.endsWith("objective-retirement.test.ts"));

  for (const file of sources) {
    /*
     * Comments stripped: this file's own history is written down in the modules
     * that survived it, and a sentence explaining why the renderer went is not a
     * reference to it. Code is the only place a name can still resolve.
     */
    const code = decomment(readFileSync(file, "utf8"));
    for (const name of NAMES) {
      if (code.includes(name)) bad.push(`${file.slice(root.length + 1)} → ${name}`);
    }
  }

  /* The npm scripts, which are data rather than code and so are read separately. */
  const pkgSrc = read("package.json");
  if (!pkgSrc) bad.push("package.json not found");
  else {
    const scripts = JSON.parse(pkgSrc).scripts ?? {};
    for (const k of ["wing:seed-objectives", "wing:preview-prompt"]) {
      if (k in scripts) bad.push(`package.json still defines ${k}`);
    }
    if (String(scripts.test ?? "").includes("objective-rules.test.ts")) {
      bad.push("npm test still runs objective-rules.test.ts");
    }
  }

  check("dereferenced", bad.length === 0, bad.length === 0
    ? `${sources.length} source file(s) and the npm scripts, none reaching a retired module`
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 3. The prompt has one path, not a branch that is never taken.
 *
 * `objectivePrompt?.prompt ?? legacy` read, in review, exactly like a live
 * experiment. Its left side was null on every turn of every session.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe turn prompt is assembled one way");
{
  const src = read("server/foundation-sessions-routes.ts");
  const bad: string[] = [];

  if (!src) bad.push("foundation-sessions-routes.ts not found — this check proved nothing");
  else {
    const code = decomment(src);
    if (/objectivePrompt/.test(code)) bad.push("the objective prompt branch is still there");
    if (/recordObjectiveEvidence/.test(code)) bad.push("the per-turn evidence call is still there");
    if (!/const basePrompt = promptSet\.getSystemPrompt\(/.test(code)) {
      bad.push("basePrompt is no longer a single unconditional assembly");
    }
  }

  check("one path", bad.length === 0, bad.length === 0
    ? "basePrompt is one unconditional call, with no branch behind an unset flag"
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 4. The rows are retired. The tables are not dropped.
 *
 * Both halves matter and they pull against each other: retiring nothing leaves a
 * published set that nothing reads, and dropping the tables destroys the only
 * record of what was tried. The schema's own convention is rows, never tables.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe rows are retired and both tables are kept");
{
  const bad: string[] = [];

  const sql = read("migrations/0032_retire_objectives.sql");
  if (!sql) bad.push("migration 0032 not found");
  else {
    const code = sql.replace(/--.*$/gm, "");
    if (!/UPDATE\s+"wing"\."objective_sets"/i.test(code)) bad.push("0032 does not update objective_sets");
    if (!/'retired'/.test(code)) bad.push("0032 does not set the status to retired");
    if (!/\bif exists\b/i.test(code)) bad.push("0032's UPDATE has no conditional guard");
    /* The convention, enforced here because a later hand may reach for the tidy option. */
    if (/\bdrop table\b/i.test(code)) bad.push("0032 drops a table — rows are retired, tables are kept");
  }

  const journalSrc = read("migrations/meta/_journal.json");
  if (!journalSrc) bad.push("_journal.json not found");
  else {
    const entries: Array<{ tag: string; when: number }> = JSON.parse(journalSrc).entries ?? [];
    const at = entries.findIndex((e) => e.tag === "0032_retire_objectives");
    if (at < 0) {
      /*
       * The failure mode 0027 already had once: a migration file that exists,
       * reviews clean and is never applied, because drizzle reads the journal
       * and not the directory.
       */
      bad.push("0032 is not in _journal.json — drizzle reads the journal, not the directory");
    } else {
      /*
       * And the second half of the same failure, from `migration-rules.ts`:
       * drizzle compares ONE number — the newest `created_at` already recorded —
       * against each entry's `when`, with `<`. An entry whose `when` does not
       * exceed every earlier one is skipped forever, however new the file is.
       */
      const newest = Math.max(...entries.slice(0, at).map((e) => e.when));
      if (!(entries[at].when > newest)) {
        bad.push(`0032's when (${entries[at].when}) does not exceed the entries before it (${newest}) — drizzle would skip it forever`);
      }
    }
  }

  const schema = read("shared/wing-schema.ts");
  if (!schema) bad.push("wing-schema.ts not found");
  else {
    for (const table of ["objectiveSets", "turnObjectives"]) {
      if (!new RegExp(`export const ${table} = wing\\.table\\(`).test(schema)) {
        bad.push(`${table} was removed from the schema — the convention is to keep the table`);
      }
    }
    /*
     * And each is labelled, so the next reader does not take an empty table for a
     * live one. Read as the doc comment immediately above the declaration rather
     * than a fixed window: these comments are long, and a character count would
     * silently stop covering the marker the moment one of them grew.
     */
    for (const table of ["objectiveSets", "turnObjectives"]) {
      const at = schema.indexOf(`export const ${table} = wing.table(`);
      const open = at > 0 ? schema.lastIndexOf("/**", at) : -1;
      const doc = open >= 0 ? schema.slice(open, at) : "";
      if (!/RETIRED/.test(doc)) bad.push(`${table} is not marked RETIRED in the schema`);
    }
  }

  check("rows not tables", bad.length === 0, bad.length === 0
    ? "0032 retires the published sets, is journalled, and both tables survive marked RETIRED"
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 5. What was deliberately NOT retired.
 *
 * The plan holds completion criteria and analysis methodology "until v2
 * Foundation cards produce equivalent session-end artifacts. These are live and
 * load-bearing today." They share the retired table's versioning convention and
 * sat behind the same admin page, which is exactly how a retirement takes one
 * thing too many with it.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nCompletion criteria and analysis methodology are untouched");
{
  const bad: string[] = [];
  for (const [file, what] of [
    ["server/wing/completion-criteria-store.ts", "completion criteria"],
    ["server/wing/analysis-methodology-store.ts", "analysis methodology"],
    ["server/criteria-routes.ts", "the criteria routes"],
    ["server/methodology-routes.ts", "the methodology routes"],
    ["client/src/pages/admin/methodology/criteria-panel.tsx", "the criteria editor"],
    ["client/src/pages/admin/methodology/analysis-panel.tsx", "the analysis editor"],
  ] as const) {
    if (!existsSync(join(root, file))) bad.push(`${what} went with it (${file})`);
  }

  /* And both editors are still reachable — the page they shared lost only one tab. */
  const page = read("client/src/pages/admin/methodology/session-design-page.tsx");
  if (!page) bad.push("session-design-page.tsx not found");
  else {
    const code = decomment(page);
    for (const panel of ["CriteriaPanel", "AnalysisPanel"]) {
      if (!code.includes(`<${panel} />`)) bad.push(`${panel} is no longer rendered`);
    }
    if (code.includes("ObjectivesPanel")) bad.push("the objectives tab is still rendered");
  }

  check("held", bad.length === 0, bad.length === 0
    ? "both stores, both route files and both editors intact; only the objectives tab is gone"
    : bad.join("; "));
}

console.log(failed === 0 ? "\nall passed\n" : `\n${failed} failed\n`);
if (failed > 0) process.exit(1);
