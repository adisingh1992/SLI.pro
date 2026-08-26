import { useAuth } from '@/hooks/use-auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useLocation, useParams } from 'wouter';
import NavBar from "@/components/nav-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Send, ArrowLeft, Lock, MessageSquare, AlertCircle, LogOut, Compass, Sparkles } from "lucide-react";
import VoiceMicButton from "@/components/VoiceMicButton";
import { useVoiceRecording } from "@/hooks/use-voice-recording";
import { useToast } from "@/hooks/use-toast";
import SessionTimer from "@/components/ui/session-timer";
import { cn } from "@/lib/utils";
import {
  ChatHeader,
  Composer,
  Sheet,
  OutcomeCard,
  Prose,
  RailFact,
  RailHighlight,
  RailMeter,
  RailSection,
  Thinking,
  Transcript,
  Turn,
} from "@/components/chat";

/**
 * Wing session API shapes.
 *
 * The server now returns turns (with provenance) rather than user/assistant
 * messages, and typed artifacts rather than a completionData blob. The chat UI
 * still renders a simple role/content list, so turns are adapted to that shape
 * at the query boundary rather than rewriting the whole component.
 */
type WingSession = {
  id: number;
  sessionType: string;
  sessionNumber: number;
  status: 'locked' | 'available' | 'in_progress' | 'completed' | 'ended_early';
  startedAt?: string | null;
  completedAt?: string | null;
  timerElapsedSeconds: number;
};

type WingTurn = {
  id: number;
  position: number;
  turnType: string;
  provenanceTag: string;
  content: string;
  createdAt: string;
};

type WingArtifact = {
  id: number;
  artifactType: string;
  content: any;
  version: number;
};

type SessionResponse = {
  session: WingSession;
  turns: WingTurn[];
  artifacts: WingArtifact[];
};

/** What the chat UI renders. */
type ChatMessage = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
};

const turnToMessage = (t: WingTurn): ChatMessage => ({
  id: t.id,
  // turn_type decides who spoke — NOT provenance_tag.
  //
  // The comment that used to sit here said provenance was "the source of truth
  // for who spoke". That is true only for live turns, where provenance is a
  // pure function of turn type. Migrated turns are ALL stamped
  // provenance_unknown on purpose, because the legacy corpus has no
  // turn-level provenance — so this rendered every turn of every migrated
  // session as the student, Wing's own replies included.
  //
  // Provenance answers "how far do we trust this record". turn_type answers
  // "who spoke". They are not interchangeable.
  role:
    t.turnType === 'ai_prompt' || t.turnType === 'ai_adapted'
      ? 'assistant'
      : 'user',
  content: t.content,
  createdAt: t.createdAt,
});

/*
 * A2: "Add contextual micro-copy at every transition: what the next section
 * does, approximately how long it takes, and what it will reveal."
 *
 * Finishing a session IS a transition, and it was previously marked only by a
 * toast that vanished after five seconds. Whether the student carries on to
 * the next one is decided in exactly that moment, so it gets a panel that
 * stays on screen rather than a notification that does not.
 */
const NEXT_STEP: Record<number, { title: string; does: string; duration: string; reveals: string }> = {
  1: {
    title: "Session 2 — Professional Credibility Assessment",
    does: "Takes the function you just locked and looks for the evidence behind it.",
    duration: "About 12 minutes",
    reveals: "Which of your claims someone would actually bet on, and which need proof.",
  },
  2: {
    title: "Session 3 — Positioning Story Development",
    does: "Turns the proof you just gathered into the story you'll actually tell.",
    duration: "About 12 minutes",
    reveals: "The answer to \"so what do you do?\" — built from evidence, not adjectives.",
  },
};

/**
 * The turn in flight.
 *
 * ── ONE OBJECT, BECAUSE THREE RACED ──────────────────────────────────────
 * This replaces `optimisticMessage`, `streamingResponse` and `isStreaming`,
 * which were cleared independently against a refetch that landed whenever it
 * landed. Three symptoms came out of that:
 *
 *   duplicated text   the refetch brought the real assistant turn while
 *                     `streamingResponse` still held the same words, so both
 *                     rendered until an effect ran a frame later
 *
 *   vanishing text    the clearing effect compared `messages.length` against a
 *                     count captured before sending. The optimistic user
 *                     message inflated that count, so the comparison could pass
 *                     early and blank the reply mid-flight
 *
 *   stuck text        and when the comparison never passed, the streamed copy
 *                     stayed on screen beside the real one indefinitely
 *
 * The fix is not more careful clearing. It is having something definite to
 * clear against: the server now returns the real turn ids with
 * `turn_complete`, so the client waits until those exact ids appear in fetched
 * data. No counting, no heuristics, no guessing which render won.
 */
type PendingTurn = {
  userText: string;
  assistantText: string;
  /**
   * Messages Wing has finished saying, in order. H-007.
   *
   * The server emits a `break` when the splitter closes a message, and everything
   * streamed up to that point moves here as its own bubble. `assistantText` then keeps
   * only what is still arriving — so a reply becomes several messages without the tokens
   * ever stopping, and the question lands as its own, which is the card's success
   * criterion.
   */
  assistantParts: string[];
  /** Milliseconds to hold before the next bubble starts filling. Zero when not pausing. */
  pauseMs: number;
  /** Confirmed by the server on `turn_complete`. Null until then. */
  humanTurnId: number | null;
  assistantTurnId: number | null;
  /**
   * sending    submitted, nothing back yet
   * streaming  Wing is producing tokens
   * settling   Wing has finished; waiting for the refetch to carry the turns
   */
  phase: 'sending' | 'streaming' | 'settling';
};

export default function FoundationSessionChatPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { sessionNumber: sessionNumberParam } = useParams<{ sessionNumber: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const sessionNumber = parseInt(sessionNumberParam || '1');
  const [currentMessage, setCurrentMessage] = useState('');
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const [allowContinue, setAllowContinue] = useState(false);
  const [showEndSessionDialog, setShowEndSessionDialog] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  /*
   * Monotonic id for the turn currently being sent. See `sendMessage` — a
   * finished turn's stream can outlive the turn itself by half a minute, and
   * this is what stops it writing over its successor.
   */
  const turnTokenRef = useRef(0);

  /*
   * The composer locks while Wing is actually speaking, and unlocks the moment
   * it stops — not when the request finishes. The server keeps the connection
   * open past that point to run measurement work, and making the student wait
   * for bookkeeping is what this whole change is undoing.
   */
  const isSpeaking = pending?.phase === 'sending' || pending?.phase === 'streaming';

  // Voice recording hook
  const voiceRecording = useVoiceRecording({
    userId: user?.id || 0,
    sessionNumber,
    onTranscriptionComplete: (text: string) => {
      // Insert transcribed text into the message input
      setCurrentMessage(prev => prev + (prev ? ' ' : '') + text);
      // Focus the text area for potential editing
      setTimeout(() => messageInputRef.current?.focus(), 100);
    }
  });

  // Validate session number
  if (isNaN(sessionNumber) || sessionNumber < 1 || sessionNumber > 3) {
    navigate('/');
    return null;
  }

  // Fetch session with turns + artifacts
  const { data: sessionData, isLoading, error } = useQuery<SessionResponse>({
    queryKey: ['/api/foundation-sessions', sessionNumber],
    enabled: !!user,
  });

  // Adapt provenance-tagged turns to the role/content list the UI renders.
  const messages: ChatMessage[] = useMemo(
    () => (sessionData?.turns ?? []).map(turnToMessage),
    [sessionData?.turns],
  );

  // The session's outcome artifact (functional_identity / credibility_assessment
  // / signature_story), replacing the MVP's completionData blob.
  const sessionArtifact = useMemo<any>(
    () => sessionData?.artifacts?.[0]?.content ?? null,
    [sessionData?.artifacts],
  );

  // End session early - mirrors normal auto-completion flow
  const endSessionEarlyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/foundation-sessions/${sessionNumber}/end-early`);
      return await response.json();
    },
    onSuccess: (data: any) => {
      // The server runs the analysis on early exit too, so an outcome may have
      // been captured even though the session is marked ended_early.
      const outcome = data?.content;
      let description = '';
      if (sessionNumber === 1) {
        description = outcome?.primaryFunction
          ? `Session ended. Your primary function was identified as ${outcome.primaryFunction}.`
          : `Foundation Session 1 has been ended. Your progress is saved.`;
      } else if (sessionNumber === 2) {
        const tier = outcome?.credibilityTier;
        const brandClaim = outcome?.brandClaim;
        description = tier
          ? `Session ended. Credibility assessed at Tier ${tier}${brandClaim ? `: ${brandClaim}` : ''}.`
          : `Foundation Session 2 has been ended. Your progress is saved.`;
      } else {
        description = outcome
          ? `Session ended and your positioning work was captured.`
          : `Foundation Session ${sessionNumber} has been ended. Your progress is saved.`;
      }

      toast({
        title: data?.methodologyComplete ? "Here's what you built" : "Session ended",
        description,
        duration: 5000,
      });

      queryClient.invalidateQueries({ queryKey: ['/api/foundation-sessions', sessionNumber] });
      queryClient.invalidateQueries({ queryKey: ['/api/foundation-sessions'] });

      setShowEndSessionDialog(false);
      navigate('/');
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't end session",
        description: error?.message || "Failed to end session. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Auto-start session if available
  const startSessionMutation = useMutation({
    mutationFn: async (sessionNumber: number) => {
      return await apiRequest('POST', `/api/foundation-sessions/${sessionNumber}/start`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/foundation-sessions', sessionNumber] });
      queryClient.invalidateQueries({ queryKey: ['/api/foundation-sessions'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start session",
        variant: "destructive",
      });
    },
  });

  // Auto-start session if it's available
  useEffect(() => {
    if (sessionData?.session && sessionData.session.status === 'available' && sessionNumber === 1) {
      startSessionMutation.mutate(sessionNumber);
    }
  }, [sessionData?.session?.status, sessionNumber]);

  /**
   * One turn.
   *
   * The composer is released on `turn_complete` rather than when the response
   * body ends. The server sends that as soon as Wing's reply is durable, then
   * keeps the connection open to run objective scoring and the completion
   * analysis — two model calls the student has no reason to wait through.
   */
  const sendMessage = async (content: string) => {
    const text = content.trim();
    // Blocked only while Wing is actually speaking. `pending` stays set through
    // the 'settling' phase — up to thirty seconds of server-side analysis the
    // student is explicitly not waiting for — and blocking on it meant Enter
    // did nothing at all during that window, with no feedback.
    if (!text || isSpeaking) return;

    /*
     * ── EVERY TURN OWNS A TOKEN ──────────────────────────────────────────
     * `turn_complete` releases the composer as soon as Wing's reply is
     * durable, but the response body stays open for the objective and
     * completion analysis — 23s to release, 54s to body end in the log that
     * produced this comment. So a *finished* turn's reader can still be
     * running when the next turn's has started.
     *
     * Without a token, that reader's final `setPending` acted on whatever
     * `pending` happened to hold — which by then was the NEXT turn. It saw a
     * turn in phase 'sending', concluded the stream had ended prematurely, and
     * threw. Every stale stream reaches for shared state that has moved on.
     *
     * The token makes each reader's writes conditional on still being the
     * current turn. A stale one becomes a no-op instead of a corruption.
     */
    const token = ++turnTokenRef.current;
    const isCurrent = () => turnTokenRef.current === token;
    const updatePending = (fn: (p: PendingTurn) => PendingTurn) =>
      setPending((p) => (p && isCurrent() ? fn(p) : p));

    setPending({
      userText: text,
      assistantText: '',
      assistantParts: [],
      pauseMs: 0,
      humanTurnId: null,
      assistantTurnId: null,
      phase: 'sending',
    });
    // Cleared optimistically, restored below if the send fails. Losing what
    // somebody typed fifteen minutes into a session is not recoverable by
    // them — they have to remember it.
    setCurrentMessage('');

    /*
     * Whether this turn was confirmed, tracked as a plain local.
     *
     * ── WHY NOT READ IT OFF `pending` ────────────────────────────────────
     * The previous version asked React: it called `setPending` with an updater
     * that inspected the phase and threw if it wasn't 'settling'.
     *
     * A state updater must be pure. Throwing from inside one does not raise
     * where you wrote it — the `setPending` call returns normally and React
     * invokes the updater later, during its render phase. So the throw missed
     * the `try/catch` entirely and surfaced as a render error, which unmounted
     * the whole component tree. A student twenty minutes into a session got a
     * blank page. (StrictMode double-invokes updaters in development, which is
     * why it appeared twice in the console.)
     *
     * A local variable answers the same question, belongs to this turn rather
     * than to shared state, and throws where it is written.
     */
    let sawTurnComplete = false;

    try {
      const response = await fetch(
        `/api/foundation-sessions/${sessionNumber}/messages/stream`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text }),
          credentials: 'include',
        },
      );

      if (!response.ok) {
        throw new Error(
          (await response.text()) || `Request failed with ${response.status}`,
        );
      }
      if (!response.body) throw new Error('Streaming is not supported by this browser');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line. The last piece is kept
        // because it may be a partial frame.
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const line = frame.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;

          let event: any;
          try {
            event = JSON.parse(line.slice(6));
          } catch {
            // A malformed frame is not worth ending the turn over.
            continue;
          }

          if (event.type === 'chunk') {
            updatePending((p) => ({
              ...p,
              phase: 'streaming',
              assistantText: p.assistantText + event.content,
            }));
          } else if (event.type === 'break') {
            /*
             * H-007. The server's splitter has closed a message: everything streamed so
             * far becomes its own bubble and the next tokens start a new one.
             *
             * The await holds this loop, so frames arriving during the pause queue in the
             * reader and render after it. Nothing is dropped — they are still in the
             * buffer — and holding is what makes the gap read as a pause rather than as
             * text sliding under a stalled bubble.
             *
             * Correctness never depends on the timing. `assistantContent` is assembled
             * server-side and the turn is saved from that, so a client that skips every
             * pause, or a tab that is backgrounded through all of them, still ends with
             * exactly what Wing said.
             */
            const pauseMs = typeof event.pauseMs === 'number' ? event.pauseMs : 0;
            updatePending((p) => {
              const closed = p.assistantText.trim();
              if (!closed) return p;
              return {
                ...p,
                assistantParts: [...p.assistantParts, closed],
                assistantText: '',
                pauseMs,
              };
            });
            if (pauseMs > 0) {
              await new Promise((r) => setTimeout(r, pauseMs));
              updatePending((p) => ({ ...p, pauseMs: 0 }));
            }
          } else if (event.type === 'turn_complete') {
            sawTurnComplete = true;
            /*
             * Wing has stopped speaking and both turns are saved. Unlock the
             * composer now — everything the server does after this point is
             * measurement, and the student is free to carry on.
             */
            updatePending((p) => ({
              ...p,
              phase: 'settling',
              humanTurnId: event.humanTurnId ?? null,
              assistantTurnId: event.assistantTurnId ?? null,
            }));
            queryClient.invalidateQueries({
              queryKey: ['/api/foundation-sessions', sessionNumber],
            });
            // Don't steal focus back to the composer if the student has already
            // started the next turn.
            if (isCurrent()) setTimeout(() => messageInputRef.current?.focus(), 0);
          } else if (event.type === 'session_completed') {
            const c = event.content ?? {};
            toast({
              title: "Here's what you built",
              description:
                sessionNumber === 1
                  ? `Your primary function: ${c.primaryFunction ?? 'identified'}.`
                  : sessionNumber === 2
                    ? `Tier ${c.credibilityTier} evidence${c.brandClaim ? ` — ${c.brandClaim}` : ''}.`
                    : `Foundation Session ${sessionNumber} is saved. You can reread it any time.`,
              duration: 6000,
            });
            queryClient.invalidateQueries({
              queryKey: ['/api/foundation-sessions', sessionNumber],
            });
            queryClient.invalidateQueries({ queryKey: ['/api/foundation-sessions'] });
          } else if (event.type === 'error') {
            throw new Error(event.message || 'The conversation hit a problem');
          }
        }
      }

      // The body ended. If `turn_complete` never arrived the reply is not
      // saved, and pretending otherwise would strand a half-turn on screen.
      // Asked of this turn's own flag, and thrown here, where the catch below
      // can actually see it.
      if (!sawTurnComplete) {
        throw new Error('The connection closed while Wing was still speaking');
      }

      queryClient.invalidateQueries({ queryKey: ['/api/foundation-sessions'] });
    } catch (error: any) {
      // A turn that has been superseded fails quietly. Its reply is either
      // already durable or already gone; either way the student is mid-way
      // through a newer turn and a destructive toast about an older one would
      // be both confusing and wrong.
      if (!isCurrent()) return;

      setPending(null);
      // Give them their words back rather than making them retype.
      setCurrentMessage((current) => current || text);
      toast({
        title: "That didn't send",
        description: error?.message || 'Check your connection and try again.',
        variant: 'destructive',
      });
      setTimeout(() => messageInputRef.current?.focus(), 0);
    }
  };

  /*
   * Retire the pending turn once the fetched data actually contains it.
   *
   * Keyed on the turn ids the server confirmed, not on how many messages there
   * are. The old version compared `messages.length` to a count captured before
   * sending — which the optimistic bubble itself inflated, so it could clear
   * the streamed reply before the real one had arrived. That is the
   * disappearing text.
   */
  useEffect(() => {
    if (!pending || pending.phase !== 'settling') return;
    if (pending.assistantTurnId == null) return;
    if (messages.some((m) => m.id === pending.assistantTurnId)) setPending(null);
  }, [messages, pending]);

  // Follow the conversation. `smooth` only while reading; the first paint of a
  // long transcript should not animate through every turn.
  const hasScrolledRef = useRef(false);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: hasScrolledRef.current ? 'smooth' : 'auto',
    });
    hasScrolledRef.current = true;
  }, [messages, pending?.assistantText, pending?.userText]);

  // Handle message submission
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentMessage.trim() || isSpeaking) {
      return;
    }

    const messageContent = currentMessage.trim();
    await sendMessage(messageContent);
  };

  // Session-specific guardrails and guidance
  const getSessionGuidance = () => {
    if (sessionNumber === 1) {
      return {
        title: "Functional Identity Mapping",
        description: "Define your primary business function and positioning (7-9 minutes)",
        prompt: "Hello, I'm here to help you identify your primary business function (Finance, Operations, Sales, Marketing, or Product). Let's start by discussing your current role and what energizes you most about work.",
        functions: ["Finance", "Operations", "Sales", "Marketing", "Product"]
      };
    } else if (sessionNumber === 2) {
      return {
        title: "Professional Credibility Assessment",
        description: "Identify measurable expertise and business impact (8-10 minutes)",
        prompt: "If I'm writing you a $1M check because you're credible, what SPECIFIC expertise am I investing in? Think like a ruthless, revenue-only investor: what would they throw $1M at YOU to do?",
        functions: ["Finance", "Operations", "Sales", "Marketing", "Product"]
      };
    } else if (sessionNumber === 3) {
      return {
        title: "Positioning Story Development",
        description: "Extract compelling stories that prove your unique value (9-10 minutes)",
        prompt: "'I led cross-functional teams' means nothing by itself. We'll excavate the HOW, WHY, STRUGGLE, and INSIGHT so your stories prove credibility and fuel your brand.",
        functions: ["Finance", "Operations", "Sales", "Marketing", "Product"]
      };
    }
    return {
      title: `Session ${sessionNumber}`,
      description: "This session is not yet available.",
      prompt: "This session is coming soon.",
      functions: []
    };
  };

  const sessionInfo = getSessionGuidance();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="flex items-center justify-center min-h-[calc(100vh-80px)]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (error || !sessionData || !sessionData.session) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-6 text-center">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-red-600 mb-4">Error loading Foundation Session</p>
              <Button onClick={() => navigate('/')} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { session } = sessionData;

  // Check if session is locked
  if (session.status === 'locked') {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-6 text-center">
              <Lock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Session Locked</h2>
              <p className="text-muted-foreground mb-4">
                Complete the previous session to unlock Session {sessionNumber}.
              </p>
              <Button onClick={() => navigate('/')} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Block access to sessions beyond Session 3
  if (sessionNumber > 3) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-6 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Coming Soon</h2>
              <p className="text-muted-foreground mb-4">
                Session {sessionNumber} is not yet available. Focus on completing Sessions 1, 2, and 3 first.
              </p>
              <Button onClick={() => navigate('/')} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    /*
     * ── NO HEIGHT ARITHMETIC ─────────────────────────────────────────────────
     * This was `h-[calc(100dvh-57px)]` on the row below, and it was wrong: 57px
     * is the chat header alone. The app nav bar sits above it and was never in
     * the sum, so the conversation ran roughly its own height past the bottom
     * of the window and the composer sat below the fold.
     *
     * The previous value, 104/140px, happened to be right — it was two magic
     * numbers that matched two components. Redesigning the header changed one
     * of them and there was nothing to say so.
     *
     * So: a flex column the height of the viewport, with both bars `shrink-0`
     * and the body `flex-1 min-h-0`. The browser does the arithmetic, and it
     * cannot go stale when a header gains a line or a nav bar changes padding.
     * `min-h-0` is the load-bearing part — without it a flex child refuses to
     * shrink below its content and the overflow comes straight back.
     */
    <div className="flex h-[100dvh] flex-col bg-canvas">
      <div className="shrink-0">
        <NavBar />
      </div>
      
      {/*
        The header carries the timer and the exit.

        Both used to live only in the right-hand rail, which is `hidden lg:`.
        On a phone the student could neither see the time nor leave a session
        they had started — "the full journey must function on mobile" is not
        satisfied by a journey you cannot exit. Putting them here means one
        implementation for both widths instead of a duplicated mobile bar.
      */}
      <ChatHeader
        title={sessionInfo.title}
        subtitle={sessionInfo.description}
        onBack={() => navigate('/')}
        meta={
          (session.status === 'in_progress' || session.status === 'completed') && (
            <div className="flex items-center gap-1">
              <SessionTimer
                isSessionActive={session.status === 'in_progress'}
                isSessionCompleted={session.status === 'completed'}
                sessionNumber={sessionNumber}
                initialTimerElapsed={session.timerElapsedSeconds || 0}
              />
              {session.status === 'in_progress' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-[13px] text-ink-soft hover:text-bad lg:hidden"
                  onClick={() => setShowEndSessionDialog(true)}
                  disabled={isSpeaking || endSessionEarlyMutation.isPending}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="sr-only">End session early</span>
                </Button>
              )}
            </div>
          )
        }
      />

      {/*
        Two columns: the conversation, and a rail that is reference material.

        `dvh`, not `vh`. On iOS Safari and Android Chrome `100vh` is the
        viewport height with the address bar HIDDEN, so a 100vh container is
        taller than what is actually on screen — and the thing pushed off the
        bottom here is the message box. The student opens the session and cannot
        see where to type. `dvh` tracks the real visible height as the browser
        chrome collapses.
      */}
      {/*
        Paper on a desk.

        The page is `--canvas`; the conversation and each rail card are white
        sheets on top of it. The first pass had everything on one white plane
        with no edges, which read as elements floating in space rather than as
        a document with a margin — the header, the transcript and the rail all
        appeared unrelated to each other.

        `px-6` matches the header's gutters exactly, so the title sits above
        the sheet's left edge and the timer above the rail. Alignment is what
        was actually missing; the surfaces make it legible.
      */}
      <div className="flex min-h-0 flex-1 gap-4 p-4 sm:gap-5 sm:px-6 sm:py-5">
        <Sheet className="w-full min-w-0 lg:w-[72%]">
          <Transcript>
            {messages.map((message, index) => (
              <Turn
                key={message.id}
                role={message.role === 'user' ? 'user' : 'assistant'}
                time={message.createdAt}
                testId={`message-${message.role}-${index}`}
              >
                {message.role === 'user' ? message.content : <Prose content={message.content} />}
              </Turn>
            ))}

            {/*
              The turn in flight.

              Each is suppressed the moment the real turn is present in fetched
              data, so there is never a frame with both. The old version
              rendered the streamed copy until an effect cleared it a frame
              later, which is where the duplicate flash came from.
            */}
            {pending && !messages.some((m) => m.id === pending.humanTurnId) && (
              <Turn role="user" testId="message-pending-user">
                {pending.userText}
              </Turn>
            )}

            {pending &&
              !messages.some((m) => m.id === pending.assistantTurnId) && (
                <>
                  {/* Messages Wing has finished saying, one bubble each. */}
                  {pending.assistantParts.map((part, i) => (
                    <Turn role="assistant" key={`part-${i}`} testId={`message-pending-assistant-${i}`}>
                      <Prose content={part} />
                    </Turn>
                  ))}

                  {/*
                    The one still arriving. During a pause it is empty and the typing
                    indicator stands in — without it the gap reads as the app hanging,
                    which is the opposite of what the pause is for.
                  */}
                  {pending.assistantText ? (
                    <Turn role="assistant" testId="message-pending-assistant">
                      <Prose content={pending.assistantText} />
                    </Turn>
                  ) : (
                    <Thinking />
                  )}
                </>
              )}

            {/*
              The end of a finished session, in the transcript rather than in
              the rail — it is the next thing to read after Wing's last turn,
              and on a phone the rail does not exist.
            */}
            {session.status === 'completed' && !allowContinue && (
              <div className="space-y-4 pt-2">
                {/*
                  IG-UX03. Was a tick beside "this one's done" — a checkmark and
                  completion language in the same four words, which is the card's two
                  visual and verbal signals at once. Her replacement is creation language:
                  the session produced something and it is kept, rather than a task being
                  crossed off.
                */}
                <div className="flex items-start gap-2 text-[14px] text-ink-soft">
                  <p>Everything from this session is saved — the conversation above stays here if you want to reread it.</p>
                </div>

                {NEXT_STEP[sessionNumber] ? (
                  <OutcomeCard
                    eyebrow="What's next"
                    title={NEXT_STEP[sessionNumber].title}
                    action={
                      <>
                        <Button onClick={() => navigate(`/foundation/session/${sessionNumber + 1}`)}>
                          Start {NEXT_STEP[sessionNumber].title.split(' — ')[0]}
                        </Button>
                        <span className="text-[11px] uppercase tracking-[0.08em] text-ink-soft">
                          {NEXT_STEP[sessionNumber].duration}
                        </span>
                      </>
                    }
                  >
                    <p>{NEXT_STEP[sessionNumber].does}</p>
                    <p className="pt-2 text-ink">
                      <span className="text-ink-soft">You'll come away with — </span>
                      {NEXT_STEP[sessionNumber].reveals}
                    </p>
                  </OutcomeCard>
                ) : (
                  <OutcomeCard
                    eyebrow="Built"
                    title="That's all three."
                    action={<Button onClick={() => navigate('/')}>Back to dashboard</Button>}
                  >
                    Your positioning foundation is built. The optional modules and the rest
                    of the tools are on your dashboard whenever you want them.
                  </OutcomeCard>
                )}

                <Button
                  onClick={() => setAllowContinue(true)}
                  variant="ghost"
                  size="sm"
                  className="text-ink-soft hover:text-ink"
                  data-testid="button-continue-chat"
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Or keep talking about this one
                </Button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </Transcript>

          {(session.status === 'in_progress' ||
            (session.status === 'completed' && allowContinue)) && (
            <Composer
              note={
                voiceRecording.isProcessing ? (
                  <span className="animate-pulse" data-testid="text-voice-status">
                    Processing voice…
                  </span>
                ) : voiceRecording.isRecording ? (
                  <span className="font-medium text-bad" data-testid="text-voice-status">
                    Recording — tap the mic to stop
                  </span>
                ) : null
              }
            >
              <form onSubmit={handleSendMessage}>
                {/*
                  One framed row rather than three separate controls with gaps
                  between them. The mic and send sit inside the field's border,
                  which is what makes the composer read as a single place to
                  write instead of a toolbar.
                */}
                <div className="flex items-end gap-1 rounded-2xl border border-rule bg-background p-1.5 transition-colors focus-within:border-brand/40">
                  <VoiceMicButton
                    isRecording={voiceRecording.isRecording}
                    isProcessing={voiceRecording.isProcessing}
                    disabled={isSpeaking}
                    onClick={voiceRecording.toggleRecording}
                  />
                  <Textarea
                    ref={messageInputRef}
                    value={currentMessage}
                    placeholder="Type your answer, or tap the mic…"
                    onChange={(e) => setCurrentMessage(e.target.value)}
                    /*
                      text-base, not text-sm. Below 16px iOS zooms the page on
                      focus and never zooms back — see index.css. Explicit here
                      because this is the one input a student spends a whole
                      session in.
                    */
                    className="max-h-40 min-h-9 flex-1 resize-none border-0 bg-transparent px-2 py-[6px] text-base leading-6 text-ink shadow-none placeholder:text-ink-soft/60 focus-visible:ring-0 sm:text-[15px]"
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                    disabled={isSpeaking || voiceRecording.isRecording}
                    data-testid="input-message"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!currentMessage.trim() || isSpeaking || voiceRecording.isRecording}
                    data-testid="button-send-message"
                    className="h-9 w-9 shrink-0 rounded-full bg-brand text-white hover:bg-brand/90"
                  >
                    {isSpeaking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </form>
            </Composer>
          )}
        </Sheet>

        {/*
          The rail. Reference, not controls — everything here can be ignored
          without losing the session, which is why it is allowed to disappear
          below `lg`. The one genuine control it used to hold alone was End
          Session Early; that now also lives in the header, so a student on a
          phone can still leave.

          Cards on the canvas rather than one bordered column: each of these is
          a separate thing to look up, and they were previously distinguishable
          only by their labels.
        */}
        <aside className="hidden w-[28%] min-w-[17rem] shrink-0 overflow-y-auto lg:block">
          <div className="space-y-4">
            {(sessionNumber === 1 || sessionNumber === 2) && (
              <RailSection
                title={sessionNumber === 1 ? 'Target functions' : 'Credibility areas'}
                tone="info"
                icon={<Compass className="h-3.5 w-3.5" />}
              >
                <div className="flex flex-wrap gap-1.5">
                  {sessionInfo.functions.map((func) => {
                    /*
                     * Once the session has landed on one, that chip is the
                     * answer and the rest are the field it was chosen from.
                     * Colour marks the difference; before that they are all
                     * equally live and all read the same.
                     */
                    const chosen = sessionArtifact?.primaryFunction === func;
                    return (
                      <span
                        key={func}
                        className={cn(
                          'rounded-full px-2.5 py-1 text-[12px] transition-colors',
                          chosen
                            ? 'bg-brand font-medium text-white'
                            : 'bg-info-soft text-info',
                        )}
                      >
                        {func}
                      </span>
                    );
                  })}
                </div>
              </RailSection>
            )}

            {session.status === 'completed' && sessionArtifact && (
              <RailSection
                title="What this session found"
                tone="brand"
                icon={<Sparkles className="h-3.5 w-3.5" />}
              >
                <div className="space-y-4">
                  {/* The deliverable, treated as the deliverable. */}
                  {sessionArtifact.primaryFunction && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] uppercase tracking-[0.06em] text-ink-soft">
                        Primary function
                      </p>
                      <RailHighlight>{sessionArtifact.primaryFunction}</RailHighlight>
                    </div>
                  )}

                  <dl>
                    {sessionArtifact.secondaryFunction && (
                      <RailFact label="Secondary" value={sessionArtifact.secondaryFunction} />
                    )}
                    {sessionArtifact.credibilityTier && (
                      <RailFact
                        label="Credibility tier"
                        value={
                          /*
                           * A badge, not a sentence — but deliberately NOT
                           * colour-scaled by number. Whether tier 1 is the
                           * strongest or the weakest is a methodology question
                           * I have not confirmed, and a green tier 1 next to a
                           * red tier 3 would assert an answer to it. `deep` is
                           * the methodology accent and carries no ranking.
                           */
                          <span className="inline-flex items-center rounded-md bg-deep-soft px-2 py-0.5 text-[13px] font-medium text-deep">
                            Tier {sessionArtifact.credibilityTier}
                          </span>
                        }
                      />
                    )}
                    {sessionArtifact.brandClaim && (
                      <RailFact
                        label="Brand claim"
                        value={
                          <span className="border-l-2 border-brand/30 pl-3 block italic">
                            {sessionArtifact.brandClaim}
                          </span>
                        }
                      />
                    )}
                  </dl>

                  {sessionArtifact.confidence != null && (
                    <RailMeter value={sessionArtifact.confidence} label="Confidence" />
                  )}
                </div>
              </RailSection>
            )}

            {session.status === 'in_progress' && (
              <RailSection
                title="If you need to stop"
                tone="warn"
                icon={<LogOut className="h-3.5 w-3.5" />}
              >
                <p className="text-[13px] leading-relaxed text-ink-soft">
                  Your progress is saved as you go. Finishing in one sitting gives the best
                  result, but you can come back.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full border-rule text-ink-soft hover:border-bad/40 hover:bg-bad-soft hover:text-bad"
                  onClick={() => setShowEndSessionDialog(true)}
                  disabled={isSpeaking || endSessionEarlyMutation.isPending}
                >
                  <LogOut className="mr-2 h-3.5 w-3.5" />
                  End session early
                </Button>
              </RailSection>
            )}
          </div>
        </aside>
      </div>

      {/* End Session Early Dialog */}
      <Dialog open={showEndSessionDialog} onOpenChange={setShowEndSessionDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>End this session early?</DialogTitle>
            <DialogDescription className="pt-2 leading-relaxed">
              This session works best in one sitting. Leaving now may weaken the positioning it produces.
              <br /><br />
              Everything so far is saved. You can come back any time — one sitting still gives the best result.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowEndSessionDialog(false)}
              className="sm:mr-2"
              disabled={endSessionEarlyMutation.isPending}
            >
              Keep Going
            </Button>
            <Button
              variant="destructive"
              onClick={() => endSessionEarlyMutation.mutate()}
              disabled={endSessionEarlyMutation.isPending}
              data-testid="button-end-session-confirm"
            >
              {endSessionEarlyMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Ending Session...
                </>
              ) : (
                'End Session Anyway'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}