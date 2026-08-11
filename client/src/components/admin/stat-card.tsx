import { ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * A single number, with the context that stops it being misread.
 *
 * ── THE DENOMINATOR IS NOT OPTIONAL ──────────────────────────────────────
 * These numbers exist, per the spec, for "budget defense and board reporting" —
 * they get screenshotted into decks and quoted in meetings where nobody can ask
 * a follow-up question. "68%" in that setting is a claim; "68% · 17 of 25
 * students" is a fact. So `hint` carries the denominator or the window, and a
 * percentage without one should be treated as a bug rather than a style choice.
 *
 * ── NO SPARKLINES, NO TREND ARROWS BY DEFAULT ────────────────────────────
 * A green arrow next to a metric computed from twenty-five students in a
 * six-week-old pilot implies a trend that the sample cannot support. When there
 * is enough history to say something true about direction, it can be added
 * deliberately — until then the absence is the honest design.
 */
/**
 * ── COLOUR CARRIES THE ROLE, NOT THE CARD ────────────────────────────────
 * The tone tints the icon chip and the top rule, never the number itself. A
 * figure printed in red reads as "this figure is bad", which is a judgement the
 * card cannot make — 4 registered students is not bad, and 12 failed sends is
 * not a smaller number than 12 delivered ones. The chrome is coloured so the
 * card is findable; the value stays in body colour so it stays a fact.
 */
export type Tone = "brand" | "info" | "deep" | "warn" | "good" | "bad" | "neutral";

const TONES: Record<Tone, { chip: string; icon: string; rule: string }> = {
  brand: { chip: "bg-brand-soft", icon: "text-brand", rule: "bg-brand" },
  info: { chip: "bg-info-soft", icon: "text-info", rule: "bg-info" },
  deep: { chip: "bg-deep-soft", icon: "text-deep", rule: "bg-deep" },
  warn: { chip: "bg-warn-soft", icon: "text-warn", rule: "bg-warn" },
  good: { chip: "bg-good-soft", icon: "text-good", rule: "bg-good" },
  bad: { chip: "bg-bad-soft", icon: "text-bad", rule: "bg-bad" },
  neutral: { chip: "bg-muted", icon: "text-muted-foreground", rule: "bg-border" },
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  isLoading,
  className,
}: {
  label: string;
  value: ReactNode;
  /** The denominator, the window, or the caveat. */
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  isLoading?: boolean;
  className?: string;
}) {
  const t = TONES[tone];

  return (
    <Card className={cn("relative overflow-hidden shadow-none", className)}>
      {/* A 2px rule rather than a tinted card: four tinted panels side by side
          compete with the numbers on them. */}
      <div className={cn("absolute inset-x-0 top-0 h-0.5", t.rule)} />

      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {Icon && (
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                t.chip,
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", t.icon)} />
            </span>
          )}
        </div>

        {isLoading ? (
          <Skeleton className="mt-3 h-8 w-20" />
        ) : (
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
        )}

        {hint &&
          (isLoading ? (
            <Skeleton className="mt-2 h-3 w-28" />
          ) : (
            <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
          ))}
      </CardContent>
    </Card>
  );
}

export function StatGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>{children}</div>
  );
}
