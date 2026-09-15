import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2, ClipboardList, AlertTriangle, CircleSlash, Trophy, Users, Columns3, X,
} from "lucide-react";
import { apiFetch, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

/**
 * P6.2 — the Unfired Cards report, across every run that shares a sequence.
 *
 * Danielle's own framing, quoted in `wing/unfired-cards-report.ts`: "if a
 * card never fires across 20 personas, that's either a card that needs
 * different signal conditions or a card that's dead weight." The
 * Session review tab already has a per-session version of this split
 * (`UnfiredForSession`) and says, in its own comment, that a single session
 * is one persona's worth of evidence and that the cross-persona report
 * needs the runner. The runner exists now (the Personas tab drives it);
 * this screen is that report.
 *
 * ── WHY A SEQUENCE, NOT A FREE RUN PICKER ─────────────────────────────────
 * A card's identity — whether it was ever eligible, considered, or won — only
 * means one thing within one sequence's own catalogue. Comparing runs across
 * two sequences would silently mix two different meanings of "this card" (the
 * server refuses that explicitly — see `runs_span_multiple_sequences`), so
 * the UI picks a cycle first, which pins its published sequence, rather than
 * a free multi-select of individual runs.
 *
 * ── WHAT IS AND IS NOT A FINDING, SURFACED ON THE SCREEN ──────────────────
 * Same discipline as the per-session view: three buckets, each labelled with
 * whose problem it is. `fired` cards are counted but not itemized — this
 * screen exists to show what did NOT fire.
 */

type Cycle = {
  id: number;
  label: string | null;
  cycleYear: number;
  institutionId: number | null;
  sequenceId: number | null;
  publishable: boolean;
};

type UnfiredBucket = "never_eligible" | "eligible_never_won" | "never_considered" | "fired";
type DropStage = "card_kind" | "session_scope" | "population_tag" | "no_signal_component";

type UnfiredCardRow = {
  heuristicId: number;
  cardCode: string;
  name: string;
  bucket: UnfiredBucket;
  turnsEligible: number;
  turnsConsidered: number;
  timesWon: number;
  dropStages: DropStage[];
};

type RunSummary = {
  runId: number;
  personaId: number;
  personaName: string;
  status: string;
  sessionsTraced: number;
  turnsTraced: number;
};

type UnfiredCardsReport = {
  sequenceId: number;
  runsIncluded: RunSummary[];
  totalTurnsTraced: number;
  cards: UnfiredCardRow[];
  generatedAt: string;
};

/**
 * P6.3 — the same card, pivoted per persona instead of summed across all of
 * them. Fetched lazily per card, only once someone asks "which audiences
 * does THIS card reach" — the bucket tables above already say whether a
 * card fired at all across the run set; this view answers the question
 * that sits right next to it.
 */
type ComparisonOutcome =
  | "won"
  | "eligible_never_won"
  | "never_considered"
  | "never_eligible"
  | "no_turns";

type CardComparisonPersonaRow = {
  runId: number;
  personaId: number;
  personaName: string;
  status: string;
  studentTags: string[];
  turnsTraced: number;
  turnsEligible: number;
  turnsConsidered: number;
  timesWon: number;
  outcome: ComparisonOutcome;
  dropReasons: string[];
};

type CardComparisonReport = {
  sequenceId: number;
  heuristicId: number;
  cardCode: string;
  name: string;
  perPersona: CardComparisonPersonaRow[];
  generatedAt: string;
};

const OUTCOME_BADGE: Record<ComparisonOutcome, { label: string; className: string }> = {
  won: { label: "Won", className: "border-success/30 bg-success-soft text-success" },
  eligible_never_won: { label: "Eligible, never won", className: "border-warn/30 bg-warn-soft text-warn" },
  never_considered: {
    label: "Never considered",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  never_eligible: { label: "Never eligible", className: "border-muted-foreground/30 text-muted-foreground" },
  no_turns: { label: "No turns traced", className: "border-muted-foreground/30 text-muted-foreground" },
};

const STAGE_LABEL: Record<DropStage, string> = {
  card_kind: "not a coaching card",
  session_scope: "scoped to another session",
  population_tag: "not this student's audience",
  no_signal_component: "no signal component",
};

const BUCKET_COPY: Record<
  Exclude<UnfiredBucket, "fired">,
  { title: string; whose: string; tone: "finding" | "engine" | "coverage" }
> = {
  eligible_never_won: {
    title: "Reached the detector, never won",
    whose: "A finding — the card competed and lost every turn across this run set.",
    tone: "finding",
  },
  never_considered: {
    title: "Eligible and never evaluated",
    whose: "An engine question, not a card question — send this to Aditya.",
    tone: "engine",
  },
  never_eligible: {
    title: "Never eligible for any persona in this run set",
    whose: "Not a finding — needs a persona in this card's audience, not a new card.",
    tone: "coverage",
  },
};

const BUCKET_ORDER: Array<Exclude<UnfiredBucket, "fired">> = [
  "eligible_never_won",
  "never_considered",
  "never_eligible",
];

export function UnfiredCardsPanel() {
  const [cycleChoice, setCycleChoice] = useState("");

  const { data: cyclesData } = useQuery<{ cycles: Cycle[] }>({
    queryKey: ["/api/admin/harness/personas/cycles"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/harness/personas/cycles")).json(),
  });

  const cycles = (cyclesData?.cycles ?? []).filter((c) => c.sequenceId !== null);
  const chosenCycle = cycles.find((c) => String(c.id) === cycleChoice) ?? null;
  const sequenceId = chosenCycle?.sequenceId ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Cards that never fired</h2>
        <p className="text-sm text-muted-foreground">
          Grouped by whose problem it is, not just counted — a card can be dead weight, an engine
          bug, or simply never applicable to anyone tested so far, and those call for very
          different fixes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClipboardList className="h-4 w-4 text-brand" />
            Choose a sequence
          </CardTitle>
          <CardDescription>
            Every persona run against this cycle's published sequence is pulled in — the report
            says below exactly which runs, and their status, produced its counts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Cycle</Label>
              <Select value={cycleChoice} onValueChange={setCycleChoice}>
                <SelectTrigger className="h-9 w-72">
                  <SelectValue placeholder="Choose a cycle" />
                </SelectTrigger>
                <SelectContent>
                  {cycles.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.label ?? `Cycle ${c.id}`} · {c.cycleYear} · sequence {c.sequenceId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!cycles.length && (
              <p className="text-xs text-muted-foreground">
                No cycle here publishes a sequence yet — nothing to report against.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {sequenceId !== null && <ReportView sequenceId={sequenceId} />}
    </div>
  );
}

function ReportView({ sequenceId }: { sequenceId: number }) {
  const [compareCard, setCompareCard] = useState<{ heuristicId: number; cardCode: string } | null>(null);
  const { data, isLoading, error } = useQuery<UnfiredCardsReport, { status: number; message: string }>({
    queryKey: ["/api/test/unfired-cards", sequenceId],
    queryFn: async () => {
      const res = await apiFetch<UnfiredCardsReport & { error?: string; detail?: string }>(
        "GET",
        `/api/test/unfired-cards?sequenceId=${sequenceId}`,
      );
      if (!res.ok) {
        throw { status: res.status, message: res.data?.detail ?? res.data?.error ?? "Could not load the report" };
      }
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error?.status === 404) {
    return (
      <Alert>
        <CircleSlash className="h-4 w-4" />
        <AlertTitle>No runs yet for this sequence</AlertTitle>
        <AlertDescription>
          Provision and drive at least one persona run against it from the Personas tab, then
          come back — this report only ever describes runs that actually happened.
        </AlertDescription>
      </Alert>
    );
  }

  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Could not load the report</AlertTitle>
        <AlertDescription>{error?.message ?? "Unknown error"}</AlertDescription>
      </Alert>
    );
  }

  const firedCount = data.cards.filter((c) => c.bucket === "fired").length;
  const byBucket = (b: Exclude<UnfiredBucket, "fired">) => data.cards.filter((c) => c.bucket === b);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-4 w-4 text-brand" />
            Runs in this report
          </CardTitle>
          <CardDescription>
            Sequence {data.sequenceId} · {data.runsIncluded.length} run
            {data.runsIncluded.length === 1 ? "" : "s"} · {data.totalTurnsTraced} student turns
            traced · generated {new Date(data.generatedAt).toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {data.runsIncluded.map((r) => (
              <Badge key={r.runId} variant="outline" className="gap-1 text-xs font-normal">
                {r.personaName}
                <span className="font-mono text-xs text-muted-foreground">
                  #{r.runId} · {r.status} · {r.turnsTraced}t
                </span>
              </Badge>
            ))}
          </div>
          {!data.runsIncluded.length && (
            <p className="text-xs text-muted-foreground">No runs matched — nothing to show.</p>
          )}
        </CardContent>
      </Card>

      {compareCard && (
        <CardComparisonView
          sequenceId={sequenceId}
          heuristicId={compareCard.heuristicId}
          cardCode={compareCard.cardCode}
          onClose={() => setCompareCard(null)}
        />
      )}

      {BUCKET_ORDER.map((bucket) => {
        const rows = byBucket(bucket);
        if (!rows.length) return null;
        return (
          <Card key={bucket}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                {BUCKET_COPY[bucket].title}{" "}
                <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                  {rows.length}
                </Badge>
              </CardTitle>
              <CardDescription
                className={
                  BUCKET_COPY[bucket].tone === "finding"
                    ? "text-warn"
                    : BUCKET_COPY[bucket].tone === "engine"
                      ? "text-destructive"
                      : undefined
                }
              >
                {BUCKET_COPY[bucket].whose}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Card</th>
                      <th className="py-2 pr-3 text-right font-medium">Turns eligible</th>
                      <th className="py-2 pr-3 text-right font-medium">Considered</th>
                      {bucket !== "never_eligible" && (
                        <th className="py-2 pr-3 font-medium">Notes</th>
                      )}
                      {bucket === "never_eligible" && (
                        <th className="py-2 pr-3 font-medium">Dropped at</th>
                      )}
                      <th className="py-2 pl-3 text-right font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.heuristicId} className="border-b last:border-0">
                        <td className="py-2 pr-3">
                          <span className="font-medium">{r.name}</span>{" "}
                          <span className="font-mono text-xs text-muted-foreground">
                            {r.cardCode}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right">{r.turnsEligible}</td>
                        <td className="py-2 pr-3 text-right">{r.turnsConsidered}</td>
                        {bucket === "never_eligible" ? (
                          <td className="py-2 pr-3 text-xs text-muted-foreground">
                            {r.dropStages.map((s) => STAGE_LABEL[s]).join(", ") || "—"}
                          </td>
                        ) : (
                          <td className="py-2 pr-3 text-xs text-muted-foreground">
                            {bucket === "never_considered"
                              ? "reached kind/scope/audience filters but the detector's catalogue never saw it"
                              : "considered at least once, never won"}
                          </td>
                        )}
                        <td className="py-2 pl-3 text-right">
                          <button
                            type="button"
                            onClick={() => setCompareCard({ heuristicId: r.heuristicId, cardCode: r.cardCode })}
                            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                            title="Compare this card across every persona in this run set"
                          >
                            <Columns3 className="h-3 w-3" />
                            Compare
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {!BUCKET_ORDER.some((b) => byBucket(b).length) && (
        <Alert>
          <Trophy className="h-4 w-4" />
          <AlertTitle>Every card in this sequence fired at least once</AlertTitle>
          <AlertDescription>
            Nothing to report — {firedCount} card{firedCount === 1 ? "" : "s"} won at least one
            turn across this run set and none were left unfired.
          </AlertDescription>
        </Alert>
      )}

      <p className="text-xs text-muted-foreground">
        {firedCount} card{firedCount === 1 ? "" : "s"} fired at least once in this run set and
        {" "}are not itemized here — this report is about what did not fire.
      </p>
    </div>
  );
}

function CardComparisonView({
  sequenceId,
  heuristicId,
  cardCode,
  onClose,
}: {
  sequenceId: number;
  heuristicId: number;
  cardCode: string;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery<CardComparisonReport, { status: number; message: string }>({
    queryKey: ["/api/test/card-comparison", sequenceId, heuristicId],
    queryFn: async () => {
      const res = await apiFetch<CardComparisonReport & { error?: string; detail?: string }>(
        "GET",
        `/api/test/card-comparison?sequenceId=${sequenceId}&heuristicId=${heuristicId}`,
      );
      if (!res.ok) {
        throw { status: res.status, message: res.data?.detail ?? res.data?.error ?? "Could not load the comparison" };
      }
      return res.data;
    },
  });

  return (
    <Card className="border-brand/30">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Columns3 className="h-4 w-4 text-brand" />
              {data ? (
                <>
                  {data.name}{" "}
                  <span className="font-mono text-sm font-normal text-muted-foreground">
                    {data.cardCode}
                  </span>
                </>
              ) : (
                <span className="font-mono text-sm">{cardCode}</span>
              )}
            </CardTitle>
            <CardDescription>
              Every persona in this run set, side by side — the same card, one audience at a time.
            </CardDescription>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            title="Close comparison"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && error?.status === 404 && (
          <Alert>
            <CircleSlash className="h-4 w-4" />
            <AlertTitle>
              {error.message === "card_not_found_in_scope"
                ? "Card not found in this run set"
                : "No runs yet for this sequence"}
            </AlertTitle>
            <AlertDescription>
              {error.message === "card_not_found_in_scope"
                ? "None of the runs in scope ever traced this heuristic — it may belong to a different sequence."
                : "Provision and drive at least one persona run against it, then try again."}
            </AlertDescription>
          </Alert>
        )}

        {!isLoading && error && error.status !== 404 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Could not load the comparison</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        {!isLoading && data && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Persona</th>
                  <th className="py-2 pr-3 font-medium">Audience</th>
                  <th className="py-2 pr-3 text-right font-medium">Eligible</th>
                  <th className="py-2 pr-3 text-right font-medium">Considered</th>
                  <th className="py-2 pr-3 text-right font-medium">Won</th>
                  <th className="py-2 pr-3 font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {data.perPersona.map((p) => (
                  <tr key={p.runId} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-3">
                      {p.personaName}
                      <div className="font-mono text-xs text-muted-foreground">
                        #{p.runId} · {p.status}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {p.studentTags.length ? p.studentTags.join(", ") : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right">{p.turnsEligible}</td>
                    <td className="py-2 pr-3 text-right">{p.turnsConsidered}</td>
                    <td className="py-2 pr-3 text-right">{p.timesWon}</td>
                    <td className="py-2 pr-3">
                      <Badge variant="outline" className={`text-xs font-normal ${OUTCOME_BADGE[p.outcome].className}`}>
                        {OUTCOME_BADGE[p.outcome].label}
                      </Badge>
                      {p.outcome === "never_eligible" && p.dropReasons.length > 0 && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {p.dropReasons.join("; ")}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
