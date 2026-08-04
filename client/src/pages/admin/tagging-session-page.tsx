import { useState, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, ArrowLeft, Lock, Undo2, AlertTriangle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "./layout";

/**
 * Transcript tagger.
 *
 * Built for keyboard speed because this is repetitive work and 10–15 sessions
 * is a lot of turns: 1/2/3 assign a type to the selected turn and advance,
 * J/K move without tagging. Reaching for a mouse per turn would make the whole
 * exercise something nobody finishes.
 *
 * AI turns are shown but not taggable. Their type is structural — derived from
 * position and the preceding turn — so there is nothing for a human to judge,
 * and letting someone tag one would create a row the engine could not produce.
 */

type Turn = {
  id: number;
  position: number;
  turnType: string;
  provenanceTag: string;
  content: string;
  classificationStatus: "provisional" | "classified" | "hand_tagged";
  classifiedBy: "rule" | "nano" | "human" | null;
  signalDetected: boolean;
  activeHeuristicName: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  human_elicited_response: "Elicited",
  human_spontaneous: "Spontaneous",
  human_correction: "Correction",
  ai_prompt: "AI prompt",
  ai_adapted: "AI adapted",
};

const TYPE_HELP: Record<string, string> = {
  human_elicited_response: "Answering the question the coach just asked.",
  human_spontaneous: "Volunteering something not asked for — a new thread, their own direction.",
  human_correction:
    "Redesigning the coach's framing because it does not fit them. Not merely disagreeing, " +
    "and not defending against a challenge — reshaping how they are being described.",
};

const SHORTCUTS = ["human_elicited_response", "human_spontaneous", "human_correction"];

export default function AdminTaggingSessionPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [selected, setSelected] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{
    transcriptStatus: string;
    turns: Turn[];
    taggableTypes: string[];
  }>({
    queryKey: [`/api/admin/tagging/sessions/${id}`],
    queryFn: async () => (await apiRequest("GET", `/api/admin/tagging/sessions/${id}`)).json(),
  });

  // turn_type, not provenance: migrated turns are all provenance_unknown, so
  // filtering on provenance counted Wing's own turns as human.
  const humanTurns = (data?.turns ?? []).filter(
    (t) => t.turnType !== "ai_prompt" && t.turnType !== "ai_adapted",
  );

  // Start on the first turn that still needs a human judgement.
  useEffect(() => {
    if (selected === null && humanTurns.length) {
      const next = humanTurns.find((t) => t.classificationStatus !== "hand_tagged");
      setSelected((next ?? humanTurns[0]).id);
    }
  }, [humanTurns, selected]);

  const tagMutation = useMutation({
    mutationFn: async ({ turnId, turnType }: { turnId: number; turnType: string }) => {
      const res = await apiRequest("PUT", `/api/admin/tagging/turns/${turnId}`, { turnType });
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/tagging/sessions/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tagging/sessions"] });

      // Overturning the machine is the interesting event — surface it, because
      // a run of these is the signal that the classifier prompt needs work.
      if (result.changed && result.wasMachineLabelled) {
        toast({
          title: "Overturned the classifier",
          description: `It said ${TYPE_LABELS[result.previousType] ?? result.previousType}; you said otherwise.`,
        });
      }
    },
    onError: (error: Error) =>
      toast({ title: "Could not save tag", description: error.message, variant: "destructive" }),
  });

  const clearMutation = useMutation({
    mutationFn: async (turnId: number) =>
      (await apiRequest("DELETE", `/api/admin/tagging/turns/${turnId}`)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/tagging/sessions/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tagging/sessions"] });
    },
  });

  const move = useCallback(
    (delta: number) => {
      if (selected === null || !humanTurns.length) return;
      const i = humanTurns.findIndex((t) => t.id === selected);
      const next = humanTurns[Math.min(Math.max(i + delta, 0), humanTurns.length - 1)];
      setSelected(next.id);
      document.getElementById(`turn-${next.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    },
    [selected, humanTurns],
  );

  const tagAndAdvance = useCallback(
    (turnType: string) => {
      if (selected === null) return;
      tagMutation.mutate({ turnId: selected, turnType });
      move(1);
    },
    [selected, tagMutation, move],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "1" || e.key === "2" || e.key === "3") {
        e.preventDefault();
        tagAndAdvance(SHORTCUTS[Number(e.key) - 1]);
      } else if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        move(1);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        move(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tagAndAdvance, move]);

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  const tagged = humanTurns.filter((t) => t.classificationStatus === "hand_tagged").length;
  const isLegacy = data?.transcriptStatus === "migrated_provenance_unknown";

  return (
    <AdminLayout>
      <div className="container mx-auto max-w-4xl p-6">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/admin/tagging")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Sessions
        </Button>

        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Session {id}</h1>
            <p className="text-sm text-muted-foreground">
              {tagged} of {humanTurns.length} human turns tagged
            </p>
          </div>
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <kbd className="rounded border bg-background px-1">1</kbd> elicited{" · "}
            <kbd className="rounded border bg-background px-1">2</kbd> spontaneous{" · "}
            <kbd className="rounded border bg-background px-1">3</kbd> correction{" · "}
            <kbd className="rounded border bg-background px-1">J</kbd>/
            <kbd className="rounded border bg-background px-1">K</kbd> move
          </div>
        </div>

        {isLegacy && (
          <Alert className="mb-4 border-amber-300 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            <AlertTitle className="text-amber-900">Legacy import</AlertTitle>
            <AlertDescription className="text-amber-900">
              This transcript came from the MVP and has no reliable provenance. Tagging
              it is possible but the turns were never captured with provenance, so they
              make a weaker gold standard than a natively captured session.
            </AlertDescription>
          </Alert>
        )}

        <div className="mb-4 rounded-md border bg-muted/30 p-3 text-xs">
          <p className="mb-1 font-medium">What the three types mean</p>
          {SHORTCUTS.map((t, i) => (
            <p key={t} className="text-muted-foreground">
              <span className="font-medium text-foreground">
                {i + 1}. {TYPE_LABELS[t]}
              </span>{" "}
              — {TYPE_HELP[t]}
            </p>
          ))}
        </div>

        <div className="space-y-2">
          {(data?.turns ?? []).map((turn) => {
            // turn_type, not provenance_tag. Migrated turns are all stamped
            // provenance_unknown, so keying on provenance made Wing's own
            // turns look human — and therefore hand-taggable. Tagging an AI
            // turn with a human turn type would feed a nonsense example
            // straight into the classifier's training set.
            const isAi = turn.turnType === "ai_prompt" || turn.turnType === "ai_adapted";
            const isSelected = turn.id === selected;
            const isTagged = turn.classificationStatus === "hand_tagged";

            return (
              <Card
                id={`turn-${turn.id}`}
                key={turn.id}
                className={[
                  isAi ? "bg-muted/40" : "cursor-pointer",
                  isSelected && !isAi ? "ring-2 ring-primary" : "",
                  isTagged ? "border-emerald-300" : "",
                ].join(" ")}
                onClick={() => !isAi && setSelected(turn.id)}
              >
                <CardContent className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">#{turn.position}</span>

                    <Badge variant={isAi ? "secondary" : "outline"}>
                      {TYPE_LABELS[turn.turnType] ?? turn.turnType}
                    </Badge>

                    {isAi ? (
                      // Said explicitly: an AI turn's type is derived from
                      // position, not judged, so there is nothing to tag.
                      <span className="text-muted-foreground">
                        AI turn — type is structural, not tagged
                      </span>
                    ) : isTagged ? (
                      <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
                        <Lock className="mr-1 h-3 w-3" />
                        hand-tagged
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">
                        {turn.classificationStatus}
                        {turn.classifiedBy ? ` · ${turn.classifiedBy}` : ""}
                        {turn.classifiedBy === "nano" && " — confirm or overturn"}
                      </span>
                    )}

                    {turn.signalDetected && turn.activeHeuristicName && (
                      <Badge variant="outline" className="border-primary/40 text-primary">
                        {turn.activeHeuristicName}
                      </Badge>
                    )}

                    {isTagged && (
                      <button
                        className="ml-auto text-muted-foreground underline underline-offset-2 hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          clearMutation.mutate(turn.id);
                        }}
                      >
                        <Undo2 className="mr-1 inline h-3 w-3" />
                        clear
                      </button>
                    )}
                  </div>

                  <p className="whitespace-pre-wrap text-sm">{turn.content}</p>

                  {/*
                    Shown on EVERY human turn, not just the selected one. When
                    they only appeared on selection, every other turn looked
                    untaggable and tagging took two clicks — select, then
                    choose. The keyboard path is for speed; the buttons are for
                    knowing what is possible.
                  */}
                  {!isAi && (
                    <div className="flex flex-wrap gap-2 border-t pt-2">
                      {SHORTCUTS.map((t, i) => (
                        <Button
                          key={t}
                          size="sm"
                          variant={isTagged && turn.turnType === t ? "default" : "outline"}
                          disabled={tagMutation.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(turn.id);
                            tagMutation.mutate({ turnId: turn.id, turnType: t });
                            // Advance only when tagging the turn the keyboard is
                            // on; clicking a different turn means the reader is
                            // working out of order and should not be moved.
                            if (isSelected) move(1);
                          }}
                        >
                          {isSelected && (
                            <span className="mr-1.5 text-xs opacity-60">{i + 1}</span>
                          )}
                          {TYPE_LABELS[t]}
                        </Button>
                      ))}
                      {isTagged && (
                        <span className="self-center text-xs text-muted-foreground">
                          your label
                        </span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
}
