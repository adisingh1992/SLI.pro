import type { ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Shared presentation for the Test Harness screens.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 * Aditya, 15 Sep 2026: "the whole page seems built by an engineer, not for an
 * end user… information is just floating around on the page all around."
 * The first redesign pass fixed type scale and killed the dev-facing banners
 * but left each panel rendering its own copy of the same primitives — two
 * chat-bubble implementations with drifting classNames, a session-type label
 * map that only one of the two panels had, raw ISO timestamps in one place
 * and `toLocaleString()` in another.
 *
 * Everything here is presentation only. No queries, no mutations, no domain
 * logic — a component in this file must be safe to drop into either panel
 * without dragging state along with it.
 */

/** Friendly labels for `sessions.session_type`. The harness only ever targets
 *  the Foundation sessions and Module 6, but the enum has other values on the
 *  books, so every one gets a label rather than a fallback that reads like a
 *  bug. Shared so Simulations stops showing the raw slug the Personas tab has
 *  been humanising all along. */
export const SESSION_TYPE_LABEL: Record<string, string> = {
  intake: "Intake",
  foundation_1: "Foundation 1",
  foundation_2: "Foundation 2",
  foundation_3: "Foundation 3",
  module_run: "Module run",
  enhancement_a: "Enhancement A",
  enhancement_b: "Enhancement B",
  enhancement_c: "Enhancement C",
  ongoing_engagement: "Ongoing engagement",
  career_event_review: "Career event review",
};

export function sessionLabel(sessionType: string | null | undefined): string {
  if (!sessionType) return "Unknown session";
  return SESSION_TYPE_LABEL[sessionType] ?? sessionType;
}

/** "3 minutes ago" beats an absolute timestamp for the only question anyone
 *  asks of these rows — is this the run I just started? Falls back to a real
 *  date once something is old enough that "14 days ago" stops helping. */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";

  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 0) return "just now";
  if (seconds < 60) return "just now";
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (seconds < 86_400) {
    const h = Math.floor(seconds / 3600);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  if (seconds < 604_800) {
    const d = Math.floor(seconds / 86_400);
    return `${d} day${d === 1 ? "" : "s"} ago`;
  }
  return new Date(then).toLocaleDateString();
}

/** A hover explanation for a term the screen shows in plain language but that
 *  has a precise engine meaning underneath. Used instead of parenthetical
 *  asides, which is how the old screens grew their walls of small grey text. */
export function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex text-muted-foreground transition-colors hover:text-foreground"
            aria-label="More detail"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-sm leading-relaxed">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** One number with its label, for the run/session summary strips. Deliberately
 *  large — these are the figures Danielle actually reads a run for, and they
 *  used to be buried mid-sentence in a muted `text-xs` telemetry string. */
export function Stat({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "warn" | "brand";
  hint?: string;
}) {
  const valueTone =
    tone === "warn" ? "text-warn" : tone === "brand" ? "text-brand" : "text-foreground";
  return (
    <div className="min-w-[5.5rem]">
      <div className={`text-2xl font-semibold leading-none tabular-nums ${valueTone}`}>{value}</div>
      <div className="mt-1.5 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {hint ? <InfoTip text={hint} /> : null}
      </div>
    </div>
  );
}

/**
 * One message in a transcript.
 *
 * Wing sits left in a tinted bubble, the person sits right in a neutral one —
 * the arrangement every messaging app has trained everyone to read without
 * being told which side is which. `footer` carries whatever the screen wants
 * hung under the message (a fired-card chip, a "why?" expander) and inherits
 * the bubble's alignment so it never looks detached from its own turn.
 */
export function ChatBubble({
  speaker,
  side,
  children,
  footer,
  muted = false,
}: {
  speaker: string;
  side: "wing" | "person";
  children: ReactNode;
  footer?: ReactNode;
  muted?: boolean;
}) {
  const isWing = side === "wing";
  return (
    <div className={`flex ${isWing ? "justify-start" : "justify-end"}`}>
      <div className="max-w-[85%] min-w-0">
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isWing
              ? "rounded-tl-sm bg-brand-soft/50 text-foreground"
              : "rounded-tr-sm bg-muted text-foreground"
          } ${muted ? "opacity-60" : ""}`}
        >
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {speaker}
          </div>
          <div className="whitespace-pre-wrap break-words">{children}</div>
        </div>
        {footer ? <div className={`mt-1.5 ${isWing ? "text-left" : "text-right"}`}>{footer}</div> : null}
      </div>
    </div>
  );
}

/** The chip that hangs under a bubble when a coaching card fired on that turn.
 *  Card name leads; the code is secondary — Danielle knows her cards by what
 *  they do, not by `H-101`. */
export function FiredCardChip({
  cardCode,
  name,
  confidence,
}: {
  cardCode: string;
  name: string;
  confidence?: number | null;
}) {
  return (
    <Badge
      variant="outline"
      className="gap-1.5 border-brand/40 bg-brand-soft/60 py-1 text-xs font-normal text-foreground"
    >
      <span className="font-medium">{name}</span>
      <span className="font-mono text-muted-foreground">{cardCode}</span>
      {typeof confidence === "number" ? (
        <span className="text-muted-foreground">· {Math.round(confidence * 100)}%</span>
      ) : null}
    </Badge>
  );
}

/** Section heading inside a panel — replaces the `CardTitle`-in-a-`Card`
 *  pattern the old screens used for every sub-block, which is what made three
 *  related controls look like three unrelated features. */
export function SectionHeading({
  title,
  description,
  right,
}: {
  title: string;
  description?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-base font-semibold">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}
