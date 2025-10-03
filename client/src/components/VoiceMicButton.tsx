import { Button } from "@/components/ui/button";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceMicButtonProps {
  isRecording: boolean;
  isProcessing: boolean;
  disabled?: boolean;
  onClick: () => void;
  transcriptionPreview?: string;
}

export default function VoiceMicButton({
  isRecording,
  isProcessing,
  disabled = false,
  onClick,
  transcriptionPreview = ''
}: VoiceMicButtonProps) {
  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Large Mic Button */}
      <button
        onClick={onClick}
        disabled={disabled || isProcessing}
        data-testid="button-voice-input"
        className={cn(
          "relative flex flex-col items-center justify-center rounded-full transition-all duration-300 touch-manipulation",
          "w-20 h-20 md:w-24 md:h-24", // 80px mobile, 96px desktop
          "focus:outline-none focus:ring-4 focus:ring-offset-2",
          isRecording 
            ? "bg-red-500 hover:bg-red-600 focus:ring-red-300 scale-110" 
            : "bg-primary hover:bg-primary/90 focus:ring-primary/30 scale-100",
          disabled || isProcessing ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
          "shadow-lg hover:shadow-xl"
        )}
        aria-label={isRecording ? "Stop recording" : "Start recording"}
      >
        {/* Pulsing animation when recording */}
        {isRecording && (
          <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-75" />
        )}
        
        {/* Icon */}
        <div className="relative z-10">
          {isProcessing ? (
            <Loader2 className="w-10 h-10 md:w-12 md:h-12 text-white animate-spin" />
          ) : isRecording ? (
            <MicOff className="w-10 h-10 md:w-12 md:h-12 text-white" />
          ) : (
            <Mic className="w-10 h-10 md:w-12 md:h-12 text-white" />
          )}
        </div>
      </button>

      {/* Status Text */}
      <div className="text-center min-h-[24px]">
        {isProcessing ? (
          <p className="text-sm text-muted-foreground animate-pulse" data-testid="text-voice-status">
            Processing...
          </p>
        ) : isRecording ? (
          <p className="text-sm font-medium text-red-600 dark:text-red-400" data-testid="text-voice-status">
            Recording... Tap to stop
          </p>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="text-voice-status">
            Tap to speak
          </p>
        )}
      </div>

      {/* Recording Indicator (visual feedback) */}
      {isRecording && (
        <div className="w-full max-w-xs">
          <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-red-500 animate-pulse w-full" />
          </div>
        </div>
      )}

      {/* Live Transcription Preview */}
      {transcriptionPreview && (
        <div 
          className="w-full max-w-md p-3 bg-muted rounded-lg text-sm text-muted-foreground italic"
          data-testid="text-transcription-preview"
        >
          "{transcriptionPreview}"
        </div>
      )}
    </div>
  );
}
