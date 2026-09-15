import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Loader2, Plus, Pencil, Trash2, Rocket, AlertTriangle, Lock, FileText, FastForward, Play,
  Square, RefreshCw, Sparkles, ChevronDown,
} from "lucide-react";
import { apiFetch, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  SESSION_TYPE_LABEL, sessionLabel, relativeTime, Stat, ChatBubble, FiredCardChip,
} from "./harness-ui";

/**
 * Persona authoring — the UI half of what `methodology/personas/*.md` +
 * `wing:seed-personas` already do from the CLI.
 *
 * ── WHY EIGHT FIELDS, NOT ONE SPEC BODY ───────────────────────────────────
 * The first cut of this form had one free-text blob and a "link to the
 * source document" note. Aditya's correction, 10 Sep: expose the actual
 * sections Danielle's own document uses, so she never has to paste a
 * document in and nothing here depends on parsing one. `CONTENT_FIELDS`
 * below is exactly `harness-persona-store.ts`'s `CONTENT_FIELDS` — same
 * keys, same order — because `composeSpecPrompt()` on the server
 * concatenates them in that order into the one text a future runner
 * injects. Change one list, change the other.
 *
 * ── WHY A DRAFT CAN BE INCOMPLETE ─────────────────────────────────────────
 * Professional status and pathway are the two fields the platform cannot
 * default (they resolve the audience tags the detector filters on — see the
 * banner below), but Danielle should be able to start writing a persona
 * before she's answered them, or before every section is filled in. So
 * "Save" never refuses; only "Activate" does, and it says exactly what's
 * missing rather than greying out a button with no explanation attached.
 *
 * ── WHY ACTIVATED FIELDS LOCK ─────────────────────────────────────────────
 * Once a persona is seeded it is a real account, possibly with real
 * transcripts under review. Editing its professional status or pathway here
 * would silently disagree with the account that already exists — the same
 * reason `wing:seed-personas` never updates an existing persona on a
 * re-run. The profile sections, markers and related-persona notes stay
 * editable; those don't change what account exists, only what the next run
 * injects.
 */

const CONTENT_FIELDS = [
  {
    key: "quickReference",
    heading: "Quick Reference",
    caption: "The one paragraph a reader skims first — who this is, what they want.",
  },
  {
    key: "readinessByBehavior",
    heading: "Readiness to change — by behavior",
    caption: "Stage of change for each named behavior, the same way Danielle's document tables it.",
  },
  {
    key: "interactionPolicy",
    heading: "Interaction Policy",
    caption: "How Wing should behave with this persona — tone, pacing, what to avoid pushing on.",
  },
  {
    key: "voiceSample",
    heading: "Voice Sample",
    caption: "A line or two in their actual voice, verbatim, so the model has something to match.",
  },
  {
    key: "diamond",
    heading: "Diamond (testable outcome)",
    caption: "The one outcome this persona exists to test for.",
  },
  {
    key: "coldStartNote",
    heading: "The Cold-Start Problem",
    caption: "What's different because this account has no history yet.",
  },
  {
    key: "systemPromptSummary",
    heading: "System Prompt Summary",
    caption: "A short summary of the persona, written the way it would sit inside a system prompt.",
  },
  {
    key: "whatThisTests",
    heading: "What This Tests",
    caption: "Qualitative — read by a person via the Simulations trace, not counted by any marker.",
  },
] as const;

type ContentKey = (typeof CONTENT_FIELDS)[number]["key"];

type HarnessPersona = {
  id: number;
  personaKey: string;
  name: string;
  professionalStatus: string | null;
  pathway: string | null;
  defaultModelTier: string | null;
  expectedMarkers: string[];
  quickReference: string;
  readinessByBehavior: string;
  interactionPolicy: string;
  voiceSample: string;
  diamond: string;
  coldStartNote: string;
  systemPromptSummary: string;
  whatThisTests: string;
  status: "draft" | "ready" | "seeded";
  seededStudentId: number | null;
  seededCycleId: number | null;
  updatedAt: string;
  // Attached by GET /api/admin/harness/personas so the list's own load
  // carries each persona's most recent run — null for a persona that's
  // never been run. Lets the panel reattach to a run's progress on mount
  // instead of only while the component that started it stays mounted.
  latestRun: {
    runId: number;
    status: "provisioned" | "running" | "completed" | "aborted";
    startedAt: string | null;
    finishedAt: string | null;
  } | null;
};

type Cycle = {
  id: number;
  label: string | null;
  cycleYear: number;
  institutionId: number | null;
  sequenceId: number | null;
  publishable: boolean;
};

type Vocabulary = { professionalStatuses: string[]; pathways: string[]; modelTiers: string[] };

/**
 * "marked complete" only, so far — `server/wing/checkpoint-store.ts`.
 * Fabricates Foundation completions and their synthetic artifacts in
 * seconds, no model cost. Valid for "does this card fire, and what does it
 * say" — not for "does it land", which needs the "replayed" fidelity this
 * doesn't build yet.
 */
const CHECKPOINT_LABELS: Record<string, string> = {
  from_scratch: "From scratch",
  foundation_1_complete: "Foundation 1 complete",
  foundation_2_complete: "Foundation 2 complete",
  module_6_entry: "Module 6 entry (F1–F3 complete)",
};

const NONE = "__unset__";

function hasAnyContent(p: Pick<HarnessPersona, ContentKey>): boolean {
  return CONTENT_FIELDS.some((f) => p[f.key].trim().length > 0);
}

function filledCount(p: Pick<HarnessPersona, ContentKey>): number {
  return CONTENT_FIELDS.filter((f) => p[f.key].trim().length > 0).length;
}

function previewText(p: Pick<HarnessPersona, ContentKey>): string | null {
  const first = CONTENT_FIELDS.find((f) => p[f.key].trim().length > 0);
  return first ? p[first.key].trim() : null;
}

function isReady(p: Pick<HarnessPersona, "professionalStatus" | "pathway"> & Pick<HarnessPersona, ContentKey>) {
  return Boolean(p.professionalStatus && p.pathway && hasAnyContent(p));
}

function listField(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * P3.1's UI half — the "Run" button (Aditya, 11 Sep 2026: "Also wire a
 * 'Run' button into the Personas panel"). A separate component, not inline
 * in the persona list's `.map()`, because it needs its own poll query and
 * that query's hook must be called the same number of times on every
 * render regardless of how many personas there are.
 *
 * ── ONE CLICK, TWO REQUESTS ───────────────────────────────────────────────
 * `POST .../initialize` provisions a fresh run every time — reusing a
 * finished run doesn't make sense (its transcript already happened), so
 * "rerun with a different model" is simply: pick a tier, click Run again.
 * `POST .../:runId/drive` answers as soon as the run is claimed and the
 * turn loop keeps going in the background, so this polls `GET
 * /api/test/runs/:runId` every few seconds while the run is "running".
 *
 * Wing's own tier is never a choice here — only the persona's is. See
 * `test-run-engine.ts`'s own doc comment for why that is not configurable.
 */
const MODEL_TIERS: { value: string; label: string }[] = [
  { value: "nano", label: "Nano (default)" },
  { value: "mid", label: "Mid" },
  { value: "flagship", label: "Flagship" },
];

/** Mirrors `test-run-store.ts`'s own defaults — shown as placeholders so
 *  leaving a field blank is visibly "use the default," not "use nothing." */
const DEFAULT_TURN_CEILING = 15;
const DEFAULT_TOKEN_BUDGET = 300_000;
const DEFAULT_MAX_WALL_CLOCK_SECONDS = 900;

type TestRunDetail = {
  run: {
    id: number;
    status: "provisioned" | "running" | "completed" | "aborted";
    modelDeployment: string | null;
    abortReason: string | null;
    // Set only when status is "completed" — "crisis_hold_asserted" marks a
    // run the platform deliberately ended early because the persona's own
    // turn tripped a safety hold (Aditya, 11 Sep 2026: "treat hold as
    // success"). Null on an ordinary completion.
    completionReason: string | null;
    turnCeiling: number;
    tokenBudget: number;
    tokensUsed: number;
    maxWallClockSeconds: number;
    startedAt: string | null;
    finishedAt: string | null;
  };
  session: { status: string; turnCount: number; sessionType: string } | null;
  turns: { id: number; turnType: string; content: string; position: number }[];
  // P4.3/P5 — computed on read from the persona's own turns, never written.
  // null only when there's no run-session yet (a run that hasn't been driven).
  adherence: {
    turnCount: number;
    lengthAdherence: number;
    brokeCharacter: boolean;
    adherent: boolean;
    expectedMarkers: string[];
    totals: {
      wordCount: number;
      hedgingSofteners: number;
      causalConnectives: number;
      repairFalseStarts: number;
      modalVerbs: { epistemic: number; deontic: number; dynamic: number };
      pronouns: { firstPersonSingular: number; collective: number; depersonalized: number };
    };
    notMeasured: { rule: string; reason: string }[];
  } | null;
  // P5.4 — hedging-specific discrepancies, same session trace the
  // Methodology > Simulations screen reconstructs. Null only when there's no
  // methodology to trace against (mirrors trace-store.ts's own real,
  // non-error "no sequence resolves" state).
  discrepancies:
    | {
        turnId: number;
        turnContent: string;
        hedgingSofteners: number;
        winnerCardCode: string | null;
        winnerCardName: string | null;
        type: "false_negative" | "unearned_fire";
      }[]
    | null;
  // P7 — card badges on the transcript. Keyed by turn id; `null` means
  // traced and nothing won, no key means this turn was never in scope for
  // a trace (Wing's own turns).
  cardWins: Record<number, { cardCode: string; name: string } | null>;
} | null;

/** `startedAt`/`finishedAt` are ISO strings from the run row (or null before
 *  driving starts / while still running). Ticks live while a run is
 *  "running" because the query polling that state already re-renders this
 *  component every 2.5s — no separate timer needed. */
function formatElapsed(startedAt: string | null, finishedAt: string | null): string | null {
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

type PersonaRunSummary = {
  runId: number;
  checkpoint: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
};

function PersonaRunControls({
  persona,
  checkpoint,
  onCheckpointChange,
  checkpoints,
}: {
  persona: HarnessPersona;
  checkpoint: string;
  onCheckpointChange: (value: string) => void;
  checkpoints: string[];
}) {
  const { toast } = useToast();
  // Danielle's own default for this persona (Aditya, 11 Sep 2026), not a
  // hardcoded "nano" — the picker still lets her override per run, same as
  // before; this only changes what a fresh Run click starts from.
  const [tier, setTier] = useState(persona.defaultModelTier ?? "nano");
  // Seeded from the persona's own latestRun (attached by the list route),
  // not hardcoded null — otherwise a page reload or a return visit loses all
  // trace of a run that's still going, or just finished, with no way to
  // recover it short of guessing the run id. Aditya, 15 Sep 2026.
  const [runId, setRunId] = useState<number | null>(persona.latestRun?.runId ?? null);
  // Open by default: the conversation is the thing a test run exists to
  // produce, and it used to sit collapsed behind a toggle at the very end
  // of the control row.
  const [showTranscript, setShowTranscript] = useState(true);
  const [showDebrief, setShowDebrief] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // P7 gap closed: turnCeiling/tokenBudget/maxWallClockSeconds were already
  // accepted by POST .../initialize (migration 0045) but never surfaced
  // here — every run silently took the server's defaults. Blank means
  // "use the default," same convention the route itself uses for
  // "field omitted."
  const [showDetails, setShowDetails] = useState(false);
  const [turnCeilingInput, setTurnCeilingInput] = useState("");
  const [tokenBudgetInput, setTokenBudgetInput] = useState("");
  const [maxWallClockInput, setMaxWallClockInput] = useState("");

  const {
    data: runDetail,
    refetch: refetchRunDetail,
    isFetching: isRefetchingRunDetail,
  } = useQuery<TestRunDetail>({
    queryKey: ["/api/test/runs", runId],
    queryFn: async () => (await apiRequest("GET", `/api/test/runs/${runId}`)).json(),
    enabled: runId !== null,
    refetchInterval: (query) => (query.state.data?.run?.status === "running" ? 2500 : false),
  });

  // Aditya, 15 Sep 2026: "I can only see the transcript for the latest run
  // ... what if I want to see older runs also?" -- fetched lazily, only once
  // the history list is actually opened, same as PersonaRevealCycle's own
  // history query below.
  const { data: runHistory, isLoading: isLoadingHistory } = useQuery<{ runs: PersonaRunSummary[] }>({
    queryKey: ["/api/test/personas", persona.id, "runs"],
    queryFn: async () => (await apiRequest("GET", `/api/test/personas/${persona.id}/runs`)).json(),
    enabled: showHistory,
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!persona.seededStudentId) throw new Error("Persona is not seeded");
      if (!checkpoint) throw new Error("Choose a checkpoint first — a run needs a starting point");

      const overrides: Record<string, number> = {};
      if (turnCeilingInput.trim() !== "") overrides.turnCeiling = Number(turnCeilingInput);
      if (tokenBudgetInput.trim() !== "") overrides.tokenBudget = Number(tokenBudgetInput);
      if (maxWallClockInput.trim() !== "") overrides.maxWallClockSeconds = Number(maxWallClockInput);

      const init = await apiFetch<{ error?: string; detail?: string; runId?: number }>(
        "POST",
        "/api/test/sessions/initialize",
        { personaId: persona.id, checkpoint, ...overrides },
      );
      if (!init.ok || !init.data?.runId) {
        throw new Error(init.data?.detail ?? init.data?.error ?? "Could not provision a run");
      }

      const drive = await apiFetch<{ error?: string; detail?: string }>(
        "POST",
        `/api/test/runs/${init.data.runId}/drive`,
        { modelDeployment: tier },
      );
      if (!drive.ok) {
        throw new Error(drive.data?.detail ?? drive.data?.error ?? "Could not start driving the run");
      }

      return init.data.runId;
    },
    onSuccess: (newRunId) => {
      setRunId(newRunId);
      setShowTranscript(true);
      toast({
        title: "Session started",
        description: `${persona.name} is talking to Wing now. This usually takes a minute or two.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Could not start run", description: error.message, variant: "destructive" });
    },
  });

  const abortMutation = useMutation({
    mutationFn: async () => {
      if (runId === null) throw new Error("No run to abort");
      const res = await apiFetch<{ error?: string; detail?: string }>(
        "POST",
        `/api/test/runs/${runId}/abort`,
        {},
      );
      if (!res.ok) throw new Error(res.data?.detail ?? res.data?.error ?? "Could not abort the run");
    },
    onSuccess: () => {
      toast({ title: "Abort requested", description: "The run will stop before its next turn." });
    },
    onError: (error: Error) => {
      toast({ title: "Could not abort", description: error.message, variant: "destructive" });
    },
  });

  const run = runDetail?.run ?? null;
  const status = run?.status;
  const isRunning = status === "running" || status === "provisioned";
  const isBusy = runMutation.isPending || isRunning;
  const turns = runDetail?.turns ?? [];
  // `cardWins` is keyed by turn id with an explicit null for "traced, nothing
  // won" — so the count of coaching moments is the non-null values, not the
  // number of keys.
  const coachingMoments = runDetail?.cardWins
    ? Object.values(runDetail.cardWins).filter((w) => w !== null).length
    : 0;
  const elapsed = run ? formatElapsed(run.startedAt, run.finishedAt) : null;
  const checkpointLabel = checkpoint ? CHECKPOINT_LABELS[checkpoint] ?? checkpoint : null;

  return (
    <div className="space-y-4">
      {/* ── One action, and the one choice it needs ──────────────────────────
          The checkpoint picker used to live in a *different* box above this
          one, while the Run button here stayed disabled until something was
          chosen in it — so the control that unblocked the button was nowhere
          near the button. They are one step now. */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`start-${persona.id}`} className="text-sm font-medium">
              Start the session from
            </Label>
            <Select value={checkpoint} onValueChange={onCheckpointChange} disabled={isBusy}>
              <SelectTrigger id={`start-${persona.id}`} className="h-10 w-[260px]">
                <SelectValue placeholder="Choose a starting point" />
              </SelectTrigger>
              <SelectContent>
                {checkpoints.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CHECKPOINT_LABELS[c] ?? c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            className="h-10 gap-2"
            disabled={!checkpoint || isBusy}
            onClick={() => runMutation.mutate()}
          >
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {isBusy ? "Running…" : "Run session"}
          </Button>

          {isRunning && (
            <Button
              variant="outline"
              className="h-10 gap-2"
              disabled={abortMutation.isPending}
              onClick={() => abortMutation.mutate()}
            >
              {abortMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              Stop
            </Button>
          )}
        </div>

        <p className="mt-2.5 text-sm text-muted-foreground">
          {checkpointLabel
            ? `Marks everything up to ${checkpointLabel} as already done, then has ${persona.name} talk to Wing from there. Usually takes a minute or two.`
            : "Pick where in the programme this test conversation should begin."}
        </p>
      </div>

      {/* ── While it runs ──────────────────────────────────────────────── */}
      {isRunning && (
        <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-warn/30 bg-warn/5 p-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-warn" />
          <span className="font-medium">{persona.name} is talking to Wing…</span>
          <span className="text-muted-foreground">
            {runDetail?.session && run
              ? `turn ${runDetail.session.turnCount} of ${run.turnCeiling}`
              : "starting up"}
            {elapsed ? ` · ${elapsed} elapsed` : ""}
          </span>
        </div>
      )}

      {/* ── What came of it, in the numbers she actually reads a run for ── */}
      {run && !isRunning && (
        <div className="rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              {status === "aborted" ? (
                <>
                  <Square className="h-4 w-4 text-destructive" />
                  Run stopped
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-brand" />
                  Session complete
                </>
              )}
              {runDetail?.session ? (
                <span className="font-normal text-muted-foreground">
                  · {sessionLabel(runDetail.session.sessionType)}
                </span>
              ) : null}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-muted-foreground"
              disabled={isRefetchingRunDetail}
              onClick={() => refetchRunDetail()}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefetchingRunDetail ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-10 gap-y-4">
            <Stat label="Turns" value={turns.length} />
            <Stat
              label="Coaching moments"
              value={coachingMoments}
              tone={turns.length > 0 && coachingMoments === 0 ? "warn" : "brand"}
              hint="Turns where a coaching card won and Wing acted on it."
            />
            <Stat label="Time" value={elapsed ?? "—"} />
          </div>

          {turns.length > 0 && coachingMoments === 0 && (
            <div className="mt-4 rounded-md border border-warn/30 bg-warn/5 p-3 text-sm">
              <span className="font-medium text-warn">Nothing fired in this conversation.</span>{" "}
              <span className="text-muted-foreground">
                That can be a real finding about the methodology — or a sign no card ever reached
                the detector. Session review shows which cards were considered on each turn.
              </span>
            </div>
          )}

          {status === "aborted" && run.abortReason ? (
            <p className="mt-3 text-sm text-muted-foreground">Stopped because: {run.abortReason}</p>
          ) : null}

          {run.completionReason === "crisis_hold_asserted" && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline" className="border-info/40 text-info">
                Ended early — safety hold asserted
              </Badge>
              <span className="text-muted-foreground">
                The persona's own turn tripped the crisis check mid-run. Counted as a completed
                run, not an abort — Wing keeps replying under a hold, it just stops reaching out
                afterwards.
              </span>
            </div>
          )}

          {runDetail?.adherence && runDetail.adherence.turnCount > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={runDetail.adherence.adherent ? "secondary" : "destructive"}>
                {runDetail.adherence.adherent
                  ? "Persona stayed in character"
                  : "Check persona — may have broken character"}
              </Badge>
              <span className="text-muted-foreground">
                {Math.round(runDetail.adherence.lengthAdherence * 100)}% of replies in the expected
                length band
                {runDetail.adherence.expectedMarkers.length > 0
                  ? ` · expected: ${runDetail.adherence.expectedMarkers.join(", ")}`
                  : ""}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Hedging discrepancies, collapsed ─────────────────────────────
          These used to print every flagged turn's full text inline, which on
          a seven-flag run buried the rest of the panel under quoted
          transcript. The count is the finding; the quotes are the evidence
          you open when you want them. */}
      {runDetail?.discrepancies && runDetail.discrepancies.length > 0 && (
        <Collapsible className="rounded-lg border border-warn/30 bg-warn/5">
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 p-3 text-left">
            <span className="flex items-center gap-2 text-sm font-medium text-warn">
              <ChevronDown className="h-4 w-4" />
              {runDetail.discrepancies.length} hedging discrepanc
              {runDetail.discrepancies.length === 1 ? "y" : "ies"}
            </span>
            <span className="text-xs text-muted-foreground">
              the persona hedged; check what fired
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 border-t border-warn/20 p-3">
            {runDetail.discrepancies.map((d) => (
              <div key={d.turnId} className="text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">
                    {d.type === "false_negative" ? "No hedging card fired" : "Unearned fire"}
                  </span>
                  <span className="text-muted-foreground">
                    · {d.hedgingSofteners} hedge{d.hedgingSofteners === 1 ? "" : "s"}
                  </span>
                  {d.winnerCardName ? (
                    <Badge variant="outline" className="text-xs font-normal">
                      won: {d.winnerCardName}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-muted-foreground">
                  “{d.turnContent}”
                </p>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* ── The conversation, open by default ───────────────────────────
          This is what a test run is *for*; it sat behind a "Show transcript"
          toggle at the end of a toolbar. */}
      {turns.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Conversation</h4>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setShowTranscript((v) => !v)}
            >
              {showTranscript ? "Collapse" : "Expand"}
            </Button>
          </div>
          {showTranscript && (
            <div className="max-h-[32rem] space-y-3 overflow-y-auto rounded-lg border bg-muted/20 p-4">
              {turns.map((t) => {
                const win = runDetail?.cardWins?.[t.id];
                const isWing = t.turnType.startsWith("ai_");
                return (
                  <ChatBubble
                    key={t.id}
                    speaker={isWing ? "Wing" : persona.name}
                    side={isWing ? "wing" : "person"}
                    footer={
                      win ? <FiredCardChip cardCode={win.cardCode} name={win.name} /> : undefined
                    }
                  >
                    {t.content}
                  </ChatBubble>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Everything else, demoted ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-sm">
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {showHistory ? "Hide past runs" : "Past runs"}
        </button>
        {run && (
          <>
            <button
              type="button"
              onClick={() => setShowDebrief(true)}
              className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Coaching debrief
            </button>
            <a
              href={`/api/test/runs/${run.id}/export?format=json`}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Export JSON
            </a>
            <a
              href={`/api/test/runs/${run.id}/export?format=csv`}
              className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Export CSV
            </a>
          </>
        )}
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {showDetails ? "Hide run settings" : "Run settings"}
        </button>
      </div>

      {showHistory && (
        <div className="rounded-lg border bg-muted/20 p-2">
          {isLoadingHistory ? (
            <div className="flex justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : !runHistory?.runs.length ? (
            <p className="px-1 py-1 text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <div className="space-y-1">
              {[...runHistory.runs].reverse().map((r) => (
                <button
                  key={r.runId}
                  type="button"
                  onClick={() => {
                    setRunId(r.runId);
                    setShowTranscript(true);
                    setShowHistory(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded px-2 py-2 text-left text-sm hover:bg-muted ${
                    runId === r.runId ? "bg-brand-soft/50" : ""
                  }`}
                >
                  <span>{CHECKPOINT_LABELS[r.checkpoint] ?? r.checkpoint}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.status} · {relativeTime(r.startedAt)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Run settings and telemetry, out of the way ──────────────────── */}
      {showDetails && (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Model tier</Label>
              <Select value={tier} onValueChange={setTier} disabled={isBusy}>
                <SelectTrigger className="h-9 w-[160px]">
                  <SelectValue placeholder="Model tier" />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_TIERS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Turn ceiling</Label>
              <Input
                type="number"
                className="h-9 w-24"
                placeholder={String(DEFAULT_TURN_CEILING)}
                value={turnCeilingInput}
                onChange={(e) => setTurnCeilingInput(e.target.value)}
                disabled={isBusy}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Token budget</Label>
              <Input
                type="number"
                className="h-9 w-28"
                placeholder={String(DEFAULT_TOKEN_BUDGET)}
                value={tokenBudgetInput}
                onChange={(e) => setTokenBudgetInput(e.target.value)}
                disabled={isBusy}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Max wall-clock (s)</Label>
              <Input
                type="number"
                className="h-9 w-28"
                placeholder={String(DEFAULT_MAX_WALL_CLOCK_SECONDS)}
                value={maxWallClockInput}
                onChange={(e) => setMaxWallClockInput(e.target.value)}
                disabled={isBusy}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Blank uses the server default. Applies to the next run, not the current one. Each run
            is provisioned fresh — nothing is reused.
          </p>
          {run && (
            <p className="text-xs text-muted-foreground">
              Run #{run.id} · {run.modelDeployment ?? tier} · {status} ·{" "}
              {run.tokensUsed.toLocaleString()}/{run.tokenBudget.toLocaleString()} tokens
            </p>
          )}
        </div>
      )}

      {run ? (
        <PersonaDebriefDialog runId={run.id} open={showDebrief} onOpenChange={setShowDebrief} />
      ) : null}
    </div>
  );
}

type CoachingDebrief = {
  runId: number;
  checkpoint: string;
  turnCount: number;
  expectedMarkers: string[];
  measuredPatterns: {
    category: string;
    firstTurnIndex: number;
    secondTurnIndex: number | null;
    turnsPresent: number;
    thresholdMet: boolean;
  }[];
  cardsFired: {
    turnIndex: number;
    cardCode: string;
    cardName: string;
    confidence: number | null;
    rationale: string | null;
  }[];
  withheld: { turnIndex: number; cardCode: string; cardName: string; reason: string }[];
  discrepancies: { turnId: number; winnerCardCode: string | null; type: string }[];
  adherence: { adherent: boolean; lengthAdherence: number; brokeCharacter: boolean } | null;
  allModules: { runId: number; checkpoint: string; status: string }[];
  comparedToPriorModule: {
    priorRunId: number;
    priorCheckpoint: string;
    recurring: string[];
    noLongerPresent: string[];
    newThisModule: string[];
  } | null;
  limits: string[];
};

/**
 * Danielle's output-requirements doc, #5: the per-persona, per-module
 * coaching debrief. Pure read of `GET /api/test/runs/:runId/debrief` — all
 * the synthesis happens server-side in `wing/coaching-debrief.ts`; this is
 * just a readable rendering of it.
 */
function PersonaDebriefDialog({
  runId,
  open,
  onOpenChange,
}: {
  runId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading } = useQuery<CoachingDebrief>({
    queryKey: ["/api/test/runs", runId, "debrief"],
    queryFn: async () => (await apiRequest("GET", `/api/test/runs/${runId}/debrief`)).json(),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Coaching debrief — run #{runId}</DialogTitle>
          <DialogDescription>
            Assembled from this run's own export — see "limits" at the bottom for what this
            cannot honestly answer. Not a verdict on whether coaching worked; that call is yours.
          </DialogDescription>
        </DialogHeader>
        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4 text-sm">
            {data.expectedMarkers.length ? (
              <div>
                <p className="font-medium">Persona's declared markers</p>
                <ul className="ml-4 list-disc text-xs text-muted-foreground">
                  {data.expectedMarkers.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div>
              <p className="font-medium">Measured patterns (first / second instance)</p>
              {data.measuredPatterns.length ? (
                <ul className="ml-4 list-disc text-sm">
                  {data.measuredPatterns.map((p) => (
                    <li key={p.category}>
                      {p.category}: turn {p.firstTurnIndex}
                      {p.secondTurnIndex !== null ? `, turn ${p.secondTurnIndex}` : ""} (
                      {p.turnsPresent} turn{p.turnsPresent === 1 ? "" : "s"}
                      {p.thresholdMet ? ", threshold met" : ""})
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No deterministic marker appeared twice or more.</p>
              )}
            </div>
            <div>
              <p className="font-medium">Cards fired</p>
              {data.cardsFired.length ? (
                <ul className="ml-4 list-disc text-sm">
                  {data.cardsFired.map((c, i) => (
                    <li key={i}>
                      turn {c.turnIndex}: {c.cardCode} — {c.cardName}
                      {c.rationale ? ` ("${c.rationale}")` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No card fired this run.</p>
              )}
            </div>
            {data.withheld.length ? (
              <div>
                <p className="font-medium">Withheld (H-003 intensity sequencing only)</p>
                <ul className="ml-4 list-disc text-sm">
                  {data.withheld.map((w, i) => (
                    <li key={i}>
                      turn {w.turnIndex}: {w.cardCode} — {w.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {data.discrepancies.length ? (
              <div>
                <p className="font-medium">Discrepancies</p>
                <ul className="ml-4 list-disc text-sm">
                  {data.discrepancies.map((d, i) => (
                    <li key={i}>
                      {d.type} — turn {d.turnId}
                      {d.winnerCardCode ? ` (${d.winnerCardCode})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {data.comparedToPriorModule ? (
              <div>
                <p className="font-medium">
                  Compared to prior module (run #{data.comparedToPriorModule.priorRunId},{" "}
                  {data.comparedToPriorModule.priorCheckpoint})
                </p>
                <ul className="ml-4 list-disc text-sm">
                  <li>Recurring: {data.comparedToPriorModule.recurring.join(", ") || "none"}</li>
                  <li>No longer present: {data.comparedToPriorModule.noLongerPresent.join(", ") || "none"}</li>
                  <li>New this module: {data.comparedToPriorModule.newThisModule.join(", ") || "none"}</li>
                </ul>
              </div>
            ) : null}
            <div>
              <p className="font-medium text-muted-foreground">Limits</p>
              <ul className="ml-4 list-disc text-xs text-muted-foreground">
                {data.limits.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type RevealGateVerdict = {
  passed: boolean;
  conditions: { name: string; met: boolean; detail: string }[];
  failed: string[];
};

type RevealCycleEntry = {
  id: number;
  evaluated_at: string;
  day_in_cycle: number;
  action: "fire" | "defer" | "route";
  kind: string | null;
  why: string;
  gate1: RevealGateVerdict;
  gate2: RevealGateVerdict;
  template_code: string | null;
  template_band: number | null;
  next_check_day: number | null;
  routed_to: string | null;
};

function RevealGateDetail({ label, verdict }: { label: string; verdict: RevealGateVerdict }) {
  return (
    <div className="text-xs">
      <span className={verdict.passed ? "text-emerald-600" : "text-destructive"}>
        {label}: {verdict.passed ? "passed" : "failed"}
      </span>
      <ul className="ml-3 mt-0.5 list-disc space-y-0.5">
        {verdict.conditions.map((c) => (
          <li key={c.name} className={c.met ? "text-muted-foreground" : "text-destructive"}>
            {c.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Danielle's output-requirements doc, #11: what did Reveal Cycle produce for
 * this persona, and does it pass the substitution/Barnum test she's worried
 * about. `reveal-gates.ts`'s three gates already encode that test; this is
 * the surface that makes their verdicts visible per persona, plus an
 * on-demand trigger so a tester doesn't have to wait on real calendar days
 * for the cadence gate to open — see `claude/HARNESS_BUILD_STEP30_SEP15.md`.
 */
function PersonaRevealCycle({ persona }: { persona: HarnessPersona }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const {
    data,
    refetch: refetchHistory,
    isFetching: isRefetchingHistory,
  } = useQuery<{ studentId: number; history: RevealCycleEntry[] }>({
    queryKey: ["/api/test/personas", persona.id, "reveal-cycle"],
    queryFn: async () => (await apiRequest("GET", `/api/test/personas/${persona.id}/reveal-cycle`)).json(),
    enabled: open,
  });

  const evaluateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch<{
        error?: string;
        detail?: string;
        outcome?: { action: string; why: string };
      }>("POST", `/api/test/personas/${persona.id}/reveal-cycle/evaluate`, {});
      if (!res.ok) throw new Error(res.data?.detail ?? res.data?.error ?? "Could not evaluate the cycle");
      return res.data?.outcome;
    },
    onSuccess: (outcome) => {
      toast({
        title: "Reveal Cycle evaluated",
        description: outcome ? `${outcome.action} — ${outcome.why}` : "Evaluated.",
      });
      refetchHistory();
    },
    onError: (error: Error) => {
      toast({ title: "Could not evaluate", description: error.message, variant: "destructive" });
    },
  });

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
        Reveal Cycle
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reveal Cycle — {persona.name}</DialogTitle>
            <DialogDescription>
              Gate verdicts and outcomes recorded for this persona's own account. "Evaluate now" runs the
              same real check the hourly job eventually would — safe on a test account, and the only way
              to see this without waiting on real calendar days.
            </DialogDescription>
          </DialogHeader>
          <Button
            size="sm"
            onClick={() => evaluateMutation.mutate()}
            disabled={evaluateMutation.isPending}
            className="w-fit"
          >
            {evaluateMutation.isPending || isRefetchingHistory ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Evaluate now
          </Button>
          <div className="space-y-3">
            {!data?.history?.length ? (
              <p className="text-sm text-muted-foreground">
                No recorded outcome yet. "Wait" outcomes (the common case — the eligibility floor not
                met, or the cadence gate not yet open) are never logged; evaluate now to see the current
                gate verdicts even when nothing fires.
              </p>
            ) : (
              data.history.map((entry) => (
                <div key={entry.id} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={entry.action === "fire" ? "default" : "outline"}>
                      {entry.action}
                      {entry.kind ? ` (${entry.kind})` : ""}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      day {entry.day_in_cycle} · {new Date(entry.evaluated_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs">{entry.why}</p>
                  {entry.action === "fire" ? (
                    <p className="text-xs">
                      Template:{" "}
                      {entry.template_code ?? "none — protected null Reveal (IG-INT06)"}
                      {entry.template_band != null ? ` (band ${entry.template_band})` : ""}
                    </p>
                  ) : null}
                  {entry.action === "route" ? <p className="text-xs">Routed to {entry.routed_to}</p> : null}
                  {entry.action === "defer" ? (
                    <p className="text-xs">Next check: day {entry.next_check_day}</p>
                  ) : null}
                  <RevealGateDetail label="Gate 1 — eligibility" verdict={entry.gate1} />
                  <RevealGateDetail label="Gate 2 — evidence" verdict={entry.gate2} />
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PersonasPanel() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HarnessPersona | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HarnessPersona | null>(null);
  const [cycleChoice, setCycleChoice] = useState<Record<number, string>>({});
  const [checkpointChoice, setCheckpointChoice] = useState<Record<number, string>>({});
  const [activationErrors, setActivationErrors] = useState<
    Record<number, { error: string; failures?: { field: string; problem: string }[] }>
  >({});

  const { data: vocab } = useQuery<Vocabulary>({
    queryKey: ["/api/admin/harness/personas/vocabulary"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/harness/personas/vocabulary")).json(),
  });

  const { data: personas, isLoading } = useQuery<{ personas: HarnessPersona[] }>({
    queryKey: ["/api/admin/harness/personas"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/harness/personas")).json(),
  });

  const { data: cyclesData } = useQuery<{ cycles: Cycle[] }>({
    queryKey: ["/api/admin/harness/personas/cycles"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/harness/personas/cycles")).json(),
  });

  const { data: checkpointVocab } = useQuery<{ checkpoints: string[] }>({
    queryKey: ["/api/admin/harness/checkpoints/vocabulary"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/harness/checkpoints/vocabulary")).json(),
  });

  const cycles = cyclesData?.cycles ?? [];
  const checkpoints = checkpointVocab?.checkpoints ?? [];

  const deleteMutation = useMutation({
    mutationFn: async (target: HarnessPersona) => {
      const res = await apiFetch("DELETE", `/api/admin/harness/personas/${target.id}`);
      if (!res.ok) throw new Error((res.data as any)?.error ?? "Could not delete");
      return target;
    },
    onSuccess: (target) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/harness/personas"] });
      toast(
        target.status === "seeded"
          ? {
              title: "Persona and test account purged",
              description: `Student #${target.seededStudentId} and everything it generated are gone.`,
            }
          : { title: "Draft deleted" },
      );
      setDeleteTarget(null);
    },
    onError: (error: Error) => {
      toast({ title: "Could not delete", description: error.message, variant: "destructive" });
      setDeleteTarget(null);
    },
  });

  const activateMutation = useMutation({
    mutationFn: async ({ id, cycleId }: { id: number; cycleId: number }) => {
      const res = await apiFetch<{
        error?: string;
        failures?: { field: string; problem: string }[];
        studentId?: number;
      }>("POST", `/api/admin/harness/personas/${id}/activate`, { cycleId });
      return { id, res };
    },
    onSuccess: ({ id, res }) => {
      if (!res.ok) {
        setActivationErrors((prev) => ({
          ...prev,
          [id]: { error: res.data?.error ?? "activation_failed", failures: res.data?.failures },
        }));
        return;
      }
      setActivationErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/harness/personas"] });
      toast({
        title: "Persona activated",
        description: "Test account created. You can run a session for this persona now.",
      });
    },
  });

  const checkpointMutation = useMutation({
    mutationFn: async ({ studentId, checkpoint }: { studentId: number; checkpoint: string }) => {
      const res = await apiFetch<{ error?: string; sessionIds?: number[] }>(
        "POST",
        `/api/admin/harness/checkpoints/${studentId}`,
        { checkpoint },
      );
      if (!res.ok) throw new Error(res.data?.error ?? "Could not apply checkpoint");
      return res.data;
    },
    onSuccess: (data) => {
      toast({
        title: "Checkpoint applied",
        description: `${data?.sessionIds?.length ?? 0} session(s) marked complete with synthetic artifacts. No model calls were made.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Could not apply checkpoint", description: error.message, variant: "destructive" });
    },
  });

  const list = (personas?.personas ?? []).slice();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Test personas</h2>
          <p className="text-sm text-muted-foreground">
            Draft a persona, activate it into a real test account, then run it to see what fires.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          New persona
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}

      {!isLoading && list.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No personas yet. Start with the key and name — everything else, including which
            profile sections you fill in, can come later.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {list.map((p) => {
          const ready = isReady(p);
          const err = activationErrors[p.id];
          const seeded = p.status === "seeded";
          const preview = previewText(p);
          const filled = filledCount(p);

          return (
            <Card key={p.id} className={seeded ? "border-brand/30" : undefined}>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
                    {p.name}
                    {seeded ? (
                      <Badge className="bg-brand-soft text-brand">Active test account</Badge>
                    ) : ready ? (
                      <Badge variant="outline" className="border-info/40 text-info">
                        Ready to activate
                      </Badge>
                    ) : (
                      <Badge variant="outline">Draft</Badge>
                    )}
                    {/* Aditya, 15 Sep 2026: at-a-glance run progress, visible
                        without scrolling to this persona's run controls
                        below — the collapsed card previously said nothing
                        about whether a run was even in flight. */}
                    {p.latestRun?.status === "running" ? (
                      <Badge className="gap-1 bg-warn-soft text-warn">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Session running
                      </Badge>
                    ) : p.latestRun?.status === "provisioned" ? (
                      <Badge variant="outline" className="border-warn/40 text-warn">
                        Starting…
                      </Badge>
                    ) : p.latestRun?.status === "aborted" ? (
                      <Badge variant="outline" className="border-destructive/40 text-destructive">
                        Last run stopped
                      </Badge>
                    ) : p.latestRun?.status === "completed" ? (
                      <Badge variant="outline" className="text-muted-foreground">
                        Last run complete
                      </Badge>
                    ) : null}
                  </CardTitle>
                  <CardDescription className="mt-1 flex flex-wrap gap-1.5">
                    {p.professionalStatus ? (
                      <Badge variant="secondary">{p.professionalStatus}</Badge>
                    ) : (
                      <Badge variant="outline" className="border-warn/40 text-warn">
                        professional status not set
                      </Badge>
                    )}
                    {p.pathway ? (
                      <Badge variant="secondary">{p.pathway}</Badge>
                    ) : (
                      <Badge variant="outline" className="border-warn/40 text-warn">
                        pathway not set
                      </Badge>
                    )}
                    <Badge variant="outline" className="gap-1">
                      <FileText className="h-3 w-3" />
                      {filled}/{CONTENT_FIELDS.length} sections
                    </Badge>
                    {p.expectedMarkers.map((m) => (
                      <Badge key={m} variant="outline">
                        {m}
                      </Badge>
                    ))}
                  </CardDescription>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing(p);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(p)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {preview ? (
                  <p className="line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {preview}
                  </p>
                ) : (
                  <p className="text-sm italic text-muted-foreground">No profile sections written yet.</p>
                )}
                {err && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Can't activate yet</AlertTitle>
                    <AlertDescription>
                      {err.failures?.length ? (
                        <ul className="list-disc pl-4">
                          {err.failures.map((f, i) => (
                            <li key={i}>
                              <span className="font-medium">{f.field}</span>: {f.problem}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        err.error
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                {seeded ? (
                  <div className="space-y-4 border-t pt-4">
                    <PersonaRunControls
                      persona={p}
                      checkpoint={checkpointChoice[p.id] ?? ""}
                      onCheckpointChange={(v) =>
                        setCheckpointChoice((prev) => ({ ...prev, [p.id]: v }))
                      }
                      checkpoints={checkpoints}
                    />

                    {/* Everything that is not "run a session" lives behind one
                        disclosure. Both of these were full-width boxes competing
                        with the run panel for attention, and neither is part of
                        the loop Danielle is actually here for. */}
                    <Collapsible className="rounded-lg border">
                      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium hover:bg-muted/40">
                        <span className="flex items-center gap-1.5">
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          More tools
                        </span>
                        <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                          <Lock className="h-3 w-3" />
                          Status, pathway and key are locked
                        </span>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-4 border-t px-3 py-3">
                        <div>
                          <h4 className="text-sm font-semibold">Fast-forward without running</h4>
                          <p className="mb-2 mt-0.5 text-sm text-muted-foreground">
                            Marks Foundation sessions complete with synthetic artifacts — seconds,
                            no model calls. Uses the starting point chosen above. Adds what's
                            missing; doesn't undo a checkpoint already applied.
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              !checkpointChoice[p.id] ||
                              !p.seededStudentId ||
                              checkpointMutation.isPending
                            }
                            onClick={() =>
                              p.seededStudentId &&
                              checkpointMutation.mutate({
                                studentId: p.seededStudentId,
                                checkpoint: checkpointChoice[p.id],
                              })
                            }
                          >
                            {checkpointMutation.isPending ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <FastForward className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            Apply {CHECKPOINT_LABELS[checkpointChoice[p.id]] ?? "checkpoint"}
                          </Button>
                        </div>

                        <div className="border-t pt-4">
                          <h4 className="mb-2 text-sm font-semibold">Reveal Cycle</h4>
                          <PersonaRevealCycle persona={p} />
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                    <Select
                      value={cycleChoice[p.id] ?? ""}
                      onValueChange={(v) => setCycleChoice((prev) => ({ ...prev, [p.id]: v }))}
                    >
                      <SelectTrigger className="w-[280px]">
                        <SelectValue placeholder="Choose a cycle to activate into" />
                      </SelectTrigger>
                      <SelectContent>
                        {cycles.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)} disabled={!c.publishable}>
                            {c.label ?? `Cycle ${c.id}`} · {c.cycleYear}
                            {!c.publishable ? " — publishes nothing" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      disabled={!ready || !cycleChoice[p.id] || activateMutation.isPending}
                      onClick={() =>
                        activateMutation.mutate({ id: p.id, cycleId: Number(cycleChoice[p.id]) })
                      }
                    >
                      {activateMutation.isPending ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Rocket className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Activate
                    </Button>
                    {!ready && (
                      <span className="text-xs text-muted-foreground">
                        Fill in professional status, pathway and at least one profile section
                        first.
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <PersonaFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        persona={editing}
        vocabulary={vocab ?? { professionalStatuses: [], pathways: [], modelTiers: [] }}
      />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.status === "seeded" ? `Delete ${deleteTarget.name} and its test account?` : `Delete ${deleteTarget?.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.status === "seeded" ? (
                <>
                  This permanently deletes the test account this persona seeded — student #
                  {deleteTarget.seededStudentId} — and every session, transcript, score and log it
                  generated, then this persona itself. There's no undo; re-testing this persona
                  means writing it again from scratch.
                </>
              ) : (
                "This permanently deletes this draft. Nothing has been created yet, so there's nothing else to clean up."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
            >
              {deleteMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {deleteTarget?.status === "seeded" ? "Delete everything" : "Delete draft"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function emptyContent(): Record<ContentKey, string> {
  return Object.fromEntries(CONTENT_FIELDS.map((f) => [f.key, ""])) as Record<ContentKey, string>;
}

function contentFrom(persona: HarnessPersona | null): Record<ContentKey, string> {
  if (!persona) return emptyContent();
  return Object.fromEntries(CONTENT_FIELDS.map((f) => [f.key, persona[f.key]])) as Record<
    ContentKey,
    string
  >;
}

function PersonaFormDialog({
  open,
  onOpenChange,
  persona,
  vocabulary,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  persona: HarnessPersona | null;
  vocabulary: Vocabulary;
}) {
  const { toast } = useToast();
  const isEdit = Boolean(persona);
  const locked = persona?.status === "seeded";

  const [personaKey, setPersonaKey] = useState(persona?.personaKey ?? "");
  const [name, setName] = useState(persona?.name ?? "");
  const [professionalStatus, setProfessionalStatus] = useState(persona?.professionalStatus ?? NONE);
  const [pathway, setPathway] = useState(persona?.pathway ?? NONE);
  const [defaultModelTier, setDefaultModelTier] = useState(persona?.defaultModelTier ?? NONE);
  const [expectedMarkers, setExpectedMarkers] = useState((persona?.expectedMarkers ?? []).join("\n"));
  const [content, setContent] = useState<Record<ContentKey, string>>(contentFrom(persona));

  // Re-seed local state whenever a different persona (or "new") opens — the
  // dialog is mounted once, not per-persona, so it has to resync itself.
  const resetKey = persona?.id ?? "new";
  const [lastKey, setLastKey] = useState(resetKey);
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setPersonaKey(persona?.personaKey ?? "");
    setName(persona?.name ?? "");
    setProfessionalStatus(persona?.professionalStatus ?? NONE);
    setPathway(persona?.pathway ?? NONE);
    setDefaultModelTier(persona?.defaultModelTier ?? NONE);
    setExpectedMarkers((persona?.expectedMarkers ?? []).join("\n"));
    setContent(contentFrom(persona));
  }

  const filled = CONTENT_FIELDS.filter((f) => content[f.key].trim().length > 0).length;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        personaKey: personaKey.trim(),
        name: name.trim(),
        professionalStatus: professionalStatus === NONE ? null : professionalStatus,
        pathway: pathway === NONE ? null : pathway,
        defaultModelTier: defaultModelTier === NONE ? null : defaultModelTier,
        expectedMarkers: listField(expectedMarkers),
        ...content,
      };
      const res = isEdit
        ? await apiFetch("PUT", `/api/admin/harness/personas/${persona!.id}`, payload)
        : await apiFetch("POST", "/api/admin/harness/personas", payload);
      if (!res.ok) throw new Error((res.data as any)?.error ?? "Could not save");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/harness/personas"] });
      toast({ title: isEdit ? "Persona updated" : "Persona created" });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{isEdit ? `Edit ${persona!.name}` : "New persona"}</DialogTitle>
          <DialogDescription>
            Only the key and name are required to save a draft — fill in whichever profile
            sections you have; the rest can come later.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="setup" className="flex min-h-0 flex-1 flex-col">
          <div className="border-b px-6 pt-3">
            <TabsList>
              <TabsTrigger value="setup">Identity &amp; setup</TabsTrigger>
              <TabsTrigger value="profile" className="gap-1.5">
                Persona profile
                <Badge variant="outline" className="ml-1 h-5 px-1.5 text-xs font-normal">
                  {filled}/{CONTENT_FIELDS.length}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <TabsContent value="setup" className="mt-0 space-y-5 px-6 py-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Persona key</Label>
                  <Input
                    value={personaKey}
                    onChange={(e) => setPersonaKey(e.target.value)}
                    disabled={isEdit}
                    placeholder="tyler-reed"
                  />
                  <p className="text-xs text-muted-foreground">
                    Lower-case, digits and hyphens. Fixed once saved — it's the account's email
                    key.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tyler Reed" />
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    Professional status
                    {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                  </Label>
                  <Select value={professionalStatus} onValueChange={setProfessionalStatus} disabled={locked}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Not set yet</SelectItem>
                      {vocabulary.professionalStatuses.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    Pathway
                    {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                  </Label>
                  <Select value={pathway} onValueChange={setPathway} disabled={locked}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Not set yet</SelectItem>
                      {vocabulary.pathways.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                These two resolve the audience tags the detector filters cards on. A draft can be
                saved without them; <strong>Activate</strong> is what refuses.
              </p>

              <Separator />

              <div className="space-y-1.5">
                <Label>Default model tier</Label>
                <Select value={defaultModelTier} onValueChange={setDefaultModelTier}>
                  <SelectTrigger className="w-[240px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Platform default (nano)</SelectItem>
                    {(vocabulary.modelTiers.length ? vocabulary.modelTiers : MODEL_TIERS.map((t) => t.value)).map(
                      (v) => (
                        <SelectItem key={v} value={v}>
                          {MODEL_TIERS.find((t) => t.value === v)?.label ?? v}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Which Azure OpenAI deployment plays this persona's side of the conversation when
                  nobody overrides it. Never locked — even a seeded persona's default can change
                  any time; the Run button's own picker can still override it for a one-off retry.
                </p>
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label>Expected markers</Label>
                <Textarea
                  value={expectedMarkers}
                  onChange={(e) => setExpectedMarkers(e.target.value)}
                  rows={3}
                  placeholder={"one per line, e.g.\nhigh hedge frequency\nminimizing language"}
                />
                <p className="text-xs text-muted-foreground">
                  Danielle's deterministic vocabulary — what a future counter could measure.
                  Qualitative outcomes belong in "What This Tests" on the Persona Profile tab;
                  those are read by a person, not counted.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="profile" className="mt-0 px-6 py-5">
              <Accordion
                type="multiple"
                defaultValue={CONTENT_FIELDS.map((f) => f.key)}
                className="space-y-2"
              >
                {CONTENT_FIELDS.map((f) => {
                  const value = content[f.key];
                  return (
                    <AccordionItem key={f.key} value={f.key} className="rounded-md border px-3">
                      <AccordionTrigger className="py-3 text-sm hover:no-underline">
                        <span className="flex items-center gap-2">
                          {f.heading}
                          {value.trim() ? (
                            <Badge variant="outline" className="border-brand/30 text-xs text-brand">
                              filled
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              empty
                            </Badge>
                          )}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-2 pb-4">
                        <p className="text-xs text-muted-foreground">{f.caption}</p>
                        <Textarea
                          value={value}
                          onChange={(e) =>
                            setContent((prev) => ({ ...prev, [f.key]: e.target.value }))
                          }
                          rows={4}
                          placeholder={`Kept exactly as written and injected verbatim — nothing here reflows or summarizes it.`}
                          className="text-sm"
                        />
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!personaKey.trim() || !name.trim() || saveMutation.isPending}
          >
            {saveMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {isEdit ? "Save changes" : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
