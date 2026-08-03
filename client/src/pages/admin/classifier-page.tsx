import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, ArrowLeft, Upload, AlertTriangle, Info } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "./layout";

/**
 * Classifier prompt — where tagging becomes improvement.
 *
 * Publishing turns hand-labelled turns into worked examples that every future
 * classification sees, for every student, with no deploy. The page is explicit
 * about the train/holdout split because that split is what makes the accuracy
 * figure on the validation page mean anything.
 */

type Preview = {
  taggedTotal: number;
  trainCount: number;
  holdoutCount: number;
  holdoutByType: Record<string, number>;
  examples: {
    turnId: number;
    turnType: string;
    precedingContent: string | null;
    content: string;
  }[];
  rendered: string;
};

type CurrentPrompt = {
  id: number;
  name: string;
  versionNumber: number;
  status: string;
  components: { componentType: string; content: any }[];
} | null;

const LABEL: Record<string, string> = {
  human_elicited_response: "Elicited",
  human_spontaneous: "Spontaneous",
  human_correction: "Correction",
};

export default function AdminClassifierPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [rules, setRules] = useState("");
  const [cycleId, setCycleId] = useState<string>("");

  const { data: preview, isLoading } = useQuery<Preview>({
    queryKey: ["/api/admin/classifier/preview"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/classifier/preview")).json(),
  });

  const { data: current } = useQuery<CurrentPrompt>({
    queryKey: ["/api/admin/classifier/prompt"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/classifier/prompt")).json(),
  });

  const { data: defaults } = useQuery<{ rules: string }>({
    queryKey: ["/api/admin/classifier/default-rules"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/classifier/default-rules")).json(),
  });

  const { data: cycles } = useQuery<any[]>({
    queryKey: ["/api/admin/cycles"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/cycles")).json(),
  });

  // Start from whatever is actually running: the published rules if there are
  // any, otherwise the built-in defaults. Never a blank box — editing live
  // behaviour from an empty field invites accidentally deleting it.
  useEffect(() => {
    if (rules) return;
    const published = current?.components?.find((c) => c.componentType === "rules")?.content;
    if (typeof published === "string") setRules(published);
    else if (defaults?.rules) setRules(defaults.rules);
  }, [current, defaults, rules]);

  useEffect(() => {
    if (!cycleId && cycles?.length) setCycleId(String(cycles[0].id));
  }, [cycles, cycleId]);

  const publishMutation = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("POST", "/api/admin/classifier/publish", {
          rules,
          cycleId: cycleId ? Number(cycleId) : null,
        })
      ).json(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/classifier/prompt"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/classifier/preview"] });
      toast({
        title: `Classifier prompt v${result.versionNumber} published`,
        description: `${result.exampleCount} examples from ${result.trainCount} turns. ${result.holdoutCount} held back to measure it.`,
      });
    },
    onError: (error: Error) =>
      toast({ title: "Could not publish", description: error.message, variant: "destructive" }),
  });

  const noExamples = (preview?.examples.length ?? 0) === 0;

  return (
    <AdminLayout>
      <div className="container mx-auto max-w-3xl p-6">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/admin/tagging")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tagging
        </Button>

        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Classifier prompt</h1>
          <p className="text-sm text-muted-foreground">
            Turn hand-tagged examples into how Wing reads every future conversation.
          </p>
        </div>

        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertTitle>How the split works</AlertTitle>
          <AlertDescription>
            Tagged turns are divided per type: most become <strong>worked examples</strong>{" "}
            in the prompt, and one in three is <strong>held back</strong> to test against.
            The classifier never sees the held-back turns, so the accuracy figure on the
            validation page measures real performance rather than recall of its own
            examples.
          </AlertDescription>
        </Alert>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">
                  Currently live
                  {current && (
                    <Badge className="ml-2" variant="outline">
                      v{current.versionNumber}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {current
                    ? `${current.name} — published`
                    : "No published prompt. The classifier is using the built-in rules with no examples."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-2xl font-semibold">{preview?.taggedTotal ?? 0}</p>
                    <p className="text-xs text-muted-foreground">turns tagged</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold">{preview?.examples.length ?? 0}</p>
                    <p className="text-xs text-muted-foreground">would become examples</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold">{preview?.holdoutCount ?? 0}</p>
                    <p className="text-xs text-muted-foreground">held back to test</p>
                  </div>
                </div>

                {preview && Object.keys(preview.holdoutByType).length > 0 && (
                  <div className="mt-4">
                    <p className="mb-1 text-xs text-muted-foreground">Held back, by type:</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(preview.holdoutByType).map(([t, n]) => (
                        <Badge key={t} variant="outline">
                          {LABEL[t] ?? t}: {n}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {noExamples && (
              <Alert className="mb-6 border-amber-300 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-700" />
                <AlertTitle className="text-amber-900">No examples yet</AlertTitle>
                <AlertDescription className="text-amber-900">
                  Publishing now would ship rules with no worked examples — which is what
                  the classifier already does by default. Tag some turns first;
                  corrections matter most, since that is the class it finds hardest.
                </AlertDescription>
              </Alert>
            )}

            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">Rules</CardTitle>
                <CardDescription>
                  How the classifier is told to decide. Examples are appended automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  rows={16}
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                  className="font-mono text-xs"
                />

                <div className="space-y-1.5">
                  <Label htmlFor="cycle">Apply to cycle</Label>
                  <select
                    id="cycle"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={cycleId}
                    onChange={(e) => setCycleId(e.target.value)}
                  >
                    <option value="">Publish without assigning to a cycle</option>
                    {(cycles ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.institutionName} — {c.label ?? c.cycleYear}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    A prompt only reaches students once a cycle points at it.
                  </p>
                </div>

                <div className="flex items-center justify-between border-t pt-3">
                  <p className="text-xs text-muted-foreground">
                    Publishing retires the current version rather than editing it, so past
                    classifications stay explicable.
                  </p>
                  <Button
                    disabled={publishMutation.isPending || rules.trim().length < 50}
                    onClick={() => publishMutation.mutate()}
                  >
                    {publishMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-4 w-4" />
                    )}
                    Publish
                  </Button>
                </div>
              </CardContent>
            </Card>

            {preview && preview.examples.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Examples that would be included ({preview.examples.length})
                  </CardTitle>
                  <CardDescription>
                    Balanced across types rather than proportional — the natural mix is
                    almost all elicited responses, which would teach the model nothing
                    about the rarer types.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {preview.examples.map((e) => (
                      <div key={e.turnId} className="rounded-md border p-3 text-sm">
                        <Badge variant="outline" className="mb-2">
                          {LABEL[e.turnType] ?? e.turnType}
                        </Badge>
                        {e.precedingContent && (
                          <p className="mb-1 text-xs text-muted-foreground">
                            Coach: {e.precedingContent}
                          </p>
                        )}
                        <p>{e.content}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
