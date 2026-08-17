import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Loader2, ArrowLeft, ArrowUp, ArrowDown, Plus, X, Lock, Unlock, AlertTriangle,
} from "lucide-react";
import { apiRequest, apiFetch, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge, type Heuristic } from "./heuristic";

/**
 * Sequence editor — which cards are live for a cohort, in what order.
 *
 * The evaluation-window state is shown prominently because it governs whether
 * publishing is even allowed. Spec §2: methodology evolves between cycles, not
 * during them, so no active student is affected by a mid-cycle change.
 *
 * The override path exists but is deliberately awkward: it requires a written
 * reason and it is logged. For an urgent problem, retiring the single card is
 * both faster and safer, and the UI says so.
 */

type Cycle = {
  id: number;
  label: string | null;
  cycleYear: number;
  status: string;
  institutionName: string;
  activeSequenceId: number | null;
  evaluationWindowStart: string | null;
  evaluationWindowEnd: string | null;
  evaluationWindow: { open: boolean; reason: string };
};

type SequenceCard = {
  heuristicId: number;
  name: string;
  status: Heuristic["status"];
  position: number;
  weight: number;
};

type Entry = { heuristicId: number; name: string; status: Heuristic["status"]; weight: number };

export function SequencesPanel() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [cycleId, setCycleId] = useState<string>("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const { data: cycles, isLoading: cyclesLoading } = useQuery<Cycle[]>({
    queryKey: ["/api/admin/cycles"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/cycles")).json(),
  });

  useEffect(() => {
    if (!cycleId && cycles?.length) setCycleId(String(cycles[0].id));
  }, [cycles, cycleId]);

  const cycle = cycles?.find((c) => String(c.id) === cycleId);

  const { data: sequence, isLoading: sequenceLoading } = useQuery<{
    sequenceId: number | null;
    cards: SequenceCard[];
  }>({
    queryKey: [`/api/admin/cycles/${cycleId}/sequence`],
    queryFn: async () => (await apiRequest("GET", `/api/admin/cycles/${cycleId}/sequence`)).json(),
    enabled: !!cycleId,
  });

  /*
   * Sequences built for this cycle and never published.
   *
   * This screen only ever showed the ACTIVE sequence, so a cycle whose pointer
   * names an empty sequence read as "no methodology exists" when in fact a full
   * one had been built by `wing:build-sequences` and simply never switched on.
   * The empty state now says so and points at the screen that can publish it.
   */
  const { data: history } = useQuery<{
    activeSequenceId: number | null;
    sequences: Array<{ id: number; versionNumber: number; entryCount: number; isActive: boolean }>;
  }>({
    queryKey: [`/api/admin/cycles/${cycleId}/sequence/history`],
    queryFn: async () =>
      (await apiRequest("GET", `/api/admin/cycles/${cycleId}/sequence/history`)).json(),
    enabled: !!cycleId,
  });

  const unpublishedBuilds = (history?.sequences ?? []).filter(
    (sq) => !sq.isActive && sq.entryCount > 0,
  );

  const { data: allCards } = useQuery<Heuristic[]>({
    queryKey: ["/api/admin/heuristics", false],
    queryFn: async () => (await apiRequest("GET", "/api/admin/heuristics")).json(),
  });

  // Reset the working copy whenever the loaded sequence changes.
  useEffect(() => {
    if (sequence?.cards) {
      setEntries(
        sequence.cards.map((c) => ({
          heuristicId: c.heuristicId,
          name: c.name,
          status: c.status,
          weight: c.weight,
        })),
      );
      setDirty(false);
    }
  }, [sequence]);

  const publishMutation = useMutation({
    // apiFetch, not apiRequest: apiRequest throws a bare Error on non-2xx,
    // which loses the status code AND the body. This handler needs both — a
    // 409 opens the override dialog, and the body carries `remedy` and
    // `warnings` that are the most useful part of the response.
    mutationFn: async ({ force, reason }: { force?: boolean; reason?: string }) =>
      apiFetch("PUT", `/api/admin/cycles/${cycleId}/sequence`, {
        entries: entries.map((e) => ({ heuristicId: e.heuristicId, weight: e.weight })),
        ...(force ? { force: true, reason } : {}),
      }),

    onSuccess: (res) => {
      // The evaluation-window gate. Not an error — it is a decision point, so
      // it opens the override dialog rather than showing a dead-end toast.
      if (res.status === 409) {
        setOverrideOpen(true);
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

      queryClient.invalidateQueries({ queryKey: [`/api/admin/cycles/${cycleId}/sequence`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cycles"] });
      setDirty(false);
      setOverrideOpen(false);
      setOverrideReason("");

      const warnings: string[] = res.data?.warnings ?? [];
      toast({
        title: "Sequence published",
        description: warnings.length
          ? warnings.join(" ")
          : "The previous version is kept and remains queryable.",
        variant: warnings.length ? "destructive" : undefined,
      });
    },

    onError: (error: Error) => {
      // Only reached on a network-level failure now.
      toast({
        title: "Could not reach the server",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const move = (index: number, delta: number) => {
    const next = [...entries];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setEntries(next);
    setDirty(true);
  };

  const remove = (heuristicId: number) => {
    setEntries((e) => e.filter((x) => x.heuristicId !== heuristicId));
    setDirty(true);
  };

  const add = (card: Heuristic) => {
    setEntries((e) => [
      ...e,
      { heuristicId: card.id, name: card.name, status: card.status, weight: 1.0 },
    ]);
    setDirty(true);
    setAdding(false);
  };

  const setWeight = (heuristicId: number, weight: number) => {
    setEntries((e) => e.map((x) => (x.heuristicId === heuristicId ? { ...x, weight } : x)));
    setDirty(true);
  };

  const available = (allCards ?? []).filter(
    (c) => c.status !== "retired" && !entries.some((e) => e.heuristicId === c.id),
  );

  const windowOpen = cycle?.evaluationWindow.open ?? false;

  return (
    <div className="space-y-6">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/admin/methodology/cards")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Methodology
        </Button>

        {cyclesLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !cycles?.length ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No cycles exist yet.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mb-4 space-y-1.5">
              <Label>Cycle</Label>
              <Select value={cycleId} onValueChange={setCycleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a cycle" />
                </SelectTrigger>
                <SelectContent>
                  {cycles.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.institutionName} — {c.label ?? c.cycleYear} ({c.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {cycle && (
              <Alert className={`mb-6 ${windowOpen ? "border-good/30 bg-good-soft" : "border-border"}`}>
                {windowOpen ? (
                  <Unlock className="h-4 w-4 text-good" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                <AlertTitle className={windowOpen ? "text-good" : ""}>
                  {windowOpen ? "Evaluation window is open" : "Evaluation window is closed"}
                </AlertTitle>
                <AlertDescription className={windowOpen ? "text-good" : ""}>
                  {cycle.evaluationWindow.reason}.{" "}
                  {windowOpen
                    ? "Sequence changes can be published now."
                    : "Publishing is blocked so no student is affected mid-cycle. To stop a single card immediately, retire it from its card page instead."}
                </AlertDescription>
              </Alert>
            )}

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">Active sequence</CardTitle>
                  <CardDescription>
                    {sequence?.sequenceId
                      ? `Sequence #${sequence.sequenceId} · order sets priority, weight breaks ties`
                      : "No sequence published for this cycle yet"}
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add card
                </Button>
              </CardHeader>
              <CardContent>
                {sequenceLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : !entries.length ? (
                  <div className="space-y-3 py-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      No cards in this sequence. Wing coaches normally until one is added.
                    </p>
                    {!!unpublishedBuilds.length && (
                      <p className="text-sm text-muted-foreground">
                        {unpublishedBuilds.length === 1
                          ? "One sequence has been built for this cycle and never published"
                          : `${unpublishedBuilds.length} sequences have been built for this cycle and never published`}
                        {" "}
                        (version {unpublishedBuilds[0].versionNumber} carries{" "}
                        {unpublishedBuilds[0].entryCount} cards).{" "}
                        <button
                          type="button"
                          className="font-medium text-brand underline"
                          onClick={() => navigate("/admin/methodology/integrity")}
                        >
                          Review and publish one
                        </button>{" "}
                        rather than rebuilding it by hand here.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {entries.map((entry, i) => (
                      <div
                        key={entry.heuristicId}
                        className="flex items-center gap-3 rounded-md border p-3"
                      >
                        <span className="w-6 text-sm text-muted-foreground">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{entry.name}</p>
                        </div>
                        <StatusBadge status={entry.status} />
                        <div className="flex items-center gap-1">
                          <Label className="text-xs text-muted-foreground">weight</Label>
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            className="h-8 w-20"
                            value={entry.weight}
                            onChange={(e) => setWeight(entry.heuristicId, Number(e.target.value))}
                          />
                        </div>
                        <div className="flex">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(i, -1)} disabled={i === 0}>
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(i, 1)} disabled={i === entries.length - 1}>
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(entry.heuristicId)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {dirty && (
                  <div className="mt-4 flex items-center justify-between border-t pt-4">
                    <p className="text-xs text-muted-foreground">
                      Publishing creates a new version. The current one is superseded, not deleted.
                    </p>
                    <Button
                      disabled={publishMutation.isPending || !entries.length}
                      onClick={() => publishMutation.mutate({})}
                    >
                      {publishMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Publish sequence
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Add-card picker */}
        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogContent className="max-h-[70vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add a card to the sequence</DialogTitle>
              <DialogDescription>
                Adding a card is what authorises it to reach students — including candidates.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {!available.length ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Every available card is already in this sequence.
                </p>
              ) : (
                available.map((card) => (
                  <button
                    key={card.id}
                    className="flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left hover:bg-accent/40"
                    onClick={() => add(card)}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{card.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{card.description}</p>
                    </div>
                    <StatusBadge status={card.status} />
                  </button>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Mid-cycle override */}
        <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Publishing outside the evaluation window</DialogTitle>
              <DialogDescription>
                This cycle has active students partway through the methodology.
              </DialogDescription>
            </DialogHeader>

            <Alert className="border-warn/30 bg-warn-soft">
              <AlertTriangle className="h-4 w-4 text-warn" />
              <AlertDescription className="text-warn">
                Changing the sequence now changes the methodology under students mid-cycle,
                which makes cohort-to-cohort comparison unreliable.
                <br />
                <br />
                If one card is causing a problem, <strong>retire that card</strong> instead —
                it takes effect immediately, is not gated, and does not disturb the rest of
                the sequence.
              </AlertDescription>
            </Alert>

            <div className="space-y-1.5">
              <Label htmlFor="override-reason">Reason for the override</Label>
              <Textarea
                id="override-reason"
                rows={3}
                value={overrideReason}
                placeholder="Why this cannot wait for the evaluation window."
                onChange={(e) => setOverrideReason(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Recorded in the audit log with your name. At least 10 characters.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOverrideOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={overrideReason.trim().length < 10 || publishMutation.isPending}
                onClick={() => publishMutation.mutate({ force: true, reason: overrideReason.trim() })}
              >
                {publishMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Publish anyway
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
}
