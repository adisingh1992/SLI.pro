import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  ChatHeader,
  ChatShell,
  Composer,
  Sheet,
  Prose,
  Thinking,
  Transcript,
  Turn,
} from "@/components/chat";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GENDER_IDENTITY_OPTIONS,
  IDENTITY_REPRESENTATION_OPTIONS,
  MARKETING_TEXT,
  PRIVACY_TEXT,
  RACE_ETHNICITY_OPTIONS,
} from "@/lib/intake-constants";
import { Loader2, Send } from "lucide-react";

/**
 * The conversational intake (Feature List A1) — Wing's first interaction.
 *
 * Replaces a six-stage form that users called clinical and burdensome, and
 * whose final screen 43% of registrants never got past.
 *
 * ── NO PROGRESS BAR, DELIBERATELY ────────────────────────────────────────
 * The form had "Stage 3 of 6" at the top. A counter is honest in a form and
 * corrosive in a conversation: it turns every reply into a step toward
 * finishing rather than something worth saying, and it invites people to
 * optimise for the end of the bar. The server tracks progress; the student
 * sees a conversation. There is a quiet indicator once the required beats are
 * done, because at that point knowing you may stop is useful rather than
 * distracting.
 *
 * ── DEMOGRAPHICS ARE A FORM, AND THAT IS THE RIGHT CHOICE ────────────────
 * Race, gender identity, representation and marketing consent appear as an
 * explicit optional step after the conversation. Consent has to be
 * unambiguous and analytics need exact values, and being asked your ethnicity
 * by a chatbot is more intrusive than a labelled optional field, not less.
 * Every control here can be left alone and the step skipped outright.
 */

/** Mirrors the discovery_source enum on wing.users. */
const DISCOVERY_OPTIONS = [
  { value: "university_partnership", label: "University partnership" },
  { value: "colleague_or_mentor", label: "Colleague or mentor" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "web_search", label: "Web search" },
  { value: "professional_network_or_conference", label: "Professional network or conference" },
  { value: "other", label: "Somewhere else" },
] as const;

type Message = { role: "assistant" | "user"; content: string };

/** One message of a paced reply, as `delivery` sends it. */
type Chunk = { text: string; pauseBeforeMs: number; isQuestion: boolean };

type TurnResponse = {
  reply: string;
  delivery?: Chunk[];
  pauseAfterMs?: number;
};

type IntakeState = {
  messages: Message[];
  progress: { satisfied: number; total: number };
  complete: boolean;
  finished: boolean;
  /** IG-S06 is active for this user, so the demographics step must not be shown. */
  protectedFooting?: boolean;
};

export default function IntakeChatPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Message[]>([]);
  const [showClosing, setShowClosing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /*
   * ── PACED DELIVERY (H-007) ─────────────────────────────────────────────
   * The server splits a reply into the messages a student should receive and says how long
   * to wait before each. Delivering them all at once is the thing the card exists to stop:
   * its success criterion is that the student answers the FINAL message rather than the
   * framing, and a wall of text has no final message.
   *
   * `paced` is true while a sequence is playing, so the typing indicator shows in the gaps
   * — the gap is the whole effect, and without the indicator it reads as the app hanging.
   */
  const [paced, setPaced] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** Chunks scheduled but not yet on screen, so an interruption knows what it is flushing. */
  const queued = useRef<Chunk[]>([]);

  const stopPacing = () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  };

  /*
   * H-007's failure path: "if student skips ahead before Wing finishes the sequence, adapt
   * and follow their lead rather than insisting on completing the welcome sequence."
   *
   * Followed by flushing the rest immediately rather than discarding it, and the reason is
   * the transcript. The server records every chunk when it generates them, so a discarded
   * chunk is text Wing believes it said and the student never saw — and the next prompt is
   * built from that transcript. Flushing keeps the record true and still stops making them
   * wait, which is the part of "follow their lead" that a student can feel.
   *
   * The alternative is acknowledging each chunk back to the server so only delivered ones
   * are recorded. That is the correct version and it is a round trip per message. Flagged
   * for Danielle: whether skipping ahead should erase what Wing had queued is hers.
   */
  const flushPacing = (): Message[] => {
    stopPacing();
    const rest = queued.current;
    queued.current = [];
    setPaced(false);
    return rest.map((c) => ({ role: "assistant" as const, content: c.text }));
  };

  // Timers must not outlive the page.
  useEffect(() => stopPacing, []);

  /**
   * Appends each chunk after its own pause, then hands back to the server transcript.
   *
   * Cumulative delays rather than chained timeouts: one `setTimeout` per chunk scheduled
   * up front means an interruption clears all of them at once, and a slow render cannot
   * make the sequence drift longer than the server budgeted for.
   */
  const pace = (delivery: Chunk[], done: () => void) => {
    stopPacing();
    queued.current = delivery.slice();
    setPaced(true);
    let at = 0;
    delivery.forEach((chunk, i) => {
      at += chunk.pauseBeforeMs;
      timers.current.push(
        setTimeout(() => {
          queued.current = queued.current.filter((c) => c !== chunk);
          setPending((p) => [...p, { role: "assistant", content: chunk.text }]);
          if (i === delivery.length - 1) {
            setPaced(false);
            done();
          }
        }, at),
      );
    });
  };

  const state = useQuery<IntakeState>({
    queryKey: ["/api/intake"],
    queryFn: async () => (await apiRequest("GET", "/api/intake")).json(),
  });

  const begin = useMutation({
    mutationFn: async (): Promise<TurnResponse> =>
      (await apiRequest("POST", "/api/intake/begin")).json(),
    onSuccess: (data) => {
      /*
       * The opening is the case H-007 describes most directly: greeting, framing, then Q1.
       * Delivered as one block it buries the question the student is meant to answer.
       */
      const settle = () => {
        setPending([]);
        void queryClient.invalidateQueries({ queryKey: ["/api/intake"] });
      };
      if (!data.delivery?.length) {
        settle();
        return;
      }
      pace(data.delivery, settle);
    },
  });

  // Opens the conversation the first time the page is seen. `begin` is
  // idempotent server-side, so a double render cannot produce two openings.
  useEffect(() => {
    if (state.data && state.data.messages.length === 0 && !begin.isPending) {
      begin.mutate();
    }
  }, [state.data?.messages.length]);

  const messages = [...(state.data?.messages ?? []), ...pending];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, begin.isPending, paced]);

  const send = useMutation({
    mutationFn: async (message: string): Promise<TurnResponse> =>
      (await apiRequest("POST", "/api/intake/message", { message })).json(),
    onSuccess: async (data) => {
      /*
       * Refetching immediately would drop Wing's whole reply in at once, because the
       * server has already recorded every chunk. So the transcript is only refreshed
       * once the sequence has played out, and until then the paced bubbles live in
       * `pending` beside the student's own optimistic one.
       */
      const settle = () => {
        setPending([]);
        void queryClient.invalidateQueries({ queryKey: ["/api/intake"] });
        inputRef.current?.focus();
      };

      // No delivery plan means a server that predates pacing. One message, as before.
      if (!data.delivery?.length) {
        settle();
        return;
      }
      pace(data.delivery, settle);
    },
    onError: (e: Error) => {
      // The message is already in the transcript server-side — it is recorded
      // before the model is called. Only Wing's reply is missing, so the
      // optimistic bubble stays and nothing needs retyping.
      stopPacing();
      queued.current = [];
      setPaced(false);
      setPending((p) => p.filter((m) => m.role !== "assistant"));
      toast({
        title: "Wing didn't reply",
        description: e.message || "Your message was saved. Try sending again.",
        variant: "destructive",
      });
    },
  });

  const finish = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await apiRequest("POST", "/api/intake/finish", payload)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      navigate("/");
    },
    onError: (e: Error) =>
      toast({ title: "Couldn't save that", description: e.message, variant: "destructive" }),
  });

  const submit = () => {
    const text = draft.trim();
    if (!text || send.isPending) return;

    /*
     * H-007's failure path, and the reason `pending` is composed here rather than
     * replaced. Sending mid-sequence must not wipe the chunks already on screen, and the
     * ones still queued are flushed rather than dropped so the transcript the server
     * recorded matches what the student saw.
     *
     * The assistant filter is what keeps a retry after a failed turn to one bubble: on
     * that path `pending` still holds the student's message, and appending would show it
     * twice.
     */
    const flushed = flushPacing();
    setPending((p) => [
      ...p.filter((m) => m.role === "assistant"),
      ...flushed,
      { role: "user", content: text },
    ]);
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

  if (state.data?.finished) {
    // Already done — nothing to redo. Send them on rather than restarting.
    navigate("/");
    return null;
  }

  if (showClosing) {
    /*
     * IG-S06: a user who has told Wing they are under eighteen is not asked for race,
     * gender identity, identity representation or first-generation status. The step is
     * skipped rather than rendered-and-ignored — asking and then discarding is still
     * asking — and the intake finishes with the fields the step also collects and the
     * gate does not touch.
     *
     * The server refuses the demographic fields whatever this does, so a stale bundle
     * cannot reintroduce them. This stops the question being put.
     */
    if (state.data?.protectedFooting) {
      return <ClosingStep onSubmit={(p) => finish.mutate(p)} pending={finish.isPending} demographicsOff />;
    }
    return <ClosingStep onSubmit={(p) => finish.mutate(p)} pending={finish.isPending} />;
  }

  const canFinish = state.data?.complete === true;

  /*
   * The intake is the first screen a new student ever sees, so it carries the
   * most weight per pixel of anything in the product. It uses the same
   * primitives as the two coaching surfaces — same turns, same composer, same
   * thinking indicator — because arriving at Foundation Session 1 should feel
   * like continuing a conversation rather than moving to a different product.
   *
   * No side rail and no timer: there is nothing to reference and nothing to
   * time. The header is the only chrome.
   */
  return (
    <ChatShell>
      <ChatHeader
        title="Let's start with you"
        subtitle="A short conversation so Wing knows who it's working with"
      />

      {/*
        One sheet on the canvas. Narrower than a session's, because there is no
        rail beside it and a full-width column of conversation on a large
        display has nothing anchoring it.
      */}
      <div className="flex min-h-0 flex-1 justify-center p-4 sm:px-6 sm:py-5">
        <Sheet className="w-full max-w-3xl">
          <Transcript>
            {messages.map((m, i) => (
              <Turn
                key={i}
                role={m.role === "user" ? "user" : "assistant"}
                testId={`intake-${m.role}-${i}`}
              >
                {m.role === "user" ? m.content : <Prose content={m.content} />}
              </Turn>
            ))}

            {(send.isPending || begin.isPending || paced) && <Thinking />}

            <div ref={endRef} />
          </Transcript>

          <Composer
        note={
          canFinish ? (
            <div className="flex items-center justify-between gap-3">
              <span>That's everything I need — keep going if you want, or wrap up.</span>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 border-rule"
                onClick={() => setShowClosing(true)}
              >
                Wrap up
              </Button>
            </div>
          ) : null
        }
      >
        <div className="flex items-end gap-1 rounded-2xl border border-rule bg-background p-1.5 transition-colors focus-within:border-brand/40">
          <Textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Type your answer…"
            rows={1}
            // text-base: below 16px iOS zooms on focus and never zooms back.
            className="max-h-40 min-h-9 flex-1 resize-none border-0 bg-transparent px-2 py-[6px] text-base leading-6 text-ink shadow-none placeholder:text-ink-soft/60 focus-visible:ring-0 sm:text-[15px]"
            disabled={send.isPending}
          />
          <Button
            onClick={submit}
            size="icon"
            disabled={!draft.trim() || send.isPending}
            className="h-9 w-9 shrink-0 rounded-full bg-brand text-white hover:bg-brand/90"
          >
            {send.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
          </Composer>
        </Sheet>
      </div>
    </ChatShell>
  );
}

/* ── The closing step ───────────────────────────────────────────────────── */

function ClosingStep({
  onSubmit,
  pending,
  demographicsOff = false,
}: {
  onSubmit: (payload: Record<string, unknown>) => void;
  pending: boolean;
  /**
   * IG-S06 is active. Race, gender identity, under-representation and first-generation
   * status are not asked for at all — not rendered disabled, not rendered and ignored.
   * The rest of the step stays: how they heard about SLI.pro and the marketing opt-in
   * are not demographic and the gate does not touch them.
   */
  demographicsOff?: boolean;
}) {
  const [race, setRace] = useState("");
  const [gender, setGender] = useState("");
  const [representation, setRepresentation] = useState("");
  const [firstGen, setFirstGen] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [discovery, setDiscovery] = useState("");

  /*
   * Under IG-S06 the four demographic fields are omitted from the payload as well as
   * from the form. They cannot hold a value — nothing sets them when the inputs are not
   * rendered — but building the payload without them says the intent in the one place a
   * reader checks, rather than relying on four pieces of state staying empty.
   */
  const payload = () => ({
    ...(demographicsOff
      ? {}
      : {
          ...(race ? { race_ethnicity: race } : {}),
          ...(gender ? { gender_identity: gender } : {}),
          ...(representation ? { identity_representation: representation } : {}),
          ...(firstGen ? { first_generation_student: true } : {}),
        }),
    ...(discovery ? { discoverySource: discovery } : {}),
    marketingOptIn: marketing,
  });

  return (
    <div className="min-h-[100dvh] bg-canvas">
      <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          Last bit, and it's optional
        </h1>
        <p className="pt-1 text-[14px] leading-relaxed text-ink-soft">
          This helps your institution understand who the programme is reaching. Every question
          here can be left blank — it changes nothing about how Wing works with you.
        </p>
      </div>

      <div className="space-y-4">
        {/* Attribution, not demography — but it belongs here for the same
            reason: it needs an exact value and it would break the register if
            Wing asked it mid-conversation. */}
        <div className="space-y-2">
          <Label>How did you hear about SLI.pro?</Label>
          <Select value={discovery} onValueChange={setDiscovery}>
            <SelectTrigger>
              <SelectValue placeholder="Prefer not to say" />
            </SelectTrigger>
            <SelectContent>
              {DISCOVERY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* IG-S06: not asked at all when the protected footing is active. */}
        {!demographicsOff && (
          <>
            <div className="space-y-2">
            <Label>Race or ethnicity</Label>
            <Select value={race} onValueChange={setRace}>
              <SelectTrigger>
                <SelectValue placeholder="Prefer not to say" />
              </SelectTrigger>
              <SelectContent>
                {RACE_ETHNICITY_OPTIONS.map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Gender identity</Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger>
                <SelectValue placeholder="Prefer not to say" />
              </SelectTrigger>
              <SelectContent>
                {GENDER_IDENTITY_OPTIONS.map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Do you consider yourself under-represented in your field?</Label>
            <Select value={representation} onValueChange={setRepresentation}>
              <SelectTrigger>
                <SelectValue placeholder="Prefer not to say" />
              </SelectTrigger>
              <SelectContent>
                {IDENTITY_REPRESENTATION_OPTIONS.map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <Checkbox
              checked={firstGen}
              onCheckedChange={(v) => setFirstGen(v === true)}
              className="mt-0.5"
            />
            <span>I'm the first in my family to attend university</span>
          </label>
          </>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-rule bg-background p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">{PRIVACY_TEXT}</p>
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <Checkbox
            checked={marketing}
            onCheckedChange={(v) => setMarketing(v === true)}
            className="mt-0.5"
          />
          <span>
            Send me occasional positioning insights
            <span className="block text-xs text-muted-foreground">{MARKETING_TEXT}</span>
          </span>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onSubmit(payload())} disabled={pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Finish
        </Button>
        {/* Skip submits nothing but the consent default — an explicit path out
            rather than leaving people to guess whether they can. */}
        <Button
          variant="ghost"
          onClick={() => onSubmit({ marketingOptIn: false })}
          disabled={pending}
        >
          Skip this
        </Button>
      </div>
      </div>
    </div>
  );
}
