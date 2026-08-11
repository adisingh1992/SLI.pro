import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import NavBar from "@/components/nav-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";

/**
 * The Behavioral Evidence Portfolio (Feature List A4).
 *
 * ── THE GAPS ARE SHOWN, NOT HIDDEN ───────────────────────────────────────
 * Every one of the eight NACE competencies appears, including the ones with
 * nothing in them. The instinct is to render only what the student has, which
 * would look tidier and be far less useful — a competency at zero is the most
 * actionable thing on the page, for the student and for the advisor sitting
 * opposite them.
 *
 * ── EVIDENCE IS SHOWN UNDER EVERY CLAIM ──────────────────────────────────
 * Not collapsed, not on hover. The claim without the evidence is an assertion,
 * and the entire point of the portfolio is that each claim comes with the thing
 * the student actually said to back it up — so they can repeat it, and so it
 * holds when someone asks a second question.
 */

type Item = {
  id: number;
  positioningClaim: string;
  evidence: string;
  competencyCategory: string;
  competencyName: string;
};

type Coverage = {
  key: string;
  name: string;
  definition: string;
  count: number;
};

type PortfolioResponse = { items: Item[]; coverage: Coverage[] };

export default function PortfolioPage() {
  const { toast } = useToast();

  const portfolio = useQuery<PortfolioResponse>({
    queryKey: ["/api/portfolio"],
    queryFn: async () => (await apiRequest("GET", "/api/portfolio")).json(),
  });

  const build = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/portfolio/build")).json(),
    onSuccess: (r: { created: number; message?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
      toast({
        title: r.created > 0 ? `${r.created} pieces of evidence` : "Nothing to add yet",
        description:
          r.message ??
          "Each one is something you said, with the claim it supports.",
      });
    },
    onError: (e: Error) =>
      toast({ title: "Couldn't build that", description: e.message, variant: "destructive" }),
  });

  const items = portfolio.data?.items ?? [];
  const coverage = portfolio.data?.coverage ?? [];

  const byCompetency = new Map<string, Item[]>();
  for (const i of items) {
    if (!byCompetency.has(i.competencyCategory)) byCompetency.set(i.competencyCategory, []);
    byCompetency.get(i.competencyCategory)!.push(i);
  }

  return (
    <div className="min-h-screen bg-background">
      <NavBar />

      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Your evidence</h1>
            <p className="pt-1 text-sm text-muted-foreground">
              What you can claim, and the thing you said that proves it — sorted by the
              competencies employers actually screen for.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => build.mutate()}
            disabled={build.isPending}
          >
            {build.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {items.length ? "Rebuild" : "Build my portfolio"}
          </Button>
        </div>

        {portfolio.isLoading && (
          <div className="flex justify-center p-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!portfolio.isLoading && items.length === 0 && (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Nothing here yet. Once you've done a session or two, build this and Wing will pull
              out the moments that actually prove something — in your words, not its own.
            </CardContent>
          </Card>
        )}

        {/* Coverage across all eight, gaps included. */}
        {coverage.length > 0 && (
          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Coverage
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {coverage.map((c) => (
                  <div key={c.key} className="flex items-center justify-between gap-2 text-sm">
                    <span className={c.count === 0 ? "text-muted-foreground" : ""}>{c.name}</span>
                    {c.count > 0 ? (
                      <Badge variant="secondary">{c.count}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">nothing yet</span>
                    )}
                  </div>
                ))}
              </div>
              {coverage.some((c) => c.count === 0) && (
                <p className="pt-1 text-xs text-muted-foreground">
                  Empty categories aren't failures — they're just where you haven't given an
                  example yet. Worth raising with your advisor.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Items, grouped. */}
        {coverage
          .filter((c) => (byCompetency.get(c.key)?.length ?? 0) > 0)
          .map((c) => (
            <div key={c.key} className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold">{c.name}</h2>
                <p className="text-xs text-muted-foreground">{c.definition}</p>
              </div>

              {(byCompetency.get(c.key) ?? []).map((item) => (
                <Card key={item.id}>
                  <CardContent className="space-y-2 p-4">
                    <p className="text-[15px] font-medium leading-relaxed">
                      {item.positioningClaim}
                    </p>
                    {/* The evidence sits under every claim, always visible. */}
                    <div className="rounded-md border-l-2 border-muted bg-muted/40 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        What you said
                      </p>
                      <p className="pt-1 text-sm leading-relaxed">{item.evidence}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
