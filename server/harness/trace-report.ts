/**
 * `npm run harness:trace -- <sessionId> [--json] [--unfired]`
 *
 * Prints the selection trace for one session: which cards were in the
 * sequence, which left before the detector and at which stage, which reached
 * it, which won with what confidence and on whose rationale — and what the
 * platform does not record, named explicitly so a gap is never read as a
 * finding.
 *
 * ── WHY A SCRIPT BEFORE A ROUTE ──────────────────────────────────────────
 * Registering a route means adding a line to `server/routes.ts`. That line is
 * additive and harmless, but it is still a change to a file the whole platform
 * loads, and this first commit deliberately touches nothing outside
 * `server/harness/` and a `package.json` script entry. The route comes with the
 * admin panel, when there is a UI to serve.
 *
 * It works on ANY session, test or real. Pointed at a session Danielle ran by
 * hand, it gives her the trace visibility she asked for before a runner exists
 * — which is the earliest point any of this is useful to her.
 *
 * `initScript()` before importing the store, not after: `server/db.ts` builds
 * its pool at module load and throws without DATABASE_URL, so the secret has to
 * be in the environment before `./trace-store` is evaluated at all.
 */

import { initScript } from "../script-init";

const HELP = `
usage: npm run harness:trace -- <sessionId> [--json] [--unfired]

  <sessionId>   wing.sessions.id to trace
  --json        emit the full trace as JSON instead of the readable summary
  --unfired     append the three-way unfired-card breakdown for this session
`;

async function main() {
  const args = process.argv.slice(2);
  const sessionId = Number(args.find((a) => /^\d+$/.test(a)));
  if (!Number.isFinite(sessionId) || sessionId <= 0) {
    console.error(HELP);
    process.exit(1);
  }

  const asJson = args.includes("--json");
  const withUnfired = args.includes("--unfired");

  await initScript();
  const { sessionTrace } = await import("./trace-store");
  const { classifyUnfired } = await import("./selection-trace");

  const result = await sessionTrace(sessionId);
  if (!result) {
    console.error(`no session ${sessionId}`);
    process.exit(1);
  }

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\nsession ${result.sessionId} · ${result.sessionType} · student ${result.studentId}`);
  console.log(
    `sequence ${result.sequenceId ?? "—"} (${result.sequenceSource}) · ` +
      `population tags [${result.populationTags.join(", ") || "none"}] as of now`,
  );
  if (result.note) console.log(`\n${result.note}\n`);

  for (const turn of result.turns) {
    const t = turn.trace;
    console.log(`\n─── turn ${turn.sequencePosition} (id ${turn.turnId}) · ${turn.turnType}`);
    console.log(`    "${turn.content.replace(/\s+/g, " ").slice(0, 160)}"`);
    if (!turn.analysisEligible) {
      console.log(`    EXCLUDED FROM ANALYSIS: ${turn.analysisExclusionReason ?? "no reason recorded"}`);
    }

    const d = t.counts.dropped;
    console.log(
      `    ${t.counts.inSequence} in sequence → ${t.counts.considered} reached the detector` +
        `  (dropped: kind ${d.card_kind}, scope ${d.session_scope}, ` +
        `audience ${d.population_tag}, no-signal ${d.no_signal_component})`,
    );

    if (t.winner) {
      const won = t.cards.find((c) => c.outcome.state === "won")!;
      const conf = t.winner.confidence;
      console.log(
        `    WON  ${t.winner.cardCode} ${won.name}` +
          (conf === null ? "" : ` · confidence ${conf.toFixed(2)}`),
      );
      if (won.outcome.state === "won" && won.outcome.rationale) {
        console.log(`         detector: ${won.outcome.rationale}`);
      }
    } else {
      const withheld = t.cards.find((c) => c.outcome.state === "withheld");
      if (withheld && withheld.outcome.state === "withheld") {
        console.log(`    WITHHELD  ${withheld.cardCode} — ${withheld.outcome.reason}`);
      } else {
        console.log(`    NO CARD FIRED — reason not recorded (see 'unavailable')`);
      }
    }

    const considered = t.cards.filter((c) => c.outcome.state === "considered");
    if (considered.length) {
      console.log(
        `    considered and did not win: ${considered
          .map((c) => `${c.cardCode}@${c.weight}`)
          .join(", ")}`,
      );
    }

    const audienceDrops = t.cards.filter(
      (c) => c.outcome.state === "dropped" && c.outcome.stage === "population_tag",
    );
    if (audienceDrops.length) {
      console.log(
        `    never eligible for this student: ${audienceDrops.map((c) => c.cardCode).join(", ")}`,
      );
    }

    for (const f of turn.gateFindings) {
      console.log(`    GATE BREACH  ${f.cardCode} (${f.mode}) matched "${f.matched}"`);
    }
  }

  if (withUnfired && result.turns.length) {
    const rows = classifyUnfired(result.turns.map((t) => t.trace));
    console.log(`\n─── unfired cards, this session only`);
    for (const bucket of ["eligible_never_won", "never_considered", "never_eligible"] as const) {
      const inBucket = rows.filter((r) => r.bucket === bucket);
      if (!inBucket.length) continue;
      console.log(`\n  ${bucket} (${inBucket.length})`);
      if (bucket === "never_eligible") {
        console.log(`  ↳ not a methodology finding: these never reached the detector`);
      }
      if (bucket === "never_considered") {
        console.log(`  ↳ eligible and still never evaluated — investigate the engine, not the card`);
      }
      for (const r of inBucket) {
        console.log(
          `    ${r.cardCode.padEnd(12)} ${r.name.slice(0, 48).padEnd(50)}` +
            (r.dropStages.length ? ` dropped at: ${r.dropStages.join(", ")}` : ""),
        );
      }
    }
    console.log(
      `\n  One session is one persona's worth of evidence. The cross-persona report is` +
        `\n  the one that answers "never fires for anyone" — that needs the runner.`,
    );
  }

  const t0 = result.turns[0]?.trace;
  if (t0) {
    console.log(`\n─── not recorded by the platform, so absent from this trace`);
    for (const u of t0.unavailable) console.log(`    · ${u}`);
  }
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
