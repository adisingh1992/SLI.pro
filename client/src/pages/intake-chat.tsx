import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { MessageRow } from "@/components/wing/chat/Bubbles";
import { toneFor, type Msg } from "@/lib/wing-api";
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
 *
 * ── THE TRANSCRIPT IS `MessageRow`, NOT ITS OWN BUBBLE STYLE ─────────────
 * This used to render through `@/components/chat` (`Turn`/`Prose`/`Sheet`), a
 * generic set of primitives shared with the two coaching surfaces before
 * those were rebuilt onto Wing's own chat. That left intake — a brand-new
 * student's very first screen — visually behind the conversation it hands
 * off to: boxed turns and shadcn form colours instead of Wing's aqua/wine
 * bubbles.
 *
 * It now renders with the literal same `MessageRow` component `WingChatPage`
 * uses (`@/components/wing/chat/Bubbles`), by mapping intake's own
 * `{role, content}` messages onto `Msg`. Not a re-styled copy — the same
 * component, so this page is guaranteed to render identically to the rest of
 * Wing's chat rather than tracking it by hand.
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

  // Grows the composer with its content, same as the main chat's — a fixed
  // one-line box is the detail that made this page read as a form field
  // rather than a conversation.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

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
    /*
     * ── BOTH QUERIES, AWAITED, BEFORE THE NAVIGATE ───────────────────────────
     * `ProtectedRoute` gates every non-intake route on `useQuery(["/api/branding-intake"])`
     * — specifically `brandingIntake?.completed === true`. This mutation is what flips
     * `completed` to true server-side, but it was only ever invalidating `["/api/user"]`.
     *
     * So `navigate("/")` fired immediately after `/api/intake/finish` returned, while the
     * branding-intake query was still serving its last cached (incomplete) value. The very
     * next render of `ProtectedRoute` saw stale data, didn't see intake as done, and bounced
     * straight back to `/branding-intake` — the redirect a student could only escape with a
     * manual refresh, because a refetch-in-the-background eventually settled the cache too
     * late to matter.
     *
     * Fixed the same way the signup redirect was fixed earlier: await the invalidation (both
     * of them — `/api/user` still matters for anything reading professional_status off it)
     * before navigating, so the first render after `finish` already sees `completed: true`.
     */
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/user"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/branding-intake"] }),
      ]);
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
  const busy = send.isPending || begin.isPending || paced;

  /*
   * `Msg`, mapped from intake's own `{role, content}` messages so the
   * transcript can hand them straight to `MessageRow` — the same component
   * `WingChatPage` renders. `tone` doesn't change how a bubble looks
   * (`MessageRow` only branches on `role`); it's set anyway so the shape is
   * the real `Msg` type rather than a lookalike.
   */
  const wingMessages: Msg[] = messages.map((m, i) =>
    m.role === "user"
      ? { id: `intake-${i}`, role: "user", text: m.content }
      : { id: `intake-${i}`, role: "wing", tone: toneFor(m.content), text: m.content },
  );

  /*
   * The intake is the first screen a new student ever sees, so it carries the
   * most weight per pixel of anything in the product. It now renders with
   * Wing's own chat shell and bubbles rather than the generic primitives the
   * two coaching surfaces used before their own rebuild — arriving at
   * Foundation Session 1 should feel like continuing a conversation rather
   * than moving to a different product.
   *
   * No `AppShell` here on purpose: that sidebar lists a student's threads and
   * lets them navigate the app, and intake is the gate every route redirects
   * to until it's done (see `protected-route.tsx`) — offering a way out of it
   * would undercut the gate. So this is `AppShell`'s canvas and column
   * proportions without its rail: `bg-wing-canvas`, the same `label-eyebrow`
   * header, the same `max-w-[720px]` centred transcript.
   */
  return (
    <div className="flex h-screen flex-col bg-wing-canvas text-forest">
      <header className="shrink-0 px-6 pb-3 pt-5 md:px-10">
        <p className="label-eyebrow">Let's start with you</p>
        <p className="mt-2 text-sm text-plum/70">
          A short conversation so Wing knows who it's working with
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 md:px-10">
        <div className="mx-auto flex max-w-[720px] flex-col gap-6 pb-4">
          {wingMessages.map((m, i) => (
            <MessageRow key={m.id} msg={m} isLastOfRun={wingMessages[i + 1]?.role !== m.role} />
          ))}

          {busy && (
            <MessageRow msg={{ id: "intake-thinking", role: "thinking", text: "" }} isLastOfRun />
          )}

          <div ref={endRef} className="h-24" />
        </div>
      </div>

      <div className="shrink-0 bg-gradient-to-t from-wing-canvas via-wing-canvas px-6 pb-6 md:px-10">
        <div className="mx-auto max-w-[720px] space-y-2">
          {canFinish && (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-aqua-light px-4 py-2.5 text-sm text-wine">
              <span>That's everything I need — keep going if you want, or wrap up.</span>
              <Button
                size="sm"
                onClick={() => setShowClosing(true)}
                className="h-auto shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-wine ring-1 ring-wing-border hover:bg-white/80"
              >
                Wrap up
              </Button>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex items-end gap-3 rounded-3xl bg-white px-4 py-3 shadow-[0_6px_24px_-12px_rgba(42,42,56,0.35)] ring-1 ring-wing-border"
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Type your answer.."
              aria-label="Your message"
              disabled={send.isPending}
              // text-[16px]: below that, iOS zooms in on focus and never zooms back out.
              className="min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-1.5 text-[16px] leading-relaxed text-forest outline-none placeholder:text-plum/60"
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={!draft.trim() || send.isPending}
              className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-salmon text-white transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
            >
              {send.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
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
