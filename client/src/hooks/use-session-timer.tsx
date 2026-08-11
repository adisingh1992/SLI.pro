import { useState, useEffect, useCallback, useRef } from 'react';
import { apiRequest } from '@/lib/queryClient';

export interface SessionTimerConfig {
  targetMinutes: number;
  warningMinutes: number;
  messages: {
    initial: string;
    warning: string;
    overtime: string;
    completed: string;
  };
}

export interface SessionTimerState {
  timeElapsed: number; // in seconds
  formattedTime: string;
  currentMessage: string;
  phase: 'initial' | 'warning' | 'overtime' | 'completed';
  isRunning: boolean;
}

// Default configuration for Foundation Sessions
export const DEFAULT_FOUNDATION_SESSION_CONFIG: SessionTimerConfig = {
  targetMinutes: 10,
  warningMinutes: 7,
  messages: {
    initial: "Recommended time: 8-10 minutes (take longer if needed for thoughtful responses)",
    warning: "About 3 minutes remaining - focus on your strongest examples",
    overtime: "No rush - quality responses improve your positioning insights",
    completed: "Session complete - excellent depth in your responses"
  }
};

// Session 2 specific configuration
export const SESSION_2_CONFIG: SessionTimerConfig = {
  targetMinutes: 10,
  warningMinutes: 8,
  messages: {
    initial: "Recommended time: 8-10 minutes (focus on concrete examples with numbers)",
    warning: "About 2 minutes remaining - provide specific metrics and measurable outcomes",
    overtime: "No rush - detailed proof strengthens your credibility assessment", 
    completed: "Assessment complete - strong evidence documented"
  }
};

// Session 3 specific configuration
export const SESSION_3_CONFIG: SessionTimerConfig = {
  targetMinutes: 10,
  warningMinutes: 9,
  messages: {
    initial: "Recommended time: 9-10 minutes (share specific stories with measurable outcomes)",
    warning: "About 1 minute remaining - focus on the most compelling example with clear results",
    overtime: "No rush - detailed stories create stronger positioning insights",
    completed: "Story development complete - compelling narrative extracted"
  }
};

export function useSessionTimer(
  config: SessionTimerConfig = DEFAULT_FOUNDATION_SESSION_CONFIG,
  sessionNumber?: number,
  initialTimerElapsed: number = 0,
  customSaveCallback?: (elapsed: number) => Promise<void>,
  /**
   * Whether this instance writes elapsed time back.
   *
   * Defaults to true so existing single-timer screens are unaffected. The
   * Foundation chat renders two timers — desktop sidebar and mobile — and only
   * one of them may persist, or every write happens twice.
   *
   * Both still display correctly: `timeElapsed` is derived from `startTime`
   * locally, so a read-only timer counts exactly like a persisting one.
   */
  persist: boolean = true,
) {
  const [startTime, setStartTime] = useState<number | null>(null);
  const [timeElapsed, setTimeElapsed] = useState<number>(initialTimerElapsed);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [phase, setPhase] = useState<'initial' | 'warning' | 'overtime' | 'completed'>('initial');
  const [lastSavedTime, setLastSavedTime] = useState<number>(initialTimerElapsed);
  const saveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeElapsedRef = useRef<number>(initialTimerElapsed);
  const lastSavedTimeRef = useRef<number>(initialTimerElapsed);

  // Format time as MM:SS
  const formatTime = useCallback((seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, []);

  // Calculate current phase based on elapsed time
  const calculatePhase = useCallback((seconds: number): 'initial' | 'warning' | 'overtime' | 'completed' => {
    const minutes = seconds / 60;
    
    if (minutes >= config.warningMinutes && minutes < config.targetMinutes) {
      return 'warning';
    } else if (minutes >= config.targetMinutes) {
      return 'overtime';
    }
    return 'initial';
  }, [config.warningMinutes, config.targetMinutes]);

  // Get current message based on phase
  const getCurrentMessage = useCallback((currentPhase: 'initial' | 'warning' | 'overtime' | 'completed'): string => {
    return config.messages[currentPhase];
  }, [config.messages]);

  /**
   * How often elapsed time is written back.
   *
   * Was 10s. See the note in `startTimer` — two mounted timers made that an
   * effective 5s, and each write is a round trip.
   */
  const SAVE_INTERVAL_MS = 60_000;

  /**
   * When the last write was issued. Enforces a floor between saves.
   *
   * ── A FLOOR, BECAUSE THE CEILING FAILED ONCE ──────────────────────────────
   * The interval says how often to save. This says how often it is *possible*
   * to save, whatever calls it — and it exists because a dependency mistake
   * turned a 60-second interval into a roughly one-second loop, and nothing
   * anywhere noticed except a wall of requests in a terminal.
   *
   * The correct fix was the dependency (see `saveRef`). This is the guard that
   * makes the next such mistake cost nothing: a write is elapsed-second
   * bookkeeping, so there is no legitimate reason to issue two within ten
   * seconds of each other. Flushes on the way out pass `force`, because those
   * are the one case where the write must happen regardless.
   */
  const lastSaveAttemptRef = useRef<number>(0);
  const MIN_SAVE_GAP_MS = 10_000;

  // Save timer elapsed time to database
  const saveTimerToDatabase = useCallback(async (elapsed: number, force = false) => {
    const now = Date.now();
    if (!force && now - lastSaveAttemptRef.current < MIN_SAVE_GAP_MS) return;
    lastSaveAttemptRef.current = now;

    if (elapsed !== lastSavedTime) {
      try {
        // Use custom callback if provided, otherwise use default Foundation Session save
        if (customSaveCallback) {
          await customSaveCallback(elapsed);
        } else if (sessionNumber) {
          await apiRequest('PATCH', `/api/foundation-sessions/${sessionNumber}/timer`, {
            timerElapsed: elapsed
          });
        }
        setLastSavedTime(elapsed);
      } catch (error) {
        console.error('Failed to save timer to database:', error);
      }
    }
  }, [customSaveCallback, sessionNumber, lastSavedTime]);

  // Start the timer
  const startTimer = useCallback(() => {
    if (!isRunning) {
      setStartTime(Date.now() - (timeElapsed * 1000)); // Adjust start time for existing elapsed time
      setIsRunning(true);
      setPhase(calculatePhase(timeElapsed));
      
      /*
       * ── SAVE EVERY MINUTE, NOT EVERY TEN SECONDS ──────────────────────────
       * This wrote to the database every 10s for the whole session. The chat
       * page renders SessionTimer twice — once in the desktop sidebar, once for
       * mobile — so both intervals ran and the real rate was a write every five
       * seconds.
       *
       * Against a co-located database that is merely wasteful. Against a remote
       * one it is harmful: each write measured 1.4–4.9 seconds in local
       * development, and five of them landed *during* a single chat turn,
       * competing with it for connections in a pool of ten. The bookkeeping was
       * slowing down the thing it was keeping book on.
       *
       * A minute is the right granularity for a number whose only use is "you
       * are around the recommended 8–10 minutes". The worst case is losing
       * under a minute of recorded time in a hard crash, and `stopTimer` and
       * the unmount handler both flush, so an ordinary exit loses nothing.
       */
      if (persist && !saveIntervalRef.current) {
        saveIntervalRef.current = setInterval(() => {
          const currentElapsed = timeElapsedRef.current;
          const currentLastSaved = lastSavedTimeRef.current;
          if (currentElapsed > currentLastSaved) {
            saveTimerToDatabase(currentElapsed);
          }
        }, SAVE_INTERVAL_MS);
      }
    }
  }, [isRunning, timeElapsed, calculatePhase, customSaveCallback, sessionNumber, lastSavedTime, saveTimerToDatabase]);

  // Stop the timer
  const stopTimer = useCallback(() => {
    setIsRunning(false);
    setPhase('completed');
    
    // Clear save interval
    if (saveIntervalRef.current) {
      clearInterval(saveIntervalRef.current);
      saveIntervalRef.current = null;
    }
    
    // Save final time. Forced: the session has ended, so this is the last
    // chance to record it and the throttle must not swallow it.
    if (timeElapsed > lastSavedTime) {
      saveTimerToDatabase(timeElapsed, true);
    }
  }, [timeElapsed, lastSavedTime, saveTimerToDatabase]);

  // Reset the timer
  const resetTimer = useCallback(() => {
    setStartTime(null);
    setTimeElapsed(0);
    setIsRunning(false);
    setPhase('initial');
    
    // Clear save interval
    if (saveIntervalRef.current) {
      clearInterval(saveIntervalRef.current);
      saveIntervalRef.current = null;
    }
  }, []);

  // Update refs whenever state changes
  useEffect(() => {
    timeElapsedRef.current = timeElapsed;
  }, [timeElapsed]);

  useEffect(() => {
    lastSavedTimeRef.current = lastSavedTime;
  }, [lastSavedTime]);

  // Update timer every second
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    if (isRunning && startTime) {
      interval = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - startTime) / 1000);
        setTimeElapsed(elapsed);
        
        const newPhase = calculatePhase(elapsed);
        if (newPhase !== phase) {
          setPhase(newPhase);
        }
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isRunning, startTime, phase, calculatePhase]);

  // Clean up save interval on unmount
  /*
   * Flush on the way out.
   *
   * With a one-minute save interval, an ordinary exit — navigating away,
   * closing the tab — could otherwise discard up to a minute of recorded time.
   * Two handlers, because they cover different exits:
   *
   *   unmount     navigating within the app. A normal request works here.
   *   pagehide    closing or backgrounding the tab. `sendBeacon` is the only
   *               thing browsers reliably deliver at that point; a fetch is
   *               cancelled as the page goes away. `visibilitychange` is the
   *               correct companion on iOS, where `pagehide` alone is unreliable.
   *
   * Both are best-effort. The value is advisory — it drives a "you're around
   * the recommended time" hint — so losing it is a cosmetic loss, not a
   * correctness one, and neither handler is allowed to block the exit.
   */
  /*
   * The save function, held in a ref.
   *
   * ── WHY A REF AND NOT A DEPENDENCY ────────────────────────────────────────
   * `saveTimerToDatabase` closes over `lastSavedTime`, so saving changes its
   * identity. An effect that both depends on it AND saves in its cleanup is a
   * loop: save → lastSavedTime changes → new function identity → React tears
   * the effect down → cleanup saves → repeat. It ran about once a second,
   * which is worse than the every-10-seconds behaviour it was meant to fix.
   *
   * That was this file's bug for about an hour. The lesson is narrow and worth
   * keeping: a cleanup with a side effect must not depend on anything that the
   * side effect changes. The ref keeps the effect's dependencies stable, so the
   * cleanup runs when the component actually goes away and at no other time.
   */
  const saveRef = useRef(saveTimerToDatabase);
  useEffect(() => {
    saveRef.current = saveTimerToDatabase;
  });

  useEffect(() => {
    if (!persist) return;

    /*
     * ── THE BEACON MUST RECORD THAT IT SAVED ──────────────────────────────
     * First version of this did not, and it showed up as a burst of POSTs a
     * few seconds apart in the dev log:
     *
     *   6:04:15  POST .../timer   6:04:28  POST .../timer
     *   6:04:20  POST .../timer   6:04:40  POST .../timer
     *
     * `visibilitychange` fires on every tab switch, not only on exit. Elapsed
     * time grows every second, so `elapsed > lastSaved` was true again a few
     * seconds later — and because the beacon never advanced `lastSavedTimeRef`,
     * nothing ever became true again *less* often. Alt-tabbing between the
     * browser and an editor produced one write per switch, and none of it went
     * through `saveTimerToDatabase`, so the ten-second throttle did not apply.
     *
     * Two corrections:
     *
     *   - a queued beacon advances the same refs a real save does, so the
     *     interval, the unmount flush and the beacon share one notion of "what
     *     the server already knows".
     *   - `hidden` is throttled; `pagehide` is not. They are different events.
     *     A tab switch is speculative and may repeat all afternoon. A pagehide
     *     is the last chance to record anything, and throttling it would lose
     *     the data the flush exists to preserve.
     */
    const flushBeacon = (throttled: boolean) => {
      const elapsed = timeElapsedRef.current;
      if (elapsed <= lastSavedTimeRef.current) return;
      if (!sessionNumber || typeof navigator.sendBeacon !== "function") return;

      const now = Date.now();
      if (throttled && now - lastSaveAttemptRef.current < MIN_SAVE_GAP_MS) return;

      const queued = navigator.sendBeacon(
        `/api/foundation-sessions/${sessionNumber}/timer`,
        new Blob([JSON.stringify({ timerElapsed: elapsed })], {
          type: "application/json",
        }),
      );

      // `sendBeacon` returns whether the request was queued, which is as much
      // as it will ever tell us — there is no response to wait for. If it was
      // not queued, leave the refs alone so the next save still tries.
      if (queued) {
        lastSaveAttemptRef.current = now;
        lastSavedTimeRef.current = elapsed;
      }
    };

    const onPageHide = () => flushBeacon(false);
    const onHide = () => {
      if (document.visibilityState === "hidden") flushBeacon(true);
    };

    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onHide);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onHide);

      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
        saveIntervalRef.current = null;
      }

      // Navigating within the app — an ordinary request still completes.
      const elapsed = timeElapsedRef.current;
      if (elapsed > lastSavedTimeRef.current) {
        void saveRef.current(elapsed, true).catch(() => {
          // Advisory data. A failed flush must not surface to the student.
        });
      }
    };
    // Stable deps only. See the note above `saveRef`.
  }, [persist, sessionNumber]);

  // Initialize timer elapsed from session data
  useEffect(() => {
    if (initialTimerElapsed > 0 && timeElapsed === 0) {
      setTimeElapsed(initialTimerElapsed);
      setLastSavedTime(initialTimerElapsed);
      setPhase(calculatePhase(initialTimerElapsed));
    }
  }, [initialTimerElapsed, timeElapsed, calculatePhase]);

  const timerState: SessionTimerState = {
    timeElapsed,
    formattedTime: formatTime(timeElapsed),
    currentMessage: getCurrentMessage(phase),
    phase,
    isRunning
  };

  return {
    ...timerState,
    startTimer,
    stopTimer,
    resetTimer,
    config
  };
}