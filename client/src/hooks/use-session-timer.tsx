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
  customSaveCallback?: (elapsed: number) => Promise<void>
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

  // Save timer elapsed time to database
  const saveTimerToDatabase = useCallback(async (elapsed: number) => {
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
      
      // Start save interval - save every 10 seconds (if custom callback or sessionNumber provided)
      if ((customSaveCallback || sessionNumber) && !saveIntervalRef.current) {
        saveIntervalRef.current = setInterval(() => {
          const currentElapsed = timeElapsedRef.current;
          const currentLastSaved = lastSavedTimeRef.current;
          if (currentElapsed > currentLastSaved) {
            saveTimerToDatabase(currentElapsed);
          }
        }, 10000);
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
    
    // Save final time
    if (timeElapsed > lastSavedTime) {
      saveTimerToDatabase(timeElapsed);
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
  useEffect(() => {
    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, []);

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