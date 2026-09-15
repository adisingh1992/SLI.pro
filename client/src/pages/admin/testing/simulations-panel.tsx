import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2, FlaskConical, Download, AlertTriangle,
  CircleSlash, PauseCircle, ShieldAlert, Filter, ChevronDown, MessageSquare,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  sessionLabel, relativeTime, InfoTip, Stat, ChatBubble, FiredCardChip,
} from "./harness-ui";

/**
 * Persona simulations — the selection trace.
 *
 * ── WHY THIS SCREEN ─────────────────────────────────────────────────────
 * Danielle, on the harness: "the selection trace is what makes this a
 * methodology review tool and not just QA. Seeing which cards were considered,
 * which won, and which were rejected with reasons — that's the visibility I
 * need… without it I'm just reading transcripts and guessing."
 *
 * ── ONE CONVERSATION, NOT A STACK OF TURN CARDS ──────────────────────────
 * Aditya, 15 Sep 2026: "information is just floating around on the page all
 * around. No structure whatsoever." This screen's first shape gave every turn
 * its own bordered `Card` with its own header, outcome box and expander — so a
 * fourteen-turn session rendered as fourteen heavy boxes and the thing it was
 * showing (a conversation) was the one thing you could not see. The trace is
 * now a single continuous transcript: each turn is a chat bubble, its outcome
 * is a chip under that bubble, and the per-turn selection detail is an
 * expander on the same row rather than a panel of its own.
 *
 * ── THE THREE THINGS THE SCREEN MUST STILL SAY ───────────────────────────
 * 1. Never eligible is not a finding — four of five audience variants of a
 *    card leave before the detector by design. Kept apart from "never won".
 * 2. No card firing does not mean no signal — the detector doesn't record
 *    *why* it stayed silent, so the screen never implies a verdict there.
 * 3. There are no per-card scores — one model call returns one winner, not a
 *    ranked list, so only the winner carries a confidence number.
 * All three are still on the screen, one click into a turn's "Why?" or behind
 * an InfoTip, rather than as always-on paragraphs.
 */

type DropStage = "card_kind" | "session_scope" | "population_tag" | "no_signal_component";

type CandidateState =
  | { state: "dropped"; stage: DropStage; reason: string }
  | { state: "considered" }
  | { state: "won"; confidence: number | null; rationale: string | null }
  | { state: "withheld"; reason: string };

type TracedCard = {
  heuristicId: number;
  cardCode: string;
  name: string;
  cardKind: string;
  weight: number;
  position: number;
  appliesToSession: string | null;
  populationTags: string[];
  hasSignalComponent: boolean;
  outcome: CandidateState;
};

type TurnTrace = {
  turnId: number | null;
  sequenceId: number;
  sessionType: string | null;
  studentTags: string[];
  cards: TracedCard[];
  counts: {
    inSequence: number;
    considered: number;
    dropped: Record<DropStage, number>;
  };
  winner: { heuristicId: number; cardCode: string; confidence: number | null } | null;
  noFire: "reason_not_recorded" | null;
  unavailable: string[];
};

type TurnRow = {
  turnId: number;
  sequencePosition: number;
  turnType: string;
  content: string;
  analysisEligible: boolean;
  analysisExclusionReason: string | null;
  trace: TurnTrace;
  gateFindings: { cardCode: string; mode: string; matched: string; excerpt: string }[];
};

type SessionTrace = {
  sessionId: number;
  studentId: number;
  sessionType: string;
  sequenceId: number | null;
  sequenceSource: "application_log" | "current_pointer" | "unresolved";
  populationTags: string[];
  populationTagsAsOf: "now";
  turns: TurnRow[];
  note?: string;
};

type SessionRow = {
  sessionId: number;
  studentId: number;
  sessionType: string;
  status: string;
  isTestUser: boolean;
  startedAt: string | null;
  createdAt: string;
  completedAt: string | null;
  turns: number;
  cardsFired: number;
};

/** Plain-language names for the stage a card left the funnel at. "Detector" is
 *  engine vocabulary; these say what happened to the card instead. */
const STAGE_LABEL: Record<DropStage, string> = {
  card_kind: "not a coaching card",
  session_scope: "belongs to a different session",
  population_tag: "written for a different audience",
  no_signal_component: "no trigger defined for it",
};

export function SimulationsPanel() {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="space-y-6">
      <SessionPicker selected={selected} onSelect={setSelected} />

      {selected !== null && <TraceView sessionId={selected} />}
    </div>
  );
}

/* ── Choosing a session ──────────────────────────────────────────────────── */

function SessionPicker({
  selected,
  onSelect,
}: {
  selected: number | null;
  onSelect: (id: number) => void;
}) {
  const [studentId, setStudentId] = useState("");
  const [sessionType, setSessionType] = useState("all");
  const [testOnly, setTestOnly] = useState(false);

  const query = new URLSearchParams({ limit: "25" });
  if (/^\d+$/.test(studentId.trim())) query.set("studentId", studentId.trim());
  if (sessionType !== "all") query.set("sessionType", sessionType);
  if (testOnly) query.set("testOnly", "1");

  const { data: types } = useQuery<{ sessionTypes: { sessionType: string; n: number }[] }>({
    queryKey: ["/api/admin/harness/session-types"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/harness/session-types")).json(),
  });

  const { data, isLoading } = useQuery<{ sessions: SessionRow[]; total: number }>({
    queryKey: ["/api/admin/harness/sessions", query.toString()],
    queryFn: async () =>
      (await apiRequest("GET", `/api/admin/harness/sessions?${query.toString()}`)).json(),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FlaskConical className="h-5 w-5 text-brand" />
          Pick a session to review
        </CardTitle>
        <CardDescription className="text-sm">
          Newest first. Test accounts are shown, not hidden — a persona run is a test account by
          definition.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm">Session</Label>
            <Select value={sessionType} onValueChange={setSessionType}>
              <SelectTrigger className="h-9 w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sessions</SelectItem>
                {(types?.sessionTypes ?? []).map((t) => (
                  <SelectItem key={t.sessionType} value={t.sessionType}>
                    {sessionLabel(t.sessionType)} ({t.n})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            variant={testOnly ? "default" : "outline"}
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => setTestOnly((v) => !v)}
          >
            <Filter className="h-3.5 w-3.5" />
            Test accounts only
          </Button>

          <div className="ml-auto space-y-1.5">
            <Label htmlFor="harness-student" className="text-sm text-muted-foreground">
              Student #
            </Label>
            <Input
              id="harness-student"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder="any"
              inputMode="numeric"
              className="h-9 w-24"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !data?.sessions.length ? (
          <Alert>
            <CircleSlash className="h-4 w-4" />
            <AlertTitle>No sessions match</AlertTitle>
            <AlertDescription>
              Widen the filters, or run a persona from the Personas tab and come back — it will be
              the top row.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="py-2.5 pl-3 pr-3">Session</th>
                  <th className="py-2.5 pr-3">Student</th>
                  <th className="py-2.5 pr-3 text-right">Turns</th>
                  <th className="py-2.5 pr-3 text-right">Cards fired</th>
                  <th className="py-2.5 pr-3">Status</th>
                  <th className="py-2.5 pr-3">Started</th>
                </tr>
              </thead>
              <tbody>
                {data.sessions.map((s) => (
                  <tr
                    key={s.sessionId}
                    onClick={() => onSelect(s.sessionId)}
                    className={`cursor-pointer border-b last:border-0 hover:bg-muted/40 ${
                      selected === s.sessionId ? "bg-brand-soft/60" : ""
                    }`}
                  >
                    <td className="py-3 pl-3 pr-3">
                      <div className="font-medium">{sessionLabel(s.sessionType)}</div>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-sm">{s.studentId}</span>
                        {s.isTestUser && (
                          <Badge variant="secondary" className="px-1.5 text-xs">test</Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums">{s.turns}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">
                      {/* turns > 0 with nothing fired is the interesting case, not a broken row. */}
                      <span className={s.turns > 0 && s.cardsFired === 0 ? "font-medium text-warn" : ""}>
                        {s.cardsFired}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-sm text-muted-foreground">{s.status}</td>
                    <td className="py-3 pr-3 text-sm text-muted-foreground">
                      {relativeTime(s.startedAt ?? s.createdAt)}
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

/* ── The trace ───────────────────────────────────────────────────────────── */

function TraceView({ sessionId }: { sessionId: number }) {
  const { data, isLoading, error } = useQuery<SessionTrace>({
    queryKey: ["/api/admin/harness/sessions", sessionId, "trace"],
    queryFn: async () =>
      (await apiRequest("GET", `/api/admin/harness/sessions/${sessionId}/trace`)).json(),
  });

  const download = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `selection-trace-session-${sessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fired = useMemo(
    () => (data?.turns ?? []).filter((t) => t.trace.cards.some((c) => c.outcome.state === "won")).length,
    [data],
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Could not load the trace</AlertTitle>
        <AlertDescription>{(error as Error)?.message ?? "Unknown error"}</AlertDescription>
      </Alert>
    );
  }

  const cardsInPlay = data.turns[0]?.trace.counts.inSequence ?? 0;

  return (
    <div className="space-y-6">
      {/* ── What happened here, in three numbers ─────────────────────────── */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">{sessionLabel(data.sessionType)}</CardTitle>
              <CardDescription className="text-sm">
                Student {data.studentId}
                {data.sequenceId ? ` · methodology sequence ${data.sequenceId}` : ""}
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={download}>
              <Download className="h-3.5 w-3.5" />
              Download JSON
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            <Stat label="Turns" value={data.turns.length} />
            <Stat
              label="Cards fired"
              value={fired}
              tone={data.turns.length > 0 && fired === 0 ? "warn" : "brand"}
              hint="Turns where a coaching card won and Wing acted on it."
            />
            <Stat
              label="Cards in play"
              value={cardsInPlay}
              hint="Every card in the methodology sequence this session ran under, before any filtering."
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm text-muted-foreground">Audience:</span>
            {data.populationTags.length ? (
              data.populationTags.map((t) => (
                <Badge key={t} variant="outline" className="font-mono text-xs">{t}</Badge>
              ))
            ) : (
              <Badge variant="outline" className="text-xs">none resolved</Badge>
            )}
            {data.sequenceSource === "current_pointer" && (
              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                <InfoTip text="No card fired in this session, so there's no record of which sequence it actually ran under. This uses the cycle's current sequence, which may have moved on since." />
                using today's methodology, not confirmed for this session
              </span>
            )}
          </div>

          {data.turns.length > 0 && fired === 0 && (
            <div className="rounded-md border border-warn/30 bg-warn/5 p-3 text-sm">
              <span className="font-medium text-warn">No card fired anywhere in this session.</span>{" "}
              <span className="text-muted-foreground">
                Open any turn's “Why?” below to see how far the candidates got — whether they were
                filtered out before the detector, or reached it and none won.
              </span>
            </div>
          )}

          {data.note && (
            <Alert>
              <CircleSlash className="h-4 w-4" />
              <AlertTitle>Nothing to trace</AlertTitle>
              <AlertDescription>{data.note}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* ── The conversation itself ──────────────────────────────────────── */}
      {data.turns.length > 0 && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5 text-brand" />
              Conversation
            </CardTitle>
            <CardDescription className="text-sm">
              Every turn in order. A chip under a message means a card fired there; “Why?” opens
              what else was in the running.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.turns.map((turn) => (
              <ConversationTurn key={turn.turnId} turn={turn} />
            ))}
          </CardContent>
        </Card>
      )}

      {!!data.turns.length && <UnfiredForSession turns={data.turns} />}

      {!!data.turns.length && data.turns[0].trace.unavailable.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ChevronDown className="h-4 w-4" />
            What isn't tracked here
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 rounded-md border border-dashed p-3">
            <p className="mb-2 text-sm text-muted-foreground">
              So an absence here is never mistaken for a finding — each of these would need an
              engine change, not a card change.
            </p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {data.turns[0].trace.unavailable.map((u) => {
                const [key, ...rest] = u.split(":");
                return (
                  <li key={key}>
                    <span className="font-mono text-foreground">{key}</span> —{rest.join(":")}
                  </li>
                );
              })}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

/**
 * One turn: the message, what the methodology did about it, and — on demand —
 * everything that was considered. Deliberately not a `Card`; a conversation of
 * fourteen bordered cards is what this redesign set out to remove.
 */
function ConversationTurn({ turn }: { turn: TurnRow }) {
  const t = turn.trace;
  const considered = t.cards.filter((c) => c.outcome.state === "considered");
  const won = t.cards.find((c) => c.outcome.state === "won");
  const withheld = t.cards.find((c) => c.outcome.state === "withheld");
  const dropped = t.cards.filter((c) => c.outcome.state === "dropped");
  const isWing = turn.turnType.startsWith("ai_");
  const hasDetail = !!considered.length || !!dropped.length;

  return (
    <div className="space-y-2">
      <ChatBubble
        speaker={isWing ? "Wing" : "Student"}
        side={isWing ? "wing" : "person"}
        muted={!turn.analysisEligible}
        footer={
          <div className={`flex flex-wrap items-center gap-2 ${isWing ? "" : "justify-end"}`}>
            {won && won.outcome.state === "won" ? (
              <FiredCardChip
                cardCode={won.cardCode}
                name={won.name}
                confidence={won.outcome.confidence}
              />
            ) : withheld && withheld.outcome.state === "withheld" ? (
              <Badge variant="outline" className="gap-1.5 border-warn/40 py-1 text-xs font-normal">
                <PauseCircle className="h-3.5 w-3.5 text-warn" />
                <span className="font-medium">{withheld.cardCode}</span> matched, then held back
              </Badge>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                no card fired
                <InfoTip text="The detector returns nothing for a genuine no-match, for low confidence, and for a timeout, and doesn't record which — so this isn't evidence the engine judged the turn and declined." />
              </span>
            )}

            {hasDetail && (
              <Collapsible>
                <CollapsibleTrigger className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
                  Why?
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 w-[min(42rem,80vw)] rounded-md border bg-background p-3 text-left">
                  <SelectionDetail considered={considered} dropped={dropped} counts={t.counts.dropped} />
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        }
      >
        {turn.content}
      </ChatBubble>

      {!turn.analysisEligible && (
        <p className={`text-xs text-muted-foreground ${isWing ? "" : "text-right"}`}>
          Excluded from analysis — {turn.analysisExclusionReason ?? "no reason recorded"}. Not
          evidence for scoring, tagging or the Reveal Cycle.
        </p>
      )}

      {turn.gateFindings.map((f, i) => (
        <Alert key={i} variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>
            Integrity gate triggered — <span className="font-mono">{f.cardCode}</span> ({f.mode})
          </AlertTitle>
          <AlertDescription>
            matched “{f.matched}” in: {f.excerpt}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

function SelectionDetail({
  considered,
  dropped,
  counts,
}: {
  considered: TracedCard[];
  dropped: TracedCard[];
  counts: Record<DropStage, number>;
}) {
  const stages: DropStage[] = ["population_tag", "session_scope", "card_kind", "no_signal_component"];

  return (
    <div className="space-y-4">
      {!!considered.length && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
            Considered, did not win ({considered.length})
            <InfoTip text="There's no per-card score to show — the detector makes one call over the whole catalogue and returns a single winner. Weight is the methodology's precedence order, not a match strength." />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {considered.map((c) => (
              <Badge key={c.heuristicId} variant="outline" className="text-xs font-normal">
                <span className="font-medium">{c.name}</span>
                <span className="ml-1.5 font-mono text-muted-foreground">{c.cardCode}</span>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {!!dropped.length && (
        <div>
          <div className="mb-1.5 text-sm font-medium">Filtered out before that ({dropped.length})</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {stages
              .filter((s) => counts[s] > 0)
              .map((s) => (
                <span key={s}>
                  {counts[s]} — {STAGE_LABEL[s]}
                </span>
              ))}
          </div>
          {counts.population_tag > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              Audience drops are by design — only the variant matching this student is ever
              evaluated. These aren't cards that failed to fire.
            </p>
          )}
          <Collapsible>
            <CollapsibleTrigger className="mt-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
              List all {dropped.length}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs">
                {stages.flatMap((stage) =>
                  dropped
                    .filter((c) => c.outcome.state === "dropped" && c.outcome.stage === stage)
                    .map((c) => (
                      <li key={c.heuristicId} className="flex gap-2">
                        <span className="font-mono text-foreground">{c.cardCode}</span>
                        <span className="text-muted-foreground">
                          {c.outcome.state === "dropped" ? c.outcome.reason : ""}
                        </span>
                      </li>
                    )),
                )}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </div>
  );
}

/* ── Unfired cards, three buckets ────────────────────────────────────────── */

type Bucket = "never_eligible" | "eligible_never_won" | "never_considered" | "fired";

/**
 * The same classification `classifyUnfired` performs on the server, applied to
 * one session's turns in the browser so the panel needs no second round trip.
 *
 * It is duplicated deliberately and narrowly: the server's copy is the one the
 * cross-persona report will use, and it is tested. If these two ever disagree
 * the server's is right — which is why the shared shape is the trace, not this
 * function.
 */
function bucketFor(rows: TracedCard[]): Bucket {
  let eligible = 0;
  let won = 0;
  for (const c of rows) {
    if (c.outcome.state !== "dropped") eligible += 1;
    if (c.outcome.state === "won") won += 1;
  }
  if (won > 0) return "fired";
  if (eligible === 0) return "never_eligible";
  return "eligible_never_won";
}

const BUCKET_COPY: Record<
  Exclude<Bucket, "fired">,
  { title: string; whose: string }
> = {
  eligible_never_won: {
    title: "Considered, never won",
    whose: "Your finding — the card competed and lost every turn here.",
  },
  never_considered: {
    title: "Eligible and never evaluated",
    whose: "An engine question, not a card question — send this to Aditya.",
  },
  never_eligible: {
    title: "Never applied to this student",
    whose: "Not a finding — this student's audience never reaches this card.",
  },
};

function UnfiredForSession({ turns }: { turns: TurnRow[] }) {
  const buckets = useMemo(() => {
    const byCard = new Map<number, { card: TracedCard; rows: TracedCard[] }>();
    for (const turn of turns) {
      for (const c of turn.trace.cards) {
        const entry = byCard.get(c.heuristicId) ?? { card: c, rows: [] };
        entry.rows.push(c);
        byCard.set(c.heuristicId, entry);
      }
    }

    const out: Record<Exclude<Bucket, "fired">, TracedCard[]> = {
      eligible_never_won: [],
      never_considered: [],
      never_eligible: [],
    };
    for (const { card, rows } of byCard.values()) {
      const b = bucketFor(rows);
      if (b !== "fired") out[b].push(card);
    }
    return out;
  }, [turns]);

  const order: Array<Exclude<Bucket, "fired">> = [
    "eligible_never_won",
    "never_considered",
    "never_eligible",
  ];

  const anyBucketed = order.some((b) => buckets[b].length);
  if (!anyBucketed) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CircleSlash className="h-5 w-5 text-muted-foreground" />
          Cards that never fired in this session
        </CardTitle>
        <CardDescription className="text-sm">
          Split by whose problem it is — one session is one persona's worth of evidence, so
          "never fires for anyone" needs the cross-persona report on the Coverage tab.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {order.map((b) =>
          buckets[b].length ? (
            <div key={b}>
              <div className="text-sm font-semibold">
                {BUCKET_COPY[b].title}{" "}
                <span className="font-normal text-muted-foreground">({buckets[b].length})</span>
              </div>
              <p className="mb-2 text-sm text-muted-foreground">{BUCKET_COPY[b].whose}</p>
              <div className="flex flex-wrap gap-1.5">
                {buckets[b].map((c) => (
                  <Badge key={c.heuristicId} variant="outline" className="text-xs font-normal">
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-1.5 font-mono text-muted-foreground">{c.cardCode}</span>
                  </Badge>
                ))}
              </div>
            </div>
          ) : null,
        )}
      </CardContent>
    </Card>
  );
}
