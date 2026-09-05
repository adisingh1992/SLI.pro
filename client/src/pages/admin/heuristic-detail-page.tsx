import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Loader2, ArrowLeft, History, Check, Archive, AlertTriangle,
  Pencil, Shield, Puzzle, MessageCircle, ChevronDown, X,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  ComponentField, ComponentReadout, EngineUseBadge, COMPONENT_SPECS,
  GROUP_LABELS, fieldsIn, type ComponentType, type FieldGroup,
} from "./heuristic-editor";
import { PageShell } from "@/components/admin/page";
import { StatCard } from "@/components/admin/stat-card";

/**
 * One card, for reviewing and revising.
 *
 * ── WHY THIS OPENS IN READ MODE ──────────────────────────────────────────
 * The job in front of the methodology owner is reading 53 seeded cards against
 * the source document and deciding which are right. The previous version of
 * this screen rendered every component as a live textarea stacked in a narrow
 * column, which made a card unreadable and gave a `signal` — matched against
 * every student turn — exactly the same visual weight as `notes`, which nothing
 * reads. Now each field shows its content, says what the engine does with it,
 * and is one click from editing.
 *
 * ── WHY THE FIELDS ARE GROUPED ───────────────────────────────────────────
 * A v2 card has no `intervention` and no `outcome`; v2 replaced them with
 * `coaching_move` and `success_criteria`. Rendering all eleven fields flat meant
 * three permanently-empty boxes with placeholder text, which reads as "somebody
 * forgot these" rather than "the methodology moved on". The pre-v2 band is
 * collapsed and labelled, and says so.
 *
 * ── AND WHY `intervention_type` IS NOT A FIELD ───────────────────────────
 * It is a column on the card, not a versioned component — one classifier per
 * card, which either changes or does not. It appears in the header beside the
 * card kind, as a property rather than something to write prose into.
 */

type ComponentRow = {
  id: number;
  componentType: ComponentType;
  content: string;
  versionNumber: number;
  isCurrent: boolean;
  createdAt: string;
};

type Performance = {
  totalSessionsApplied: number;
  studentsScored: number;
  meanComposite: number | null;
  recentOutcomes: Record<string, number>;
};

const KIND_META = {
  coaching_card: {
    icon: MessageCircle,
    label: "Coaching card",
    note: "Fires on the student's turn. This is what the detector matches against.",
  },
  integrity_gate: {
    icon: Shield,
    label: "Integrity gate",
    note:
      "Fires on Wing's own output before delivery, not on the student's turn — so it " +
      "never enters the detector catalogue. Its signal describes something Wing is " +
      "about to say.",
  },
  exercise: {
    icon: Puzzle,
    label: "Exercise",
    note:
      "Reached by an explicit reference from another card's coaching move, not by " +
      "signal match. That is why exercise cards carry no sequence weight — they are " +
      "not competing to fire.",
  },
} as const;

/**
 * What the field components read and call. Passed as one object rather than a dozen
 * props, because it is one thing: the page's editing state and the handlers that change
 * it.
 *
 * ── WHY THESE TWO COMPONENTS ARE OUT HERE AND MUST STAY OUT ──────────────
 * They used to be declared inside `AdminHeuristicDetailPage`, closing over its state
 * directly, which cost a character of typing per click.
 *
 * A function declared in a render body is a NEW function on every render, and React
 * identifies a component by that function reference. Typing one character called
 * `setDrafts`, which re-rendered the page, which produced a different `FieldRow` — so
 * React saw a different component type in that position, unmounted the subtree, and
 * mounted a fresh one. The textarea it destroyed was the focused element, so focus went
 * with it and every keystroke needed another click.
 *
 * The fix is placement, not memoisation: at module scope the reference is stable, React
 * reconciles the same component, and the DOM node — with its selection and focus —
 * survives. `ctx` being a fresh object each render is fine; that re-renders these, which
 * is all it should ever have done.
 */
type FieldCtx = {
  currentFor: (type: ComponentType) => ComponentRow | undefined;
  historyFor: (type: ComponentType) => ComponentRow[];
  valueFor: (type: ComponentType) => string;
  isDirty: (type: ComponentType) => boolean;
  editing: Record<string, boolean>;
  openHistory: Record<string, boolean>;
  /** The field currently being saved, or null. */
  savingType: ComponentType | null;
  startEdit: (type: ComponentType) => void;
  cancelEdit: (type: ComponentType) => void;
  setDraft: (type: ComponentType, value: string) => void;
  save: (type: ComponentType) => void;
  toggleHistory: (type: ComponentType) => void;
};

/* ── One field, read or editing ───────────────────────────────────────── */
function FieldRow({ type, ctx }: { type: ComponentType; ctx: FieldCtx }) {
  const spec = COMPONENT_SPECS[type];
  const existing = ctx.currentFor(type);
  const history = ctx.historyFor(type);
  const isEditing = !!ctx.editing[type];
  const saving = ctx.savingType === type;

  return (
    <div className="border-t px-5 py-4 first:border-t-0">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium">{spec.label}</h3>
            <EngineUseBadge type={type} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {existing
              ? `Version ${existing.versionNumber}${
                  history.length ? ` · ${history.length} earlier` : ""
                }`
              : "Not written yet"}
          </p>
        </div>

        {!isEditing && (
          <Button variant="ghost" size="sm" onClick={() => ctx.startEdit(type)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            {existing ? "Edit" : "Write"}
          </Button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <ComponentField
            type={type}
            value={ctx.valueFor(type)}
            onChange={(v) => ctx.setDraft(type, v)}
            rows={type === "notes" ? 6 : 5}
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={!ctx.isDirty(type) || saving}
              onClick={() => ctx.save(type)}
            >
              {saving && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Save new version
            </Button>
            <Button variant="ghost" size="sm" onClick={() => ctx.cancelEdit(type)} disabled={saving}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Cancel
            </Button>
            {ctx.isDirty(type) && (
              <span className="text-xs text-muted-foreground">
                The current version is kept, not overwritten.
              </span>
            )}
          </div>
        </div>
      ) : (
        <ComponentReadout type={type} content={existing?.content ?? null} />
      )}

      {history.length > 0 && !isEditing && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => ctx.toggleHistory(type)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <History className="h-3 w-3" />
            {ctx.openHistory[type] ? "Hide" : "Show"} {history.length} earlier version
            {history.length === 1 ? "" : "s"}
            <ChevronDown
              className={`h-3 w-3 transition-transform ${ctx.openHistory[type] ? "rotate-180" : ""}`}
            />
          </button>
          {ctx.openHistory[type] && (
            <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-3">
              {history.map((h) => (
                <div key={h.id} className="border-l-2 pl-3 text-xs">
                  <p className="text-muted-foreground">
                    v{h.versionNumber} · {new Date(h.createdAt).toLocaleDateString()}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap">{h.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FieldGroupCard({ group, ctx }: { group: FieldGroup; ctx: FieldCtx }) {
  return (
    <div>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {GROUP_LABELS[group]}
      </h2>
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {fieldsIn(group).map((type) => (
            <FieldRow key={type} type={type} ctx={ctx} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminHeuristicDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [openHistory, setOpenHistory] = useState<Record<string, boolean>>({});
  const [showLegacy, setShowLegacy] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState(false);

  /*
   * These calls address `/api/admin/heuristics/...`, which is where the routes
   * actually live (`heuristics-routes.ts`).
   *
   * They previously addressed a path no server route registers, and the failure
   * was silent rather than obvious: another route matched it first with different
   * params, so every card returned 400 and this page rendered "Card not found."
   * for all of them while the cards LIST kept working. Contract check 19 now
   * fails the build if a client admin path has no matching server route.
   */
  const { data: card, isLoading } = useQuery<Heuristic & { components: ComponentRow[] }>({
    queryKey: [`/api/admin/heuristics/${id}`],
    queryFn: async () => (await apiRequest("GET", `/api/admin/heuristics/${id}`)).json(),
  });

  const { data: performance } = useQuery<Performance>({
    queryKey: [`/api/admin/heuristics/${id}/performance`],
    queryFn: async () =>
      (await apiRequest("GET", `/api/admin/heuristics/${id}/performance`)).json(),
  });

  const reviseMutation = useMutation({
    mutationFn: async ({ type, content }: { type: ComponentType; content: string }) => {
      const res = await apiRequest(
        "PUT",
        `/api/admin/heuristics/${id}/components/${type}`,
        { content },
      );
      return res.json();
    },
    onSuccess: (revised: ComponentRow, { type }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/heuristics/${id}`] });
      setDrafts((d) => {
        const next = { ...d };
        delete next[type];
        return next;
      });
      setEditing((e) => ({ ...e, [type]: false }));
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
      const res = await apiRequest("PATCH", `/api/admin/heuristics/${id}/status`, { status });
      return res.json();
    },
    onSuccess: (updated: Heuristic) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/heuristics/${id}`] });
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
        <PageShell>
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/methodology/cards")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Methodology
          </Button>
          <Card>
            <CardContent className="py-12 text-center">
              <p className="font-medium">No card with id {id}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                It may have been deleted. The card list shows everything that exists.
              </p>
            </CardContent>
          </Card>
        </PageShell>
      </AdminLayout>
    );
  }

  const all = card.components ?? [];
  const currentFor = (type: ComponentType) =>
    all.find((c) => c.componentType === type && c.isCurrent);
  const historyFor = (type: ComponentType) =>
    all
      .filter((c) => c.componentType === type && !c.isCurrent)
      .sort((a, b) => b.versionNumber - a.versionNumber);

  const valueFor = (type: ComponentType) => drafts[type] ?? currentFor(type)?.content ?? "";
  const isDirty = (type: ComponentType) =>
    drafts[type] !== undefined && drafts[type] !== (currentFor(type)?.content ?? "");

  const startEdit = (type: ComponentType) => {
    setDrafts((d) => ({ ...d, [type]: currentFor(type)?.content ?? "" }));
    setEditing((e) => ({ ...e, [type]: true }));
  };
  const cancelEdit = (type: ComponentType) => {
    setDrafts((d) => {
      const next = { ...d };
      delete next[type];
      return next;
    });
    setEditing((e) => ({ ...e, [type]: false }));
  };

  /*
   * Everything the field components read or call, in one object. Rebuilt each render,
   * which is correct: it re-renders them, where the old nested-function arrangement
   * remounted them. See `FieldCtx` above.
   */
  const fieldCtx: FieldCtx = {
    currentFor,
    historyFor,
    valueFor,
    isDirty,
    editing,
    openHistory,
    savingType: reviseMutation.isPending
      ? (reviseMutation.variables?.type ?? null)
      : null,
    startEdit,
    cancelEdit,
    setDraft: (type, value) => setDrafts((d) => ({ ...d, [type]: value })),
    save: (type) => reviseMutation.mutate({ type, content: drafts[type] ?? "" }),
    toggleHistory: (type) => setOpenHistory((h) => ({ ...h, [type]: !h[type] })),
  };

  const kind = KIND_META[(card.cardKind ?? "coaching_card") as keyof typeof KIND_META];
  const KindIcon = kind.icon;

  const legacyWithContent = fieldsIn("legacy").filter((t) => currentFor(t));
  const coreMissing = fieldsIn("core").filter((t) => !currentFor(t));

  const enoughEvidence =
    (performance?.totalSessionsApplied ?? 0) >= 10 && (performance?.meanComposite ?? 0) > 0;

  return (
    <AdminLayout>
      <PageShell>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit"
          onClick={() => navigate("/admin/methodology/cards")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Methodology
        </Button>

        {/* ── Identity ───────────────────────────────────────────────────── */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {card.cardCode && (
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
                      {card.cardCode}
                    </code>
                  )}
                  <h1 className="text-xl font-semibold tracking-tight">{card.name}</h1>
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">{card.description}</p>
              </div>
              <StatusBadge status={card.status} />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-4 text-xs">
              <span className="flex items-center gap-1.5">
                <KindIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{kind.label}</span>
              </span>
              {card.interventionType && (
                <span className="text-muted-foreground">
                  Intervention type{" "}
                  <Badge variant="outline" className="ml-1 font-mono text-[10px]">
                    {card.interventionType}
                  </Badge>
                </span>
              )}
              <span className="text-muted-foreground">
                {card.populationTags?.length
                  ? `Populations: ${card.populationTags.join(", ")}`
                  : "Applies to every population"}
              </span>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">{kind.note}</p>
          </CardContent>
        </Card>

        {card.status === "candidate" && (
          <Alert className="border-warn/30 bg-warn-soft">
            <AlertTriangle className="h-4 w-4 text-warn" />
            <AlertTitle className="text-warn">This card is a candidate</AlertTitle>
            <AlertDescription className="text-warn">
              If it is in an active sequence it is reaching students right now. Candidate
              means "not yet backed by evidence", not "not live".
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="card">
          <TabsList>
            <TabsTrigger value="card">The card</TabsTrigger>
            <TabsTrigger value="evidence">Evidence</TabsTrigger>
          </TabsList>

          <TabsContent value="card" className="mt-4 space-y-6">
            {coreMissing.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {coreMissing.map((t) => COMPONENT_SPECS[t].label).join(", ")} not written on this
                card.
              </p>
            )}

            <FieldGroupCard group="core" ctx={fieldCtx} />
            <FieldGroupCard group="reference" ctx={fieldCtx} />

            {/* Pre-v2 fields, collapsed. A v2 card leaves all three empty and
                that is correct, so they are not shown as gaps by default. */}
            <div>
              <button
                type="button"
                onClick={() => setShowLegacy((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${showLegacy ? "rotate-180" : ""}`}
                />
                {GROUP_LABELS.legacy}
                <span className="font-normal normal-case tracking-normal">
                  {legacyWithContent.length
                    ? `— ${legacyWithContent.length} in use on this card`
                    : "— none in use, which is expected on a v2 card"}
                </span>
              </button>
              {showLegacy && (
                <div className="mt-2">
                  <Card className="overflow-hidden">
                    <CardContent className="p-0">
                      {fieldsIn("legacy").map((type) => (
                        <FieldRow key={type} type={type} ctx={fieldCtx} />
                      ))}
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="evidence" className="mt-4 space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                label="Sessions applied"
                value={performance?.totalSessionsApplied ?? 0}
                hint="Times this card has fired."
              />
              <StatCard
                label="Students"
                value={performance?.studentsScored ?? 0}
                hint="How many people it has reached."
              />
              <StatCard
                label="Mean composite"
                value={
                  performance?.meanComposite != null
                    ? performance.meanComposite.toFixed(2)
                    : "—"
                }
                hint="Outcome score across those sessions."
              />
            </div>

            {performance && Object.keys(performance.recentOutcomes).length > 0 && (
              <Card>
                <CardContent className="space-y-3 pt-6">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
                    <p className="text-xs text-muted-foreground">
                      Corrections mean students pushed back on this card's framing. Those turns
                      are the most valuable data in the corpus, so a correction counts only −0.5
                      rather than as a failure. Many corrections usually means the framing is too
                      narrow, not that the pattern is wrong.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="space-y-4 pt-6">
                <div>
                  <p className="text-sm font-medium">Lifecycle</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Promotion is your judgement, not a threshold the system enforces.
                    {card.status === "candidate" && !enoughEvidence && (
                      <> This card has little evidence behind it so far.</>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
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
