import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch, apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowDown,
  ArrowUp,
  Info,
  Loader2,
  Play,
  Plus,
  X,
} from "lucide-react";

/**
 * Analysis methodology editor.
 *
 * Methodology is HOW the analysis reads a finished transcript — the lenses,
 * validation tests and translation rules. Completion criteria, edited on the
 * sibling page, are WHETHER the session is done.
 *
 * Those two used to overlap: five of the nine analysis prompts restated their
 * criteria inside the methodology block, disagreeing with the criteria the
 * editor controlled. Those duplicates were removed before this page existed,
 * which is what makes editing the two independently safe.
 */

type Section = { id: string; title: string; body: string; note?: string };

type Version = {
  id: number;
  versionNumber: number;
  status: string;
  sections: Section[];
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

const SESSION_LABEL: Record<string, string> = {
  foundation_1: "Session 1 — Functional identity",
  foundation_2: "Session 2 — Credibility",
  foundation_3: "Session 3 — Signature story",
};

export function AnalysisPanel() {
  const { toast } = useToast();
  const [population, setPopulation] = useState("mid_career_or_senior");
  const [sessionType, setSessionType] = useState("foundation_1");
  const [draft, setDraft] = useState<Section[] | null>(null);
  const [changeNote, setChangeNote] = useState("");
  const [replayResult, setReplayResult] = useState<ReplayResult | null>(null);

  const { data, isLoading } = useQuery<{ published: Version | null; versions: Version[] }>({
    queryKey: [`/api/admin/methodology/${population}/${sessionType}`],
    queryFn: async () =>
      (await apiRequest("GET", `/api/admin/methodology/${population}/${sessionType}`)).json(),
  });

  // Falls back to the newest draft when nothing is published, so a seeded or
  // saved draft is reachable rather than showing an empty editor beside a
  // badge that says a draft exists.
  const seededDraft = data?.published
    ? null
    : (data?.versions?.find((v) => v.status === "draft") ?? null);

  const baseline = data?.published?.sections ?? seededDraft?.sections ?? [];

  useEffect(() => {
    setDraft(baseline);
    setReplayResult(null);
    setChangeNote("");
  }, [data, population, sessionType]);

  const replayMutation = useMutation({
    mutationFn: async () =>
      apiFetch("POST", `/api/admin/methodology/${population}/${sessionType}/replay`, {
        sections: draft,
        limit: 10,
      }),
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
      apiFetch("POST", `/api/admin/methodology/${population}/${sessionType}`, {
        sections: draft,
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
        queryKey: [`/api/admin/methodology/${population}/${sessionType}`],
      });
      setReplayResult(null);
      setChangeNote("");
      toast({
        title: `Published v${res.data.versionNumber}`,
        description: "Live for every future analysis of this population and session.",
      });
    },
  });

  const revertMutation = useMutation({
    mutationFn: async (versionId: number) =>
      apiFetch("POST", `/api/admin/methodology/revert/${versionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/admin/methodology/${population}/${sessionType}`],
      });
      toast({ title: "Reverted", description: "Republished as a new version." });
    },
  });

  const sections = draft ?? [];
  const dirty = JSON.stringify(sections) !== JSON.stringify(baseline);

  const update = (i: number, patch: Partial<Section>) =>
    setDraft(sections.map((s, n) => (n === i ? { ...s, ...patch } : s)));

  const move = (i: number, by: number) => {
    const to = i + by;
    if (to < 0 || to >= sections.length) return;
    const next = [...sections];
    [next[i], next[to]] = [next[to], next[i]];
    setDraft(next);
  };

  return (
    <div className="space-y-6">

        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertTitle>These reach students immediately</AlertTitle>
          <AlertDescription>
            A publish changes how every future session of this type is analysed. Numbers
            are applied when the prompt is built, so reordering or removing a section
            renumbers the rest automatically. <strong>Replay before publishing.</strong>
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
                {Object.entries(SESSION_LABEL).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
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
            <Card className="mb-6">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">
                    Sections
                    {data?.published && (
                      <Badge variant="outline" className="ml-2">
                        v{data.published.versionNumber} · live
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    Rendered in this order, numbered from 1.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDraft([
                      ...sections,
                      { id: `s${Date.now()}`, title: "", body: "" },
                    ])
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add section
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {!sections.length && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    Nothing published — the prompt file's own methodology is in use.
                  </p>
                )}

                {sections.map((s, i) => (
                  <div key={s.id} className="rounded-md border p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="w-6 text-sm text-muted-foreground">{i + 1})</span>
                      <Input
                        value={s.title}
                        placeholder="Section heading"
                        onChange={(e) => update(i, { title: e.target.value })}
                        className="font-medium"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                        title="Move up"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={i === sections.length - 1}
                        onClick={() => move(i, 1)}
                        title="Move down"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => setDraft(sections.filter((_, n) => n !== i))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    {/* Monospace and no wrapping-on-save: these bodies are nested
                        bullet lists, and the indentation is how the model reads
                        the hierarchy. */}
                    <Textarea
                      rows={Math.min(Math.max(s.body.split("\n").length, 3), 18)}
                      value={s.body}
                      placeholder="Section body — bullets and indentation are preserved verbatim"
                      onChange={(e) => update(i, { body: e.target.value })}
                      className="ml-8 w-[calc(100%-2rem)] font-mono text-xs"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            {(dirty || seededDraft) && (
              <Card className="mb-6 border-primary/40">
                <CardHeader>
                  <CardTitle className="text-base">
                    {dirty ? "Unpublished changes" : "Unpublished draft"}
                  </CardTitle>
                  <CardDescription>
                    Replay runs your draft methodology against sessions that already
                    finished, with the published criteria left alone — so any difference
                    is attributable to this edit.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button
                    variant="outline"
                    disabled={replayMutation.isPending || !sections.length}
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
                              <Info className="h-4 w-4" />
                              <AlertDescription>
                                Sessions that really did finish would not under this
                                methodology. Since the criteria are unchanged, the edit
                                itself made the analysis stricter.
                              </AlertDescription>
                            </Alert>
                          )}

                          <div className="space-y-1">
                            {replayResult.cases.map((c) => (
                              <div key={c.sessionId} className="flex items-start gap-2 text-xs">
                                <Badge
                                  variant="outline"
                                  className={
                                    c.verdict === "wouldNowFail"
                                      ? "border-destructive text-destructive"
                                      : ""
                                  }
                                >
                                  {c.verdict}
                                </Badge>
                                <span className="text-muted-foreground">
                                  {c.studentName}
                                  {c.isTestUser ? " (test)" : ""} · session {c.sessionId}
                                </span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label>What changed and why</Label>
                    <Textarea
                      rows={2}
                      value={changeNote}
                      placeholder="Shown in the version history"
                      onChange={(e) => setChangeNote(e.target.value)}
                    />
                  </div>

                  <Button
                    disabled={publishMutation.isPending || !sections.length}
                    onClick={() => publishMutation.mutate()}
                  >
                    {publishMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Publish
                  </Button>
                </CardContent>
              </Card>
            )}

            {!!data?.versions?.length && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">History</CardTitle>
                  <CardDescription>
                    Versions are retired, never edited — a session analysed months ago
                    stays explicable by the methodology that was live then.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.versions.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between rounded-md border p-2 text-sm"
                    >
                      <div>
                        <span className="font-medium">v{v.versionNumber}</span>{" "}
                        <Badge variant="outline" className="ml-1">{v.status}</Badge>
                        <span className="ml-2 text-muted-foreground">
                          {v.sections.length} sections ·{" "}
                          {new Date(v.createdAt).toLocaleDateString()}
                        </span>
                        {v.changeNote && (
                          <p className="mt-1 text-xs text-muted-foreground">{v.changeNote}</p>
                        )}
                      </div>
                      {v.status !== "published" && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={revertMutation.isPending}
                          onClick={() => revertMutation.mutate(v.id)}
                        >
                          Restore
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
