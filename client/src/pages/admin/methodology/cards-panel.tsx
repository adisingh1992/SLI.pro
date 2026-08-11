import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Plus, AlertTriangle, ListOrdered, Search } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { NewHeuristicDialog } from "../heuristic-editor";
import { StatusBadge, type Heuristic } from "./heuristic";

/**
 * Methodology library — the list of heuristic cards.
 *
 * The status badge is doing real work here, not decoration: a `candidate` card
 * in an active sequence fires at students exactly like a validated one. The
 * banner below says so explicitly, because "candidate" reads like "draft" and
 * that misreading would be expensive.
 */

export function CardsPanel() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [includeRetired, setIncludeRetired] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [population, setPopulation] = useState("all");

  const { data: heuristics, isLoading } = useQuery<Heuristic[]>({
    queryKey: ["/api/admin/heuristics", includeRetired],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/admin/heuristics?includeRetired=${includeRetired}`,
      );
      return res.json();
    },
  });

  // The library runs to hundreds of cards once the prompt files are extracted,
  // so filtering is not a nicety — an unfiltered list is unreviewable.
  const populations = Array.from(
    new Set((heuristics ?? []).flatMap((h) => h.populationTags ?? [])),
  ).sort();

  const filtered = (heuristics ?? []).filter((h) => {
    if (population !== "all" && !(h.populationTags ?? []).includes(population)) {
      return false;
    }
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      h.name.toLowerCase().includes(q) || h.description.toLowerCase().includes(q)
    );
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", "/api/admin/heuristics", payload);
      return res.json();
    },
    onSuccess: (card: Heuristic) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/heuristics"] });
      setCreating(false);
      toast({
        title: "Card created",
        description: `${card.name} was created as a candidate.`,
      });
      navigate(`/admin/methodology/cards/${card.id}`);
    },
    onError: (error: Error) => {
      toast({ title: "Could not create card", description: error.message, variant: "destructive" });
    },
  });

  const candidateCount = (heuristics ?? []).filter((h) => h.status === "candidate").length;

  return (
    <div className="space-y-6">
        <div className="flex justify-end gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/admin/methodology/sequences")}>
              <ListOrdered className="mr-2 h-4 w-4" />
              Sequences
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New card
            </Button>
          </div>
        </div>

        {candidateCount > 0 && (
          <Alert className="mb-6 border-warn/30 bg-warn-soft">
            <AlertTriangle className="h-4 w-4 text-warn" />
            <AlertTitle className="text-warn">
              Status does not decide what reaches students — the sequence does
            </AlertTitle>
            <AlertDescription className="text-warn">
              {candidateCount} card{candidateCount === 1 ? " is a" : "s are"} candidate
              {candidateCount === 1 ? "" : "s"}. A candidate sitting in the library is
              completely inert. A candidate <strong>in an active sequence</strong> reaches
              students exactly like a validated one — sequence membership is the
              authorisation, not status.{" "}
              <button
                className="underline underline-offset-2"
                onClick={() => navigate("/admin/methodology/sequences")}
              >
                Check what is actually live
              </button>
              . To stop a card immediately, retire it.
            </AlertDescription>
          </Alert>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search name or description"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {populations.length > 0 && (
            <Select value={population} onValueChange={setPopulation}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All populations</SelectItem>
                {populations.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center gap-2">
            <Switch
              id="include-retired"
              checked={includeRetired}
              onCheckedChange={setIncludeRetired}
            />
            <Label htmlFor="include-retired" className="text-sm text-muted-foreground">
              Retired
            </Label>
          </div>
        </div>

        {heuristics && heuristics.length > 0 && (
          <p className="mb-3 text-sm text-muted-foreground">
            {filtered.length === heuristics.length
              ? `${heuristics.length} card${heuristics.length === 1 ? "" : "s"} in the library`
              : `${filtered.length} of ${heuristics.length} cards`}
            {" · "}
            Cards are inert until added to a sequence.
          </p>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !heuristics?.length ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                No heuristic cards yet. Wing will coach normally until one exists.
              </p>
              <Button className="mt-4" onClick={() => setCreating(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Write the first card
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {!filtered.length && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No cards match these filters.
              </p>
            )}
            {filtered.map((h) => (
              <Card
                key={h.id}
                className="cursor-pointer transition-colors hover:bg-accent/40"
                onClick={() => navigate(`/admin/methodology/cards/${h.id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <CardTitle className="text-base">{h.name}</CardTitle>
                      <CardDescription className="mt-1">{h.description}</CardDescription>
                    </div>
                    <StatusBadge status={h.status} />
                  </div>
                </CardHeader>
                {h.populationTags?.length > 0 && (
                  <CardContent className="pt-0">
                    <div className="flex flex-wrap gap-1">
                      {h.populationTags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs font-normal">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}

        <NewHeuristicDialog
          open={creating}
          onOpenChange={setCreating}
          onSubmit={(payload) => createMutation.mutate(payload)}
          isSubmitting={createMutation.isPending}
        />
    </div>
  );
}
