import { Mic, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceMicButtonProps {
  isRecording: boolean;
  isProcessing: boolean;
  disabled?: boolean;
  onClick: () => void;
}

/**
 * The dictation control, inside the composer.
 *
 * ── IT WAS SIZED FOR A COMPOSER THAT NO LONGER EXISTS ────────────────────────
 * This was `h-[60px] w-12` — a filled block with a coloured drop shadow — built
 * to match a textarea that was also 60px tall. The composer is now a single
 * bordered row holding a 36px send button and a textarea whose single-line
 * height is 36px, so the mic was 24px taller than everything beside it. With
 * the row bottom-aligned, that put 24px of empty space above the text and made
 * the placeholder look like it was floating.
 *
 * Now the same 36px circle as send, so a single-line composer is one clean
 * row, and a growing textarea pushes both buttons to the bottom together.
 *
 * ── QUIET AT REST, LOUD WHILE RECORDING ──────────────────────────────────────
 * The old styling gave the mic a saturated fill and a shadow — more visual
 * weight than the send button, which is the actual primary action. Idle, it is
 * now a ghost circle that colours on hover; the placeholder ("Type your answer,
 * or tap the mic…") carries the discoverability.
 *
 * Recording is the one state that must be unmissable, because a student who
 * does not realise they are still recording is being recorded. So that state
 * keeps the fill, the pulse, and a label — `--bad`, since it is the only stop
 * control on the screen.
 */
export default function VoiceMicButton({
  isRecording,
  isProcessing,
  disabled = false,
  onClick,
}: VoiceMicButtonProps) {
  const isButtonDisabled = disabled || isProcessing;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isButtonDisabled}
      data-testid="button-voice-input"
      className={cn(
        "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
        "transition-colors duration-150 touch-manipulation",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
        isRecording
          ? "bg-bad text-white hover:bg-bad/90"
          : "text-ink-soft hover:bg-brand-soft hover:text-brand",
        isButtonDisabled && "cursor-not-allowed opacity-40",
      )}
      aria-label={isRecording ? "Stop recording" : "Start voice dictation"}
      aria-pressed={isRecording}
      title={isRecording ? "Stop recording" : "Dictate your answer"}
    >
      {/* Sits behind the icon and is decorative; `motion-safe` so it holds
          still for anyone who has asked for reduced motion. */}
      {isRecording && (
        <span
          className="absolute inset-0 rounded-full bg-bad/40 motion-safe:animate-ping"
          aria-hidden="true"
        />
      )}

      <span className="relative z-10">
        {isProcessing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isRecording ? (
          // A stop square, not a crossed-out mic. `MicOff` reads as "voice is
          // unavailable"; the button's job here is to end the recording.
          <Square className="h-3.5 w-3.5 fill-current" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </span>
    </button>
  );
}
