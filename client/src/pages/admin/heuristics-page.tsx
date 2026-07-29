import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Plus, AlertTriangle, ListOrdered } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "./layout";
import { NewHeuristicDialog } from "./heuristic-editor";

/**
 * Methodology library — the list of heuristic cards.
 *
 * The status badge is doing real work here, not decoration: a `candidate` card
 * in an active sequence fires at students exactly like a validated one. The
 * banner below says so explicitly, because "candidate" reads like "draft" and
 * that misreading would be expensive.
 */

export type Heuristic = {
  id: number;
  name: string;
  description: string;
  status: "candidate" | "validated" | "retired";
  populationTags: string[];
  versionNumber: number;
  modifiedAt: string;
};

export function StatusBadge({ status }: { status: Heuristic["status"] }) {
  const variants: Record<Heuristic["status"], { className: string; label: string }> = {
    candidate: {
      className: "bg-amber-100 text-amber-900 hover:bg-amber-100",
      label: "Candidate",
    },
    validated: {
      className: "bg-emerald-100 text-emerald-900 hover:bg-emerald-100",
      label: "Validated",
    },
    retired: {
      className: "bg-muted text-muted-foreground hover:bg-muted",
      label: "Retired",
    },
  };
  const v = variants[status];
  return <Badge className={v.className}>{v.label}</Badge>;
}

export default function AdminHeuristicsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [includeRetired, setIncludeRetired] = useState(false);
  const [creating, setCreating] = useState(false);

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

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", "/api/admin/heuristics", payload);
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not create card");
      return res.json();
    },
    onSuccess: (card: Heuristic) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/heuristics"] });
      setCreating(false);
      toast({
        title: "Card created",
        description: `${card.name} was created as a candidate.`,
      });
      navigate(`/admin/heuristics/${card.id}`);
    },
    onError: (error: Error) => {
      toast({ title: "Could not create card", description: error.message, variant: "destructive" });
    },
  });

  const candidateCount = (heuristics ?? []).filter((h) => h.status === "candidate").length;

  return (
    <AdminLayout>
      <div className="container mx-auto max-w-5xl p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Methodology</h1>
            <p className="text-sm text-muted-foreground">
              The heuristic cards Wing executes. Changes take effect without a deploy.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/admin/sequences")}>
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
          <Alert className="mb-6 border-amber-300 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            <AlertTitle className="text-amber-900">
              Candidate cards fire at students
            </AlertTitle>
            <AlertDescription className="text-amber-900">
              {candidateCount} card{candidateCount === 1 ? " is" : "s are"} marked candidate.
              A candidate is unvalidated, but if it is in an active sequence it reaches
              students exactly like a validated card — being in the sequence is the
              authorisation. To stop one immediately, retire it.
            </AlertDescription>
          </Alert>
        )}

        <div className="mb-4 flex items-center gap-2">
          <Switch
            id="include-retired"
            checked={includeRetired}
            onCheckedChange={setIncludeRetired}
          />
          <Label htmlFor="include-retired" className="text-sm text-muted-foreground">
            Show retired cards
          </Label>
        </div>

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
            {heuristics.map((h) => (
              <Card
                key={h.id}
                className="cursor-pointer transition-colors hover:bg-accent/40"
                onClick={() => navigate(`/admin/heuristics/${h.id}`)}
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
    </AdminLayout>
  );
}
