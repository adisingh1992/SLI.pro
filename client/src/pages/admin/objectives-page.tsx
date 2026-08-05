import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch, apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "./layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ArrowDown, ArrowUp, BarChart3, Info, Loader2, X } from "lucide-react";

/**
 * Objective set editor.
 *
 * An objective is a beat the session is trying to reach. The beat, its purpose
 * and the artifact fields it produces are shared across populations; the
 * content — how to pursue it, what evidence counts, which cards are available
 * — is written per population.
 *
 * That split is not a preference. Modelling Session 1 measured 0% shared
 * content across the three populations: the original design assumed populations
 * were variations on a common base, and they are not. What IS shared is the
 * structure, and shared keys are what make satisfaction rates comparable.
 *
 * NO REPLAY BUTTON, DELIBERATELY. Criteria and methodology can be replayed
 * against finished transcripts. Objectives cannot — change one and the
 * conversation changes, so there is no history to re-run. Validation plus the
 * per-objective satisfaction rates are the honest substitute.
 */

type Content = {
  intent: string;
  entryCondition: string;
  evidenceRequired: string;
  interventions: string[];
  note?: string;
};

type Objective = {
  key: string;
  purpose: string;
  artifactContribution: string[];
  content: Record<string, Content | null>;
};

type Version = {
  id: number;
  versionNumber: number;
  status: string;
  objectives: Objective[];
  changeNote: string | null;
  createdAt: string;
};

type Issue = { objectiveKey: string | null; message: string };

const POPULATIONS = [
  "undergraduate_or_recent_grad",
  "early_career",
  "mid_career_or_senior",
] as const;

const SHORT: Record<string, string> = {
  undergraduate_or_recent_grad: "Undergrad",
  early_career: "Early career",
  mid_career_or_senior: "Mid-career",
};

const SESSION_LABEL: Record<string, string> = {
  foundation_1: "Session 1 — Functional identity",
  foundation_2: "Session 2 — Credibility",
  foundation_3: "Session 3 — Signature story",
  enhancement_a: "Module A — LinkedIn",
  enhancement_b: "Module B — Network",
  enhancement_c: "Module C — Alignment",
};

const emptyContent = (): Content => ({
  intent: "",
  entryCondition: "",
  evidenceRequired: "",
  interventions: [],
});

export default function AdminObjectivesPage() {
  const { toast } = useToast();
  const [sessionType, setSessionType] = useState("foundation_1");
  const [draft, setDraft] = useState<Objective[] | null>(null);
  const [changeNote, setChangeNote] = useState("");
  const [issues, setIssues] = useState<Issue[]>([]);

  const { data, isLoading } = useQuery<{ published: Version | null; versions: Version[] }>({
    queryKey: [`/api/admin/objectives/${sessionType}`],
    queryFn: async () =>
      (await apiRequest("GET", `/api/admin/objectives/${sessionType}`)).json(),
  });

  const { data: stats } = useQuery<{
    sessionsWithObjectiveData: { population: string | null; total: number }[];
    satisfiedByObjective: { population: string | null; objectiveKey: string; satisfiedSessions: number }[];
  }>({
    queryKey: [`/api/admin/objectives/${sessionType}/stats`],
    queryFn: async () =>
      (await apiRequest("GET", `/api/admin/objectives/${sessionType}/stats`)).json(),
  });

  const baseline = data?.published?.objectives ?? [];

  useEffect(() => {
    setDraft(baseline);
    setChangeNote("");
    setIssues([]);
  }, [data, sessionType]);

  const objectives = draft ?? [];
  const dirty = JSON.stringify(objectives) !== JSON.stringify(baseline);

  const validate = useMutation({
    mutationFn: async () =>
      apiFetch("POST", `/api/admin/objectives/${sessionType}/validate`, { objectives }),
    onSuccess: (res) => {
      if (res.ok) setIssues(res.data.issues ?? []);
    },
  });

  const publish = useMutation({
    mutationFn: async () =>
      apiFetch("POST", `/api/admin/objectives/${sessionType}`, {
        objectives,
        changeNote: changeNote.trim() || null,
      }),
    onSuccess: (res) => {
      if (!res.ok) {
        setIssues(res.data?.issues ?? []);
        toast({
          title: res.data?.error ?? "Could not publish",
          description: res.data?.detail,
          variant: "destructive",
        });
        return;
      }
      queryClient.invalidateQueries({ queryKey: [`/api/admin/objectives/${sessionType}`] });
      setChangeNote("");
      toast({ title: `Published v${res.data.versionNumber}` });
    },
  });

  const update = (i: number, patch: Partial<Objective>) =>
    setDraft(objectives.map((o, n) => (n === i ? { ...o, ...patch } : o)));

  const updateContent = (i: number, pop: string, patch: Partial<Content> | null) =>
    setDraft(
      objectives.map((o, n) =>
        n === i
          ? {
              ...o,
              content: {
                ...o.content,
                [pop]: patch === null ? null : { ...(o.content[pop] ?? emptyContent()), ...patch },
              },
            }
          : o,
      ),
    );

  const move = (i: number, by: number) => {
    const to = i + by;
    if (to < 0 || to >= objectives.length) return;
    const next = [...objectives];
    [next[i], next[to]] = [next[to], next[i]];
    setDraft(next);
  };

  const satisfiedFor = (key: string, pop: string) =>
    stats?.satisfiedByObjective.find(
      (s) => s.objectiveKey === key && (s.population ?? "mid_career_or_senior") === pop,
    )?.satisfiedSessions ?? 0;

  const totalFor = (pop: string) =>
    stats?.sessionsWithObjectiveData.find(
      (s) => (s.population ?? "mid_career_or_senior") === pop,
    )?.total ?? 0;

  return (
    <AdminLayout>
      <div className="container mx-auto max-w-6xl p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Session objectives</h1>
          <p className="text-sm text-muted-foreground">
            The beats a session is trying to reach, in order. Structure is shared across
            populations; the content of each beat is written per population.
          </p>
        </div>

        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertTitle>There is no replay for objectives</AlertTitle>
          <AlertDescription>
            Completion criteria can be replayed against finished sessions. Objectives cannot —
            change one and the conversation changes, so there is no history to re-run against.
            What you get instead is validation before publishing, and the satisfaction rates
            below once sessions have run.
          </AlertDescription>
        </Alert>

        <div className="mb-6 max-w-sm space-y-1.5">
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

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !objectives.length ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">No objective set published</CardTitle>
              <CardDescription>
                This session still runs from its prompt file. Seed one with{" "}
                <code className="text-xs">npm run wing:seed-objectives</code>.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            {issues.length > 0 && (
              <Alert className="mb-6 border-destructive/40">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{issues.length} issue(s) block publishing</AlertTitle>
                <AlertDescription>
                  <ul className="mt-1 list-disc pl-4 text-xs">
                    {issues.map((i, n) => (
                      <li key={n}>
                        <strong>{i.objectiveKey ?? "set"}</strong>: {i.message}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {objectives.map((o, i) => (
              <Card key={o.key} className="mb-4">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">{i + 1}.</span>
                        <Input
                          value={o.key}
                          onChange={(e) => update(i, { key: e.target.value })}
                          className="max-w-xs font-mono text-xs"
                        />
                        <span className="text-xs text-muted-foreground">
                          → {o.artifactContribution.join(", ") || "no artifact fields"}
                        </span>
                      </div>
                      <Textarea
                        rows={2}
                        value={o.purpose}
                        placeholder="Purpose — what this beat is for, population-independent"
                        onChange={(e) => update(i, { purpose: e.target.value })}
                        className="text-sm"
                      />
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" disabled={i === 0} onClick={() => move(i, -1)}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={i === objectives.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => setDraft(objectives.filter((_, n) => n !== i))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    {POPULATIONS.map((pop) => {
                      const c = o.content[pop];
                      const total = totalFor(pop);
                      const sat = satisfiedFor(o.key, pop);
                      return (
                        <div key={pop} className="rounded-md border p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-medium">{SHORT[pop]}</span>
                            {c === null || c === undefined ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={() => updateContent(i, pop, emptyContent())}
                              >
                                Add
                              </Button>
                            ) : (
                              <div className="flex items-center gap-2">
                                {/* Raw counts, not percentages: 1-of-1 should not
                                    read as 100% confidence in anything. */}
                                {total > 0 && (
                                  <span className="text-[11px] text-muted-foreground">
                                    <BarChart3 className="mr-1 inline h-3 w-3" />
                                    {sat}/{total}
                                  </span>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-xs text-muted-foreground"
                                  onClick={() => updateContent(i, pop, null)}
                                  title="Mark as not applicable to this population"
                                >
                                  n/a
                                </Button>
                              </div>
                            )}
                          </div>

                          {c === null || c === undefined ? (
                            <p className="py-3 text-center text-xs text-muted-foreground">
                              Does not apply
                            </p>
                          ) : (
                            <div className="space-y-2">
                              <Textarea
                                rows={2}
                                value={c.intent}
                                placeholder="Intent — how Wing pursues this here"
                                onChange={(e) => updateContent(i, pop, { intent: e.target.value })}
                                className="text-xs"
                              />
                              <Textarea
                                rows={2}
                                value={c.evidenceRequired}
                                placeholder="Evidence — what must appear in the transcript"
                                onChange={(e) =>
                                  updateContent(i, pop, { evidenceRequired: e.target.value })
                                }
                                className="text-xs"
                              />
                              <Input
                                value={c.interventions.join(", ")}
                                placeholder="card codes, comma separated"
                                onChange={(e) =>
                                  updateContent(i, pop, {
                                    interventions: e.target.value
                                      .split(",")
                                      .map((s) => s.trim())
                                      .filter(Boolean),
                                  })
                                }
                                className="font-mono text-[11px]"
                              />
                              {c.note && (
                                <p className="text-[11px] text-muted-foreground">{c.note}</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}

            {dirty && (
              <Card className="mb-6 border-primary/40">
                <CardHeader>
                  <CardTitle className="text-base">Unpublished changes</CardTitle>
                  <CardDescription>
                    Validation is a hard gate — publishing is refused while issues remain.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => validate.mutate()}>
                      {validate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Validate
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    <Label>What changed and why</Label>
                    <Textarea
                      rows={2}
                      value={changeNote}
                      onChange={(e) => setChangeNote(e.target.value)}
                    />
                  </div>
                  <Button disabled={publish.isPending} onClick={() => publish.mutate()}>
                    {publish.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Publish
                  </Button>
                </CardContent>
              </Card>
            )}

            {!!data?.versions?.length && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">History</CardTitle>
                  <CardDescription>Retired, never edited.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.versions.map((v) => (
                    <div key={v.id} className="rounded-md border p-2 text-sm">
                      <span className="font-medium">v{v.versionNumber}</span>{" "}
                      <Badge variant="outline" className="ml-1">{v.status}</Badge>
                      <span className="ml-2 text-muted-foreground">
                        {v.objectives.length} objectives ·{" "}
                        {new Date(v.createdAt).toLocaleDateString()}
                      </span>
                      {v.changeNote && (
                        <p className="mt-1 text-xs text-muted-foreground">{v.changeNote}</p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
