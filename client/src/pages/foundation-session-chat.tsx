import { useAuth } from '@/hooks/use-auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useLocation, useParams } from 'wouter';
import NavBar from "@/components/nav-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Send, ArrowLeft, Lock, CheckCircle, MessageSquare, AlertCircle, LogOut } from "lucide-react";
import VoiceMicButton from "@/components/VoiceMicButton";
import { useVoiceRecording } from "@/hooks/use-voice-recording";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import SessionTimer from "@/components/ui/session-timer";

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
        title: data?.methodologyComplete ? "Session Completed!" : "Session Ended",
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
              title: 'Session complete',
              description:
                sessionNumber === 1
                  ? `Your primary function: ${c.primaryFunction ?? 'identified'}.`
                  : sessionNumber === 2
                    ? `Tier ${c.credibilityTier} evidence${c.brandClaim ? ` — ${c.brandClaim}` : ''}.`
                    : `Foundation Session ${sessionNumber} is done.`,
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
        throw new Error('The connection closed before Wing finished');
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
    <div className="min-h-screen bg-background">
      <NavBar />
      
      {/* Header — the description is desktop-only; on a phone the vertical
          space it costs is space the conversation needs. */}
      <div className="w-full px-4 py-2 border-b bg-background">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4">
            <Button
              onClick={() => navigate('/')}
              variant="outline"
              size="sm"
              data-testid="button-back-to-overview"
            >
              <ArrowLeft className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Back</span>
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold text-foreground sm:text-2xl" data-testid="text-session-title">
                {sessionInfo.title}
              </h1>
              <p className="hidden text-sm text-muted-foreground sm:block">{sessionInfo.description}</p>
            </div>
          </div>
        </div>
      </div>

      {/*
        2-column layout.

        `dvh`, not `vh`. On iOS Safari and Android Chrome `100vh` is the
        viewport height with the address bar HIDDEN, so a 100vh container is
        taller than what is actually on screen — and the thing pushed off the
        bottom here is the message box. The student opens the session and cannot
        see where to type. `dvh` tracks the real visible height as the browser
        chrome collapses.

        The subtracted header is smaller on mobile because the header itself is:
        the description is hidden and the title drops to text-base.
      */}
      <div className="flex h-[calc(100dvh-104px)] sm:h-[calc(100dvh-140px)]">
        {/* Left Column - Chat Interface (75%) */}
        <div className="w-full lg:w-3/4 flex flex-col">
          {/*
            Mobile session bar.

            The right-hand column is `hidden lg:block`, so on a phone the timer
            and the End Session Early button did not exist at all — and the
            second of those is a control, not decoration. A student on mobile
            had no way to leave a session they had started. "The full user
            journey must function on mobile" (B5) is not satisfied by a journey
            you cannot exit.

            Sits inside the flex column rather than above it, so it takes its
            space from the scroll area and the height calc above stays honest.
          */}
          {(session.status === 'in_progress' || session.status === 'completed') && (
            <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-1.5 lg:hidden">
              <SessionTimer
                isSessionActive={session.status === 'in_progress'}
                isSessionCompleted={session.status === 'completed'}
                className="border-0 bg-transparent p-0 text-xs"
                sessionNumber={sessionNumber}
                initialTimerElapsed={session.timerElapsedSeconds || 0}
              />
              {session.status === 'in_progress' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 px-2 text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => setShowEndSessionDialog(true)}
                  disabled={isSpeaking || endSessionEarlyMutation.isPending}
                >
                  <LogOut className="mr-1 h-3.5 w-3.5" />
                  End
                </Button>
              )}
            </div>
          )}

          {/* Chat Interface */}
          <Card className="flex-1 flex flex-col overflow-hidden m-0 rounded-none">       
          <CardContent className="flex-1 min-h-0 flex flex-col p-0 overflow-hidden py-2">
            {/* Messages Area */}
            <ScrollArea className="flex-1 min-h-0 px-3 sm:px-6">
              <div className="space-y-4 pb-4">

                {/* Conversation messages */}
                {messages.map((message, index) => (
                  <div 
                    key={message.id} 
                    className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                    data-testid={`message-${message.role}-${index}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      message.role === 'user' 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {message.role === 'user' ? (user?.firstName?.[0]?.toUpperCase() || 'U') : 'S'}
                    </div>
                    <div className={`flex-1 ${message.role === 'user' ? 'max-w-[calc(100%-6rem)]' : 'max-w-[calc(100%-6rem)]'}`}>
                      <div className={`rounded-lg p-4 break-words ${
                        message.role === 'user' 
                          ? 'bg-primary text-primary-foreground ml-8' 
                          : 'bg-muted mr-8'
                      }`}>
                        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                      </div>
                      <p className={`text-xs text-muted-foreground mt-1 ${
                        message.role === 'user' ? 'text-right' : ''
                      }`}>
                        {message.role === 'user' ? 'You' : 'SLI'} • {message.createdAt ? new Date(message.createdAt).toLocaleTimeString() : ""}
                      </p>
                    </div>
                  </div>
                ))}

                {/*
                  The turn in flight.

                  Each bubble is suppressed the moment the real turn is present
                  in fetched data, so there is never a frame with both. The old
                  version rendered the streamed copy until an effect cleared it
                  a frame later, which is where the duplicate flash came from.
                */}
                {pending && !messages.some((m) => m.id === pending.humanTurnId) && (
                  <div className="flex gap-3 flex-row-reverse" data-testid="message-pending-user">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-primary text-primary-foreground">
                      {user?.firstName?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1 max-w-[calc(100%-6rem)]">
                      <div className="rounded-lg p-4 break-words bg-primary text-primary-foreground ml-8">
                        <p className="text-sm whitespace-pre-wrap break-words">{pending.userText}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 text-right">You</p>
                    </div>
                  </div>
                )}

                {pending &&
                  !messages.some((m) => m.id === pending.assistantTurnId) && (
                    <div className="flex gap-3" data-testid="message-pending-assistant">
                      <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center shrink-0">
                        {pending.phase === 'settling' ? (
                          'S'
                        ) : (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                      </div>
                      <div className="flex-1 max-w-[calc(100%-6rem)]">
                        <div className="bg-muted rounded-lg p-4 mr-8 break-words">
                          {pending.assistantText ? (
                            <p className="text-sm whitespace-pre-wrap break-words">
                              {pending.assistantText}
                            </p>
                          ) : (
                            /* Nothing has arrived yet. Three dots rather than
                               an empty bubble, which reads as a broken turn. */
                            <span className="flex gap-1 py-1" aria-label="Wing is thinking">
                              {[0, 150, 300].map((delay) => (
                                <span
                                  key={delay}
                                  className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-pulse"
                                  style={{ animationDelay: `${delay}ms` }}
                                />
                              ))}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          SLI{pending.phase === 'settling' ? '' : ' • typing...'}
                        </p>
                      </div>
                    </div>
                  )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Message Input */}
            {(session.status === 'in_progress' || (session.status === 'completed' && allowContinue)) && (
              <div className="border-t p-3 sm:p-6">
                <form onSubmit={handleSendMessage}>
                  <div className="flex gap-2">
                    <VoiceMicButton
                      isRecording={voiceRecording.isRecording}
                      isProcessing={voiceRecording.isProcessing}
                      disabled={isSpeaking}
                      onClick={voiceRecording.toggleRecording}
                    />
                    <Textarea
                      ref={messageInputRef}
                      value={currentMessage}
                      // Shorter placeholder on mobile: the full sentence wraps
                      // to three lines in a 60px box and hides itself.
                      placeholder="Type or tap the mic to speak..."
                      onChange={(e) => setCurrentMessage(e.target.value)}
                      // text-base, not text-sm. Below 16px iOS zooms the page on
                      // focus and never zooms back — see index.css. The global
                      // rule covers this too; it is explicit here because this
                      // is the one input a student spends a whole session in.
                      className="min-h-[60px] resize-none text-base sm:text-sm flex-1"
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
                      size="default"
                      disabled={!currentMessage.trim() || isSpeaking || voiceRecording.isRecording}
                      data-testid="button-send-message"
                      className="h-[60px]"
                    >
                      {isSpeaking ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </form>
                
                {/* Status indicator */}
                {(voiceRecording.isRecording || voiceRecording.isProcessing) && (
                  <div className="mt-2 text-sm">
                    {voiceRecording.isProcessing ? (
                      <p className="text-muted-foreground animate-pulse" data-testid="text-voice-status">
                        Processing voice...
                      </p>
                    ) : voiceRecording.isRecording ? (
                      <p className="text-red-600 dark:text-red-400 font-medium" data-testid="text-voice-status">
                        Recording... Click mic to stop
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            {/* Completed session — the transition to what comes next. */}
            {session.status === 'completed' && !allowContinue && (
              <div className="border-t p-4 sm:p-6 space-y-4">
                <div className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                  <p className="text-sm text-muted-foreground">
                    This one's done — the conversation above stays here if you want to reread it.
                  </p>
                </div>

                {NEXT_STEP[sessionNumber] && (
                  <div className="rounded-md border bg-muted/40 p-4">
                    <p className="text-sm font-medium">Next: {NEXT_STEP[sessionNumber].title}</p>
                    <p className="pt-1 text-sm text-muted-foreground">
                      {NEXT_STEP[sessionNumber].does}
                    </p>
                    <p className="pt-2 text-sm">
                      <span className="text-muted-foreground">You'll come away with — </span>
                      {NEXT_STEP[sessionNumber].reveals}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 pt-3">
                      <Button onClick={() => navigate(`/foundation/session/${sessionNumber + 1}`)}>
                        Start {NEXT_STEP[sessionNumber].title.split(' — ')[0]}
                      </Button>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        {NEXT_STEP[sessionNumber].duration}
                      </span>
                    </div>
                  </div>
                )}

                {/* Session 3 has no next session — the arc is finished. */}
                {!NEXT_STEP[sessionNumber] && (
                  <div className="rounded-md border bg-muted/40 p-4">
                    <p className="text-sm font-medium">That's all three.</p>
                    <p className="pt-1 text-sm text-muted-foreground">
                      Your positioning work is done. The optional modules and the rest of the
                      tools are on your dashboard whenever you want them.
                    </p>
                    <Button className="mt-3" onClick={() => navigate('/')}>
                      Back to dashboard
                    </Button>
                  </div>
                )}

                <Button
                  onClick={() => setAllowContinue(true)}
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  data-testid="button-continue-chat"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Or keep talking about this one
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        </div>

        {/* Right Column - Timer & Status (25%) */}
        <div className="hidden lg:block w-1/4 border-l bg-background/50">
          <div className="p-4 space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Session Info</h3>
            
            {/* Session Timer */}
            {(session.status === 'in_progress' || session.status === 'completed') && (
              <div className="space-y-3">
                <SessionTimer 
                  isSessionActive={session.status === 'in_progress'}
                  isSessionCompleted={session.status === 'completed'}
                  className="border-0 bg-transparent p-0"
                  sessionNumber={sessionNumber}
                  initialTimerElapsed={session.timerElapsedSeconds || 0}
                  /*
                    Display only. The desktop instance above owns persistence —
                    both are mounted at every width, so leaving this on doubled
                    every write. Counting is local, so this still shows the
                    right time.
                  */
                  persist={false}
                />
                {session.status === 'in_progress' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-muted-foreground hover:text-destructive hover:border-destructive"
                    onClick={() => setShowEndSessionDialog(true)}
                    disabled={isSpeaking || endSessionEarlyMutation.isPending}
                  >
                    <LogOut className="h-3.5 w-3.5 mr-2" />
                    End Session Early
                  </Button>
                )}
              </div>
            )}

            {/* Function Progress for Sessions 1 & 2 */}
            {(sessionNumber === 1 || sessionNumber === 2) && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">
                  {sessionNumber === 1 ? "Target Functions" : "Credibility Areas"}
                </h4>
                <div className="flex flex-wrap gap-1">
                  {sessionInfo.functions.map((func) => (
                    <Badge key={func} variant="outline" className="text-xs">
                      {func}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Session outcome — read from the typed artifact */}
            {session.status === 'completed' && sessionArtifact && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Results</h4>
                <div className="space-y-2 text-sm">
                  {sessionArtifact.primaryFunction && (
                    <div>
                      <span className="font-medium">Primary:</span> {sessionArtifact.primaryFunction}
                    </div>
                  )}
                  {sessionArtifact.secondaryFunction && (
                    <div>
                      <span className="font-medium">Secondary:</span> {sessionArtifact.secondaryFunction}
                    </div>
                  )}
                  {sessionArtifact.credibilityTier && (
                    <div>
                      <span className="font-medium">Credibility Tier:</span> {sessionArtifact.credibilityTier}
                    </div>
                  )}
                  {sessionArtifact.brandClaim && (
                    <div>
                      <span className="font-medium">Brand Claim:</span> {sessionArtifact.brandClaim}
                    </div>
                  )}
                  {sessionArtifact.confidence && (
                    <div>
                      <span className="font-medium">Confidence:</span> {sessionArtifact.confidence}%
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* The "download a PDF summary" link that used to sit here pointed
                at /summaries, which has no server route — the conversation
                summaries feature was superseded by Foundation Sessions and its
                API was removed. It rendered on every completed session and
                always led to an error page. */}
          </div>
        </div>
      </div>

      {/* End Session Early Dialog */}
      <Dialog open={showEndSessionDialog} onOpenChange={setShowEndSessionDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>End this session early?</DialogTitle>
            <DialogDescription className="pt-2 leading-relaxed">
              This foundation session is most effective when completed in full. Exiting now may impact the quality of your positioning results.
              <br /><br />
              Your progress is saved. You can return to complete this session at any time — but finishing in one sitting is strongly encouraged for the best outcome.
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