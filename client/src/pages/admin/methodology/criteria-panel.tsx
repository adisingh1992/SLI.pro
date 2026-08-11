import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Loader2, Plus, X, Play, Upload, AlertTriangle, History, Undo2, Info,
} from "lucide-react";
import { apiRequest, apiFetch, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

/**
 * Completion criteria editor.
 *
 * These decide when a session is finished. Unlike heuristic cards there is no
 * gate between an edit and every student — so replay is not a nicety here, it
 * is the safety mechanism, and the UI pushes hard toward running it first.
 */

type Criterion = {
  id: string;
  text: string;
  reachable: boolean;
  note?: string;
  mirroredInConversation?: boolean;
};

type Version = {
  id: number;
  versionNumber: number;
  status: string;
  criteria: Criterion[];
  changeNote: string | null;
  createdAt: string;
};

type ReplayResult = {
  replayed: number;
  stillCompletes: number;
  wouldNowFail: number;
  wouldNowPass: number;
  note?: string;
  cases: {
    sessionId: number;
    studentName: string;
    isTestUser: boolean;
    actualStatus: string;
    wouldComplete: boolean;
    verdict: string;
    reasoning?: string;
  }[];
};

const POPULATION_LABEL: Record<string, string> = {
  undergraduate_or_recent_grad: "Undergraduate / recent grad",
  early_career: "Early career",
  mid_career_or_senior: "Mid-career / senior",
};

export function CriteriaPanel() {
  const { toast } = useToast();
  const [population, setPopulation] = useState("mid_career_or_senior");
  const [sessionType, setSessionType] = useState("foundation_2");
  const [draft, setDraft] = useState<Criterion[] | null>(null);
  const [changeNote, setChangeNote] = useState("");
  const [replayResult, setReplayResult] = useState<ReplayResult | null>(null);

  const { data, isLoading } = useQuery<{ published: Version | null; versions: Version[] }>({
    queryKey: [`/api/admin/criteria/${population}/${sessionType}`],
    queryFn: async () =>
      (await apiRequest("GET", `/api/admin/criteria/${population}/${sessionType}`)).json(),
  });

  /**
   * The unpublished version to fall back to when nothing is live.
   *
   * Seeded drafts exist for Module C in every population: their analysis prompt
   * never stated criteria, so publishing is a real methodology decision rather
   * than a transcription. Without this, the editor loaded an empty list while
   * the badge said a draft existed — the criteria were in the database and
   * unreachable from the only screen that can publish them.
   *
   * listVersions orders by versionNumber desc, so this is the newest draft.
   */
  const seededDraft = data?.published
    ? null
    : (data?.versions?.find((v) => v.status === "draft") ?? null);

  // What the editor starts from, and what `dirty` is measured against. Both
  // must be the same value or an untouched draft would look edited.
  const baseline = data?.published?.criteria ?? seededDraft?.criteria ?? [];

  // Reset the draft whenever the selection changes, so an edit can never be
  // published against the wrong population.
  useEffect(() => {
    setDraft(baseline);
    setReplayResult(null);
    setChangeNote("");
  }, [data, population, sessionType]);

  const replayMutation = useMutation({
    // Not typed as ReplayResult: a non-2xx returns { error }, so the success
    // and failure shapes differ. Narrowed below rather than asserted away.
    mutationFn: async () =>
      apiFetch(
        "POST",
        `/api/admin/criteria/${population}/${sessionType}/replay`,
        { criteria: draft, limit: 10 },
      ),
    onSuccess: (res) => {
      if (!res.ok) {
        toast({ title: res.data?.error ?? "Replay failed", variant: "destructive" });
        return;
      }
      setReplayResult(res.data as ReplayResult);
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () =>
      apiFetch("POST", `/api/admin/criteria/${population}/${sessionType}`, {
        criteria: draft,
        changeNote: changeNote.trim() || null,
      }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast({
          title: res.data?.error ?? "Could not publish",
          description: res.data?.detail,
          variant: "destructive",
        });
        return;
      }
      queryClient.invalidateQueries({
        queryKey: [`/api/admin/criteria/${population}/${sessionType}`],
      });
      setReplayResult(null);
      setChangeNote("");
      toast({
        title: `Published v${res.data.versionNumber}`,
        description: "Live for every future session of this population and type.",
      });
    },
  });

  const revertMutation = useMutation({
    mutationFn: async (versionId: number) =>
      apiFetch("POST", `/api/admin/criteria/revert/${versionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/admin/criteria/${population}/${sessionType}`],
      });
      toast({ title: "Reverted", description: "Republished as a new version." });
    },
  });

  const criteria = draft ?? [];
  const dirty = JSON.stringify(criteria) !== JSON.stringify(baseline);
  const unreachable = criteria.filter((c) => !c.reachable);

  const setText = (i: number, text: string) =>
    setDraft(criteria.map((c, n) => (n === i ? { ...c, text } : c)));

  return (
    <div className="space-y-6">

        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertTitle>These reach students immediately</AlertTitle>
          <AlertDescription>
            There is no cohort gate here as there is for heuristics — a publish
            changes how every future session of this type is judged.{" "}
            <strong>Replay first.</strong> It runs your draft against sessions that
            already finished and tells you whether they still would.
          </AlertDescription>
        </Alert>

        <div className="mb-6 grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Population</Label>
            <Select value={population} onValueChange={setPopulation}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(POPULATION_LABEL).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Session</Label>
            <Select value={sessionType} onValueChange={setSessionType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="foundation_1">Session 1 — Functional identity</SelectItem>
                <SelectItem value="foundation_2">Session 2 — Credibility</SelectItem>
                <SelectItem value="foundation_3">Session 3 — Signature story</SelectItem>
                <SelectItem value="enhancement_a">Module A — LinkedIn optimisation</SelectItem>
                <SelectItem value="enhancement_b">Module B — Network strategy</SelectItem>
                <SelectItem value="enhancement_c">Module C — Content engine</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {seededDraft && (
              <Alert className="mb-6 border-warn/30 bg-warn-soft">
                <AlertTriangle className="h-4 w-4 text-warn" />
                <AlertTitle className="text-warn">
                  Draft — nothing is live for this session
                </AlertTitle>
                <AlertDescription className="text-warn">
                  {seededDraft.changeNote ??
                    "These criteria have never been published. The prompt file's own list is what judges completion today."}
                </AlertDescription>
              </Alert>
            )}

            {unreachable.length > 0 && (
              <Alert className="mb-6 border-warn/30 bg-warn-soft">
                <AlertTriangle className="h-4 w-4 text-warn" />
                <AlertTitle className="text-warn">
                  {unreachable.length} criterion{unreachable.length === 1 ? "" : "s"} cannot be met
                </AlertTitle>
                <AlertDescription className="text-warn">
                  {unreachable[0].note}
                </AlertDescription>
              </Alert>
            )}

            <Card className="mb-6">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">
                    Criteria
                    {data?.published ? (
                      <Badge variant="outline" className="ml-2">
                        v{data.published.versionNumber} · live
                      </Badge>
                    ) : data?.versions?.some((v) => v.status === "draft") ? (
                      <Badge className="ml-2 bg-warn-soft text-warn hover:bg-warn-soft">
                        draft only — not live
                      </Badge>
                    ) : null}
                  </CardTitle>
                  <CardDescription>
                    All must hold for the session to be judged complete.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDraft([
                      ...criteria,
                      { id: `c${criteria.length + 1}`, text: "", reachable: true },
                    ])
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {!criteria.length && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    Nothing published — the prompt file's own list is in use.
                  </p>
                )}

                {criteria.map((c, i) => (
                  <div key={c.id} className="space-y-1">
                    <div className="flex gap-2">
                      <span className="pt-2 text-sm text-muted-foreground">{i + 1}.</span>
                      <Textarea
                        rows={2}
                        value={c.text}
                        onChange={(e) => setText(i, e.target.value)}
                        className={!c.reachable ? "border-warn/30" : ""}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="mt-1 text-destructive"
                        onClick={() => setDraft(criteria.filter((_, n) => n !== i))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    {!c.reachable && (
                      <p className="ml-6 text-xs text-warn">⚠ {c.note}</p>
                    )}
                    {c.reachable && c.mirroredInConversation === false && (
                      <p className="ml-6 text-xs text-muted-foreground">
                        Similar wording was not found in the conversation prompt — worth
                        checking that the session actually pursues this.
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Also shown for an untouched seeded draft: it is unpublished by
                definition, so replay and publish must be reachable without
                having to edit something first. */}
            {(dirty || seededDraft) && (
              <Card className="mb-6 border-primary/40">
                <CardHeader>
                  <CardTitle className="text-base">
                    {dirty ? "Unpublished changes" : "Unpublished draft"}
                  </CardTitle>
                  <CardDescription>
                    Replay before publishing. It costs one model call per session.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button
                    variant="outline"
                    disabled={replayMutation.isPending || !criteria.length}
                    onClick={() => replayMutation.mutate()}
                  >
                    {replayMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-4 w-4" />
                    )}
                    Replay against past sessions
                  </Button>

                  {replayResult && (
                    <div className="space-y-3 rounded-md border p-3">
                      {replayResult.note ? (
                        <p className="text-sm text-muted-foreground">{replayResult.note}</p>
                      ) : (
                        <>
                          <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                              <p className="text-2xl font-semibold text-good">
                                {replayResult.stillCompletes}
                              </p>
                              <p className="text-xs text-muted-foreground">still complete</p>
                            </div>
                            <div>
                              <p className={`text-2xl font-semibold ${replayResult.wouldNowFail ? "text-destructive" : ""}`}>
                                {replayResult.wouldNowFail}
                              </p>
                              <p className="text-xs text-muted-foreground">would now fail</p>
                            </div>
                            <div>
                              <p className="text-2xl font-semibold">{replayResult.wouldNowPass}</p>
                              <p className="text-xs text-muted-foreground">would newly pass</p>
                            </div>
                          </div>

                          {replayResult.wouldNowFail > 0 && (
                            <Alert className="border-destructive/40">
                              <AlertTriangle className="h-4 w-4" />
                              <AlertDescription>
                                Your edit is stricter than what was live. Sessions that
                                really did finish would not under these criteria. That is
                                sometimes the intent — but if it is not, this is the
                                warning.
                              </AlertDescription>
                            </Alert>
                          )}

                          <div className="space-y-1">
                            {replayResult.cases.map((c) => (
                              <div
                                key={c.sessionId}
                                className="flex items-center justify-between rounded border px-2 py-1 text-xs"
                              >
                                <span>
                                  Session {c.sessionId} · {c.studentName}
                                  {c.isTestUser && " (test)"}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={
                                    c.verdict === "wouldNowFail"
                                      ? "border-destructive text-destructive"
                                      : c.verdict === "stillCompletes"
                                        ? "border-good/40 text-good"
                                        : ""
                                  }
                                >
                                  {c.verdict.replace(/([A-Z])/g, " $1").toLowerCase()}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="note">What changed and why</Label>
                    <Input
                      id="note"
                      value={changeNote}
                      onChange={(e) => setChangeNote(e.target.value)}
                      placeholder="Removed the post-closing acknowledgement — unreachable"
                    />
                  </div>

                  <div className="flex items-center justify-between border-t pt-3">
                    <p className="text-xs text-muted-foreground">
                      Publishing retires the current version. You can revert.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setDraft(data?.published?.criteria ?? [])}
                      >
                        Discard
                      </Button>
                      <Button
                        disabled={publishMutation.isPending || !criteria.length}
                        onClick={() => publishMutation.mutate()}
                      >
                        {publishMutation.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        <Upload className="mr-2 h-4 w-4" />
                        Publish
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {(data?.versions?.length ?? 0) > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    <History className="mr-2 inline h-4 w-4" />
                    History
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data!.versions.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between rounded-md border p-2 text-sm"
                    >
                      <div className="min-w-0">
                        <span className="font-medium">v{v.versionNumber}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {v.status} · {v.criteria.length} criteria ·{" "}
                          {new Date(v.createdAt).toLocaleDateString()}
                        </span>
                        {v.changeNote && (
                          <p className="truncate text-xs text-muted-foreground">
                            {v.changeNote}
                          </p>
                        )}
                      </div>
                      {v.status !== "published" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => revertMutation.mutate(v.id)}
                        >
                          <Undo2 className="mr-1 h-3 w-3" />
                          revert
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
    </div>
  );
}
