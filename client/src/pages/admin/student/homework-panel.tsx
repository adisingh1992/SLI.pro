import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BookOpen, Check, Plus, Trash2, Undo2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Section } from "@/components/admin/page";
import { EmptyState, ErrorState, LoadingRows, Spinner } from "@/components/admin/states";
import { cn } from "@/lib/utils";
import type { HomeworkAssignment } from "./types";

/**
 * Homework set for this student between sessions.
 *
 * ── OPEN AND DONE ARE SEPARATED ──────────────────────────────────────────
 * The old screen rendered one undifferentiated list ordered by creation date,
 * so a student with a term of completed work had their two outstanding items
 * buried in the middle of it. Outstanding work is the only part anyone opens
 * this tab to see; completed work is a record you consult occasionally.
 */

const isDone = (h: HomeworkAssignment) =>
  h.status === "completed" || h.status === "complete" || !!h.completedAt;

export function HomeworkPanel({ userId }: { userId: number }) {
  const { toast } = useToast();
  const key = [`/api/admin/users/${userId}/homework`];

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");

  const homework = useQuery<HomeworkAssignment[]>({
    queryKey: key,
    queryFn: async () => (await apiRequest("GET", `/api/admin/users/${userId}/homework`)).json(),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const failed = (e: Error) =>
    toast({ title: "That didn't work", description: e.message, variant: "destructive" });

  const create = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/admin/users/${userId}/homework`, {
        title: title.trim(),
        description: description.trim() || null,
        dueDate: dueDate || null,
      }),
    onSuccess: () => {
      refresh();
      setOpen(false);
      setTitle("");
      setDescription("");
      setDueDate("");
      toast({ title: "Assigned" });
    },
    onError: failed,
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/admin/homework/${id}`, { status }),
    onSuccess: refresh,
    onError: failed,
  });

  const remove = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/homework/${id}`),
    onSuccess: () => {
      refresh();
      toast({ title: "Removed" });
    },
    onError: failed,
  });

  const all = homework.data ?? [];
  const outstanding = all.filter((h) => !isDone(h));
  const completed = all.filter(isDone);

  const fmt = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;

  const overdue = (h: HomeworkAssignment) =>
    !!h.dueDate && !isDone(h) && new Date(h.dueDate) < new Date(new Date().toDateString());

  const Item = ({ h }: { h: HomeworkAssignment }) => (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-lg border p-4",
        isDone(h) && "bg-muted/30",
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn("text-sm font-medium", isDone(h) && "text-muted-foreground")}>
            {h.title}
          </p>
          {overdue(h) && (
            <Badge variant="destructive" className="text-[10px] font-normal">
              overdue
            </Badge>
          )}
        </div>
        {h.description && (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{h.description}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {h.dueDate ? `Due ${fmt(h.dueDate)}` : "No due date"}
          {h.completedAt && ` · completed ${fmt(h.completedAt)}`}
        </p>
      </div>

      <div className="flex shrink-0 gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          disabled={setStatus.isPending}
          onClick={() =>
            setStatus.mutate({ id: h.id, status: isDone(h) ? "pending" : "completed" })
          }
        >
          {isDone(h) ? (
            <>
              <Undo2 className="mr-1.5 h-3 w-3" />
              Reopen
            </>
          ) : (
            <>
              <Check className="mr-1.5 h-3 w-3" />
              Done
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          disabled={remove.isPending}
          onClick={() => remove.mutate(h.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );

  if (homework.error) {
    return <ErrorState error={homework.error} onRetry={() => homework.refetch()} />;
  }

  return (
    <div className="space-y-8">
      <Section
        title="Outstanding"
        description="What this student still owes."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="mr-1.5 h-4 w-4" />
                Assign
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Assign homework</DialogTitle>
                <DialogDescription>
                  This appears on the student's dashboard. Wing does not mention it in
                  session — an advisor set it, so an advisor should raise it.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="hw-title">What are they doing?</Label>
                  <Input
                    id="hw-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Draft three versions of your LinkedIn headline"
                    className="text-base sm:text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hw-desc">Detail (optional)</Label>
                  <Textarea
                    id="hw-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="resize-none text-base sm:text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hw-due">Due (optional)</Label>
                  <Input
                    id="hw-due"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-auto text-base sm:text-sm"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  disabled={!title.trim() || create.isPending}
                  onClick={() => create.mutate()}
                >
                  {create.isPending && <Spinner className="mr-2" />}
                  Assign
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      >
        {homework.isLoading ? (
          <LoadingRows rows={2} />
        ) : outstanding.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={all.length === 0 ? "Nothing assigned" : "All caught up"}
            description={
              all.length === 0
                ? "Homework is optional and set by an advisor — most students never have any. Wing sets its own follow-ups inside a session, and those don't appear here."
                : "Everything assigned has been completed."
            }
          />
        ) : (
          <div className="space-y-2">
            {outstanding.map((h) => (
              <Item key={h.id} h={h} />
            ))}
          </div>
        )}
      </Section>

      {completed.length > 0 && (
        <Section title="Completed" description={`${completed.length} finished.`}>
          <div className="space-y-2">
            {completed.map((h) => (
              <Item key={h.id} h={h} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
