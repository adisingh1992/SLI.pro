import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, ArrowLeft, Play, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

/**
 * Classifier validation.
 *
 * Re-runs the classifier over hand-tagged turns and compares, writing nothing.
 * Two things this deliberately does NOT do:
 *
 *  - It does not run on page load. Each turn costs a Nano call, so it is a
 *    button, not a fetch.
 *  - It does not show the classifier the human's label. It is given the same
 *    provisional label the live capture path would have produced, so a high
 *    score means the classifier can actually do the job rather than that it
 *    can read the answer.
 */

type Validation = {
  evaluated: number;
  agreed: number;
  accuracy: number | null;
  unresolved: number;
  confusion: { expected: string; got: string; count: number; correct: boolean }[];
};

const LABEL: Record<string, string> = {
  human_elicited_response: "Elicited",
  human_spontaneous: "Spontaneous",
  human_correction: "Correction",
};

export function ValidatePanel() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [result, setResult] = useState<Validation | null>(null);

  const { data: coverage } = useQuery<{
    totalTurns: number;
    byStatus: Record<string, number>;
    handTaggedByType: Record<string, number>;
  }>({
    queryKey: ["/api/admin/tagging/coverage"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/tagging/coverage")).json(),
  });

  const runMutation = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", "/api/admin/tagging/validate", { limit: 200 })).json(),
    onSuccess: (data: Validation) => setResult(data),
    onError: (error: Error) =>
      toast({ title: "Validation failed", description: error.message, variant: "destructive" }),
  });

  const tagged = coverage?.byStatus?.hand_tagged ?? 0;
  const thin = tagged > 0 && tagged < 40;

  return (
    <div className="space-y-6">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/admin/tagging")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tagging
        </Button>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Corpus</CardTitle>
            <CardDescription>What is labelled, and by what.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {["provisional", "classified", "hand_tagged"].map((k) => (
                <div key={k}>
                  <p className="text-2xl font-semibold">{coverage?.byStatus?.[k] ?? 0}</p>
                  <p className="text-xs text-muted-foreground">{k.replace(/_/g, " ")}</p>
                </div>
              ))}
            </div>

            {coverage?.handTaggedByType && Object.keys(coverage.handTaggedByType).length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {Object.entries(coverage.handTaggedByType).map(([t, n]) => (
                  <Badge key={t} variant="outline">
                    {LABEL[t] ?? t}: {n}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {tagged === 0 ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Nothing to validate against yet</AlertTitle>
            <AlertDescription>
              Tag some turns first. Until there are human labels there is no ground
              truth, and no way to say whether the classifier is right.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {thin && (
              <Alert className="mb-4 border-warn/30 bg-warn-soft">
                <AlertTriangle className="h-4 w-4 text-warn" />
                <AlertTitle className="text-warn">Small sample</AlertTitle>
                <AlertDescription className="text-warn">
                  Only {tagged} tagged turns. An accuracy figure from this few is
                  noisy — treat it as a smoke test, not a measurement, and be
                  especially wary of the correction rate, which is the rarest type
                  and the one that matters most.
                </AlertDescription>
              </Alert>
            )}

            <Button
              className="mb-6"
              disabled={runMutation.isPending}
              onClick={() => runMutation.mutate()}
            >
              {runMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Run validation ({tagged} turns, one model call each)
            </Button>
          </>
        )}

        {result && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Result</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-2xl font-semibold">
                    {result.accuracy != null ? `${(result.accuracy * 100).toFixed(0)}%` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">agreement</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold">
                    {result.agreed}/{result.evaluated}
                  </p>
                  <p className="text-xs text-muted-foreground">turns matched</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold">{result.unresolved}</p>
                  <p className="text-xs text-muted-foreground">no verdict</p>
                </div>
              </div>

              {result.unresolved > 0 && (
                <p className="text-xs text-muted-foreground">
                  "No verdict" means the classifier's confidence was below the threshold
                  to change or confirm a label. Those turns stay as they are — a
                  deliberate abstention, not a failure.
                </p>
              )}

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Where it disagrees
                </p>
                {!result.confusion.length ? (
                  <p className="text-sm text-muted-foreground">No comparisons.</p>
                ) : (
                  <div className="space-y-1">
                    {result.confusion.map((c) => (
                      <div
                        key={`${c.expected}-${c.got}`}
                        className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                          c.correct ? "" : "border-warn/30 bg-warn-soft"
                        }`}
                      >
                        <span>
                          {c.correct ? (
                            <>Correctly called <strong>{LABEL[c.expected] ?? c.expected}</strong></>
                          ) : (
                            <>
                              You said <strong>{LABEL[c.expected] ?? c.expected}</strong>, it said{" "}
                              <strong>{LABEL[c.got] ?? c.got}</strong>
                            </>
                          )}
                        </span>
                        <Badge variant="outline">{c.count}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <p className="border-t pt-3 text-xs text-muted-foreground">
                Rows that miss <strong>correction</strong> matter most: that turn type
                drives <code>ai_adapted</code>, the correction path in scoring, and what
                grounds longitudinal memory. If corrections are being read as elicited
                responses, tighten the classifier's rules — the gold standard stays
                untouched, so you can re-run this and see whether it improved.
              </p>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
