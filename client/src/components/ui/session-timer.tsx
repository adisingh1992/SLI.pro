import { useEffect } from 'react';
import { TimeReadout } from '@/components/chat';
import { useSessionTimer, SessionTimerConfig, DEFAULT_FOUNDATION_SESSION_CONFIG, SESSION_2_CONFIG, SESSION_3_CONFIG } from '@/hooks/use-session-timer';

interface SessionTimerProps {
  config?: SessionTimerConfig;
  isSessionActive?: boolean;
  isSessionCompleted?: boolean;
  className?: string;
  sessionNumber?: number;
  initialTimerElapsed?: number;
  onTimerSave?: (elapsed: number) => Promise<void>;
  /**
   * Whether this instance writes elapsed time back to the server.
   *
   * A screen that renders the timer twice — one for desktop, one for mobile —
   * must set this on exactly one of them. Both display identically either way.
   */
  persist?: boolean;
}

export function SessionTimer({ 
  config, 
  isSessionActive = false, 
  isSessionCompleted = false,
  className,
  sessionNumber,
  initialTimerElapsed = 0,
  onTimerSave,
  persist = true,
}: SessionTimerProps) {
  // Use session-specific config if not provided
  const sessionConfig = config || 
    (sessionNumber === 2 ? SESSION_2_CONFIG : 
     sessionNumber === 3 ? SESSION_3_CONFIG : 
     DEFAULT_FOUNDATION_SESSION_CONFIG);
  
  const timer = useSessionTimer(
    sessionConfig,
    sessionNumber,
    initialTimerElapsed,
    onTimerSave,
    persist,
  );

  // Auto-start timer when session becomes active
  useEffect(() => {
    if (isSessionActive && !timer.isRunning && !isSessionCompleted) {
      timer.startTimer();
    }
  }, [isSessionActive, timer.isRunning, isSessionCompleted, timer.startTimer]);

  // Stop timer when session is completed
  useEffect(() => {
    if (isSessionCompleted && timer.isRunning) {
      timer.stopTimer();
    }
  }, [isSessionCompleted, timer.isRunning, timer.stopTimer]);




  /*
   * ── WHAT THIS USED TO RENDER ──────────────────────────────────────────────
   * A bordered card holding the clock and a status badge, and beneath it a
   * full-width `Alert` — with `variant="destructive"` for every phase except
   * completed. So a normal, healthy session displayed a red-bordered warning
   * panel above the conversation for its entire length, restating
   * "Recommended time: 8-10 minutes" on every turn of a ten-minute
   * conversation.
   *
   * Guidance that never changes is not guidance, it is furniture, and this
   * furniture was styled as an error. The timer is now a single quiet pill:
   * grey while everything is fine, amber only when the recommended window is
   * genuinely closing, green when done. It takes colour only when it has
   * something to say.
   *
   * The phase copy has not been deleted — it moved to the pill's `title`, so
   * it is available on hover without occupying the page.
   */
  const phase: 'initial' | 'warning' | 'overtime' | 'completed' =
    isSessionCompleted || timer.phase === 'completed' ? 'completed' : timer.phase;

  const displayMessage =
    phase === 'completed' ? timer.config.messages.completed : timer.currentMessage;

  return (
    <span title={displayMessage || undefined} data-testid="session-timer">
      <TimeReadout formatted={timer.formattedTime} phase={phase} className={className} />
    </span>
  );
}

export default SessionTimer;