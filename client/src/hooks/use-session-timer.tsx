import { useState, useEffect, useCallback } from 'react';
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

export function useSessionTimer(
  config: SessionTimerConfig = DEFAULT_FOUNDATION_SESSION_CONFIG,
  sessionNumber?: number,
  initialTimerElapsed: number = 0
) {
  const [startTime, setStartTime] = useState<number | null>(null);
  const [timeElapsed, setTimeElapsed] = useState<number>(initialTimerElapsed);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [phase, setPhase] = useState<'initial' | 'warning' | 'overtime' | 'completed'>('initial');
  const [lastSavedTime, setLastSavedTime] = useState<number>(initialTimerElapsed);

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
    if (sessionNumber && elapsed !== lastSavedTime) {
      try {
        await apiRequest('PATCH', `/api/foundation-sessions/${sessionNumber}/timer`, {
          timerElapsed: elapsed
        });
        setLastSavedTime(elapsed);
      } catch (error) {
        console.error('Failed to save timer to database:', error);
      }
    }
  }, [sessionNumber, lastSavedTime]);

  // Start the timer
  const startTimer = useCallback(() => {
    if (!isRunning) {
      setStartTime(Date.now() - (timeElapsed * 1000)); // Adjust start time for existing elapsed time
      setIsRunning(true);
      setPhase(calculatePhase(timeElapsed));
    }
  }, [isRunning, timeElapsed, calculatePhase]);

  // Stop the timer
  const stopTimer = useCallback(() => {
    setIsRunning(false);
    setPhase('completed');
  }, []);

  // Reset the timer
  const resetTimer = useCallback(() => {
    setStartTime(null);
    setTimeElapsed(0);
    setIsRunning(false);
    setPhase('initial');
  }, []);

  // Update timer every second and save to database periodically
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

        // Save to database every 10 seconds to avoid excessive API calls
        if (elapsed % 10 === 0) {
          saveTimerToDatabase(elapsed);
        }
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isRunning, startTime, phase, calculatePhase, saveTimerToDatabase]);

  // Save timer when component unmounts or timer stops
  useEffect(() => {
    return () => {
      if (timeElapsed > lastSavedTime) {
        saveTimerToDatabase(timeElapsed);
      }
    };
  }, [timeElapsed, lastSavedTime, saveTimerToDatabase]);

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