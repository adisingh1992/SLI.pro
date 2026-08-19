import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Loader2, ShieldCheck, ShieldAlert, EyeOff, CheckCircle2, XCircle,
  RotateCcw, Info, Power, PowerOff,
} from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
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
  /*
   * `id`, because that is what GET /api/admin/cycles returns. It was written as
   * `cycleId` here — the shape the voice routes use — and TypeScript could not see
   * it: this type is an assertion over res.json(), not a contract with the server.
   * Same class of mistake as the card page calling a route nobody registered.
   */
  id: number;
  label: string | null;
  cycleYear: number;
  institutionName: string;
  activeSequenceId: number | null;
  /** Cards in the sequence the pointer names. Null when there is no pointer. */
  activeSequenceCards: number | null;
  activeSequenceVersion: number | null;
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

/* ── 1. Is anything live? ────────────────────────────────────────────────
 *
 * Read-only, and deliberately so. The version list and the Publish button used to
 * be here, because this screen needs to know whether anything is in force before a
 * findings count means anything — and publishing then ended up on a tab called
 * Integrity, where nobody looked for it. They now live on the Sequences tab. What
 * stays is the one fact this screen cannot do without: whether the rules being
 * audited are actually compiled into anything.
 */

function LiveStatus() {
  const [, navigate] = useLocation();

  const { data: cycles, isLoading } = useQuery<Cycle[]>({
    queryKey: ["/api/admin/cycles"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/cycles")).json(),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const rows = cycles ?? [];
  const governed = rows.filter((c) => (c.activeSequenceCards ?? 0) > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {governed.length ? (
            <Power className="h-4 w-4 text-good" />
          ) : (
            <PowerOff className="h-4 w-4 text-muted-foreground" />
          )}
          What is in force
        </CardTitle>
        <CardDescription>
          Gates are only compiled for a cohort whose cycle points at a sequence that has cards.
          Until then there is nothing for this screen to find.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((c) => {
          const cards = c.activeSequenceCards;
          return (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <span className="font-medium">
                {c.institutionName} · {c.label ?? c.cycleYear}
              </span>
              {cards == null ? (
                <span className="text-muted-foreground">
                  No sequence — nothing fires, nothing is audited
                </span>
              ) : cards === 0 ? (
                <span className="text-warn">
                  Points at version {c.activeSequenceVersion}, which has no cards — nothing fires
                </span>
              ) : (
                <span className="text-good">
                  Version {c.activeSequenceVersion} live · {cards} cards
                </span>
              )}
            </div>
          );
        })}

        {!rows.length && (
          <p className="text-sm text-muted-foreground">No cycles exist yet.</p>
        )}

        <button
          type="button"
          className="text-sm font-medium text-brand underline"
          onClick={() => navigate("/admin/methodology/sequences")}
        >
          Publish or roll back a sequence on the Sequences tab
        </button>
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

      <LiveStatus />
      <TuningTable summary={summary} onPick={setCardCode} />
      <ReviewQueue cardCode={cardCode} setCardCode={setCardCode} gates={summary.gates} />
    </div>
  );
}
