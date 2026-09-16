import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Loader2, Plus, AlertTriangle, ListOrdered, Search, ChevronDown, ChevronRight,
} from "lucide-react";
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
import {
  MODULE_ORDER, StatusBadge, completeness, kindLabel, moduleLabel, type Heuristic,
} from "./heuristic";

/**
 * Methodology library — the list of heuristic cards.
 *
 * The status badge is doing real work here, not decoration: a `candidate` card
 * in an active sequence fires at students exactly like a validated one. The
 * banner below says so explicitly, because "candidate" reads like "draft" and
 * that misreading would be expensive.
 *
 * ── WHY THIS SCREEN GREW FILTERS AND GROUPS ──────────────────────────────
 * It held 104 cards and now holds 325 — every module, both system events, the
 * content system, the safety and UX and micro-journaling gates. A flat list
 * sorted by name is unreadable at that size, and this file's own comment
 * already said so before it was true. Module is the axis the methodology owner
 * thinks in (Foundation 2, Module 13, Reveal Cycle), so it is the grouping;
 * kind separates the 143 gates from the 160 coaching cards; and search matches
 * the card code, because typing H-1305 and getting nothing is the fastest way
 * to conclude a card was never seeded.
 */

export function CardsPanel() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [includeRetired, setIncludeRetired] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [population, setPopulation] = useState("all");
  const [module, setModule] = useState("all");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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

  const all = useMemo(() => heuristics ?? [], [heuristics]);

  const populations = useMemo(
    () => Array.from(new Set(all.flatMap((h) => h.populationTags ?? []))).sort(),
    [all],
  );

  const modules = useMemo(() => {
    const present = new Set(all.map((h) => h.module ?? "unknown"));
    return MODULE_ORDER.filter((m) => present.has(m));
  }, [all]);

  const filtered = useMemo(
    () =>
      all.filter((h) => {
        if (population !== "all" && !(h.populationTags ?? []).includes(population)) return false;
        if (module !== "all" && (h.module ?? "unknown") !== module) return false;
        if (kind !== "all" && (h.cardKind ?? "coaching_card") !== kind) return false;
        if (status !== "all" && h.status !== status) return false;
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          h.name.toLowerCase().includes(q) ||
          h.description.toLowerCase().includes(q) ||
          // Without this, typing a card code finds nothing — and a code is what
          // every other document in this project refers to a card by.
          (h.cardCode ?? "").toLowerCase().includes(q)
        );
      }),
    [all, population, module, kind, status, search],
  );

  /** Grouped by module, in the order a student meets them. */
  const groups = useMemo(() => {
    const byModule = new Map<string, Heuristic[]>();
    for (const h of filtered) {
      const m = h.module ?? "unknown";
      (byModule.get(m) ?? byModule.set(m, []).get(m)!).push(h);
    }
    return MODULE_ORDER.filter((m) => byModule.has(m)).map((m) => ({
      module: m,
      cards: byModule.get(m)!,
    }));
  }, [filtered]);

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

  const candidateCount = all.filter((h) => h.status === "candidate").length;
  const filtersActive =
    population !== "all" || module !== "all" || kind !== "all" || status !== "all" || !!search.trim();

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
            placeholder="Search code, name or description"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select value={module} onValueChange={setModule}>
          <SelectTrigger className="w-[230px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {modules.map((m) => (
              <SelectItem key={m} value={m}>
                {moduleLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            <SelectItem value="coaching_card">Cards</SelectItem>
            <SelectItem value="integrity_gate">Gates</SelectItem>
            <SelectItem value="exercise">Exercises</SelectItem>
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="candidate">Candidate</SelectItem>
            <SelectItem value="validated">Validated</SelectItem>
            <SelectItem value="retired">Retired</SelectItem>
          </SelectContent>
        </Select>

        {populations.length > 0 && (
          <Select value={population} onValueChange={setPopulation}>
            <SelectTrigger className="w-[200px]">
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

        {filtersActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setPopulation("all");
              setModule("all");
              setKind("all");
              setStatus("all");
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {all.length > 0 && (
        <p className="mb-3 text-sm text-muted-foreground">
          {filtered.length === all.length
            ? `${all.length} card${all.length === 1 ? "" : "s"} in the library`
            : `${filtered.length} of ${all.length} cards`}
          {" · "}
          Cards are inert until added to a sequence.
        </p>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !all.length ? (
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
      ) : !filtered.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No cards match these filters.
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map(({ module: m, cards }) => {
            const isCollapsed = collapsed[m] ?? false;
            return (
              <div key={m}>
                <button
                  className="mb-2 flex w-full items-center gap-2 text-left"
                  onClick={() => setCollapsed((c) => ({ ...c, [m]: !isCollapsed }))}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                  <h3 className="font-serif text-base">{moduleLabel(m)}</h3>
                  <span className="text-sm text-muted-foreground">
                    {cards.length} {cards.length === 1 ? "element" : "elements"}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="space-y-2">
                    {cards.map((h) => {
                      const spec = completeness(h);
                      return (
                        <Card
                          key={h.id}
                          className="cursor-pointer transition-colors hover:bg-accent/40"
                          onClick={() => navigate(`/admin/methodology/cards/${h.id}`)}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <CardTitle className="text-base">{h.name}</CardTitle>
                                <CardDescription className="mt-1">
                                  {h.description}
                                </CardDescription>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <span
                                  className={
                                    spec.muted
                                      ? "whitespace-nowrap text-xs text-muted-foreground"
                                      : "whitespace-nowrap text-xs text-good"
                                  }
                                >
                                  {spec.label}
                                </span>
                                <Badge variant="outline" className="text-xs font-normal">
                                  {kindLabel(h.cardKind)}
                                </Badge>
                                <StatusBadge status={h.status} />
                              </div>
                            </div>
                          </CardHeader>
                          {h.populationTags?.length > 0 && (
                            <CardContent className="pt-0">
                              <div className="flex flex-wrap gap-1">
                                {h.populationTags.map((tag) => (
                                  <Badge
                                    key={tag}
                                    variant="outline"
                                    className="text-xs font-normal"
                                  >
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </CardContent>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
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
