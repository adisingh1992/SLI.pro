import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
 * ── SIGNAL CATEGORY IS A SET, EVIDENCE TIER IS NOT ────────────────────────
 * Since 0041 a prompt carries zero or more of her eight — "a single prompt response
 * could contain both an energy signal and a relationship signal" (her Sept 4 pre-read,
 * §7e). So the two controls in this table are deliberately different shapes: the tier is
 * still one value from a Select, and the category is a checkbox menu that commits when it
 * closes. `SignalCategoryPicker` below says why the commit is deferred.
 *
 * `signalCategoryBecause` and `signalCategorySource` still describe the whole set rather
 * than one member of it — there is one review decision per prompt, not one per category.
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
  signalCategory: string[];
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

/**
 * The categories in CATEGORY_OPTIONS order, deduplicated — the client half of
 * `canonicalCategories` on the server.
 *
 * Both halves exist because both questions are real. The server needs it so a save is
 * stored in one spelling; this needs it so "did she actually change anything" can be a
 * string comparison, and ticking energy-then-career does not count as a different answer
 * from ticking career-then-energy. Every change here retires a row and inserts a
 * successor (see the header), so a spurious "changed" is a spurious version.
 */
function canonical(values: readonly string[]): string[] {
  return CATEGORY_OPTIONS.filter((c) => values.includes(c));
}

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

/**
 * The signal-category picker — several of her eight, not one.
 *
 * ── WHY IT SAVES ON CLOSE AND NOT ON EACH TICK ────────────────────────────
 * The tier dropdown next to it saves on change, which is right for a control where one
 * click IS the whole answer. This one is not: "energy and relationship" takes two clicks,
 * and saving each of them would retire a live row and insert a successor per tick — so a
 * three-category prompt would leave four rows in its own lineage, three of which are
 * states she passed through rather than answers she gave. The lineage is meant to read as
 * the history of the prompt, and `/api/admin/prompt-library/:id` walks it on every open.
 *
 * So the menu holds a draft, and closing it is what commits — and only when the set
 * actually differs, because the route treats an identical save as a no-op but the round
 * trip is still a round trip.
 */
function SignalCategoryPicker({
  value,
  disabled,
  onCommit,
}: {
  value: readonly string[];
  disabled: boolean;
  onCommit: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(() => canonical(value));

  /*
   * Reseed only when the row's own value actually changes, keyed on the content rather
   * than the array identity — the list re-renders on every query settle and hands down a
   * new array each time, so a `[value]` dependency would fire constantly.
   *
   * Not on close, which is the version that looks right and is not: closing commits, and
   * the save takes a round trip, so resetting there would show the old set for as long as
   * the request took and then flip to the new one. Leaving the draft alone means the menu
   * keeps showing what she picked until the saved row replaces it. It is also what she
   * wants when a save FAILS — the list is not invalidated on error, so her selection
   * survives for a retry instead of silently reverting.
   */
  const valueKey = canonical(value).join(",");
  useEffect(() => {
    setDraft(canonical(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueKey]);

  const commit = (next: string[]) => {
    const before = canonical(value);
    const after = canonical(next);
    if (JSON.stringify(before) !== JSON.stringify(after)) onCommit(after);
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) commit(draft);
      }}
    >
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-44 justify-between font-normal"
        >
          <span className="truncate">
            {draft.length ? (
              /* Two names and a count: eight names in a table cell is an ellipsis. */
              <>
                {draft.slice(0, 2).join(", ")}
                {draft.length > 2 ? ` +${draft.length - 2}` : ""}
              </>
            ) : (
              <span className="text-muted-foreground">unset</span>
            )}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {CATEGORY_OPTIONS.map((c) => (
          <DropdownMenuCheckboxItem
            key={c}
            checked={draft.includes(c)}
            /*
             * Ticking one must not close the menu — picking several is the entire point
             * of the control, and the default select-then-close would make each extra
             * category a separate save.
             */
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(checked) =>
              setDraft((d) => canonical(checked ? [...d, c] : d.filter((x) => x !== c)))
            }
          >
            {c}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setDraft([]); }}>
          clear
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
        const categoryReviewed =
          r.signalCategory.length === 0 || r.signalCategorySource === "danielle";
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
                            <SignalCategoryPicker
                              value={row.signalCategory}
                              disabled={savingId === row.id && saveMutation.isPending}
                              onCommit={(next) =>
                                saveMutation.mutate({
                                  id: row.id,
                                  override: { signalCategory: next },
                                })
                              }
                            />
                            {savingId === row.id && saveMutation.isPending && (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            )}
                          </div>
                          <Badge
                            variant={sourceVariant(row.signalCategorySource)}
                            className="mt-1.5 text-[10px]"
                          >
                            {row.signalCategory.length === 0
                              ? "unset"
                              : sourceLabel(row.signalCategorySource)}
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
