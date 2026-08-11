import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The page shell every admin screen is built from.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * Before this, twenty-five screens between them used five different heading
 * styles (`text-2xl font-semibold`, `text-2xl font-bold`, `text-3xl font-bold`,
 * `text-3xl font-semibold`, `text-xl font-semibold`) and eight different
 * container widths across two different centring idioms. None of that was a
 * decision — each screen was written on a different day and copied whichever
 * neighbour was open at the time.
 *
 * The fix is not a style guide, which nobody reads while typing. It is making
 * the consistent thing the easiest thing to type: `<PageShell>` and
 * `<PageHeader>` are shorter than the classNames they replace.
 *
 * ── WIDTH IS A PROP WITH A DEFAULT, NOT A FREE CHOICE ────────────────────
 * Three widths, each with a reason:
 *   prose  reading and editing long text (criteria, methodology, templates)
 *   page   the default — forms, cards, most things
 *   wide   tables that genuinely need the horizontal room
 * Anything outside these three is almost certainly an accident.
 */

type Width = "prose" | "page" | "wide";

const WIDTHS: Record<Width, string> = {
  prose: "max-w-3xl",
  page: "max-w-5xl",
  wide: "max-w-7xl",
};

export function PageShell({
  children,
  width = "page",
  className,
}: {
  children: ReactNode;
  width?: Width;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full space-y-6 p-4 sm:p-6", WIDTHS[width], className)}>
      {children}
    </div>
  );
}

/**
 * The title block.
 *
 * `description` is not optional garnish — on a screen that edits something
 * every student sees, the one line explaining what the screen actually governs
 * is the difference between a confident edit and a cautious one. Most of these
 * screens had that explanation only in a source-file comment, where the person
 * making the edit could not read it.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * A titled block within a page. Lighter than a Card — for grouping without
 * drawing a box around everything, which is what made the old screens read as
 * a pile of containers.
 */
export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      {(title || actions) && (
        <div className="flex items-end justify-between gap-3">
          <div className="space-y-0.5">
            {title && (
              <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                {/* A 3px bar rather than a coloured heading: coloured text at
                    body weight is hard to read, and the eye finds the marker
                    just as fast. */}
                <span className="h-3.5 w-[3px] shrink-0 rounded-full bg-brand" />
                {title}
              </h2>
            )}
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
