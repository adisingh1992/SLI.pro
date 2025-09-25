import { useEffect } from 'react';
import { Clock, AlertCircle, CheckCircle2, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSessionTimer, SessionTimerConfig, DEFAULT_FOUNDATION_SESSION_CONFIG, SESSION_2_CONFIG, SESSION_3_CONFIG } from '@/hooks/use-session-timer';

interface SessionTimerProps {
  config?: SessionTimerConfig;
  isSessionActive?: boolean;
  isSessionCompleted?: boolean;
  className?: string;
  sessionNumber?: number;
  initialTimerElapsed?: number;
}

export function SessionTimer({ 
  config, 
  isSessionActive = false, 
  isSessionCompleted = false,
  className,
  sessionNumber,
  initialTimerElapsed = 0
}: SessionTimerProps) {
  // Use session-specific config if not provided
  const sessionConfig = config || 
    (sessionNumber === 2 ? SESSION_2_CONFIG : 
     sessionNumber === 3 ? SESSION_3_CONFIG : 
     DEFAULT_FOUNDATION_SESSION_CONFIG);
  
  const timer = useSessionTimer(sessionConfig, sessionNumber, initialTimerElapsed);

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

  const getTimerColor = () => {
    if (isSessionCompleted || timer.phase === 'completed') {
      return 'text-green-600 dark:text-green-400';
    }
    
    switch (timer.phase) {
      case 'warning':
        return 'text-amber-600 dark:text-amber-400';
      case 'overtime':
        return 'text-blue-600 dark:text-blue-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getTimerIcon = () => {
    if (isSessionCompleted || timer.phase === 'completed') {
      return CheckCircle2;
    }
    
    switch (timer.phase) {
      case 'warning':
        return AlertCircle;
      case 'overtime':
        return Timer;
      default:
        return Clock;
    }
  };

  const getAlertVariant = () => {
    if (isSessionCompleted || timer.phase === 'completed') {
      return 'default';
    }
    
    switch (timer.phase) {
      case 'warning':
        return 'destructive';
      case 'overtime':
        return 'default';
      default:
        return 'default';
    }
  };

  const TimerIcon = getTimerIcon();
  const displayMessage = isSessionCompleted || timer.phase === 'completed' 
    ? timer.config.messages.completed 
    : timer.currentMessage;

  return (
    <div>
      <div className={cn("flex items-center justify-between p-4 rounded-lg border bg-card", className)} data-testid="session-timer">
        {/* Timer Display */}
        <div className="flex items-center gap-3">
          <TimerIcon className={cn("h-4 w-4", getTimerColor())} />
          <span className={cn("font-mono text-sm font-medium", getTimerColor())} data-testid="timer-display">
            {timer.formattedTime}
          </span>
        </div>
        
        {/* Phase Badge */}
        <Badge 
          variant="outline" 
          className={cn(
            "text-xs shrink-0",
            isSessionCompleted || timer.phase === 'completed'
              ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400"
              : timer.phase === 'warning'
              ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
              : timer.phase === 'overtime'
              ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400"
              : ""
          )}
          data-testid="timer-phase-badge"
        >
          {isSessionCompleted || timer.phase === 'completed' 
            ? 'Completed' 
            : timer.phase === 'warning'
            ? 'Focus Time'
            : timer.phase === 'overtime' 
            ? 'Take Your Time'
            : 'In Progress'
          }
        </Badge>
      </div>

      <div className="py-4">
        {/* Message */}
        {displayMessage && (
          <div className="flex-1 mx-4" data-testid="timer-message">
            <Alert variant={isSessionCompleted ? 'default': 'destructive'}>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{displayMessage}</AlertDescription>
            </Alert>
          </div>
        )}
      </div>
    </div>
  );
}

export default SessionTimer;