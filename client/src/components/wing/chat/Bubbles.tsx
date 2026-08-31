import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { Msg } from "@/lib/wing-api";

/**
 * One message, in Wing's four registers.
 *
 * Ported from the wing5 prototype. The styling carries meaning rather than decoration,
 * which is why `role` and `tone` are first-class fields on `Msg` and not something the
 * client infers: an insight is a salmon-bordered card headed "Wing noticed something",
 * and rendering an ordinary reply that way would claim Wing spotted a pattern it did not.
 *
 * `isLastOfRun` is true on the final bubble of a consecutive same-speaker run. Only that
 * one gets a tail, so three messages from Wing read as one turn rather than three
 * interruptions.
 *
 * ── THE USER BUBBLE IS WHITE, NOT WINE ───────────────────────────────────
 * The prototype coded it `bg-wine` — `#2a2a38`, the same near-black used for the app's
 * sidebar rail — with white text. That is not what either reference screenshot shows: a
 * light bubble with dark text, right-aligned, sitting on the cream canvas the same way
 * the composer and the module picker's dropdown do. `ring-wing-border` gives it an edge
 * against the canvas the way `bg-wine`'s strong contrast never needed; a plain `bg-white`
 * alone reads as barely-there against `wing-canvas`, which is off-white itself.
 */

function CopyButton({ text, side }: { text: string; side: "left" | "right" }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* Clipboard unavailable — an insecure origin, or a browser that refuses. Silent
         on purpose: a toast saying "could not copy" helps nobody do anything. */
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label="Copy message"
      className={`absolute -bottom-6 ${
        side === "left" ? "left-0" : "right-0"
      } rounded-md p-1 text-plum/60 opacity-0 transition-opacity hover:text-plum focus-visible:opacity-100 group-hover:opacity-100`}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function MessageRow({ msg, isLastOfRun }: { msg: Msg; isLastOfRun: boolean }) {
  if (msg.role === "user") {
    return (
      <div className="group relative flex animate-rise justify-end">
        <div
          className={`max-w-[80%] rounded-2xl bg-white px-5 py-4 ring-1 ring-wing-border ${isLastOfRun ? "tail-right" : ""}`}
        >
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-forest">{msg.text}</p>
        </div>
        <CopyButton text={msg.text} side="right" />
      </div>
    );
  }

  if (msg.role === "thinking") {
    /*
     * Three dots, and deliberately no text.
     *
     * The UX recommendation is explicit that this must never show reasoning machinery —
     * "that kills the surprise" — so the `text` on a thinking message is not rendered.
     * The field exists because the type carries it; showing it would turn a pause into a
     * transcript of Wing working things out.
     */
    return (
      <div className="flex animate-rise items-start" role="status" aria-label="Wing is thinking">
        <div
          className={`flex items-center gap-1.5 rounded-2xl bg-aqua px-5 py-4 ${
            isLastOfRun ? "tail-left" : ""
          }`}
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="thinking-dot h-2 w-2 rounded-full bg-wine"
              style={{ animation: `wing-dot 1.2s ${i * 0.18}s infinite ease-in-out` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (msg.role === "insight") {
    return (
      <div
        className="animate-rise-slow rounded-2xl border-l-[3px] border-salmon py-6 pl-6 pr-7"
        style={{ backgroundColor: "rgb(var(--salmon-light) / 0.26)" }}
      >
        <p className="label-eyebrow">Wing noticed something</p>
        <p className="mt-4 whitespace-pre-wrap text-[17px] leading-[1.75] text-forest">
          {msg.text}
        </p>
      </div>
    );
  }

  return (
    <div className="group relative flex animate-rise items-start">
      <div className={`max-w-[85%] rounded-2xl bg-aqua px-5 py-4 ${isLastOfRun ? "tail-left" : ""}`}>
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-forest">{msg.text}</p>
      </div>
      <CopyButton text={msg.text} side="left" />
    </div>
  );
}
