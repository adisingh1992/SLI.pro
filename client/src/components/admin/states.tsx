import { ReactNode } from "react";
import { AlertCircle, Loader2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Loading, empty and error, as three deliberate states.
 *
 * ── WHY EMPTY DESERVES AS MUCH CARE AS FULL ──────────────────────────────
 * Every one of these screens is empty on stage right now, and empty is the
 * first thing Danielle will see in a demo. The old screens rendered nothing at
 * all, or a bare "No data" — which is indistinguishable from a screen that is
 * broken. An empty state should say what would be here, why there is nothing,
 * and what to do about it. That is three sentences of work that turns "is this
 * thing working?" into "ah, I need to add one".
 *
 * ── SKELETONS OVER SPINNERS FOR CONTENT ──────────────────────────────────
 * A spinner tells you to wait. A skeleton tells you what you are waiting for
 * and stops the layout jumping when it arrives. Spinners are kept for actions
 * (a button that is saving), where there is no shape to preview.
 */

export function LoadingRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-md border p-4">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-lg border p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "brand",
  className,
}: {
  icon?: LucideIcon;
  title: string;
  /** What would be here, and what to do about it. Worth writing properly. */
  description?: ReactNode;
  action?: ReactNode;
  /**
   * Empty is usually normal, so the default is the brand tint rather than a
   * warning colour. A grey box reads as "broken"; an amber one reads as "you
   * have a problem". Most of these screens are empty because nobody has added
   * anything yet, which is neither.
   */
  tone?: "brand" | "info" | "warn";
  className?: string;
}) {
  const tint = {
    brand: { ring: "bg-brand-soft", icon: "text-brand" },
    info: { ring: "bg-info-soft", icon: "text-info" },
    warn: { ring: "bg-warn-soft", icon: "text-warn" },
  }[tone];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-6 py-14 text-center",
        className,
      )}
    >
      {Icon && (
        <div
          className={cn(
            "mb-4 flex h-11 w-11 items-center justify-center rounded-full",
            tint.ring,
          )}
        >
          <Icon className={cn("h-5 w-5", tint.icon)} />
        </div>
      )}
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * A failed query.
 *
 * Shows the actual message rather than "Something went wrong". These screens
 * are used by four people, all of whom would rather see "403: platform staff
 * only" than a shrug — and two of whom can act on it.
 */
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-bad/25 bg-bad-soft px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-bad/10">
        <AlertCircle className="h-5 w-5 text-bad" />
      </div>
      <p className="text-sm font-medium">Couldn't load this</p>
      <p className="mt-1.5 max-w-md break-words text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** For buttons mid-action, where there is no shape to skeleton. */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} />;
}
