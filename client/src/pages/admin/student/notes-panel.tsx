import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Pencil, ScrollText, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import type { CoachingNote } from "./types";

/**
 * Advisor notes on this student.
 *
 * ── THE COMPOSER IS ALWAYS THERE ─────────────────────────────────────────
 * The old screen hid note-writing behind a "New note" button that swapped the
 * list for a form. Writing a note is the only reason anyone opens this tab, and
 * putting the single most likely action behind a click — one that also hides
 * the notes you were about to refer to — is backwards. An always-present box at
 * the top costs one text field of space and removes the step.
 *
 * ── THESE ARE PRIVATE, AND THE SCREEN SAYS SO ────────────────────────────
 * Students never see these. That is worth stating on the screen rather than
 * assuming: an advisor unsure who can read a note writes a more careful, less
 * useful note.
 */
export function NotesPanel({ userId }: { userId: number }) {
  const { toast } = useToast();
  const key = [`/api/admin/users/${userId}/coaching-notes`];

  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  const notes = useQuery<CoachingNote[]>({
    queryKey: key,
    queryFn: async () =>
      (await apiRequest("GET", `/api/admin/users/${userId}/coaching-notes`)).json(),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const failed = (e: Error) =>
    toast({ title: "That didn't save", description: e.message, variant: "destructive" });

  const create = useMutation({
    mutationFn: async (content: string) =>
      apiRequest("POST", "/api/admin/coaching-notes", { userId, content }),
    onSuccess: () => {
      refresh();
      setDraft("");
    },
    onError: failed,
  });

  const update = useMutation({
    mutationFn: async ({ id, content }: { id: number; content: string }) =>
      apiRequest("PATCH", `/api/admin/coaching-notes/${id}`, { content }),
    onSuccess: () => {
      refresh();
      setEditingId(null);
    },
    onError: failed,
  });

  const remove = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/coaching-notes/${id}`),
    onSuccess: () => {
      refresh();
      toast({ title: "Note deleted" });
    },
    onError: failed,
  });

  const sorted = [...(notes.data ?? [])].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
  );

  const textOf = (n: CoachingNote) => n.content ?? n.note ?? "";

  if (notes.error) return <ErrorState error={notes.error} onRetry={() => notes.refetch()} />;

  return (
    <div className="space-y-8">
      <Section
        title="Add a note"
        description="Private to advisors — the student never sees these."
      >
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What came up, what to follow up on, anything the next person meeting them should know."
            rows={3}
            className="resize-none text-base sm:text-sm"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!draft.trim() || create.isPending}
              onClick={() => create.mutate(draft.trim())}
            >
              {create.isPending && <Spinner className="mr-2" />}
              Save note
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Notes" description={sorted.length ? `${sorted.length} so far.` : undefined}>
        {notes.isLoading ? (
          <LoadingRows rows={3} />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No notes yet"
            description="Notes carry context between advisors and across meetings. They're also the only place a human judgement about a student is recorded — everything else here is generated."
          />
        ) : (
          <div className="space-y-3">
            {sorted.map((note) => (
              <div key={note.id} className="space-y-2 rounded-lg border p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {note.authorName ? `${note.authorName} · ` : ""}
                    {note.createdAt
                      ? formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })
                      : "—"}
                  </p>

                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground"
                      onClick={() => {
                        setEditingId(note.id);
                        setEditText(textOf(note));
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This can't be undone, and notes are the only human record kept
                            about a student.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep it</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove.mutate(note.id)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                {editingId === note.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={4}
                      className="resize-none text-base sm:text-sm"
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={!editText.trim() || update.isPending}
                        onClick={() => update.mutate({ id: note.id, content: editText.trim() })}
                      >
                        {update.isPending && <Spinner className="mr-2" />}
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{textOf(note)}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
