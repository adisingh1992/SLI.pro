import { Mic, MicOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceMicButtonProps {
  isRecording: boolean;
  isProcessing: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export default function VoiceMicButton({
  isRecording,
  isProcessing,
  disabled = false,
  onClick
}: VoiceMicButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || isProcessing}
      data-testid="button-voice-input"
      className={cn(
        "relative flex items-center justify-center rounded-lg transition-all duration-200 touch-manipulation",
        "h-[60px] w-12", // Match textarea height
        "focus:outline-none focus:ring-2 focus:ring-offset-1",
        isRecording 
          ? "bg-red-500 hover:bg-red-600 focus:ring-red-400 shadow-lg shadow-red-500/50" 
          : "bg-[hsl(167,40%,35%)] hover:bg-[hsl(167,40%,30%)] focus:ring-[hsl(167,40%,35%)] shadow-md shadow-[hsl(167,40%,35%)]/30",
        disabled || isProcessing ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      )}
      aria-label={isRecording ? "Stop recording" : "Start recording"}
      title={isRecording ? "Stop recording" : "Start voice input"}
    >
      {/* Pulsing animation when recording */}
      {isRecording && (
        <span className="absolute inset-0 rounded-lg bg-red-400 animate-ping opacity-75" />
      )}
      
      {/* Icon */}
      <div className="relative z-10">
        {isProcessing ? (
          <Loader2 className="w-5 h-5 text-white animate-spin" />
        ) : isRecording ? (
          <MicOff className="w-5 h-5 text-white" />
        ) : (
          <Mic className="w-5 h-5 text-white" />
        )}
      </div>
    </button>
  );
}
