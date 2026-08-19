import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Upload, AlertTriangle, PowerOff } from "lucide-react";
import { apiRequest, apiFetch, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

/**
 * Every sequence built for a cycle, and the button that puts one in force.
 *
 * ── WHY THIS IS ON THE SEQUENCES TAB ─────────────────────────────────────
 * It was on the Integrity tab, because that is where the version list was first
 * needed — the integrity screen has to answer "is anything actually live?" before
 * a findings count means anything. Publishing then ended up there by proximity,
 * and Aditya went looking for it on Sequences and could not find it. He was right:
 * publishing a sequence has no business on a tab called Integrity, and the
 * cross-link added to compensate was a plaster over the misplacement.
 *
 * So this lives here, in one component, used by the tab whose name matches what it
 * does. Integrity keeps a read-only line about what is in force and links here.
 */

export type SequenceRow = {
  id: number;
  versionNumber: number;
  activeFrom: string;
  supersededAt: string | null;
  createdAt: string;
  entryCount: number;
  isActive: boolean;
};

type History = { activeSequenceId: number | null; sequences: SequenceRow[] };

function when(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

/**
 * A sequence is in one of three states, and the difference matters.
 *
 * `isActive` comes from the cycle's own pointer — the single thing the engine
 * reads. `supersededAt` is set by `wing:build-sequences` on this cycle's earlier
 * UNPUBLISHED versions so re-running the builder does not leave a pile of
 * near-identical candidates, and by publishing on whatever was live before.
 * Collapsing the two into live/not-live made every old build look like a
 * candidate awaiting publication, which is the wrong thing to show someone
 * deciding what to switch on.
 */
export function sequenceState(s: SequenceRow): { label: string; className: string } {
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

export function SequenceVersions({
  cycleId,
  cycleLabel,
}: {
  cycleId: string;
  cycleLabel?: string;
}) {
  const { toast } = useToast();
  const [publishing, setPublishing] = useState<SequenceRow | null>(null);
  const [windowShut, setWindowShut] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const { data: history, isLoading } = useQuery<History>({
    queryKey: [`/api/admin/cycles/${cycleId}/sequence/history`],
    queryFn: async () =>
      (await apiRequest("GET", `/api/admin/cycles/${cycleId}/sequence/history`)).json(),
    enabled: !!cycleId,
  });

  const publish = useMutation({
    /*
     * apiFetch, not apiRequest: the interesting responses are non-2xx. A 409 from
     * the evaluation-window gate is a decision point rather than a failure, and
     * the body carries `detail`, `remedy` and `warnings` — the most useful part of
     * the answer, which a thrown Error would discard.
     */
    mutationFn: async ({ id, force }: { id: number; force?: boolean }) =>
      apiFetch("PUT", `/api/admin/cycles/${cycleId}/active-sequence`, {
        sequenceId: id,
        ...(force ? { force: true, reason } : {}),
      }),

    onSuccess: (res) => {
      if (res.status === 409 && /evaluation window/i.test(res.data?.error ?? "")) {
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
        queryKey: [`/api/admin/cycles/${cycleId}/sequence/history`],
      });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/cycles/${cycleId}/sequence`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cycles"] });

      setPublishing(null);
      setWindowShut(null);
      setReason("");

      const warnings: string[] = res.data?.warnings ?? [];
      toast({
        title: `Version ${res.data?.versionNumber} is live`,
        description: warnings.length
          ? warnings.join(" ")
          : `${res.data?.detectorCards} coaching cards and ${res.data?.gates} gates are now in ` +
            "force. The previous version is kept and can be pointed at again.",
        variant: warnings.length ? "destructive" : undefined,
      });
    },

    onError: (error: Error) =>
      toast({
        title: "Could not reach the server",
        description: error.message,
        variant: "destructive",
      }),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const rows = history?.sequences ?? [];
  const liveRow = rows.find((s) => s.isActive) ?? null;
  /*
   * A cycle can point at a sequence with no entries, and on dev it did:
   * `wing:reset-cards` deletes every row in heuristic_sequence_entries, so the
   * published version emptied out while the pointer stayed where it was. "No
   * pointer" and "pointer at nothing" produce identical behaviour — no card
   * fires, no gate compiles — and every other screen reports a healthy published
   * cohort either way.
   */
  const liveButEmpty = !!liveRow && liveRow.entryCount === 0;

  return (
    <div className="space-y-3">
      {!history?.activeSequenceId && (
        <Alert>
          <PowerOff className="h-4 w-4" />
          <AlertTitle>Nothing is live for this cycle</AlertTitle>
          <AlertDescription>
            This cycle points at no sequence, so the engine loads no cards, compiles no gates
            and records no findings. Anything below is built and inert.
          </AlertDescription>
        </Alert>
      )}

      {liveButEmpty && (
        <Alert>
          <PowerOff className="h-4 w-4" />
          <AlertTitle>The live sequence is empty</AlertTitle>
          <AlertDescription>
            This cycle points at version {liveRow!.versionNumber}, which contains no cards. The
            engine resolves a sequence and finds nothing in it, so no card fires and no gate is
            compiled — the same outcome as publishing nothing. Publishing a build below moves
            this cycle's pointer to it.
          </AlertDescription>
        </Alert>
      )}

      {rows.length ? (
        rows.map((s) => (
          <div
            key={s.id}
            className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm"
          >
            <span className="flex items-center gap-2">
              <span className="font-medium">Version {s.versionNumber}</span>
              <Badge className={sequenceState(s).className}>{sequenceState(s).label}</Badge>
            </span>
            <span className="flex items-center gap-3 text-muted-foreground">
              <span>
                {s.entryCount} card{s.entryCount === 1 ? "" : "s"} · built {when(s.createdAt)}
              </span>
              {!s.isActive && s.entryCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
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
        ))
      ) : (
        <p className="text-sm text-muted-foreground">
          No sequence has ever been built for this cycle.
        </p>
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
              Publish version {publishing?.versionNumber}
              {cycleLabel ? ` to ${cycleLabel}` : ""}?
            </DialogTitle>
            <DialogDescription>
              This points the cycle at version {publishing?.versionNumber}, and the engine reads
              nothing else. Every student in the cohort is coached by its {publishing?.entryCount}{" "}
              cards from their next turn — including the integrity gates, which start being
              compiled into every reply. The version that is live now is kept and can be pointed
              at again.
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
                    {windowShut}. The gate reads the cycle's dates and nothing else, so it cannot
                    tell this case apart from a real mid-cycle change — and this is not one.
                    Version {liveRow!.versionNumber} is live with no cards, so there is no
                    methodology to change under anyone: publishing switches it on rather than
                    swapping it out. It still needs a reason, and the reason is logged.
                  </>
                ) : (
                  <>
                    {windowShut}. Changing the methodology now changes it under students who are
                    partway through, which is what the evaluation window exists to prevent. If a
                    card is doing harm, retiring that card takes effect immediately and is the
                    better tool. To override, say why — it is written to the log.
                  </>
                )}
              </AlertDescription>
            </Alert>
          )}

          {windowShut && (
            <div className="space-y-1.5">
              <Label htmlFor="sequence-override-reason">Reason for overriding</Label>
              <Textarea
                id="sequence-override-reason"
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
                publish.isPending || !publishing || (!!windowShut && reason.trim().length < 10)
              }
              onClick={() => publishing && publish.mutate({ id: publishing.id, force: !!windowShut })}
            >
              {publish.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {windowShut ? "Override and publish" : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
