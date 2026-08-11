import { useMutation, useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, RefreshCw, Sparkles, Star, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Section } from "@/components/admin/page";
import { EmptyState, ErrorState, LoadingRows, Spinner } from "@/components/admin/states";
import type { StudentSli } from "./types";

/**
 * The student's Signature Leadership Identity records.
 *
 * ── STATUS IS THE STRUCTURE, NOT A BADGE COLOUR ──────────────────────────
 * SLI records are retire-never-edit: refining one supersedes it rather than
 * overwriting, so a student accumulates a lineage and exactly one of them is
 * live. The old screen listed them as a flat, undifferentiated stack in
 * whatever order the API returned, which made "which one is this student
 * actually using?" a question you answered by reading badges carefully.
 *
 * Here the active record is pulled out and rendered first, at size. Everything
 * else is history, visually subordinate and labelled as such.
 */

const STATUS_ORDER: Record<string, number> = {
  active: 0,
  selected: 1,
  candidate: 2,
  superseded: 3,
};

export function PositioningPanel({ userId }: { userId: number }) {
  const { toast } = useToast();
  const key = [`/api/admin/users/${userId}/slis`];

  const slis = useQuery<StudentSli[]>({
    queryKey: key,
    queryFn: async () => (await apiRequest("GET", `/api/admin/users/${userId}/slis`)).json(),
  });

  const done = (title: string) => {
    queryClient.invalidateQueries({ queryKey: key });
    toast({ title });
  };
  const failed = (e: Error) =>
    toast({ title: "That didn't work", description: e.message, variant: "destructive" });

  const generate = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", `/api/admin/users/${userId}/slis/generate`)).json(),
    onSuccess: () => done("Generated"),
    onError: failed,
  });

  const activate = useMutation({
    mutationFn: async (id: number) =>
      (await apiRequest("PATCH", `/api/admin/slis/${id}`, { activate: true })).json(),
    onSuccess: () => done("Now the active record"),
    onError: failed,
  });

  const remove = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/slis/${id}`),
    onSuccess: () => done("Deleted"),
    onError: failed,
  });

  const all = [...(slis.data ?? [])].sort(
    (a, b) =>
      (STATUS_ORDER[a.status ?? ""] ?? 9) - (STATUS_ORDER[b.status ?? ""] ?? 9) ||
      new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
  );

  const live = all.find((s) => s.status === "active" || s.status === "selected");
  const history = all.filter((s) => s !== live);

  const when = (d?: string | null) =>
    d ? formatDistanceToNow(new Date(d), { addSuffix: true }) : "—";

  if (slis.error) return <ErrorState error={slis.error} onRetry={() => slis.refetch()} />;

  return (
    <div className="space-y-8">
      <Section
        title="Positioning"
        description="Generated from their completed sessions. Refining supersedes rather than overwrites."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
          >
            {generate.isPending ? (
              <Spinner className="mr-2" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Generate
          </Button>
        }
      >
        {slis.isLoading ? (
          <LoadingRows rows={3} />
        ) : all.length === 0 ? (
          <EmptyState
            icon={Star}
            title="No positioning yet"
            description="Records are generated from completed Foundation sessions. If this student has finished all three and there's still nothing here, generating manually is safe — it won't overwrite anything."
            action={
              <Button variant="outline" onClick={() => generate.mutate()} disabled={generate.isPending}>
                {generate.isPending ? <Spinner className="mr-2" /> : null}
                Generate now
              </Button>
            }
          />
        ) : (
          <>
            {live && (
              <Card className="border-brand/30 bg-brand-soft/40 shadow-none">
                <CardContent className="space-y-3 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="gap-1 border-transparent bg-brand text-white hover:bg-brand">
                      <CheckCircle2 className="h-3 w-3" />
                      Live
                    </Badge>
                    {live.version != null && (
                      <Badge variant="outline" className="font-normal">
                        v{live.version}
                      </Badge>
                    )}
                    {live.source && (
                      <Badge variant="outline" className="font-normal capitalize">
                        {live.source.replace(/_/g, " ")}
                      </Badge>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {when(live.createdAt)}
                    </span>
                  </div>
                  <p className="text-base leading-relaxed">{live.statement}</p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </Section>

      {history.length > 0 && (
        <Section
          title="History"
          description="Superseded and unselected records, newest first. Kept — a lineage is evidence of how the positioning developed."
        >
          <div className="space-y-2">
            {history.map((sli) => (
              <div key={sli.id} className="space-y-2 rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-normal capitalize">
                    {sli.status ?? "unknown"}
                  </Badge>
                  {sli.version != null && (
                    <span className="text-xs text-muted-foreground">v{sli.version}</span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {when(sli.createdAt)}
                  </span>
                </div>

                <p className="text-sm leading-relaxed text-muted-foreground">{sli.statement}</p>

                <div className="flex gap-1 pt-1">
                  {sli.status !== "active" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      disabled={activate.isPending}
                      onClick={() => activate.mutate(sli.id)}
                    >
                      <RefreshCw className="mr-1.5 h-3 w-3" />
                      Make live
                    </Button>
                  )}

                  {/*
                    Confirmed, because this is not reversible and the button sits
                    next to one that is. The old screen deleted on a single
                    click of an icon.
                  */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="mr-1.5 h-3 w-3" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this record?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This removes it permanently. The lineage is how we show a student
                          their positioning developed, so deleting a superseded record loses
                          that — normally you want to leave it.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep it</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove.mutate(sli.id)}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
