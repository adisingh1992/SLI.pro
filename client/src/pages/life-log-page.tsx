import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import NavBar from "@/components/nav-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Briefcase, Loader2, RefreshCw, Send } from "lucide-react";

/**
 * The life log (Feature List B2).
 *
 * ── THE PROMPT IS A SUGGESTION, NOT A QUESTION ───────────────────────────
 * The spec is explicit: "faded suggested text that inspires but doesn't
 * constrain. The user always has the option to write freely." So it renders as
 * placeholder text inside an empty box — start typing and it disappears. It is
 * deliberately NOT a label above the field, because a label makes the box an
 * answer slot and the whole design intent is that writing about something else
 * is a correct use of the feature.
 *
 * The prompt id is still recorded when they write, so we know what was on
 * screen — but nothing claims their entry answered it.
 *
 * ── WHY THE INTERNSHIP DATE LIVES HERE ───────────────────────────────────
 * B3 E2 sends a day-30 and a day-60 message to students who have started an
 * internship. Nothing in the platform can detect that, so someone has to say
 * so — and it should be the student, because an advisor asked to enter it will
 * not. This is the page where a student already comes to record what is
 * happening in their working life, so the control sits here rather than in
 * profile settings, and it stays collapsed until they open it: it is relevant
 * to a minority of students on any given day and should not read as a required
 * field.
 *
 * ── ENTRIES ARE NEVER LOST TO A MODEL OUTAGE ─────────────────────────────
 * The server saves the entry first and attaches Wing's reply after. An entry
 * with no reply shows a retry rather than a placeholder pretending Wing said
 * something — the student can tell the difference, and a canned "Thanks for
 * sharing!" would be exactly the hollow-enthusiasm anti-pattern the Voice Guide
 * names.
 */

type Entry = {
  id: number;
  entryType: string;
  entryText: string;
  wingResponse: string | null;
  captureSource: string;
  promptText: string | null;
  createdAt: string;
};

type Prompt = { id: number; text: string; category: string } | null;

type LogResponse = {
  entries: Entry[];
  prompt: Prompt;
  summary: { total: number; last30Days: number; lastEntryAt: string | null };
};

const when = (iso: string) => {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export default function LifeLogPage() {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [entryType, setEntryType] = useState<"career" | "personal">("career");

  const log = useQuery<LogResponse>({
    queryKey: ["/api/life-log"],
    queryFn: async () => (await apiRequest("GET", "/api/life-log")).json(),
  });

  const [prompt, setPrompt] = useState<Prompt>(null);
  const active = prompt ?? log.data?.prompt ?? null;

  const anotherPrompt = useMutation({
    mutationFn: async () => (await apiRequest("GET", "/api/life-log/prompt")).json(),
    onSuccess: (r: { prompt: Prompt }) => setPrompt(r.prompt),
  });

  const save = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("POST", "/api/life-log", {
          entryText: text,
          entryType,
          promptId: active?.id ?? null,
        })
      ).json(),
    onSuccess: () => {
      setText("");
      setPrompt(null);
      queryClient.invalidateQueries({ queryKey: ["/api/life-log"] });
    },
    onError: (e: Error) =>
      toast({ title: "Couldn't save that", description: e.message, variant: "destructive" }),
  });

  const retry = useMutation({
    mutationFn: async (id: number) =>
      (await apiRequest("POST", `/api/life-log/${id}/response`)).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/life-log"] }),
    onError: () =>
      toast({ title: "Wing couldn't reply", description: "Try again in a moment.", variant: "destructive" }),
  });

  /* ── Internship start (B3 E2) ──────────────────────────────────────── */
  const [showInternship, setShowInternship] = useState(false);
  const [internshipDraft, setInternshipDraft] = useState("");

  const internship = useQuery<{ startDate: string | null }>({
    queryKey: ["/api/user/internship"],
    queryFn: async () => (await apiRequest("GET", "/api/user/internship")).json(),
  });

  const saveInternship = useMutation({
    mutationFn: async (startDate: string | null) =>
      (await apiRequest("PUT", "/api/user/internship", { startDate })).json(),
    onSuccess: (r: { startDate: string | null }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/internship"] });
      setShowInternship(false);
      toast({
        title: r.startDate ? "Noted" : "Cleared",
        description: r.startDate
          ? "Wing will check in a month in, and again at two."
          : "No more internship check-ins.",
      });
    },
    onError: (e: Error) =>
      toast({ title: "Couldn't save that", description: e.message, variant: "destructive" }),
  });

  const internshipStart = internship.data?.startDate ?? null;
  const today = new Date().toISOString().slice(0, 10);

  const entries = log.data?.entries ?? [];

  return (
    <div className="min-h-screen bg-background">
      <NavBar />

      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your log</h1>
          <p className="text-sm text-muted-foreground">
            What's happening — interviews, conversations, things that went well or didn't. A
            couple of sentences is plenty.
          </p>
        </div>

        {/* ── Write ────────────────────────────────────────────────────── */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              // The prompt lives here, as placeholder — not as a label. See the
              // note at the top of this file.
              placeholder={active?.text ?? "What happened?"}
              rows={5}
              // text-base on mobile: below 16px iOS zooms on focus and never
              // zooms back.
              className="resize-none text-base sm:text-sm"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={entryType === "career" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setEntryType("career")}
                >
                  Career
                </Button>
                <Button
                  type="button"
                  variant={entryType === "personal" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setEntryType("personal")}
                >
                  Personal
                </Button>

                {active && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => anotherPrompt.mutate()}
                    disabled={anotherPrompt.isPending}
                  >
                    <RefreshCw
                      className={`mr-1 h-3.5 w-3.5 ${anotherPrompt.isPending ? "animate-spin" : ""}`}
                    />
                    Another nudge
                  </Button>
                )}
              </div>

              <Button
                onClick={() => save.mutate()}
                disabled={!text.trim() || save.isPending}
              >
                {save.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Save
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Internship start (B3 E2) ─────────────────────────────────── */}
        <div className="rounded-md border border-dashed p-3">
          {!showInternship ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 text-left text-sm text-muted-foreground hover:text-foreground"
              onClick={() => {
                setInternshipDraft(internshipStart ?? "");
                setShowInternship(true);
              }}
            >
              <Briefcase className="h-4 w-4 shrink-0" />
              {internshipStart ? (
                <span>
                  Internship started{" "}
                  <span className="font-medium text-foreground">
                    {new Date(`${internshipStart}T00:00:00`).toLocaleDateString(undefined, {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>{" "}
                  · change
                </span>
              ) : (
                <span>Started an internship or new role? Tell Wing when.</span>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">
                Wing checks in a month in, and again at two — the points where there's usually
                something worth writing down.
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="date"
                  value={internshipDraft}
                  onChange={(e) => setInternshipDraft(e.target.value)}
                  className="w-auto text-base sm:text-sm"
                />
                <Button
                  size="sm"
                  disabled={!internshipDraft || saveInternship.isPending}
                  onClick={() => saveInternship.mutate(internshipDraft)}
                >
                  {saveInternship.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowInternship(false)}>
                  Cancel
                </Button>
                {internshipStart && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    disabled={saveInternship.isPending}
                    onClick={() => saveInternship.mutate(null)}
                  >
                    Remove
                  </Button>
                )}
              </div>

              {/*
                The milestones fire on an exact date match, so a start date more
                than sixty days back has already passed both. Saying so beats
                promising check-ins that will never arrive.
              */}
              {internshipDraft &&
                internshipDraft <
                  new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10) && (
                  <p className="text-xs text-muted-foreground">
                    That's more than two months ago — both check-ins have passed, so this is
                    just for the record.
                  </p>
                )}
              {internshipDraft > today && (
                <p className="text-xs text-muted-foreground">
                  Starting soon — the first check-in lands a month after that date.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── History ──────────────────────────────────────────────────── */}
        {log.isLoading && (
          <div className="flex justify-center p-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!log.isLoading && entries.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Nothing logged yet. The first one is the hardest.
          </p>
        )}

        <div className="space-y-4">
          {entries.map((e) => (
            <Card key={e.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{when(e.createdAt)}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {e.entryType}
                  </Badge>
                  {e.captureSource !== "in_app" && (
                    <Badge variant="outline" className="text-[10px]">
                      via {e.captureSource.replace("_", " ")}
                    </Badge>
                  )}
                </div>

                <p className="whitespace-pre-wrap text-sm">{e.entryText}</p>

                {e.wingResponse ? (
                  <div className="rounded-md border-l-2 border-primary bg-muted/40 p-3">
                    <p className="whitespace-pre-wrap text-sm">{e.wingResponse}</p>
                    <p className="pt-1 text-xs text-muted-foreground">Wing</p>
                  </div>
                ) : (
                  /* No fabricated reply. An entry Wing hasn't answered says so. */
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">Wing hasn't replied to this one.</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      disabled={retry.isPending}
                      onClick={() => retry.mutate(e.id)}
                    >
                      {retry.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "Ask again"
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
