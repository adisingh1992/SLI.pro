import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import AdminLayout from "../layout";
import { RequirePlatformAdmin } from "../require-platform-admin";
import { PageShell, PageHeader } from "@/components/admin/page";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Reviewing the tier and category proposals `populate-prompt-attributes.ts` wrote.
 *
 * ── WHAT "REVIEW" MEANS ON THIS SCREEN ────────────────────────────────────
 * Nothing here gates anything live — see migration 0039's header and
 * `populate-prompt-attributes.ts`'s header. Gate 2 reads `wing.prompt_log`, not this
 * table, and nothing writes `wing.prompt_log` in production yet. So this screen is not
 * "approve before it fires" — it is the after-the-fact check the source columns exist
 * for: a rule-engine tier or a Claude-reviewed category is a proposal, and picking a
 * different value in either dropdown below is what turns it into a person's answer.
 * Changing nothing leaves the proposal exactly as it was, visible in the "needs review"
 * filter for as long as nobody has looked at it.
 *
 * ── WHY A CHANGE HERE RETIRES A ROW INSTEAD OF UPDATING ONE ───────────────
 * `/api/admin/prompt-library/:id` (see prompt-library-routes.ts) never updates a live
 * row in place — it retires the current one and inserts a successor, because
 * `life_log_entries.prompt_id` points at whichever row a student actually saw. That
 * applies here too, even though nobody has been delivered a prompt from this table yet:
 * the same route serves both cases, so this screen sends the whole row back, not a
 * patch, and swaps in the row the server returns.
 */

type PromptRow = {
  id: number;
  promptText: string;
  category: string | null;
  populationTags: string[];
  promptCode: string | null;
  behavioralSignal: string | null;
  signalCategory: string | null;
  signalCategoryBecause: string | null;
  signalCategorySource: string | null;
  evidenceTier: number | null;
  evidenceTierBecause: string | null;
  evidenceTierSource: string | null;
  audienceScope: string | null;
  cadence: string | null;
  deliveryMarker: string | null;
  library: string | null;
  eventSensitive: boolean;
  active: boolean;
};

type ListResponse = {
  prompts: PromptRow[];
  counts: {
    live: number;
    needsReview: number;
    tierBySource: Record<string, number>;
    categoryBySource: Record<string, number>;
  };
};

const TIER_OPTIONS = ["1", "2", "3"] as const;
const CATEGORY_OPTIONS = [
  "language",
  "energy",
  "decision",
  "relationship",
  "industry",
  "career",
  "influence",
  "achievement",
] as const;

const CLEAR = "__clear__";

function sourceLabel(source: string | null): string {
  if (source === "rule_engine") return "rule engine";
  if (source === "claude_review") return "Claude's first pass";
  if (source === "danielle") return "reviewed";
  return "unset";
}

function sourceVariant(source: string | null): "outline" | "secondary" | "default" {
  if (source === "danielle") return "default";
  if (source === null) return "outline";
  return "secondary";
}

/** The full draft the edit endpoint expects, built from a row with one field overridden. */
function draftFrom(row: PromptRow, override: Partial<PromptRow>) {
  const merged = { ...row, ...override };
  return {
    promptText: merged.promptText,
    category: merged.category,
    populationTags: merged.populationTags,
    promptCode: merged.promptCode,
    behavioralSignal: merged.behavioralSignal,
    signalCategory: merged.signalCategory,
    evidenceTier: merged.evidenceTier,
    audienceScope: merged.audienceScope,
    cadence: merged.cadence,
    deliveryMarker: merged.deliveryMarker,
    library: merged.library,
    eventSensitive: merged.eventSensitive,
  };
}

export default function AdminPromptLibraryPage() {
  const { toast } = useToast();
  const [needsReviewOnly, setNeedsReviewOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<ListResponse>({
    queryKey: ["/api/admin/prompt-library"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/prompt-library")).json(),
  });

  const saveMutation = useMutation({
    mutationFn: async ({ id, override }: { id: number; override: Partial<PromptRow> }) => {
      const row = data?.prompts.find((r) => r.id === id);
      if (!row) throw new Error("Row no longer in the list — refresh and try again.");
      const res = await apiRequest(
        "POST",
        `/api/admin/prompt-library/${id}`,
        draftFrom(row, override),
      );
      return res.json();
    },
    onMutate: ({ id }) => setSavingId(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prompt-library"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Not saved", description: err.message });
    },
    onSettled: () => setSavingId(null),
  });

  const rows = data?.prompts ?? [];

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!r.active) return false;
      if (needsReviewOnly) {
        const tierReviewed = r.evidenceTier === null || r.evidenceTierSource === "danielle";
        const categoryReviewed = r.signalCategory === null || r.signalCategorySource === "danielle";
        if (tierReviewed && categoryReviewed) return false;
      }
      if (q && !r.promptText.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, needsReviewOnly, search]);

  return (
    <RequirePlatformAdmin>
      <AdminLayout breadcrumb="Prompt library">
        <PageShell width="wide">
          <PageHeader
            title="Prompt library — tier & category review"
            description="Evidence tier and signal category, proposed by the rule engine and by Claude's first pass, waiting on a look before the Reveal Cycle can trust them. Changing a value here is what counts as review — leaving it alone keeps it in this queue."
          />

          {data && (
            <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-2xl font-semibold">{data.counts.live}</p>
                  <p className="text-xs text-muted-foreground">live prompts</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-2xl font-semibold">{data.counts.needsReview}</p>
                  <p className="text-xs text-muted-foreground">still need a look</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-2xl font-semibold">{data.counts.tierBySource.danielle ?? 0}</p>
                  <p className="text-xs text-muted-foreground">tiers reviewed</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-2xl font-semibold">{data.counts.categoryBySource.danielle ?? 0}</p>
                  <p className="text-xs text-muted-foreground">categories reviewed</p>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button
              variant={needsReviewOnly ? "secondary" : "outline"}
              size="sm"
              onClick={() => setNeedsReviewOnly((v) => !v)}
            >
              {needsReviewOnly ? "Showing: needs review" : "Showing: all live prompts"}
            </Button>
            <Input
              placeholder="Search prompt text…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !visible.length ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {needsReviewOnly
                  ? "Nothing left in the review queue."
                  : "No prompts match."}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">Prompt</TableHead>
                      <TableHead>Evidence tier</TableHead>
                      <TableHead>Signal category</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="align-top">
                          <p className="text-sm">{row.promptText}</p>
                          {row.behavioralSignal && (
                            <p className="mt-1 text-xs italic text-muted-foreground">
                              Signal: {row.behavioralSignal}
                            </p>
                          )}
                          {row.promptCode && (
                            <p className="mt-1 text-xs text-muted-foreground">{row.promptCode}</p>
                          )}
                        </TableCell>

                        <TableCell className="align-top">
                          <div className="flex items-center gap-2">
                            <Select
                              value={row.evidenceTier === null ? undefined : String(row.evidenceTier)}
                              onValueChange={(v) =>
                                saveMutation.mutate({
                                  id: row.id,
                                  override: { evidenceTier: v === CLEAR ? null : Number(v) },
                                })
                              }
                            >
                              <SelectTrigger className="h-8 w-24">
                                <SelectValue placeholder="unset" />
                              </SelectTrigger>
                              <SelectContent>
                                {TIER_OPTIONS.map((t) => (
                                  <SelectItem key={t} value={t}>
                                    Tier {t}
                                  </SelectItem>
                                ))}
                                <SelectItem value={CLEAR}>clear</SelectItem>
                              </SelectContent>
                            </Select>
                            {savingId === row.id && saveMutation.isPending && (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            )}
                          </div>
                          <Badge variant={sourceVariant(row.evidenceTierSource)} className="mt-1.5 text-[10px]">
                            {row.evidenceTier === null ? "unset" : sourceLabel(row.evidenceTierSource)}
                          </Badge>
                          {row.evidenceTierBecause && (
                            <p className="mt-1 text-xs text-muted-foreground">{row.evidenceTierBecause}</p>
                          )}
                        </TableCell>

                        <TableCell className="align-top">
                          <div className="flex items-center gap-2">
                            <Select
                              value={row.signalCategory ?? undefined}
                              onValueChange={(v) =>
                                saveMutation.mutate({
                                  id: row.id,
                                  override: { signalCategory: v === CLEAR ? null : v },
                                })
                              }
                            >
                              <SelectTrigger className="h-8 w-36">
                                <SelectValue placeholder="unset" />
                              </SelectTrigger>
                              <SelectContent>
                                {CATEGORY_OPTIONS.map((c) => (
                                  <SelectItem key={c} value={c}>
                                    {c}
                                  </SelectItem>
                                ))}
                                <SelectItem value={CLEAR}>clear</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Badge
                            variant={sourceVariant(row.signalCategorySource)}
                            className="mt-1.5 text-[10px]"
                          >
                            {row.signalCategory === null ? "unset" : sourceLabel(row.signalCategorySource)}
                          </Badge>
                          {row.signalCategoryBecause && (
                            <p className="mt-1 text-xs text-muted-foreground">{row.signalCategoryBecause}</p>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </PageShell>
      </AdminLayout>
    </RequirePlatformAdmin>
  );
}
