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

type IntakeState = {
  messages: Message[];
  progress: { satisfied: number; total: number };
  complete: boolean;
  finished: boolean;
};

export default function IntakeChatPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Message[]>([]);
  const [showClosing, setShowClosing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const state = useQuery<IntakeState>({
    queryKey: ["/api/intake"],
    queryFn: async () => (await apiRequest("GET", "/api/intake")).json(),
  });

  const begin = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/intake/begin")).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/intake"] }),
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
  }, [messages.length, begin.isPending]);

  const send = useMutation({
    mutationFn: async (message: string) =>
      (await apiRequest("POST", "/api/intake/message", { message })).json(),
    onSuccess: async () => {
      setPending([]);
      await queryClient.invalidateQueries({ queryKey: ["/api/intake"] });
      inputRef.current?.focus();
    },
    onError: (e: Error) => {
      // The message is already in the transcript server-side — it is recorded
      // before the model is called. Only Wing's reply is missing, so the
      // optimistic bubble stays and nothing needs retyping.
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

  if (state.data?.finished) {
    // Already done — nothing to redo. Send them on rather than restarting.
    navigate("/");
    return null;
  }

  if (showClosing) {
    return <ClosingStep onSubmit={(p) => finish.mutate(p)} pending={finish.isPending} />;
  }

  const canFinish = state.data?.complete === true;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6 sm:px-6">
        <div className="flex-1 space-y-5">
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

          {(send.isPending || begin.isPending) && (
            <div className="flex items-center gap-1.5 pt-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Composer */}
        <div className="sticky bottom-0 space-y-2 bg-background pt-4">
          <div className="flex gap-2">
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
              rows={2}
              // text-base: below 16px iOS zooms on focus and never zooms back.
              className="resize-none text-base sm:text-sm"
              disabled={send.isPending}
            />
            <Button onClick={submit} disabled={!draft.trim() || send.isPending} className="h-auto">
              {send.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          {canFinish && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                That's everything I need — keep going if you want, or wrap up.
              </p>
              <Button variant="outline" size="sm" onClick={() => setShowClosing(true)}>
                Wrap up
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── The closing step ───────────────────────────────────────────────────── */

function ClosingStep({
  onSubmit,
  pending,
}: {
  onSubmit: (payload: Record<string, unknown>) => void;
  pending: boolean;
}) {
  const [race, setRace] = useState("");
  const [gender, setGender] = useState("");
  const [representation, setRepresentation] = useState("");
  const [firstGen, setFirstGen] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [discovery, setDiscovery] = useState("");

  const payload = () => ({
    ...(race ? { race_ethnicity: race } : {}),
    ...(gender ? { gender_identity: gender } : {}),
    ...(representation ? { identity_representation: representation } : {}),
    ...(firstGen ? { first_generation_student: true } : {}),
    ...(discovery ? { discoverySource: discovery } : {}),
    marketingOptIn: marketing,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Last bit, and it's optional</h1>
        <p className="pt-1 text-sm text-muted-foreground">
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
      </div>

      <div className="space-y-3 rounded-md border bg-muted/40 p-4">
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
  );
}
