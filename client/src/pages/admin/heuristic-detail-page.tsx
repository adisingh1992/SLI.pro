import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, ArrowLeft, History, Check, Archive, AlertTriangle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "./layout";
import { StatusBadge, type Heuristic } from "./methodology/heuristic";
import { ComponentField, COMPONENT_TYPES, COMPONENT_SPECS, type ComponentType } from "./heuristic-editor";
import { PageShell } from "@/components/admin/page";

type ComponentRow = {
  id: number;
  componentType: ComponentType;
  content: string;
  versionNumber: number;
  isCurrent: boolean;
  createdAt: string;
};

type Performance = {
  studentsScored: number;
  totalSessionsApplied: number;
  meanComposite: number | null;
  recentOutcomes: Record<string, number>;
};

/**
 * One card: edit its components, see their history, and read the evidence.
 *
 * Revising a component writes a NEW version rather than overwriting, so the
 * page shows the version number and keeps the history visible. That is not
 * incidental — every application log points at the exact component text the
 * student received, and overwriting would silently rewrite the past.
 */
export default function AdminHeuristicDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirmRetire, setConfirmRetire] = useState(false);

  const { data: card, isLoading } = useQuery<Heuristic & { components: ComponentRow[] }>({
    queryKey: [`/api/admin/methodology/cards/${id}`],
    queryFn: async () => (await apiRequest("GET", `/api/admin/methodology/cards/${id}`)).json(),
  });

  const { data: performance } = useQuery<Performance>({
    queryKey: [`/api/admin/methodology/cards/${id}/performance`],
    queryFn: async () =>
      (await apiRequest("GET", `/api/admin/methodology/cards/${id}/performance`)).json(),
  });

  const reviseMutation = useMutation({
    mutationFn: async ({ type, content }: { type: ComponentType; content: string }) => {
      const res = await apiRequest(
        "PUT",
        `/api/admin/methodology/cards/${id}/components/${type}`,
        { content },
      );
      return res.json();
    },
    onSuccess: (revised: ComponentRow, { type }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/methodology/cards/${id}`] });
      setDrafts((d) => {
        const next = { ...d };
        delete next[type];
        return next;
      });
      toast({
        title: `${COMPONENT_SPECS[type].label} saved as v${revised.versionNumber}`,
        description: "The previous version is kept, so past sessions still resolve correctly.",
      });
    },
    onError: (error: Error) =>
      toast({ title: "Could not save", description: error.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async (status: string) => {
      const res = await apiRequest("PATCH", `/api/admin/methodology/cards/${id}/status`, { status });
      return res.json();
    },
    onSuccess: (updated: Heuristic) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/methodology/cards/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/heuristics"] });
      setConfirmRetire(false);
      toast({
        title: `Card is now ${updated.status}`,
        description:
          updated.status === "retired"
            ? "It has stopped firing everywhere, immediately."
            : undefined,
      });
    },
    onError: (error: Error) =>
      toast({ title: "Could not change status", description: error.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  if (!card) {
    return (
      <AdminLayout>
        <PageShell width="prose">
          <p className="text-muted-foreground">Card not found.</p>
        </PageShell>
      </AdminLayout>
    );
  }

  const current = (card.components ?? []).filter((c) => c.isCurrent);
  const currentFor = (type: ComponentType) => current.find((c) => c.componentType === type);
  const historyFor = (type: ComponentType) =>
    (card.components ?? [])
      .filter((c) => c.componentType === type && !c.isCurrent)
      .sort((a, b) => b.versionNumber - a.versionNumber);

  const valueFor = (type: ComponentType) =>
    drafts[type] ?? currentFor(type)?.content ?? "";
  const isDirty = (type: ComponentType) =>
    drafts[type] !== undefined && drafts[type] !== (currentFor(type)?.content ?? "");

  const enoughEvidence =
    (performance?.totalSessionsApplied ?? 0) >= 10 && (performance?.meanComposite ?? 0) > 0;

  return (
    <AdminLayout>
      <PageShell width="prose">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/admin/methodology/cards")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Methodology
        </Button>

        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{card.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{card.description}</p>
          </div>
          <StatusBadge status={card.status} />
        </div>

        {card.status === "candidate" && (
          <Alert className="mb-6 border-warn/30 bg-warn-soft">
            <AlertTriangle className="h-4 w-4 text-warn" />
            <AlertTitle className="text-warn">This card is a candidate</AlertTitle>
            <AlertDescription className="text-warn">
              If it is in an active sequence it is reaching students right now. Candidate
              means "not yet backed by evidence", not "not live".
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="components">
          <TabsList className="mb-4">
            <TabsTrigger value="components">Components</TabsTrigger>
            <TabsTrigger value="evidence">Evidence</TabsTrigger>
          </TabsList>

          <TabsContent value="components" className="space-y-6">
            {COMPONENT_TYPES.map((type) => {
              const existing = currentFor(type);
              const history = historyFor(type);
              return (
                <Card key={type}>
                  <CardContent className="space-y-3 pt-6">
                    <ComponentField
                      type={type}
                      value={valueFor(type)}
                      onChange={(v) => setDrafts((d) => ({ ...d, [type]: v }))}
                      rows={3}
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {existing ? `Version ${existing.versionNumber}` : "Not written yet"}
                        {history.length > 0 && ` · ${history.length} earlier version${history.length === 1 ? "" : "s"}`}
                      </p>
                      <Button
                        size="sm"
                        disabled={!isDirty(type) || reviseMutation.isPending}
                        onClick={() =>
                          reviseMutation.mutate({ type, content: drafts[type] ?? "" })
                        }
                      >
                        {reviseMutation.isPending && reviseMutation.variables?.type === type && (
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        )}
                        Save new version
                      </Button>
                    </div>

                    {history.length > 0 && (
                      <details className="rounded-md border bg-muted/30 p-2">
                        <summary className="cursor-pointer text-xs text-muted-foreground">
                          <History className="mr-1 inline h-3 w-3" />
                          Version history
                        </summary>
                        <div className="mt-2 space-y-2">
                          {history.map((h) => (
                            <div key={h.id} className="border-l-2 pl-2 text-xs">
                              <p className="text-muted-foreground">
                                v{h.versionNumber} · {new Date(h.createdAt).toLocaleDateString()}
                              </p>
                              <p className="mt-0.5 whitespace-pre-wrap">{h.content}</p>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="evidence">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Performance</CardTitle>
                <CardDescription>
                  The evidence behind promoting this card, or retiring it.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-2xl font-semibold">
                      {performance?.totalSessionsApplied ?? 0}
                    </p>
                    <p className="text-xs text-muted-foreground">sessions applied</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold">{performance?.studentsScored ?? 0}</p>
                    <p className="text-xs text-muted-foreground">students</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold">
                      {performance?.meanComposite != null
                        ? performance.meanComposite.toFixed(2)
                        : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">mean composite</p>
                  </div>
                </div>

                {performance && Object.keys(performance.recentOutcomes).length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Recent outcomes
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(performance.recentOutcomes).map(([outcome, count]) => (
                        <Badge key={outcome} variant="outline">
                          {outcome}: {count}
                        </Badge>
                      ))}
                    </div>
                    {performance.recentOutcomes.correction > 0 && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Corrections mean students pushed back on this card's framing. Those
                        turns are the most valuable data in the corpus, so a correction counts
                        only −0.5 rather than as a failure. Many corrections usually means the
                        framing is too narrow, not that the pattern is wrong.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-2 border-t pt-4">
                  {card.status !== "validated" && (
                    <Button
                      variant="outline"
                      disabled={statusMutation.isPending}
                      onClick={() => statusMutation.mutate("validated")}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Promote to validated
                    </Button>
                  )}
                  {card.status !== "retired" && (
                    <Button
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setConfirmRetire(true)}
                    >
                      <Archive className="mr-2 h-4 w-4" />
                      Retire
                    </Button>
                  )}
                  {card.status === "retired" && (
                    <Button
                      variant="outline"
                      disabled={statusMutation.isPending}
                      onClick={() => statusMutation.mutate("candidate")}
                    >
                      Reinstate as candidate
                    </Button>
                  )}
                </div>

                {card.status === "candidate" && !enoughEvidence && (
                  <p className="text-xs text-muted-foreground">
                    Promotion is your judgement, not a threshold the system enforces — but
                    this card has little evidence behind it so far.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <AlertDialog open={confirmRetire} onOpenChange={setConfirmRetire}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Retire this card?</AlertDialogTitle>
              <AlertDialogDescription>
                It stops firing <strong>immediately and everywhere</strong>, including in
                sequences that still list it — this is the emergency brake, and it is not
                gated by the evaluation window.
                <br />
                <br />
                The card is not deleted. It stays as a permanent record so past sessions
                remain interpretable, and you can reinstate it later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => statusMutation.mutate("retired")}>
                Retire card
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageShell>
    </AdminLayout>
  );
}
