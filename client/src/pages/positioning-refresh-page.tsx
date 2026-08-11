import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import NavBar from "@/components/nav-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Check, History, Loader2, Send } from "lucide-react";

/**
 * Positioning Refresh — career-evolution re-entry (Feature List A2).
 *
 * ── THE PAGE OPENS WITH THEIR OLD SLI, DELIBERATELY ──────────────────────
 * The spec's requirement is that Wing "acknowledge the prior work" and build on
 * the existing profile "rather than starting from zero". That has to be visible
 * before the conversation starts, not just implied by what Wing says — a
 * returning student needs to see that the platform kept something.
 *
 * The history panel exists for the same reason. "The previous SLI is never
 * deleted — it becomes part of the longitudinal record" is a data guarantee in
 * the spec; showing the chain is what makes it a felt one. Someone on their
 * third statement can see the first, which is the only way a multi-year
 * relationship is visible rather than asserted.
 */

type Message = { role: "assistant" | "user"; content: string };

type RefreshState = {
  available: boolean;
  currentSli: { id: number; statement: string; createdAt: string } | null;
  priorCount: number;
  messages: Message[];
  complete: boolean;
};

type HistoryEntry = {
  id: number;
  statement: string;
  source: string;
  status: string;
  createdAt: string;
  supersededAt: string | null;
};

type Proposal = { statement: string; rationale: string } | null;

const SOURCE_LABEL: Record<string, string> = {
  generated: "Original",
  custom: "Written by you",
  refined: "Refined",
  refresh: "Refreshed",
};

export default function PositioningRefreshPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Message[]>([]);
  const [proposal, setProposal] = useState<Proposal>(null);
  const [showHistory, setShowHistory] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const state = useQuery<RefreshState>({
    queryKey: ["/api/positioning-refresh"],
    queryFn: async () => (await apiRequest("GET", "/api/positioning-refresh")).json(),
  });

  const history = useQuery<HistoryEntry[]>({
    queryKey: ["/api/positioning-refresh/history"],
    queryFn: async () => (await apiRequest("GET", "/api/positioning-refresh/history")).json(),
    enabled: showHistory,
  });

  const begin = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/positioning-refresh/begin")).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/positioning-refresh"] }),
  });

  const send = useMutation({
    mutationFn: async (message: string) =>
      (await apiRequest("POST", "/api/positioning-refresh/message", { message })).json(),
    onSuccess: async (r: { proposal: Proposal; unchanged: boolean }) => {
      setPending([]);
      if (r.proposal) setProposal(r.proposal);
      await queryClient.invalidateQueries({ queryKey: ["/api/positioning-refresh"] });
    },
    onError: (e: Error) => {
      toast({
        title: "Wing didn't reply",
        description: e.message || "Your message was saved. Try again.",
        variant: "destructive",
      });
    },
  });

  const accept = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", "/api/positioning-refresh/accept", proposal!)).json(),
    onSuccess: () => {
      toast({
        title: "Positioning updated",
        description: "Your previous SLI is kept — it's part of your record now.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user/slis"] });
      navigate("/");
    },
    onError: (e: Error) =>
      toast({ title: "Couldn't save that", description: e.message, variant: "destructive" }),
  });

  const messages = [...(state.data?.messages ?? []), ...pending];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, proposal]);

  const submit = () => {
    const text = draft.trim();
    if (!text || send.isPending) return;
    setPending([{ role: "user", content: text }]);
    setDraft("");
    send.mutate(text);
  };

  if (state.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!state.data?.available) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="mx-auto max-w-2xl p-6">
          <h1 className="text-2xl font-semibold tracking-tight">Nothing to refresh yet</h1>
          <p className="pt-2 text-sm text-muted-foreground">
            A refresh builds on positioning you've already worked out. Finish the foundation
            sessions first and this'll be waiting.
          </p>
          <Button className="mt-4" onClick={() => navigate("/")}>
            Back to dashboard
          </Button>
        </div>
      </div>
    );
  }

  const started = messages.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <NavBar />

      <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Positioning refresh</h1>
          <p className="pt-1 text-sm text-muted-foreground">
            Things change — a promotion, a move into something of your own, a different
            industry, or just a sense that this doesn't fit any more.
          </p>
        </div>

        {/* Their current SLI, before anything else happens. */}
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Where you are now
              </span>
              {state.data.priorCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={() => setShowHistory((v) => !v)}
                >
                  <History className="mr-1 h-3.5 w-3.5" />
                  {state.data.priorCount} earlier version
                  {state.data.priorCount === 1 ? "" : "s"}
                </Button>
              )}
            </div>
            <p className="text-[15px] leading-relaxed">"{state.data.currentSli?.statement}"</p>
          </CardContent>
        </Card>

        {showHistory && (
          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                How your positioning has moved
              </p>
              {history.isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {(history.data ?? []).map((h) => (
                <div key={h.id} className="border-l-2 border-muted pl-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {SOURCE_LABEL[h.source] ?? h.source}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(h.createdAt).toLocaleDateString()}
                    </span>
                    {h.status === "active" && (
                      <span className="text-xs text-emerald-600">current</span>
                    )}
                  </div>
                  <p className="pt-1 text-sm text-muted-foreground">"{h.statement}"</p>
                </div>
              ))}
              {/* The spec's guarantee, stated plainly. */}
              <p className="pt-1 text-xs text-muted-foreground">
                Nothing here is ever deleted. Each version stays part of your record.
              </p>
            </CardContent>
          </Card>
        )}

        {!started && (
          <Button onClick={() => begin.mutate()} disabled={begin.isPending}>
            {begin.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Let's look at what's changed
          </Button>
        )}

        {/* Conversation */}
        {started && (
          <div className="space-y-5">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-primary-foreground"
                      : "max-w-[95%]"
                  }
                >
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{m.content}</p>
                </div>
              </div>
            ))}

            {send.isPending && (
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
              </div>
            )}

            {/* The proposal is a decision, not a message. */}
            {proposal && (
              <Card className="border-primary">
                <CardContent className="space-y-3 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Updated positioning
                  </p>
                  <p className="text-[15px] leading-relaxed">"{proposal.statement}"</p>
                  {proposal.rationale && (
                    <p className="text-sm text-muted-foreground">{proposal.rationale}</p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button onClick={() => accept.mutate()} disabled={accept.isPending}>
                      {accept.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      Use this
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setProposal(null)}
                      disabled={accept.isPending}
                    >
                      Not quite — keep talking
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Your current SLI stays on your record either way.
                  </p>
                </CardContent>
              </Card>
            )}

            <div ref={endRef} />

            {!proposal && (
              <div className="flex gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  placeholder="What's changed?"
                  rows={2}
                  className="resize-none text-base sm:text-sm"
                  disabled={send.isPending}
                />
                <Button onClick={submit} disabled={!draft.trim() || send.isPending} className="h-auto">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
