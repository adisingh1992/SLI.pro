import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Loader2, ShieldCheck, ShieldAlert, EyeOff, CheckCircle2, XCircle,
  RotateCcw, Info, Power, PowerOff, Upload, AlertTriangle,
} from "lucide-react";
import { apiRequest, apiFetch, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

/**
 * Gate integrity — what the rules are, whether they are switched on, and what
 * the audit found.
 *
 * ── WHY THIS SCREEN ─────────────────────────────────────────────────────
 * Twenty-four of the 53 Tier 1 cards are integrity gates, and thirteen ask for
 * "content analysis on Wing's own output before delivery". The turn path streams,
 * so the decision taken was measure-then-enforce: compile the rules into the
 * prompt, then audit the delivered reply. That is only a decision if somebody
 * reads the result. Otherwise gate_audit_findings fills up unseen and "measure"
 * quietly means "ignore".
 *
 * ── THE THREE QUESTIONS, IN THIS ORDER ───────────────────────────────────
 * 1. Is anything actually live? A sequence can be fully built and govern nobody —
 *    publishing is a pointer on the cycle, and `wing:build-sequences` deliberately
 *    does not set it. Until this panel existed, a built sequence was visible
 *    nowhere at all, so "no findings" and "not switched on" looked identical.
 * 2. Which rules are being broken? The tuning table. Accepted means the finding
 *    was real; REJECTED MEANS THE PATTERN WAS TOO BROAD and Wing behaved
 *    correctly — so a high rejection rate is a fault in our regex, not in the
 *    coaching. The screen says this out loud because the intuitive reading is
 *    backwards.
 * 3. What can the audit not see? Five gates cannot be judged from reply text.
 *    "No violations" must never be read as "every gate held".
 */

type Mode = "violation" | "review";
type ReviewState = "pending_review" | "accepted" | "rejected";

type GateTally = {
  cardCode: string;
  mode: Mode | null;
  what: string | null;
  source: string | null;
  total: number;
  pendingReview: number;
  accepted: number;
  rejected: number;
  latestAt: string | null;
};

type Summary = {
  totals: { findings: number; pendingReview: number; accepted: number; rejected: number };
  gates: GateTally[];
  notAuditable: { cardCode: string; reason: string }[];
};

type Finding = {
  id: number;
  cardCode: string;
  cardName: string;
  heuristicId: number;
  mode: Mode;
  matched: string;
  excerpt: string;
  status: ReviewState;
  detectedAt: string;
  studentId: number;
  sessionId: number;
  sessionType: string;
  turnId: number | null;
};

type Cycle = {
  id: number;
  label: string | null;
  cycleYear: number;
  institutionName: string;
  activeSequenceId: number | null;
};

type SequenceRow = {
  id: number;
  versionNumber: number;
  activeFrom: string;
  supersededAt: string | null;
  createdAt: string;
  entryCount: number;
  isActive: boolean;
};

type SeqCard = {
  heuristicId: number;
  cardCode: string | null;
  name: string;
  cardKind: "coaching_card" | "integrity_gate" | "exercise" | null;
  weight: number;
  appliesToSession: string | null;
};

const SESSION_LABELS: Record<string, string> = {
  foundation_1: "Foundation 1",
  foundation_2: "Foundation 2",
  foundation_3: "Foundation 3",
};

function sessionLabel(value: string | null): string {
  if (!value) return "Every session";
  return SESSION_LABELS[value] ?? value.replace(/_/g, " ");
}

function when(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

/**
 * A sequence is in one of three states, and the difference matters.
 *
 * `isActive` comes from the cycle's own pointer — the single thing
 * `resolveSequenceId` reads. `supersededAt` is set by `wing:build-sequences` on
 * this cycle's earlier UNPUBLISHED versions so re-running the builder does not
 * leave a pile of near-identical candidates nobody can tell apart. It never
 * touches the live one.
 *
 * Collapsing the two into "live / not live" made every old build look like a
 * candidate awaiting publication, which is exactly the wrong thing to show a
 * reviewer deciding what to switch on.
 */
function sequenceState(s: SequenceRow): { label: string; className: string } {
  if (s.isActive) {
    return { label: "Live", className: "bg-good-soft text-good hover:bg-good-soft" };
  }
  if (s.supersededAt) {
    return { label: "Superseded", className: "bg-muted text-muted-foreground hover:bg-muted" };
  }
  return {
    label: "Built, not published",
    className: "bg-brand-soft text-brand hover:bg-brand-soft",
  };
}

function ModeBadge({ mode }: { mode: Mode | null }) {
  if (mode === "review") {
    return (
      <Badge className="bg-brand-soft text-brand hover:bg-brand-soft">Needs a look</Badge>
    );
  }
  if (mode === "violation") {
    return <Badge className="bg-warn-soft text-warn hover:bg-warn-soft">Breach</Badge>;
  }
  return <Badge className="bg-muted text-muted-foreground hover:bg-muted">Retired rule</Badge>;
}

function StateBadge({ status }: { status: ReviewState }) {
  if (status === "accepted") {
    return <Badge className="bg-warn-soft text-warn hover:bg-warn-soft">Real breach</Badge>;
  }
  if (status === "rejected") {
    return <Badge className="bg-muted text-muted-foreground hover:bg-muted">Pattern too broad</Badge>;
  }
  return <Badge className="bg-brand-soft text-brand hover:bg-brand-soft">Unreviewed</Badge>;
}

/* ── 1. Is anything live? ────────────────────────────────────────────────── */

function InForce() {
  const { toast } = useToast();
  const [cycleId, setCycleId] = useState<string>("");
  const [sequenceId, setSequenceId] = useState<number | null>(null);
  /** The version the publish dialog is asking about, or null when it is closed. */
  const [publishing, setPublishing] = useState<SequenceRow | null>(null);
  /** Set when the server refused because the evaluation window is shut. */
  const [windowShut, setWindowShut] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const { data: cycles, isLoading: cyclesLoading } = useQuery<Cycle[]>({
    queryKey: ["/api/admin/cycles"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/cycles")).json(),
  });

  const effectiveCycle = cycleId || (cycles?.length ? String(cycles[0].id) : "");

  const { data: history } = useQuery<{
    activeSequenceId: number | null;
    sequences: SequenceRow[];
  }>({
    queryKey: [`/api/admin/cycles/${effectiveCycle}/sequence/history`],
    queryFn: async () =>
      (await apiRequest("GET", `/api/admin/cycles/${effectiveCycle}/sequence/history`)).json(),
    enabled: !!effectiveCycle,
  });

  const chosen = sequenceId ?? history?.sequences[0]?.id ?? null;

  const { data: contents } = useQuery<{ cards: SeqCard[] }>({
    queryKey: [`/api/admin/sequences/${chosen}/cards`],
    queryFn: async () => (await apiRequest("GET", `/api/admin/sequences/${chosen}/cards`)).json(),
    enabled: !!chosen,
  });

  const publish = useMutation({
    /*
     * apiFetch, not apiRequest: the interesting responses here are non-2xx. A 409
     * from the evaluation-window gate is a decision point rather than a failure,
     * and the body carries `detail`, `remedy` and `warnings` — the most useful
     * part of the answer, which a thrown Error would discard.
     */
    mutationFn: async ({ id, force }: { id: number; force?: boolean }) =>
      apiFetch("PUT", `/api/admin/cycles/${effectiveCycle}/active-sequence`, {
        sequenceId: id,
        ...(force ? { force: true, reason } : {}),
      }),

    onSuccess: (res) => {
      if (res.status === 409 && /evaluation window/i.test(res.data?.error ?? "")) {
        // Not an error. The window gate exists to make this a deliberate act, so
        // it asks for a reason rather than closing the door.
        setWindowShut(res.data?.detail ?? "outside the evaluation window");
        return;
      }

      if (!res.ok) {
        toast({
          title: res.data?.error ?? "Could not publish",
          description: [res.data?.detail, res.data?.remedy].filter(Boolean).join(" "),
          variant: "destructive",
        });
        return;
      }

      queryClient.invalidateQueries({
        queryKey: [`/api/admin/cycles/${effectiveCycle}/sequence/history`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cycles"] });
      queryClient.invalidateQueries({
        queryKey: [`/api/admin/cycles/${effectiveCycle}/sequence`],
      });

      setPublishing(null);
      setWindowShut(null);
      setReason("");

      const warnings: string[] = res.data?.warnings ?? [];
      toast({
        title: `Version ${res.data?.versionNumber} is live`,
        description: warnings.length
          ? warnings.join(" ")
          : `${res.data?.detectorCards} coaching cards and ${res.data?.gates} gates are ` +
            "now in force. The previous version is kept and can be pointed at again.",
        variant: warnings.length ? "destructive" : undefined,
      });
    },

    onError: (error: Error) => {
      toast({
        title: "Could not reach the server",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const gates = (contents?.cards ?? []).filter((c) => c.cardKind === "integrity_gate");
  const kinds = (contents?.cards ?? []).reduce<Record<string, number>>((acc, c) => {
    const key = c.cardKind ?? "unclassified";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  if (cyclesLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const live = history?.activeSequenceId ?? null;
  const liveRow = (history?.sequences ?? []).find((s) => s.isActive) ?? null;
  /*
   * A cycle can point at a sequence that has no entries, and on dev it does:
   * `wing:reset-cards` deletes every row in heuristic_sequence_entries, so the
   * published version emptied out while the pointer stayed exactly where it was.
   * That state is worth its own banner. "No pointer" and "pointer at nothing"
   * produce identical behaviour — no card fires, no gate compiles — and every
   * other screen shows a healthy published cohort either way.
   */
  const liveButEmpty = !!liveRow && liveRow.entryCount === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {live ? <Power className="h-4 w-4 text-good" /> : <PowerOff className="h-4 w-4 text-muted-foreground" />}
          What is in force
        </CardTitle>
        <CardDescription>
          A sequence governs a cohort only when the cycle points at it. Building one does
          not publish it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-sm space-y-1.5">
          <Label>Cycle</Label>
          <Select
            value={effectiveCycle}
            onValueChange={(v) => {
              setCycleId(v);
              setSequenceId(null);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a cycle" />
            </SelectTrigger>
            <SelectContent>
              {(cycles ?? []).map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.institutionName} · {c.label ?? c.cycleYear}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!live && (
          <Alert>
            <PowerOff className="h-4 w-4" />
            <AlertTitle>Nothing is live for this cycle</AlertTitle>
            <AlertDescription>
              This cycle points at no sequence, so the engine loads no cards, compiles no
              gates and records no findings. Anything below is built and inert.
            </AlertDescription>
          </Alert>
        )}

        {liveButEmpty && (
          <Alert>
            <PowerOff className="h-4 w-4" />
            <AlertTitle>The live sequence is empty</AlertTitle>
            <AlertDescription>
              This cycle points at version {liveRow!.versionNumber}, which contains no cards.
              The engine resolves a sequence and finds nothing in it, so no card fires and no
              gate is compiled — the same outcome as publishing nothing, and it looks like a
              healthy published cohort on every other screen. Publishing a build below means
              moving this cycle's pointer to it.
            </AlertDescription>
          </Alert>
        )}

        {history?.sequences.length ? (
          <div className="space-y-2">
            {history.sequences.map((s) => (
              /*
               * A div rather than a button, because it contains a button. Nesting
               * one inside the other is invalid HTML and the browser recovers by
               * splitting them, at which point which element the click landed on
               * is anyone's guess. The row keeps keyboard access through role and
               * tabIndex; the Publish action inside it is a real button.
               */
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => setSequenceId(s.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSequenceId(s.id);
                  }
                }}
                className={`flex w-full cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition ${
                  s.id === chosen ? "border-brand bg-brand-soft/40" : "hover:bg-muted/50"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="font-medium">Version {s.versionNumber}</span>
                  <Badge className={sequenceState(s).className}>
                    {sequenceState(s).label}
                  </Badge>
                </span>
                <span className="flex items-center gap-3 text-muted-foreground">
                  <span>
                    {s.entryCount} card{s.entryCount === 1 ? "" : "s"} · built {when(s.createdAt)}
                  </span>
                  {!s.isActive && s.entryCount > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setWindowShut(null);
                        setReason("");
                        setPublishing(s);
                      }}
                    >
                      <Upload className="mr-1.5 h-3.5 w-3.5" />
                      Publish
                    </Button>
                  )}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No sequence has ever been built for this cycle.
          </p>
        )}

        {chosen && contents && (
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex flex-wrap gap-2 text-xs">
              {Object.entries(kinds).map(([kind, n]) => (
                <Badge key={kind} className="bg-muted text-muted-foreground hover:bg-muted">
                  {n} {kind.replace(/_/g, " ")}
                  {n === 1 ? "" : "s"}
                </Badge>
              ))}
            </div>
            <div className="space-y-1">
              {gates.map((g) => (
                <div key={g.heuristicId} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">
                    <span className="font-mono text-xs text-muted-foreground">
                      {g.cardCode ?? "—"}
                    </span>{" "}
                    {g.name.replace(/^(?:H|IG|EX)-\w+\s*/, "")}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {sessionLabel(g.appliesToSession)}
                  </span>
                </div>
              ))}
              {!gates.length && (
                <p className="text-sm text-muted-foreground">
                  This sequence contains no integrity gates.
                </p>
              )}
            </div>
          </div>
        )}

        <Dialog
          open={!!publishing}
          onOpenChange={(open) => {
            if (!open) {
              setPublishing(null);
              setWindowShut(null);
              setReason("");
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Publish version {publishing?.versionNumber} to this cohort?
              </DialogTitle>
              <DialogDescription>
                This points the cycle at version {publishing?.versionNumber}, and the engine
                reads nothing else. Every student in the cohort is coached by its{" "}
                {publishing?.entryCount} cards from their next turn — including the integrity
                gates, which start being compiled into every reply. The version that is live
                now is kept and can be pointed at again.
              </DialogDescription>
            </DialogHeader>

            {windowShut && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>
                  {liveButEmpty ? "The window is shut, but nothing is in force" : "This cycle is mid-flight"}
                </AlertTitle>
                <AlertDescription>
                  {liveButEmpty ? (
                    <>
                      {windowShut}. The gate reads the cycle's dates and nothing else, so it
                      cannot tell this case apart from a real mid-cycle change — and this is not
                      one. Version {liveRow!.versionNumber} is live with no cards, so there is
                      no methodology to change under anyone: publishing switches it on rather
                      than swapping it out. It still needs a reason, and the reason is logged.
                    </>
                  ) : (
                    <>
                      {windowShut}. Changing the methodology now changes it under students who
                      are partway through, which is what the evaluation window exists to
                      prevent. If a card is doing harm, retiring that card takes effect
                      immediately and is the better tool. To override, say why — it is written
                      to the log.
                    </>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {windowShut && (
              <div className="space-y-1.5">
                <Label htmlFor="override-reason">Reason for overriding</Label>
                <Textarea
                  id="override-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="At least ten characters, and it will be read by whoever asks why the cohort changed mid-cycle."
                  rows={3}
                />
              </div>
            )}

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => {
                  setPublishing(null);
                  setWindowShut(null);
                  setReason("");
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={
                  publish.isPending ||
                  !publishing ||
                  (!!windowShut && reason.trim().length < 10)
                }
                onClick={() =>
                  publishing &&
                  publish.mutate({ id: publishing.id, force: !!windowShut })
                }
              >
                {publish.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {windowShut ? "Override and publish" : "Publish"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

/* ── 2 and 3. What fired, and what cannot be seen ────────────────────────── */

function TuningTable({
  summary,
  onPick,
}: {
  summary: Summary;
  onPick: (cardCode: string) => void;
}) {
  const fired = summary.gates.filter((g) => g.total > 0);
  const quiet = summary.gates.filter((g) => g.total === 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4 text-warn" />
          What the audit found
        </CardTitle>
        <CardDescription>
          Accepted means the finding was real. Rejected means the pattern was too broad and
          Wing behaved correctly — so a gate with many rejections needs its rule narrowed,
          not the coaching changed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!fired.length ? (
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>Nothing has been recorded</AlertTitle>
            <AlertDescription>
              Either no sequence is live yet, or every rule held on every turn since one
              was. The {quiet.length} checkable gates are listed below; the ones the audit
              cannot judge are listed after them.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Gate</th>
                  <th className="py-2 pr-3 font-medium">Kind</th>
                  <th className="py-2 pr-3 text-right font-medium">Unreviewed</th>
                  <th className="py-2 pr-3 text-right font-medium">Real</th>
                  <th className="py-2 pr-3 text-right font-medium">Too broad</th>
                  <th className="py-2 pr-3 font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {fired.map((g) => (
                  <tr
                    key={g.cardCode}
                    className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                    onClick={() => onPick(g.cardCode)}
                  >
                    <td className="py-2 pr-3">
                      <div className="font-mono text-xs">{g.cardCode}</div>
                      {g.what && (
                        <div className="max-w-md text-xs text-muted-foreground">{g.what}</div>
                      )}
                    </td>
                    <td className="py-2 pr-3"><ModeBadge mode={g.mode} /></td>
                    <td className="py-2 pr-3 text-right font-medium">{g.pendingReview}</td>
                    <td className="py-2 pr-3 text-right">{g.accepted}</td>
                    <td className="py-2 pr-3 text-right">{g.rejected}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{when(g.latestAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!!fired.length && !!quiet.length && (
          <p className="text-xs text-muted-foreground">
            {quiet.length} other checkable gate{quiet.length === 1 ? " has" : "s have"} produced
            nothing: {quiet.map((g) => g.cardCode).join(", ")}.
          </p>
        )}

        <div className="rounded-md border border-dashed p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <EyeOff className="h-4 w-4 text-muted-foreground" />
            The audit cannot judge these from the reply text
          </div>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {summary.notAuditable.map((g) => (
              <li key={g.cardCode}>
                <span className="font-mono">{g.cardCode}</span> — {g.reason}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── The review queue ────────────────────────────────────────────────────── */

function ReviewQueue({
  cardCode,
  setCardCode,
  gates,
}: {
  cardCode: string;
  setCardCode: (v: string) => void;
  gates: GateTally[];
}) {
  const { toast } = useToast();
  const [status, setStatus] = useState<string>("pending_review");
  const [limit, setLimit] = useState(50);

  const query = new URLSearchParams();
  if (cardCode !== "all") query.set("cardCode", cardCode);
  if (status !== "all") query.set("status", status);
  query.set("limit", String(limit));

  const { data, isLoading } = useQuery<{ findings: Finding[]; total: number }>({
    queryKey: ["/api/admin/gate-audit/findings", cardCode, status, limit],
    queryFn: async () =>
      (await apiRequest("GET", `/api/admin/gate-audit/findings?${query.toString()}`)).json(),
  });

  const review = useMutation({
    mutationFn: async ({ id, next }: { id: number; next: ReviewState }) => {
      const res = await apiRequest("PATCH", `/api/admin/gate-audit/findings/${id}`, {
        status: next,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/gate-audit/findings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/gate-audit/summary"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not record that",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const findings = data?.findings ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Review queue</CardTitle>
        <CardDescription>
          Each row is one gate on one reply. The excerpt is Wing's own words, so it may
          quote the student back — this screen is platform staff only for that reason.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[220px] space-y-1.5">
            <Label>Gate</Label>
            <Select value={cardCode} onValueChange={setCardCode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Every gate</SelectItem>
                {gates
                  .filter((g) => g.total > 0)
                  .map((g) => (
                    <SelectItem key={g.cardCode} value={g.cardCode}>
                      {g.cardCode} ({g.total})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[200px] space-y-1.5">
            <Label>State</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending_review">Unreviewed</SelectItem>
                <SelectItem value="accepted">Real breach</SelectItem>
                <SelectItem value="rejected">Pattern too broad</SelectItem>
                <SelectItem value="all">Any</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !findings.length ? (
          <p className="text-sm text-muted-foreground">Nothing matches that filter.</p>
        ) : (
          <div className="space-y-3">
            {findings.map((f) => (
              <div key={f.id} className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs">{f.cardCode}</span>
                  <ModeBadge mode={f.mode} />
                  <StateBadge status={f.status} />
                  <span className="ml-auto text-xs text-muted-foreground">
                    {sessionLabel(f.sessionType)} · session #{f.sessionId} · {when(f.detectedAt)}
                  </span>
                </div>

                <p className="text-sm">
                  <span className="text-muted-foreground">Matched </span>
                  <span className="rounded bg-warn-soft px-1 font-medium text-warn">
                    {f.matched}
                  </span>
                </p>
                <p className="border-l-2 pl-3 text-sm italic text-muted-foreground">
                  {f.excerpt}
                </p>

                <div className="flex flex-wrap gap-2 pt-1">
                  {f.status !== "accepted" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={review.isPending}
                      onClick={() => review.mutate({ id: f.id, next: "accepted" })}
                    >
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      Real breach
                    </Button>
                  )}
                  {f.status !== "rejected" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={review.isPending}
                      onClick={() => review.mutate({ id: f.id, next: "rejected" })}
                    >
                      <XCircle className="mr-1.5 h-3.5 w-3.5" />
                      Pattern too broad
                    </Button>
                  )}
                  {f.status !== "pending_review" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={review.isPending}
                      onClick={() => review.mutate({ id: f.id, next: "pending_review" })}
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                      Undo
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {data && data.total > findings.length && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLimit((n) => Math.min(200, n + 50))}
                disabled={limit >= 200}
              >
                {limit >= 200
                  ? `Showing the first 200 of ${data.total}`
                  : `Show more (${findings.length} of ${data.total})`}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── The panel ───────────────────────────────────────────────────────────── */

export function IntegrityPanel() {
  const [cardCode, setCardCode] = useState("all");

  const { data: summary, isLoading } = useQuery<Summary>({
    queryKey: ["/api/admin/gate-audit/summary"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/gate-audit/summary")).json(),
  });

  if (isLoading || !summary) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>The gates are prompt-side, and this is the measurement</AlertTitle>
        <AlertDescription>
          Rules are compiled into every reply Wing composes; the delivered reply is then
          checked against them and anything found is recorded here. Nothing is blocked
          before delivery yet — which gates earn that cost is what these findings decide.
          {summary.totals.pendingReview > 0 && (
            <>
              {" "}
              <strong>
                {summary.totals.pendingReview} finding
                {summary.totals.pendingReview === 1 ? "" : "s"} awaiting review.
              </strong>
            </>
          )}
        </AlertDescription>
      </Alert>

      <InForce />
      <TuningTable summary={summary} onPick={setCardCode} />
      <ReviewQueue cardCode={cardCode} setCardCode={setCardCode} gates={summary.gates} />
    </div>
  );
}
