import { ReactNode, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LoadingRows, EmptyState, ErrorState } from "./states";
import { cn } from "@/lib/utils";

/**
 * One table, used everywhere.
 *
 * ── WHY NOT TANSTACK TABLE ───────────────────────────────────────────────
 * Because two of twenty-five screens used the Table component at all — the
 * problem here is not that the tables lack features, it is that most of them
 * are hand-rolled `<div>` rows with ad-hoc borders and no sorting, no keyboard
 * semantics and no consistent empty state. A dependency does not fix that; a
 * shared component that is easier to reach for than a stack of divs does.
 *
 * This deliberately stops at sort + filter. Nothing in this admin panel is
 * paginated server-side, the largest list is a few hundred rows, and pulling in
 * a headless table library to render a cohort of students would be answering a
 * question nobody asked. If a screen ever genuinely needs column pinning or
 * virtualisation, that is the moment to reach for TanStack — not before.
 *
 * ── SORTING IS OPT-IN PER COLUMN ─────────────────────────────────────────
 * A column is sortable only when it declares `sortBy`, because sorting a column
 * of rendered React nodes by their string form produces confident nonsense —
 * exactly the failure mode this project keeps hitting. The sort key is a
 * function on the row, so it sorts the datum, never the presentation.
 */

export type Column<T> = {
  /** Stable key. Also the header text when `header` is omitted. */
  id: string;
  header?: ReactNode;
  cell: (row: T) => ReactNode;
  /** Provide to make the column sortable. Sorts the value, not the cell. */
  sortBy?: (row: T) => string | number | null | undefined;
  className?: string;
  headerClassName?: string;
};

type Props<T> = {
  rows: T[] | undefined;
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;

  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;

  /** Turns on the search box. Returns the text this row is searchable by. */
  searchable?: (row: T) => string;
  searchPlaceholder?: string;

  /** Rendered when there are no rows at all (as opposed to no search matches). */
  empty?: ReactNode;
  /** Extra controls beside the search box. */
  toolbar?: ReactNode;
};

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  isLoading,
  error,
  onRetry,
  searchable,
  searchPlaceholder = "Search…",
  empty,
  toolbar,
}: Props<T>) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ id: string; dir: "asc" | "desc" } | null>(null);

  const visible = useMemo(() => {
    let out = rows ?? [];

    if (searchable && query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter((r) => searchable(r).toLowerCase().includes(q));
    }

    if (sort) {
      const col = columns.find((c) => c.id === sort.id);
      if (col?.sortBy) {
        // Copy before sorting: mutating the query cache's array in place makes
        // React Query hand back re-ordered data on the next render for reasons
        // that take an afternoon to find.
        out = [...out].sort((a, b) => {
          const av = col.sortBy!(a);
          const bv = col.sortBy!(b);
          // Nulls last regardless of direction — a missing value is not
          // "smallest", it is absent, and burying it is almost always right.
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          const cmp =
            typeof av === "number" && typeof bv === "number"
              ? av - bv
              : String(av).localeCompare(String(bv), undefined, { numeric: true });
          return sort.dir === "asc" ? cmp : -cmp;
        });
      }
    }

    return out;
  }, [rows, query, sort, columns, searchable]);

  const toggleSort = (id: string) =>
    setSort((s) =>
      s?.id !== id ? { id, dir: "asc" } : s.dir === "asc" ? { id, dir: "desc" } : null,
    );

  if (error) return <ErrorState error={error} onRetry={onRetry} />;

  return (
    <div className="space-y-3">
      {(searchable || toolbar) && (
        <div className="flex flex-wrap items-center gap-2">
          {searchable && (
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                // text-base below sm: under 16px, iOS zooms on focus and does
                // not zoom back.
                className="pl-8 text-base focus-visible:ring-brand/40 sm:text-sm"
              />
            </div>
          )}
          {toolbar}
        </div>
      )}

      {isLoading ? (
        <LoadingRows rows={6} />
      ) : (rows ?? []).length === 0 ? (
        empty ?? <EmptyState title="Nothing here yet" />
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b-2 border-b-brand/20 bg-brand-soft/50 hover:bg-brand-soft/50">
                  {columns.map((c) => {
                    const active = sort?.id === c.id;
                    const Icon = !c.sortBy
                      ? null
                      : !active
                        ? ChevronsUpDown
                        : sort!.dir === "asc"
                          ? ArrowUp
                          : ArrowDown;

                    return (
                      <TableHead
                        key={c.id}
                        className={cn("whitespace-nowrap", c.headerClassName)}
                      >
                        {c.sortBy ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="-ml-2 h-7 px-2 text-xs font-medium"
                            onClick={() => toggleSort(c.id)}
                          >
                            {c.header ?? c.id}
                            {Icon && (
                              <Icon
                                className={cn(
                                  "ml-1.5 h-3 w-3",
                                  active ? "text-brand opacity-100" : "opacity-40",
                                )}
                              />
                            )}
                          </Button>
                        ) : (
                          <span className="text-xs font-medium">{c.header ?? c.id}</span>
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>

              <TableBody>
                {visible.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={columns.length}
                      className="h-28 text-center text-sm text-muted-foreground"
                    >
                      {/* Distinct from the empty state above: there IS data,
                          the filter just excludes all of it. Telling someone
                          "nothing here yet" when they have typed a search is
                          how people conclude the data was deleted. */}
                      Nothing matches “{query}”.
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((row) => (
                    <TableRow
                      key={rowKey(row)}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      // Keyboard parity: a row you can click is a row you must
                      // be able to reach and activate without a mouse.
                      tabIndex={onRowClick ? 0 : undefined}
                      role={onRowClick ? "button" : undefined}
                      onKeyDown={
                        onRowClick
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onRowClick(row);
                              }
                            }
                          : undefined
                      }
                      className={cn(
                        onRowClick &&
                          "cursor-pointer transition-colors hover:bg-brand-soft/40 focus-visible:bg-brand-soft/60 focus-visible:outline-none",
                      )}
                    >
                      {columns.map((c) => (
                        <TableCell key={c.id} className={cn("py-3", c.className)}>
                          {c.cell(row)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {searchable && visible.length > 0 && (rows ?? []).length > 0 && (
        <p className="text-xs text-muted-foreground">
          {visible.length === (rows ?? []).length
            ? `${visible.length} row${visible.length === 1 ? "" : "s"}`
            : `${visible.length} of ${(rows ?? []).length}`}
        </p>
      )}
    </div>
  );
}
