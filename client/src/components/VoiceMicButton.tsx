import { Mic, MicOff, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface VoiceMicButtonProps {
  isRecording: boolean;
  isProcessing: boolean;
  isRetryLimitReached?: boolean;
  disabled?: boolean;
  onClick: () => void;
  onResetRetry?: () => void;
}

export default function VoiceMicButton({
  isRecording,
  isProcessing,
  isRetryLimitReached = false,
  disabled = false,
  onClick,
  onResetRetry
}: VoiceMicButtonProps) {
  const isButtonDisabled = disabled || isProcessing;
  
  const buttonContent = (
    <button
      onClick={isRetryLimitReached && onResetRetry ? onResetRetry : onClick}
      disabled={isButtonDisabled}
      data-testid="button-voice-input"
      className={cn(
        "relative flex items-center justify-center rounded-lg transition-all duration-200 touch-manipulation",
        "h-[60px] w-12",
        "focus:outline-none focus:ring-2 focus:ring-offset-1",
        isRetryLimitReached
          ? "bg-amber-500 hover:bg-amber-600 focus:ring-amber-400 shadow-md shadow-amber-500/30"
          : isRecording 
            ? "bg-red-500 hover:bg-red-600 focus:ring-red-400 shadow-lg shadow-red-500/50" 
            : "bg-[hsl(167,40%,35%)] hover:bg-[hsl(167,40%,30%)] focus:ring-[hsl(167,40%,35%)] shadow-md shadow-[hsl(167,40%,35%)]/30",
        isButtonDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      )}
      aria-label={
        isRetryLimitReached 
          ? "Voice recognition temporarily unavailable - click to retry" 
          : isRecording 
            ? "Stop recording" 
            : "Start recording"
      }
      title={
        isRetryLimitReached
          ? "Click to retry voice input"
          : isRecording 
            ? "Stop recording" 
            : "Start voice input"
      }
    >
      {isRecording && !isRetryLimitReached && (
        <span className="absolute inset-0 rounded-lg bg-red-400 animate-ping opacity-75" />
      )}
      
      <div className="relative z-10">
        {isRetryLimitReached ? (
          <AlertCircle className="w-5 h-5 text-white" />
        ) : isProcessing ? (
          <Loader2 className="w-5 h-5 text-white animate-spin" />
        ) : isRecording ? (
          <MicOff className="w-5 h-5 text-white" />
        ) : (
          <Mic className="w-5 h-5 text-white" />
        )}
      </div>
    </button>
  );

  if (isRetryLimitReached) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {buttonContent}
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-sm">
              Voice recognition temporarily unavailable. Please type your response or click to try again.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return buttonContent;
}
