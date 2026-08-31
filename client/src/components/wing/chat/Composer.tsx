import { ArrowUp, ChevronDown, Loader2, Mic, Paperclip, Square } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { PICKER_MODULES, type WingModule } from "@/lib/wing-modules";
import { useVoiceRecording } from "@/hooks/use-voice-recording";

/**
 * The chat input: a growing textarea, the module picker, voice, and send.
 *
 * ── THE MODULE PICKER IS A REAL CONTROL, NOT A LABEL ─────────────────────
 * Danielle's routing rules give it behaviour, from a SCRUM decision: switching module is
 * one of two equal ways to change what Wing is working on (the other is saying so), and
 * "every switch creates a new thread". The prototype drew the chip and wired nothing.
 *
 * It selects by `slug`, never by display name. The prototype matched modules by their
 * label, which is how its own two module lists drifted five names apart before anything
 * consumed either of them.
 *
 * ── AND VOICE IS THE EXISTING HOOK ───────────────────────────────────────
 * The prototype has three mic buttons and not one `onClick` among them. There is no need
 * to build anything: `/ws/voice` and the Whisper session are complete and working, and
 * `useVoiceRecording` already owns the MediaRecorder, the socket and the error toasts.
 * The transcript lands in the textarea rather than sending itself, so a student can fix a
 * misheard word before Wing reads it.
 *
 * ── FOCUS RING: `quiet-focus` ─────────────────────────────────────────────
 * The textarea is a third input typed into directly rather than navigated to with the
 * keyboard (the other two — the sidebar's search and the "This week" reply box — are
 * why `.quiet-focus` exists in the first place; see `index.css`'s comment on it). Without
 * it, an ordinary mouse click into the textarea outlined the whole pill in the global
 * salmon `:focus-visible` ring, which reads as an error state on a chat input, not a
 * focus state. Carries `quiet-focus` and the same replacement every other one uses: a
 * quieter `focus-within:ring-1 focus-within:ring-aqua` on the pill that wraps it.
 *
 * ── THE MIC NEEDS TO READ AS "LISTENING", NOT JUST "SALMON" ───────────────
 * `isRecording` used to just recolour the icon and pulse its opacity (`.breathe`) — a
 * small, static-looking glyph change that's easy to miss, especially glancing away from
 * a 20px icon mid-sentence. `.mic-pulse-ring` (`index.css`) adds an expanding, fading
 * ring behind the icon while actually recording — the universal "recording" cue — and
 * `isProcessing` (waiting on the transcription round-trip, not listening anymore) swaps
 * the icon for a spinning `Loader2`, this app's existing loading affordance, so the two
 * states read as visibly different rather than the same salmon glyph throughout.
 */
export function Composer({
  onSend,
  module,
  onPickModule,
  busy,
  onStop,
  userId,
}: {
  onSend: (text: string) => void;
  module: WingModule;
  onPickModule: (m: WingModule) => void;
  busy: boolean;
  onStop: () => void;
  /** Required by `useVoiceRecording` — it authenticates the /ws/voice upgrade. */
  userId: number;
}) {
  const [value, setValue] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  /*
   * The transcript is appended to whatever is already typed rather than replacing it,
   * and it does NOT send. A student who dictates two sentences and then notices Wing
   * misheard a name can fix it; auto-sending would put the mistake in the transcript,
   * where it becomes part of what Wing believes about them.
   */
  const { isRecording, isProcessing, startRecording, stopRecording } = useVoiceRecording({
    userId,
    ...(module.sessionType
      ? { sessionNumber: Number(module.sessionType.replace("foundation_", "")) }
      : {}),
    onTranscriptionComplete: (text: string) =>
      setValue((v) => (v ? `${v.trimEnd()} ${text}` : text)),
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  /* Close the picker on an outside click or Escape — a menu that can only be dismissed
     by choosing something is a trap on a touch screen. */
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!value.trim() || busy) return;
    onSend(value.trim());
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative flex items-center justify-between" ref={pickerRef}>
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={pickerOpen}
          className="flex items-center gap-1.5 rounded-full bg-aqua-light px-3 py-1 text-xs font-medium text-wine transition-colors hover:bg-aqua"
        >
          {module.name}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>

        {/*
          * IG — while a reply is in flight, the input locks (below) so a second turn can't
          * overlap the first mid-stream. Locking it silently reads as broken — nothing in
          * the composer explains why the textarea stopped responding to keystrokes — so
          * this pill carries the same `wing-dot` pulse as the transcript's `thinking`
          * bubble (`Bubbles.tsx`), just bigger and sitting in the same row as the module
          * picker, opposite it, rather than a small animation the student would have to
          * scroll up to notice.
          */}
        {busy && (
          <div
            role="status"
            aria-live="polite"
            className="flex animate-rise items-center gap-2 rounded-full bg-aqua-light px-4 py-1 text-xs font-medium text-wine"
          >
            <span className="flex items-center gap-1" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="thinking-dot h-1.5 w-1.5 rounded-full bg-wine"
                  style={{ animation: `wing-dot 1.2s ${i * 0.18}s infinite ease-in-out` }}
                />
              ))}
            </span>
            Wing is responding…
          </div>
        )}

        {pickerOpen && (
          <ul
            role="listbox"
            className="absolute bottom-full left-0 z-20 mb-2 max-h-80 w-72 overflow-y-auto rounded-2xl bg-white p-1.5 shadow-[0_10px_40px_-12px_rgba(42,42,56,0.4)] ring-1 ring-wing-border"
          >
            {PICKER_MODULES.map((m) => (
              <li key={m.slug}>
                <button
                  type="button"
                  role="option"
                  aria-selected={m.slug === module.slug}
                  onClick={() => {
                    setPickerOpen(false);
                    if (m.slug !== module.slug) onPickModule(m);
                  }}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-aqua-light/60 ${
                    m.slug === module.slug ? "bg-aqua-light text-wine" : "text-forest"
                  }`}
                >
                  {m.name}
                  {/*
                    * No padlock, per IG-UX01 — every module is selectable. What a student
                    * gets instead is Wing saying plainly, inside the thread, that this one
                    * is not switched on yet. The note here is so the choice is informed
                    * rather than a surprise one click later.
                    */}
                  {m.status !== "live" && (
                    <span className="ml-2 text-[11px] text-plum/60">not yet</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        onSubmit={submit}
        className="flex items-end gap-3 rounded-3xl bg-white px-4 py-3 shadow-[0_6px_24px_-12px_rgba(42,42,56,0.35)] ring-1 ring-wing-border focus-within:ring-1 focus-within:ring-aqua"
      >
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy}
          placeholder={
            busy
              ? "Wing is responding…"
              : isRecording
                ? "Listening…"
                : isProcessing
                  ? "Transcribing…"
                  : "Continue chatting here.."
          }
          aria-label="Your message"
          aria-busy={busy}
          className="quiet-focus min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-1.5 text-[16px] leading-relaxed text-forest outline-none placeholder:text-plum/60 disabled:cursor-not-allowed disabled:opacity-60"
        />

        <button
          type="button"
          aria-label="Attach file"
          title="Upload documents from Your files"
          disabled={busy}
          onClick={() => {
            window.location.href = "/files";
          }}
          className="pb-1.5 text-plum/70 hover:text-midnight disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Paperclip className="h-5 w-5" />
        </button>

        <button
          type="button"
          aria-label={isRecording ? "Stop recording" : "Voice input"}
          aria-pressed={isRecording}
          disabled={isProcessing || busy}
          onClick={() => (isRecording ? stopRecording() : startRecording())}
          className={`pb-1.5 disabled:cursor-not-allowed disabled:opacity-50 ${
            isRecording || isProcessing ? "text-salmon" : "text-plum/70 hover:text-midnight"
          }`}
        >
          <span className="relative flex h-5 w-5 items-center justify-center">
            {isRecording && (
              <span
                aria-hidden="true"
                className="mic-pulse-ring absolute inset-0 -m-1.5 rounded-full bg-salmon/30"
              />
            )}
            {isProcessing ? (
              <Loader2 className="relative h-5 w-5 animate-spin" />
            ) : (
              <Mic className="relative h-5 w-5" />
            )}
          </span>
        </button>

        {busy ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop Wing"
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wine text-white"
          >
            <Square className="h-3.5 w-3.5" fill="currentColor" />
          </button>
        ) : (
          value.trim().length > 0 && (
            <button
              type="submit"
              aria-label="Send"
              className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-salmon text-white transition-transform hover:scale-105"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          )
        )}
      </form>
    </div>
  );
}
