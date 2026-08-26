/**
 * IG-UX03 — "Built" not "completed". A deterministic scan of user-facing client text.
 *
 *     npm run wing:check-ux
 *
 * ── HER GATE, QUOTED ─────────────────────────────────────────────────────
 * Signal: "Any user-facing text is about to use task-completion language: 'completed,'
 * 'finished,' 'done,' 'checked off,' percentage bars, or numerical progress indicators
 * (3/11 modules complete)."
 *
 * Detection: "Content analysis on all user-facing text in the dashboard and module
 * transitions. Detect: completion/task-list language or visual indicators (progress bars,
 * checkmarks, X-of-Y counters)."
 *
 * Success: "**Zero** task-completion language or visual indicators anywhere in the
 * user-facing experience."
 *
 * Failure path: "If institutional partners require completion tracking for their
 * reporting → keep it in the institutional admin dashboard (career center view), not in
 * the user-facing experience. The user sees 'built.' The career center sees 'completed.'"
 *
 * ── WHY A SCANNER AND NOT A LIST OF FIXES ────────────────────────────────
 * Because the success criterion is zero and the surface keeps growing. Eight violations
 * fixed by hand are eight violations that come back the next time someone adds a page,
 * and nothing would say so. This is the same shape as `gate-audit.ts`: the gate enumerates
 * its own trigger vocabulary, so the check is a string match rather than a model call, and
 * a regex cannot hallucinate a violation that is not there.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────
 * It does not decide. `completedAt`, `isComplete` and `session_completed` are identifiers
 * and column names, not text a student reads, and a scanner that flagged them would be
 * ignored within a day. So it looks only at prose: JSX text nodes and string literals that
 * read like sentences. Anything it is unsure about is reported separately rather than
 * counted, because a checker people trust is worth more than a checker that is exhaustive.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "client", "src");

/**
 * Her failure path, encoded. The career centre sees "completed"; the student does not.
 * Anything under an admin route is reporting for institutions and is exempt by her own
 * wording, so flagging it would be flagging the resolution.
 */
const EXEMPT = [
  `${"pages"}/admin/`,
  "/admin/",
  "components/admin/",
  /*
   * The unstyled primitives. A `<Check />` inside `checkbox.tsx`, `select.tsx` or
   * `dropdown-menu.tsx` is the affordance that says "this option is selected" — it is not
   * a progress checkmark, and her card is about task-completion indicators.
   *
   * Exempting the definitions costs nothing, because what this gate is actually about is
   * their USE: `<Progress value={…} />` on a report page is still reported, as it should
   * be. Six findings removed, none of them a thing a student reads as progress.
   */
  "components/ui/",
];

/** Her vocabulary, not ours. Each pattern quotes the phrase in the card it comes from. */
const RULES: ReadonlyArray<{
  what: string;
  pattern: RegExp;
  /** A context in which the pattern is not what it looks like. */
  skip?: RegExp;
  source: string;
}> = [
  {
    what: "completion language",
    // Word-bounded so `completedAt` and `incomplete` do not match.
    pattern: /\b(completed|complete|finished|done|checked off)\b/i,
    source: '"completed," "finished," "done," "checked off"',
  },
  {
    what: "X-of-Y counter",
    // "3/11", "3 of 11", "3 / 3". Her own example is "3/11 modules complete".
    pattern: /\b\d+\s*(?:\/|of)\s*\d+\b/,
    source: '"numerical progress indicators (3/11 modules complete)"',
  },
  {
    what: "percentage progress",
    /*
     * Not inside a colour. `hsl(167, 40%, 35%)` produced twenty findings on one page and
     * every one of them was a teal swatch. A percentage is a progress indicator when it
     * describes how far through something a person is, not when it is a saturation value.
     */
    pattern: /\b\d+\s*%|percent complete/i,
    skip: /\b(?:hsl|hsla|rgb|rgba|lab|lch|oklch|color-mix)\(/i,
    source: '"percentage bars"',
  },
  {
    what: "checkmark",
    /*
     * The glyph and the icon component. The icon is the one that got past the first
     * version of this rule: `<CheckCircle />` renders a tick and reads as "done" exactly
     * as ✓ does, and it was sitting next to the only sentence on the page that said "this
     * one's done". A card about visual indicators has to see the visual ones.
     */
    pattern: /[✅✓✔☑]|<Check(?:Circle|Square|Circle2)?\b|\bCheckIcon\b/,
    source: '"visual indicators (progress bars, checkmarks, X-of-Y counters)"',
  },
  {
    what: "progress bar",
    // The component, not the word: a rendered bar is a visual indicator whatever it is called.
    pattern: /<Progress\b|role="progressbar"|progress-bar/i,
    source: '"progress bars"',
  },
];

/**
 * Findings reviewed and judged not to be what the gate targets. Each carries its reason.
 *
 * ── WHY THIS IS NOT AN EXEMPTION LIST ────────────────────────────────────
 * Her success criterion is zero, so nothing here is "allowed". These are places where the
 * pattern fires and the thing it found is not a task-completion indicator, and the
 * alternative to writing the reason down is that the same argument gets re-had every time
 * someone runs this. They are reported separately, still visible, and never counted as
 * clean.
 *
 * Keyed on file plus the matched text, so moving a line does not silently re-accept it and
 * changing the copy does not silently keep the acceptance.
 */
const ACCEPTED: ReadonlyArray<{ file: string; contains: string; why: string }> = [
  {
    file: "components/chat/index.tsx",
    contains: 'role="progressbar"',
    why:
      "RailMeter. Used for `Confidence` on a produced artifact in foundation-session-chat " +
      "and enhancement-module-chat — a measurement of the thing the student built, not a " +
      "count of how far through a checklist they are. Her gate targets to-do-list framing, " +
      "and `role=\"progressbar\"` is the correct ARIA role for a bounded meter. Raised with " +
      "her rather than resolved by changing a11y semantics to satisfy a regex.",
  },
  {
    file: "pages/new-dashboard.tsx",
    contains: "already done rather than starting over",
    why:
      "\"What you've already done\" refers to the student's own prior work, which is the " +
      "opposite of a to-do list — it is Wing saying it will build on what exists rather " +
      "than restart. Her card is about framing the EXPERIENCE as tasks.",
  },
  {
    file: "pages/new-dashboard.tsx",
    contains: "you may complete a prior assessment",
    why:
      "\"Complete\" as a verb meaning \"take\", about an EXTERNAL assessment (MBTI, " +
      "StrengthsFinder). Not Wing framing its own modules as tasks, which is what the card " +
      "is about.",
  },
];

export type Finding = {
  file: string;
  line: number;
  what: string;
  source: string;
  text: string;
  /** Set when this matched a reviewed decision rather than being a live violation. */
  acceptedBecause?: string;
};

/**
 * A Tailwind class list, which is markup rather than prose.
 *
 * Worth its own function because it produced the checker's first two false positives:
 * `w-[72%]` and `w-[28%]` are column widths, and reporting them as "percentage progress"
 * is exactly the noise that gets a checker ignored within a day. The test is structural —
 * bracket utilities, breakpoint prefixes, or a majority of tokens that are known utility
 * prefixes — rather than a list of class names nobody will maintain.
 */
const UTILITY = /^(?:flex|grid|block|hidden|inline|w|h|min|max|text|bg|border|rounded|p|px|py|pt|pb|pl|pr|m|mt|mb|ml|mr|mx|my|gap|space|items|justify|self|absolute|relative|fixed|sticky|top|bottom|left|right|z|overflow|shrink|grow|basis|font|leading|tracking|opacity|shadow|ring|cursor|select|transition|duration|ease|animate|order|col|row|aspect|object|whitespace|break|truncate|underline|uppercase|lowercase|capitalize|antialiased|sr)(?:-|$)/;

export function looksLikeClassList(t: string): boolean {
  if (/\[[^\]]*\]/.test(t) && /(?:^|\s)[a-z-]+-\[/.test(t)) return true; // w-[72%]
  /*
   * Fractional utilities — `top-1/2`, `w-1/3`, `-translate-x-1/2`. These read as X-of-Y
   * counters to a regex and are centring maths. Four findings on the carousel primitive,
   * none of them a progress indicator.
   */
  if (/(?:^|\s)-?(?:[a-z]+-)+\d+\/\d+(?:\s|$)/.test(t)) return true;
  if (/(?:^|\s)(?:sm|md|lg|xl|2xl|hover|focus|active|disabled|dark|group-hover):/.test(t)) return true;
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return false;
  // Negative utilities keep their prefix: `-left-12` is `left`.
  const utility = tokens.filter((x) => UTILITY.test(x.replace(/^-/, ""))).length;
  return utility / tokens.length >= 0.6;
}

/**
 * Prose a student could read: JSX text between tags, and quoted strings containing a
 * space and a lower-case word — which is what separates `"Nothing built yet"` from
 * `"session_completed"` and `"completedAt"`.
 */
export function userFacingStrings(line: string): string[] {
  const out: string[] = [];

  /*
   * `exec` in a loop rather than `matchAll`. The repo's tsconfig declares
   * `lib: ["esnext", …]` and no `target`, so it emits ES5 against modern typings and
   * `matchAll` returns an iterator TS refuses to iterate — TS2802. It is the same trap
   * that has caught iterator spreads in this codebase before, and the fix is the same.
   */
  const jsx = />([^<>{}]{3,})</g;
  for (let m = jsx.exec(line); m !== null; m = jsx.exec(line)) {
    const t = m[1].trim();
    if (t && /[a-z]/.test(t) && !looksLikeClassList(t)) out.push(t);
  }

  /*
   * JSX text on a line of its own, which the pattern above cannot see because it needs
   * both angle brackets present. This was a real blind spot: `Complete Previous Session`
   * sits between a `<Lock />` and a `</Button>` on its own line, and the scan walked past
   * a locked-state button telling a student to complete something.
   *
   * Recognised structurally — a line with no markup, no code punctuation, and at least two
   * words — rather than by guessing. Anything with a brace, an equals or a semicolon is
   * code and is left alone.
   */
  const bare = line.trim();
  if (
    bare.length > 3 &&
    !/[<>{}=;()[\]|&]/.test(bare) &&
    !/^[/*]/.test(bare) &&
    !/["'`:,]/.test(bare) &&
    /^[A-Z(]?[A-Za-z]/.test(bare) &&
    bare.indexOf(" ") > 0 &&
    !looksLikeClassList(bare)
  ) {
    out.push(bare);
  }

  /*
   * Quoted strings. A space is normally required, because that is what separates prose
   * from `session_completed` and `completedAt`.
   *
   * The exception is a single Capitalised word — `"Completed"`, `"Locked"`, `"Done"` —
   * which is prose and was being skipped. That gap hid a status badge reading "Completed"
   * beside a tick, which is the exact pairing her card calls out. `completedAt` still
   * fails it (lower-case start) and `COMPLETED` still fails it (no lower-case tail).
   */
  const quoted = /["'`]([^"'`\n]{4,})["'`]/g;
  for (let m = quoted.exec(line); m !== null; m = quoted.exec(line)) {
    const t = m[1].trim();
    if (t.indexOf(" ") < 0 && !/^[A-Z][a-z]+$/.test(t)) continue;
    if (/^[A-Z0-9_\-/. ]+$/.test(t)) continue; // SHOUTY CONSTANTS and paths
    if (looksLikeClassList(t)) continue;
    if (/[a-z]/.test(t)) out.push(t);
  }

  return out;
}

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (/\.(tsx|ts)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p);
  }
  return files;
}

export function scanFile(path: string, text: string): Finding[] {
  const rel = relative(process.cwd(), path).replace(/\\/g, "/");
  if (EXEMPT.some((e) => rel.indexOf(e) >= 0)) return [];

  const out: Finding[] = [];
  const lines = text.split("\n");
  /*
   * Multi-line comments have to be tracked, not pattern-matched. A single-line test only
   * catches the first line of a block, and the continuation lines are indented prose —
   * which the bare-JSX-text rule then reads as user-facing copy. That produced a finding
   * on a paragraph explaining why a dashboard phase condition would never match.
   */
  let inBlockComment = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const opens = /\/\*|\{\s*\/\*/.test(line);
    const closes = /\*\//.test(line);
    if (inBlockComment) {
      if (closes) inBlockComment = false;
      continue;
    }
    if (opens && !closes) {
      inBlockComment = true;
      continue;
    }
    // Single-line comments, and a whole block opened and closed on one line.
    if (/^\s*(?:\/\/|\*|\/\*|\{\s*\/\*)/.test(line)) continue;

    for (const rule of RULES) {
      // `Progress` and `role="progressbar"` are markup, so those two read the raw line.
      const haystacks =
        rule.what === "progress bar" || rule.what === "checkmark"
          ? [line]
          : userFacingStrings(line);
      for (const h of haystacks) {
        if (!rule.pattern.test(h)) continue;
        if (rule.skip && rule.skip.test(h)) continue;
        const accepted = ACCEPTED.find(
          (a) => rel.indexOf(a.file) >= 0 && (h.indexOf(a.contains) >= 0 || line.indexOf(a.contains) >= 0),
        );
        out.push({
          file: rel,
          line: i + 1,
          what: rule.what,
          source: rule.source,
          text: h.length > 90 ? `${h.slice(0, 90)}…` : h,
          acceptedBecause: accepted?.why,
        });
        break;
      }
    }
  }
  return out;
}

function main() {
  const files = walk(ROOT);
  const all: Finding[] = [];
  for (const f of files) all.push(...scanFile(f, readFileSync(f, "utf8")));
  const findings = all.filter((f) => !f.acceptedBecause);
  const reviewed = all.filter((f) => f.acceptedBecause);

  console.log("\nIG-UX03 — \"Built\" not \"completed\"\n");
  console.log(`  scanned ${files.length} file(s) under client/src`);
  console.log(`  exempt:  the institutional admin surfaces, per her failure path\n`);

  const showReviewed = () => {
    if (!reviewed.length) return;
    console.log(`\n  ${reviewed.length} reviewed and judged not task-completion:`);
    for (const r of reviewed) {
      console.log(`    ${r.file}:${r.line}  ${r.text}`);
      console.log(`      ${r.acceptedBecause}\n`);
    }
  };

  if (!findings.length) {
    console.log("  no user-facing completion language or progress indicators found.");
    showReviewed();
    console.log("");
    return;
  }

  /*
   * Split by whether the surface is Tier 1, because "169 findings" is not 169 things to
   * fix before a launch date. Most of this is the pre-v2 MVP — the questionnaire, the
   * freshness report, the enhancement modules — which the Feature List puts in Tier 2/3.
   * A count that does not separate them turns a real gate into an unusable number.
   */
  const TIER1_SURFACES = [
    "pages/intake-chat",
    "pages/foundation-session-chat",
    "pages/foundation-page",
    "pages/life-log-page",
    "pages/new-dashboard",
    "components/chat/",
    "components/dashboard/",
  ];
  const isTier1 = (file: string) => TIER1_SURFACES.some((p) => file.indexOf(p) >= 0);

  const byFile = new Map<string, Finding[]>();
  for (const f of findings) byFile.set(f.file, (byFile.get(f.file) ?? []).concat(f));

  for (const tier1 of [true, false]) {
    const files = Array.from(byFile.entries()).filter(([f]) => isTier1(f) === tier1).sort();
    if (!files.length) continue;
    console.log(
      tier1
        ? "  ── TIER 1 SURFACES — these are the ones with a date on them ──────────\n"
        : "  ── TIER 2/3 SURFACES — the pre-v2 MVP; real, and not before September ─\n",
    );
    for (const [file, list] of files) {
      console.log(`  ${file}  (${list.length})`);
      for (const f of list) {
        console.log(`    ${String(f.line).padStart(5)}  ${f.what.padEnd(20)} ${f.text}`);
      }
      console.log("");
    }
  }

  const byKind: Record<string, number> = {};
  for (const f of findings) byKind[f.what] = (byKind[f.what] ?? 0) + 1;
  const t1 = findings.filter((f) => isTier1(f.file)).length;
  console.log(`  ${findings.length} finding(s) across ${byFile.size} file(s):`);
  for (const k of Object.keys(byKind).sort()) console.log(`    ${String(byKind[k]).padStart(4)}  ${k}`);
  console.log(`\n  ${t1} on Tier 1 surfaces, ${findings.length - t1} on Tier 2/3.`);
  showReviewed();

  console.log(
    "\n  Her replacements: \"Here's what you've built\" not \"completed\"; \"Function\n" +
      "  identified\" not \"Module 1 complete\"; \"3 stories captured\" not \"3/3 done\".\n" +
      "  Completion tracking that institutions need lives in the admin dashboard.\n",
  );
}

/*
 * Run as a script, not when imported. The first version tested `indexOf("check-ux")`,
 * which is also true of `check-ux.test.ts` — so importing the scanner ran a full scan of
 * a directory the test does not have. Matching the exact filename is the fix.
 */
const invoked = (process.argv[1] ?? "").replace(/\\/g, "/");
if (/\/check-ux\.tsx?$/.test(invoked)) main();
